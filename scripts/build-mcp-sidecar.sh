#!/usr/bin/env bash
#
# build-mcp-sidecar.sh — v2.4
#
# Builds the `solomd-mcp` crate (./mcp-server) for the current Rust target
# and copies the resulting binary into `app/src-tauri/binaries/` under the
# Tauri "externalBin" naming convention:
#
#     binaries/solomd-mcp-<rust-target-triple>[.exe]
#
# This is the file Tauri's bundler picks up when it sees
# `bundle.externalBin: ["binaries/solomd-mcp"]` in tauri.conf.json. It gets
# embedded inside the .app/.exe/.AppImage and dropped next to the main
# executable at install time, so we always ship a matched MCP server with
# every desktop release.
#
# Usage:
#     scripts/build-mcp-sidecar.sh              # current host target
#     scripts/build-mcp-sidecar.sh aarch64-apple-darwin
#
# Called automatically by `pnpm tauri build` via `beforeBundleCommand` in
# tauri.conf.json. Also called per-target in .github/workflows/release.yml
# so each release-asset tarball mirrors the bundled sidecar exactly.

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve repo paths regardless of CWD (CI runs from app/, devs run from .)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# Windows: rustc spawns `link.exe` by bare name and lets PATH pick which one it
# gets. This script always runs under Git Bash, and Git Bash puts its own
# /usr/bin - which ships coreutils' link.exe, a two-argument hardlink utility -
# in front of the Windows PATH that vcvars64.bat prepared. The linker is then
# invoked with cargo's argument list and dies with
#     link: extra operand '...rcgu.o'
# vcvars64.bat exports VCToolsInstallDir, so put the MSVC toolchain back at the
# front of PATH. No-op on macOS / Linux, and inside a plain cmd call too.
# ---------------------------------------------------------------------------
if [[ -n "${VCToolsInstallDir:-}" ]] && command -v cygpath >/dev/null 2>&1; then
    case "$(uname -m)" in
        aarch64|arm64) MSVC_HOST_DIR="Hostarm64/arm64" ;;
        *)             MSVC_HOST_DIR="Hostx64/x64"    ;;
    esac
    MSVC_BIN="$(cygpath -u "${VCToolsInstallDir%/}")/bin/$MSVC_HOST_DIR"
    if [[ -d "$MSVC_BIN" ]]; then
        export PATH="$MSVC_BIN:$PATH"
    fi
fi

MCP_CRATE="$REPO_ROOT/mcp-server"
OUT_DIR="$REPO_ROOT/app/src-tauri/binaries"

# ---------------------------------------------------------------------------
# Determine target triple. If the caller passed one explicitly, use it.
# Otherwise ask rustc for the host triple.
# ---------------------------------------------------------------------------
TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
    TARGET="$(rustc -vV | sed -n 's/^host: //p')"
fi
if [[ -z "$TARGET" ]]; then
    echo "build-mcp-sidecar: could not determine rust target triple" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Build (release profile from mcp-server/Cargo.toml — opt-level z + LTO).
# ---------------------------------------------------------------------------
echo "build-mcp-sidecar: building solomd-mcp for $TARGET"
(
    cd "$MCP_CRATE"
    cargo build --release --target "$TARGET"
)

# Pick the right extension.
EXE=""
case "$TARGET" in
    *windows*) EXE=".exe" ;;
esac

SRC_BIN="$MCP_CRATE/target/$TARGET/release/solomd-mcp$EXE"
if [[ ! -f "$SRC_BIN" ]]; then
    echo "build-mcp-sidecar: expected $SRC_BIN but it doesn't exist" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Copy into Tauri's externalBin staging dir, named per Tauri's convention
# (`<base>-<triple>[.exe]`). Tauri's bundler will rename it back to
# `solomd-mcp` at install time.
# ---------------------------------------------------------------------------
mkdir -p "$OUT_DIR"
DEST="$OUT_DIR/solomd-mcp-$TARGET$EXE"
cp -f "$SRC_BIN" "$DEST"
chmod +x "$DEST"

echo "build-mcp-sidecar: -> $DEST"
