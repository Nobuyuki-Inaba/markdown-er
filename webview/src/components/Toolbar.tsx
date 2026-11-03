import { useRef, useState } from 'react';
import { useDiagramStore, applyHistory } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { sendToExtension } from '../vscodeApi';
import type { LayoutDirection } from '../util/autoLayout';
import type { DiagramModel } from '@shared/DiagramModel';
import type { LanguageSetting } from '@shared/messages';
import { useMessages } from '../i18n';

export function Toolbar() {
  const nameMode    = useDiagramStore((s) => s.model.layout.nameMode);
  const setNameMode = useDiagramStore((s) => s.setNameMode);
  const addTable    = useDiagramStore((s) => s.addTable);
  const addRegion   = useDiagramStore((s) => s.addRegion);
  const applyAutoLayout = useDiagramStore((s) => s.applyAutoLayout);
  const viewport    = useDiagramStore((s) => s.model.layout.viewport);
  const tableCount  = useDiagramStore((s) => s.model.layout.tables.length);
  const model       = useDiagramStore((s) => s.model);

  const openDictionary = useUiStore((s) => s.openDictionary);
  const openCsvImport  = useUiStore((s) => s.openCsvImport);
  const openVersions   = useUiStore((s) => s.openVersions);
  const openDatabase   = useUiStore((s) => s.openDatabase);
  const languageSetting = useUiStore((s) => s.languageSetting);
  const t = useMessages().toolbar;
  const dialect        = useUiStore((s) => s.dialect);
  const showMinimap    = useUiStore((s) => s.showMinimap);
  const toggleMinimap  = useUiStore((s) => s.toggleMinimap);
  const searchQuery    = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);

  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const layoutBtnRef = useRef<HTMLButtonElement>(null);

  const undo = () => applyHistory('undo');
  const redo = () => applyHistory('redo');

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
      <button onClick={handleAddTable} style={btnStyle} title={t.addTableTitle}>
        {t.addTable}
      </button>
      <button onClick={handleAddRegion} style={btnStyle} title={t.addRegionTitle}>
        {t.addRegion}
      </button>

      <div style={divider} />

      <button
        onClick={() => setNameMode(nameMode === 'logical' ? 'physical' : 'logical')}
        style={{ ...btnStyle, minWidth: 130 }}
        title={t.nameModeTitle}
      >
        {nameMode === 'logical' ? t.logicalNames : t.physicalNames}
      </button>

      <div style={divider} />

      <button onClick={undo} style={iconBtnStyle} title={t.undoTitle}>↩</button>
      <button onClick={redo} style={iconBtnStyle} title={t.redoTitle}>↪</button>

      <div style={divider} />

      <button
        onClick={() => window.dispatchEvent(new CustomEvent('er:zoomOut'))}
        style={{ ...btnStyle, padding: '4px 8px', minWidth: 28 }}
        title={t.zoomOut}
      >−</button>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('er:fitView'))}
        style={btnStyle}
        title={t.fitTitle}
      >{t.fit}</button>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('er:zoomIn'))}
        style={{ ...btnStyle, padding: '4px 8px', minWidth: 28 }}
        title={t.zoomIn}
      >+</button>

      <div style={divider} />

      {/* Auto Layout split button */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex' }}>
          <button
            onClick={() => handleLayout('auto')}
            style={{ ...btnStyle, borderRadius: '4px 0 0 4px', borderRight: 'none' }}
            title={t.autoLayoutTitle}
          >
            {t.autoLayout}
          </button>
          <button
            ref={layoutBtnRef}
            onClick={() => setLayoutMenuOpen((o) => !o)}
            style={{ ...btnStyle, borderRadius: '0 4px 4px 0', padding: '4px 6px', minWidth: 'unset' }}
            title={t.layoutMenuTitle}
          >
            ▾
          </button>
        </div>
        {layoutMenuOpen && (
          <div style={dropdownStyle}>
            <button style={dropdownItemStyle} onClick={() => handleLayout('vertical')}>
              {t.layoutVertical}
            </button>
            <button style={dropdownItemStyle} onClick={() => handleLayout('horizontal')}>
              {t.layoutHorizontal}
            </button>
            <button style={dropdownItemStyle} onClick={() => handleLayout('auto')}>
              {t.layoutAuto}
            </button>
          </div>
        )}
      </div>

      <div style={divider} />

      <button onClick={openDictionary} style={btnStyle} title={t.dictionaryTitle}>
        {t.dictionary}
      </button>

      <button onClick={openCsvImport} style={btnStyle} title={t.importCsvTitle}>
        {t.importCsv}
      </button>

      <div style={divider} />

      {/* Search box */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <span style={{ position: 'absolute', left: 6, fontSize: 12, color: '#aaa', pointerEvents: 'none' }}>🔍</span>
        <input
          type="text"
          placeholder={t.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={searchInputStyle}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{ position: 'absolute', right: 4, background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 12, padding: 0 }}
            title={t.clearSearch}
          >✕</button>
        )}
      </div>

      <button
        onClick={toggleMinimap}
        style={{ ...btnStyle, ...(showMinimap ? {} : { color: '#888', borderColor: '#555' }) }}
        title={showMinimap ? t.hideMinimap : t.showMinimap}
      >
        {t.minimap}
      </button>

      <div style={{ flex: 1 }} />

      <button
        onClick={() => sendToExtension({ type: 'saveVersion', payload: { model: model as DiagramModel } })}
        style={{ ...btnStyle, background: '#5a5a8a', color: '#fff' }}
        title={t.saveVersionTitle}
      >
        {t.saveVersion}
      </button>
      <button
        onClick={openVersions}
        style={{ ...btnStyle, background: '#5a5a8a', color: '#fff' }}
        title={t.versionsTitle}
      >
        {t.versions}
      </button>
      <button onClick={openDatabase} style={btnStyle} title={t.databaseTitle}>
        {t.database}
      </button>

      <button
        onClick={() => {
          window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: 'full' } }));
        }}
        style={{ ...btnStyle, background: '#4a8a5a', color: '#fff' }}
        title={t.exportDdl}
      >
        {t.exportDdl}
      </button>

      <span style={dialectBadgeStyle} title={t.dialectTitle}>
        {dialect}
      </span>

      <select
        value={languageSetting}
        onChange={(e) => sendToExtension({ type: 'setLanguage', payload: { setting: e.target.value as LanguageSetting } })}
        style={{ ...btnStyle, padding: '3px 4px' }}
        title={t.languageTitle}
      >
        <option value="auto">Auto</option>
        <option value="en">English</option>
        <option value="ja">日本語</option>
      </select>

      <button
        onClick={() => sendToExtension({ type: 'openSettings' })}
        style={{ ...btnStyle, padding: '4px 7px', minWidth: 'unset', fontSize: 14 }}
        title={t.settingsTitle}
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
  minHeight: 40,
  boxSizing: 'border-box',
  // Wrap onto a second row instead of clipping when the panel is narrow
  flexWrap: 'wrap',
  rowGap: 4,
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

const iconBtnStyle: React.CSSProperties = { ...btnStyle, padding: '4px 8px', minWidth: 28 };

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
  width: 170,
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
