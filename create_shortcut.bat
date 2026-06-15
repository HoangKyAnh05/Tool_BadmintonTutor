@echo off
title Create Desktop Shortcut - Badminton Tutor
cls
echo ==========================================================
echo    DANG TAO SHORTCUT CHO BADMINTON TUTOR TREN DESKTOP...
echo ==========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut([System.IO.Path]::Combine([System.Environment]::GetFolderPath('Desktop'), 'Badminton Tutor.lnk')); $Shortcut.TargetPath = '%~dp0run.bat'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.IconLocation = '%~dp0node_modules\electron\dist\electron.exe, 0'; $Shortcut.Save()"

echo [OK] Da tao shortcut "Badminton Tutor" tren Desktop cua ban!
echo.
pause
