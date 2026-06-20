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


Portable Node.js for Windows

1. Open https://nodejs.org/en/download and download the Standalone Binary for
   Windows and your computer architecture.
2. Extract the archive into this folder so the executable is located at:
   runtime\win\node.exe
3. If Node.js is stored elsewhere, set its path in params.txt:
   portable_node_win=path\to\node.exe

The portable runtime is optional. You may install Node.js system-wide instead.
When the configured portable executable is missing, the launcher tries the
system node command.
