@echo off
REM ================================================================
REM  SoloMD - one-shot release script (mirrors fapiao-print's style)
REM  Does: sync version -> commit -> tag -> push, which triggers the
REM  GitHub Actions matrix build and publishes a draft Release.
REM  Usage: release.bat 4.13.2
REM         release.bat 4.13.2 "fix table export"
REM  See also: scripts/release.sh, the official bash version.
REM
REM  *** KEEP THIS FILE ASCII-ONLY *** - see the header of build.bat
REM  for the cmd.exe codepage reason.
REM ================================================================

chcp 65001 >nul
setlocal enabledelayedexpansion

set "V=%~1"
set "MSG=%~2"

if "%V%"=="" (
    echo [ERROR] missing version number
    echo.
    echo   usage: release.bat ^<version^> ["commit message"]
    echo   e.g.   release.bat 4.13.2
    echo          release.bat 4.13.2 "fix table export"
    echo.
    exit /b 1
)

if "%MSG%"=="" set "MSG=release v%V%"

REM Rough semver check: number.number.number, optional -prerelease suffix
echo %V% | findstr /R "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" >nul
if errorlevel 1 (
    echo [ERROR] version must be semver, e.g. 4.13.2
    exit /b 1
)

echo.
echo ===========================================
echo   SoloMD release v%V%
echo ===========================================
echo.

REM -- 1/5 preflight checks --------------------------------------------
echo [1/5] checking the workspace and the toolchain...

git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] the current directory is not a Git repository
    exit /b 1
)

where git >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] git not found
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] node not found, install Node.js first
    exit /b 1
)

REM Current branch. The official release.sh hardcodes main; detecting it is safer.
for /f "tokens=*" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%b"
if "%BRANCH%"=="" set "BRANCH=main"

echo   current branch: %BRANCH%

REM -- 2/5 sync the version numbers ------------------------------------
echo.
echo [2/5] syncing the version into package.json / tauri.conf.json / Cargo.toml ...
node "%~dp0scripts\bump-version.js" %V%
if errorlevel 1 (
    echo   [ERROR] version sync failed
    exit /b 1
)

REM -- 3/5 commit ------------------------------------------------------
echo.
echo [3/5] committing ...

git status --porcelain 2>nul | findstr /R "." >nul
if not errorlevel 1 (
    echo   [NOTE] the working tree has changes, including untracked files - they will be committed too
)

git add -A
git commit -m "chore: release v%V% - %MSG%"
if errorlevel 1 (
    echo   [NOTE] nothing to commit, carrying on to the tag
)

REM -- 4/5 tag ---------------------------------------------------------
echo.
echo [4/5] creating tag v%V% ...
git tag -d v%V% >nul 2>&1
git tag v%V%
if errorlevel 1 (
    echo   [ERROR] failed to create the tag
    exit /b 1
)

REM -- 5/5 push --------------------------------------------------------
echo.
echo [5/5] pushing to GitHub ...
git push origin %BRANCH%
if errorlevel 1 (
    echo   [ERROR] failed to push %BRANCH%
    exit /b 1
)

REM Important: when the remote already carries this tag, a plain push answers
REM "Everything up-to-date" and triggers no build at all. The remote tag has to
REM be deleted first so the workflow fires again.
git ls-remote --exit-code --tags origin "refs/tags/v%V%" >nul 2>&1
if errorlevel 1 (
    echo   no remote tag v%V%, pushing it directly
) else (
    echo   [NOTE] remote tag v%V% already exists, deleting it so the build re-triggers
    git push origin ":refs/tags/v%V%"
    if errorlevel 1 (
        echo   [ERROR] failed to delete the remote tag
        exit /b 1
    )
)

git push origin v%V%
if errorlevel 1 (
    echo   [ERROR] failed to push the tag
    exit /b 1
)

echo.
echo ===========================================
echo   tag v%V% pushed, GitHub Actions is starting the matrix build
echo.
echo   progress: https://github.com/chenghaitao/solomd/actions
echo   releases: https://github.com/chenghaitao/solomd/releases
echo.
echo   matrix: Win x64/arm64 msi + Linux x64/arm64 deb/appimage/rpm
echo   the Release is a draft - open the releases page and hit Publish once the matrix is green
echo ===========================================
echo.

endlocal
