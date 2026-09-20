@echo off
REM ================================================================
REM  SoloMD - Windows one-shot build (desktop: app + solomd-mcp sidecar)
REM
REM  *** KEEP THIS FILE ASCII-ONLY ***
REM  cmd.exe decodes a .bat with the ACTIVE console codepage (936 on a
REM  Chinese Windows), so UTF-8 bytes get read as GBK. A multi-byte
REM  sequence can then swallow the CR byte, the parser loses its line
REM  offsets and starts executing fragments of lines - the classic
REM  "'d' is not recognized as an internal or external command" /
REM  "The system cannot find the path specified" storm, with whole
REM  lines silently skipped. Measured on this very file: UTF-8 + LF
REM  silently drops lines, UTF-8 + CRLF reports parse errors, UTF-8 +
REM  BOM is worse still. ASCII + CRLF parses cleanly. Keep Chinese
REM  text in a .ps1 saved as UTF-8 WITH BOM, or in the Markdown docs -
REM  never in a .bat.
REM
REM  Three deltas from fapiao-print\build_exe.bat:
REM    1) pnpm instead of npm - solomd is a pnpm project (pnpm-lock.yaml)
REM    2) mcp-server must be compiled BEFORE tauri build: tauri.conf.json's
REM       bundle.externalBin is validated by build.rs at COMPILE time, so a
REM       missing sidecar binary fails the build outright
REM    3) Windows needs an MSVC environment (vendored-openssl / vendored-libgit2)
REM
REM  Output:  (everything lands in local_build_output\, which .gitignore excludes)
REM    local_build_output\SoloMD_[ver]_[arch]_[locale].msi   (installer)
REM    local_build_output\SoloMD_[ver]_[arch]-portable.zip
REM                          (SoloMD.exe + solomd-mcp.exe + README.txt)
REM
REM  Prerequisites:
REM    - Rust stable (rustc / cargo)
REM    - Node 18+ (pnpm is enabled through corepack when it is missing)
REM    - Visual Studio 2022 build tools (MSVC cl/link) - vcvars64.bat is located automatically
REM    - Git for Windows (bash, used by build-mcp-sidecar.sh and tar)
REM    - Microsoft Edge WebView2 (preinstalled on Windows 10/11)
REM    - Optional: Strawberry Perl + NASM for vendored-openssl; a missing
REM      toolchain stalls inside openssl-sys
REM
REM  Usage: double-click this file, or run "build.bat" from a cmd prompt
REM ================================================================

REM Switch the console to UTF-8 so cargo / pnpm / git child-process output is
REM readable. Harmless for this script: our own text is pure ASCII, which is
REM exactly why the chcp-switch parsing bug described above cannot bite.
chcp 65001 >nul
setlocal enabledelayedexpansion

cd /D "%~dp0"

REM -- 0/5 locate and load the VS 2022 environment ------------------------
set "VSVCVARS="
for %%P in (
  "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
  "C:\Program Files\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat"
  "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat"
  "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
) do ( if exist %%P if not defined VSVCVARS set "VSVCVARS=%%P" )

if defined VSVCVARS (
  echo [0/5] loading VS environment: %VSVCVARS%
  call "%VSVCVARS%" >nul 2>&1
) else (
  echo [WARN] vcvars64.bat not found - vendored-openssl / libgit2 may fail to build
)

