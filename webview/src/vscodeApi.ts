import { ExtToWebMsg, WebToExtMsg } from '@shared/messages';

declare function acquireVsCodeApi(): {
  postMessage(msg: WebToExtMsg): void;
  getState(): unknown;
  setState(state: unknown): void;
};

// acquireVsCodeApi() can only be called once
const _vscode = (() => {
  try {
    return acquireVsCodeApi();
  } catch {
    // Running outside of VSCode (e.g. vite dev server) — stub
    return {
      postMessage: (msg: WebToExtMsg) => console.log('[vscode stub] send:', msg),
      getState: () => null,
      setState: () => {},
    };
  }
})();

export function sendToExtension(msg: WebToExtMsg) {
  _vscode.postMessage(msg);
}

export function onMessageFromExtension(handler: (msg: ExtToWebMsg) => void): () => void {
  const listener = (event: MessageEvent) => {
    if (event.data && typeof event.data === 'object' && 'type' in event.data) {
      handler(event.data as ExtToWebMsg);
    }
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
