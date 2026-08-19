#!/usr/bin/env bash
# Fetch the latest lexer sources from the main ClickHouse repository into upstream/.
#
# Exits with:
#   0 - upstream/ updated, and the lexer sources CHANGED since the last sync
#   2 - upstream/ updated, no changes to the lexer sources (only COMMIT may differ)
#   1 - error
#
# The change detection intentionally ignores upstream/COMMIT: the recorded master
# commit advances daily, but a release is only warranted when the lexer itself changed.

set -euo pipefail
cd "$(dirname "$0")/.."

UPSTREAM_RAW="https://raw.githubusercontent.com/ClickHouse/ClickHouse/master"
FILES=(Lexer.cpp Lexer.h LexerStandalone.h clickhouse_lexer.h)

for f in "${FILES[@]}"; do
    curl -sSf "$UPSTREAM_RAW/src/Parsers/$f" -o "upstream/$f"
done

curl -sSf https://api.github.com/repos/ClickHouse/ClickHouse/commits/master \
    | python3 -c 'import json,sys; print(json.load(sys.stdin)["sha"])' > upstream/COMMIT

echo "Synced from ClickHouse master commit $(cat upstream/COMMIT)"

if git diff --quiet -- $(printf 'upstream/%s ' "${FILES[@]}"); then
    echo "Lexer sources are unchanged."
    exit 2
fi

echo "Lexer sources changed:"
git --no-pager diff --stat -- upstream/
