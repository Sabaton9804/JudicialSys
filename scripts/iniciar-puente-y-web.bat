@echo off
title JudicialSys
cd /d "%~dp0.."

echo Liberando 3000 y 3847...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0kill-dev-ports.ps1" 2>nul

echo.
echo Un solo comando: puente + web (deje esta ventana ABIERTA).
echo Para solo web sin puente: use npm run dev:no-bridge o JUSTICIA_XXI_BRIDGE_DISABLED=1
echo.
cmd /k "npm run dev"
