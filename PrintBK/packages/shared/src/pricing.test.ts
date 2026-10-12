import { describe, it, expect } from 'vitest';
import { priceOrder } from './pricing';
import { defaultShopConfig } from './schemas';
import goldenVectors from '../test-vectors/pricing.json';

describe('priceOrder - Golden Vectors & Edge Cases', () => {
  it(`passes all ${goldenVectors.length} golden test vectors with <= 0.01 INR precision`, () => {
    for (const vector of goldenVectors) {
      const config = {
        ...defaultShopConfig,
        rates: vector.configRates as any,
        rushEnabled: vector.rushEnabled
      };
      const result = priceOrder(vector.basket as any, config);
      expect(Math.abs(result.subtotal - vector.expected.subtotal)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(result.total - vector.expected.total)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(result.rushFee - vector.expected.rushFee)).toBeLessThanOrEqual(0.01);
      expect(result.quotePending).toBe(vector.expected.quotePending);
    }
  });

  it('correctly calculates B&W single sided rate (₹1.50/page)', () => {
    const basket = {
      files: [{
        id: 'f1', name: 'single.pdf', pages: 10,
        settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' }
      }],
      services: [], rush: false
    };
    const res = priceOrder(basket as any, defaultShopConfig);
    // 10 pages * 1.50 = 15.00
    expect(res.total).toBe(15.0);
  });

  it('correctly calculates B&W duplex rate (₹0.85/page)', () => {
    const basket = {
      files: [{
        id: 'f1', name: 'duplex.pdf', pages: 10,
        settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A4' }
      }],
      services: [], rush: false
    };
    const res = priceOrder(basket as any, defaultShopConfig);
    // 10 pages * 0.85 = 8.50
    expect(res.total).toBe(8.5);
  });

  it('triggers bulk discount (₹0.80/page) at 100+ sheets', () => {
    const basket = {
      files: [{
        id: 'f1', name: 'bulk.pdf', pages: 100,
        settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4' }
      }],
      services: [], rush: false
    };
    const res = priceOrder(basket as any, defaultShopConfig);
    // 100 sheets * 0.80 = 80.00
    expect(res.total).toBe(80);
  });

  it('correctly prices custom per-page colour with breakdown formula', () => {
    const basket = {
      files: [{
        id: 'f1', name: 'thesis.pdf', pages: 30,
        settings: {
          copies: 1,
          colorMode: 'custom',
          colorPlan: { mode: 'custom', colorPages: [1, 2] },
          sided: 'single',
          paper: 'A4'
        }
      }],
      services: [], rush: false
    };
    const res = priceOrder(basket as any, defaultShopConfig);
    // 2 colour pages * ₹8.00 + 28 B&W pages * ₹1.50 = 16.00 + 42.00 = 58.00
    expect(res.total).toBe(58.0);
    expect(res.lines[0].formula).toContain('2 colour pgs × ₹8.00 + 28 B&W pgs × ₹1.50');
  });

  it('correctly prices custom colour in 2-up imposition', () => {
    const basket = {
      files: [{
        id: 'f1', name: 'slides.pptx', pages: 10,
        settings: {
          copies: 1,
          nUp: 2,
          colorMode: 'custom',
          colorPlan: { mode: 'custom', colorPages: [1] }, // Face 1 has [1, 2], so Face 1 is colour. Faces 2..5 are B&W
          sided: 'single',
          paper: 'A4'
        }
      }],
      services: [], rush: false
    };
    const res = priceOrder(basket as any, defaultShopConfig);
    // 1 colour face * 8.00 + 4 B&W faces * 1.50 = 8.00 + 6.00 = 14.00
    expect(res.total).toBe(14.0);
  });
});
