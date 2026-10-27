# Тестовая сборка develop для macOS / macOS develop preview

Это prerelease, не стабильный релиз. Номер сборки, исходный коммит и техническая
версия установщика указаны в BUILD-INFO.json. Версия PKG/app может быть выше
стабильной — это необходимо для замены установленной программы, но не означает
выпуск стабильного релиза с таким номером. Main и стабильный Latest не меняются.

## Что проверить в сборке 442

- EN/RU переводит окно, меню, диалог сертификатов и таймер, сохраняет выбор.
- Закрытие окна скрывает лаунчер, сервер продолжает работать. Повторный запуск
  приложения, Dock или команда меню открывают существующее окно без нового сервера.
- «Стоп и выход» / Stop and exit останавливает собственный сервер.
- «Создать HTTPS-сертификат» / Create HTTPS certificate предлагает IP/DNS,
  отдельно подтверждает замену и перезапуск. Ответ «Нет» на перезапуск оставляет
  сервер работающим. Генерация не устанавливает доверие на устройствах автоматически.

## Установка

Apple Silicon: macos-arm64.pkg. Intel: macos-x64.pkg. Portable .tar.gz можно
распаковать в отдельную папку для проверки без замены установленного приложения.

Перед установкой PKG остановите текущий сервер, закройте лаунчер и сохраните
копию ~/Library/Application Support/FDV Bouldering Timer. Установщик заменяет
/Applications/FDV Bouldering Timer и использует общие пользовательские данные.
Обновите страницы без кеша и проверьте номер сборки.

PKG хранит сертификаты в ~/Library/Application Support/FDV Bouldering Timer/https;
portable — в https рядом с программой, с пользовательским резервным каталогом
при запрете записи. Передавайте только timer-public.cer, никогда timer-cert.pfx
с закрытым ключом. Доверие на экранах и в Node.js настраивается отдельно.

Приложение и аудиокомпонент ad-hoc подписаны, но не notarized Apple. Portable
включает prepare-timer-mac.command. Если утрачен исполняемый атрибут, выполните
chmod +x для этого скрипта (его можно перетащить в Terminal после команды).
Не отключайте защиту системы глобально. Подробнее — в ReadMe.txt пакета.

Для возврата к стабильной версии остановите preview, удалите только папку
приложения /Applications/FDV Bouldering Timer и установите стабильный PKG.
Пользовательские данные не удаляйте; при необходимости восстановите сохранённую
копию. Более низкая версия может не заменить preview напрямую.

## English

This is a develop prerelease, not a stable release. BUILD-INFO.json records the
source commit, timer build and numeric installer/app version. Stop the current
launcher and back up ~/Library/Application Support/FDV Bouldering Timer before
installing a PKG. It replaces /Applications/FDV Bouldering Timer and shares user
data. Force-refresh browser pages after installing. Portable archives allow
testing from a separate folder. Apps/helpers are ad-hoc signed, not notarized.
The quarantine preparation script is included; restore its executable bit with
chmod +x if necessary. Share only the public CER, never the private PFX.
To roll back, stop the preview, remove only its application folder and reinstall
the stable PKG, retaining/restoring backed-up user data. Stable Latest is unchanged.
