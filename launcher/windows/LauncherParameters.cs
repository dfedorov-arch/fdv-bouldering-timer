using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace FdvBoulderingTimerLauncher
{
    // CLR2-compatible file editor shared by all desktop launchers. No live server commands.
    internal sealed class LauncherParameters
    {
        internal sealed class Entry
        {
            internal string Key, Value, OriginalValue;
            internal Entry(string key, string value) { Key = key; Value = OriginalValue = value; }
            internal string Label { get { return Caption(Key); } }
            internal string[] Choices
            {
                get
                {
                    if (BooleanKeys.IndexOf("|" + Key + "|", StringComparison.Ordinal) >= 0) return new string[] { "false", "true" };
                    if (Key == "language") return new string[] { "ru", "en" };
                    if (Key == "final_round_format") return new string[] { "old", "new" };
                    return new string[0];
                }
            }
        }
        private const string BooleanKeys = "|primary_browser|sound|sound_in_other_browsers|festival_announcements|flashing|no_sound_warm|speaker_keep_awake|timer_vertical_stretch|";
        internal readonly List<Entry> Entries = new List<Entry>();
        private readonly string _path, _original;
        private readonly byte[] _originalBytes;
        private readonly bool _bom;
        private LauncherParameters(string path)
        {
            _path = path;
            _originalBytes = File.ReadAllBytes(path);
            _bom = _originalBytes.Length >= 3 && _originalBytes[0] == 239 && _originalBytes[1] == 187 && _originalBytes[2] == 191;
            _original = new UTF8Encoding(false, true).GetString(_originalBytes, _bom ? 3 : 0, _originalBytes.Length - (_bom ? 3 : 0));
            foreach (string line in _original.Split('\n'))
            {
                string key, value;
                if (!Parse(line, out key, out value)) continue;
                int index = Entries.FindIndex(delegate(Entry e) { return e.Key == key; });
                if (index < 0) Entries.Add(new Entry(key, value)); else Entries[index].Value = Entries[index].OriginalValue = value;
            }
            if (Entries.Count == 0) throw new IOException(Local("No parameters found in params.txt.", "В params.txt не найдены параметры."));
        }
        internal static LauncherParameters Load(string directory) { return new LauncherParameters(Path.Combine(directory, "params.txt")); }
        internal static string Local(string english, string russian) { return LauncherLanguage.Russian ? russian : english; }
        internal const string RestartMessage = "Настройки сохранены, для их немедленного применения необходимо перезапустить сервер, сделать это сейчас?";
        internal static string SavedMessage { get { return Local("Settings saved. To apply them immediately, restart the server. Restart now?", RestartMessage); } }
        private static bool Parse(string line, out string key, out string value)
        {
            key = value = "";
            if (line.TrimStart().StartsWith("#")) return false;
            int split = line.IndexOf('=');
            if (split <= 0) return false;
            key = line.Substring(0, split).Trim().ToLowerInvariant(); value = line.Substring(split + 1).Trim();
            return key.Length > 0;
        }
        internal void Save()
        {
            foreach (Entry entry in Entries) if (entry.Value != entry.OriginalValue) Validate(entry);
            byte[] current = File.ReadAllBytes(_path);
            if (Convert.ToBase64String(current) != Convert.ToBase64String(_originalBytes))
                throw new IOException(Local("params.txt has changed. Close and reopen Settings before saving.", "Файл params.txt изменился. Закройте и заново откройте настройки перед сохранением."));
            string[] lines = _original.Split('\n');
            for (int i = 0; i < lines.Length; i++)
            {
                string key, value;
                if (!Parse(lines[i], out key, out value)) continue;
                int index = Entries.FindIndex(delegate(Entry e) { return e.Key == key; });
                if (index < 0) continue;
                Entry entry = Entries[index];
                // Preserve untouched lines, including whitespace; update every occurrence of a changed key.
                if (entry.Value == entry.OriginalValue) continue;
                int split = lines[i].IndexOf('=');
                lines[i] = lines[i].Substring(0, split + 1) + entry.Value.Trim() + (lines[i].EndsWith("\r") ? "\r" : "");
            }
            string temporary = _path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                File.WriteAllText(temporary, String.Join("\n", lines), new UTF8Encoding(_bom));
                File.Replace(temporary, _path, null);
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }
        private static void Validate(Entry entry)
        {
            string value = entry.Value.Trim(), key = entry.Key;
            string reason = "";
            if (value.Contains("\n") || value.Contains("\r") || value.Contains("\0")) reason = Local("Enter a single line.", "Введите одну строку.");
            string[] choices = entry.Choices;
            if (choices.Length > 0 && Array.IndexOf(choices, value) < 0) reason = String.Join(" / ", choices);
            int min = 0, max = 0;
            switch (key)
            {
                case "http_port": case "https_port": min = 1; max = 65535; break;
                case "classic_rotation_minutes": case "festival_round_minutes": case "final_rotation_minutes": min = 1; max = 240; break;
                case "classic_break_seconds": max = 3600; break;
                case "festival_break_minutes": max = 240; break;
                case "final_rest_rotations": min = 1; max = 9; break;
                case "speaker_keep_awake_interval_seconds": min = 10; max = 600; break;
                case "speaker_keep_awake_frequency_hz": min = 100; max = 2000; break;
            }
            int integer;
            if (max > 0 && (!Int32.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out integer) || integer < min || integer > max)) reason = min + "–" + max;
            if (key == "timer_vertical_stretch_max_percent" && !Int32.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out integer)) reason = Local("Enter an integer percent.", "Введите целый процент.");
            double gain;
            if (key == "speaker_keep_awake_gain" && (!Double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out gain) || Double.IsNaN(gain) || gain < 0.0001 || gain > 0.1)) reason = "0.0001–0.1";
            if (key.EndsWith("_color") && !Regex.IsMatch(value, "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")) reason = "#RGB / #RRGGBB";
            if (reason.Length > 0) throw new ArgumentException(entry.Label + ": " + reason);
        }
        private static readonly string[,] Captions = {
            { "http_port", "HTTP port", "Порт HTTP" },
            { "https_port", "HTTPS port", "Порт HTTPS" },
            { "portable_node_win", "Node.js path — Windows", "Путь Node.js — Windows" },
            { "portable_node_mac", "Node.js path — macOS", "Путь Node.js — macOS" },
            { "portable_node_linux", "Node.js path — Linux", "Путь Node.js — Linux" },
            { "language", "Timer language (ru / en)", "Язык таймера (ru / en)" },
            { "classic_rotation_minutes", "Classic: rotation (minutes, 1–240)", "Классика: ротация (мин, 1–240)" },
            { "classic_break_seconds", "Classic: break (seconds, 0–3600)", "Классика: перерыв (сек, 0–3600)" },
            { "festival_round_minutes", "Festival: round (minutes, 1–240)", "Фестиваль: раунд (мин, 1–240)" },
            { "festival_break_minutes", "Festival: break (minutes, 0–240)", "Фестиваль: перерыв (мин, 0–240)" },
            { "final_rotation_minutes", "Final: rotation (minutes, 1–240)", "Финал: ротация (мин, 1–240)" },
            { "final_round_format", "Final format (old / new)", "Формат финала (old / new)" },
            { "final_rest_rotations", "Final: rest rotations (1–9)", "Финал: ротаций отдыха (1–9)" },
            { "primary_browser", "Primary browser by default", "Основной браузер по умолчанию" },
            { "sound", "Sound", "Звук" },
            { "sound_in_other_browsers", "Sound in other browsers", "Звук в других браузерах" },
            { "festival_announcements", "Festival announcements", "Объявления фестиваля" },
            { "flashing", "Flashing", "Мигание" },
            { "no_sound_warm", "Mute preparation", "Без звука при подготовке" },
            { "speaker_keep_awake", "Keep speakers awake", "Не давать колонкам засыпать" },
            { "speaker_keep_awake_interval_seconds", "Speaker pulse interval (seconds, 10–600)", "Интервал сигнала колонкам (сек, 10–600)" },
            { "speaker_keep_awake_gain", "Speaker pulse gain (0.0001–0.1)", "Громкость сигнала колонкам (0.0001–0.1)" },
            { "speaker_keep_awake_frequency_hz", "Speaker pulse frequency (Hz, 100–2000)", "Частота сигнала колонкам (Гц, 100–2000)" },
            { "sound_profile", "Sound profile (folder in beeps)", "Звуковой профиль (папка в beeps)" },
            { "timer_font_file", "Font file (inside fonts)", "Файл шрифта (в папке fonts)" },
            { "timer_font", "Fallback font (CSS)", "Запасной шрифт (CSS)" },
            { "timer_vertical_stretch", "Stretch digits by default", "Растягивать цифры по умолчанию" },
            { "timer_vertical_stretch_max_percent", "Maximum digit height (%)", "Максимальная высота цифр (%)" },
            { "countdown_text_color", "Countdown: text color", "Отсчёт: цвет текста" },
            { "countdown_background_color", "Countdown: background", "Отсчёт: фон" },
            { "rotation_text_color", "Rotation: text color", "Ротация: цвет текста" },
            { "rotation_last_five_text_color", "Last 5 seconds: text color", "Последние 5 секунд: цвет текста" },
            { "rotation_background_color", "Rotation: background", "Ротация: фон" },
            { "rotation_last_five_background_color", "Last 5 seconds: background", "Последние 5 секунд: фон" },
            { "break_text_color", "Break: text color", "Перерыв: цвет текста" },
            { "break_background_color", "Break: background", "Перерыв: фон" },
            { "list_ready_color", "Start list: ready marker", "Список: маркер готовности" },
            { "list_active_color", "Start list: active marker", "Список: активный маркер" },
            { "list_done_color", "Start list: completed marker", "Список: маркер завершения" },
            { "list_paused_color", "Start list: paused marker", "Список: маркер паузы" },
            { "list_stopped_color", "Start list: stopped marker", "Список: маркер остановки" },
        };
        private static string Caption(string key)
        {
            for (int i = 0; i < Captions.GetLength(0); i++)
                if (Captions[i, 0] == key) return Captions[i, LauncherLanguage.Russian ? 2 : 1];
            return key;
        }
    }
}
