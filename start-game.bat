@echo off
echo Building and starting The Resistance...

echo.
echo Building common modules...
cd common
call npm run build
if %errorlevel% neq 0 (
    echo Failed to build common modules
    pause
    exit /b 1
)

echo.
echo Building backend...
cd ../backend
call npm run build
if %errorlevel% neq 0 (
    echo Failed to build backend
    pause
    exit /b 1
)

echo.
echo Building frontend...
cd ../frontend
call npm run build
if %errorlevel% neq 0 (
    echo Failed to build frontend
    pause
    exit /b 1
)

echo.
echo Starting server...
cd ../backend
start "The Resistance Server" cmd /k "node dist/index.js"

echo.
echo Waiting 3 seconds for server to start...
timeout /t 3 /nobreak > nul

echo.
echo Starting frontend...
cd ../frontend
start "The Resistance Frontend" cmd /k "npm start"

echo.
echo Game is starting up!
echo - Server will be available at http://localhost:8080
echo - Frontend will be available at http://localhost:3000
echo.
echo Press any key to exit this script...
pause > nul


