#!/usr/bin/env bash
#
# build-local.sh — 本地一键编译：按当前系统自动选择目标，产出对应安装包。
#
#   macOS（含 Apple Silicon 交叉编译）  → Intel 版 .dmg（x86_64-apple-darwin，无签名/公证）
#   Windows（Git Bash / MSYS2）        → x64 .msi（x86_64-pc-windows-msvc）
#   Linux（兜底）                      → .deb / .AppImage
#
# 用法（仓库根目录或任意目录执行均可）：
#   bash scripts/build-local.sh
#
# 环境变量：
#   SOLOMD_MAC_TARGET   覆盖 macOS 目标三元组（默认 x86_64-apple-darwin，即 Intel 版；
#                       设为 aarch64-apple-darwin 则出 Apple Silicon 版）
#   SOLOMD_SKIP_INSTALL=1   跳过 pnpm install（依赖已装好时加速）
#
# 与 CI（release.yml）相同的两个关键点：
#   1. Tauri 的 build.rs 在「编译期」校验 externalBin 存在，所以 sidecar
#      (solomd-mcp) 必须在 cargo build 之前按目标三元组预构建好；
#   2. beforeBundleCommand 会按 host 三元组再构建一次 sidecar，但它只写
#      host 命名的文件，不会覆盖我们预构建的 target 命名文件。
#
# 产物路径会在结束时打印。macOS 出的是未签名包：本机直接可用；拷给别人的
# 机器首次打开需右键 → 打开（Gatekeeper 对未签名 dmg 的常规限制）。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# 0. 工具链自检
# ---------------------------------------------------------------------------
need() { command -v "$1" >/dev/null 2>&1 || { echo "缺少 $1 — 请先安装：$2" >&2; exit 1; }; }
need node "https://nodejs.org"
if command -v pnpm >/dev/null 2>&1; then PNPM=pnpm; else
    need corepack "npm i -g corepack"; PNPM="corepack pnpm"
fi
need cargo "https://rustup.rs"
need rustup "https://rustup.rs"

VERSION=$(node -p "require('./app/package.json').version")

# ---------------------------------------------------------------------------
# 1. 识别系统，决定目标三元组与 bundle 类型
# ---------------------------------------------------------------------------
UNAME="$(uname -s)"
TARGET=""   # 空 = 用 host 三元组
BUNDLES=""

case "$UNAME" in
    Darwin)
        TARGET="${SOLOMD_MAC_TARGET:-x86_64-apple-darwin}"   # 默认 Intel 版
        BUNDLES="dmg"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        TARGET="x86_64-pc-windows-msvc"
        BUNDLES="msi"
        ;;
    Linux)
        TARGET=""        # Linux 直接用 host
        BUNDLES="deb,appimage"
        ;;
    *)
        echo "未识别的系统: $UNAME" >&2; exit 1 ;;
esac

echo "==> SoloMD v${VERSION} — 系统 ${UNAME}，目标 ${TARGET:-host}，bundle: ${BUNDLES}"

# 交叉目标不存在时自动补装
if [ -n "$TARGET" ]; then
    if ! rustup target list --installed | grep -qx "$TARGET"; then
        echo "==> rustup target add $TARGET"
        rustup target add "$TARGET"
    fi
fi

# ---------------------------------------------------------------------------
# 2. 前端依赖（CI 同款 frozen-lockfile）
# ---------------------------------------------------------------------------
if [ "${SOLOMD_SKIP_INSTALL:-0}" != "1" ] || [ ! -d app/node_modules ]; then
    echo "==> 安装前端依赖"
    (cd app && $PNPM install --frozen-lockfile)
fi

# ---------------------------------------------------------------------------
# 3. 预构建 MCP sidecar（必须在 tauri build 之前，理由见文件头注释 1）
# ---------------------------------------------------------------------------
SIDECAR_TARGET="$TARGET"
if [ -z "$SIDECAR_TARGET" ]; then
    SIDECAR_TARGET="$(rustc -vV | sed -n 's/^host: //p')"
fi
echo "==> 构建 solomd-mcp sidecar ($SIDECAR_TARGET)"
bash scripts/build-mcp-sidecar.sh "$SIDECAR_TARGET"

# ---------------------------------------------------------------------------
# 4. tauri build
# ---------------------------------------------------------------------------
echo "==> tauri build (--bundles $BUNDLES)"
if [ -n "$TARGET" ]; then
    (cd app && $PNPM tauri build --target "$TARGET" --bundles "$BUNDLES")
else
    (cd app && $PNPM tauri build --bundles "$BUNDLES")
fi

# ---------------------------------------------------------------------------
# 5. 定位并打印产物
# ---------------------------------------------------------------------------
BUNDLE_ROOT="app/src-tauri/target/${TARGET:-$(rustc -vV | sed -n 's/^host: //p')}/release/bundle"
echo ""
echo "=============================================================="
echo "  SoloMD v${VERSION} 本地构建完成"
echo "=============================================================="
FOUND=0
for pat in "$BUNDLE_ROOT/dmg/*.dmg" "$BUNDLE_ROOT/msi/*.msi" "$BUNDLE_ROOT/deb/*.deb" "$BUNDLE_ROOT/appimage/*.AppImage"; do
    for f in $pat; do
        [ -f "$f" ] || continue
        echo "  产物: $REPO_ROOT/$f  ($(du -h "$f" | cut -f1))"
        FOUND=1
    done
done
if [ "$FOUND" = 0 ]; then
    echo "  未找到预期产物，请检查 $BUNDLE_ROOT 下各目录" >&2
    exit 1
fi
