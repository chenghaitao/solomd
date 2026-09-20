# package-portable-win.ps1 — 把 tauri build 产物打包成免安装便携 zip
# 由 build.bat 第 5 步调用: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\package-portable-win.ps1 -Arch x64
# 产物: SoloMD_<ver>_<arch>-portable.zip  (SoloMD.exe + solomd-mcp.exe + README.txt), 位于仓库根目录

param(
  [string]$Arch = "x64",
  [string]$RepoRoot = ""
)

$ErrorActionPreference = 'Stop'

# 取仓库根: 优先用参数, 否则用本脚本所在目录的父目录 (<repo>/scripts -> <repo>)
if (-not $RepoRoot) {
  $ScriptFile = $MyInvocation.MyCommand.Path
  $ScriptDir  = Split-Path -Parent $ScriptFile
  $RepoRoot   = Split-Path -Parent $ScriptDir
}

$Exe    = "$RepoRoot\app\src-tauri\target\release\SoloMD.exe"
$PkgJson = "$RepoRoot\app\package.json"
$McpBase = "$RepoRoot\mcp-server\target"

if (-not (Test-Path $Exe)) {
  Write-Error "Missing $Exe — tauri build did not produce it"
  exit 1
}

$ver = (Get-Content $PkgJson -Raw | ConvertFrom-Json).version

$Mcp = Get-ChildItem -Path $McpBase -Recurse -Filter 'solomd-mcp.exe' |
       Where-Object { $_.FullName -match '[\\/]release[\\/]' } |
       Select-Object -First 1

$Stage = Join-Path $RepoRoot "SoloMD_${ver}_${Arch}-portable"
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Stage | Out-Null

Copy-Item $Exe (Join-Path $Stage 'SoloMD.exe')
if ($Mcp) { Copy-Item $Mcp.FullName (Join-Path $Stage 'solomd-mcp.exe') }

Set-Content -Path (Join-Path $Stage 'README.txt') -Encoding UTF8 -Value @"
SoloMD $ver portable ($Arch)

Just run SoloMD.exe. No installation required.
Settings + recents are stored in %APPDATA%\app.solomd as usual.

Requires Microsoft Edge WebView2 (preinstalled on Windows 10/11).
If launch fails with a WebView2 missing error, install from
https://go.microsoft.com/fwlink/p/?LinkId=2124703
"@

$Zip = Join-Path $RepoRoot "SoloMD_${ver}_${Arch}-portable.zip"
if (Test-Path $Zip) { Remove-Item $Zip -Force }
Compress-Archive -Path "$Stage\*" -DestinationPath $Zip -Force

Write-Host "PORTABLE_ZIP=$Zip"
