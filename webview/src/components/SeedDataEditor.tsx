import { useRef, useState } from 'react';
import { Table } from '@shared/DiagramModel';

interface Props {
  table: Table;
  onUpdate: (seedData: Record<string, string>[]) => void;
}

function parseCsv(text: string): string[][] {
  return text.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
    const cells: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = !inQuote; }
      } else if (ch === ',' && !inQuote) {
        cells.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  });
}

export function SeedDataEditor({ table, onUpdate }: Props) {
  const { columns } = table;
  const seedData = table.seedData ?? [];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

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

  const downloadTemplate = () => {
    const header = columns.map((c) => `"${c.physicalName}"`).join(',');
    const blob = new Blob([header + '\n'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${table.physicalName}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length < 1) { setImportError('CSV is empty.'); return; }
      const headers = rows[0];
      if (headers.length === 0) { setImportError('Header row is required.'); return; }
      const physicalNames = columns.map((c) => c.physicalName);
      const colIndexes = headers.map((h) => physicalNames.indexOf(h.trim()));
      const newRows: Record<string, string>[] = rows.slice(1).map((cells) => {
        const row: Record<string, string> = {};
        columns.forEach((c) => { row[c.physicalName] = ''; });
        headers.forEach((h, i) => {
          const idx = colIndexes[i];
          if (idx >= 0) row[physicalNames[idx]] = cells[i] ?? '';
        });
        return row;
      });
      onUpdate([...seedData, ...newRows]);
    };
    reader.onerror = () => setImportError('Failed to read file.');
    reader.readAsText(file);
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
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={addRow} style={addBtnStyle}>+ Add Row</button>
        <button onClick={downloadTemplate} style={subBtnStyle} title="Download CSV template with column headers">
          ↓ CSV Template
        </button>
        <label style={{ ...subBtnStyle, cursor: 'pointer' }} title="Import rows from CSV (header row required)">
          ↑ Import CSV
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </label>
        {importError && (
          <span style={{ fontSize: 11, color: '#c33' }}>{importError}</span>
        )}
      </div>
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
  background: '#4a7c9e',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '5px 12px',
  cursor: 'pointer',
  fontSize: 12,
};

const subBtnStyle: React.CSSProperties = {
  background: '#555',
  color: '#eee',
  border: '1px solid #888',
  borderRadius: 4,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 11,
  display: 'inline-block',
};
