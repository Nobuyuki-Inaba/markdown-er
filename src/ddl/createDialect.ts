import type { DatabaseSettings, DdlDialect } from '../../shared/DiagramModel';
import { DdlStyle, DEFAULT_DDL_STYLE, DDL_STYLE_KEYS } from '../../shared/ddlStyle';
import { SqlDialect } from './SqlDialect';
import { MySqlDialect } from './dialects/MySqlDialect';
import { PostgresDialect } from './dialects/PostgresDialect';
import { SqliteDialect } from './dialects/SqliteDialect';
import { SqlServerDialect } from './dialects/SqlServerDialect';
import { OracleDialect } from './dialects/OracleDialect';

/**
 * A dialect bound to the target database settings (name, schema, user, charset…) and the DDL style.
 * `style` may carry other fields (e.g. DdlOptions); only DdlStyle keys are taken, missing ones use the default.
 */
export function createDialect(id: DdlDialect, database?: DatabaseSettings, style: Partial<DdlStyle> = {}): SqlDialect {
  const resolved = { ...DEFAULT_DDL_STYLE };
  for (const key of DDL_STYLE_KEYS) {
    if (style[key] !== undefined) { resolved[key] = style[key]!; }
  }
  switch (id) {
    case 'mysql':      return new MySqlDialect(database, resolved);
    case 'postgresql': return new PostgresDialect(database, resolved);
    case 'oracle':     return new OracleDialect(database, resolved);
    case 'sqlserver':  return new SqlServerDialect(database, resolved);
    case 'sqlite':     return new SqliteDialect(database, resolved);
  }
}
