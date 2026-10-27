@echo off
title Aquanet TV - Frontend (Porta 8080)
color 0B

echo ========================================================
echo   Iniciando Frontend Aquanet TV (Porta 8080)
echo ========================================================
echo.
echo Abrindo servidor em http://localhost:8080 ...
echo (Lembre-se de iniciar a API na pasta api em outra janela: api\start.bat)
echo.

start http://localhost:8080
node frontend-server.js

pause
