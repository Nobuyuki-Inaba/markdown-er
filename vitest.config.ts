import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

// The WebView's `@shared` alias, so its pure utilities can be tested here too
export default defineConfig({
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
});
