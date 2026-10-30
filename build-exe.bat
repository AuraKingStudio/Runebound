@echo off
rem Builds a portable Windows .exe of Runebound. Double-click this file.
rem Input: this folder (index.html, main.js, ads-config.js). Output: dist\Runebound*.exe
title Runebound - building .exe
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org then run this again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing build tools - first run only, takes a minute...
  call npm install
  if errorlevel 1 goto fail
)

echo Building Runebound.exe ...
call npm run dist
if errorlevel 1 goto fail

echo.
echo Done! Your .exe is in the dist folder.
start "" "%~dp0dist"
pause
exit /b 0

:fail
echo.
echo Build failed - scroll up for the error.
pause
exit /b 1
