import { DATABASE_OPTION_FIELDS } from '@shared/databaseOptions';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useMessages } from '../i18n';

/** Database / schema / user and the active dialect's CREATE DATABASE options */
export function DatabasePanel() {
  const isOpen  = useUiStore((s) => s.isDatabaseOpen);
  const close   = useUiStore((s) => s.closeDatabase);
  const dialect = useUiStore((s) => s.dialect);
  const database              = useDiagramStore((s) => s.model.database);
  const updateDatabase        = useDiagramStore((s) => s.updateDatabase);
  const updateDatabaseOptions = useDiagramStore((s) => s.updateDatabaseOptions);
  const t = useMessages();

  if (!isOpen) return null;

  const options = database?.options[dialect] ?? {};
  const fields = DATABASE_OPTION_FIELDS[dialect];

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700 }}>{t.database.title}</span>
        <button onClick={close} style={closeBtnStyle} title={t.common.close}>✕</button>
      </div>

      <div style={{ padding: '10px 12px' }}>
        <div style={rowStyle}>
          <label style={labelStyle}>{t.database.name}</label>
          <input style={inputStyle} value={database?.name ?? ''}
            onChange={(e) => updateDatabase({ name: e.target.value })} />
        </div>
        <div style={rowStyle}>
          <label style={labelStyle}>{t.database.schema}</label>
          <input style={inputStyle} value={database?.schema ?? ''}
            onChange={(e) => updateDatabase({ schema: e.target.value || undefined })} />
        </div>
        <div style={rowStyle}>
          <label style={labelStyle}>{t.database.user}</label>
          <input style={inputStyle} value={database?.user ?? ''}
            onChange={(e) => updateDatabase({ user: e.target.value || undefined })} />
        </div>
        <div style={noteStyle}>{t.database.passwordNote}</div>

        <div style={sectionStyle}>{t.database.optionsFor(dialect)}</div>
        {fields.map((f) => {
          const listId = `db-${dialect}-${f.key}`;
          return (
            <div key={f.key} style={rowStyle}>
              <label style={{ ...labelStyle, fontFamily: 'monospace' }}>{f.label}</label>
              <input
                style={inputStyle}
                list={listId}
                value={options[f.key] ?? ''}
                placeholder={f.defaultValue ? t.database.defaultHint(f.defaultValue) : ''}
                onChange={(e) => updateDatabaseOptions(dialect, { [f.key]: e.target.value || undefined })}
              />
              <datalist id={listId}>
                {f.suggestions.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
          );
        })}

        <div style={noteStyle}>{t.database.dialectHints[dialect]}</div>
        <div style={noteStyle}>{t.database.exportHint}</div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute', top: 48, right: 12, width: 420,
  background: '#fff', border: '1px solid #ccc', borderRadius: 6,
  boxShadow: '0 4px 16px #0003', zIndex: 10,
};
const headerStyle: React.CSSProperties = {
  background: '#f5f5f5', borderBottom: '1px solid #ccc', padding: '8px 12px',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#666' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 };
const labelStyle: React.CSSProperties = { width: 130, fontSize: 12, color: '#555', flexShrink: 0 };
const inputStyle: React.CSSProperties = { flex: 1, fontSize: 13, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 3 };
const sectionStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#4a7c9e',
  borderBottom: '1px solid #e0e8f0', paddingBottom: 2, margin: '12px 0 6px',
};
const noteStyle: React.CSSProperties = { fontSize: 11, color: '#888', margin: '4px 0 8px', lineHeight: 1.5 };
