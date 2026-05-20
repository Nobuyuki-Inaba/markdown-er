import { Table } from '@shared/DiagramModel';

interface Props {
  table: Table;
  onUpdate: (seedData: Record<string, string>[]) => void;
}

export function SeedDataEditor({ table, onUpdate }: Props) {
  const { columns } = table;
  const seedData = table.seedData ?? [];

  if (columns.length === 0) {
    return (
      <div style={{ color: '#aaa', fontSize: 12, padding: '8px 0' }}>
        No columns defined. Add columns first.
      </div>
    );
  }

  const addRow = () => {
    const newRow: Record<string, string> = {};
    columns.forEach((c) => { newRow[c.physicalName] = ''; });
    onUpdate([...seedData, newRow]);
  };

  const updateCell = (rowIdx: number, physicalName: string, value: string) => {
    onUpdate(seedData.map((row, i) =>
      i === rowIdx ? { ...row, [physicalName]: value } : row
    ));
  };

  const deleteRow = (rowIdx: number) => {
    onUpdate(seedData.filter((_, i) => i !== rowIdx));
  };

  return (
    <div>
      <div style={{ overflowX: 'auto', fontSize: 12 }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '100%', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th style={thStyle} />
              {columns.map((col) => (
                <th key={col.id} style={thStyle} title={`physicalName: ${col.physicalName}`}>
                  {col.logicalName}
                  <div style={{ fontWeight: 400, color: '#999', fontSize: 10 }}>
                    {col.physicalName}
                  </div>
                </th>
              ))}
              <th style={{ ...thStyle, width: 28 }} />
            </tr>
          </thead>
          <tbody>
            {seedData.map((row, rowIdx) => (
              <tr key={rowIdx}>
                <td style={{ ...tdStyle, color: '#bbb', textAlign: 'center', fontSize: 11, userSelect: 'none' }}>
                  {rowIdx + 1}
                </td>
                {columns.map((col) => (
                  <td key={col.id} style={tdStyle}>
                    <input
                      style={cellInputStyle}
                      value={row[col.physicalName] ?? ''}
                      onChange={(e) => updateCell(rowIdx, col.physicalName, e.target.value)}
                    />
                  </td>
                ))}
                <td style={tdStyle}>
                  <button onClick={() => deleteRow(rowIdx)} style={delBtnStyle} title="Delete row">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {seedData.length === 0 && (
          <div style={{ color: '#bbb', fontSize: 11, padding: '6px 4px' }}>
            No rows yet. Click "+ Add Row" to start.
          </div>
        )}
      </div>
      <button onClick={addRow} style={addBtnStyle}>
        + Add Row
      </button>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  background: '#f5f5f5',
  border: '1px solid #ddd',
  padding: '4px 8px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 11,
  color: '#555',
  whiteSpace: 'nowrap',
  minWidth: 80,
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #eee',
  padding: '2px 4px',
};

const cellInputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 70,
  fontSize: 12,
  padding: '2px 4px',
  border: '1px solid #ccc',
  borderRadius: 2,
  boxSizing: 'border-box',
};

const delBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: '#c33',
  fontSize: 12,
  padding: '0 4px',
};

const addBtnStyle: React.CSSProperties = {
  marginTop: 8,
  background: '#4a7c9e',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '5px 12px',
  cursor: 'pointer',
  fontSize: 12,
};
