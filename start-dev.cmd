@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules" (
  echo [CodeAgentDesk] node_modules not found, running npm install...
  call npm install
  if errorlevel 1 goto :error
  echo [CodeAgentDesk] rebuilding native modules...
  call npm run rebuild
  if errorlevel 1 goto :error
)

echo [CodeAgentDesk] starting dev app...
call npm run dev
if errorlevel 1 goto :error
goto :eof

:error
echo.
echo [CodeAgentDesk] startup failed. See messages above.
pause
exit /b 1
