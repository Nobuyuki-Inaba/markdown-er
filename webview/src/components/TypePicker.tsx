import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Column, DbType, DbTypeKind, DB_TYPES, DB_TYPE_KINDS, DictionaryEntry, TypeSpec, dbTypeKind, formatTypeSpec,
} from '@shared/DiagramModel';
import { useMessages } from '../i18n';

interface Props {
  column: Column;
  dictionary: DictionaryEntry[];
  onSelectEntry: (entry: DictionaryEntry) => void;
  onSelectType: (type: TypeSpec) => void;
  /** Create a dictionary entry and use it */
  onRegister: (entry: Omit<DictionaryEntry, 'id'>) => void;
}

/** Sensible size when a basic type is picked; editable afterwards */
const DEFAULT_SIZE: Partial<Record<DbType, Pick<TypeSpec, 'length' | 'scale'>>> = {
  VARCHAR: { length: 255 },
  CHAR: { length: 1 },
  DECIMAL: { length: 10, scale: 2 },
};

function basicType(dbType: DbType): TypeSpec {
  return { dbType, length: null, ...DEFAULT_SIZE[dbType] };
}

/** "varchar(50)", "DECIMAL(10, 2)", "int" → TypeSpec */
export function parseTypeText(text: string): TypeSpec | null {
  const m = text.trim().match(/^([A-Za-z]+)\s*(?:\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?$/);
  if (!m) return null;
  const dbType = m[1].toUpperCase() as DbType;
  if (!DB_TYPES.includes(dbType)) return null;
  return {
    dbType,
    length: m[2] ? parseInt(m[2], 10) : DEFAULT_SIZE[dbType]?.length ?? null,
    scale: m[3] ? parseInt(m[3], 10) : m[2] ? null : DEFAULT_SIZE[dbType]?.scale ?? null,
  };
}

interface RegisterForm {
  name: string;
  category: string;
  dbType: DbType;
  length: string;
  scale: string;
  notNull: boolean;
  comment: string;
}

/**
 * Column type selector: search, dictionary entries grouped by category, basic types,
 * "VARCHAR(50)"-style direct input and inline dictionary registration.
 */
export function TypePicker({ column, dictionary, onSelectEntry, onSelectType, onRegister }: Props) {
  const t = useMessages().typePicker;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<RegisterForm | null>(null);
  const [pos, setPos] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const entry = dictionary.find((e) => e.id === column.dictionaryId);
  const direct = entry ? undefined : column.type;

  const close = () => { setOpen(false); setQuery(''); setForm(null); };

  // Fixed position next to the trigger, so the panel's scroll area doesn't clip it
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 8);
    const left = Math.max(4, Math.min(r.left, window.innerWidth - width - 4));
    const below = window.innerHeight - r.bottom;
    setPos(below >= 360 || below >= r.top
      ? { left, top: r.bottom + 2, width, maxHeight: Math.min(480, below - 8) }
      : { left, bottom: window.innerHeight - r.top + 2, width, maxHeight: Math.min(480, r.top - 8) });
  }, [open]);

  // Close on outside click (capture: other panels stop propagation), Escape, or scrolling the page behind
  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) =>
      popoverRef.current?.contains(target as Node) || triggerRef.current?.contains(target as Node);
    const onDown = (e: PointerEvent) => { if (!inside(e.target)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onScroll = (e: Event) => { if (!inside(e.target)) close(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = (...texts: (string | undefined)[]) => !q || texts.some((s) => s?.toLowerCase().includes(q));

  // Dictionary: named categories alphabetically, then uncategorised entries by type kind
  const groups = useMemo(() => {
    const named = new Map<string, DictionaryEntry[]>();
    const byKind = new Map<DbTypeKind, DictionaryEntry[]>();
    for (const e of dictionary) {
      if (!matches(e.name, formatTypeSpec(e), e.category, e.comment)) continue;
      const cat = e.category?.trim();
      if (cat) named.set(cat, [...(named.get(cat) ?? []), e]);
      else byKind.set(dbTypeKind(e.dbType), [...(byKind.get(dbTypeKind(e.dbType)) ?? []), e]);
    }
    return [
      ...[...named.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, entries]) => ({ label, entries })),
      ...DB_TYPE_KINDS.filter(({ kind }) => byKind.has(kind)).map(({ kind }) => ({ label: t.kinds[kind], entries: byKind.get(kind)! })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictionary, q, t]);

  const basicGroups = DB_TYPE_KINDS
    .map(({ kind, types }) => ({ label: t.kinds[kind], types: types.filter((d) => matches(d, t.kinds[kind])) }))
    .filter((g) => g.types.length > 0);

  // Bring the current type into view when the list opens
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && !form) listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, form]);
  const parsed = parseTypeText(query);
  const categories = [...new Set(dictionary.map((e) => e.category?.trim()).filter(Boolean))].sort() as string[];

  const pickEntry = (e: DictionaryEntry) => { onSelectEntry(e); close(); };
  const pickType = (spec: TypeSpec) => { onSelectType(spec); close(); };

  const startRegister = () => {
    const base = parsed ?? (direct ?? { dbType: 'VARCHAR' as DbType, length: 255 });
    setForm({
      name: parsed ? '' : query.trim(),
      category: '',
      dbType: base.dbType,
      length: base.length != null ? String(base.length) : '',
      scale: base.scale != null ? String(base.scale) : '',
      notNull: true,
      comment: '',
    });
  };

  const submitRegister = () => {
    if (!form || !form.name.trim()) return;
    onRegister({
      name: form.name.trim(),
      category: form.category.trim() || undefined,
      dbType: form.dbType,
      length: form.length ? parseInt(form.length, 10) : null,
      scale: form.dbType === 'DECIMAL' && form.scale ? parseInt(form.scale, 10) : null,
      notNull: form.notNull,
      comment: form.comment,
    });
    close();
  };

  const label = entry ? entry.name : direct ? formatTypeSpec(direct) : t.placeholder;
  const sub = entry ? formatTypeSpec(entry) : direct ? t.directBadge : '';

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => (open ? close() : setOpen(true))}
        style={triggerStyle(open, !entry && !direct)}
        title={entry ? `${entry.name} — ${formatTypeSpec(entry)}` : t.triggerTitle}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {sub && <span style={subStyle}>{sub}</span>}
        <span style={{ marginLeft: 'auto', color: '#888', fontSize: 9 }}>▾</span>
      </button>

      {open && (
        <div ref={popoverRef} style={{ ...popoverStyle, ...pos }}>
          {form ? (
            <div style={{ padding: 10 }}>
              <div style={sectionTitle}>{t.registerTitle}</div>
              <div style={formGrid}>
                <label style={formLabel}>{t.name}</label>
                <input autoFocus style={formInput} value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitRegister(); }} />
                <label style={formLabel}>{t.category}</label>
                <input style={formInput} value={form.category} list="type-picker-categories"
                  placeholder={t.categoryPlaceholder}
                  onChange={(e) => setForm({ ...form, category: e.target.value })} />
                <datalist id="type-picker-categories">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
                <label style={formLabel}>{t.type}</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <select style={{ ...formInput, flex: 1 }} value={form.dbType}
                    onChange={(e) => setForm({ ...form, dbType: e.target.value as DbType })}>
                    {DB_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input style={{ ...formInput, width: 52 }} type="number" placeholder={t.length} value={form.length}
                    onChange={(e) => setForm({ ...form, length: e.target.value })} />
                  {form.dbType === 'DECIMAL' && (
                    <input style={{ ...formInput, width: 44 }} type="number" placeholder={t.scale} value={form.scale}
                      onChange={(e) => setForm({ ...form, scale: e.target.value })} />
                  )}
                </div>
                <span />
                <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={form.notNull} onChange={(e) => setForm({ ...form, notNull: e.target.checked })} />
                  NOT NULL
                </label>
                <label style={formLabel}>{t.comment}</label>
                <input style={formInput} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
                <button style={secondaryBtn} onClick={() => setForm(null)}>{t.back}</button>
                <button style={primaryBtn(!form.name.trim())} disabled={!form.name.trim()} onClick={submitRegister}>
                  {t.registerAndUse}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ padding: 6, borderBottom: '1px solid #eee' }}>
                <input
                  autoFocus
                  style={{ ...formInput, width: '100%' }}
                  placeholder={t.search}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    const first = groups[0]?.entries[0];
                    if (first) pickEntry(first);
                    else if (parsed) pickType(parsed);
                  }}
                />
              </div>

              <div ref={listRef} style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                {parsed && (
                  <button style={itemStyle(false)} onClick={() => pickType(parsed)}>
                    <span>{t.useDirect(formatTypeSpec(parsed))}</span>
                  </button>
                )}

                {direct && !q && (
                  <div style={{ padding: '6px 10px', background: '#f6f9fc', borderBottom: '1px solid #eee' }}>
                    <div style={sectionTitle}>{t.editDirect}</div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{direct.dbType}</span>
                      <input style={{ ...formInput, width: 56 }} type="number" placeholder={t.length}
                        value={direct.length ?? ''}
                        onChange={(e) => onSelectType({ ...direct, length: e.target.value === '' ? null : parseInt(e.target.value, 10) })} />
                      {direct.dbType === 'DECIMAL' && (
                        <input style={{ ...formInput, width: 48 }} type="number" placeholder={t.scale}
                          value={direct.scale ?? ''}
                          onChange={(e) => onSelectType({ ...direct, scale: e.target.value === '' ? null : parseInt(e.target.value, 10) })} />
                      )}
                    </div>
                  </div>
                )}

                {groups.length > 0 && <div style={groupHeader}>{t.dictionary}</div>}
                {groups.map(({ label, entries }) => (
                  <div key={label} style={rowStyle}>
                    <div style={rowLabel} title={label}>{label}</div>
                    <div style={chipsStyle}>
                      {entries.map((e) => (
                        <button
                          key={e.id}
                          data-selected={e.id === entry?.id}
                          style={chipStyle(e.id === entry?.id)}
                          onClick={() => pickEntry(e)}
                          title={[`${formatTypeSpec(e)}${e.notNull ? ' NOT NULL' : ''}`, e.comment].filter(Boolean).join('\n')}
                        >
                          {e.name}
                          <span style={chipTypeStyle}>{formatTypeSpec(e)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {basicGroups.length > 0 && <div style={groupHeader}>{t.basicTypes}</div>}
                {basicGroups.map(({ label, types }) => (
                  <div key={label} style={rowStyle}>
                    <div style={rowLabel}>{label}</div>
                    <div style={chipsStyle}>
                      {types.map((d) => (
                        <button
                          key={d}
                          data-selected={direct?.dbType === d}
                          style={{ ...chipStyle(direct?.dbType === d), fontFamily: 'monospace' }}
                          onClick={() => pickType(basicType(d))}
                        >
                          {formatTypeSpec(basicType(d))}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ height: 6 }} />

                {groups.length === 0 && basicGroups.length === 0 && !parsed && (
                  <div style={{ padding: 10, fontSize: 12, color: '#999' }}>{t.noMatch}</div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #eee', padding: 6 }}>
                <button style={{ ...secondaryBtn, width: '100%' }} onClick={startRegister}>{t.register}</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

const triggerStyle = (open: boolean, empty: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  width: '100%',
  minWidth: 0,
  fontSize: 12,
  padding: '2px 4px',
  border: `1px solid ${open ? '#4a7c9e' : '#ccc'}`,
  borderRadius: 3,
  background: '#fff',
  color: empty ? '#999' : '#222',
  cursor: 'pointer',
  textAlign: 'left',
  boxSizing: 'border-box',
  height: 24,
});

const subStyle: React.CSSProperties = { fontSize: 10, color: '#888', whiteSpace: 'nowrap', flexShrink: 0 };

const popoverStyle: React.CSSProperties = {
  position: 'fixed',
  zIndex: 1000,
  background: '#fff',
  border: '1px solid #bbb',
  borderRadius: 5,
  boxShadow: '0 6px 20px #0003',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  color: '#222',
};

/** Sticky, so the section stays named while a long dictionary scrolls */
const groupHeader: React.CSSProperties = {
  position: 'sticky', top: 0, zIndex: 1, background: '#fff', borderBottom: '1px solid #f0f0f0',
  fontSize: 10, fontWeight: 700, color: '#4a7c9e', padding: '6px 10px 3px', textTransform: 'uppercase', letterSpacing: 0.5,
};
const rowStyle: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '64px 1fr', gap: 6, alignItems: 'start', padding: '4px 10px',
};
const rowLabel: React.CSSProperties = {
  fontSize: 11, color: '#777', paddingTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const chipsStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4, minWidth: 0 };
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#555', marginBottom: 6 };

const itemStyle = (selected: boolean): React.CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  width: '100%',
  padding: '4px 10px 4px 22px',
  background: selected ? '#e8f0fe' : 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  textAlign: 'left',
  color: '#222',
});
const chipStyle = (selected: boolean): React.CSSProperties => ({
  fontSize: 11,
  padding: '2px 6px',
  border: `1px solid ${selected ? '#4a7c9e' : '#d0d7de'}`,
  background: selected ? '#e8f0fe' : '#f6f8fa',
  color: '#222',
  borderRadius: 3,
  cursor: 'pointer',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
const chipTypeStyle: React.CSSProperties = { marginLeft: 5, fontSize: 10, color: '#888', fontFamily: 'monospace' };

const formGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '64px 1fr', gap: '6px 8px', alignItems: 'center' };
const formLabel: React.CSSProperties = { fontSize: 11, color: '#555' };
const formInput: React.CSSProperties = {
  fontSize: 12, padding: '3px 5px', border: '1px solid #ccc', borderRadius: 3, boxSizing: 'border-box', minWidth: 0,
};
const secondaryBtn: React.CSSProperties = {
  fontSize: 12, padding: '4px 10px', border: '1px solid #b0c4de', background: '#f0f4ff', color: '#4a7c9e',
  borderRadius: 3, cursor: 'pointer',
};
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  fontSize: 12, padding: '4px 10px', border: 'none', background: disabled ? '#ccc' : '#4a7c9e', color: '#fff',
  borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 600,
});
