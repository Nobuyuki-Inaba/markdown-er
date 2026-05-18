import { type Node, type Edge } from '@xyflow/react';
import { DiagramModel } from '@shared/DiagramModel';

// ReactFlow v12: generic param must be the full Node/Edge type
export type TableNodeType = Node<{ tableId: string }, 'tableNode'>;
export type RelationEdgeType = Edge<{ relationId: string }, 'relationEdge'>;

export function modelToNodes(model: DiagramModel): TableNodeType[] {
  return model.tables.map((table) => {
    const layoutEntry = model.layout.tables.find((l) => l.tableId === table.id);
    return {
      id: table.id,
      type: 'tableNode' as const,
      position: { x: layoutEntry?.x ?? 100, y: layoutEntry?.y ?? 100 },
      style: { width: layoutEntry?.width ?? 240 },
      data: { tableId: table.id },
    };
  });
}

export function modelToEdges(model: DiagramModel): RelationEdgeType[] {
  return model.relations.map((rel) => ({
    id: rel.id,
    source: rel.fromTableId,
    target: rel.toTableId,
    type: 'relationEdge' as const,
    data: { relationId: rel.id },
  }));
}
