import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { ColumnRow } from './ColumnRow';

export function TableEditPanel() {
  const selectedTableId = useUiStore((s) => s.selectedTableId);
  const selectTable = useUiStore((s) => s.selectTable);

  const table      = useDiagramStore((s) => s.model.tables.find((t) => t.id === selectedTableId));
  const dictionary = useDiagramStore((s) => s.model.dictionary);
  const updateTable  = useDiagramStore((s) => s.updateTable);
  const deleteTable  = useDiagramStore((s) => s.deleteTable);
  const addColumn    = useDiagramStore((s) => s.addColumn);
  const deleteColumn = useDiagramStore((s) => s.deleteColumn);

  if (!selectedTableId || !table) return null;

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700 }}>Edit Table</span>
        <button onClick={() => selectTable(null)} style={closeBtnStyle}>✕</button>
      </div>

      <div style={{ padding: '10px 12px' }}>
        {/* Table names */}
        <div style={rowStyle}>
          <label style={labelStyle}>Logical name</label>
          <input
            style={inputStyle}
            value={table.logicalName}
            onChange={(e) => updateTable(selectedTableId, { logicalName: e.target.value })}
          />
        </div>
        <div style={rowStyle}>
          <label style={labelStyle}>Physical name</label>
          <input
            style={inputStyle}
            value={table.physicalName}
            onChange={(e) => updateTable(selectedTableId, { physicalName: e.target.value })}
          />
        </div>
        <div style={rowStyle}>
          <label style={labelStyle}>Comment</label>
          <input
            style={inputStyle}
            value={table.comment}
            onChange={(e) => updateTable(selectedTableId, { comment: e.target.value })}
          />
        </div>

        {/* Columns */}
        <div style={{ marginTop: 12, marginBottom: 4, fontWeight: 600, fontSize: 12, color: '#555' }}>
          Columns
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '28px 1fr 1fr 1fr 50px 36px',
            gap: 4,
            fontSize: 11,
            color: '#888',
            padding: '2px 0',
          }}
        >
          <span title="Primary Key" style={{ textAlign: 'center' }}>PK</span>
          <span>Logical</span>
          <span>Physical</span>
          <span>Type</span>
          <span>Null</span>
          <span />
        </div>

        {table.columns.map((col) => (
          <ColumnRow
            key={col.id}
            tableId={selectedTableId}
            column={col}
            dictionary={dictionary}
            onDelete={() => deleteColumn(selectedTableId, col.id)}
          />
        ))}

        <button
          onClick={() => addColumn(selectedTableId)}
          style={{ ...actionBtnStyle, marginTop: 8 }}
        >
          + Add Column
        </button>

        {/* Danger zone */}
        <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 10 }}>
          <button
            onClick={() => {
              deleteTable(selectedTableId);
              selectTable(null);
            }}
            style={{ ...actionBtnStyle, background: '#c33', color: '#fff' }}
          >
            Delete Table
          </button>
        </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 48,
  right: 12,
  width: 520,
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

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 };
const labelStyle: React.CSSProperties = { width: 100, fontSize: 12, color: '#555', flexShrink: 0 };
const inputStyle: React.CSSProperties = {
  flex: 1, fontSize: 13, padding: '3px 6px',
  border: '1px solid #ccc', borderRadius: 3,
};

const actionBtnStyle: React.CSSProperties = {
  background: '#4a7c9e',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '5px 12px',
  cursor: 'pointer',
  fontSize: 12,
};
