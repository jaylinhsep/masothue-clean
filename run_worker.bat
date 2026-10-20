@echo off
title Worker Nap Du Lieu MST0.COM
color 0b
echo ========================================================
echo   KHOI DONG WORKER NAP DU LIEU TU DONG - MST0.COM
echo   Gioi han an toan: Toi da 2.400 luot Serper / ngay
echo   (Nhan Ctrl+C de tam dung bat ky luc nao)
echo ========================================================
echo.

cd /d "%~dp0"
".\runtime\node.exe" seed_worker.mjs

echo.
echo ========================================================
echo   Worker da dung lai.
echo ========================================================
pause
