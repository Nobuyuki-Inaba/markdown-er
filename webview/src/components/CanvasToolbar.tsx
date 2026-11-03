import { useEffect, useRef, useState } from 'react';
import { useDiagramStore, applyHistory } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import type { LayoutDirection } from '../util/autoLayout';
import { useMessages } from '../i18n';

/** Vertical tool bar on the left of the canvas: editing and viewing the diagram */
export function CanvasToolbar() {
  const addTable        = useDiagramStore((s) => s.addTable);
  const addRegion       = useDiagramStore((s) => s.addRegion);
  const applyAutoLayout = useDiagramStore((s) => s.applyAutoLayout);
  const viewport        = useDiagramStore((s) => s.model.layout.viewport);
  const tableCount      = useDiagramStore((s) => s.model.layout.tables.length);
  const showMinimap     = useUiStore((s) => s.showMinimap);
  const toggleMinimap   = useUiStore((s) => s.toggleMinimap);
  const t = useMessages().tools;

  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);

  // Close the layout menu on any click outside it
  useEffect(() => {
    if (!layoutMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!layoutRef.current?.contains(e.target as Node)) setLayoutMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [layoutMenuOpen]);

  /** Canvas center in diagram coordinates */
  const center = () => ({
    x: (window.innerWidth  / 2 - viewport.x) / viewport.zoom,
    y: (window.innerHeight / 2 - viewport.y) / viewport.zoom,
  });

  const handleAddTable = () => {
    // Stagger each new table by 20px to avoid stacking
    const { x, y } = center();
    const offset = tableCount * 20;
    addTable(x - 120 + offset, y - 60 + offset);
  };

  const handleAddRegion = () => {
    const { x, y } = center();
    addRegion(x - 200, y - 150);
  };

  const handleLayout = (direction: LayoutDirection) => {
    setLayoutMenuOpen(false);
    applyAutoLayout(direction);
    // Fit view after layout settles
    setTimeout(() => window.dispatchEvent(new CustomEvent('er:fitView')), 50);
  };

  const fire = (event: string) => () => window.dispatchEvent(new CustomEvent(event));

  return (
    <div style={barStyle}>
      <ToolButton icon="⊞" caption={t.addTable} title={t.addTableTitle} onClick={handleAddTable} />
      <ToolButton icon="⬚" caption={t.addRegion} title={t.addRegionTitle} onClick={handleAddRegion} />

      <div style={separator} />

      <ToolButton icon="↩" caption={t.undo} title={t.undoTitle} onClick={() => applyHistory('undo')} />
      <ToolButton icon="↪" caption={t.redo} title={t.redoTitle} onClick={() => applyHistory('redo')} />

      <div style={separator} />

      <ToolButton icon="+" caption={t.zoomIn} title={t.zoomIn} onClick={fire('er:zoomIn')} />
      <ToolButton icon="−" caption={t.zoomOut} title={t.zoomOut} onClick={fire('er:zoomOut')} />
      <ToolButton icon="⤢" caption={t.fit} title={t.fitTitle} onClick={fire('er:fitView')} />

      <div style={separator} />

      <div ref={layoutRef} style={{ position: 'relative' }}>
        <ToolButton
          icon="⇅"
          caption={t.autoLayout}
          title={t.autoLayoutTitle}
          active={layoutMenuOpen}
          onClick={() => setLayoutMenuOpen((o) => !o)}
        />
        {layoutMenuOpen && (
          <div style={flyoutStyle}>
            <button style={flyoutItemStyle} onClick={() => handleLayout('auto')}>{t.layoutAuto}</button>
            <button style={flyoutItemStyle} onClick={() => handleLayout('vertical')}>{t.layoutVertical}</button>
            <button style={flyoutItemStyle} onClick={() => handleLayout('horizontal')}>{t.layoutHorizontal}</button>
          </div>
        )}
      </div>
      <ToolButton
        icon="▣"
        caption={t.minimap}
        title={showMinimap ? t.hideMinimap : t.showMinimap}
        active={showMinimap}
        onClick={toggleMinimap}
      />
    </div>
  );
}

interface ToolButtonProps {
  icon: string;
  caption: string;
  title: string;
  active?: boolean;
  onClick: () => void;
}

function ToolButton({ icon, caption, title, active = false, onClick }: ToolButtonProps) {
  return (
    <button onClick={onClick} title={title} style={toolBtnStyle(active)}>
      <span style={{ fontSize: 16, lineHeight: '18px' }}>{icon}</span>
      <span style={captionStyle}>{caption}</span>
    </button>
  );
}

const barStyle: React.CSSProperties = {
  width: 56,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  padding: '6px 0',
  background: '#2c2c2c',
  borderRight: '1px solid #444',
  // No overflow clipping: the layout flyout opens to the right of the bar, over the canvas
  position: 'relative',
  zIndex: 20,
};

const toolBtnStyle = (active: boolean): React.CSSProperties => ({
  width: 50,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 1,
  padding: '4px 0 3px',
  background: active ? '#3d4f63' : 'transparent',
  color: '#eee',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
});

const captionStyle: React.CSSProperties = {
  fontSize: 9,
  color: '#bbb',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 48,
};

const separator: React.CSSProperties = {
  width: 32,
  height: 1,
  background: '#555',
  margin: '4px 0',
};

const flyoutStyle: React.CSSProperties = {
  position: 'absolute',
  left: '100%',
  top: 0,
  marginLeft: 4,
  background: '#333',
  border: '1px solid #555',
  borderRadius: 4,
  zIndex: 200,
  minWidth: 130,
  display: 'flex',
  flexDirection: 'column',
};

const flyoutItemStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#eee',
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: 12,
  textAlign: 'left',
};
