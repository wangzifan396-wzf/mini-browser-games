@echo off
setlocal
chcp 65001 >nul
title Starforge Nexus Launcher
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch.ps1"
if errorlevel 1 (
  echo.
  echo Launch failed. See the error above, then press any key to close.
  pause >nul
  exit /b 1
)

echo Starforge Nexus is open. This launcher window will close shortly.
timeout /t 2 /nobreak >nul
