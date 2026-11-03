import { useEffect, useRef, useState } from 'react';
import {
  Column, DictionaryEntry, TypeSpec, columnTypeSpec, formatTypeSize, parseTypeSize, typeTakesSize,
} from '@shared/DiagramModel';
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const sizeRef = useRef<HTMLInputElement>(null);
  const messages = useMessages();
  const t = messages.column;

  const entry = dictionary.find((e) => e.id === column.dictionaryId);
  const hasDetails = !!(column.comment || column.defaultValue || column.designNote);
  const spec = columnTypeSpec(column, dictionary);

  if (lockedBy !== undefined) {
    return (
      <div style={{ ...gridStyle, background: '#f7f9fb', color: '#666', borderBottom: '1px solid #eee' }} title={t.fromSetTitle(lockedBy)}>
        <input type="checkbox" checked={column.isPrimaryKey} disabled style={{ justifySelf: 'center' }} />
        <span style={lockedCell}>{column.logicalName}</span>
        <span style={lockedCell}>{column.physicalName}</span>
        <span style={lockedCell}>{entry?.name ?? spec?.dbType ?? ''}</span>
        <span style={lockedCell}>{spec ? formatTypeSize(spec) : ''}</span>
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
          onSelectType={(type) => {
            setColumnType(ownerId, column.id, { type });
            // Type first, then size: move on to the size cell once the picker has closed
            if (typeTakesSize(type.dbType)) setTimeout(() => sizeRef.current?.focus());
          }}
          onRegister={(entry) => addColumnType(ownerId, column.id, entry)}
        />

        <SizeInput
          inputRef={sizeRef}
          spec={spec}
          // A dictionary type's size is the dictionary's; a type without a size can't take one
          disabledTitle={entry ? t.sizeFromDictionary(entry.name)
            : !spec || !(typeTakesSize(spec.dbType) || spec.length != null) ? t.sizeNotApplicable
            : undefined}
          title={messages.table.colSizeTitle}
          onChange={(size) => column.type && setColumnType(ownerId, column.id, { type: { ...column.type, ...size } })}
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

        {/* Details toggle: filled when any detail is set, pressed while open */}
        <button
          onClick={() => setDetailsOpen((o) => !o)}
          style={noteBtnStyle(detailsOpen, hasDetails)}
          title={detailsOpen ? t.detailsHide : t.detailsShow}
          aria-expanded={detailsOpen}
        >
          <NoteIcon filled={hasDetails} />
        </button>

        <button onClick={onDelete} style={deleteBtnStyle} title={t.deleteTitle}>
          −
        </button>
      </div>

      {detailsOpen && (
        <div style={detailsGrid}>
          <label style={detailLabel}>{messages.common.comment}</label>
          <input
            autoFocus
            style={inputStyle}
            value={column.comment}
            onChange={(e) => updateColumn(ownerId, column.id, { comment: e.target.value })}
          />
          <span style={detailHint}>{t.commentHint}</span>

          <label style={detailLabel}>{t.defaultValue}</label>
          <input
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            value={column.defaultValue ?? ''}
            placeholder={t.defaultPlaceholder}
            onChange={(e) => updateColumn(ownerId, column.id, { defaultValue: e.target.value || null })}
          />
          <span style={detailHint}>{t.defaultHint}</span>

          <label style={detailLabel}>{messages.table.designNote}</label>
          <textarea
            style={noteAreaStyle}
            placeholder={messages.common.designNotePlaceholder}
            value={column.designNote ?? ''}
            onChange={(e) => updateColumn(ownerId, column.id, { designNote: e.target.value || undefined })}
          />
          <span style={detailHint}>{t.designNoteHint}</span>
        </div>
      )}
    </div>
  );
}

interface SizeInputProps {
  inputRef: React.RefObject<HTMLInputElement>;
  spec: TypeSpec | undefined;
  /** Read-only, with this explanation */
  disabledTitle?: string;
  title: string;
  onChange: (size: Pick<TypeSpec, 'length' | 'scale'>) => void;
}

/** "255" or "10,2"; applied while typing whenever the text is a valid size */
function SizeInput({ inputRef, spec, disabledTitle, title, onChange }: SizeInputProps) {
  const value = spec ? formatTypeSize(spec) : '';
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  // Only DECIMAL has a scale
  const parse = (text: string) => {
    const size = parseTypeSize(text);
    return size && (size.scale == null || spec?.dbType === 'DECIMAL') ? size : null;
  };
  const valid = parse(draft) !== null;

  return (
    <input
      ref={inputRef}
      style={{
        ...inputStyle,
        textAlign: 'right',
        fontFamily: 'monospace',
        ...(disabledTitle !== undefined ? { background: '#f3f3f3', color: '#888' } : {}),
        ...(valid ? {} : { borderColor: '#e55' }),
      }}
      value={draft}
      disabled={disabledTitle !== undefined}
      title={disabledTitle ?? title}
      inputMode="numeric"
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setDraft(e.target.value);
        const size = parse(e.target.value);
        if (size) onChange(size);
      }}
      onBlur={() => setDraft(value)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '28px 1fr 1fr 1.2fr 48px 50px 28px 36px',
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

/** A sheet with a folded corner and text lines */
function NoteIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <path d="M3 1.5h5.5L11 4v8.5H3z" fill={filled ? 'currentColor' : 'none'} fillOpacity={0.15} strokeLinejoin="round" />
      <path d="M8.5 1.5V4H11" strokeLinejoin="round" />
      <path d="M5 6.5h4M5 8.5h4M5 10.5h2.5" strokeLinecap="round" />
    </svg>
  );
}

const noteBtnStyle = (open: boolean, hasNote: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: open ? '#e8f0fe' : '#fff',
  border: `1px solid ${open ? '#4a7c9e' : '#ddd'}`,
  borderRadius: 3,
  color: hasNote || open ? '#4a7c9e' : '#999',
  cursor: 'pointer',
  width: 28,
  height: 26,
  padding: 0,
});

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
};

/** Label, field, and whether the field is output */
const detailsGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '80px 1fr 150px', gap: '4px 8px', alignItems: 'start',
  margin: '0 0 6px 32px', padding: '6px 8px', background: '#f7f9fb', borderRadius: 3,
};
const detailLabel: React.CSSProperties = { fontSize: 11, color: '#555', paddingTop: 4 };
const detailHint: React.CSSProperties = { fontSize: 10, color: '#888', paddingTop: 5, lineHeight: 1.3 };
