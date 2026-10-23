#!/bin/zsh
# Downloads the llama.cpp release that supports Flint into resources/bin for bundling.
set -e
TAG="${LLAMA_TAG:-b11829}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/resources/bin"; mkdir -p "$OUT"
TMP="$(mktemp -d)"
case "${1:-$(uname -s)}" in
  Darwin|mac) ASSET="llama-$TAG-bin-macos-arm64.tar.gz" ;;
  win|Windows*) ASSET="llama-$TAG-bin-win-cpu-x64.zip" ;;
  *) echo "usage: $0 [mac|win]"; exit 1 ;;
esac
echo "fetching $ASSET"
curl -sL -o "$TMP/$ASSET" "https://github.com/ggml-org/llama.cpp/releases/download/$TAG/$ASSET"
cd "$TMP"
if [[ "$ASSET" == *.zip ]]; then unzip -q "$ASSET"; else tar xzf "$ASSET"; fi
SRC="$(find . -type f \( -name 'llama-server' -o -name 'llama-server.exe' \) | head -1 | xargs dirname)"
cp "$SRC"/llama-server* "$OUT"/ 2>/dev/null || true
cp "$SRC"/*.dylib "$OUT"/ 2>/dev/null || true
cp "$SRC"/*.dll "$OUT"/ 2>/dev/null || true
rm -rf "$TMP"
ls -la "$OUT" | head; echo done
