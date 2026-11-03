import { useState } from 'react';
import type { DdlDialect } from '@shared/DiagramModel';
import { replacementPattern } from '@shared/ddlReplacements';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useMessages } from '../i18n';

/** Product names; not translated */
const DIALECT_LABELS: Record<DdlDialect, string> = {
  mysql: 'MySQL', postgresql: 'PostgreSQL', oracle: 'Oracle', sqlserver: 'SQL Server', sqlite: 'SQLite',
};

/**
 * The diagram's find / replace rules for the generated DDL, in the DDL dialog.
 * The extension host applies them; the dialog regenerates the DDL when they change.
 */
export function DdlReplacementsEditor() {
  const t = useMessages().ddl.replacements;
  const rules   = useDiagramStore((s) => s.model.ddlReplacements ?? []);
  const add     = useDiagramStore((s) => s.addDdlReplacement);
  const update  = useDiagramStore((s) => s.updateDdlReplacement);
  const remove  = useDiagramStore((s) => s.deleteDdlReplacement);
  const dialect = useUiStore((s) => s.dialect);
  const [open, setOpen] = useState(rules.length > 0);

  const active = rules.filter((r) => r.enabled !== false && (!r.dialect || r.dialect === dialect)).length;

  return (
    <div style={{ padding: '8px 14px', borderBottom: '1px solid #2a2a2a' }}>
      <button onClick={() => setOpen((o) => !o)} style={toggleStyle} aria-expanded={open}>
        {open ? '▾' : '▸'} {t.title} {rules.length > 0 && <span style={{ color: '#888' }}>{t.count(active, rules.length)}</span>}
      </button>

      {open && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>{t.hint}</div>
          {rules.map((r) => {
            const invalid = !!r.find && !replacementPattern(r);
            return (
              <div key={r.id} style={rowStyle}>
                <input type="checkbox" checked={r.enabled !== false} title={t.enabled}
                  onChange={(e) => update(r.id, { enabled: e.target.checked ? undefined : false })} />
                <select style={inputStyle} value={r.dialect ?? ''} title={t.dialect}
                  onChange={(e) => update(r.id, { dialect: (e.target.value || undefined) as DdlDialect | undefined })}>
                  <option value="">{t.allDialects}</option>
                  {Object.entries(DIALECT_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
                <input style={{ ...inputStyle, ...(invalid ? { borderColor: '#e55' } : {}) }} value={r.find}
                  placeholder={t.find} title={invalid ? t.invalidRegex : t.find}
                  onChange={(e) => update(r.id, { find: e.target.value })} />
                <span style={{ color: '#888' }}>→</span>
                <input style={inputStyle} value={r.replace} placeholder={t.replace}
                  onChange={(e) => update(r.id, { replace: e.target.value })} />
                <label style={regexLabelStyle} title={t.regexTitle}>
                  <input type="checkbox" checked={!!r.regex} onChange={(e) => update(r.id, { regex: e.target.checked || undefined })} />
                  .*
                </label>
                <button onClick={() => remove(r.id)} style={deleteStyle} title={t.delete}>✕</button>
              </div>
            );
          })}
          <button onClick={() => add({ dialect, find: '', replace: '' })} style={addStyle}>{t.add}</button>
        </div>
      )}
    </div>
  );
}

const toggleStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#ccc', fontSize: 12, cursor: 'pointer', padding: 0,
};
const rowStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '18px 110px 1fr 14px 1fr 36px 24px', gap: 6, alignItems: 'center', marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  background: '#2a2a2a', color: '#ddd', border: '1px solid #555', borderRadius: 3, padding: '3px 6px',
  fontSize: 12, fontFamily: 'monospace', minWidth: 0,
};
const regexLabelStyle: React.CSSProperties = {
  fontSize: 11, color: '#ccc', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer',
};
const deleteStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#e77', cursor: 'pointer', fontSize: 12, padding: 0,
};
const addStyle: React.CSSProperties = {
  marginTop: 4, background: '#333', color: '#ddd', border: '1px solid #555', borderRadius: 3,
  padding: '3px 10px', fontSize: 12, cursor: 'pointer',
};
