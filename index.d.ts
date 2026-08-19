/** A single token produced by the lexer. */
export interface Token {
    /** Numeric token type; the names are in {@link TokenType}. */
    type: number
    /** The decoded token text. */
    text: string
    /** Byte offset (into the UTF-8 encoding of the query) where the token starts. */
    begin: number
    /** Byte offset (into the UTF-8 encoding of the query) where the token ends. */
    end: number
}

export interface TokenizeOptions {
    /** Byte limit for the lexer; 0 (the default) means unlimited. */
    maxQuerySize?: number
}

/**
 * Numeric values of the TokenType enum in ClickHouse's src/Parsers/Lexer.h
 * (Whitespace, Comment, BareWord, Number, StringLiteral, QuotedIdentifier, brackets,
 * operators, EndOfStream, Error*...). Generated from the same ClickHouse revision the
 * WASM is built from, because the values are positional.
 */
export const TokenType: Readonly<Record<string, number>>

/** Token type names by numeric value. */
export const TOKEN_NAMES: readonly string[]

/** Whether the WASM module is instantiated (i.e. tokenizeSync can be called). */
export function lexerIsLoaded(): boolean

/** Instantiate the embedded WASM module. Idempotent. */
export function loadLexer(): Promise<void>

/** Tokenize a query. Loads the lexer on first use. */
export function tokenize(query: string, options?: TokenizeOptions): Promise<Token[]>

/** Synchronous tokenization; requires `loadLexer()` to have resolved. */
export function tokenizeSync(query: string, options?: TokenizeOptions): Token[]

/** Whether a token type is significant (not whitespace and not a comment). */
export function isSignificant(type: number): boolean

/** Whether a token type is one of the error types. */
export function isError(type: number): boolean
