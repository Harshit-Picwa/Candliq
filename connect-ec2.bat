@echo off
REM Quick connect script for Windows
REM Recommended: keep your PEM outside the repo, e.g. %USERPROFILE%\.ssh\

echo Connecting to EC2 instance...
set "HOST=3.103.97.187"
set "USER=ubuntu"
if not "%~2"=="" set "HOST=%~2"
if not "%~3"=="" set "USER=%~3"

echo Host: %HOST%
echo User: %USER%
echo.

set "PEM=%USERPROFILE%\.ssh\picwa-staging.pem"
if not "%~1"=="" set "PEM=%~1"

if not exist "%PEM%" (
  echo ERROR: PEM file not found at "%PEM%"
  echo Usage:
  echo   connect-ec2.bat
  echo   connect-ec2.bat C:\path\to\key.pem
  echo   connect-ec2.bat C:\path\to\key.pem 3.103.6.160
  echo   connect-ec2.bat C:\path\to\key.pem 3.103.6.160 ubuntu
  pause
  exit /b 1
)

ssh -i "%PEM%" %USER%@%HOST%

pause
