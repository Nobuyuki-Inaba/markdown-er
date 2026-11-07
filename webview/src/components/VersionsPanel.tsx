import { useState } from 'react';
import type { SchemaVersion } from '@shared/DiagramModel';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { sendToExtension } from '../vscodeApi';
import { useMessages, formatDateTime } from '../i18n';
import { VersionCompareDialog } from './VersionCompareDialog';

export function VersionsPanel() {
  const isOpen       = useUiStore((s) => s.isVersionsOpen);
  const close        = useUiStore((s) => s.closeVersions);
  const schemaVersions = useDiagramStore((s) => s.model.schemaVersions ?? []);

  const locale       = useUiStore((s) => s.locale);
  const t = useMessages().versions;

  const restoreVersion = useDiagramStore((s) => s.restoreVersion);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [compareFromId, setCompareFromId] = useState<string | null>(null);
  const [restoredName, setRestoredName] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDelete = (versionId: string) => {
    sendToExtension({ type: 'deleteVersion', payload: { versionId } });
    setConfirmDeleteId(null);
  };

  const handleRestore = (version: SchemaVersion) => {
    restoreVersion(version);
    setConfirmRestoreId(null);
    setRestoredName(version.name);
    setTimeout(() => window.dispatchEvent(new CustomEvent('er:fitView')), 50);
  };

  return (
    <>
    {/* Outside the panel: its transform would make the dialog's fixed position relative to the panel */}
    {compareFromId && <VersionCompareDialog initialFromId={compareFromId} onClose={() => setCompareFromId(null)} />}
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700 }}>{t.title}</span>
        <button onClick={close} style={closeBtnStyle}>✕</button>
      </div>

      <div style={{ padding: '10px 12px', overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
        {restoredName && <div style={restoredStyle}>✓ {t.restored(restoredName)}</div>}
        {schemaVersions.length === 0 ? (
          <div style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            <div style={{ marginBottom: 6 }}>{t.empty}</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>{t.emptyHint}</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={th}>{t.name}</th>
                <th style={th}>{t.date}</th>
                <th style={th}>{t.tables}</th>
                <th style={th}>{t.relations}</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {schemaVersions.map((v) => (
                <tr key={v.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{v.name}</td>
                  <td style={{ ...td, color: '#555' }}>{formatDateTime(v.date, locale)}</td>
                  <td style={{ ...td, textAlign: 'center', color: '#555' }}>{v.tables.length}</td>
                  <td style={{ ...td, textAlign: 'center', color: '#555' }}>{v.relations.length}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => setCompareFromId(v.id)}
                      style={{ ...actionBtnStyle, background: '#5a5a8a', color: '#fff', marginRight: 4 }}
                      title={t.compareTitle(v.name)}
                    >
                      {t.compareButton}
                    </button>
                    {confirmRestoreId === v.id ? (
                      <span style={{ display: 'inline-flex', gap: 4, marginRight: 4 }}>
                        <button
                          onClick={() => handleRestore(v)}
                          style={{ ...actionBtnStyle, background: '#b26a00', color: '#fff' }}
                          title={t.restoreWarning}
                        >
                          {t.confirmRestore}
                        </button>
                        <button
                          onClick={() => setConfirmRestoreId(null)}
                          style={{ ...actionBtnStyle, background: '#888', color: '#fff' }}
                        >
                          {t.cancel}
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => { setConfirmRestoreId(v.id); setRestoredName(null); }}
                        style={{ ...actionBtnStyle, background: '#4a7c9e', color: '#fff', marginRight: 4 }}
                        title={t.restoreTitle(v.name)}
                      >
                        {t.restore}
                      </button>
                    )}
                    {confirmDeleteId === v.id ? (
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          onClick={() => handleDelete(v.id)}
                          style={{ ...actionBtnStyle, background: '#c0392b', color: '#fff' }}
                        >
                          {t.confirmDelete}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          style={{ ...actionBtnStyle, background: '#888', color: '#fff' }}
                        >
                          {t.cancel}
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(v.id)}
                        style={{ ...actionBtnStyle, background: '#e55', color: '#fff' }}
                        title={t.deleteTitle(v.name)}
                      >
                        {t.delete}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </>
  );
}

const panelStyle: React.CSSProperties = {
  // Fixed light panel: the theme's text color may be light too
  color: '#222',
  position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)',
  width: 760, maxWidth: '95vw',
  background: '#fff', border: '1px solid #ccc', borderRadius: 6,
  boxShadow: '0 4px 20px #0004', zIndex: 20,
};
const restoredStyle: React.CSSProperties = {
  padding: '6px 10px', marginBottom: 8, borderRadius: 4, fontSize: 12,
  background: '#e8f5e9', color: '#2e7d32', border: '1px solid #a5d6a7',
};
const headerStyle: React.CSSProperties = {
  background: '#f5f5f5', borderBottom: '1px solid #ccc',
  padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
};
const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#666',
};
const th: React.CSSProperties = {
  padding: '4px 8px', textAlign: 'left', fontSize: 11, color: '#666', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '6px 8px' };
const actionBtnStyle: React.CSSProperties = {
  border: 'none', borderRadius: 3, padding: '3px 8px',
  cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap',
};
