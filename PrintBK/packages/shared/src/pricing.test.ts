import { describe, it, expect } from 'vitest';
import { priceOrder } from './pricing';
import { defaultShopConfig, Basket, PrintFile } from './schemas';

describe('priceOrder', () => {
  it('calculates simple file pricing correctly', () => {
    const file: PrintFile = {
      id: 'f1', name: 'f1.pdf', size: 100, type: 'pdf', pages: 10, colorPages: 0, colorDetection: 'done',
      settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4', orientation: 'auto', nUp: 1, booklet: false, range: 'all' }
    };
    const basket: Basket = { files: [file], services: [], rush: false };
    const breakdown = priceOrder(basket, defaultShopConfig);
    
    expect(breakdown.subtotal).toBe(10); // 10 pages * 1
    expect(breakdown.lines[0].total).toBe(10);
    expect(breakdown.savingsTip).toContain('printing double-sided');
  });

  it('applies double-side discount correctly', () => {
    const file: PrintFile = {
      id: 'f1', name: 'f1.pdf', size: 100, type: 'pdf', pages: 10, colorPages: 0, colorDetection: 'done',
      settings: { copies: 1, colorMode: 'bw', sided: 'double', paper: 'A4', orientation: 'auto', nUp: 1, booklet: false, range: 'all' }
    };
    const basket: Basket = { files: [file], services: [], rush: false };
    const breakdown = priceOrder(basket, defaultShopConfig);
    
    // 10 pages @ bw 1 = 10. Discount 20% = 8.
    expect(breakdown.subtotal).toBe(8);
  });

  it('calculates booklet correctly', () => {
    // 10 pages -> booklet requires Math.ceil(10/4)*2 = 6 sheets. Wait, 10 pages -> 3 sheets of paper, meaning 6 impressions (or physical pages)??
    // Standard booklet math: each sheet of paper handles 4 pages. 10 pages fits on 3 sheets. 3 sheets = 6 sides.
    // So 12 logical spots. 6 physical sides printed. 
    // Double sided discount? Booklet implies double sided. But pricing logic assumes standard single-sided base unless specified.
    // If it's booklet, we use 6 physical sides. 6 sides * 1 = 6.
    
    const file: PrintFile = {
      id: 'f1', name: 'f1.pdf', size: 100, type: 'pdf', pages: 10, colorPages: 0, colorDetection: 'done',
      settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4', orientation: 'auto', nUp: 1, booklet: true, range: 'all' }
    };
    const basket: Basket = { files: [file], services: [], rush: false };
    const breakdown = priceOrder(basket, defaultShopConfig);
    
    expect(breakdown.subtotal).toBe(6);
  });

  it('calculates rush surcharge and handles gateway fee', () => {
    const file: PrintFile = {
      id: 'f1', name: 'f1.pdf', size: 100, type: 'pdf', pages: 100, colorPages: 0, colorDetection: 'done',
      settings: { copies: 1, colorMode: 'bw', sided: 'single', paper: 'A4', orientation: 'auto', nUp: 1, booklet: false, range: 'all' }
    };
    const basket: Basket = { files: [file], services: [], rush: true };
    const config = { ...defaultShopConfig, rushEnabled: true, rates: { ...defaultShopConfig.rates, gatewayFee: 5 } };
    
    const breakdown = priceOrder(basket, config);
    // 100 pages = 100 * 0.8 (bulk tier) = 80.
    // rush fee = 80 * 0.15 = 12.
    // gateway fee = 5.
    // total = 80 + 12 + 5 = 97.
    expect(breakdown.subtotal).toBe(80);
    expect(breakdown.rushFee).toBe(12);
    expect(breakdown.gatewayFee).toBe(5);
    expect(breakdown.total).toBe(97);
  });
});
