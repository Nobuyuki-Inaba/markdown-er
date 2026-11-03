import { useState } from 'react';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useMessages } from '../i18n';
import { genId } from '../util/idgen';
import { auditColumnSet } from '../util/columnSets';
import { ColumnRow } from './ColumnRow';

/** Define column sets (e.g. audit columns); tables pick them in the table editor */
export function ColumnSetPanel() {
  const isOpen = useUiStore((s) => s.isColumnSetsOpen);
  const close  = useUiStore((s) => s.closeColumnSets);

  const columnSets = useDiagramStore((s) => s.model.columnSets ?? []);
  const tables     = useDiagramStore((s) => s.model.tables);
  const dictionary = useDiagramStore((s) => s.model.dictionary);
  const addColumnSet        = useDiagramStore((s) => s.addColumnSet);
  const updateColumnSet     = useDiagramStore((s) => s.updateColumnSet);
  const deleteColumnSet     = useDiagramStore((s) => s.deleteColumnSet);
  const applyColumnSetToAll = useDiagramStore((s) => s.applyColumnSetToAll);
  const addColumn           = useDiagramStore((s) => s.addColumn);
  const deleteColumn        = useDiagramStore((s) => s.deleteColumn);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const messages = useMessages();
  const t = messages.columnSets;

  if (!isOpen) return null;

  const selected = columnSets.find((s) => s.id === selectedId) ?? columnSets[0];
  const usedBy = selected ? tables.filter((tb) => tb.columnSetIds?.includes(selected.id)).length : 0;

  const create = (preset: boolean) => {
    const set = preset
      ? auditColumnSet(t.audit)
      : { id: genId('cset'), name: t.newSetName, position: 'end' as const, columns: [] };
    addColumnSet(set);
    setSelectedId(set.id);
    setConfirmDelete(false);
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700 }}>{t.title}</span>
        <button onClick={close} style={closeBtnStyle}>✕</button>
      </div>

      <div style={{ display: 'flex', minHeight: 280, maxHeight: 'calc(100vh - 140px)' }}>
        {/* Set list */}
        <div style={listStyle}>
          {columnSets.map((cs) => (
            <button
              key={cs.id}
              onClick={() => { setSelectedId(cs.id); setConfirmDelete(false); }}
              style={listItemStyle(cs.id === selected?.id)}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cs.name || '—'}</span>
              <span style={{ fontSize: 10, color: '#999' }}>{cs.columns.length}</span>
            </button>
          ))}
          <button onClick={() => create(false)} style={addBtnStyle}>{t.add}</button>
          <button onClick={() => create(true)} style={addBtnStyle} title={t.addAuditTitle}>{t.addAudit}</button>
        </div>

        {/* Selected set */}
        <div style={{ flex: 1, padding: '10px 12px', overflowY: 'auto', minWidth: 0 }}>
          {!selected ? (
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.7 }}>{t.empty}</div>
          ) : (
            <>
              <div style={rowStyle}>
                <label style={labelStyle}>{messages.common.name}</label>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={selected.name}
                  onChange={(e) => updateColumnSet(selected.id, { name: e.target.value })}
                />
              </div>
              <div style={rowStyle}>
                <label style={labelStyle}>{t.position}</label>
                <select
                  style={inputStyle}
                  value={selected.position}
                  onChange={(e) => updateColumnSet(selected.id, { position: e.target.value as 'start' | 'end' })}
                >
                  <option value="start">{t.positionStart}</option>
                  <option value="end">{t.positionEnd}</option>
                </select>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                  <input
                    type="checkbox"
                    checked={selected.applyToNewTables ?? false}
                    onChange={(e) => updateColumnSet(selected.id, { applyToNewTables: e.target.checked || undefined })}
                  />
                  {t.applyToNewTables}
                </label>
              </div>
              <div style={{ ...rowStyle, fontSize: 12, color: '#666' }}>
                <span>{t.usedBy(usedBy, tables.length)}</span>
                <button
                  onClick={() => applyColumnSetToAll(selected.id)}
                  disabled={usedBy === tables.length}
                  style={{ ...smallBtnStyle, opacity: usedBy === tables.length ? 0.4 : 1 }}
                >
                  {t.applyToAll}
                </button>
              </div>

              <div style={columnHeaderStyle}>
                <span title={messages.table.colPrimaryKey} style={{ textAlign: 'center' }}>PK</span>
                <span title={messages.table.colAutoIncrementTitle} style={{ textAlign: 'center' }}>{messages.table.colAutoIncrement}</span>
                <span>{messages.table.colLogical}</span>
                <span>{messages.table.colPhysical}</span>
                <span>{messages.table.colType}</span>
                <span title={messages.table.colSizeTitle}>{messages.table.colSize}</span>
                <span>{messages.table.colNull}</span>
                <span title={messages.table.colNoteTitle} style={{ textAlign: 'center' }}>{messages.table.colNote}</span>
                <span />
              </div>
              {selected.columns.map((col) => (
                <ColumnRow
                  key={col.id}
                  ownerId={selected.id}
                  column={col}
                  dictionary={dictionary}
                  onDelete={() => deleteColumn(selected.id, col.id)}
                />
              ))}
              <button onClick={() => addColumn(selected.id)} style={{ ...smallBtnStyle, marginTop: 8 }}>
                {messages.table.addColumn}
              </button>
              <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>{t.syncHint}</div>

              <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                {confirmDelete ? (
                  <>
                    <span style={{ fontSize: 12, color: '#c33' }}>{t.deleteConfirm}</span>
                    <button
                      onClick={() => { deleteColumnSet(selected.id); setSelectedId(null); setConfirmDelete(false); }}
                      style={{ ...smallBtnStyle, background: '#c33', color: '#fff', border: 'none' }}
                    >
                      {t.delete}
                    </button>
                    <button onClick={() => setConfirmDelete(false)} style={smallBtnStyle}>{messages.versions.cancel}</button>
                  </>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} style={{ ...smallBtnStyle, color: '#c33' }}>{t.delete}</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)',
  width: 820, maxWidth: '95vw',
  background: '#fff', border: '1px solid #ccc', borderRadius: 6,
  boxShadow: '0 4px 20px #0004', zIndex: 20, color: '#222',
};
const headerStyle: React.CSSProperties = {
  background: '#f5f5f5', borderBottom: '1px solid #ccc',
  padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#666' };
const listStyle: React.CSSProperties = {
  width: 170, flexShrink: 0, borderRight: '1px solid #eee', padding: 6, overflowY: 'auto',
  display: 'flex', flexDirection: 'column', gap: 2,
};
const listItemStyle = (selected: boolean): React.CSSProperties => ({
  display: 'flex', justifyContent: 'space-between', gap: 6, padding: '5px 8px', fontSize: 12, textAlign: 'left',
  border: 'none', borderRadius: 3, cursor: 'pointer', background: selected ? '#e8f0fe' : 'none', color: '#222',
});
const addBtnStyle: React.CSSProperties = {
  marginTop: 4, padding: '4px 8px', fontSize: 11, textAlign: 'left', border: '1px dashed #b0c4de',
  background: '#f8fbff', color: '#4a7c9e', borderRadius: 3, cursor: 'pointer',
};
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 };
const labelStyle: React.CSSProperties = { width: 70, fontSize: 12, color: '#555', flexShrink: 0 };
const inputStyle: React.CSSProperties = { fontSize: 12, padding: '3px 5px', border: '1px solid #ccc', borderRadius: 3 };
const smallBtnStyle: React.CSSProperties = {
  fontSize: 12, padding: '3px 10px', border: '1px solid #b0c4de', background: '#f0f4ff', color: '#4a7c9e',
  borderRadius: 3, cursor: 'pointer',
};
const columnHeaderStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '28px 32px 1fr 1fr 1.2fr 48px 50px 28px 36px', gap: 4,
  fontSize: 11, color: '#888', padding: '2px 0', marginTop: 6,
};
