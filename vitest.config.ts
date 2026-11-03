import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The WebView's `@shared` alias, so its pure utilities can be tested here too.
// React resolves to the WebView's copy, so components can be rendered with react-dom/server.
// `vscode` is an in-memory stand-in (test/mocks/vscode.ts) for the extension host's file handling.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path('./shared'),
      vscode: path('./test/mocks/vscode.ts'),
      'react-dom': path('./webview/node_modules/react-dom'),
      react: path('./webview/node_modules/react'),
    },
  },
  esbuild: { jsx: 'automatic' },
});
