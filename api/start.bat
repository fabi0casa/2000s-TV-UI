@echo off
title IPTV & EPG API - Porta 1414
color 0A

echo ========================================================
echo   Iniciando API IPTV & EPG (Porta 1414)
echo ========================================================
echo.
echo Testando e validando links de transmissao...
echo Pressione Ctrl+C para encerrar o servidor.
echo.

node server.js

pause
