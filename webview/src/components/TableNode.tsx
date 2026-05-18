import { memo } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import type { TableNodeType } from '../util/xyflowAdapters';

const HEADER_BG   = '#4a7c9e';
const HEADER_FG   = '#fff';
const PK_COLOR    = '#e8a000';
const BORDER      = '#cdd';

export const TableNode = memo(({ data, selected }: NodeProps<TableNodeType>) => {
  const tableId = data.tableId;
  const table = useDiagramStore((s) =>
    s.model.tables.find((t) => t.id === tableId)
  );
  const dict      = useDiagramStore((s) => s.model.dictionary);
  const nameMode  = useDiagramStore((s) => s.model.layout.nameMode);
  const selectTable = useUiStore((s) => s.selectTable);

  if (!table) return null;

  const tableName = nameMode === 'logical' ? table.logicalName : table.physicalName;

  return (
    <div
      style={{
        border: `2px solid ${selected ? '#4a90d9' : BORDER}`,
        borderRadius: 4,
        background: '#fff',
        minWidth: 200,
        boxShadow: selected ? '0 0 0 2px #4a90d944' : '0 2px 4px #0002',
        fontSize: 13,
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        selectTable(tableId);
      }}
    >
      <NodeResizer isVisible={selected} minWidth={160} minHeight={60} />

      <Handle type="target" position={Position.Left}  style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />

      {/* Header */}
      <div
        style={{
          background: HEADER_BG,
          color: HEADER_FG,
          padding: '6px 10px',
          borderRadius: '2px 2px 0 0',
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        {tableName}
        {nameMode === 'logical' && table.physicalName && (
          <div style={{ fontWeight: 400, fontSize: 10, opacity: 0.8 }}>
            {table.physicalName}
          </div>
        )}
      </div>

      {/* Columns */}
      {table.columns.length === 0 && (
        <div style={{ padding: '6px 10px', color: '#aaa', fontSize: 12 }}>
          (no columns)
        </div>
      )}
      {table.columns.map((col) => {
        const entry = dict.find((e) => e.id === col.dictionaryId);
        const typeName = entry
          ? entry.length ? `${entry.name}(${entry.length})` : entry.name
          : '—';
        const colName = nameMode === 'logical' ? col.logicalName : col.physicalName;

        return (
          <div
            key={col.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '3px 10px',
              borderTop: '1px solid #eee',
              gap: 6,
            }}
          >
            {col.isPrimaryKey && (
              <span style={{ color: PK_COLOR, fontWeight: 700, fontSize: 11 }}>PK</span>
            )}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {colName}
            </span>
            <span style={{ color: '#888', fontSize: 11, whiteSpace: 'nowrap' }}>
              {typeName}
            </span>
          </div>
        );
      })}
    </div>
  );
});

TableNode.displayName = 'TableNode';

const handleStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  background: '#4a7c9e',
  border: '2px solid #fff',
};
