@echo off
chcp 65001 >nul
title Tra Cuu Ma So Thue - Clean WebApp

cd /d "%~dp0"

echo =======================================================
echo    Tra Cuu Ma So Thue Clean (Khong Quang Cao)
echo =======================================================
echo.

if exist "runtime\node.exe" (
    set "NODE_CMD=runtime\node.exe"
) else (
    set "NODE_CMD=node"
)

echo Dang kiem tra trang thai may chu...
curl.exe -s http://localhost:3000/api/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo May chu dang chay san tai http://localhost:3000!
    echo Dang mo trinh duyet...
    start "" http://localhost:3000
    ping 127.0.0.1 -n 2 >nul
    exit /b 0
)

echo Dang khoi dong may chu tai http://localhost:3000...
start "" http://localhost:3000
%NODE_CMD% server.mjs

pause
