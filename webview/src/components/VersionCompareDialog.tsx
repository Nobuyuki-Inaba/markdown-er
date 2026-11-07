import { useMemo, useState } from 'react';
import { ChangeKind, FieldChange, ItemChange, compareSchemas, versionModel } from '@shared/schemaCompare';
import { productionModel } from '@shared/testData';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useMessages, Messages } from '../i18n';

const CURRENT = '__current__';

const KIND_COLORS: Record<ChangeKind, string> = { added: '#2e7d32', removed: '#c62828', changed: '#b26a00' };
const KIND_MARKS: Record<ChangeKind, string> = { added: '+', removed: '−', changed: '~' };

type CompareMessages = Messages['versions']['compare'];

interface Props {
  initialFromId: string;
  onClose: () => void;
}

export function VersionCompareDialog({ initialFromId, onClose }: Props) {
  const model = useDiagramStore((s) => s.model);
  const setDdlMode = useUiStore((s) => s.setDdlMode);
  const setDdlVersions = useUiStore((s) => s.setDdlVersions);
  const t = useMessages().versions.compare;
  const versions = useMemo(() => model.schemaVersions ?? [], [model.schemaVersions]);

  const [fromId, setFromId] = useState(initialFromId);
  const [toId, setToId] = useState(CURRENT);

  const comparison = useMemo(() => {
    const schema = (id: string) => {
      const version = versions.find((v) => v.id === id);
      return version ? versionModel(model, version) : productionModel(model);
    };
    return compareSchemas(schema(fromId), schema(toId));
  }, [model, versions, fromId, toId]);

  const options = (
    <>
      <option value={CURRENT}>{t.current}</option>
      {versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
    </>
  );

  const openDdl = () => {
    if (fromId === CURRENT) return;
    setDdlMode('version-diff');
    setDdlVersions(fromId, toId === CURRENT ? null : toId);
    window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: 'version-diff' } }));
  };

  const identical = comparison.tables.length === 0 && comparison.relations.length === 0;

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{t.title}</span>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        <div style={controlsStyle}>
          <label>{t.from} <select value={fromId} onChange={(e) => setFromId(e.target.value)}>{options}</select></label>
          <span style={{ color: '#888' }}>→</span>
          <label>{t.to} <select value={toId} onChange={(e) => setToId(e.target.value)}>{options}</select></label>
          <button onClick={openDdl} disabled={fromId === CURRENT} style={ddlBtnStyle} title={t.ddlTitle}>{t.ddl}</button>
        </div>

        <div style={bodyStyle}>
          {identical ? (
            <div style={{ color: '#888', textAlign: 'center', padding: '24px 0' }}>{t.identical}</div>
          ) : (
            <>
              {comparison.tables.map((table) => (
                <div key={`${table.kind}:${table.name}`} style={{ marginBottom: 12 }}>
                  <ChangeLine change={table} kindLabel={t.tableKinds[table.kind]} strong t={t} />
                  <div style={{ paddingLeft: 16 }}>
                    <ChangeGroup title={t.columns} changes={table.columns} t={t} />
                    <ChangeGroup title={t.indexes} changes={table.indexes} t={t} />
                    <ChangeGroup title={t.constraints} changes={table.constraints} t={t} />
                  </div>
                </div>
              ))}
              {comparison.relations.length > 0 && <ChangeGroup title={t.relations} changes={comparison.relations} t={t} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ChangeGroup({ title, changes, t }: { title: string; changes: ItemChange[]; t: CompareMessages }) {
  if (changes.length === 0) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={groupTitleStyle}>{title}</div>
      {changes.map((change) => <ChangeLine key={`${change.kind}:${change.name}`} change={change} kindLabel={t.kinds[change.kind]} t={t} />)}
    </div>
  );
}

interface ChangeLineProps {
  change: ItemChange;
  kindLabel: string;
  strong?: boolean;
  t: CompareMessages;
}

function ChangeLine({ change, kindLabel, strong, t }: ChangeLineProps) {
  return (
    <div>
      <div style={{ color: KIND_COLORS[change.kind], fontWeight: strong ? 700 : 400 }}>
        <span style={{ fontFamily: 'monospace', marginRight: 6 }}>{KIND_MARKS[change.kind]}</span>
        {change.name}
        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400 }}>{kindLabel}</span>
      </div>
      {change.fields.map((field) => <FieldLine key={field.field} field={field} t={t} />)}
    </div>
  );
}

function FieldLine({ field, t }: { field: FieldChange; t: CompareMessages }) {
  return (
    <div style={fieldStyle}>
      {t.fields[field.field]}: <code>{field.before || t.none}</code> → <code>{field.after || t.none}</code>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: '#0005', zIndex: 50,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  paddingTop: 60,
};

const panelStyle: React.CSSProperties = {
  background: '#fff', color: '#222', borderRadius: 6,
  width: 720, maxWidth: '95vw', maxHeight: '85vh',
  display: 'flex', flexDirection: 'column',
  boxShadow: '0 8px 32px #0006',
  border: '1px solid #ccc',
};

const headerStyle: React.CSSProperties = {
  background: '#f5f5f5', borderBottom: '1px solid #ccc',
  padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  borderRadius: '6px 6px 0 0',
  flexShrink: 0,
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#666',
};

const controlsStyle: React.CSSProperties = {
  padding: '10px 16px', borderBottom: '1px solid #e0e0e0', flexShrink: 0,
  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12,
};

const ddlBtnStyle: React.CSSProperties = {
  marginLeft: 'auto', border: 'none', borderRadius: 3, padding: '4px 10px',
  background: '#4a8a5a', color: '#fff', cursor: 'pointer', fontSize: 12,
};

const bodyStyle: React.CSSProperties = {
  padding: '12px 16px', overflowY: 'auto', flex: 1, minHeight: 0, fontSize: 13,
};

const groupTitleStyle: React.CSSProperties = { fontSize: 11, color: '#666', marginTop: 4 };

const fieldStyle: React.CSSProperties = { paddingLeft: 20, fontSize: 12, color: '#555' };
