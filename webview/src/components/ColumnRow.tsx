import { Column, DictionaryEntry } from '@shared/DiagramModel';
import { useDiagramStore } from '../store/diagramStore';

interface Props {
  tableId: string;
  column: Column;
  dictionary: DictionaryEntry[];
  onDelete: () => void;
}

export function ColumnRow({ tableId, column, dictionary, onDelete }: Props) {
  const updateColumn = useDiagramStore((s) => s.updateColumn);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr 1fr 1fr 50px 36px',
        gap: 4,
        alignItems: 'center',
        padding: '4px 0',
        borderBottom: '1px solid #eee',
      }}
    >
      {/* PK toggle */}
      <label style={{ textAlign: 'center', cursor: 'pointer' }} title="Primary Key">
        <input
          type="checkbox"
          checked={column.isPrimaryKey}
          onChange={(e) =>
            updateColumn(tableId, column.id, { isPrimaryKey: e.target.checked })
          }
        />
      </label>

      {/* Logical name */}
      <input
        style={inputStyle}
        value={column.logicalName}
        placeholder="Logical name"
        onChange={(e) => updateColumn(tableId, column.id, { logicalName: e.target.value })}
      />

      {/* Physical name */}
      <input
        style={inputStyle}
        value={column.physicalName}
        placeholder="Physical name"
        onChange={(e) => updateColumn(tableId, column.id, { physicalName: e.target.value })}
      />

      {/* Dictionary type */}
      <select
        style={inputStyle}
        value={column.dictionaryId}
        onChange={(e) => updateColumn(tableId, column.id, { dictionaryId: e.target.value })}
      >
        <option value="">— select type —</option>
        {dictionary.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}{e.length ? `(${e.length})` : ''} [{e.dbType}]
          </option>
        ))}
      </select>

      {/* Nullable toggle */}
      <label style={{ textAlign: 'center', cursor: 'pointer', fontSize: 11 }} title="Nullable">
        <input
          type="checkbox"
          checked={column.isNullable}
          onChange={(e) => updateColumn(tableId, column.id, { isNullable: e.target.checked })}
        />
        {' '}NULL
      </label>

      {/* Delete */}
      <button onClick={onDelete} style={btnStyle} title="Delete column">
        −
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 4px',
  border: '1px solid #ccc',
  borderRadius: 3,
  width: '100%',
  boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  background: '#e55',
  color: '#fff',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 14,
  lineHeight: '22px',
  width: 28,
  height: 26,
};
