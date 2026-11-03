import { useState } from 'react';
import { Column, DictionaryEntry, columnTypeSpec, formatTypeSpec } from '@shared/DiagramModel';
import { useDiagramStore } from '../store/diagramStore';
import { useMessages } from '../i18n';
import { TypePicker } from './TypePicker';

interface Props {
  /** Table or column set the column belongs to */
  ownerId: string;
  column: Column;
  dictionary: DictionaryEntry[];
  onDelete: () => void;
  /** Name of the column set this column comes from; the row is then read-only */
  lockedBy?: string;
}

export function ColumnRow({ ownerId, column, dictionary, onDelete, lockedBy }: Props) {
  const updateColumn  = useDiagramStore((s) => s.updateColumn);
  const setColumnType = useDiagramStore((s) => s.setColumnType);
  const addColumnType = useDiagramStore((s) => s.addColumnType);
  const [noteOpen, setNoteOpen] = useState(false);
  const messages = useMessages();
  const t = messages.column;

  if (lockedBy !== undefined) {
    const spec = columnTypeSpec(column, dictionary);
    return (
      <div style={{ ...gridStyle, background: '#f7f9fb', color: '#666', borderBottom: '1px solid #eee' }} title={t.fromSetTitle(lockedBy)}>
        <input type="checkbox" checked={column.isPrimaryKey} disabled style={{ justifySelf: 'center' }} />
        <span style={lockedCell}>{column.logicalName}</span>
        <span style={lockedCell}>{column.physicalName}</span>
        <span style={lockedCell}>{spec ? formatTypeSpec(spec) : ''}</span>
        <label style={{ textAlign: 'center', fontSize: 11 }}>
          <input type="checkbox" checked={column.isNullable} disabled /> NULL
        </label>
        <span style={setBadge}>{lockedBy}</span>
      </div>
    );
  }

  return (
    <div style={{ borderBottom: '1px solid #eee' }}>
      <div style={gridStyle}>
        {/* PK toggle */}
        <label style={{ textAlign: 'center', cursor: 'pointer' }} title={messages.table.colPrimaryKey}>
          <input
            type="checkbox"
            checked={column.isPrimaryKey}
            onChange={(e) => updateColumn(ownerId, column.id, { isPrimaryKey: e.target.checked })}
          />
        </label>

        <input
          style={inputStyle}
          value={column.logicalName}
          placeholder={messages.common.logicalName}
          onChange={(e) => updateColumn(ownerId, column.id, { logicalName: e.target.value })}
        />

        <input
          style={inputStyle}
          value={column.physicalName}
          placeholder={messages.common.physicalName}
          onChange={(e) => updateColumn(ownerId, column.id, { physicalName: e.target.value })}
        />

        <TypePicker
          column={column}
          dictionary={dictionary}
          onSelectEntry={(entry) => setColumnType(ownerId, column.id, { entry })}
          onSelectType={(type) => setColumnType(ownerId, column.id, { type })}
          onRegister={(entry) => addColumnType(ownerId, column.id, entry)}
        />

        {/* Nullable toggle */}
        <label style={{ textAlign: 'center', cursor: 'pointer', fontSize: 11 }} title={t.nullableTitle}>
          <input
            type="checkbox"
            checked={column.isNullable}
            onChange={(e) => updateColumn(ownerId, column.id, { isNullable: e.target.checked })}
          />
          {' '}NULL
        </label>

        {/* Note toggle */}
        <button
          onClick={() => setNoteOpen((o) => !o)}
          style={{ ...noteBtnStyle, color: column.designNote ? '#4a7c9e' : '#aaa' }}
          title={messages.table.colNoteTitle}
        >
          {noteOpen ? '▲' : '▼'}
        </button>

        <button onClick={onDelete} style={deleteBtnStyle} title={t.deleteTitle}>
          −
        </button>
      </div>

      {noteOpen && (
        <textarea
          style={noteAreaStyle}
          placeholder={messages.common.designNotePlaceholder}
          value={column.designNote ?? ''}
          onChange={(e) => updateColumn(ownerId, column.id, { designNote: e.target.value || undefined })}
        />
      )}
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '28px 1fr 1fr 1.2fr 50px 28px 36px',
  gap: 4,
  alignItems: 'center',
  padding: '4px 0',
};

const lockedCell: React.CSSProperties = {
  fontSize: 12, padding: '2px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

/** Spans the note and delete columns */
const setBadge: React.CSSProperties = {
  gridColumn: 'span 2', fontSize: 10, color: '#4a7c9e', background: '#e8f0fe', borderRadius: 3,
  padding: '2px 4px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const inputStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 4px',
  border: '1px solid #ccc',
  borderRadius: 3,
  width: '100%',
  boxSizing: 'border-box',
};

const deleteBtnStyle: React.CSSProperties = {
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

const noteBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #ddd',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 10,
  width: 28,
  height: 26,
  padding: 0,
};

const noteAreaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 60,
  fontSize: 12,
  padding: '4px 6px',
  border: '1px solid #ccc',
  borderRadius: 3,
  resize: 'vertical',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  marginBottom: 4,
};
