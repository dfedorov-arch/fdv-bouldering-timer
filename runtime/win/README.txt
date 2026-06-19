Portable Node.js для Windows

1. Откройте https://nodejs.org/en/download и скачайте Standalone Binary
   для Windows и архитектуры своего компьютера.
2. Распакуйте содержимое архива в эту папку так, чтобы файл Node.js
   находился по пути runtime\win\node.exe.
3. Если Node.js распакован в другую папку, укажите путь к нему в params.txt:
   portable_node_win=путь\к\node.exe

Portable-версия необязательна. Можно установить Node.js в систему обычным
способом: если файл по настроенному portable-пути не найден, скрипт запуска
попробует использовать системную команду node.
