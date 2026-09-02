@echo off
set "ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "%ROOT%scripts\start-qq-mail-assistant-stable.ps1"
if errorlevel 1 pause
