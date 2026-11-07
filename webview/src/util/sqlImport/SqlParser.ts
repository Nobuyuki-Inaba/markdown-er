import type { DdlDialect } from '@shared/DiagramModel';
import { lexSql, Token } from './SqlLexer';
import { ResolvedSqlType, resolveSqlType } from './sqlTypes';

export type SqlWarningCode =
  | 'statementSkipped' | 'statementFailed' | 'unterminatedString' | 'copyUnsupported'
  | 'typeApproximated' | 'computedColumn' | 'autoIncrementIgnored'
  | 'tableNotFound' | 'columnNotFound' | 'indexExpression'
  | 'foreignKeyUnresolved' | 'compositeForeignKey' | 'foreignKeyAction'
  | 'rowSkipped' | 'seedExpression';

export interface SqlWarning {
  code: SqlWarningCode;
  subject: string;
}

export interface ParsedColumn {
  name: string;
  /** As written, for messages */
  typeText: string;
  type: ResolvedSqlType;
  notNull: boolean;
  primaryKey: boolean;
  autoIncrement: boolean;
  computed: boolean;
  defaultValue: string | null;
  comment: string;
}

export interface ParsedForeignKey {
  name: string;
  columns: string[];
  parentTable: string;
  /** Empty: the parent's primary key */
  parentColumns: string[];
  /** e.g. `ON DELETE CASCADE`; the diagram has no field for it */
  actions: string;
}

export interface ParsedIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface ParsedValue {
  /** `''` for NULL and DEFAULT, as in seed data */
  value: string;
  /** Not a plain literal: seed data can only keep it as text */
  expression: boolean;
}

export interface ParsedInsert {
  /** Empty: the table's column order */
  columns: string[];
  rows: ParsedValue[][];
}

export interface ParsedTable {
  name: string;
  /** False when only an ALTER, INDEX, COMMENT or INSERT mentions it */
  declared: boolean;
  comment: string;
  columns: ParsedColumn[];
  primaryKey: string[];
  uniques: { name: string; columns: string[] }[];
  checks: { name: string; expression: string }[];
  indexes: ParsedIndex[];
  foreignKeys: ParsedForeignKey[];
  inserts: ParsedInsert[];
}

export interface ParsedSql {
  tables: ParsedTable[];
  warnings: SqlWarning[];
}

/** Scripts carry these around the definitions; they say nothing about the schema */
const IGNORED_STATEMENTS = new Set([
  'SET', 'USE', 'DROP', 'BEGIN', 'COMMIT', 'ROLLBACK', 'START', 'END', 'LOCK', 'UNLOCK', 'GRANT', 'REVOKE',
  'PRAGMA', 'SELECT', 'ANALYZE', 'VACUUM', 'DELIMITER', 'PRINT', 'DECLARE', 'EXEC', 'EXECUTE', 'SHOW', 'FLUSH',
]);
const IGNORED_CREATES = new Set([
  'DATABASE', 'SCHEMA', 'USER', 'ROLE', 'LOGIN', 'EXTENSION', 'SEQUENCE', 'TABLESPACE', 'COLLATION',
]);
const ROUTINES = new Set(['TRIGGER', 'FUNCTION', 'PROCEDURE', 'PACKAGE', 'EVENT']);
const OBJECT_TYPES = new Set(['TABLE', 'INDEX', 'VIEW', 'TYPE', 'MATERIALIZED', 'DOMAIN', 'SYNONYM', ...IGNORED_CREATES, ...ROUTINES]);
/** Words that end a DEFAULT expression */
const COLUMN_KEYWORDS = new Set([
  'NOT', 'NULL', 'PRIMARY', 'UNIQUE', 'KEY', 'CHECK', 'REFERENCES', 'COMMENT', 'COLLATE', 'CONSTRAINT',
  'AUTO_INCREMENT', 'AUTOINCREMENT', 'IDENTITY', 'GENERATED', 'ON', 'CHARACTER', 'CHARSET', 'ENABLE', 'DISABLE',
]);
const FK_ACTION_WORDS = new Set([
  'ON', 'DELETE', 'UPDATE', 'CASCADE', 'RESTRICT', 'NO', 'ACTION', 'SET', 'NULL', 'DEFAULT', 'MATCH', 'FULL',
  'PARTIAL', 'SIMPLE', 'DEFERRABLE', 'INITIALLY', 'DEFERRED', 'IMMEDIATE', 'NOT',
]);
const CONSTRAINT_STARTS = ['PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK'];
const INSERT_MODIFIERS = ['INSERT', 'REPLACE', 'OR', 'IGNORE', 'LOW_PRIORITY', 'HIGH_PRIORITY', 'DELAYED', 'ABORT', 'FAIL', 'ROLLBACK'];
/** ALTER TABLE actions that say nothing about the schema's shape */
const IGNORED_ALTERS = ['OWNER', 'CHECK', 'NOCHECK', 'ENABLE', 'DISABLE', 'CLUSTER', 'REPLICA', 'ATTACH', 'AUTO_INCREMENT', 'ENGINE'];

