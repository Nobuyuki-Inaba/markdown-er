import type { DatabaseSettings, DdlDialect } from '../../shared/DiagramModel';
import { SqlDialect } from './SqlDialect';
import { MySqlDialect } from './dialects/MySqlDialect';
import { PostgresDialect } from './dialects/PostgresDialect';
import { SqliteDialect } from './dialects/SqliteDialect';
import { SqlServerDialect } from './dialects/SqlServerDialect';
import { OracleDialect } from './dialects/OracleDialect';

/** A dialect bound to the target database settings (name, schema, user, charset…) */
export function createDialect(id: DdlDialect, database?: DatabaseSettings): SqlDialect {
  switch (id) {
    case 'mysql':      return new MySqlDialect(database);
    case 'postgresql': return new PostgresDialect(database);
    case 'oracle':     return new OracleDialect(database);
    case 'sqlserver':  return new SqlServerDialect(database);
    case 'sqlite':     return new SqliteDialect(database);
  }
}
