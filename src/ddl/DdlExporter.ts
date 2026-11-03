import { DiagramModel, Table, TableIndex } from '../../shared/DiagramModel';
import type { DdlDialect } from '../../shared/messages';
import { SqlDialect } from './SqlDialect';
import { Schema } from './Schema';
import { createDialect } from './createDialect';

export interface DdlOptions {
  insertSeedData?: boolean;
  skipAutoIncrementPk?: boolean;
}

export function isCompleteIndex(idx: TableIndex): boolean {
  return !!idx.name && idx.columns.length > 0;
}

const NUMERIC_TYPES = ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'FLOAT', 'DOUBLE'];

/** Full schema DDL (CREATE TABLE, FKs, indexes) and optional seed-data INSERTs. */
export class DdlExporter {
  private readonly schema: Schema;

  static export(model: DiagramModel, dialect: DdlDialect = 'mysql', options: DdlOptions = {}): string {
    return new DdlExporter(model, createDialect(dialect)).build(options);
  }

  constructor(model: DiagramModel, private readonly dialect: SqlDialect) {
    this.schema = new Schema(model, dialect);
  }

  build(options: DdlOptions = {}): string {
    const { dialect, schema } = this;
    const tables = schema.model.tables;

    const creates = tables.map((t) => dialect.createTable(t, schema).join('\n')).join('\n\n');
    const foreignKeys = dialect.inlineForeignKeys
      ? ''
      : schema.foreignKeys.map((fk) => dialect.addForeignKey(fk)).join('\n\n');
    const indexes = tables
      .flatMap((t) => (t.indexes ?? []).filter(isCompleteIndex).map((idx) => dialect.createIndex(t, idx)))
      .join('\n');

    const schemaPart = [creates, foreignKeys, indexes].filter(Boolean).join('\n\n');
    if (!options.insertSeedData) {
      return schemaPart;
    }

    const inserts = this.seedInserts(options.skipAutoIncrementPk ?? false);
    return [schemaPart, inserts ? `-- Seed Data\n${inserts}` : ''].filter(Boolean).join('\n\n');
  }

  /** Parents first, so the INSERTs satisfy FK constraints */
  private seedInserts(skipAutoIncrementPk: boolean): string {
    return this.schema.tablesInDependencyOrder()
      .map((t) => this.insertFor(t, skipAutoIncrementPk))
      .filter((s): s is string => s !== null)
      .join('\n\n');
  }

  private insertFor(table: Table, skipAutoIncrementPk: boolean): string | null {
    const { dialect, schema } = this;
    if (!table.seedData?.length) { return null; }

    const cols = skipAutoIncrementPk
      ? table.columns.filter((c) => !schema.isAutoIncrement(c))
      : table.columns;
    if (cols.length === 0) { return null; }

    const rows = table.seedData.map((row) => {
      const values = cols.map((c) => {
        const raw = row[c.physicalName];
        if (raw === undefined || raw === null || raw === '') { return 'NULL'; }
        const dbType = schema.entryOf(c)?.dbType;
        if (dbType && NUMERIC_TYPES.includes(dbType)) { return raw; }
        if (dbType === 'BOOLEAN') { return dialect.booleanLiteral(raw === '1' || raw.toLowerCase() === 'true'); }
        return dialect.string(String(raw));
      });
      return `  (${values.join(', ')})`;
    });

    const t = dialect.quote(table.physicalName);
    const insert = `INSERT INTO ${t} (${cols.map((c) => dialect.quote(c.physicalName)).join(', ')})\nVALUES\n${rows.join(',\n')};`;
    return cols.some((c) => schema.isAutoIncrement(c))
      ? dialect.wrapExplicitIdentityInsert(table, insert)
      : insert;
  }
}
