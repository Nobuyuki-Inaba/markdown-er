import type { DdlDialect } from '@shared/DiagramModel';

export type TokenKind = 'word' | 'quoted' | 'string' | 'number' | 'symbol';

export interface Token {
  kind: TokenKind;
  /** The value: unquoted for `quoted` and `string` */
  text: string;
  /** `text` in upper case, for keyword comparison */
  upper: string;
  start: number;
  end: number;
}

export interface LexResult {
  /** One token list per statement */
  statements: Token[][];
  unterminated: boolean;
}

/** Where a backslash escapes the next character in a plain string, and `#` starts a comment */
const MYSQL_SYNTAX: readonly DdlDialect[] = ['mysql'];

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', '0': '\0', Z: '\x1a' };
const WORD_START = /[A-Za-z_@\u0080-￿]/;
const WORD_PART = /[\w$#@\u0080-￿]/;
const CLOSING_QUOTE: Record<string, string> = { '`': '`', '"': '"', '[': ']' };

/** Splits a script into statements of tokens, dropping comments. Never throws: bad input ends as a warning. */
export function lexSql(source: string, dialect: DdlDialect): LexResult {
  const mysql = MYSQL_SYNTAX.includes(dialect);
  const statements: Token[][] = [];
  let current: Token[] = [];
  let unterminated = false;
  let i = source.charCodeAt(0) === 0xfeff ? 1 : 0;

  const push = (kind: TokenKind, text: string, start: number, end: number) => {
    current.push({ kind, text, upper: text.toUpperCase(), start, end });
  };
  const endStatement = () => {
    if (current.length > 0) { statements.push(current); }
    current = [];
  };
  const aloneOnLine = (start: number, end: number) => {
    const lineStart = source.lastIndexOf('\n', start - 1) + 1;
    const newline = source.indexOf('\n', end);
    return source.slice(lineStart, newline < 0 ? source.length : newline).trim().length === end - start;
  };

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (/\s/.test(ch)) { i++; continue; }

    if ((ch === '-' && next === '-') || (ch === '#' && mysql)) {
      const newline = source.indexOf('\n', i);
      i = newline < 0 ? source.length : newline + 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      i = close < 0 ? source.length : close + 2;
      continue;
    }

    if (ch === "'") {
      const previous = current[current.length - 1];
      const escapeString = previous?.end === i && previous.upper === 'E';
      const string = readString(source, i, mysql || escapeString);
      if (string.unterminated) { unterminated = true; }
      push('string', string.text, i, string.index);
      i = string.index;
      continue;
    }

    if (ch === '$') {
      const tag = source.slice(i, i + 64).match(/^\$[A-Za-z_]*\$/)?.[0];
      if (tag) {
        const close = source.indexOf(tag, i + tag.length);
        if (close < 0) { unterminated = true; }
        const stop = close < 0 ? source.length : close;
        const end = close < 0 ? stop : stop + tag.length;
        push('string', source.slice(i + tag.length, stop), i, end);
        i = end;
        continue;
      }
    }

    if (ch === '`' || ch === '"' || (ch === '[' && startsBracketName(source, i, current[current.length - 1]))) {
      const quote = CLOSING_QUOTE[ch];
      let text = '';
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === quote) {
          if (source[j + 1] !== quote) { break; }
          j++;
        }
        text += source[j++];
      }
      if (j >= source.length) { unterminated = true; }
      push('quoted', text, i, Math.min(j + 1, source.length));
      i = j + 1;
      continue;
    }

    if (/\d/.test(ch) || (ch === '.' && next !== undefined && /\d/.test(next))) {
      const hex = /^0x/i.test(source.slice(i, i + 2));
      let j = i + 1;
      while (j < source.length && (/[\w.]/.test(source[j]) || (!hex && /[+-]/.test(source[j]) && /[eE]/.test(source[j - 1])))) { j++; }
      push('number', source.slice(i, j), i, j);
      i = j;
      continue;
    }

    if (WORD_START.test(ch)) {
      let j = i + 1;
      while (j < source.length && WORD_PART.test(source[j])) { j++; }
      const word = source.slice(i, j);
      // Batch separator
      if (word.toUpperCase() === 'GO' && aloneOnLine(i, j)) {
        endStatement();
      } else {
        push('word', word, i, j);
      }
      i = j;
      continue;
    }

    if (ch === ';' || (ch === '/' && aloneOnLine(i, i + 1))) {
      const isCopy = ch === ';' && current[0]?.upper === 'COPY' && current.some((t) => t.upper === 'STDIN');
      endStatement();
      i++;
      if (isCopy) {
        // The rows that follow are tab-separated text, not SQL
        const close = source.indexOf('\n\\.', i);
        i = close < 0 ? source.length : close + 3;
      }
      continue;
    }

    if (ch === ':' && next === ':') {
      push('symbol', '::', i, i + 2);
      i += 2;
      continue;
    }
    push('symbol', ch, i, i + 1);
    i++;
  }
  endStatement();
  return { statements, unterminated };
}

function readString(source: string, start: number, backslash: boolean): { text: string; index: number; unterminated: boolean } {
  let text = '';
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\' && backslash && i + 1 < source.length) {
      const escaped = source[i + 1];
      text += ESCAPES[escaped] ?? escaped;
      i += 2;
    } else if (ch === "'") {
      if (source[i + 1] !== "'") { return { text, index: i + 1, unterminated: false }; }
      text += "'";
      i += 2;
    } else {
      text += ch;
      i++;
    }
  }
  return { text, index: source.length, unterminated: true };
}

/** `[name]` (SQL Server), not an array subscript such as `ARRAY[1]` or `text[]` */
function startsBracketName(source: string, i: number, previous: Token | undefined): boolean {
  if (previous?.end === i && previous.kind === 'word') { return false; }
  const close = source.indexOf(']', i);
  return close > i + 1 && !source.slice(i, close).includes('\n');
}
