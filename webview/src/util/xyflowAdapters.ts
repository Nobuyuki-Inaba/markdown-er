import { type Node, type Edge } from '@xyflow/react';
import { DiagramModel } from '@shared/DiagramModel';

// ReactFlow v12: generic param must be the full Node/Edge type
export type TableNodeType = Node<{ tableId: string }, 'tableNode'>;
export type RelationEdgeType = Edge<{ relationId: string }, 'relationEdge'>;
export type RegionNodeType = Node<{ regionId: string }, 'regionNode'>;

export function modelToNodes(model: DiagramModel): (TableNodeType | RegionNodeType)[] {
  const regionNodes: RegionNodeType[] = (model.layout.regions ?? []).map((r) => ({
    id: r.id,
    type: 'regionNode' as const,
    position: { x: r.x, y: r.y },
    style: { width: r.width, height: r.height },
    zIndex: 0,
    data: { regionId: r.id },
  }));

  const tableNodes: TableNodeType[] = model.tables.map((table) => {
    const layoutEntry = model.layout.tables.find((l) => l.tableId === table.id);
    return {
      id: table.id,
      type: 'tableNode' as const,
      position: { x: layoutEntry?.x ?? 100, y: layoutEntry?.y ?? 100 },
      style: { width: layoutEntry?.width ?? 240 },
      zIndex: 1,
      data: { tableId: table.id },
    };
  });

  // Regions first so they render behind table nodes
  return [...regionNodes, ...tableNodes];
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
