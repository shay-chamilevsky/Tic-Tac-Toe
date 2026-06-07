@echo off
cd /d "%~dp0"
start "" /B node server.js
timeout /t 1 /nobreak >nul
start "" http://localhost:8080
