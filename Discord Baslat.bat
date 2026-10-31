@echo off
chcp 65001 >nul
title Discord Ozel
where node >nul 2>nul || (echo Node.js bulunamadi. https://nodejs.org adresinden kurun. & pause & exit /b 1)
node "%~dp0discord-ozel.js" %*
if errorlevel 1 pause
