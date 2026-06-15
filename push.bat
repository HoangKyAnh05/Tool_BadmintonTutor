@echo off
title Push to GitHub - Badminton Coach Assistant
cls
echo ==========================================================
echo    DANG LUU VA PUSH MA NGUON LEN GITHUB...
echo ==========================================================
echo.

:: Check if git is installed
where git >nul 2>nul
if %ERRORLEVEL% neq 0 goto nogit

:: Auto-initialize git if not present
if not exist .git goto initgit
goto checkremote

:initgit
echo 0. Khoi tao Git repository...
git init
echo.

:checkremote
echo 1. Cau hinh remote repository moi...
git remote remove origin >nul 2>nul
git remote add origin https://github.com/HoangKyAnh05/Tool_BadmintonTutor.git

echo.
echo 2. Them tat ca file vao danh sach thay doi...
git add .

echo.
echo 3. Commit cac thay doi...
git commit -m "Update Badminton Coach App: Fix AI models and script loading"

echo.
echo 4. Xac dinh branch hien tai...
for /f "tokens=*" %%i in ('git branch --show-current') do set BRANCH=%%i
if "%BRANCH%"=="" set BRANCH=main
echo Branch dang su dung: %BRANCH%

echo.
echo 5. Dang day (push) ma nguon len GitHub remote...
git push origin %BRANCH%
if %ERRORLEVEL% neq 0 goto pusherror

echo.
echo [OK] Da day (push) ma nguon len GitHub thanh cong!
goto end

:nogit
echo [ERROR] Khong tim thay cong cu Git tren may!
echo Vui long tai va cai dat Git tu: https://git-scm.com/
goto end

:pusherror
echo.
echo ==========================================================
echo [ERROR] Khong the day ma nguon len GitHub!
echo.
echo Co the vi cac ly do sau:
echo 1. May tinh chua duoc cap quyen truy cap den repository nay.
echo 2. Ban chua dang nhap tai khoan GitHub tren trinh duyet.
echo 3. Co code moi tren GitHub ma may ca nhan chua cap nhat.
echo ==========================================================

:end
echo.
pause