const excerpt = (source: string, tokens: Token[]) =>
  source.slice(tokens[0].start, tokens[Math.min(tokens.length, 12) - 1].end).replace(/\s+/g, ' ').slice(0, 80);

/** Token stream of one statement */
class Cursor {
  private index = 0;

  constructor(private readonly tokens: Token[], private readonly source: string) {}

  get atEnd(): boolean { return this.index >= this.tokens.length; }
  get position(): number { return this.index; }
  peek(offset = 0): Token | undefined { return this.tokens[this.index + offset]; }

  next(): Token {
    const token = this.tokens[this.index++];
    if (!token) { throw new Error('unexpected end of statement'); }
    return token;
  }

  /** The next tokens are these unquoted words */
  isWords(...words: string[]): boolean {
    return words.every((word, i) => {
      const token = this.peek(i);
      return token?.kind === 'word' && token.upper === word;
    });
  }

  isAnyWord(words: readonly string[]): boolean {
    return words.some((word) => this.isWords(word));
  }

  acceptWords(...words: string[]): boolean {
    if (!this.isWords(...words)) { return false; }
    this.index += words.length;
    return true;
  }

  isSymbol(symbol: string, offset = 0): boolean {
    const token = this.peek(offset);
    return token?.kind === 'symbol' && token.text === symbol;
  }

  acceptSymbol(symbol: string): boolean {
    if (!this.isSymbol(symbol)) { return false; }
    this.index++;
    return true;
  }

  expectSymbol(symbol: string): void {
    if (!this.acceptSymbol(symbol)) { throw new Error(`expected "${symbol}"`); }
  }

  /** `name`, or the last part of `schema.table` */
  name(): string {
    const parts = this.dottedName();
    return parts[parts.length - 1];
  }

  dottedName(): string[] {
    const parts = [this.identifier()];
    while (this.acceptSymbol('.')) { parts.push(this.identifier()); }
    return parts;
  }

  private identifier(): string {
    const token = this.next();
    if (token.kind === 'symbol' || token.kind === 'number') { throw new Error(`unexpected "${token.text}"`); }
    return token.text;
  }

  /** Skips a balanced `( … )` at the cursor and returns its text without the parentheses */
  parenthesized(): string {
    const open = this.next();
    let depth = 1;
    let end = open.end;
    while (depth > 0) {
      const token = this.next();
      if (token.kind === 'symbol' && token.text === '(') { depth++; }
      if (token.kind === 'symbol' && token.text === ')') { depth--; }
      end = token.start;
    }
    return this.source.slice(open.end, end).trim();
  }

  /** Text of the tokens from `from` up to the cursor */
  textSince(from: number): string {
    if (from >= this.index) { return ''; }
    return this.source.slice(this.tokens[from].start, this.tokens[this.index - 1].end).trim();
  }

  tokensSince(from: number): Token[] {
    return this.tokens.slice(from, this.index);
  }

  /** Moves past the current list entry: to the next comma or closing parenthesis at this depth */
  skipEntry(): void {
    while (!this.atEnd && !this.isSymbol(',') && !this.isSymbol(')')) {
      if (this.isSymbol('(')) { this.parenthesized(); } else { this.next(); }
    }
  }

