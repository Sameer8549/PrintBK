import { describe, it, expect } from 'vitest';
import { photoLayout, layoutSheets, getNormalizedPageMetrics } from './layout';

describe('photoLayout (legacy support)', () => {
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

describe('layoutSheets pure engine', () => {
  const a4PortraitPages = [
    { pageNumber: 1, width: 210, height: 297, rotation: 0 },
    { pageNumber: 2, width: 210, height: 297, rotation: 0 },
    { pageNumber: 3, width: 210, height: 297, rotation: 0 },
    { pageNumber: 4, width: 210, height: 297, rotation: 0 },
  ];

  const widescreenSlides = [
    { pageNumber: 1, width: 320, height: 180, rotation: 0 }, // 16:9
    { pageNumber: 2, width: 320, height: 180, rotation: 0 },
    { pageNumber: 3, width: 320, height: 180, rotation: 0 },
    { pageNumber: 4, width: 320, height: 180, rotation: 0 },
  ];

  it('1-up Portrait document generates portrait sheets with long-edge duplex', () => {
    const res = layoutSheets({
      pages: a4PortraitPages,
      paper: 'A4',
      nUp: 1,
      sides: 'double'
    });

    expect(res.sheetOrientation).toBe('portrait');
    expect(res.duplexEdge).toBe('long');
    expect(res.totalSheets).toBe(2); // 4 pages duplex = 2 sheets
    expect(res.sheets.length).toBe(4); // 4 sides
    expect(res.sheets[0].pages[0].pageNumber).toBe(1);
    expect(res.sheets[0].pages[0].rotation).toBe(0);
  });

  it('1-up Landscape slides auto-selects landscape sheet with short-edge duplex', () => {
    const res = layoutSheets({
      pages: widescreenSlides,
      paper: 'A4',
      nUp: 1,
      sides: 'double'
    });

    expect(res.sheetOrientation).toBe('landscape');
    expect(res.duplexEdge).toBe('short');
    expect(res.paperWidth).toBe(297);
    expect(res.paperHeight).toBe(210);
    expect(res.totalSheets).toBe(2);
  });

  it('2-up Landscape slides stack vertically on Portrait sheet', () => {
    const res = layoutSheets({
      pages: widescreenSlides,
      paper: 'A4',
      nUp: 2,
      orientation: 'auto'
    });

    expect(res.sheetOrientation).toBe('portrait');
    expect(res.duplexEdge).toBe('long');
    expect(res.sheets.length).toBe(2); // 4 slides / 2 per sheet = 2 sheets
    expect(res.sheets[0].pages.length).toBe(2);
    // Slide 1 on top, Slide 2 on bottom
    expect(res.sheets[0].pages[0].pageNumber).toBe(1);
    expect(res.sheets[0].pages[1].pageNumber).toBe(2);
    expect(res.sheets[0].pages[0].y).toBeLessThan(res.sheets[0].pages[1].y);
  });

  it('2-up Portrait pages place side-by-side on Landscape sheet', () => {
    const res = layoutSheets({
      pages: a4PortraitPages,
      paper: 'A4',
      nUp: 2,
      orientation: 'auto'
    });

    expect(res.sheetOrientation).toBe('landscape');
    expect(res.duplexEdge).toBe('short');
    expect(res.sheets[0].pages.length).toBe(2);
    expect(res.sheets[0].pages[0].x).toBeLessThan(res.sheets[0].pages[1].x);
  });

  it('4-up 2x2 grid positions 4 pages per sheet', () => {
    const res = layoutSheets({
      pages: a4PortraitPages,
      paper: 'A4',
      nUp: 4
    });

    expect(res.sheets.length).toBe(1);
    expect(res.sheets[0].pages.length).toBe(4);
    // Check 2x2 positioning
    const [p1, p2, p3, p4] = res.sheets[0].pages;
    expect(p1.x).toBeLessThan(p2.x);
    expect(p1.y).toBe(p2.y);
    expect(p3.x).toBeLessThan(p4.x);
    expect(p1.y).toBeLessThan(p3.y);
  });

  it('6-up Landscape slides use 2 cols x 3 rows on Portrait sheet', () => {
    const sixSlides = [
      ...widescreenSlides,
      { pageNumber: 5, width: 320, height: 180, rotation: 0 },
      { pageNumber: 6, width: 320, height: 180, rotation: 0 }
    ];

    const res = layoutSheets({
      pages: sixSlides,
      paper: 'A4',
      nUp: 6
    });

    expect(res.sheetOrientation).toBe('portrait');
    expect(res.sheets.length).toBe(1);
    expect(res.sheets[0].pages.length).toBe(6);
  });

  it('Respects different paper sizes: A3 and Legal', () => {
    const resA3 = layoutSheets({ pages: a4PortraitPages, paper: 'A3', nUp: 1 });
    expect(resA3.paperWidth).toBe(297);
    expect(resA3.paperHeight).toBe(420);

    const resLegal = layoutSheets({ pages: a4PortraitPages, paper: 'Legal', nUp: 1 });
    expect(resLegal.paperWidth).toBe(215.9);
    expect(resLegal.paperHeight).toBe(355.6);
  });

  it('Normalizes PDF /Rotate flags correctly (0, 90, 180, 270)', () => {
    const rotatedPages = [
      { pageNumber: 1, width: 210, height: 297, rotation: 0 },
      { pageNumber: 2, width: 210, height: 297, rotation: 90 },
      { pageNumber: 3, width: 210, height: 297, rotation: 180 },
      { pageNumber: 4, width: 210, height: 297, rotation: 270 },
    ];

    const m1 = getNormalizedPageMetrics(rotatedPages[0]);
    const m2 = getNormalizedPageMetrics(rotatedPages[1]);
    const m3 = getNormalizedPageMetrics(rotatedPages[2]);
    const m4 = getNormalizedPageMetrics(rotatedPages[3]);

    expect(m1.effectiveWidth).toBe(210);
    expect(m1.isLandscape).toBe(false);

    expect(m2.effectiveWidth).toBe(297); // 90 deg swaps width & height
    expect(m2.isLandscape).toBe(true);

    expect(m3.effectiveWidth).toBe(210); // 180 deg preserves aspect
    expect(m3.isLandscape).toBe(false);

    expect(m4.effectiveWidth).toBe(297); // 270 deg swaps width & height
    expect(m4.isLandscape).toBe(true);
  });

  it('Handout mode places 3 slides per sheet with note lines', () => {
    const res = layoutSheets({
      pages: widescreenSlides,
      layout: 'handout'
    });

    expect(res.sheetOrientation).toBe('portrait');
    expect(res.sheets.length).toBe(2); // 4 slides / 3 per sheet = 2 sheets
    // First sheet has 3 slides + 3 note line entries = 6 placed items
    expect(res.sheets[0].pages.length).toBe(6);
    const noteLines = res.sheets[0].pages.filter(p => p.isHandoutNoteLine);
    expect(noteLines.length).toBe(3);
  });

  it('Booklet mode generates signature pair imposition on Landscape sheets', () => {
    const res = layoutSheets({
      pages: a4PortraitPages, // 4 pages
      layout: 'booklet',
      sides: 'double'
    });

    expect(res.sheetOrientation).toBe('landscape');
    expect(res.sheets.length).toBe(2); // 1 sheet duplex = 2 sides
    // Sheet 1 front has Page 4 on left, Page 1 on right
    expect(res.sheets[0].pages[0].pageNumber).toBe(4);
    expect(res.sheets[0].pages[1].pageNumber).toBe(1);
    // Sheet 1 back has Page 2 on left, Page 3 on right
    expect(res.sheets[1].pages[0].pageNumber).toBe(2);
    expect(res.sheets[1].pages[1].pageNumber).toBe(3);
  });

  it('Permanent Regression Test for Bug A: Mixed slide dimensions and rotated slides', () => {
    const mixedSlides = [
      { pageNumber: 1, width: 1920, height: 1080, rotation: 0 }, // 16:9 Landscape
      { pageNumber: 2, width: 1440, height: 1080, rotation: 0 }, // 4:3 Landscape
      { pageNumber: 3, width: 1080, height: 1920, rotation: 0 }, // Portrait slide
      { pageNumber: 4, width: 1920, height: 1080, rotation: 90 }, // Rotated slide
    ];

    const res = layoutSheets({
      pages: mixedSlides,
      paper: 'A4',
      nUp: 1
    });

    // Detects mixed slide sizes
    expect(res.hasMixedSlideSizes).toBe(true);
    expect(res.notes.length).toBeGreaterThan(0);
    expect(res.notes[0]).toContain('Slides 3, 4 are portrait');

    // Asserts each slide is fitted properly within its sheet bounding box without negative coordinates or overflow
    for (const sheet of res.sheets) {
      for (const page of sheet.pages) {
        expect(page.x).toBeGreaterThanOrEqual(0);
        expect(page.y).toBeGreaterThanOrEqual(0);
        expect(page.x + page.width).toBeLessThanOrEqual(res.paperWidth + 1);
        expect(page.y + page.height).toBeLessThanOrEqual(res.paperHeight + 1);
      }
    }
  });
});
