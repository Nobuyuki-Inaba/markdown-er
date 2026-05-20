import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { modelToNodes, modelToEdges } from '../util/xyflowAdapters';
import { TableNode } from './TableNode';
import { RelationEdge } from './RelationEdge';
import { CardinalityMarkers } from './CardinalityMarkers';
import { RegionNode } from './RegionNode';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: any = { tableNode: TableNode, regionNode: RegionNode };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes: any = { relationEdge: RelationEdge };

// Inner component that has access to the ReactFlow context (useReactFlow)
function ReactFlowControls() {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  useEffect(() => {
    const onFit  = () => fitView({ duration: 300, padding: 0.1 });
    const onIn   = () => zoomIn({ duration: 200 });
    const onOut  = () => zoomOut({ duration: 200 });
    window.addEventListener('er:fitView', onFit);
    window.addEventListener('er:zoomIn',  onIn);
    window.addEventListener('er:zoomOut', onOut);
    return () => {
      window.removeEventListener('er:fitView', onFit);
      window.removeEventListener('er:zoomIn',  onIn);
      window.removeEventListener('er:zoomOut', onOut);
    };
  }, [fitView, zoomIn, zoomOut]);

  return null;
}

export function DiagramCanvas() {
  const model = useDiagramStore((s) => s.model);
  const updateLayout       = useDiagramStore((s) => s.updateLayout);
  const updateRegionLayout = useDiagramStore((s) => s.updateRegionLayout);
  const updateViewport     = useDiagramStore((s) => s.updateViewport);
  const addRelation        = useDiagramStore((s) => s.addRelation);
  const selectTable    = useUiStore((s) => s.selectTable);
  const selectRelation = useUiStore((s) => s.selectRelation);
  const selectRegion   = useUiStore((s) => s.selectRegion);

  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);

  // Track whether a drag is in progress so we skip resync during drag
  const draggingRef = useRef(false);

  // Sync model → ReactFlow whenever the model changes
  // Use a ref for the model to avoid stale closure inside the effect
  const modelRef = useRef(model);
  modelRef.current = model;

  useEffect(() => {
    if (!draggingRef.current) {
      setNodes(modelToNodes(modelRef.current));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.tables, model.layout.tables, model.layout.regions]);

  useEffect(() => {
    setEdges(modelToEdges(modelRef.current));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.relations]);

  const handleNodesChange = useCallback(
    (changes: any[]) => {
      let hasDragStart = false;
      let hasDragEnd   = false;

      for (const change of changes) {
        if (change.type === 'position') {
          if (change.dragging) hasDragStart = true;
          else                 hasDragEnd   = true;
        }
      }
      if (hasDragStart) draggingRef.current = true;

      onNodesChange(changes);

      for (const change of changes) {
        if (change.type === 'position' && !change.dragging && change.position) {
          draggingRef.current = false;
          const m = modelRef.current;
          const tableLayout = m.layout.tables.find((l) => l.tableId === change.id);
          if (tableLayout) {
            updateLayout(change.id, change.position.x, change.position.y, tableLayout.width);
          } else {
            const regionLayout = m.layout.regions.find((r) => r.id === change.id);
            if (regionLayout) {
              updateRegionLayout(change.id, change.position.x, change.position.y, regionLayout.width, regionLayout.height);
            }
          }
        }
        if (change.type === 'dimensions' && change.dimensions) {
          const m = modelRef.current;
          const tableLayout = m.layout.tables.find((l) => l.tableId === change.id);
          if (tableLayout) {
            if (Math.abs(tableLayout.width - change.dimensions.width) > 1) {
              updateLayout(change.id, tableLayout.x, tableLayout.y, change.dimensions.width);
            }
          } else {
            const regionLayout = m.layout.regions.find((r) => r.id === change.id);
            if (regionLayout) {
              const wDiff = Math.abs(regionLayout.width  - change.dimensions.width);
              const hDiff = Math.abs(regionLayout.height - change.dimensions.height);
              if (wDiff > 1 || hDiff > 1) {
                updateRegionLayout(change.id, regionLayout.x, regionLayout.y, change.dimensions.width, change.dimensions.height);
              }
            }
          }
        }
      }
    },
    [onNodesChange, updateLayout, updateRegionLayout]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      addRelation({
        fromTableId: connection.source ?? '',
        fromColumnId: '',
        toTableId:   connection.target ?? '',
        toColumnId:  '',
        cardinality: 'ONE_TO_MANY',
        hasForeignKey: false,
        constraintName: '',
        comment: '',
      });
    },
    [addRelation]
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'regionNode') {
        selectRegion(node.id);
      } else {
        selectTable(node.id);
      }
    },
    [selectTable, selectRegion]
  );

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: any) => selectRelation(edge.id),
    [selectRelation]
  );

  const handlePaneClick = useCallback(() => {
    selectTable(null);
    selectRelation(null);
    selectRegion(null);
  }, [selectTable, selectRelation, selectRegion]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <CardinalityMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onMoveEnd={(_, viewport) => {
          updateViewport(viewport.x, viewport.y, viewport.zoom);
        }}
        defaultViewport={model.layout.viewport}
        deleteKeyCode={null}
        minZoom={0.1}
        maxZoom={3}
      >
        <ReactFlowControls />
        <Background />
        <Controls />
        <MiniMap zoomable pannable style={{ bottom: 8, right: 8 }} />
      </ReactFlow>
    </div>
  );
}
