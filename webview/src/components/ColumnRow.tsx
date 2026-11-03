import { useState } from 'react';
import { Column, DictionaryEntry, DbType, DB_TYPES, typeSizeSuffix } from '@shared/DiagramModel';
import { useDiagramStore } from '../store/diagramStore';
import { useMessages } from '../i18n';

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
  scale: string;
  notNull: boolean;
  comment: string;
}

const EMPTY_FORM: CustomTypeForm = { name: '', dbType: 'VARCHAR', length: '', scale: '', notNull: true, comment: '' };

export function ColumnRow({ tableId, column, dictionary, onDelete }: Props) {
  const updateColumn  = useDiagramStore((s) => s.updateColumn);
  const addColumnType = useDiagramStore((s) => s.addColumnType);
  const [noteOpen, setNoteOpen]     = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [form, setForm]             = useState<CustomTypeForm>(EMPTY_FORM);
  // Free-form text the user is currently typing in the type field
  const [typeText, setTypeText]     = useState('');
  const messages = useMessages();
  const t = messages.column;

  const currentEntry = dictionary.find((e) => e.id === column.dictionaryId);
  // Show typeText while the user is typing; otherwise show the current entry name
  const typeDisplayValue = typeText !== '' ? typeText : (currentEntry?.name ?? '');

  // True when the user has typed something that doesn't match any dict entry
  const unregistered = typeText.trim() !== '' &&
    !dictionary.find((e) => e.name.toLowerCase() === typeText.trim().toLowerCase());

  const handleTypeChange = (value: string) => {
    setTypeText(value);
    if (!value.trim()) {
      updateColumn(tableId, column.id, { dictionaryId: '' });
      return;
    }
    const match = dictionary.find((e) => e.name.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      updateColumn(tableId, column.id, { dictionaryId: match.id });
      setTypeText('');   // commit — input reverts to entry name display
      setCustomOpen(false);
    }
  };

  const handleOpenCustom = () => {
    const next = !customOpen;
    setCustomOpen(next);
    if (next) {
      // Pre-fill name from whatever the user typed (if unregistered)
      setForm(typeText.trim() ? { ...EMPTY_FORM, name: typeText.trim() } : EMPTY_FORM);
    }
  };

  const handleRegister = () => {
    if (!form.name.trim()) return;
    addColumnType(tableId, column.id, {
      name: form.name.trim(),
      dbType: form.dbType,
      length: form.length ? parseInt(form.length, 10) : null,
      scale: form.dbType === 'DECIMAL' && form.scale ? parseInt(form.scale, 10) : null,
      notNull: form.notNull,
      comment: form.comment,
    });
    setCustomOpen(false);
    setForm(EMPTY_FORM);
    setTypeText('');
  };

  const datalistId = `dict-list-${column.id}`;

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
        <label style={{ textAlign: 'center', cursor: 'pointer' }} title={messages.table.colPrimaryKey}>
          <input
            type="checkbox"
            checked={column.isPrimaryKey}
            onChange={(e) => updateColumn(tableId, column.id, { isPrimaryKey: e.target.checked })}
          />
        </label>

        {/* Logical name */}
        <input
          style={inputStyle}
          value={column.logicalName}
          placeholder={messages.common.logicalName}
          onChange={(e) => updateColumn(tableId, column.id, { logicalName: e.target.value })}
        />

        {/* Physical name */}
        <input
          style={inputStyle}
          value={column.physicalName}
          placeholder={messages.common.physicalName}
          onChange={(e) => updateColumn(tableId, column.id, { physicalName: e.target.value })}
        />

        {/* Type combo: free-text input + datalist + register toggle */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <input
            list={datalistId}
            style={{
              ...inputStyle,
              flex: 1,
              borderColor: unregistered ? '#e8a000' : undefined,
              background: unregistered ? '#fffbe6' : undefined,
            }}
            value={typeDisplayValue}
            placeholder={t.typePlaceholder}
            onChange={(e) => handleTypeChange(e.target.value)}
            title={unregistered ? t.unregisteredTitle(typeText.trim()) : t.typeTitle}
          />
          <datalist id={datalistId}>
            {dictionary.map((e) => (
              <option key={e.id} value={e.name}>
                {e.dbType}{typeSizeSuffix(e)}
              </option>
            ))}
          </datalist>
          <button
            onClick={handleOpenCustom}
            style={customToggleBtnStyle(customOpen, unregistered)}
            title={
              unregistered
                ? t.registerTitle(typeText.trim())
                : customOpen
                  ? t.closeCustomTitle
                  : t.openCustomTitle
            }
          >
            {customOpen ? '▲' : '+'}
          </button>
        </div>

        {/* Nullable toggle */}
        <label style={{ textAlign: 'center', cursor: 'pointer', fontSize: 11 }} title={t.nullableTitle}>
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
          title={messages.table.colNoteTitle}
        >
          {noteOpen ? '▲' : '▼'}
        </button>

        {/* Delete */}
        <button onClick={onDelete} style={deleteBtnStyle} title={t.deleteTitle}>
          −
        </button>
      </div>

      {/* Custom type form */}
      {customOpen && (
        <div style={customFormStyle}>
          <span style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap' }}>{t.newType}</span>
          <input
            style={{ ...formInput, flex: 1, minWidth: 80 }}
            placeholder={t.namePlaceholder}
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
            placeholder={t.lengthPlaceholder}
            value={form.length}
            onChange={(e) => setForm({ ...form, length: e.target.value })}
          />
          {form.dbType === 'DECIMAL' && (
            <input
              style={{ ...formInput, width: 44 }}
              type="number"
              placeholder={t.scalePlaceholder}
              value={form.scale}
              onChange={(e) => setForm({ ...form, scale: e.target.value })}
            />
          )}
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
            placeholder={t.commentPlaceholder}
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
          />
          <button
            onClick={handleRegister}
            disabled={!form.name.trim()}
            style={registerBtnStyle(!form.name.trim())}
            title={t.registerButtonTitle}
          >
            {t.register}
          </button>
        </div>
      )}

      {/* Design note */}
      {noteOpen && (
        <textarea
          style={noteAreaStyle}
          placeholder={messages.common.designNotePlaceholder}
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

const customToggleBtnStyle = (active: boolean, warn: boolean): React.CSSProperties => ({
  background: warn ? '#e8a000' : active ? '#4a7c9e' : '#e8f0fe',
  color: warn || active ? '#fff' : '#4a7c9e',
  border: `1px solid ${warn ? '#e8a000' : '#4a7c9e'}`,
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
