Portable Node.js для macOS

1. Откройте https://nodejs.org/en/download и скачайте Standalone Binary
   для macOS: arm64 для Apple Silicon или x64 для Intel.
2. Распакуйте содержимое архива в эту папку так, чтобы исполняемый файл
   находился по пути runtime/mac/bin/node.
3. Если Node.js распакован в другую папку, укажите путь к нему в params.txt:
   portable_node_mac=/путь/к/node

Если macOS не разрешает запуск, выполните один раз:
  chmod +x runtime/mac/bin/node

Portable-версия необязательна. Можно установить Node.js в систему обычным
способом: если файл по настроенному portable-пути не найден, скрипт запуска
попробует использовать системную команду node.


Portable Node.js for macOS

1. Open https://nodejs.org/en/download and download the macOS Standalone Binary:
   arm64 for Apple Silicon or x64 for an Intel Mac.
2. Extract the archive into this folder so the executable is located at:
   runtime/mac/bin/node
3. If Node.js is stored elsewhere, set its path in params.txt:
   portable_node_mac=/path/to/node

If macOS does not allow execution, run once:
  chmod +x runtime/mac/bin/node

The portable runtime is optional. You may install Node.js system-wide instead.
When the configured portable executable is missing, the launcher tries the
system node command.