  /** `(a, b(10) ASC, …)`. An entry that isn't a plain column name gives null. */
  columnList(): (string | null)[] {
    this.expectSymbol('(');
    const columns: (string | null)[] = [];
    for (;;) {
      let plain = this.peek()?.kind === 'word' || this.peek()?.kind === 'quoted';
      const name = plain ? this.next().text : '';
      if (this.isSymbol('(')) {
        // `name(10)` is a key prefix length; `lower(name)` is an expression
        plain = /^\d+$/.test(this.parenthesized()) && plain;
      }
      while (!this.atEnd && !this.isSymbol(',') && !this.isSymbol(')')) {
        if (!this.isAnyWord(['ASC', 'DESC', 'NULLS', 'FIRST', 'LAST'])) { plain = false; }
        if (this.isSymbol('(')) { this.parenthesized(); } else { this.next(); }
      }
      columns.push(plain ? name : null);
      if (this.acceptSymbol(')')) { return columns; }
      this.expectSymbol(',');
    }
  }
}

class SqlParser {
  private readonly tables = new Map<string, ParsedTable>();
  private readonly warnings: SqlWarning[] = [];
  /** Inside the body of a routine, which is split at its own semicolons */
  private inRoutine = false;

  constructor(private readonly source: string, private readonly dialect: DdlDialect) {}

  parse(): ParsedSql {
    const { statements, unterminated } = lexSql(this.source, this.dialect);
    if (unterminated) { this.warn('unterminatedString', ''); }
    for (const tokens of statements) {
      try {
        this.statement(tokens);
      } catch (err) {
        this.warn('statementFailed', `${excerpt(this.source, tokens)} (${(err as Error).message})`);
      }
    }
    return { tables: [...this.tables.values()], warnings: this.warnings };
  }

  private warn(code: SqlWarningCode, subject: string) {
    if (!this.warnings.some((w) => w.code === code && w.subject === subject)) {
      this.warnings.push({ code, subject });
    }
  }

  private table(name: string): ParsedTable {
    const key = name.toLowerCase();
    let table = this.tables.get(key);
    if (!table) {
      table = emptyTable(name);
      this.tables.set(key, table);
    }
    return table;
  }

  private statement(tokens: Token[]) {
    if (this.inRoutine) {
      if (tokens[0].upper === 'END' && !['IF', 'LOOP', 'CASE', 'WHILE', 'REPEAT'].includes(tokens[1]?.upper ?? '')) {
        this.inRoutine = false;
      }
      return;
    }
    const cursor = new Cursor(tokens, this.source);
    const head = tokens[0].kind === 'word' ? tokens[0].upper : '';

    if (head === 'CREATE') { return this.create(cursor, tokens); }
    if (head === 'ALTER') { return this.alter(cursor, tokens); }
    if (head === 'INSERT' || head === 'REPLACE') { return this.insert(cursor, tokens); }
    if (head === 'COMMENT') { return this.commentOn(cursor); }
    if (head === 'COPY') { return this.warn('copyUnsupported', excerpt(this.source, tokens)); }
    if (!IGNORED_STATEMENTS.has(head)) { this.warn('statementSkipped', excerpt(this.source, tokens)); }
  }

  // ── CREATE ──────────────────────────────────────────────────────────

  private create(cursor: Cursor, tokens: Token[]) {
    cursor.next();
    let unique = false;
    // OR REPLACE, TEMPORARY, UNIQUE, CLUSTERED, DEFINER=`root`@`%`, …
    while (!OBJECT_TYPES.has(cursor.peek()?.upper ?? '')) {
      if (cursor.next().upper === 'UNIQUE') { unique = true; }
    }
    const kind = cursor.next().upper;
    if (kind === 'TABLE') { return this.createTable(cursor, tokens); }
    if (kind === 'INDEX') { return this.createIndex(cursor, unique); }
    if (IGNORED_CREATES.has(kind)) { return; }
    if (ROUTINES.has(kind) && tokens.some((t) => t.kind === 'word' && t.upper === 'BEGIN')) { this.inRoutine = true; }
    this.warn('statementSkipped', excerpt(this.source, tokens));
  }

