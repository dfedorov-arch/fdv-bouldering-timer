# 02. Синхронизация времени и сигналов — глубокий разбор

Это ядро продукта. Ниже — как устроена точность и устойчивость, с привязкой к коду.

## 2.1. Модель «серверных часов» на клиенте

Клиент **не** использует `Date.now()` для идущего таймера. Он строит линейную модель серверного времени поверх монотонного `performance.now()`:

`index.html:1851`

```js
function serverNow() {
  const localNow = performance.now();
  return serverTimeAnchor + ((localNow - serverPerfAnchor) * serverClockRate);
}
```

- `serverTimeAnchor` — оценка серверного времени в момент `serverPerfAnchor`.
- `serverClockRate` — оценка относительной скорости часов сервер/клиент (≈1).

Прошедшее время раунда (`index.html:2306`):

```js
function elapsedSeconds() {
  if (!state.running) return state.elapsedBeforePause;
  if (state.serverStartedAt) {
    return Math.max(0, (serverNow() - state.serverStartedAt) / 1000);
  }
  return (performance.now() - state.startedAt - state.accumulatedPause) / 1000;
}
```

Поскольку `state.serverStartedAt` приходит от сервера и одинаков для всех, а `serverNow()` у всех сходится к серверному времени, **все экраны показывают одно и то же `elapsed`** — это и обеспечивает кросс-браузерную синхронность.

## 2.2. Оценка офсета и дрейфа (`updateServerTiming`)

`index.html:1879`. На каждый ответ `/api/state` или `/api/action` клиент:

1. Измеряет RTT по `perf0/perf1` и вычитает серверное «время обработки» (`serverSentAt - serverReceivedAt`), получая **сетевую** задержку.
2. Складывает сэмпл `{ latency, networkLatency, perfTime, serverTime, clockOffset, perfOffset }` в скользящее окно (до `syncMaxSamples = 48`, окно `syncSampleWindowMs = 60000`).
3. Берёт **5 сэмплов с наименьшей задержкой** и считает медиану офсета — это устойчиво к выбросам джиттера.
4. При ≥4 сэмплах на интервале ≥`syncRateMinSpanMs = 8000` мс — оценивает **скорость часов** линейной регрессией `serverTime ~ rate * perfTime`, сглаживает (`syncRateSmoothing`), применяет дедбенд.
5. Применяет результат через `applyServerClockModel`.

Качество синхронизации (`syncQuality`) — `error = bestLatency/2 + jitter` — отправляется на сервер в диагностике и показывается в списке браузеров.

### Ограничители

`index.html:1598`

```js
const syncRateMin = 0.90;   // ← предел скорости часов
const syncRateMax = 1.10;   // ← ±10 %
const serverOfflineAfterMs = 4500;
const serverTimerLookaheadSeconds = 1.25;
```

Плавная коррекция якоря (`index.html:1856`): за одно обновление офсет правится не более чем на `250 мс` (кроме «прямого» применения при <3 сэмплах), чтобы не было видимых скачков.

