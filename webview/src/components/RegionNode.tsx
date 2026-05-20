import { memo, useState, useRef, useCallback } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { useDiagramStore } from '../store/diagramStore';
import type { RegionNodeType } from '../util/xyflowAdapters';

export const RegionNode = memo(({ data, selected }: NodeProps<RegionNodeType>) => {
  const regionId = data.regionId;
  const region = useDiagramStore((s) =>
    s.model.layout.regions.find((r) => r.id === regionId)
  );
  const updateRegion = useDiagramStore((s) => s.updateRegion);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    if (!region) return;
    setDraft(region.label);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [region]);

  const commitEdit = useCallback(() => {
    if (draft.trim()) {
      updateRegion(regionId, { label: draft.trim() });
    }
    setEditing(false);
  }, [draft, regionId, updateRegion]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') commitEdit();
      if (e.key === 'Escape') setEditing(false);
    },
    [commitEdit]
  );

  if (!region) return null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        border: `2px ${selected ? 'solid #4a90d9' : 'dashed #888'}`,
        borderRadius: 6,
        background: selected ? 'rgba(74,144,217,0.07)' : 'rgba(120,120,180,0.06)',
        boxSizing: 'border-box',
        pointerEvents: 'all',
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
    >
      <NodeResizer isVisible={selected} minWidth={120} minHeight={80} />

      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 10,
          right: 10,
          pointerEvents: editing ? 'all' : 'none',
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              background: '#1e1e1e',
              color: '#eee',
              border: '1px solid #4a90d9',
              borderRadius: 3,
              padding: '2px 6px',
              fontSize: 13,
              fontWeight: 600,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: selected ? '#4a90d9' : '#aaa',
              userSelect: 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
            }}
          >
            {region.label}
          </span>
        )}
      </div>
    </div>
  );
});

RegionNode.displayName = 'RegionNode';
