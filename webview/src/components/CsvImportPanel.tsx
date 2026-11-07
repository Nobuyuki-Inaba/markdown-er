import { useRef, useState } from 'react';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import {
  CsvImportCategory,
  TABLE_CSV_HEADERS,
  TABLE_CSV_EXAMPLE,
  DICTIONARY_CSV_HEADERS,
  DICTIONARY_CSV_EXAMPLE,
  BUILTIN_PRESETS,
  parseTableCsv,
  parseDictionaryCsv,
} from '../util/csvImport';
import { useMessages, Messages } from '../i18n';

type ImportStatus = { ok: true; message: string } | { ok: false; message: string } | null;

export function CsvImportPanel() {
  const isOpen = useUiStore((s) => s.isCsvImportOpen);
  const close  = useUiStore((s) => s.closeCsvImport);

  const dictionary     = useDiagramStore((s) => s.model.dictionary);
  const tables         = useDiagramStore((s) => s.model.tables);
  const importTables   = useDiagramStore((s) => s.importTables);
  const importDictEntries = useDiagramStore((s) => s.importDictionaryEntries);

  const [category, setCategory] = useState<CsvImportCategory>('table');
  const [status, setStatus] = useState<ImportStatus>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useMessages().csv;

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const csv = ev.target?.result as string;
      try {
        if (category === 'dictionary') {
          const parsed = parseDictionaryCsv(csv, dictionary);
          if (parsed.entries.length === 0 && parsed.skippedNames.length === 0) {
            setStatus({ ok: false, message: t.noRows });
          } else {
            importDictEntries(parsed);
            const msg = [
              parsed.entries.length > 0 && t.entriesImported(parsed.entries.length),
              parsed.skippedNames.length > 0 && t.entriesSkipped(parsed.skippedNames.length),
            ].filter(Boolean).join(', ');
            setStatus({ ok: true, message: msg });
          }
        } else {
          const existingPhysNames = new Set(tables.map((t) => t.physicalName));
          const parsed = parseTableCsv(csv, dictionary, existingPhysNames);
          if (parsed.tables.length === 0 && parsed.skippedTableNames.length === 0) {
            setStatus({ ok: false, message: t.noRows });
          } else {
            importTables(parsed);
            const msg = [
              parsed.tables.length > 0 && t.tablesImported(parsed.tables.length),
              parsed.autoCreatedDictEntries.length > 0 && t.dictAutoCreated(parsed.autoCreatedDictEntries.length),
              parsed.skippedTableNames.length > 0 && t.tablesSkipped(parsed.skippedTableNames.length),
            ].filter(Boolean).join(', ');
            setStatus({ ok: true, message: msg });
          }
        }
      } catch (err) {
        setStatus({ ok: false, message: t.parseError((err as Error).message) });
      }
      // Reset file input so the same file can be re-selected after fixing
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const spec = category === 'table'
    ? { headers: TABLE_CSV_HEADERS, example: TABLE_CSV_EXAMPLE, fields: tableFields(t) }
    : { headers: DICTIONARY_CSV_HEADERS, example: DICTIONARY_CSV_EXAMPLE, fields: dictFields(t) };

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{t.title}</span>
          <button onClick={close} style={closeBtnStyle}>✕</button>
        </div>

        {/* Fixed top: tabs + upload zone */}
        <div style={topFixedStyle}>
          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e0e0e0', marginBottom: 14 }}>
            {(['table', 'dictionary'] as CsvImportCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => { setCategory(cat); setStatus(null); }}
                style={{ ...tabStyle, ...(category === cat ? tabActiveStyle : {}) }}
              >
                {cat === 'table' ? t.tabTable : t.tabDictionary}
              </button>
            ))}
          </div>

          {/* Upload zone */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={uploadBtnStyle}>
              {category === 'table' ? t.chooseTable : t.chooseDictionary}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </label>
            <span style={{ fontSize: 12, color: '#888' }}>{t.seeSpec}</span>
          </div>

          {status && (
            <div style={{
              marginTop: 10,
              padding: '7px 12px',
              borderRadius: 4,
              fontSize: 13,
              background: status.ok ? '#e8f5e9' : '#fdecea',
              color: status.ok ? '#2e7d32' : '#c62828',
              border: `1px solid ${status.ok ? '#a5d6a7' : '#ef9a9a'}`,
            }}>
              {status.ok ? '✓ ' : '✕ '}{status.message}
            </div>
          )}
        </div>

        {/* Spec pane — fixed height, internal scroll */}
        <div style={specPaneStyle}>
          <div style={{ marginBottom: 8 }}>
            <span style={labelStyle}>{t.requiredHeaders}</span>
            <code style={codeStyle}>{spec.headers}</code>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 10 }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={th}>{t.column}</th>
                <th style={th}>{t.required}</th>
                <th style={th}>{t.description}</th>
              </tr>
            </thead>
            <tbody>
              {spec.fields.map((f) => (
                <tr key={f.name} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{f.name}</td>
                  <td style={{ ...td, textAlign: 'center', color: f.required ? '#c00' : '#888' }}>
                    {f.required ? t.yes : t.no}
                  </td>
                  <td style={td}>{f.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginBottom: 8 }}>
            <span style={labelStyle}>{t.example}</span>
            <pre style={preStyle}>{spec.headers}{'\n'}{spec.example}</pre>
          </div>

          {category === 'table' && (
            <>
              <p style={{ fontSize: 11, color: '#666', margin: '0 0 10px' }}>
                {t.tableNote1}
                <br />
                {t.tableNote2}
              </p>
              <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 700, color: '#555' }}>
                {t.presets}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#f0f4ff' }}>
                    <th style={th}>dictionaryName</th>
                    <th style={th}>dbType</th>
                    <th style={th}>length / scale</th>
                    <th style={th}>notNull</th>
                    <th style={th}>{t.description}</th>
                  </tr>
                </thead>
                <tbody>
                  {BUILTIN_PRESETS.map((p) => (
                    <tr key={p.name} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{p.name}</td>
                      <td style={td}>{p.dbType}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{p.length != null ? `${p.length}${p.scale != null ? `, ${p.scale}` : ''}` : '—'}</td>
                      <td style={{ ...td, textAlign: 'center' }}>{p.notNull ? 'true' : 'false'}</td>
                      <td style={td}>{p.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {category === 'dictionary' && (
            <p style={{ fontSize: 11, color: '#666', margin: 0 }}>
              {t.dictNote}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

type CsvMessages = Messages['csv'];
type FieldSpec = { name: string; required: boolean; desc: string };

const TABLE_FIELD_REQUIRED: Record<keyof CsvMessages['tableFields'], boolean> = {
  tableLogicalName: true, tablePhysicalName: true, tableComment: false,
  columnLogicalName: true, columnPhysicalName: true, dictionaryName: false,
  dbType: false, length: false, scale: false, notNull: false,
  isPrimaryKey: false, isNullable: false, defaultValue: false, comment: false,
};

const DICT_FIELD_REQUIRED: Record<keyof CsvMessages['dictFields'], boolean> = {
  name: true, dbType: true, length: false, scale: false, notNull: true, comment: false,
};

function fieldSpecs<K extends string>(required: Record<K, boolean>, descs: Record<K, string>): FieldSpec[] {
  return (Object.keys(required) as K[]).map((name) => ({ name, required: required[name], desc: descs[name] }));
}

const tableFields = (t: CsvMessages) => fieldSpecs(TABLE_FIELD_REQUIRED, t.tableFields);
const dictFields  = (t: CsvMessages) => fieldSpecs(DICT_FIELD_REQUIRED, t.dictFields);

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: '#0005', zIndex: 50,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  paddingTop: 60,
};

const panelStyle: React.CSSProperties = {
  // Fixed light panel: the theme's text color may be light too
  color: '#222',
  background: '#fff', borderRadius: 6,
  width: 760, maxWidth: '95vw', maxHeight: '90vh',
  display: 'flex', flexDirection: 'column',
  boxShadow: '0 8px 32px #0006',
  border: '1px solid #ccc',
};

const headerStyle: React.CSSProperties = {
  background: '#f5f5f5', borderBottom: '1px solid #ccc',
  padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  borderRadius: '6px 6px 0 0',
  flexShrink: 0,
};

const topFixedStyle: React.CSSProperties = {
  padding: '14px 20px 12px',
  borderBottom: '1px solid #e0e0e0',
  flexShrink: 0,
};

const specPaneStyle: React.CSSProperties = {
  padding: '14px 20px',
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#666',
};

const tabStyle: React.CSSProperties = {
  background: 'none', border: 'none', borderBottom: '2px solid transparent',
  padding: '6px 18px', cursor: 'pointer', fontSize: 13, color: '#555',
  marginBottom: -2,
};

const tabActiveStyle: React.CSSProperties = {
  color: '#1a73e8', borderBottomColor: '#1a73e8', fontWeight: 700,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: '#555', display: 'block', marginBottom: 4,
};

const codeStyle: React.CSSProperties = {
  display: 'block', background: '#f3f4f6', border: '1px solid #ddd',
  borderRadius: 3, padding: '5px 8px', fontSize: 11, fontFamily: 'monospace',
  wordBreak: 'break-all',
};

const preStyle: React.CSSProperties = {
  background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 3,
  padding: '8px 10px', fontSize: 11, fontFamily: 'monospace',
  whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0,
};

const uploadBtnStyle: React.CSSProperties = {
  display: 'inline-block', padding: '7px 16px',
  background: '#1a73e8', color: '#fff', borderRadius: 4,
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
  border: 'none',
};

const th: React.CSSProperties = { padding: '5px 8px', textAlign: 'left', fontSize: 11, color: '#555', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '4px 8px', fontSize: 12, verticalAlign: 'top' };
