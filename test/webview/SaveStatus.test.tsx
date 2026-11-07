import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SaveStatusLabel } from '../../webview/src/components/Toolbar';

describe('SaveStatusLabel', () => {
  it.each([
    ['saved', 'Saved'], ['saving', 'Saving…'], ['failed', 'Save failed'], ['readOnly', 'Read-only'],
  ] as const)('shows %s', (state, text) => {
    expect(renderToStaticMarkup(<SaveStatusLabel state={state} />)).toContain(`>${text}<`);
  });
});
