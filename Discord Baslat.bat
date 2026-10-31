@echo off
chcp 65001 >nul
title Discord Ozel
where node >nul 2>nul || (echo Node.js bulunamadi. Kurmak icin PowerShell'de calistirin: winget install OpenJS.NodeJS.LTS & pause & exit /b 1)
node "%~dp0discord-ozel.js" %*
if errorlevel 1 pause
