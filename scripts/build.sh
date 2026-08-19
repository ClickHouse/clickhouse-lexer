#!/usr/bin/env bash
# Compile the vendored ClickHouse lexer sources to lexer.wasm.
#
# This is the same command as the `lexer_wasm` CMake target in the main ClickHouse
# repository (src/Parsers/CMakeLists.txt), which ClickHouse CI runs to guarantee the
# lexer keeps compiling to WebAssembly. Requires clang and wasm-ld (the lld package).

set -euo pipefail
cd "$(dirname "$0")/.."

CXX="${CXX:-clang++}"

# The sources include each other as <Parsers/...>, so present upstream/ under that name.
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT
mkdir "$BUILD_DIR/Parsers"
cp upstream/Lexer.cpp upstream/Lexer.h upstream/LexerStandalone.h upstream/clickhouse_lexer.h "$BUILD_DIR/Parsers/"

"$CXX" \
    -Os -fno-exceptions -fno-rtti -DLEXER_STANDALONE_BUILD --target=wasm32 -flto -nostdlib \
    -I"$BUILD_DIR" \
    -Wl,--no-entry -Wl,--export-all \
    "$BUILD_DIR/Parsers/Lexer.cpp" \
    -o lexer.wasm

ls -la lexer.wasm