REM -- pin Git Bash to the FRONT of PATH so `bash` is Git, not WSL -------
REM   On machines with WSL installed but no distro, the bare `bash` command
REM   is hijacked by the Windows App-Execution-Alias that forwards to wsl.exe,
REM   which then dies with "no installed distributions". solomd's whole build
REM   chain (this sidecar step AND tauri's beforeBundleCommand) shells out to
REM   `bash`, so we put Git's bash first on PATH. tauri inherits this PATH via
REM   the build.bat -> pnpm -> tauri child chain, fixing beforeBundleCommand too.
set "GITBINDIR="
if exist "%ProgramFiles%\Git\bin\bash.exe" set "GITBINDIR=%ProgramFiles%\Git\bin"
if not defined GITBINDIR if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "GITBINDIR=%ProgramFiles(x86)%\Git\bin"
if not defined GITBINDIR (
  for /f "delims=" %%B in ('where bash 2^>nul') do (
    echo %%B | findstr /I /C:"WindowsApps" >nul || if not defined GITBINDIR set "GITBINDIR=%%~dpB"
  )
)
if defined GITBINDIR (
  echo [0/5] using Git Bash: %GITBINDIR%\bash.exe
  set "PATH=%GITBINDIR%;%PATH%"
) else (
  echo [WARN] Git Bash not found on PATH - `bash` may resolve to WSL and break the sidecar build
)

REM -- 1/5 toolchain ready (cargo + pnpm) --------------------------------
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

where pnpm >nul 2>&1
if errorlevel 1 (
  echo [1/5] pnpm not found, enabling it through corepack - needs Node 16.13 or newer ...
  corepack enable >nul 2>&1
  corepack prepare pnpm@10 --activate >nul 2>&1
)
where pnpm >nul 2>&1
if errorlevel 1 (
  echo [1/5] corepack failed, installing pnpm globally with npm ...
  call npm install -g pnpm
)
where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm is still unavailable, install it manually: npm i -g pnpm
  exit /b 1
)

REM Host Rust target triple -> arch label (x64 / arm64)
for /f "tokens=1,* delims=: " %%A in ('rustc -vV ^| findstr /C:"host:"') do set "HOSTTRIPLE=%%B"
set "ARCH=x64"
echo %HOSTTRIPLE% | findstr /C:"aarch64" >nul && set "ARCH=arm64"
echo [1/5] host target: %HOSTTRIPLE%   arch=%ARCH%

REM -- 2/5 prebuild the solomd-mcp sidecar binary ------------------------
echo [2/5] building mcp-server - solomd-mcp - into app\src-tauri\binaries\ ...
if defined GITBINDIR (
  call "%GITBINDIR%\bash.exe" scripts/build-mcp-sidecar.sh
) else (
  call bash scripts/build-mcp-sidecar.sh
)
if errorlevel 1 (
  echo [ERROR] solomd-mcp sidecar build failed
  exit /b 1
)

REM -- 3/5 install the frontend dependencies -----------------------------
echo [3/5] pnpm install - app ...
cd /D "%~dp0app"
call pnpm install
if errorlevel 1 (
  echo [ERROR] pnpm install failed
  exit /b 1
)

REM -- 4/5 tauri build (release, msi only) -------------------------------
echo [4/5] pnpm tauri build --bundles msi ...
REM   For the frameless Windows window style - caption bar hidden - append:
REM     --config src-tauri/tauri.windows.conf.json
call pnpm tauri build --bundles msi
if errorlevel 1 (
  echo [ERROR] tauri build failed
  exit /b 1
)

REM -- 5/5 collect the artifacts into local_build_output ----------------
echo [5/5] collecting artifacts into local_build_output ...
cd /D "%~dp0"
if not exist "local_build_output" mkdir "local_build_output"

REM tauri always writes the MSI to target\release\bundle\msi, and its layout is
REM fixed - copy it out so one folder holds everything a build produced.
copy /Y "app\src-tauri\target\release\bundle\msi\*.msi" "local_build_output\" >nul
if errorlevel 1 (
  echo [WARN] MSI copy failed - it is still under app\src-tauri\target\release\bundle\msi
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\package-portable-win.ps1" -Arch "%ARCH%"
if errorlevel 1 (
  echo [WARN] portable zip packaging failed - the MSI above is still good
)

echo.
echo =============================================================
echo   BUILD_DONE
echo   local_build_output\
echo     SoloMD_*.msi                       (installer)
echo     SoloMD_[ver]_%ARCH%-portable.zip   (exe + mcp sidecar + README)
echo.
echo   local_build_output is gitignored - nothing to commit
echo =============================================================
endlocal
