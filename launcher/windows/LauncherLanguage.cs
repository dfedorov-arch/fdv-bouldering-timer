using System;
using System.IO;
using System.Text;

namespace FdvBoulderingTimerLauncher
{
    internal static class LauncherLanguage
    {
        internal static bool Russian = true;
        // Keep this parser compatible with CLR 2.0 (Windows 7/8 packages).
        internal static bool ValidServerLanguage(string[] state)
        {
            if (state == null || state.Length != 3 || (state[0] != "ru" && state[0] != "en")) return false;
            long version;
            if (!Int64.TryParse(state[2], System.Globalization.NumberStyles.None,
                System.Globalization.CultureInfo.InvariantCulture, out version) || version < 0) return false;
            try { return new Guid(state[1]) != Guid.Empty; }
            catch (ArgumentException) { return false; }
            catch (FormatException) { return false; }
            catch (OverflowException) { return false; }
        }
        internal static string PreferencePath
        {
            get
            {
#if NET8_0_OR_GREATER
                string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                if (OperatingSystem.IsMacOS()) return Path.Combine(home, "Library", "Application Support", "FDV Bouldering Timer", "launcher-language.txt");
                if (OperatingSystem.IsLinux())
                {
                    string state = Environment.GetEnvironmentVariable("XDG_STATE_HOME") ?? "";
                    if (String.IsNullOrEmpty(state) || !Path.IsPathFullyQualified(state)) state = Path.Combine(home, ".local", "state");
                    return Path.Combine(state, "fdv-bouldering-timer", "launcher-language.txt");
                }
#endif
                return Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "FDV Bouldering Timer"), "launcher-language.txt");
            }
        }

        internal static void Load(string path)
        {
            Russian = true;
            try
            {
                string value = File.ReadAllText(path, Encoding.UTF8).Trim();
                if (value == "ru" || value == "en") Russian = value == "ru";
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
            catch (System.Security.SecurityException) { }
        }

        internal static bool Save(string path)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path) ?? ".");
                File.WriteAllText(path, Russian ? "ru" : "en", Encoding.UTF8);
                return true;
            }
            catch (IOException) { return false; }
            catch (UnauthorizedAccessException) { return false; }
            catch (System.Security.SecurityException) { return false; }
        }

        private static readonly string[,] Messages = {
            { "Yes", "Да" }, { "No", "Нет" },
            { "Network HTTP", "Сеть HTTP" }, { "Network HTTPS", "Сеть HTTPS" },
            { "Closing this window hides the launcher. The server keeps running. Use Stop and exit to stop it. Launch the app again to reopen the window.", "Закрытие скрывает лаунчер: сервер продолжает работать. Для остановки нажмите «Стоп и выход». Повторный запуск приложения откроет окно." },
            { "The launcher is already running. Open it from the tray or menu bar.", "Лаунчер уже запущен. Откройте его через значок в трее или строке меню." },
            { "Node.js was not found. Check portable_node_mac/portable_node_linux in params.txt or install Node.js LTS.", "Node.js не найден. Проверьте portable_node_mac/portable_node_linux в params.txt или установите подходящую версию Node.js." },
            { "Node.js was not found because macOS started the app from a temporary translocated folder. Start fdv-bouldering-timer from the archive folder instead, or remove quarantine from the extracted folder.", "Node.js не найден: macOS запустила приложение из временного изолированного каталога. Запустите fdv-bouldering-timer из папки распакованного архива или снимите карантин с этой папки." },
            { "serve-bouldering-timer.js was not found because macOS started the app from a temporary translocated folder. Start fdv-bouldering-timer from the archive folder instead, or remove quarantine from the extracted folder.", "serve-bouldering-timer.js не найден: macOS запустила приложение из временного изолированного каталога. Запустите fdv-bouldering-timer из папки архива или снимите карантин с этой папки." },
            { "Could not stop listeners on port {0}: {1}", "Не удалось остановить процессы на порту {0}: {1}" },
            { "Unable to open browser: ", "Не удалось открыть браузер: " },
            { "No supported browser opener was found.", "Не найдена программа для открытия браузера." },
            { "Server process is running, but the local timer is unavailable", "Процесс сервера работает, но локальный таймер недоступен" },
            { "Node.js is running, but the launcher cannot reach the local timer. Click Restart server to try again.", "Node.js работает, но лаунчер не может подключиться к локальному таймеру. Нажмите «Перезапуск сервера», чтобы повторить попытку." },
            { "Prepared the portable Node.js runtime for macOS (removed quarantine).", "Переносимый Node.js подготовлен для macOS: карантин снят." },
            { "Unable to prepare the portable Node.js runtime: ", "Не удалось подготовить переносимый Node.js: " },
            { "Unable to copy link: ", "Не удалось скопировать ссылку: " },
            { "Unable to create HTTPS certificate: ", "Не удалось создать HTTPS-сертификат: " },
            { "Could not enumerate network addresses. Add them manually: ", "Не удалось получить сетевые адреса. Добавьте их вручную: " },
            { "Certificate operation failed: ", "Ошибка операции с сертификатом: " },
            { "Certificate directory must not be a symbolic link.", "Каталог сертификата не должен быть символической ссылкой." },
            { "Certificate must not be a symbolic link.", "Файл сертификата не должен быть символической ссылкой." },
            { "HTTPS certificate", "HTTPS-сертификат" },
            { "Server IP addresses and DNS names, one per line.\nRemove unused entries and add the addresses your devices use.", "IP-адреса и DNS-имена сервера — по одному в строке.\nУдалите ненужные адреса и добавьте те, по которым устройства открывают таймер." },
            { "Self-signed certificate: RSA 2048 / SHA-256, valid for 365 days.\nKeep localhost, 127.0.0.1 and ::1 for local access. Generation does not change DNS, firewall or device trust.", "Самоподписанный сертификат: RSA 2048 / SHA-256, срок 365 дней.\nДля локального доступа оставьте localhost, 127.0.0.1 и ::1. Генерация не меняет DNS, брандмауэр и доверие устройств." },
            { "Directory: ", "Каталог: " },
            { "\nA user directory is used if this location is not writable.", "\nПри запрете записи используется пользовательский каталог." },
            { "The server keeps running during generation. HTTPS uses the new certificate only after a separately confirmed restart.", "Сервер продолжит работать во время генерации. HTTPS применит новый сертификат только после отдельного подтверждения перезапуска." },
            { "Create certificate", "Создать сертификат" },
            { "Open directory", "Открыть каталог" },
            { "Close", "Закрыть" },
            { "A certificate already exists. Create a new one and replace the active certificate after restart?\n\nPrevious files created here are kept as .backup files. Device trust must be configured again.", "Сертификат уже существует. Создать новый и заменить активный сертификат после перезапуска?\n\nПредыдущие файлы, созданные этой кнопкой, сохранятся как .backup. На устройствах понадобится заново настроить доверие." },
            { "Creating certificate… The server keeps running.", "Создаётся сертификат… Сервер продолжает работать." },
            { "Certificate created: ", "Сертификат создан: " },
            { "timer-public.cer is the public certificate for configuring trust.\ntimer-cert.pfx contains the private key: do not share it with displays.\nConfigure trust on devices and in Node.js on both servers.", "timer-public.cer — публичный сертификат для настройки доверия.\ntimer-cert.pfx содержит закрытый ключ: не передавайте его экранам.\nНастройте доверие на устройствах и в Node.js обоих серверов." },
            { "Restart the server now to apply the HTTPS certificate?\n\nBrowser connections will be interrupted temporarily. During a competition choose No and restart later.", "Перезапустить сервер сейчас, чтобы применить HTTPS-сертификат?\n\nСоединения с браузерами временно прервутся. Во время соревнований выберите «Нет» и перезапустите сервер позже." },
            { "Certificate was not created: ", "Сертификат не создан: " },
            { "Preparing server...", "Подготовка сервера…" },
            { "Starting server...", "Запуск сервера…" },
            { "Timer addresses", "Адреса таймера" },
            { "Open timer", "Открыть таймер" },
            { "Copy link", "Копировать ссылку" },
            { "Restart server", "Перезапуск сервера" },
            { "Stop and exit", "Стоп и выход" },
            { "Create HTTPS certificate", "Создать HTTPS-сертификат" },
            { "Server log", "Журнал сервера" },
            { "Show launcher", "Открыть лаунчер" },
            { "Local HTTP", "Локальный HTTP" },
            { "Local HTTPS", "Локальный HTTPS" },
            { "Network", "Сеть" },
            { "Network addresses changed.", "Сетевые адреса изменились." },
            { "Server is running", "Сервер работает" },
            { "Server is ready.", "Сервер готов." },
            { "Keep this computer connected to power and disable sleep while the timer is running.", "Подключите компьютер к питанию и отключите спящий режим на время работы таймера." },
            { "Node.js was not found. Check portable_node_win in params.txt or install Node.js LTS.", "Node.js не найден. Проверьте portable_node_win в params.txt или установите подходящую версию Node.js." },
            { "serve-bouldering-timer.js was not found next to the launcher.", "Рядом с лаунчером не найден serve-bouldering-timer.js." },
            { "The server did not start. Check the server log and configured ports.", "Сервер не запустился. Проверьте журнал и настройки портов." },
            { "Restarting server...", "Перезапуск сервера…" },
            { "Server is restarting repeatedly; check the log.", "Сервер постоянно перезапускается; проверьте журнал." },
            { "Crash-loop warning: multiple restarts in a row.", "Внимание: несколько перезапусков подряд." },
            { "Server stopped unexpectedly", "Сервер неожиданно остановился" },
            { "server did not become ready", "сервер не перешёл в рабочее состояние" },
            { "server process exited", "процесс сервера завершился" },
            { "server process exited unexpectedly", "процесс сервера неожиданно завершился" },
            { "server health check failed", "сервер не отвечает на проверку доступности" },
            { "Health check failed for {0} seconds; restarting server.", "Сервер не отвечает {0} с; выполняется перезапуск." },
            { "HTTPS certificate created in {0}. Restart is required to apply it.", "HTTPS-сертификат создан в {0}. Для применения нужен перезапуск." },
            { "Unable to open browser", "Не удалось открыть браузер" },
            { "Unable to copy link", "Не удалось скопировать ссылку" },
            { "Windows clipboard is busy. Wait a moment and click Copy link again.", "Буфер обмена Windows занят. Подождите и снова нажмите «Копировать ссылку»." },
            { "The server is still running. Use the tray icon to open or stop it.", "Сервер продолжает работать. Откройте или остановите его через значок в трее." },
            { "FDV Bouldering Timer - running", "FDV Bouldering Timer — работает" },
            { "FDV Bouldering Timer - restarting", "FDV Bouldering Timer — перезапуск" },
            { "FDV Bouldering Timer - stopped", "FDV Bouldering Timer — остановлен" },
            { "FDV Bouldering Timer - error", "FDV Bouldering Timer — ошибка" },
            { "FDV Bouldering Timer Launcher is already running. Check the notification area.", "Лаунчер FDV Bouldering Timer уже запущен. Проверьте область уведомлений Windows." },
            { "The launcher encountered an error but can continue working.\n\n", "В лаунчере произошла ошибка, но он может продолжить работу.\n\n" },
            { "Could not save the launcher language preference.", "Не удалось сохранить язык лаунчера." },
            { "Maximum 64 names.", "Не более 64 адресов." },
            { "Enter an IP or DNS name.", "Укажите IP или имя сервера." },
            { "A certificate already exists.", "Сертификат уже существует." },
            { "Generated certificate has no private key.", "Созданный сертификат не содержит закрытого ключа." },
            { "Invalid server address: ", "Неверный адрес сервера: " },
            { "Use a reachable IP: ", "Укажите доступный IP: " },
            { "Invalid DNS name: ", "Неверное DNS-имя: " },
            { "Cannot secure certificate directory: ", "Не удалось защитить каталог сертификата: " },
            { "Using Node.js: ", "Используется Node.js: " },
            { "Unable to start server: ", "Не удалось запустить сервер: " },
            { "Scheduling server restart: ", "Запланирован перезапуск сервера: " },
            { "Could not stop previous port listeners: ", "Не удалось остановить прежние процессы на портах: " },
            { "Link copied: ", "Ссылка скопирована: " },
            { "Clipboard is busy: ", "Буфер обмена занят: " },
            { "Could not change the timer language: ", "Не удалось изменить язык таймера: " }
        };

        internal static string Text(string english)
        {
            if (!Russian) return english;
            for (int index = 0; index < Messages.GetLength(0); index++)
                if (english == Messages[index, 0]) return Messages[index, 1];
            // Only explicitly marked prefixes carry dynamic paths/system errors.
            for (int index = 0; index < Messages.GetLength(0); index++)
                if (Messages[index, 0].EndsWith(": ") && english.StartsWith(Messages[index, 0], StringComparison.Ordinal))
                    return Messages[index, 1] + Text(english.Substring(Messages[index, 0].Length));
            return english;
        }
    }
}
