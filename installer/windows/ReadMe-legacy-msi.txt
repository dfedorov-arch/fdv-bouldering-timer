FDV Bouldering Timer - Windows 7/8 MSI

RU
Установщик поддерживает Windows 7 SP1, Windows 8 и 8.1.
Выберите x64 для 64-битной ОС или x86 для 32-битной.
В комплект входят Node.js 12.22.12 и совместимый лаунчер CLR2/CLR4.

Программа устанавливается в Program Files\FDV Bouldering Timer Legacy
(для x86 на 64-битной ОС - Program Files (x86)). Запуск - через ярлык
FDV Bouldering Timer (Windows 7-8 x64/x86). MSI предлагает ярлыки в меню
«Пуск» и на рабочем столе. Установка сама таймер не запускает.

Параметры в params.txt редактируются с правами администратора; после
изменений перезапустите сервер. Данные таймера сохраняются в
%LOCALAPPDATA%\FDV Bouldering Timer\runtime-state, HTTPS-сертификаты -
в %LOCALAPPDATA%\FDV Bouldering Timer\https. Удаление программы через
Панель управления сохраняет эти пользовательские данные.

ZIP предназначен для запуска из распакованной папки. MSI не переносит
автоматически её runtime-state и HTTPS-сертификаты. Перед переходом
сохраните прежнюю папку. Полное руководство: help.html.

EN
For Windows 7 SP1, Windows 8 and 8.1. Choose x64 for 64-bit Windows or
x86 for 32-bit Windows. Includes Node.js 12.22.12 and the CLR2/CLR4 launcher.

Installs into Program Files\FDV Bouldering Timer Legacy (Program Files
(x86) for x86 on 64-bit Windows). Use the Windows 7-8 shortcut to open
the launcher. Start-menu/desktop shortcuts are optional; setup does not
start the timer. Change params.txt as administrator, then restart the server.

Installed timer state is stored under
%LOCALAPPDATA%\FDV Bouldering Timer\runtime-state; managed HTTPS files
are under %LOCALAPPDATA%\FDV Bouldering Timer\https. Uninstall through
Control Panel retains these user directories. MSI does not automatically
migrate data from a portable ZIP folder; keep that folder when moving to
the installed version. See help.html for the full guide.
