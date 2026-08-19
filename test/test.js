import test from "node:test"
import assert from "node:assert/strict"
import {loadLexer, tokenize, tokenizeSync, lexerIsLoaded, isSignificant, isError, TokenType, TOKEN_NAMES} from "../index.js"

test("token table looks sane", () => {
    assert.equal(TokenType.Whitespace, 0)
    assert.equal(TokenType.Comment, 1)
    assert.equal(TokenType.BareWord, 2)
    assert.ok(TokenType.EndOfStream > TokenType.DoubleAt)
    assert.ok(TokenType.Error > TokenType.EndOfStream)
    assert.equal(TOKEN_NAMES[TokenType.StringLiteral], "StringLiteral")
})

test("tokenizes a basic query", async () => {
    const tokens = await tokenize("SELECT 1 AS x FROM `t` WHERE s = 'v' -- c")
    assert.ok(lexerIsLoaded())
    const significant = tokens.filter(t => isSignificant(t.type))
    assert.deepEqual(
        significant.map(t => [TOKEN_NAMES[t.type], t.text]),
        [
            ["BareWord", "SELECT"],
            ["Number", "1"],
            ["BareWord", "AS"],
            ["BareWord", "x"],
            ["BareWord", "FROM"],
            ["QuotedIdentifier", "`t`"],
            ["BareWord", "WHERE"],
            ["BareWord", "s"],
            ["Equals", "="],
            ["StringLiteral", "'v'"],
        ],
    )
    assert.equal(TOKEN_NAMES[tokens[tokens.length - 1].type], "Comment")
})

test("tokens tile the input with byte offsets", async () => {
    const query = "SELECT 'привет', [1, 2], f(x)\n-- комментарий"
    const tokens = await tokenize(query)
    const bytes = new TextEncoder().encode(query)
    let offset = 0
    for (const t of tokens) {
        assert.equal(t.begin, offset)
        assert.equal(new TextDecoder().decode(bytes.subarray(t.begin, t.end)), t.text)
        offset = t.end
    }
    assert.equal(offset, bytes.length)
})

test("reports an error token for unlexable input", async () => {
    const tokens = await tokenize("SELECT 'unterminated")
    const last = tokens[tokens.length - 1]
    assert.ok(isError(last.type))
    assert.equal(TOKEN_NAMES[last.type], "ErrorSingleQuoteIsNotClosed")
})

test("respects maxQuerySize", async () => {
    await loadLexer()
    const tokens = tokenizeSync("SELECT 11111", {maxQuerySize: 3})
    assert.ok(isError(tokens[tokens.length - 1].type))
})

test("handles queries larger than the initial memory", async () => {
    const query = "SELECT 1 + 2;\n".repeat(20000) // ~280 KB, past the 64 KiB stack region
    const tokens = await tokenize(query)
    assert.ok(!isError(tokens[tokens.length - 1].type))
    assert.equal(tokens[tokens.length - 1].end, new TextEncoder().encode(query).length)
})

test("operators get distinct types", async () => {
    const tokens = await tokenize("a || b -> c :: d")
    const ops = tokens.filter(t => isSignificant(t.type) && t.type !== TokenType.BareWord)
    assert.deepEqual(ops.map(t => TOKEN_NAMES[t.type]), ["Concatenation", "Arrow", "DoubleColon"])
})
