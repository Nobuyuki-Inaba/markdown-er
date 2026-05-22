import { Table, Column, DictionaryEntry, DbType, DB_TYPES } from '@shared/DiagramModel';
import { genId } from './idgen';

export type CsvImportCategory = 'table' | 'dictionary';

export const TABLE_CSV_HEADERS =
  'tableLogicalName,tablePhysicalName,tableComment,columnLogicalName,columnPhysicalName,dbType,length,notNull,isPrimaryKey,isNullable,defaultValue,comment';

export const TABLE_CSV_EXAMPLE = `User,users,User table,User ID,user_id,INT,,true,true,false,,
User,users,User table,Name,name,VARCHAR,255,true,false,true,,
Order,orders,,Order ID,order_id,INT,,true,true,false,,
Order,orders,,User ID,user_id,INT,,true,false,false,,`;

export const DICTIONARY_CSV_HEADERS = 'name,dbType,length,notNull,comment';

export const DICTIONARY_CSV_EXAMPLE = `User ID,INT,,true,Primary key type
Name,VARCHAR,255,true,Display name
Amount,DECIMAL,10,true,Monetary amount`;

export interface ParsedTableImport {
  tables: Table[];
  autoCreatedDictEntries: DictionaryEntry[];
  skippedTableNames: string[];
}

export interface ParsedDictionaryImport {
  entries: DictionaryEntry[];
  skippedNames: string[];
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCsvRows(csv: string): Record<string, string>[] {
  const lines = csv.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim(); });
    return row;
  });
}

function toValidDbType(raw: string): DbType {
  const upper = raw?.toUpperCase() as DbType;
  return DB_TYPES.includes(upper) ? upper : 'VARCHAR';
}

export function parseDictionaryCsv(
  csv: string,
  existingDictionary: DictionaryEntry[]
): ParsedDictionaryImport {
  const rows = parseCsvRows(csv);
  const existingNames = new Set(existingDictionary.map((e) => e.name.toLowerCase()));
  const skippedNames: string[] = [];
  const entries: DictionaryEntry[] = [];

  for (const row of rows) {
    const name = row.name ?? '';
    if (!name) continue;
    if (existingNames.has(name.toLowerCase())) {
      skippedNames.push(name);
      continue;
    }
    existingNames.add(name.toLowerCase());
    entries.push({
      id: genId('dict'),
      name,
      dbType: toValidDbType(row.dbType ?? ''),
      length: row.length ? parseInt(row.length, 10) : null,
      notNull: row.notNull?.toLowerCase() === 'true',
      comment: row.comment ?? '',
    });
  }
  return { entries, skippedNames };
}

export function parseTableCsv(
  csv: string,
  existingDictionary: DictionaryEntry[],
  existingTablePhysicalNames: Set<string>
): ParsedTableImport {
  const rows = parseCsvRows(csv);

  // We may auto-create dict entries; track by "dbType:length:notNull" key
  const newDictMap = new Map<string, DictionaryEntry>();
  const allDict = [...existingDictionary];

  function findOrCreateDictEntry(dbTypeRaw: string, lengthRaw: string, notNullRaw: string): string {
    const dt = toValidDbType(dbTypeRaw);
    const len = lengthRaw ? parseInt(lengthRaw, 10) : null;
    const nn = notNullRaw?.toLowerCase() === 'true';
    const existing = allDict.find(
      (e) => e.dbType === dt && e.length === len && e.notNull === nn
    );
    if (existing) return existing.id;
    const key = `${dt}:${len}:${nn}`;
    if (newDictMap.has(key)) return newDictMap.get(key)!.id;
    const entry: DictionaryEntry = {
      id: genId('dict'),
      name: dt + (len != null ? `(${len})` : '') + (nn ? '' : ' NULL'),
      dbType: dt,
      length: len,
      notNull: nn,
      comment: '',
    };
    newDictMap.set(key, entry);
    allDict.push(entry);
    return entry.id;
  }

  const tableMap = new Map<string, Table>();
  const tableOrder: string[] = [];
  const skippedTableNames: string[] = [];

  for (const row of rows) {
    const tablePhysical = row.tablePhysicalName ?? '';
    const colPhysical = row.columnPhysicalName ?? '';
    if (!tablePhysical || !colPhysical) continue;

    if (existingTablePhysicalNames.has(tablePhysical)) {
      if (!skippedTableNames.includes(tablePhysical)) skippedTableNames.push(tablePhysical);
      continue;
    }

    if (!tableMap.has(tablePhysical)) {
      tableOrder.push(tablePhysical);
      tableMap.set(tablePhysical, {
        id: genId('tbl'),
        logicalName: row.tableLogicalName || tablePhysical,
        physicalName: tablePhysical,
        comment: row.tableComment ?? '',
        columns: [],
      });
    }

    const table = tableMap.get(tablePhysical)!;
    const dictionaryId = findOrCreateDictEntry(
      row.dbType ?? '',
      row.length ?? '',
      row.notNull ?? 'false'
    );

    const col: Column = {
      id: genId('col'),
      logicalName: row.columnLogicalName || colPhysical,
      physicalName: colPhysical,
      dictionaryId,
      isPrimaryKey: row.isPrimaryKey?.toLowerCase() === 'true',
      isNullable: row.isNullable?.toLowerCase() !== 'false',
      defaultValue: row.defaultValue || null,
      comment: row.comment ?? '',
    };
    table.columns.push(col);
  }

  return {
    tables: tableOrder.map((p) => tableMap.get(p)!),
    autoCreatedDictEntries: Array.from(newDictMap.values()),
    skippedTableNames,
  };
}
