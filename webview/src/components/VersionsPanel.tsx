import { useState } from 'react';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { sendToExtension } from '../vscodeApi';

export function VersionsPanel() {
  const isOpen       = useUiStore((s) => s.isVersionsOpen);
  const close        = useUiStore((s) => s.closeVersions);
  const schemaVersions = useDiagramStore((s) => s.model.schemaVersions ?? []);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDelete = (versionId: string) => {
    sendToExtension({ type: 'deleteVersion', payload: { versionId } });
    setConfirmDeleteId(null);
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700 }}>Saved Versions</span>
        <button onClick={close} style={closeBtnStyle}>✕</button>
      </div>

      <div style={{ padding: '10px 12px', overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
        {schemaVersions.length === 0 ? (
          <div style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            <div style={{ marginBottom: 6 }}>保存済みバージョンはありません</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>ツールバーの「Save Version」でスナップショットを保存できます</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={th}>バージョン名</th>
                <th style={th}>保存日時</th>
                <th style={th}>テーブル数</th>
                <th style={th}>リレーション数</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {schemaVersions.map((v) => (
                <tr key={v.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{v.name}</td>
                  <td style={{ ...td, color: '#555' }}>{formatDate(v.date)}</td>
                  <td style={{ ...td, textAlign: 'center', color: '#555' }}>{v.tables.length}</td>
                  <td style={{ ...td, textAlign: 'center', color: '#555' }}>{v.relations.length}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {confirmDeleteId === v.id ? (
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          onClick={() => handleDelete(v.id)}
                          style={{ ...actionBtnStyle, background: '#c0392b', color: '#fff' }}
                        >
                          削除する
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          style={{ ...actionBtnStyle, background: '#888', color: '#fff' }}
                        >
                          取消
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(v.id)}
                        style={{ ...actionBtnStyle, background: '#e55', color: '#fff' }}
                        title={`${v.name} を削除`}
                      >
                        削除
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
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const panelStyle: React.CSSProperties = {
  position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)',
  width: 640, maxWidth: '95vw',
  background: '#fff', border: '1px solid #ccc', borderRadius: 6,
  boxShadow: '0 4px 20px #0004', zIndex: 20,
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
