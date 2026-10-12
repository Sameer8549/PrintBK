import { describe, it, expect } from 'vitest';
import { basketToOrderItems } from './orderItems';
import { OrderItemSchema, PhotoSpecsSchema, Basket } from './schemas';
import { defaultShopConfig } from './defaultConfig';

describe('basketToOrderItems', () => {
  it('converts pure B&W document into typed document_bw item with operator instructions', () => {
    const basket: Basket = {
      files: [{
        id: 'file-1',
        name: 'Report_2026.pdf',
        size: 1024,
        type: 'pdf',
        pages: 10,
        colorPages: 0,
        colorDetection: 'done',
        settings: {
          copies: 2,
          colorMode: 'bw',
          sided: 'double',
          paper: 'A4',
          orientation: 'portrait',
          nUp: 2,
          layout: 'standard',
          pageRotations: {},
          booklet: false,
          range: 'all'
        }
      }],
      services: [],
      rush: false
    };

    const items = basketToOrderItems(basket, defaultShopConfig);
    expect(items).toHaveLength(1);

    const doc = items[0];
    expect(doc.type).toBe('document_bw');
    expect(doc.title).toBe('Report_2026.pdf');
    expect(doc.quantity).toBe(2);
    expect(doc.specifications.sides).toBe('double');
    expect(doc.specifications.duplexEdge).toBe('long');
    expect(doc.specifications.nUp).toBe(2);
    expect(doc.printInstructions).toContain('A4, B&W, 2-sided, long-edge, 2-up, 2 copies');
    expect(doc.computedPricing.lineTotal).toBeGreaterThan(0);
    expect(doc.computedPricing.colourSubtotal).toBe(0);

    // Schema validation
    expect(() => OrderItemSchema.parse(doc)).not.toThrow();
  });

  it('converts custom colour document into single document_colour item with colorPlan and dual page counts', () => {
    const basket: Basket = {
      files: [{
        id: 'file-2',
        name: 'Thesis.pdf',
        size: 2048,
        type: 'pdf',
        pages: 20,
        colorPages: 0,
        colorDetection: 'done',
        settings: {
          copies: 1,
          colorMode: 'custom',
          colorPlan: {
            mode: 'custom',
            colorPages: [1, 5, 10]
          },
          sided: 'single',
          paper: 'A4',
          orientation: 'portrait',
          nUp: 1,
          layout: 'standard',
          pageRotations: {},
          booklet: false,
          range: 'all'
        }
      }],
      services: [],
      rush: false
    };

    const items = basketToOrderItems(basket, defaultShopConfig);
    expect(items).toHaveLength(1);

    const doc = items[0];
    expect(doc.type).toBe('document_colour');
    expect(doc.specifications.colourPagesCount).toBe(3);
    expect(doc.specifications.bwPagesCount).toBe(17);
    expect(doc.specifications.colorPlan.colorPages).toEqual([1, 5, 10]);
    expect(doc.printInstructions).toContain('Colour (3 colour, 17 B&W)');
    expect(doc.printInstructions).toContain('1-sided');
    expect(doc.computedPricing.colourSubtotal).toBe(3 * 8.00); // 3 * 8 = 24
    expect(doc.computedPricing.bwSubtotal).toBe(17 * 1.50);    // 17 * 1.50 = 25.5
    expect(doc.computedPricing.lineTotal).toBe(49.50);

    // Schema validation
    expect(() => OrderItemSchema.parse(doc)).not.toThrow();
  });

  it('converts all auxiliary services into typed items with human-readable operator instructions', () => {
    const basket: Basket = {
      files: [],
      services: [
        {
          id: 'srv-photo-1',
          type: 'addon',
          name: 'Passport Photo Print',
          detail: 'Passport size, glossy',
          qty: 8,
          price: 10
        },
        {
          id: 'srv-bind-1',
          type: 'addon',
          name: 'Spiral Binding',
          detail: '50 pages, color cover',
          qty: 1,
          price: 45
        },
        {
          id: 'srv-lam-1',
          type: 'addon',
          name: 'A4 Lamination',
          detail: 'A4, thick',
          qty: 2,
          price: 30
        },
        {
          id: 'srv-scan-1',
          type: 'addon',
          name: 'Document Scanning',
          detail: '600 DPI, colour, pdf via whatsapp',
          qty: 5,
          price: 5
        },
        {
          id: 'srv-copy-1',
          type: 'walkin',
          name: 'Photocopy',
          detail: 'double-sided, colour',
          qty: 10,
          price: 15
        },
        {
          id: 'srv-typ-1',
          type: 'request',
          name: 'Tamil to English Typing',
          detail: 'Urgent project report format',
          counterNote: 'Include table of contents',
          qty: 4,
          price: 50
        }
      ],
      rush: false
    };

    const items = basketToOrderItems(basket, defaultShopConfig);
    expect(items).toHaveLength(6);

    // 1. Photo
    expect(items[0].type).toBe('photo');
    expect(items[0].specifications.size).toBe('passport');
    expect(items[0].specifications.copies).toBe(8);
    expect(items[0].specifications.paperType).toBe('glossy');
    expect(items[0].printInstructions).toBe('Photo print (passport), 8 copies, glossy');

    // 2. Binding
    expect(items[1].type).toBe('binding');
    expect(items[1].specifications.kind).toBe('spiral');
    expect(items[1].specifications.pageCount).toBe(50);
    expect(items[1].specifications.colorCover).toBe(true);
    expect(items[1].printInstructions).toBe('Spiral binding (50 pages, color cover)');

    // 3. Lamination
    expect(items[2].type).toBe('lamination');
    expect(items[2].specifications.size).toBe('A4');
    expect(items[2].specifications.thickness).toBe('thick');
    expect(items[2].specifications.quantity).toBe(2);
    expect(items[2].printInstructions).toBe('A4 lamination (thick), 2 pcs');

    // 4. Scanning
    expect(items[3].type).toBe('scanning');
    expect(items[3].specifications.pages).toBe(5);
    expect(items[3].specifications.dpi).toBe(600);
    expect(items[3].specifications.colour).toBe('colour');
    expect(items[3].specifications.format).toBe('pdf');
    expect(items[3].specifications.delivery).toBe('whatsapp');
    expect(items[3].printInstructions).toBe('Scan 5 pages at 600 DPI (colour, pdf via whatsapp)');

    // 5. Photocopy
    expect(items[4].type).toBe('photocopy');
    expect(items[4].specifications.pages).toBe(10);
    expect(items[4].specifications.sides).toBe('double');
    expect(items[4].specifications.colour).toBe('colour');
    expect(items[4].printInstructions).toBe('Photocopy 10 pages (colour, 2-sided)');

    // 6. Typing / Custom
    expect(items[5].type).toBe('typing_custom');
    expect(items[5].specifications.urgency).toBe('urgent');
    expect(items[5].specifications.notes).toBe('Include table of contents');
    expect(items[5].printInstructions).toBe('Typing / Custom service: Tamil to English Typing (4 pages estimated)');

    // Ensure all 6 items parse under OrderItemSchema
    for (const it of items) {
      expect(() => OrderItemSchema.parse(it)).not.toThrow();
    }
  });

  it('rejects malformed items under OrderItemSchema', () => {
    // Missing required fields
    expect(() => OrderItemSchema.parse({
      id: 'bad-1',
      type: 'invalid_service_type',
      title: 'Bad'
    })).toThrow();

    // Invalid enum in specifications
    expect(() => OrderItemSchema.parse({
      id: 'bad-2',
      type: 'photo',
      title: 'Photo',
      quantity: 1,
      specifications: { size: 'unknown_size' },
      computedPricing: { unitPrice: 10, lineTotal: 10 },
      printInstructions: 'Photo'
    })).not.toThrow(); // specifications is flexible map on OrderItemSchema, but PhotoSpecsSchema rejects it:
    
    // Test individual specs schema rejection:
    expect(() => PhotoSpecsSchema.parse({ size: 'unknown_size' })).toThrow();
  });
});
