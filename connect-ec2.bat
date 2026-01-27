@echo off
REM Quick connect script for Windows
REM Place this file in the same folder as picwa-staging.pem

echo Connecting to EC2 instance...
echo Host: 3.103.97.187
echo User: ubuntu
echo.

ssh -i picwa-staging.pem ubuntu@3.103.97.187

pause
