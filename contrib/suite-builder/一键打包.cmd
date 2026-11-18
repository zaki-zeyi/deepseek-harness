@echo off
chcp 65001 >nul
cd /d "%~dp0"
node automation\build.mjs
if errorlevel 1 echo 构建失败，详情见 build\automated 中最近的 report.json 和日志。
pause
