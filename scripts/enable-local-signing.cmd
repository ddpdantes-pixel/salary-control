@echo off
setlocal
call "%~dp0build-android-release.cmd" -EnrollLocalCredential
set "MOYRITM_SIGN_RESULT=%ERRORLEVEL%"
echo.
echo Local verification finished. No retry or additional password prompt is started.
pause
exit /b %MOYRITM_SIGN_RESULT%
