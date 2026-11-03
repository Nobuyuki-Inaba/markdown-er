import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { sendToExtension } from '../vscodeApi';
import type { DiagramModel } from '@shared/DiagramModel';
import type { LanguageSetting } from '@shared/messages';
import { useMessages } from '../i18n';

/** Top bar: diagram-wide settings and output. Canvas editing tools live in CanvasToolbar. */
export function Toolbar() {
  const nameMode    = useDiagramStore((s) => s.model.layout.nameMode);
  const setNameMode = useDiagramStore((s) => s.setNameMode);
  const model       = useDiagramStore((s) => s.model);

  const openDictionary  = useUiStore((s) => s.openDictionary);
  const openCsvImport   = useUiStore((s) => s.openCsvImport);
  const openVersions    = useUiStore((s) => s.openVersions);
  const openDatabase    = useUiStore((s) => s.openDatabase);
  const languageSetting = useUiStore((s) => s.languageSetting);
  const dialect         = useUiStore((s) => s.dialect);
  const searchQuery     = useUiStore((s) => s.searchQuery);
  const setSearchQuery  = useUiStore((s) => s.setSearchQuery);
  const t = useMessages().toolbar;

  return (
    <div style={toolbarStyle}>
      {/* View */}
      <button
        onClick={() => setNameMode(nameMode === 'logical' ? 'physical' : 'logical')}
        style={{ ...btnStyle, minWidth: 110 }}
        title={t.nameModeTitle}
      >
        {nameMode === 'logical' ? t.logicalNames : t.physicalNames}
      </button>

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

      <div style={divider} />

      {/* Schema definition */}
      <button onClick={openDictionary} style={btnStyle} title={t.dictionaryTitle}>
        {t.dictionary}
      </button>
      <button onClick={openCsvImport} style={btnStyle} title={t.importCsvTitle}>
        {t.importCsv}
      </button>
      <button onClick={openDatabase} style={btnStyle} title={t.databaseTitle}>
        {t.database}
      </button>

      <div style={{ flex: 1 }} />

      {/* Versions and output */}
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
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('er:requestDdl', { detail: { mode: 'full' } }))}
        style={{ ...btnStyle, background: '#4a8a5a', color: '#fff' }}
        title={t.exportDdl}
      >
        {t.exportDdl}
      </button>
      <span style={dialectBadgeStyle} title={t.dialectTitle}>
        {dialect}
      </span>

      <div style={divider} />

      {/* Preferences */}
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

const dialectBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#aaa',
  border: '1px solid #555',
  borderRadius: 3,
  padding: '2px 6px',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};