  private createTable(cursor: Cursor, tokens: Token[]) {
    cursor.acceptWords('IF', 'NOT', 'EXISTS');
    const name = cursor.name();
    if (!cursor.isSymbol('(')) {
      // CREATE TABLE … AS SELECT / LIKE
      this.warn('statementSkipped', excerpt(this.source, tokens));
      return;
    }
    // Built apart, so a statement that fails halfway leaves nothing behind
    const parsed = emptyTable(name);
    cursor.expectSymbol('(');
    for (;;) {
      this.tableElement(cursor, parsed);
      if (cursor.acceptSymbol(')')) { break; }
      cursor.expectSymbol(',');
    }
    while (!cursor.atEnd) {
      if (cursor.next().upper === 'COMMENT') {
        cursor.acceptSymbol('=');
        parsed.comment = cursor.next().text;
      }
    }
    const table = this.table(name);
    if (!table.declared) { Object.assign(table, parsed, { declared: true, inserts: table.inserts }); }
  }

  private tableElement(cursor: Cursor, table: ParsedTable) {
    const name = this.constraintName(cursor);
    if (this.tableConstraint(cursor, table, name)) { return; }
    if (!this.tableIndex(cursor, table)) { this.column(cursor, table); }
  }

  /** `CONSTRAINT name`; the name is optional in front of a constraint */
  private constraintName(cursor: Cursor): string {
    if (!cursor.acceptWords('CONSTRAINT') || cursor.isAnyWord(CONSTRAINT_STARTS)) { return ''; }
    return cursor.next().text;
  }

  /** PRIMARY KEY / UNIQUE / FOREIGN KEY / CHECK, in CREATE TABLE and in ALTER TABLE ADD */
  private tableConstraint(cursor: Cursor, table: ParsedTable, name: string): boolean {
    if (cursor.acceptWords('PRIMARY', 'KEY')) {
      this.skipKeyOptions(cursor);
      table.primaryKey = this.names(cursor, table);
    } else if (cursor.acceptWords('UNIQUE')) {
      if (cursor.isAnyWord(['KEY', 'INDEX'])) { cursor.next(); }
      this.skipKeyOptions(cursor);
      const indexName = cursor.isSymbol('(') ? name : cursor.next().text;
      this.skipKeyOptions(cursor);
      table.uniques.push({ name: indexName, columns: this.names(cursor, table) });
    } else if (cursor.acceptWords('FOREIGN', 'KEY')) {
      const indexName = cursor.isSymbol('(') ? name : cursor.next().text;
      const columns = this.names(cursor, table);
      if (!cursor.acceptWords('REFERENCES')) { throw new Error('expected REFERENCES'); }
      table.foreignKeys.push({ name: indexName, columns, ...this.references(cursor, table) });
    } else if (cursor.acceptWords('CHECK')) {
      table.checks.push({ name, expression: cursor.parenthesized() });
    } else {
      return false;
    }
    cursor.skipEntry();
    return true;
  }

  /** `KEY idx (a)`, `FULLTEXT KEY idx (a)`; not a column called key: `key VARCHAR(10)` has a number in its parentheses */
  private tableIndex(cursor: Cursor, table: ParsedTable): boolean {
    if (cursor.isAnyWord(['FULLTEXT', 'SPATIAL'])) {
      cursor.next();
    } else if (!cursor.isAnyWord(['KEY', 'INDEX'])) {
      return false;
    } else if (!cursor.isSymbol('(', 1) && !(cursor.isSymbol('(', 2) && cursor.peek(3)?.kind !== 'number')) {
      return false;
    }
    if (cursor.isAnyWord(['KEY', 'INDEX'])) { cursor.next(); }
    const name = cursor.isSymbol('(') ? '' : cursor.next().text;
    this.skipKeyOptions(cursor);
    this.addIndex(cursor, table, name, false);
    cursor.skipEntry();
    return true;
  }

