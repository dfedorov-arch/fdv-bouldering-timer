Звуковые профили
================

Каждый подкаталог внутри beeps является отдельным звуковым профилем.
Название подкаталога указывается в params.txt:

  sound_profile=FSR_2026

Поддерживаются файлы WAV и MP3 со стандартными именами:

  START     начало ротации и переход с перерыва на ротацию
  END       окончание ротации и начало перерыва
  MINUTE    сигнал за одну минуту
  WARNING   каждый сигнал последних пяти секунд
  FESTIVAL_60  объявление за 60 минут в Фестивале
  FESTIVAL_30  объявление за 30 минут в Фестивале
  FESTIVAL_10  объявление за 10 минут в Фестивале
  FESTIVAL_5   объявление за 5 минут в Фестивале

Расширение может быть .wav или .mp3. Регистр букв в имени не важен.
Если одновременно существуют оба формата, используется WAV.

END является необязательным. Если его нет, вместо него используется START.
При нулевом перерыве в Классике и Фестивале END не звучит: сразу начинается
следующая ротация и используется START. В Финале при завершении звучит END
или заменяющий его START независимо от длительности перерыва.

Если START, MINUTE или WARNING отсутствует, для соответствующего события
используется синтетический сигнал.

Файлы FESTIVAL_60, FESTIVAL_30, FESTIVAL_10 и FESTIVAL_5 необязательны. Если
нужного файла нет и включены «Объявления времени», используется системный голос,
а при отсутствии подходящего голоса - сигнал MINUTE. Выключенный чекбокс
отменяет и файлы профиля, и голосовые объявления.

Профили Boulder_JAPAN_CUP_2025, IFSC_PRAGUE_2025 и IFSC_INNSBRUCK_2025 основаны на
синтетических WAV-сигналах из проекта latiosu/boulder-timer (MIT License):

  https://github.com/latiosu/boulder-timer


==========================================================================

Sound profiles
==============

Each subfolder inside beeps is a separate sound profile.
The subfolder name is specified in params.txt:

  sound_profile=FSR_2026

WAV and MP3 files with the following standard names are supported:

  START     rotation start and transition from break to rotation
  END       rotation end and break start
  MINUTE    one-minute warning signal
  WARNING   each signal of the last five seconds
  FESTIVAL_60  60-minute announcement in Festival mode
  FESTIVAL_30  30-minute announcement in Festival mode
  FESTIVAL_10  10-minute announcement in Festival mode
  FESTIVAL_5   5-minute announcement in Festival mode

The extension can be .wav or .mp3. File names are case-insensitive.
If both formats exist for the same name, WAV is used.

END is optional. If absent, START is used instead.
With a zero-length break in Classic and Festival modes, END does not play:
the next rotation starts immediately and START is used. In Final mode, END
(or START as its fallback) always plays at the end regardless of break duration.

If START, MINUTE, or WARNING is missing, a synthetic beep is used for the
corresponding event.

FESTIVAL_60, FESTIVAL_30, FESTIVAL_10, and FESTIVAL_5 are optional. When a
required file is missing and "Time announcements" is enabled, the system voice
is used; if no suitable voice is available, the MINUTE signal is played instead.
Disabling the checkbox suppresses both profile files and voice announcements.

The Boulder_JAPAN_CUP_2025, IFSC_PRAGUE_2025, and IFSC_INNSBRUCK_2025 profiles
are based on synthetic WAV signals from the latiosu/boulder-timer project (MIT License):

  https://github.com/latiosu/boulder-timer
