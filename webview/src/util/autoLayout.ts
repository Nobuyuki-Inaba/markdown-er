import dagre from 'dagre';
import type { DiagramModel } from '@shared/DiagramModel';

export type LayoutDirection = 'vertical' | 'horizontal' | 'auto';

export interface TablePosition {
  tableId: string;
  x: number;
  y: number;
  width: number;
}

const NODE_SEP = 60;   // gap between sibling nodes
const RANK_SEP = 80;   // gap between ranks (layers)
const ROW_HEIGHT = 32; // approximate px per column row for height estimation

function estimateHeight(model: DiagramModel, tableId: string): number {
  const table = model.tables.find((t) => t.id === tableId);
  const rows = table ? table.columns.length : 0;
  return 48 + rows * ROW_HEIGHT; // header + rows
}

function resolveDirection(model: DiagramModel, direction: LayoutDirection): 'TB' | 'LR' {
  if (direction === 'vertical') return 'TB';
  if (direction === 'horizontal') return 'LR';

  // Auto: pick TB when there are more relations than tables (deep graph),
  // otherwise LR (wide graph).
  const ratio = model.relations.length / Math.max(model.tables.length, 1);
  return ratio >= 1 ? 'TB' : 'LR';
}

export function computeAutoLayout(
  model: DiagramModel,
  direction: LayoutDirection,
): TablePosition[] {
  const rankdir = resolveDirection(model, direction);

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep: NODE_SEP, ranksep: RANK_SEP, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes
  for (const table of model.tables) {
    const existingLayout = model.layout.tables.find((l) => l.tableId === table.id);
    const width  = existingLayout?.width ?? 240;
    const height = estimateHeight(model, table.id);
    g.setNode(table.id, { width, height, _origWidth: width });
  }

  // Add edges (directed: from → to)
  for (const rel of model.relations) {
    if (g.hasNode(rel.fromTableId) && g.hasNode(rel.toTableId)) {
      g.setEdge(rel.fromTableId, rel.toTableId);
    }
  }

  dagre.layout(g);

  return model.tables.map((table) => {
    const node = g.node(table.id);
    const origWidth = (node as any)._origWidth as number;
    return {
      tableId: table.id,
      // dagre returns the center; convert to top-left corner
      x: Math.round(node.x - origWidth / 2),
      y: Math.round(node.y - node.height / 2),
      width: origWidth,
    };
  });
}
