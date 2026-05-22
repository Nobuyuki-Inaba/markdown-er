import { useState } from 'react';
import { Column, DictionaryEntry, DbType, DB_TYPES } from '@shared/DiagramModel';
import { useDiagramStore } from '../store/diagramStore';

interface Props {
  tableId: string;
  column: Column;
  dictionary: DictionaryEntry[];
  onDelete: () => void;
}

interface CustomTypeForm {
  name: string;
  dbType: DbType;
  length: string;
  notNull: boolean;
  comment: string;
}

const EMPTY_FORM: CustomTypeForm = { name: '', dbType: 'VARCHAR', length: '', notNull: true, comment: '' };

export function ColumnRow({ tableId, column, dictionary, onDelete }: Props) {
  const updateColumn   = useDiagramStore((s) => s.updateColumn);
  const addColumnType  = useDiagramStore((s) => s.addColumnType);
  const [noteOpen, setNoteOpen]     = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [form, setForm]             = useState<CustomTypeForm>(EMPTY_FORM);

  const handleRegister = () => {
    if (!form.name.trim()) return;
    addColumnType(tableId, column.id, {
      name: form.name.trim(),
      dbType: form.dbType,
      length: form.length ? parseInt(form.length, 10) : null,
      notNull: form.notNull,
      comment: form.comment,
    });
    setCustomOpen(false);
    setForm(EMPTY_FORM);
  };

  return (
    <div style={{ borderBottom: '1px solid #eee' }}>
      {/* Main row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '28px 1fr 1fr 1fr 50px 28px 36px',
          gap: 4,
          alignItems: 'center',
          padding: '4px 0',
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

        {/* Dictionary type + custom-type toggle */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <select
            style={{ ...inputStyle, flex: 1 }}
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
          <button
            onClick={() => setCustomOpen((o) => !o)}
            style={customToggleBtnStyle(customOpen)}
            title="Define a new type and register it to the dictionary"
          >
            {customOpen ? '▲' : '+'}
          </button>
        </div>

        {/* Nullable toggle */}
        <label style={{ textAlign: 'center', cursor: 'pointer', fontSize: 11 }} title="Nullable">
          <input
            type="checkbox"
            checked={column.isNullable}
            onChange={(e) => updateColumn(tableId, column.id, { isNullable: e.target.checked })}
          />
          {' '}NULL
        </label>

        {/* Note toggle */}
        <button
          onClick={() => setNoteOpen((o) => !o)}
          style={{ ...noteBtnStyle, color: column.designNote ? '#4a7c9e' : '#aaa' }}
          title="Design note"
        >
          {noteOpen ? '▲' : '▼'}
        </button>

        {/* Delete */}
        <button onClick={onDelete} style={deleteBtnStyle} title="Delete column">
          −
        </button>
      </div>

      {/* Custom type form */}
      {customOpen && (
        <div style={customFormStyle}>
          <span style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap' }}>New type:</span>
          <input
            style={{ ...formInput, flex: 1, minWidth: 80 }}
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select
            style={{ ...formInput, width: 90 }}
            value={form.dbType}
            onChange={(e) => setForm({ ...form, dbType: e.target.value as DbType })}
          >
            {DB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            style={{ ...formInput, width: 44 }}
            type="number"
            placeholder="len"
            value={form.length}
            onChange={(e) => setForm({ ...form, length: e.target.value })}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.notNull}
              onChange={(e) => setForm({ ...form, notNull: e.target.checked })}
            />
            NOT NULL
          </label>
          <input
            style={{ ...formInput, flex: 1, minWidth: 60 }}
            placeholder="comment"
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
          />
          <button
            onClick={handleRegister}
            disabled={!form.name.trim()}
            style={registerBtnStyle(!form.name.trim())}
            title="Create dictionary entry and assign to this column"
          >
            Register &amp; use
          </button>
        </div>
      )}

      {/* Design note */}
      {noteOpen && (
        <textarea
          style={noteAreaStyle}
          placeholder="Record design decisions, rationale, trade-offs…"
          value={column.designNote ?? ''}
          onChange={(e) => updateColumn(tableId, column.id, { designNote: e.target.value || undefined })}
        />
      )}
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

const customToggleBtnStyle = (active: boolean): React.CSSProperties => ({
  background: active ? '#4a7c9e' : '#e8f0fe',
  color: active ? '#fff' : '#4a7c9e',
  border: '1px solid #4a7c9e',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
  width: 22,
  height: 22,
  flexShrink: 0,
  padding: 0,
  lineHeight: '20px',
  textAlign: 'center',
});

const customFormStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '6px 4px 6px 8px',
  background: '#f0f4ff',
  borderRadius: 4,
  marginBottom: 4,
  flexWrap: 'wrap',
};

const formInput: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 4px',
  border: '1px solid #b0c4de',
  borderRadius: 3,
  boxSizing: 'border-box',
};

const registerBtnStyle = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? '#ccc' : '#4a7c9e',
  color: '#fff',
  border: 'none',
  borderRadius: 3,
  padding: '3px 9px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: 'nowrap',
});

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
