# 01. Подробное описание проекта

## 1.1. Назначение

**FDV Bouldering Timer** — сетевой таймер для проведения соревнований по болдерингу в локальной сети. Один компьютер запускает сервер и управляет отсчётом; телефоны, планшеты, телевизоры и другие компьютеры в той же LAN открывают веб-страницу и работают как **синхронизированные экраны** (дисплеи) или как **основной** (primary) пульт управления.

Ключевая ценность продукта — чтобы на всех экранах **одновременно** менялись фазы и звучали сигналы (старт/конец ротации, минута, обратный отсчёт), независимо от устройства и браузера, и чтобы кратковременные сетевые проблемы не сбивали отсчёт.

Поддерживаемые форматы соревнований:

- **Классика** — повторяющиеся циклы «ротация + отдых» (французская система).
- **Фестиваль** — длинный раунд + отдых, с голосовыми/звуковыми анонсами за 60/30/10/5 минут.
- **Финал** — одиночные попытки с быстрым ручным перезапуском.

## 1.2. Технологический стек

| Слой | Технология |
| --- | --- |
| Сервер | Node.js, встроенные модули `http`/`https` (без Express и зависимостей) |
| Клиент | Одностраничное приложение на ванильном JS/HTML/CSS, без сборки |
| Realtime push | Server-Sent Events (SSE), `GET /api/events` |
| Резервный канал | Поллинг `GET /api/state` каждые 2 с |
| Команды | `POST /api/action` |
| Звук | Web Audio API (основной путь) + `<audio>` fallback + Speech Synthesis для анонсов |
| Хранилище | Отсутствует — состояние только в памяти процесса (`timerState`) |
| Конфигурация | `params.txt` (key=value) |
| Лаунчеры | C#/.NET 8 (Avalonia на Unix, WinForms на Windows) |
| Сборки | GitHub Actions: portable-архивы со встроенным Node.js, GitHub Pages |
| Зависимости npm | Ноль |

Порты по умолчанию (`params.txt`): HTTP **8008**, HTTPS **8443**.

## 1.3. Структура репозитория

```
fdv-bouldering-timer/
├── index.html                  # Всё клиентское приложение (~4400 строк: UI + логика)
├── serve-bouldering-timer.js   # Node-сервер: статика + API + SSE + in-memory state
├── params.txt                  # Конфигурация рантайма
├── help.html                   # Полное руководство (RU/EN)
├── README.md / ReadMe*.txt     # Краткие инструкции
├── docs/
│   ├── index.html              # Лендинг (GitHub Pages)
│   └── review/                 # ← Этот разбор
├── beeps/FSR_2026/             # Профиль звуков (START, END, MINUTE, ...)
├── fonts/                      # Встроенные шрифты таймера
├── launcher/{unix,windows}/    # GUI-лаунчеры
├── runtime/{win,mac,linux}/    # Встроенный Node.js для portable-сборок
├── scripts/build-portable-releases.sh
└── .github/workflows/          # release.yml, pages.yml
```

`offline-audio.js` генерируется сервером при старте (base64-звук для режима `file://`) и не хранится в git.

## 1.4. Архитектура и потоки данных

```
┌───────────────────────────┐        ┌───────────────────────────┐
│ Браузер A (Primary/пульт)  │        │ Браузер B (Экран/viewer)   │
│  index.html                │        │  index.html                │
│  POST /api/action  ───────►│        │  GET  /api/state (2с)  ───►│
│  GET  /api/state (2с) ────►│        │  SSE  /api/events      ◄───│
│  SSE  /api/events     ◄────│        │                            │
└─────────────┬─────────────┘        └─────────────┬─────────────┘
              │            LAN (HTTP/HTTPS)         │
              └──────────────────┬──────────────────┘
                                 ▼
              ┌──────────────────────────────────────┐
              │   serve-bouldering-timer.js           │
              │   • timerState (in-memory, version++) │
              │   • clients Map (диагностика)         │
              │   • eventClients Map (открытые SSE)   │
              │   • статика (index.html, beeps, ...)  │
              └──────────────────────────────────────┘
```

- **Источник истины — сервер.** Объект `timerState` (`serve-bouldering-timer.js:251`) хранит `running`, `startedAt`, `elapsedBeforePause`, активные настройки, `primaryClientId`, флаги звука и монотонно растущий `version`.
- Любая команда (`POST /api/action`, `serve-bouldering-timer.js:634`) мутирует `timerState`, инкрементит `version`, отвечает свежим состоянием и сразу делает `broadcastState()` всем SSE-клиентам (`serve-bouldering-timer.js:816`).
- Каждый ответ состояния (`publicState`, `serve-bouldering-timer.js:523`) включает временные метки `serverReceivedAt`, `serverSentAt`, `now` и вычисленный `elapsed` — это сырьё для клиентской синхронизации часов.
- Клиенты по `version` понимают, изменилось ли состояние, и решают, перепланировать ли сигналы (`index.html:2546`).

### Роли клиентов

- **Primary** (`primaryClientId`) — браузер-пульт. Назначается командой `primary`. Управление кооперативное: ограничения в UI, но не на сервере (см. [03](03-bottlenecks.md#b8)).
- **Viewer/Экран** — остальные браузеры. Полноэкранный режим, отображение, звук по настройке `instancesSound`.

### Серверные эндпоинты

| Endpoint | Метод | Назначение |
| --- | --- | --- |
| `/api/state` | GET | Поллинг состояния + регистрация диагностики клиента |
| `/api/events` | GET | SSE-поток (`state`, `ping` каждые 15 с, `audio-test`) |
| `/api/action` | POST | Команды таймера и изменение настроек |
| `/*` | GET | Раздача `index.html`, шрифтов, звуков и пр. |

## 1.5. Жизненный цикл состояния таймера

- `start` — запоминает `startedAt` (= `now - elapsed*1000` или запланированное время), вооружает `armStateTransition` для финала/обратного отсчёта.
- `pause` — фиксирует `elapsedBeforePause = elapsedSeconds()`, обнуляет `startedAt`.
- `reset` / `seek` / `settings` / `soundProfile` / `language` / `sound` / `primary` / `audioOffset` / `audioTest` — соответствующие мутации, каждая поднимает `version`.
- `finalizeScheduledCountdown` / `finalizeOneShot` (`serve-bouldering-timer.js:487`, `:500`) — серверная «доводка» состояния при чтении (lazily), плюс таймер `armStateTransition`, который сам инициирует `broadcastState()` в момент перехода.

## 1.6. Точки входа

| Что | Путь | Роль |
| --- | --- | --- |
| Сервер | `serve-bouldering-timer.js` | HTTP/HTTPS, API, SSE, статика |
| Веб-приложение | `index.html` | Весь UI и клиентская логика |
| Конфиг | `params.txt` | Порты, пресеты, цвета, профиль звука |
| Лаунчеры | `launcher/unix/Program.cs`, `launcher/windows/FdvBoulderingTimerLauncher.cs` | Старт Node, показ адресов, открытие браузера |
| Инициализация клиента | `index.html:4382` | `fileMode ? initializeFileMode() : startSync()` |

## 1.7. Запуск из исходников

```bash
node serve-bouldering-timer.js
```

Затем открыть `http://127.0.0.1:8008/` на сервере и сетевой адрес на остальных экранах.

См. также детальный разбор синхронизации в [02-synchronization.md](02-synchronization.md).
