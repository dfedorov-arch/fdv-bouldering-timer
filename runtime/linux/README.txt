Portable Node.js для Linux

1. Откройте https://nodejs.org/en/download и скачайте Standalone Binary
   для Linux: x64 для обычных ПК или arm64 для 64-битных ARM-устройств.
2. Распакуйте содержимое архива в эту папку так, чтобы исполняемый файл
   находился по пути runtime/linux/bin/node.
3. Сделайте файлы исполняемыми:
   chmod +x runtime/linux/bin/node start-timer-linux.sh
4. Если Node.js распакован в другую папку, укажите путь в params.txt:
   portable_node_linux=/путь/к/node

Официальные Linux-сборки Node.js рассчитаны на glibc. Для Alpine Linux и
других систем на musl потребуется совместимая сборка Node.js.

Portable-версия необязательна. Если файл по настроенному пути не найден,
скрипт запуска попробует использовать системную команду node.


Portable Node.js for Linux

1. Open https://nodejs.org/en/download and download the Linux Standalone Binary:
   x64 for a typical PC or arm64 for a 64-bit ARM device.
2. Extract the archive into this folder so the executable is located at:
   runtime/linux/bin/node
3. Make the files executable:
   chmod +x runtime/linux/bin/node start-timer-linux.sh
4. If Node.js is stored elsewhere, set its path in params.txt:
   portable_node_linux=/path/to/node

Official Node.js Linux builds target glibc. Alpine Linux and other musl systems
require a compatible Node.js build.

The portable runtime is optional. When the configured portable executable is
missing, the launcher tries the system node command.
