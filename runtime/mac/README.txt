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
