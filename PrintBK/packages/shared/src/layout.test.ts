import { describe, it, expect } from 'vitest';
import { photoLayout } from './layout';

describe('photoLayout', () => {
  it('generates passport layout correctly', () => {
    const result = photoLayout('Passport 8-up');
    expect(result.slots.length).toBe(8);
    expect(result.slots[0].width).toBe(35);
    expect(result.slots[0].height).toBe(45);
  });

  it('generates ID card layout', () => {
    const result = photoLayout('ID card');
    expect(result.slots.length).toBe(2);
    expect(result.slots[0].width).toBe(85.6);
  });

  it('generates Custom layout', () => {
    const result = photoLayout('Custom', { rows: 3, cols: 3 });
    expect(result.slots.length).toBe(9);
  });
});
