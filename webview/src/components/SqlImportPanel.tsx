import { useDeferredValue, useMemo, useState } from 'react';
import type { DdlDialect } from '@shared/DiagramModel';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useMessages } from '../i18n';
import { SqlImport, buildSqlImport } from '../util/sqlImport/buildSqlImport';

const DIALECTS: { value: DdlDialect; label: string }[] = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'oracle', label: 'Oracle' },
  { value: 'sqlserver', label: 'SQL Server' },
  { value: 'sqlite', label: 'SQLite' },
];

/** A textarea this long makes typing slow */
const MAX_SHOWN_LENGTH = 200_000;
const MAX_SHOWN_WARNINGS = 50;

const countRows = (result: SqlImport) =>
  [...result.tables.map((t) => t.seedData ?? []), ...result.existingSeedRows.map((r) => r.rows)]
    .reduce((sum, rows) => sum + rows.length, 0);

export function SqlImportPanel() {
  const isOpen = useUiStore((s) => s.isSqlImportOpen);
  if (!isOpen) return null;
  return <SqlImportDialog />;
}

function SqlImportDialog() {
  const close = useUiStore((s) => s.closeSqlImport);
  const currentDialect = useUiStore((s) => s.dialect);
  const model = useDiagramStore((s) => s.model);
  const importSql = useDiagramStore((s) => s.importSql);
  const t = useMessages().sqlImport;

  const [source, setSource] = useState('');
  const [fileName, setFileName] = useState('');
  const [dialect, setDialect] = useState<DdlDialect>(currentDialect);
  const [replaceSeedData, setReplaceSeedData] = useState(false);
  const [imported, setImported] = useState(false);

  const deferredSource = useDeferredValue(source);
  const result = useMemo(
    () => (deferredSource.trim() ? buildSqlImport(deferredSource, model, dialect) : null),
    [deferredSource, model, dialect],
  );

  const edit = (text: string, name = '') => {
    setSource(text);
    setFileName(name);
    setImported(false);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;
    const reader = new FileReader();
    reader.onload = () => {
      edit(reader.result as string, file.name);
      // So the same file can be chosen again after fixing it
      input.value = '';
    };
    reader.readAsText(file);
  };

  const rows = result ? countRows(result) : 0;
  const hasContent = !!result && (result.tables.length > 0 || result.relations.length > 0 || rows > 0);

  const handleImport = () => {
    if (!result || !hasContent) return;
    importSql(result, replaceSeedData);
    edit('');
    setImported(true);
    setTimeout(() => window.dispatchEvent(new CustomEvent('er:fitView')), 50);
  };

  const tooLarge = source.length > MAX_SHOWN_LENGTH;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{t.title}</span>
          <button onClick={close} style={closeBtnStyle}>✕</button>
        </div>

        <div style={bodyStyle}>
          <p style={{ fontSize: 12, color: '#555', margin: 0 }}>{t.intro}</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={primaryBtnStyle}>
              {t.chooseFile}
              <input type="file" accept=".sql,.ddl,.txt,text/plain" style={{ display: 'none' }} onChange={handleFile} />
            </label>
            <label style={{ fontSize: 12, color: '#555' }}>
              {t.dialect}{' '}
              <select value={dialect} onChange={(e) => setDialect(e.target.value as DdlDialect)} style={{ fontSize: 12 }}>
                {DIALECTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
            {source && <button onClick={() => edit('')} style={secondaryBtnStyle}>{t.clear}</button>}
          </div>

          {tooLarge ? (
            <div style={largeFileStyle}>{t.largeFile(fileName, `${Math.round(source.length / 1024)} KB`)}</div>
          ) : (
            <textarea
              value={source}
              onChange={(e) => edit(e.target.value)}
              placeholder={t.placeholder}
              spellCheck={false}
              style={textareaStyle}
            />
          )}

          {imported && <div style={successStyle}>✓ {t.imported}</div>}

          {result && (
            <div style={previewStyle}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.preview}</div>
              <div>
                {hasContent
                  ? [t.tables(result.tables.length), t.relations(result.relations.length), t.rows(rows)].join(' / ')
                  : t.nothing}
              </div>
              {result.skippedTableNames.length > 0 && (
                <div style={{ color: '#666', marginTop: 4 }}>{t.skipped(result.skippedTableNames.join(', '))}</div>
              )}
              {result.existingSeedRows.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={replaceSeedData} onChange={(e) => setReplaceSeedData(e.target.checked)} />
                  {t.replaceSeedData}
                </label>
              )}
              {result.warnings.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700, color: '#b26a00' }}>{t.warnings(result.warnings.length)}</div>
                  <ul style={warningListStyle}>
                    {result.warnings.slice(0, MAX_SHOWN_WARNINGS).map((w, i) => (
                      <li key={i}>{t.warningMessages[w.code](w.subject)}</li>
                    ))}
                    {result.warnings.length > MAX_SHOWN_WARNINGS && (
                      <li>{t.moreWarnings(result.warnings.length - MAX_SHOWN_WARNINGS)}</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={footerStyle}>
          <button
            onClick={handleImport}
            disabled={!hasContent}
            style={{ ...primaryBtnStyle, opacity: hasContent ? 1 : 0.4, cursor: hasContent ? 'pointer' : 'default' }}
          >
            {t.import}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: '#0005', zIndex: 50,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  paddingTop: 60,
};

const panelStyle: React.CSSProperties = {
  background: '#fff', color: '#222', borderRadius: 6,
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

const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#666',
};

const bodyStyle: React.CSSProperties = {
  padding: '14px 20px', overflowY: 'auto', flex: 1, minHeight: 0,
  display: 'flex', flexDirection: 'column', gap: 10,
};

const footerStyle: React.CSSProperties = {
  padding: '10px 20px', borderTop: '1px solid #e0e0e0', flexShrink: 0,
  display: 'flex', justifyContent: 'flex-end',
};

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-block', padding: '7px 16px',
  background: '#1a73e8', color: '#fff', borderRadius: 4,
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
  border: 'none',
};

const secondaryBtnStyle: React.CSSProperties = {
  background: '#eee', border: '1px solid #ccc', borderRadius: 4,
  padding: '5px 12px', cursor: 'pointer', fontSize: 12, color: '#333',
};

const textareaStyle: React.CSSProperties = {
  width: '100%', height: 220, boxSizing: 'border-box', resize: 'vertical',
  fontFamily: 'monospace', fontSize: 12, padding: 8,
  border: '1px solid #ccc', borderRadius: 4,
};

const largeFileStyle: React.CSSProperties = {
  padding: 12, fontSize: 12, color: '#555', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 4,
};

const successStyle: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 4, fontSize: 13,
  background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7',
};

const previewStyle: React.CSSProperties = {
  padding: '8px 12px', fontSize: 12, background: '#f7f9fb', border: '1px solid #e0e6ec', borderRadius: 4,
};

const warningListStyle: React.CSSProperties = {
  margin: '4px 0 0', paddingLeft: 18, maxHeight: 160, overflowY: 'auto', wordBreak: 'break-word',
};