> ⚠️ Предел скорости ±10 % разобран как риск в [03 B3](03-bottlenecks.md#b3): реальный дрейф кварца < 0.01 %, а такой широкий предел позволяет шуму гнать темп.

## 2.3. Транспорт синхронизации

- **Поллинг** каждые 2 с: `startSync()` → `setInterval(syncFromServer, 2000)` (`index.html:2590`).
- **SSE** для мгновенного push: `startEventStream()` (`index.html:2596`), сервер шлёт `state` при каждом изменении + `ping` каждые 15 с (`serve-bouldering-timer.js:618`).
- **Burst-sync**: если `syncQuality.error > 300 мс`, запускается серия из 5 быстрых поллов с шагом 120 мс (`index.html:2574`, `:2583`) — быстрый набор сэмплов для пересчёта модели.

## 2.4. Планирование сигналов по серверному времени

Сигналы привязаны не к локальным `setTimeout` от старта, а к **целевому серверному времени** сегмента.

- `serverTimeForElapsed(elapsed)` → абсолютное серверное время события (`index.html:3190`).
- `delayUntilServerTime(target)` → задержка относительно `serverNow()`.
- Звук дополнительно смещается на калибровку устройства `audioUserOffsetMs` через `audioServerTime()` (`index.html:3204`).

### Дозапуск с упреждением (`scheduleSegmentTimeoutAt` / `scheduleServerTimeoutAt`)

`index.html:3453`, `:3481`. Таймер не ставится сразу на всю задержку, а **перевзводится чанками** по `serverTimerLookaheadSeconds = 1.25` с, пока до цели не останется ≤ 35 мс:

```js
if (delayUntilServerTime(targetServerTime) > 0.035) { arm(); return; }
if (!isServerSignalCurrent(targetServerTime)) return;   // окно актуальности
callback();
```

Это компенсирует дрейф `setTimeout` и уточняет момент по мере приближения. Но есть нюанс «молчаливого пропуска» (`isServerSignalCurrent`, grace `500 мс`) — см. [03 B4](03-bottlenecks.md#b4).

### Звук: упреждающая загрузка и fallback

- За `audioScheduleAheadSeconds = 2.8` с до события планируется попытка проиграть **декодированный буфер** через Web Audio (`scheduleBufferedSignalAt`, `index.html:3224`), точно во времени AudioContext.
- Параллельно стоит **fallback** на синтетический/`<audio>` сигнал на случай, если буфер не загрузился.
- `prewarm`/`warm` тихие сигналы «прогревают» аудиовыход перед громкими, чтобы не было задержки первого звука на мобильных.
- Переход фаз — `schedulePhaseTransitionAt` (`index.html:3285`), финальные секунды — `scheduleFinalWarnings` (`index.html:3516`), фестиваль-анонсы — `scheduleFestivalAnnouncements` (`index.html:3429`).

## 2.5. Отрисовка

`requestAnimationFrame`-цикл `tick()` (`index.html:3655`) вызывает `render()` каждый кадр; смена сегмента детектируется по `segmentKey !== lastSegmentIndex` и триггерит перепланирование сигналов (`index.html:3645`).

## 2.6. Поведение при плохой/пропадающей сети

### Детектирование потери сервера

`index.html:1673`, `:1681`. Сервер считается недоступным, если:

- запрос (timeout 2 с) упал, ИЛИ
- `onerror` у SSE, ИЛИ
- нет контакта ≥ `serverOfflineAfterMs = 4500` мс (проверка каждые 500 мс).

### Короткий разрыв — отсчёт продолжается локально

Пока `serverAvailable === false`, но пользователь **не** входил в standalone, дисплей **продолжает считать** по `serverNow()` и последнему известному `state.serverStartedAt`. Появляется баннер с предложением перейти в автономный режим (`updateConnectionWarning`, `index.html:1630`). Это выполняет требование «временная потеря сети не останавливает таймер».

> ⚠️ Во время разрыва модель часов экстраполируется с последним оценённым `rate` без коррекции — накопление дрейфа разобрано в [03 B5](03-bottlenecks.md#b5).

### Автономный (standalone) режим

`enterStandaloneMode` (`index.html:1703`) — явное решение пользователя: локальное управление таймером, прочие браузеры не синхронизируются. Серверные апдейты копятся в `pendingServerState`. `returnToServerMode` (`index.html:1738`) возвращает к серверу, применяя накопленное/свежее состояние.

### Восстановление

`resumeClientSync` (`index.html:2657`) на `visibilitychange`/`pageshow`/`focus`/`online`: при «протухании» (скрытие > `staleResumeAfterMs = 3000` мс или bfcache) сбрасывает модель часов и таймеры сигналов, перезапускает SSE, форсит два `syncFromServer`.

### Режим `file://`

Открытие `index.html` напрямую с диска включает постоянный standalone с встроенным base64-звуком (`offline-audio.js`), `initializeFileMode` (`index.html:1715`).

## 2.7. Что сделано хорошо (сильные стороны)

- Грамотная NTP-подобная модель: разделение настенного и монотонного времени на клиенте, медиана офсета по лучшим сэмплам, оценка дрейфа, сглаживание и дедбенд.
- Двойной транспорт (SSE + поллинг) с burst-доуточнением.
- Сигналы по абсолютному серверному времени с перевзводом и упреждающей загрузкой буферов + fallback — это сильно повышает совпадение звука между экранами.
- Продуманное восстановление после засыпания вкладки/bfcache.
- Калибровка аудио-офсета per-device.
- Богатая диагностика связи в UI.

Слабые места и их приоритеты — в [03-bottlenecks.md](03-bottlenecks.md).
