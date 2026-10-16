@echo off
setlocal
set "MOYRITM_PS7=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not exist "%MOYRITM_PS7%" set "MOYRITM_PS7=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe"
if not exist "%MOYRITM_PS7%" (
    echo PowerShell 7 was not found. Ask Codex to check the local build tools.
    exit /b 1
)
"%MOYRITM_PS7%" -NoLogo -NoProfile -File "%~dp0build-android-release.ps1" %*
exit /b %ERRORLEVEL%
