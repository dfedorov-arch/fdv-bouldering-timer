using System;
using System.IO;
using System.Text;

namespace FdvBoulderingTimerLauncher
{
    internal static class LauncherLanguage
    {
        internal static bool Russian = true;
        internal static string PreferencePath
        {
            get { return Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "FDV Bouldering Timer"), "launcher-language.txt"); }
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
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                File.WriteAllText(path, Russian ? "ru" : "en", Encoding.UTF8);
                return true;
            }
            catch (IOException) { return false; }
            catch (UnauthorizedAccessException) { return false; }
            catch (System.Security.SecurityException) { return false; }
        }

        private static readonly string[,] Messages = {
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
