# ClickHouse SQL Lexer

[![NPM version](https://img.shields.io/npm/v/@clickhouse/lexer.svg)](https://www.npmjs.org/package/@clickhouse/lexer)

The **actual SQL lexer of ClickHouse** ([`src/Parsers/Lexer.cpp`](https://github.com/ClickHouse/ClickHouse/blob/master/src/Parsers/Lexer.cpp)) compiled to WebAssembly: ~9 KB, no dependencies, works in browsers and in Node.js. Because it is the exact code the server uses, it tokenizes every corner of ClickHouse SQL correctly — nested `/* */` comments, `$heredoc$` strings, backtick and double-quote identifiers, `0x`/`0b` literals, `\G`, `|>`, and whatever gets added next.

This is the same module that powers syntax highlighting in the [ClickHouse Web UI](https://github.com/ClickHouse/ClickHouse/blob/master/programs/server/play.html) (`play.html`) and the ClickHouse documentation. A GitHub Action syncs this repository from ClickHouse `master` daily and publishes a release whenever the lexer changes.

## Installation

```sh
npm install @clickhouse/lexer
```

## Usage

```js
import {tokenize, TokenType, TOKEN_NAMES, isSignificant, isError} from "@clickhouse/lexer"

const tokens = await tokenize("SELECT count() FROM `events` WHERE user != 'guest' -- filter")

for (const token of tokens)
    console.log(TOKEN_NAMES[token.type], JSON.stringify(token.text))
// BareWord "SELECT"
// Whitespace " "
// BareWord "count"
// OpeningRoundBracket "("
// ...
// StringLiteral "'guest'"
// Whitespace " "
// Comment "-- filter"

// Only keywords/identifiers/literals/operators, no whitespace and comments:
tokens.filter(t => isSignificant(t.type))

// The lexer stops at unlexable input and reports what went wrong:
const bad = await tokenize("SELECT 'unterminated")
isError(bad.at(-1).type) // true
TOKEN_NAMES[bad.at(-1).type] // "ErrorSingleQuoteIsNotClosed"
```

Each token is `{type, text, begin, end}`. Tokens tile the input from the start — every byte belongs to exactly one token (whitespace and comments included), which is exactly what you want for syntax highlighting. `begin`/`end` are byte offsets into the UTF-8 encoding of the query; `text` is the decoded token.

In the browser it works the same way — the WASM is embedded as base64, so there is nothing to configure in any bundler:

```html
<script type="module">
import {tokenize} from "https://esm.sh/@clickhouse/lexer"
console.log(await tokenize("SELECT 1"))
</script>
```

For hot paths, load once and tokenize synchronously:

```js
import {loadLexer, tokenizeSync} from "@clickhouse/lexer"

await loadLexer()
const tokens = tokenizeSync(query) // no await, e.g. inside an editor's render path
```

### API

| Export | Description |
|---|---|
| `tokenize(query, options?)` | `Promise<Token[]>`; loads the lexer on first use. |
| `loadLexer()` | Instantiate the WASM module (idempotent). |
| `tokenizeSync(query, options?)` | Synchronous tokenization after `loadLexer()`. |
| `lexerIsLoaded()` | Whether `tokenizeSync` can be called. |
| `TokenType` | Name → numeric type (`TokenType.StringLiteral`...). |
| `TOKEN_NAMES` | Numeric type → name. |
| `isSignificant(type)` | Not whitespace and not a comment. |
| `isError(type)` | One of the `Error*` types. |
| `options.maxQuerySize` | Byte limit for the lexer; `0` (default) = unlimited. |

**Important:** token type values are positional — they mirror the `TokenType` enum in `src/Parsers/Lexer.h`, and inserting a token type renumbers everything after it (this has happened). Always compare against `TokenType.*` from this package, never against hard-coded numbers, and never mix the token table of one version with the WASM of another. Each release of this package pairs both from the same ClickHouse revision (recorded in [`upstream/COMMIT`](upstream/COMMIT)).

### Using the raw WASM (non-JavaScript hosts)

The package also ships the plain binary as `@clickhouse/lexer/lexer.wasm` for use from any WASM runtime. The C ABI (see [`upstream/clickhouse_lexer.h`](upstream/clickhouse_lexer.h)):

```c
extern size_t clickhouse_lexer_size; // size of the lexer state object
void clickhouse_lexer_create(void * ptr, const char * begin, const char * end, size_t max_query_size);
unsigned char clickhouse_lexer_next_token(void * ptr, const char ** out_token_begin, const char ** out_token_end);
int clickhouse_lexer_token_is_significant(unsigned char token);
int clickhouse_lexer_token_is_error(unsigned char token);
int clickhouse_lexer_token_is_end(unsigned char token);
```

Place your buffers (the lexer state, the query bytes, and the two out-pointers) at `__heap_base` or above — the module's shadow stack occupies the memory below it and grows down, so lower buffers get corrupted on large queries. Call `clickhouse_lexer_next_token` in a loop until `is_end` or `is_error`. `index.js` in this package is a complete reference implementation.

## How this repository is synced

The lexer sources live in [`upstream/`](upstream/), copied verbatim from `src/Parsers` of [ClickHouse/ClickHouse](https://github.com/ClickHouse/ClickHouse) (`Lexer.cpp`, `Lexer.h`, `LexerStandalone.h`, `clickhouse_lexer.h`); `upstream/COMMIT` records the master commit they came from.

The [Sync workflow](.github/workflows/sync.yml) runs daily:

1. `scripts/sync.sh` — fetches the latest sources from ClickHouse master; stops if nothing changed.
2. `scripts/build.sh` — compiles `lexer.wasm` with clang (`--target=wasm32 -nostdlib`, the same command as the `lexer_wasm` CMake target in the main repository).
3. `scripts/generate.js` — regenerates `lexer-wasm-base64.js` and `tokens.js` (the token table is parsed from `Lexer.h`, keeping the numbering in lockstep with the binary).
4. Runs the tests, commits, bumps the patch version, creates a GitHub release, and publishes to npm.

## Rebuilding manually

Requirements: `clang`, `lld` (for `wasm-ld`) and Node.js ≥ 18.

```sh
npm run sync   # pull the latest lexer sources from ClickHouse master into upstream/
npm run build  # compile lexer.wasm and regenerate the derived JS modules
npm test
```

Equivalently, from a checkout of the main ClickHouse repository, the standalone lexer build is:

```sh
clang++ -Os -fno-exceptions -fno-rtti -DLEXER_STANDALONE_BUILD --target=wasm32 -flto -nostdlib \
    -I src -Wl,--no-entry -Wl,--export-all \
    src/Parsers/Lexer.cpp -o Lexer.wasm
```

which is what the `lexer_wasm` CMake target produces at `build/src/Parsers/Lexer.wasm` when configured with `-DENABLE_LEXER_TEST=1`.

## License

[Apache License 2.0](LICENSE), same as ClickHouse. The `upstream/` sources are verbatim copies from the ClickHouse repository and remain © ClickHouse, Inc.
