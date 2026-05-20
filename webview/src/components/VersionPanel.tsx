import { useState } from 'react';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { diffToCurrent } from '../util/schemaDiff';
import type { SchemaSnapshot } from '@shared/DiagramModel';

export function VersionPanel() {
  const isOpen       = useUiStore((s) => s.isVersionsOpen);
  const closeVersions = useUiStore((s) => s.closeVersions);
  const dialect      = useUiStore((s) => s.dialect);

  const model          = useDiagramStore((s) => s.model);
  const saveSnapshot   = useDiagramStore((s) => s.saveSnapshot);
  const deleteSnapshot = useDiagramStore((s) => s.deleteSnapshot);

  const [newName, setNewName] = useState('');
  const [diffId, setDiffId]   = useState<string | null>(null);

  if (!isOpen) return null;

  const snapshots = [...(model.snapshots ?? [])].reverse();
  const diffSnap  = snapshots.find((s) => s.id === diffId) ?? null;
  const diffDdl   = diffSnap ? diffToCurrent(diffSnap, model, dialect) : null;

  const handleSave = () => {
    const name = newName.trim() || new Date().toLocaleString();
    saveSnapshot(name);
    setNewName('');
  };

  const handleDelete = (snap: SchemaSnapshot) => {
    deleteSnapshot(snap.id);
    if (diffId === snap.id) setDiffId(null);
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700 }}>Schema Versions</span>
        <button onClick={closeVersions} style={closeBtnStyle}>✕</button>
      </div>

      {/* Save snapshot */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            placeholder="Snapshot name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            style={inputStyle}
          />
          <button onClick={handleSave} style={saveBtnStyle}>
            Save Snapshot
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
          Captures the current tables, columns, and relations.
        </div>
      </div>

      {/* Snapshot list */}
      <div style={{ padding: '10px 12px' }}>
        {snapshots.length === 0 ? (
          <div style={{ color: '#999', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
            No snapshots yet.
          </div>
        ) : (
          snapshots.map((snap) => (
            <div key={snap.id} style={snapRowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {snap.name}
                </div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {new Date(snap.date).toLocaleString()} · {snap.tables.length} tables
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  onClick={() => setDiffId(diffId === snap.id ? null : snap.id)}
                  style={{
                    ...smallBtnStyle,
                    ...(diffId === snap.id ? { background: '#4a7c9e', color: '#fff', borderColor: '#4a7c9e' } : {}),
                  }}
                  title="Show migration DDL from this snapshot to current state"
                >
                  Diff DDL
                </button>
                <button
                  onClick={() => handleDelete(snap)}
                  style={{ ...smallBtnStyle, color: '#c33' }}
                  title="Delete snapshot"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Diff DDL panel */}
      {diffDdl && diffSnap && (
        <div style={{ borderTop: '1px solid #eee', padding: '10px 12px' }}>
          <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: '#555' }}>
            Migration from "{diffSnap.name}" → current
          </div>
          <pre style={preStyle}>{diffDdl}</pre>
          <button
            onClick={() => navigator.clipboard.writeText(diffDdl).catch(() => {})}
            style={{ ...smallBtnStyle, marginTop: 6 }}
          >
            Copy DDL
          </button>
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 48,
  left: 12,
  width: 440,
  maxHeight: 'calc(100vh - 60px)',
  overflowY: 'auto',
  background: '#fff',
  border: '1px solid #ccc',
  borderRadius: 6,
  boxShadow: '0 4px 16px #0003',
  zIndex: 10,
};

const headerStyle: React.CSSProperties = {
  background: '#f5f5f5',
  borderBottom: '1px solid #ccc',
  padding: '8px 12px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  color: '#666',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
  padding: '4px 8px',
  border: '1px solid #ccc',
  borderRadius: 3,
};

const saveBtnStyle: React.CSSProperties = {
  background: '#4a7c9e',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 12,
  whiteSpace: 'nowrap',
};

const snapRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 0',
  borderBottom: '1px solid #f0f0f0',
};

const smallBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #ccc',
  borderRadius: 3,
  padding: '2px 7px',
  cursor: 'pointer',
  fontSize: 11,
  color: '#555',
};

const preStyle: React.CSSProperties = {
  background: '#f8f8f8',
  border: '1px solid #e0e0e0',
  borderRadius: 3,
  padding: '8px 10px',
  fontSize: 11,
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  maxHeight: 300,
  overflowY: 'auto',
  margin: 0,
};
