import type { DdlDialect } from '../../shared/messages';
import { SqlDialect } from './SqlDialect';
import { MySqlDialect } from './dialects/MySqlDialect';
import { PostgresDialect } from './dialects/PostgresDialect';
import { SqliteDialect } from './dialects/SqliteDialect';
import { SqlServerDialect } from './dialects/SqlServerDialect';

export function createDialect(id: DdlDialect): SqlDialect {
  switch (id) {
    case 'mysql':      return new MySqlDialect();
    case 'postgresql': return new PostgresDialect();
    case 'sqlite':     return new SqliteDialect();
    case 'sqlserver':  return new SqlServerDialect();
  }
}
