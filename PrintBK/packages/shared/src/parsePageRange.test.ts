import { describe, it, expect } from 'vitest';
import { parsePageRange } from './parsePageRange';

describe('parsePageRange', () => {
  it('handles basic ranges', () => {
    expect(parsePageRange('1-5', 10).pages).toEqual([1, 2, 3, 4, 5]);
    expect(parsePageRange('1 to 5', 10).pages).toEqual([1, 2, 3, 4, 5]);
    expect(parsePageRange('1..5', 10).pages).toEqual([1, 2, 3, 4, 5]);
    expect(parsePageRange('1 – 5', 10).pages).toEqual([1, 2, 3, 4, 5]);
    expect(parsePageRange('5-1', 10).pages).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles lists', () => {
    expect(parsePageRange('1, 3, 5', 10).pages).toEqual([1, 3, 5]);
    expect(parsePageRange('1; 3; 5', 10).pages).toEqual([1, 3, 5]);
    expect(parsePageRange('pages 3 and 7', 10).pages).toEqual([3, 7]);
    expect(parsePageRange('1-3, 8, 10-', 12).pages).toEqual([1, 2, 3, 8, 10, 11, 12]);
  });

  it('handles open ends', () => {
    expect(parsePageRange('-5', 10).pages).toEqual([1, 2, 3, 4, 5]);
    expect(parsePageRange('10-', 12).pages).toEqual([10, 11, 12]);
    expect(parsePageRange('last', 10).pages).toEqual([10]);
    expect(parsePageRange('last 3', 10).pages).toEqual([8, 9, 10]);
  });

  it('dedupes and clamps', () => {
    expect(parsePageRange('1-5, 3-7', 10).pages).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(parsePageRange('8-15', 10).pages).toEqual([8, 9, 10]);
    expect(parsePageRange('0-5', 10).pages).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles invalid input gracefully', () => {
    expect(parsePageRange('1-5, foo, 8', 10).pages).toEqual([1, 2, 3, 4, 5, 8]);
    expect(parsePageRange('1-5, foo, 8', 10).message).toContain('ignored');
    expect(parsePageRange('invalid', 10).pages).toEqual([]);
    expect(parsePageRange('invalid', 10).message).toBe('Invalid range');
    expect(parsePageRange('', 10).pages).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(parsePageRange('all', 10).pages).toEqual([1,2,3,4,5,6,7,8,9,10]);
  });
});
