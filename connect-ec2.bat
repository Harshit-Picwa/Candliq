@echo off
REM Quick connect script for Windows
REM Recommended: keep your PEM outside the repo, e.g. %USERPROFILE%\.ssh\picwa-staging.pem

echo Connecting to EC2 instance...
echo Host: 3.103.97.187
echo User: ubuntu
echo.

set "PEM=%USERPROFILE%\.ssh\picwa-staging.pem"
if not "%~1"=="" set "PEM=%~1"

if not exist "%PEM%" (
  echo ERROR: PEM file not found at "%PEM%"
  echo Usage:
  echo   connect-ec2.bat
  echo   connect-ec2.bat C:\path\to\picwa-staging.pem
  pause
  exit /b 1
)

ssh -i "%PEM%" ubuntu@3.103.97.187

pause