  private addIndex(cursor: Cursor, table: ParsedTable, name: string, unique: boolean) {
    const columns = cursor.columnList();
    if (columns.includes(null)) {
      this.warn('indexExpression', `${table.name}.${name}`);
    } else {
      table.indexes.push({ name, columns: columns as string[], unique });
    }
  }

  private names(cursor: Cursor, table: ParsedTable): string[] {
    const columns = cursor.columnList();
    if (columns.includes(null)) { this.warn('indexExpression', table.name); }
    return columns.filter((c): c is string => c !== null);
  }

  private skipKeyOptions(cursor: Cursor) {
    while (cursor.isAnyWord(['CLUSTERED', 'NONCLUSTERED', 'USING', 'BTREE', 'HASH'])) { cursor.next(); }
  }

  private references(cursor: Cursor, table: ParsedTable): Pick<ParsedForeignKey, 'parentTable' | 'parentColumns' | 'actions'> {
    const parentTable = cursor.name();
    const parentColumns = cursor.isSymbol('(') ? this.names(cursor, table) : [];
    const start = cursor.position;
    while (cursor.peek()?.kind === 'word' && FK_ACTION_WORDS.has(cursor.peek()!.upper)) {
      // Column options can follow an inline REFERENCES
      const inAction = cursor.position > start;
      if (cursor.isWords('NOT', 'NULL') || (!inAction && cursor.isAnyWord(['NULL', 'DEFAULT']))) { break; }
      cursor.next();
    }
    return { parentTable, parentColumns, actions: cursor.textSince(start) };
  }

  private column(cursor: Cursor, table: ParsedTable) {
    const name = cursor.next();
    if (name.kind === 'symbol' || name.kind === 'number') { throw new Error(`unexpected "${name.text}"`); }
    const typeStart = cursor.position;
    const { name: typeName, args, max } = this.typeName(cursor);
    const type = resolveSqlType(typeName, args, max, this.dialect);
    const column: ParsedColumn = {
      name: name.text, typeText: cursor.textSince(typeStart), type,
      notNull: false, primaryKey: false, autoIncrement: type.autoIncrement, computed: false, defaultValue: null, comment: '',
    };
    this.columnOptions(cursor, table, column);
    table.columns.push(column);
  }

  /** `DOUBLE PRECISION`, `VARCHAR2(10 CHAR)`, `TIMESTAMP(6) WITH TIME ZONE`, `INT(10) UNSIGNED`, `public.citext` */
  private typeName(cursor: Cursor): { name: string; args: number[]; max: boolean } {
    const parts = [cursor.name().toUpperCase()];
    const args: number[] = [];
    let max = false;

    const readArgs = () => {
      if (!cursor.isSymbol('(')) { return; }
      cursor.next();
      let depth = 1;
      while (depth > 0) {
        const token = cursor.next();
        if (token.kind === 'symbol' && token.text === '(') { depth++; }
        if (token.kind === 'symbol' && token.text === ')') { depth--; }
        if (token.kind === 'number') { args.push(Number(token.text)); }
        if (token.kind === 'word' && token.upper === 'MAX') { max = true; }
      }
    };

    readArgs();
    for (;;) {
      if (cursor.isWords('WITH', 'TIME', 'ZONE') || cursor.isWords('WITHOUT', 'TIME', 'ZONE') || cursor.isWords('WITH', 'LOCAL', 'TIME', 'ZONE')) {
        while (!cursor.isWords('ZONE')) { parts.push(cursor.next().upper); }
        parts.push(cursor.next().upper);
      } else if (cursor.isAnyWord(['PRECISION', 'VARYING'])
        || (parts[0] === 'NATIONAL' && cursor.isAnyWord(['CHARACTER', 'CHAR']))
        || (parts[0] === 'LONG' && cursor.isWords('RAW'))
        || (parts[0] === 'INTERVAL' && cursor.isAnyWord(['DAY', 'TO', 'SECOND', 'YEAR', 'MONTH']))) {
        parts.push(cursor.next().upper);
      } else if (cursor.isAnyWord(['UNSIGNED', 'SIGNED', 'ZEROFILL', 'BINARY'])) {
        cursor.next();
        continue;
      } else {
        break;
      }
      readArgs();
    }
    while (cursor.acceptSymbol('[')) {
      parts.push('[]');
      if (cursor.peek()?.kind === 'number') { cursor.next(); }
      cursor.expectSymbol(']');
    }
    return { name: parts.join(' '), args: parts[0] === 'INTERVAL' ? [] : args, max };
  }

