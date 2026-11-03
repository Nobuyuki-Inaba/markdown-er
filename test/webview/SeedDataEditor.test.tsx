import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SEED_TABLE_MAX_HEIGHT, SeedDataEditor } from '../../webview/src/components/SeedDataEditor';
import { col, table } from '../fixtures';

/** A table with many columns and 50 seed rows */
function render() {
  const columns = Array.from({ length: 12 }, (_, i) => col(`c${i}`, `column_${i}`, 'd_name'));
  const seedData = Array.from({ length: 50 }, (_, r) =>
    Object.fromEntries(columns.map((c) => [c.physicalName, `${r}-${c.physicalName}`])));
  const html = renderToStaticMarkup(
    <SeedDataEditor table={table('t', 'items', columns, { seedData })} onUpdate={() => {}} />,
  );
  return new DOMParserLite(html);
}

/** Just enough HTML inspection for static markup, without a DOM library */
class DOMParserLite {
  constructor(readonly html: string) {}

  /** The element with the attribute, as an HTML string */
  element(attribute: string): string {
    const start = this.html.indexOf(`<div ${attribute}`);
    expect(start, attribute).toBeGreaterThanOrEqual(0);
    let depth = 0;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = start;
    for (let m = re.exec(this.html); m; m = re.exec(this.html)) {
      depth += m[0] === '</div>' ? -1 : 1;
      if (depth === 0) { return this.html.slice(start, m.index + m[0].length); }
    }
    throw new Error('unclosed element');
  }

  styleOf(element: string): string {
    return element.match(/style="([^"]*)"/)![1];
  }
}

describe('SeedDataEditor scrolling', () => {
  it('scrolls the table itself once the rows pass a height', () => {
    const doc = render();
    const scroll = doc.element('data-seed-scroll');
    const style = doc.styleOf(scroll);
    expect(style).toContain(`max-height:${SEED_TABLE_MAX_HEIGHT}`);
    expect(style).toContain('overflow:auto');
    expect(scroll.match(/<tr>/g)).toHaveLength(51); // header + 50 rows, all inside
  });

  it('keeps the header row in view while scrolling down', () => {
    const header = render().html.match(/<thead>[\s\S]*?<\/thead>/)![0];
    const cells = header.match(/<th\b[^>]*>/g)!;
    expect(cells.length).toBe(14);
    for (const th of cells) {
      expect(th).toContain('position:sticky');
      expect(th).toContain('top:0');
    }
  });

  it('keeps the row numbers in view while scrolling sideways', () => {
    const firstRow = render().html.match(/<tbody><tr>([\s\S]*?)<\/tr>/)![1];
    const rowNumber = firstRow.match(/<td[^>]*>/)![0];
    expect(rowNumber).toContain('position:sticky');
    expect(rowNumber).toContain('left:0');
    expect(rowNumber).toContain('background:#fff');
  });

  it('keeps the buttons outside the scrolling area', () => {
    const doc = render();
    const scroll = doc.element('data-seed-scroll');
    expect(scroll).not.toContain('<button>');
    expect(scroll).not.toContain('type="file"');
    const after = doc.html.slice(doc.html.indexOf(scroll) + scroll.length);
    expect(after).toContain('type="file"');
    expect(after.match(/<button/g)!.length).toBe(2); // add row, CSV template
  });
});
