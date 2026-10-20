@echo off
chcp 65001 >nul
title Bổ Sung Chi Tiết Đầy Đủ Doanh Nghiệp (Enricher) - Turso Cloud
cd /d "%~dp0"

echo ========================================================
echo     KHỞI ĐỘNG TOOL BỔ SUNG CHI TIẾT DOANH NGHIỆP
echo     (Cập nhật: Người đại diện, SĐT, Ngày HĐ, Thuế...)
echo ========================================================
echo.

if exist "runtime\node.exe" (
    "runtime\node.exe" enrich-turso.mjs
) else (
    node enrich-turso.mjs
)

echo.
pause