  private columnOptions(cursor: Cursor, table: ParsedTable, column: ParsedColumn) {
    let constraintName = '';
    while (!cursor.atEnd && !cursor.isSymbol(',') && !cursor.isSymbol(')')) {
      if (cursor.acceptWords('CONSTRAINT')) {
        constraintName = cursor.next().text;
      } else if (cursor.acceptWords('NOT', 'NULL')) {
        column.notNull = true;
      } else if (cursor.acceptWords('NULL')) {
        column.notNull = false;
      } else if (cursor.acceptWords('PRIMARY', 'KEY')) {
        column.primaryKey = true;
        table.primaryKey = [column.name];
      } else if (cursor.acceptWords('UNIQUE')) {
        cursor.acceptWords('KEY');
        table.uniques.push({ name: constraintName, columns: [column.name] });
      } else if (cursor.acceptWords('AUTO_INCREMENT') || cursor.acceptWords('AUTOINCREMENT')) {
        column.autoIncrement = true;
      } else if (cursor.acceptWords('IDENTITY')) {
        column.autoIncrement = true;
        if (cursor.isSymbol('(')) { cursor.parenthesized(); }
      } else if (cursor.acceptWords('GENERATED')) {
        this.generated(cursor, column);
      } else if (cursor.acceptWords('AS')) {
        cursor.parenthesized();
        column.computed = true;
      } else if (cursor.acceptWords('DEFAULT')) {
        column.defaultValue = this.defaultExpression(cursor);
      } else if (cursor.acceptWords('COMMENT')) {
        column.comment = cursor.next().text;
      } else if (cursor.acceptWords('REFERENCES')) {
        table.foreignKeys.push({ name: constraintName, columns: [column.name], ...this.references(cursor, table) });
      } else if (cursor.acceptWords('CHECK')) {
        table.checks.push({ name: constraintName, expression: cursor.parenthesized() });
      } else if (cursor.isSymbol('(')) {
        cursor.parenthesized();
      } else {
        // COLLATE x, CHARACTER SET x, ON UPDATE CURRENT_TIMESTAMP, ENABLE, …
        cursor.next();
      }
    }
  }

  /** `GENERATED { ALWAYS | BY DEFAULT [ON NULL] } AS { IDENTITY [(…)] | (expr) [STORED] }` */
  private generated(cursor: Cursor, column: ParsedColumn) {
    while (!cursor.atEnd && !cursor.isWords('AS')) { cursor.next(); }
    cursor.next();
    if (cursor.acceptWords('IDENTITY')) {
      column.autoIncrement = true;
      if (cursor.isSymbol('(')) { cursor.parenthesized(); }
    } else {
      cursor.parenthesized();
      column.computed = true;
    }
  }

  /** Up to the next column option. `null` for `DEFAULT NULL`. */
  private defaultExpression(cursor: Cursor): string | null {
    const start = cursor.position;
    let afterCast = true; // the first token always belongs to the expression
    while (!cursor.atEnd && !cursor.isSymbol(',') && !cursor.isSymbol(')')) {
      const token = cursor.peek()!;
      if (!afterCast && token.kind === 'word' && COLUMN_KEYWORDS.has(token.upper)) { break; }
      afterCast = token.text === '::';
      if (cursor.isSymbol('(')) { cursor.parenthesized(); } else { cursor.next(); }
    }
    const text = cursor.textSince(start);
    return text.toUpperCase() === 'NULL' ? null : text;
  }

  private createIndex(cursor: Cursor, unique: boolean) {
    cursor.acceptWords('CONCURRENTLY');
    cursor.acceptWords('IF', 'NOT', 'EXISTS');
    const name = cursor.isWords('ON') ? '' : cursor.name();
    if (!cursor.acceptWords('ON')) { throw new Error('expected ON'); }
    cursor.acceptWords('ONLY');
    const table = this.table(cursor.name());
    if (cursor.acceptWords('USING')) { cursor.next(); }
    this.addIndex(cursor, table, name, unique);
  }

