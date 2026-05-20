import { useRef, useState } from 'react';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { sendToExtension } from '../vscodeApi';
import type { LayoutDirection } from '../util/autoLayout';

export function Toolbar() {
  const nameMode    = useDiagramStore((s) => s.model.layout.nameMode);
  const setNameMode = useDiagramStore((s) => s.setNameMode);
  const addTable    = useDiagramStore((s) => s.addTable);
  const addRegion   = useDiagramStore((s) => s.addRegion);
  const applyAutoLayout = useDiagramStore((s) => s.applyAutoLayout);
  const viewport    = useDiagramStore((s) => s.model.layout.viewport);
  const tableCount  = useDiagramStore((s) => s.model.layout.tables.length);

  const openDictionary = useUiStore((s) => s.openDictionary);
  const dialect        = useUiStore((s) => s.dialect);
  const showMinimap    = useUiStore((s) => s.showMinimap);
  const toggleMinimap  = useUiStore((s) => s.toggleMinimap);
  const searchQuery    = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);

  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const layoutBtnRef = useRef<HTMLButtonElement>(null);

  const undo = () => useDiagramStore.temporal.getState().undo();
  const redo = () => useDiagramStore.temporal.getState().redo();

  const handleAddTable = () => {
    // Place at canvas center, stagger each new table by 20px to avoid stacking
    const cx = (window.innerWidth  / 2 - viewport.x) / viewport.zoom;
    const cy = (window.innerHeight / 2 - viewport.y) / viewport.zoom;
    const offset = tableCount * 20;
    addTable(cx - 120 + offset, cy - 60 + offset);
  };

  const handleAddRegion = () => {
    const cx = (window.innerWidth  / 2 - viewport.x) / viewport.zoom;
    const cy = (window.innerHeight / 2 - viewport.y) / viewport.zoom;
    addRegion(cx - 200, cy - 150);
  };

  const handleLayout = (direction: LayoutDirection) => {
    setLayoutMenuOpen(false);
    applyAutoLayout(direction);
    // Fit view after layout settles
    setTimeout(() => window.dispatchEvent(new CustomEvent('er:fitView')), 50);
  };

  return (
    <div style={toolbarStyle}>
      <button onClick={handleAddTable} style={btnStyle} title="Add table at canvas center">
        + Table
      </button>
      <button onClick={handleAddRegion} style={btnStyle} title="Add region group box at canvas center">
        + Region
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

      {/* Auto Layout split button */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex' }}>
          <button
            onClick={() => handleLayout('auto')}
            style={{ ...btnStyle, borderRadius: '4px 0 0 4px', borderRight: 'none' }}
            title="Auto layout (picks best direction)"
          >
            Auto Layout
          </button>
          <button
            ref={layoutBtnRef}
            onClick={() => setLayoutMenuOpen((o) => !o)}
            style={{ ...btnStyle, borderRadius: '0 4px 4px 0', padding: '4px 6px', minWidth: 'unset' }}
            title="Choose layout direction"
          >
            ▾
          </button>
        </div>
        {layoutMenuOpen && (
          <div style={dropdownStyle}>
            <button style={dropdownItemStyle} onClick={() => handleLayout('vertical')}>
              ↕ Vertical
            </button>
            <button style={dropdownItemStyle} onClick={() => handleLayout('horizontal')}>
              ↔ Horizontal
            </button>
            <button style={dropdownItemStyle} onClick={() => handleLayout('auto')}>
              ✦ Auto
            </button>
          </div>
        )}
      </div>

      <div style={divider} />

      <button onClick={openDictionary} style={btnStyle} title="Manage column type dictionary">
        Dictionary
      </button>

      <div style={divider} />

      {/* Search box */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: 6, fontSize: 12, color: '#aaa', pointerEvents: 'none' }}>🔍</span>
        <input
          type="text"
          placeholder="Search tables / columns…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={searchInputStyle}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{ position: 'absolute', right: 4, background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 12, padding: 0 }}
            title="Clear search"
          >✕</button>
        )}
      </div>

      <button
        onClick={toggleMinimap}
        style={{ ...btnStyle, ...(showMinimap ? {} : { color: '#888', borderColor: '#555' }) }}
        title={showMinimap ? 'Hide minimap' : 'Show minimap'}
      >
        Minimap
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

      <span style={dialectBadgeStyle} title="Active DDL dialect (change in Settings)">
        {dialect}
      </span>

      <button
        onClick={() => sendToExtension({ type: 'openSettings' })}
        style={{ ...btnStyle, padding: '4px 7px', minWidth: 'unset', fontSize: 14 }}
        title="Open extension settings"
      >
        ⚙
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

const searchInputStyle: React.CSSProperties = {
  background: '#3a3a3a',
  color: '#eee',
  border: '1px solid #666',
  borderRadius: 4,
  padding: '4px 24px 4px 22px',
  fontSize: 12,
  width: 200,
  outline: 'none',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: 2,
  background: '#333',
  border: '1px solid #555',
  borderRadius: 4,
  zIndex: 200,
  minWidth: 130,
  display: 'flex',
  flexDirection: 'column',
};

const dropdownItemStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#eee',
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: 12,
  textAlign: 'left',
};

const dialectBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#aaa',
  border: '1px solid #555',
  borderRadius: 3,
  padding: '2px 6px',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};
