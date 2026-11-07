import { Column, DiagramModel, Table, TableIndex } from '../../shared/DiagramModel';
import { isEmptySeedValue } from '../../shared/autoIncrement';
import { productionModel, testModel } from '../../shared/testData';
import type { DdlDialect } from '../../shared/messages';
import { SqlDialect } from './SqlDialect';
import { ResolvedForeignKey, Schema } from './Schema';
import { createDialect } from './createDialect';
import type { DdlStyle } from '../../shared/ddlStyle';

/** What to include, plus how to write it (DdlStyle; unset fields use DEFAULT_DDL_STYLE) */
export interface DdlOptions extends Partial<DdlStyle> {
  insertSeedData?: boolean;
  skipAutoIncrementPk?: boolean;
  /** Prepend CREATE DATABASE / USER / SCHEMA */
  includeCreateDatabase?: boolean;
}

export function isCompleteIndex(idx: TableIndex): boolean {
  return idx.columns.length > 0;
}

const NUMERIC_TYPES = ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'FLOAT', 'DOUBLE'];

/** Full schema DDL (CREATE TABLE, FKs, indexes) and optional seed-data INSERTs: production, or what tests add to it. */
export class DdlExporter {
  private readonly schema: Schema;

  static export(model: DiagramModel, dialect: DdlDialect = 'mysql', options: DdlOptions = {}): string {
    return new DdlExporter(productionModel(model), createDialect(dialect, model.database, options)).build(options);
  }

  /** Seed-data INSERTs only (for a separate data file); '' when no table has seed data */
  static exportData(model: DiagramModel, dialect: DdlDialect = 'mysql', options: DdlOptions = {}): string {
    return new DdlExporter(productionModel(model), createDialect(dialect, model.database, options))
      .seedInserts(options.skipAutoIncrementPk ?? false);
  }

  /** What tests add, to run after the production DDL: test-only tables, FKs that touch them, test rows */
  static exportTest(model: DiagramModel, dialect: DdlDialect = 'mysql', options: DdlOptions = {}): string {
    return new DdlExporter(testModel(model), createDialect(dialect, model.database, options)).buildTest(options);
  }

  /** Test-row INSERTs only; '' when there are none */
  static exportTestData(model: DiagramModel, dialect: DdlDialect = 'mysql', options: DdlOptions = {}): string {
    return new DdlExporter(testModel(model), createDialect(dialect, model.database, options))
      .seedInserts(options.skipAutoIncrementPk ?? false);
  }

  constructor(model: DiagramModel, private readonly dialect: SqlDialect) {
    this.schema = new Schema(model, dialect);
  }

  build(options: DdlOptions = {}): string {
    const { dialect, schema } = this;
    return this.compose(schema.model.tables, dialect.inlineForeignKeys ? [] : schema.foreignKeys, options);
  }

  private buildTest(options: DdlOptions): string {
    const { dialect, schema } = this;
    const foreignKeys = schema.foreignKeys.filter((fk) => fk.parent.testOnly || fk.child.testOnly);
    // A test table created here has its FKs inline; a production table already exists
    const added = dialect.inlineForeignKeys ? foreignKeys.filter((fk) => !fk.child.testOnly) : foreignKeys;
    return this.compose(schema.model.tables.filter((t) => t.testOnly), added, { ...options, includeCreateDatabase: false });
  }

  private compose(tables: Table[], addedForeignKeys: readonly ResolvedForeignKey[], options: DdlOptions): string {
    const { dialect, schema } = this;

    const creates = tables.map((t) => dialect.createTable(t, schema).join('\n')).join('\n\n');
    const foreignKeys = addedForeignKeys.map((fk) => dialect.addForeignKey(fk)).join('\n\n');
    const indexes = tables
      .flatMap((t) => (t.indexes ?? []).filter(isCompleteIndex).map((idx) => dialect.createIndex(t, idx)))
      .join('\n');

    const database = options.includeCreateDatabase ? dialect.createDatabase().join('\n') : '';
    const schemaPart = [database, creates, foreignKeys, indexes].filter(Boolean).join('\n\n');
    if (!options.insertSeedData) {
      return schemaPart;
    }

    const inserts = this.seedInserts(options.skipAutoIncrementPk ?? false);
    return [schemaPart, inserts ? `-- Seed Data\n${inserts}` : ''].filter(Boolean).join('\n\n');
  }

  /** Parents first, so the INSERTs satisfy FK constraints */
  seedInserts(skipAutoIncrementPk: boolean): string {
    return this.schema.tablesInDependencyOrder()
      .map((t) => this.insertFor(t, skipAutoIncrementPk))
      .filter((s): s is string => s !== null)
      .join('\n\n');
  }

  /**
   * Rows with an auto-increment key go first, wrapped by the dialect (IDENTITY_INSERT, setval, …);
   * rows that leave it empty follow without the column, so the database generates it after the explicit ids.
   */
  private insertFor(table: Table, skipAutoIncrementPk: boolean): string | null {
    const { dialect, schema } = this;
    if (!table.seedData?.length) { return null; }

    const identity = table.columns.find((c) => schema.isAutoIncrement(c));
    const generatedCols = table.columns.filter((c) => c !== identity);
    if (!identity) { return this.insert(table, table.columns, table.seedData); }
    if (skipAutoIncrementPk) { return this.insert(table, generatedCols, table.seedData); }

    const explicit  = table.seedData.filter((row) => !isEmptySeedValue(row[identity.physicalName]));
    const generated = table.seedData.filter((row) => isEmptySeedValue(row[identity.physicalName]));
    const explicitInsert = this.insert(table, table.columns, explicit);
    return [
      explicitInsert && dialect.wrapExplicitIdentityInsert(table, identity, explicitInsert),
      this.insert(table, generatedCols, generated),
    ].filter(Boolean).join('\n') || null;
  }

  private insert(table: Table, cols: Column[], seedRows: Record<string, string>[]): string | null {
    const { dialect, schema } = this;
    if (cols.length === 0 || seedRows.length === 0) { return null; }
    const rows = seedRows.map((row) => {
      const values = cols.map((c) => {
        const raw = row[c.physicalName];
        if (isEmptySeedValue(raw)) { return 'NULL'; }
        const dbType = schema.typeOf(c)?.dbType;
        if (dbType && NUMERIC_TYPES.includes(dbType)) { return raw; }
        if (dbType === 'BOOLEAN') { return dialect.booleanLiteral(raw === '1' || raw.toLowerCase() === 'true'); }
        return dialect.string(String(raw));
      });
      return `(${values.join(', ')})`;
    });
    return dialect.insertStatement(table, cols, rows);
  }
}