  // ── ALTER TABLE ─────────────────────────────────────────────────────

  private alter(cursor: Cursor, tokens: Token[]) {
    cursor.next();
    if (!cursor.acceptWords('TABLE')) {
      if (!cursor.isAnyWord(['SEQUENCE', 'SCHEMA', 'DATABASE'])) { this.warn('statementSkipped', excerpt(this.source, tokens)); }
      return;
    }
    cursor.acceptWords('IF', 'EXISTS');
    cursor.acceptWords('ONLY');
    const table = this.table(cursor.name());
    do {
      this.alterAction(cursor, table, tokens);
    } while (cursor.acceptSymbol(','));
  }

  private alterAction(cursor: Cursor, table: ParsedTable, tokens: Token[]) {
    // SQL Server: ALTER TABLE t WITH CHECK ADD CONSTRAINT …
    if (!cursor.acceptWords('WITH', 'CHECK')) { cursor.acceptWords('WITH', 'NOCHECK'); }
    if (cursor.acceptWords('ADD')) { return this.alterAdd(cursor, table); }
    if (cursor.acceptWords('MODIFY')) {
      cursor.acceptWords('COLUMN');
      return this.alterModify(cursor, table);
    }
    if (cursor.acceptWords('ALTER')) {
      cursor.acceptWords('COLUMN');
      return this.alterColumn(cursor, table);
    }
    if (!cursor.isAnyWord(IGNORED_ALTERS)) { this.warn('statementSkipped', excerpt(this.source, tokens)); }
    cursor.skipEntry();
  }

  private findColumn(table: ParsedTable, name: string): ParsedColumn | undefined {
    return table.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
  }

  private alterAdd(cursor: Cursor, table: ParsedTable) {
    // Oracle: ADD ( … )
    const wrapped = cursor.acceptSymbol('(');
    do {
      const name = this.constraintName(cursor);
      if (!this.tableConstraint(cursor, table, name) && !this.tableIndex(cursor, table)) {
        cursor.acceptWords('COLUMN');
        this.column(cursor, table);
      }
    } while (wrapped && cursor.acceptSymbol(','));
    if (wrapped) { cursor.expectSymbol(')'); }
  }

