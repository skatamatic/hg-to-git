@echo off
setlocal
rem Headless CLI for the packaged hg-to-git desktop install (no Node/npm required).
set "EXE=%~dp0hg-to-git.exe"
if not exist "%EXE%" set "EXE=%~dp0hg-to-git\hg-to-git.exe"
if not exist "%EXE%" (
  echo hg-to-git-cli: could not find hg-to-git.exe next to this script>&2
  exit /b 1
)
"%EXE%" --cli %*
