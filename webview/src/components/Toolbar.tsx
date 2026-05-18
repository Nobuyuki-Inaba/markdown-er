import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';

export function Toolbar() {
  const nameMode    = useDiagramStore((s) => s.model.layout.nameMode);
  const setNameMode = useDiagramStore((s) => s.setNameMode);
  const addTable    = useDiagramStore((s) => s.addTable);
  const viewport    = useDiagramStore((s) => s.model.layout.viewport);
  const tableCount  = useDiagramStore((s) => s.model.layout.tables.length);

  const openDictionary = useUiStore((s) => s.openDictionary);

  const undo = () => useDiagramStore.temporal.getState().undo();
  const redo = () => useDiagramStore.temporal.getState().redo();

  const handleAddTable = () => {
    // Place at canvas center, stagger each new table by 20px to avoid stacking
    const cx = (window.innerWidth  / 2 - viewport.x) / viewport.zoom;
    const cy = (window.innerHeight / 2 - viewport.y) / viewport.zoom;
    const offset = tableCount * 20;
    addTable(cx - 120 + offset, cy - 60 + offset);
  };

  return (
    <div style={toolbarStyle}>
      <button onClick={handleAddTable} style={btnStyle} title="Add table at canvas center">
        + Table
      </button>

      <div style={divider} />

      <button
        onClick={() => setNameMode(nameMode === 'logical' ? 'physical' : 'logical')}
        style={{ ...btnStyle, minWidth: 130 }}
        title="Toggle logical/physical name display"
      >
        {nameMode === 'logical' ? 'Logical names' : 'Physical names'}
      </button>

      <div style={divider} />

      <button onClick={undo} style={btnStyle} title="Undo (Ctrl+Z)">↩ Undo</button>
      <button onClick={redo} style={btnStyle} title="Redo (Ctrl+Y)">↪ Redo</button>

      <div style={divider} />

      <button
        onClick={() => window.dispatchEvent(new CustomEvent('er:zoomOut'))}
        style={{ ...btnStyle, padding: '4px 8px', minWidth: 28 }}
        title="Zoom out"
      >−</button>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('er:fitView'))}
        style={btnStyle}
        title="Fit all tables in view"
      >Fit</button>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('er:zoomIn'))}
        style={{ ...btnStyle, padding: '4px 8px', minWidth: 28 }}
        title="Zoom in"
      >+</button>

      <div style={divider} />

      <button onClick={openDictionary} style={btnStyle} title="Manage column type dictionary">
        Dictionary
      </button>

      <div style={{ flex: 1 }} />

      <button
        onClick={() => {
          window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: 'full' } }));
        }}
        style={{ ...btnStyle, background: '#4a8a5a', color: '#fff' }}
        title="Export DDL"
      >
        Export DDL
      </button>
    </div>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  background: '#2c2c2c',
  height: 40,
  borderBottom: '1px solid #444',
  flexShrink: 0,
};

const btnStyle: React.CSSProperties = {
  background: '#444',
  color: '#eee',
  border: '1px solid #666',
  borderRadius: 4,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 12,
  whiteSpace: 'nowrap',
};

const divider: React.CSSProperties = {
  width: 1,
  height: 20,
  background: '#555',
  margin: '0 4px',
};
