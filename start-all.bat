@echo off
title Aquanet TV - Iniciar Tudo (API + Frontend)
color 0E

echo ========================================================
echo   Iniciando Aquanet IPTV Completo (API + Frontend)
echo ========================================================
echo.
echo 1. Abrindo API IPTV & EPG na porta 1414...
start "Aquanet IPTV API (Porta 1414)" cmd /c "cd api && start.bat"

echo 2. Aguardando 3 segundos...
timeout /t 3 /nobreak >nul

echo 3. Abrindo Frontend na porta 8080...
start "Aquanet TV Frontend (Porta 8080)" cmd /c "start-frontend.bat"

echo.
echo Servicos iniciados em janelas separadas!
echo API: http://localhost:1414
echo Frontend: http://localhost:8080
echo.
pause
