import { useState } from 'react';
import { DictionaryEntry, DbType, DB_TYPES } from '@shared/DiagramModel';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';

export function DictionaryPanel() {
  const isOpen = useUiStore((s) => s.isDictionaryOpen);
  const close  = useUiStore((s) => s.closeDictionary);

  const dictionary           = useDiagramStore((s) => s.model.dictionary);
  const addDictionaryEntry   = useDiagramStore((s) => s.addDictionaryEntry);
  const updateDictionaryEntry = useDiagramStore((s) => s.updateDictionaryEntry);
  const deleteDictionaryEntry = useDiagramStore((s) => s.deleteDictionaryEntry);

  const [newEntry, setNewEntry] = useState<Omit<DictionaryEntry, 'id'>>({
    name: '',
    dbType: 'INT',
    length: null,
    notNull: true,
    comment: '',
  });

  if (!isOpen) return null;

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700 }}>Dictionary (Column Types)</span>
        <button onClick={close} style={closeBtnStyle}>✕</button>
      </div>

      <div style={{ padding: '10px 12px', overflowY: 'auto', maxHeight: 'calc(100vh - 140px)' }}>
        {/* Existing entries */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th style={th}>Name</th>
              <th style={th}>DB Type</th>
              <th style={th}>Length</th>
              <th style={th}>Not Null</th>
              <th style={th}>Comment</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {dictionary.map((entry) => (
              <tr key={entry.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={td}>
                  <input
                    style={cellInput}
                    value={entry.name}
                    onChange={(e) => updateDictionaryEntry(entry.id, { name: e.target.value })}
                  />
                </td>
                <td style={td}>
                  <select
                    style={cellInput}
                    value={entry.dbType}
                    onChange={(e) => updateDictionaryEntry(entry.id, { dbType: e.target.value as DbType })}
                  >
                    {DB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td style={td}>
                  <input
                    style={{ ...cellInput, width: 60 }}
                    type="number"
                    value={entry.length ?? ''}
                    placeholder="—"
                    onChange={(e) =>
                      updateDictionaryEntry(entry.id, {
                        length: e.target.value === '' ? null : parseInt(e.target.value, 10),
                      })
                    }
                  />
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={entry.notNull}
                    onChange={(e) => updateDictionaryEntry(entry.id, { notNull: e.target.checked })}
                  />
                </td>
                <td style={td}>
                  <input
                    style={cellInput}
                    value={entry.comment}
                    onChange={(e) => updateDictionaryEntry(entry.id, { comment: e.target.value })}
                  />
                </td>
                <td style={td}>
                  <button
                    onClick={() => deleteDictionaryEntry(entry.id)}
                    style={{ background: '#e55', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', padding: '2px 6px' }}
                  >
                    −
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Add new entry */}
        <div style={{ marginTop: 12, padding: '8px', background: '#f8f8f8', borderRadius: 4, border: '1px solid #e0e0e0' }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: '#555' }}>Add new type</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '140px 120px 70px 80px 1fr 64px',
            gap: 6,
            alignItems: 'center',
          }}>
            <input
              style={cellInput}
              placeholder="Name"
              value={newEntry.name}
              onChange={(e) => setNewEntry({ ...newEntry, name: e.target.value })}
            />
            <select
              style={cellInput}
              value={newEntry.dbType}
              onChange={(e) => setNewEntry({ ...newEntry, dbType: e.target.value as DbType })}
            >
              {DB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              style={cellInput}
              type="number"
              placeholder="Length"
              value={newEntry.length ?? ''}
              onChange={(e) =>
                setNewEntry({
                  ...newEntry,
                  length: e.target.value === '' ? null : parseInt(e.target.value, 10),
                })
              }
            />
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={newEntry.notNull}
                onChange={(e) => setNewEntry({ ...newEntry, notNull: e.target.checked })}
              />
              NOT NULL
            </label>
            <input
              style={cellInput}
              placeholder="Comment"
              value={newEntry.comment}
              onChange={(e) => setNewEntry({ ...newEntry, comment: e.target.value })}
            />
            <button
              onClick={() => {
                if (!newEntry.name.trim()) return;
                addDictionaryEntry(newEntry);
                setNewEntry({ name: '', dbType: 'INT', length: null, notNull: true, comment: '' });
              }}
              style={{ background: '#4a7c9e', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}
            >
              + Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)',
  width: 700, maxWidth: '95vw',
  background: '#fff', border: '1px solid #ccc', borderRadius: 6,
  boxShadow: '0 4px 20px #0004', zIndex: 20,
};
const headerStyle: React.CSSProperties = {
  background: '#f5f5f5', borderBottom: '1px solid #ccc',
  padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#666' };
const th: React.CSSProperties = { padding: '4px 6px', textAlign: 'left', fontSize: 11, color: '#666', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '3px 4px' };
const cellInput: React.CSSProperties = { fontSize: 12, padding: '2px 4px', border: '1px solid #ccc', borderRadius: 3, width: '100%', boxSizing: 'border-box' };
