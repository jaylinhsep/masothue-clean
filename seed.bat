@echo off
chcp 65001 >nul
title Nạp Dữ Liệu Doanh Nghiệp (SEO Seeder) - Turso Cloud
cd /d "%~dp0"

echo ========================================================
echo     KHỞI ĐỘNG TOOL NẠP DỮ LIỆU LÊN TURSO CLOUD
echo ========================================================
echo.

if exist "runtime\node.exe" (
    "runtime\node.exe" seed-turso.mjs
) else (
    node seed-turso.mjs
)

echo.
pause
