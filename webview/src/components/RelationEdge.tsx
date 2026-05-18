import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { cardinalityLabel } from '@shared/DiagramModel';
import type { RelationEdgeType } from '../util/xyflowAdapters';

export function RelationEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  data,
  selected,
}: EdgeProps<RelationEdgeType>) {
  const relationId = data?.relationId;
  const relation = useDiagramStore((s) =>
    s.model.relations.find((r) => r.id === relationId)
  );
  const selectRelation = useUiStore((s) => s.selectRelation);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  const labels = relation ? cardinalityLabel(relation.cardinality) : { from: '', to: '' };
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  const fromLabelX = sourceX + (midX - sourceX) * 0.15;
  const fromLabelY = sourceY + (midY - sourceY) * 0.15;
  const toLabelX   = targetX + (midX - targetX) * 0.15;
  const toLabelY   = targetY + (midY - targetY) * 0.15;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? '#4a90d9' : '#555',
          strokeWidth: selected ? 2 : 1.5,
        }}
        markerEnd="url(#arrow-end)"
      />
      <EdgeLabelRenderer>
        <div
          onClick={() => selectRelation(relationId ?? null)}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${fromLabelX}px, ${fromLabelY}px)`,
            fontSize: 11,
            fontWeight: 600,
            background: 'white',
            padding: '1px 4px',
            borderRadius: 3,
            border: '1px solid #ccc',
            pointerEvents: 'all',
            cursor: 'pointer',
            color: '#333',
          }}
          className="nodrag nopan"
        >
          {labels.from}
        </div>
        <div
          onClick={() => selectRelation(relationId ?? null)}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${toLabelX}px, ${toLabelY}px)`,
            fontSize: 11,
            fontWeight: 600,
            background: 'white',
            padding: '1px 4px',
            borderRadius: 3,
            border: '1px solid #ccc',
            pointerEvents: 'all',
            cursor: 'pointer',
            color: '#333',
          }}
          className="nodrag nopan"
        >
          {labels.to}
        </div>
        {relation?.hasForeignKey && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 9,
              background: '#e8f4e8',
              padding: '1px 4px',
              borderRadius: 3,
              border: '1px solid #6c9',
              color: '#396',
              pointerEvents: 'none',
            }}
          >
            FK
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
