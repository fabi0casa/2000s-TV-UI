@echo off
chcp 65001 >nul
title Repositório Flash - Servidores (Principal e Windows 93)

echo ================================================================
echo          INICIANDO SERVIDORES DO REPOSITÓRIO FLASH
echo ================================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Node.js detectado! Executando server.js...
    node server.js
    goto fim
)

echo [ERRO] Nao foi possivel encontrar Node.js instalado no sistema.
echo Por favor, instale para rodar os servidores locais:
echo   - Node.js: https://nodejs.org
echo.
pause

:fim
