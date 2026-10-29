@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 18.18 or newer from https://nodejs.org then try again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci --omit=dev
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Open the local address printed below in your browser. Keep this window open.
node scripts/launch.mjs
pause
