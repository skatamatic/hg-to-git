@echo off
setlocal
set "ROOT=%~dp0"
if not exist "%ROOT%dist\cli.js" (
  echo hg-to-git: run npm run build first ^(dist\cli.js missing^)>&2
  exit /b 1
)
node "%ROOT%dist\cli.js" %*
