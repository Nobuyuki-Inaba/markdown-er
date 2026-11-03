import { describe, expect, it } from 'vitest';
import { formatTypeSize, parseTypeSize, typeTakesSize } from '../shared/DiagramModel';

describe('type size', () => {
  it('formats length and scale', () => {
    expect(formatTypeSize({ length: 255 })).toBe('255');
    expect(formatTypeSize({ length: 10, scale: 2 })).toBe('10,2');
    expect(formatTypeSize({ length: null })).toBe('');
  });

  it('parses sizes, empty as no size', () => {
    expect(parseTypeSize('50')).toEqual({ length: 50, scale: null });
    expect(parseTypeSize(' 10 , 2 ')).toEqual({ length: 10, scale: 2 });
    expect(parseTypeSize('')).toEqual({ length: null, scale: null });
    expect(parseTypeSize('abc')).toBeNull();
    expect(parseTypeSize('10,')).toBeNull();
  });

  it('knows which types take a size', () => {
    expect(typeTakesSize('VARCHAR')).toBe(true);
    expect(typeTakesSize('DECIMAL')).toBe(true);
    expect(typeTakesSize('TEXT')).toBe(false);
    expect(typeTakesSize('DATE')).toBe(false);
    expect(typeTakesSize('BIGINT')).toBe(false);
  });
});
