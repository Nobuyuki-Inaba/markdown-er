import { Cardinality } from '@shared/DiagramModel';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';

const CARDINALITIES: { value: Cardinality; label: string }[] = [
  { value: 'ONE_TO_ONE',  label: '1 : 1' },
  { value: 'ONE_TO_MANY', label: '1 : N' },
  { value: 'MANY_TO_MANY', label: 'N : N' },
];

export function RelationEditPanel() {
  const selectedRelationId = useUiStore((s) => s.selectedRelationId);
  const selectRelation = useUiStore((s) => s.selectRelation);

  const relation      = useDiagramStore((s) => s.model.relations.find((r) => r.id === selectedRelationId));
  const tables        = useDiagramStore((s) => s.model.tables);
  const updateRelation = useDiagramStore((s) => s.updateRelation);
  const deleteRelation = useDiagramStore((s) => s.deleteRelation);

  if (!selectedRelationId || !relation) return null;

  const fromTable = tables.find((t) => t.id === relation.fromTableId);
  const toTable   = tables.find((t) => t.id === relation.toTableId);

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700 }}>Edit Relation</span>
        <button onClick={() => selectRelation(null)} style={closeBtnStyle}>✕</button>
      </div>

      <div style={{ padding: '10px 12px' }}>
        <div style={infoStyle}>
          <span>{fromTable?.logicalName ?? relation.fromTableId}</span>
          <span style={{ color: '#888' }}> → </span>
          <span>{toTable?.logicalName ?? relation.toTableId}</span>
        </div>

        {/* Cardinality */}
        <div style={rowStyle}>
          <label style={labelStyle}>Cardinality</label>
          <select
            style={inputStyle}
            value={relation.cardinality}
            onChange={(e) =>
              updateRelation(selectedRelationId, { cardinality: e.target.value as Cardinality })
            }
          >
            {CARDINALITIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* From column */}
        <div style={rowStyle}>
          <label style={labelStyle}>From column</label>
          <select
            style={inputStyle}
            value={relation.fromColumnId}
            onChange={(e) => updateRelation(selectedRelationId, { fromColumnId: e.target.value })}
          >
            <option value="">— none —</option>
            {fromTable?.columns.map((c) => (
              <option key={c.id} value={c.id}>{c.logicalName} ({c.physicalName})</option>
            ))}
          </select>
        </div>

        {/* To column */}
        <div style={rowStyle}>
          <label style={labelStyle}>To column</label>
          <select
            style={inputStyle}
            value={relation.toColumnId}
            onChange={(e) => updateRelation(selectedRelationId, { toColumnId: e.target.value })}
          >
            <option value="">— none —</option>
            {toTable?.columns.map((c) => (
              <option key={c.id} value={c.id}>{c.logicalName} ({c.physicalName})</option>
            ))}
          </select>
        </div>

        {/* FK */}
        <div style={rowStyle}>
          <label style={labelStyle}>Foreign key</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={relation.hasForeignKey}
              onChange={(e) => updateRelation(selectedRelationId, { hasForeignKey: e.target.checked })}
            />
            Use FK constraint
          </label>
        </div>

        {relation.hasForeignKey && (
          <div style={rowStyle}>
            <label style={labelStyle}>Constraint name</label>
            <input
              style={inputStyle}
              value={relation.constraintName}
              placeholder="fk_table_column"
              onChange={(e) => updateRelation(selectedRelationId, { constraintName: e.target.value })}
            />
          </div>
        )}

        {/* Comment */}
        <div style={rowStyle}>
          <label style={labelStyle}>Comment</label>
          <input
            style={inputStyle}
            value={relation.comment}
            onChange={(e) => updateRelation(selectedRelationId, { comment: e.target.value })}
          />
        </div>

        <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 10 }}>
          <button
            onClick={() => {
              deleteRelation(selectedRelationId);
              selectRelation(null);
            }}
            style={{ background: '#c33', color: '#fff', border: 'none', borderRadius: 4, padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}
          >
            Delete Relation
          </button>
        </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute', top: 48, right: 12, width: 380,
  background: '#fff', border: '1px solid #ccc', borderRadius: 6,
  boxShadow: '0 4px 16px #0003', zIndex: 10,
};
const headerStyle: React.CSSProperties = {
  background: '#f5f5f5', borderBottom: '1px solid #ccc',
  padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};
const closeBtnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#666' };
const infoStyle: React.CSSProperties = { fontSize: 13, marginBottom: 10, padding: '4px 0' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 };
const labelStyle: React.CSSProperties = { width: 110, fontSize: 12, color: '#555', flexShrink: 0 };
const inputStyle: React.CSSProperties = { flex: 1, fontSize: 13, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 3 };
