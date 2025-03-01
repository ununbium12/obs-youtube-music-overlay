@echo off
cd /d %~dp0
set NODE_NO_WARNINGS=1
obs-nowplaying.exe
pause