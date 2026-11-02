@echo off
rem build-local.cmd — Windows 下双击或从 CMD/PowerShell 调用的本地编译入口。
rem 实际逻辑在 scripts/build-local.sh，由 Git for Windows 自带的 bash 执行。
rem 前置条件：Node.js、pnpm/corepack、Rust（rustup，含 MSVC 工具链）、Git Bash。

setlocal
set "SCRIPT_DIR=%~dp0"
where bash >nul 2>nul
if errorlevel 1 (
    echo [build-local] 未找到 bash。请安装 Git for Windows，并确保其 usr\bin 在 PATH 中。 1>&2
    exit /b 1
)
bash "%SCRIPT_DIR%build-local.sh" %*
exit /b %errorlevel%
