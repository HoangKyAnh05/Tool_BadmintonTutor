@echo off
cd /d "%~dp0"
echo ==========================================================
echo    KHOI CHAY CONG CU BADMINTON COACH ASSISTANT
echo ==========================================================
echo.

rem Xoa tep rac "Dang" neu co do loi redirect truoc do
if exist "Dang" del "Dang"

echo [1/2] Dang kiem tra thu vien...
if not exist "node_modules\electron\cli.js" (
    echo Thu vien chua duoc cai dat hoac bi thieu file. Dang tu dong cai dat lai...
    set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    call npm install --no-audit --no-fund
) else (
    echo [OK] Thu vien da duoc cai dat day du.
)

echo.
echo [2/2] Dang khoi chay ung dung Electron...
call npm start
if %errorlevel% neq 0 (
    echo.
    echo [ERR] Gap loi khi khoi chay ung dung.
    pause
)
