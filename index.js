// ClickHouse SQL lexer (src/Parsers/Lexer.cpp in ClickHouse/ClickHouse) compiled to
// WebAssembly, with a small JavaScript wrapper. The same lexer that powers syntax
// highlighting in the ClickHouse Web UI (play.html) and the ClickHouse documentation.

import LEXER_WASM_BASE64 from "./lexer-wasm-base64.js"
import {TokenType} from "./tokens.js"

export {TokenType, TOKEN_NAMES} from "./tokens.js"

let lexerExports = null
let loadPromise = null

/// Whether the WASM module is instantiated (i.e. tokenizeSync can be called).
export function lexerIsLoaded() {
    return lexerExports !== null
}

/// Instantiate the embedded WASM module. Idempotent; concurrent calls share one
/// instantiation. A failed instantiation can be retried by calling again.
export function loadLexer() {
    if (!loadPromise) {
        loadPromise = (async () => {
            const binary = atob(LEXER_WASM_BASE64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++)
                bytes[i] = binary.charCodeAt(i)
            const module = await WebAssembly.instantiate(bytes)
            lexerExports = module.instance.exports
        })()
        loadPromise.catch(() => { loadPromise = null })
    }
    return loadPromise
}

/// Tokenize a query. Loads the lexer on first use.
export async function tokenize(query, options) {
    await loadLexer()
    return tokenizeSync(query, options)
}

/// The synchronous core of `tokenize`; requires `loadLexer()` to have resolved.
///
/// Returns an array of {type, text, begin, end} covering the input from the start:
/// every byte of the query up to `end` of the last token belongs to exactly one token
/// (whitespace and comments included). `begin`/`end` are BYTE offsets into the UTF-8
/// encoding of the query; `text` is the decoded token. When the lexer encounters
/// something it cannot lex, the last returned token is an error token (check with
/// `isError(token.type)`) and the rest of the input is left uncovered.
///
/// `maxQuerySize` limits how far the lexer looks (0 = unlimited, the default; when
/// exceeded, lexing ends with an ErrorMaxQuerySizeExceeded token).
export function tokenizeSync(query, {maxQuerySize = 0} = {}) {
    if (!lexerExports)
        throw new Error("The lexer is not loaded; await loadLexer() first")
    const exports = lexerExports

    // Lay out the buffers this function owns (the lexer object, the query bytes and
    // the two token out-pointers) starting at __heap_base, NOT at offset 0: the
    // module's own shadow stack occupies the low memory up to __heap_base and its
    // call frames grow DOWN from there, so a buffer placed below that boundary is
    // silently overwritten by the lexer's own calls once the query is large enough
    // to reach the frame region (~64 KiB).
    const bytes = new TextEncoder().encode(query)
    let offset = exports.__heap_base.value

    const lexer = offset
    offset += exports.clickhouse_lexer_size.value

    const queryBegin = offset
    offset += bytes.length
    const queryEnd = offset

    const tokenBegin = offset
    offset += 4
    const tokenEnd = offset
    offset += 4

    // Growing detaches the previous ArrayBuffer, so read `buffer` only after this.
    if (offset > exports.memory.buffer.byteLength)
        exports.memory.grow(Math.ceil((offset - exports.memory.buffer.byteLength) / 65536))
    const buffer = exports.memory.buffer

    new Uint8Array(buffer, queryBegin, bytes.length).set(bytes)
    exports.clickhouse_lexer_create(lexer, queryBegin, queryEnd, maxQuerySize)

    const view = new DataView(buffer)
    const decoder = new TextDecoder()
    const result = []
    let previousEnd = queryBegin

    for (;;) {
        const type = exports.clickhouse_lexer_next_token(lexer, tokenBegin, tokenEnd)
        if (exports.clickhouse_lexer_token_is_end(type))
            break

        const begin = view.getUint32(tokenBegin, true)
        const end = view.getUint32(tokenEnd, true)

        if (exports.clickhouse_lexer_token_is_error(type)) {
            // Emit the error token (its range points at the problematic input, when
            // the lexer provides one) and stop: the rest of the input is not lexable.
            result.push({
                type,
                text: end > begin ? decoder.decode(new Uint8Array(buffer, begin, end - begin)) : "",
                begin: begin - queryBegin,
                end: end - queryBegin,
            })
            break
        }

        // Non-error tokens tile the input contiguously, so every token must advance.
        // One that does not means the lexer state is corrupted; throw instead of
        // looping forever.
        if (end <= previousEnd)
            throw new Error(`Lexer stopped advancing at byte ${end - queryBegin} of ${bytes.length}`)
        previousEnd = end

        result.push({
            type,
            text: decoder.decode(new Uint8Array(buffer, begin, end - begin)),
            begin: begin - queryBegin,
            end: end - queryBegin,
        })
    }

    return result
}

/// Whether a token type is significant (not whitespace and not a comment).
export function isSignificant(type) {
    return type !== TokenType.Whitespace && type !== TokenType.Comment
}

/// Whether a token type is one of the error types.
export function isError(type) {
    return type > TokenType.EndOfStream
}
