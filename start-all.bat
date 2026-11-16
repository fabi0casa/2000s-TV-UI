@echo off
title Aquanet TV - React Native Android
color 0B

echo ========================================================
echo   Iniciando Aquanet IPTV React Native (Android Nativo)
echo ========================================================
echo.
echo 1. Atualizando bundle do player...
call node bundle-web.js
echo.
echo 2. Iniciando Metro Bundler / Expo...
call npm start