  /** pg_dump: `ALTER COLUMN id SET DEFAULT nextval(…)` / `ADD GENERATED … AS IDENTITY` */
  private alterColumn(cursor: Cursor, table: ParsedTable) {
    const column = this.findColumn(table, cursor.next().text);
    if (cursor.acceptWords('SET', 'DEFAULT')) {
      const expression = this.defaultExpression(cursor);
      if (column && /^nextval\s*\(/i.test(expression ?? '')) {
        column.autoIncrement = true;
      } else if (column) {
        column.defaultValue = expression;
      }
    } else if (cursor.acceptWords('ADD', 'GENERATED') && column) {
      this.generated(cursor, column);
    }
    cursor.skipEntry();
  }

  /**
   * phpMyAdmin dumps: `MODIFY id int NOT NULL AUTO_INCREMENT`; Oracle: `MODIFY (id GENERATED … AS IDENTITY)`.
   * Only the auto-increment is news.
   */
  private alterModify(cursor: Cursor, table: ParsedTable) {
    const wrapped = cursor.acceptSymbol('(');
    const column = this.findColumn(table, cursor.peek()?.text ?? '');
    if (cursor.isWords('GENERATED') || cursor.peek(1)?.upper === 'GENERATED') {
      cursor.next();
      cursor.acceptWords('GENERATED');
      if (column) { this.generated(cursor, column); }
    } else {
      const scratch = emptyTable(table.name);
      this.column(cursor, scratch);
      if (column && scratch.columns[0].autoIncrement) { column.autoIncrement = true; }
    }
    cursor.skipEntry();
    if (wrapped) { cursor.expectSymbol(')'); }
  }

  // ── COMMENT ON ──────────────────────────────────────────────────────

  private commentOn(cursor: Cursor) {
    cursor.next();
    if (!cursor.acceptWords('ON')) { return; }
    const onTable = cursor.acceptWords('TABLE');
    if (!onTable && !cursor.acceptWords('COLUMN')) { return; }
    const parts = cursor.dottedName();
    if (!cursor.acceptWords('IS') || cursor.peek()?.kind !== 'string') { return; }
    const comment = cursor.next().text;
    if (onTable) {
      this.table(parts[parts.length - 1]).comment = comment;
    } else if (parts.length >= 2) {
      const column = this.findColumn(this.table(parts[parts.length - 2]), parts[parts.length - 1]);
      if (column) { column.comment = comment; }
    }
  }

  // ── INSERT ──────────────────────────────────────────────────────────

  private insert(cursor: Cursor, tokens: Token[]) {
    while (cursor.isAnyWord(INSERT_MODIFIERS)) { cursor.next(); }
    cursor.acceptWords('INTO');
    const table = this.table(cursor.name());
    const columns = cursor.isSymbol('(') ? this.names(cursor, table) : [];
    if (cursor.acceptWords('OVERRIDING')) {
      cursor.next();
      cursor.next();
    }
    if (cursor.acceptWords('DEFAULT', 'VALUES')) {
      table.inserts.push({ columns: [], rows: [[]] });
      return;
    }
    if (!cursor.acceptWords('VALUES') && !cursor.acceptWords('VALUE')) {
      // INSERT … SELECT
      this.warn('statementSkipped', excerpt(this.source, tokens));
      return;
    }
    const rows: ParsedValue[][] = [];
    do {
      rows.push(this.valueRow(cursor));
    } while (cursor.acceptSymbol(','));
    table.inserts.push({ columns, rows });
  }

  private valueRow(cursor: Cursor): ParsedValue[] {
    cursor.expectSymbol('(');
    const values: ParsedValue[] = [];
    if (cursor.acceptSymbol(')')) { return values; }
    do {
      const start = cursor.position;
      cursor.skipEntry();
      values.push(literalValue(cursor.tokensSince(start)) ?? { value: cursor.textSince(start), expression: true });
    } while (cursor.acceptSymbol(','));
    cursor.expectSymbol(')');
    return values;
  }
}

function emptyTable(name: string): ParsedTable {
  return {
    name, declared: false, comment: '', columns: [], primaryKey: [], uniques: [], checks: [],
    indexes: [], foreignKeys: [], inserts: [],
  };
}

/** The value of a literal; null for anything else */
function literalValue(tokens: Token[]): ParsedValue | null {
  const [first, second] = tokens;
  const text = (t: Token): ParsedValue => ({ value: t.text, expression: false });
  if (!first) { return { value: '', expression: false }; }

  if (tokens.length === 1) {
    // MySQL: VALUES ("text")
    if (first.kind === 'string' || first.kind === 'quoted' || first.kind === 'number') { return text(first); }
    if (first.upper === 'NULL' || first.upper === 'DEFAULT') { return { value: '', expression: false }; }
    return first.upper === 'TRUE' || first.upper === 'FALSE' ? text(first) : null;
  }
  // -1, +1
  if (tokens.length === 2 && first.kind === 'symbol' && (first.text === '-' || first.text === '+') && second.kind === 'number') {
    return { value: first.text === '-' ? `-${second.text}` : second.text, expression: false };
  }
  // N'x', E'x', _utf8'x', DATE '2020-01-01'
  if (tokens.length === 2 && first.kind === 'word' && second.kind === 'string') { return text(second); }
  // '2020-01-01'::date, N'x'::text
  const string = tokens.findIndex((t) => t.kind === 'string');
  const isCast = string >= 0 && string <= 1 && tokens[string + 1]?.text === '::'
    && tokens.slice(string + 2).every((t) => t.kind === 'word' || t.kind === 'quoted' || t.text === '.');
  return isCast ? text(tokens[string]) : null;
}

export function parseSql(source: string, dialect: DdlDialect): ParsedSql {
  return new SqlParser(source, dialect).parse();
}
