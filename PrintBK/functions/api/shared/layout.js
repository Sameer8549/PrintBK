"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MARGINS = exports.PAPER_DIMENSIONS = void 0;
exports.photoLayout = photoLayout;
exports.getNormalizedPageMetrics = getNormalizedPageMetrics;
exports.layoutSheets = layoutSheets;
function photoLayout(preset, customOpts) {
    const A4_W = 210;
    const A4_H = 297;
    if (preset === 'Passport 8-up') {
        const paperWidth = 102;
        const paperHeight = 152;
        const pW = 35;
        const pH = 45;
        const slots = [];
        const spacingX = (paperWidth - pW * 2) / 3;
        const spacingY = (paperHeight - pH * 4) / 5;
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 2; col++) {
                slots.push({
                    x: spacingX + col * (pW + spacingX),
                    y: spacingY + row * (pH + spacingY),
                    width: pW,
                    height: pH
                });
            }
        }
        return { paperWidth, paperHeight, slots };
    }
    if (preset === 'ID card') {
        return {
            paperWidth: A4_W,
            paperHeight: A4_H,
            slots: [
                { x: 20, y: 20, width: 85.6, height: 54 },
                { x: 20, y: 90, width: 85.6, height: 54 }
            ]
        };
    }
    if (preset === 'Aadhaar') {
        return {
            paperWidth: A4_W,
            paperHeight: A4_H,
            slots: [
                { x: 20, y: 20, width: 90, height: 60 },
                { x: 20, y: 100, width: 90, height: 60 }
            ]
        };
    }
    if (preset === '4x6') {
        return {
            paperWidth: A4_W,
            paperHeight: A4_H,
            slots: [
                { x: (A4_W - 102) / 2, y: 20, width: 102, height: 152 },
                { x: (A4_W - 102) / 2, y: 20 + 152 + 10, width: 102, height: 152 }
            ]
        };
    }
    if (preset === 'Custom' && customOpts) {
        const slots = [];
        const margin = 10;
        const availableW = A4_W - margin * 2;
        const availableH = A4_H - margin * 2;
        const pW = (availableW - (customOpts.cols - 1) * 5) / customOpts.cols;
        const pH = (availableH - (customOpts.rows - 1) * 5) / customOpts.rows;
        for (let r = 0; r < customOpts.rows; r++) {
            for (let c = 0; c < customOpts.cols; c++) {
                slots.push({
                    x: margin + c * (pW + 5),
                    y: margin + r * (pH + 5),
                    width: pW,
                    height: pH
                });
            }
        }
        return { paperWidth: A4_W, paperHeight: A4_H, slots };
    }
    return {
        paperWidth: A4_W,
        paperHeight: A4_H,
        slots: [{ x: 10, y: 10, width: A4_W - 20, height: A4_H - 20 }]
    };
}
exports.PAPER_DIMENSIONS = {
    A4: { width: 210, height: 297 },
    A3: { width: 297, height: 420 },
    Legal: { width: 215.9, height: 355.6 }
};
exports.DEFAULT_MARGINS = {
    top: 8,
    bottom: 8,
    left: 8,
    right: 8
};
/**
 * Computes the normalized rotation and effective dimensions for a page
 */
function getNormalizedPageMetrics(page, manualRotation = 0) {
    const baseRot = page.rotation || 0;
    const totalRotation = ((baseRot + manualRotation) % 360 + 360) % 360;
    const isSwapped = totalRotation === 90 || totalRotation === 270;
    const effectiveWidth = isSwapped ? page.height : page.width;
    const effectiveHeight = isSwapped ? page.width : page.height;
    const isLandscape = effectiveWidth > effectiveHeight;
    return { effectiveWidth, effectiveHeight, totalRotation, isLandscape };
}
/**
 * Pure layout engine for document imposition and sheet generation.
 */
function layoutSheets(input) {
    const paper = input.paper || 'A4';
    const nUp = input.nUp || 1;
    const layout = input.layout || 'standard';
    const sides = input.sides || 'single';
    const orientationSetting = input.orientation || 'auto';
    const margins = { ...exports.DEFAULT_MARGINS, ...(input.margins || {}) };
    const pageRotations = input.pageRotations || {};
    const inputPages = input.pages.length > 0 ? input.pages : [{ pageNumber: 1, width: 210, height: 297, rotation: 0 }];
    // 1. Analyze page orientations & aspect ratios
    let landscapeCount = 0;
    let portraitCount = 0;
    const aspectRatios = [];
    const normalizedPages = inputPages.map(p => {
        const manual = pageRotations[p.pageNumber] || 0;
        const norm = getNormalizedPageMetrics(p, manual);
        if (norm.isLandscape)
            landscapeCount++;
        else
            portraitCount++;
        aspectRatios.push(norm.effectiveWidth / (norm.effectiveHeight || 1));
        return { ...p, ...norm };
    });
    // Check for mixed slide / page dimensions
    const minAspect = Math.min(...aspectRatios);
    const maxAspect = Math.max(...aspectRatios);
    const hasMixedSlideSizes = maxAspect - minAspect > 0.2;
    const notes = [];
    if (hasMixedSlideSizes) {
        const portraitPages = normalizedPages.filter(p => !p.isLandscape).map(p => p.pageNumber);
        if (portraitPages.length > 0 && portraitPages.length < normalizedPages.length) {
            notes.push(`Slides ${portraitPages.join(', ')} are portrait; fitted automatically.`);
        }
    }
    // 2. Determine Sheet Orientation
    let sheetOrientation;
    const majorityLandscape = landscapeCount >= portraitCount;
    if (orientationSetting === 'portrait') {
        sheetOrientation = 'portrait';
    }
    else if (orientationSetting === 'landscape') {
        sheetOrientation = 'landscape';
    }
    else {
        // Auto rules based on layout and N-up
        if (layout === 'booklet') {
            // Booklet is always 2-up on Landscape sheet
            sheetOrientation = 'landscape';
        }
        else if (layout === 'handout') {
            // Handout is 3 slides + notes lines stacked vertically on Portrait sheet
            sheetOrientation = 'portrait';
        }
        else if (nUp === 1) {
            sheetOrientation = majorityLandscape ? 'landscape' : 'portrait';
        }
        else if (nUp === 2) {
            // 2-up: landscape slides stack vertically on a Portrait sheet!
            // portrait pages placed side by side on a Landscape sheet!
            sheetOrientation = majorityLandscape ? 'portrait' : 'landscape';
        }
        else if (nUp === 4) {
            // 4-up 2x2 grid: landscape slides fit best on Landscape sheet, portrait pages on Portrait sheet
            sheetOrientation = majorityLandscape ? 'landscape' : 'portrait';
        }
        else if (nUp === 6) {
            // 6-up: 2 cols x 3 rows of landscape slides fit best on Portrait sheet;
            // 3 cols x 2 rows of portrait pages fit best on Landscape sheet
            sheetOrientation = majorityLandscape ? 'portrait' : 'landscape';
        }
        else {
            sheetOrientation = 'portrait';
        }
    }
    // Base paper dimensions in mm
    const baseDim = exports.PAPER_DIMENSIONS[paper] || exports.PAPER_DIMENSIONS.A4;
    const paperWidth = sheetOrientation === 'portrait' ? Math.min(baseDim.width, baseDim.height) : Math.max(baseDim.width, baseDim.height);
    const paperHeight = sheetOrientation === 'portrait' ? Math.max(baseDim.width, baseDim.height) : Math.min(baseDim.width, baseDim.height);
    // 3. Duplex Edge: Portrait uses Long-edge flip, Landscape uses Short-edge flip
    const duplexEdge = sheetOrientation === 'portrait' ? 'long' : 'short';
    // 4. Calculate Grid Slots per Sheet
    const printableWidth = paperWidth - margins.left - margins.right;
    const printableHeight = paperHeight - margins.top - margins.bottom;
    let cols = 1;
    let rows = 1;
    let isHandout = layout === 'handout';
    if (layout === 'booklet') {
        cols = 2;
        rows = 1;
    }
    else if (isHandout) {
        // Handout: 3 rows, left half is slide, right half is note lines
        cols = 2;
        rows = 3;
    }
    else if (nUp === 1) {
        cols = 1;
        rows = 1;
    }
    else if (nUp === 2) {
        if (sheetOrientation === 'portrait') {
            cols = 1;
            rows = 2;
        }
        else {
            cols = 2;
            rows = 1;
        }
    }
    else if (nUp === 4) {
        cols = 2;
        rows = 2;
    }
    else if (nUp === 6) {
        if (sheetOrientation === 'portrait') {
            cols = 2;
            rows = 3;
        }
        else {
            cols = 3;
            rows = 2;
        }
    }
    const slotWidth = printableWidth / cols;
    const slotHeight = printableHeight / rows;
    // 5. Place Pages into Sheets
    const sheets = [];
    if (layout === 'booklet') {
        // Booklet imposition signature
        const totalP = normalizedPages.length;
        const paddedCount = Math.ceil(totalP / 4) * 4;
        const paddedPages = [...normalizedPages];
        while (paddedPages.length < paddedCount)
            paddedPages.push(null);
        const sheetCount = paddedCount / 4;
        let sheetIndex = 1;
        for (let s = 0; s < sheetCount; s++) {
            // Front side
            const frontLeft = paddedPages[paddedCount - 1 - s * 2];
            const frontRight = paddedPages[s * 2];
            const frontSheetPages = [];
            if (frontLeft) {
                frontSheetPages.push(fitPageIntoSlot(frontLeft, margins.left, margins.top, slotWidth, slotHeight));
            }
            if (frontRight) {
                frontSheetPages.push(fitPageIntoSlot(frontRight, margins.left + slotWidth, margins.top, slotWidth, slotHeight));
            }
            sheets.push({
                sheetIndex: sheetIndex++,
                side: 'front',
                width: paperWidth,
                height: paperHeight,
                orientation: sheetOrientation,
                pages: frontSheetPages,
                duplexEdge
            });
            // Back side
            if (sides === 'double') {
                const backLeft = paddedPages[s * 2 + 1];
                const backRight = paddedPages[paddedCount - 2 - s * 2];
                const backSheetPages = [];
                if (backLeft) {
                    backSheetPages.push(fitPageIntoSlot(backLeft, margins.left, margins.top, slotWidth, slotHeight));
                }
                if (backRight) {
                    backSheetPages.push(fitPageIntoSlot(backRight, margins.left + slotWidth, margins.top, slotWidth, slotHeight));
                }
                sheets.push({
                    sheetIndex: sheetIndex++,
                    side: 'back',
                    width: paperWidth,
                    height: paperHeight,
                    orientation: sheetOrientation,
                    pages: backSheetPages,
                    duplexEdge
                });
            }
        }
    }
    else if (isHandout) {
        // Handout: 3 slides per sheet on left, note lines on right
        const slidesPerSheet = 3;
        let sheetNum = 1;
        for (let i = 0; i < normalizedPages.length; i += slidesPerSheet) {
            const chunk = normalizedPages.slice(i, i + slidesPerSheet);
            const placedPages = [];
            for (let r = 0; r < chunk.length; r++) {
                const page = chunk[r];
                const y = margins.top + r * slotHeight;
                // Slide in left column (col 0)
                placedPages.push(fitPageIntoSlot(page, margins.left, y, slotWidth, slotHeight));
                // Note lines placeholder in right column (col 1)
                placedPages.push({
                    pageNumber: page.pageNumber,
                    originalWidth: slotWidth,
                    originalHeight: slotHeight,
                    x: margins.left + slotWidth + 4,
                    y: y + 4,
                    width: slotWidth - 8,
                    height: slotHeight - 8,
                    scale: 1,
                    rotation: 0,
                    isHandoutNoteLine: true
                });
            }
            const isBack = sides === 'double' && (sheetNum % 2 === 0);
            sheets.push({
                sheetIndex: sheetNum++,
                side: isBack ? 'back' : 'front',
                width: paperWidth,
                height: paperHeight,
                orientation: sheetOrientation,
                pages: placedPages,
                duplexEdge
            });
        }
    }
    else {
        // Standard N-up placement
        const pagesPerSheet = nUp;
        let sheetNum = 1;
        for (let i = 0; i < normalizedPages.length; i += pagesPerSheet) {
            const chunk = normalizedPages.slice(i, i + pagesPerSheet);
            const placedPages = [];
            for (let idx = 0; idx < chunk.length; idx++) {
                const page = chunk[idx];
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                const x = margins.left + col * slotWidth;
                const y = margins.top + row * slotHeight;
                placedPages.push(fitPageIntoSlot(page, x, y, slotWidth, slotHeight));
            }
            const isBack = sides === 'double' && (sheetNum % 2 === 0);
            sheets.push({
                sheetIndex: sheetNum++,
                side: isBack ? 'back' : 'front',
                width: paperWidth,
                height: paperHeight,
                orientation: sheetOrientation,
                pages: placedPages,
                duplexEdge
            });
        }
    }
    const totalSheets = sides === 'double' ? Math.ceil(sheets.length / 2) : sheets.length;
    return {
        paper,
        paperWidth,
        paperHeight,
        sheetOrientation,
        duplexEdge,
        totalSheets,
        totalPhysicalPages: sheets.length,
        sheets,
        hasMixedSlideSizes,
        notes
    };
}
/**
 * Fits a page inside a slot bounding box, rotating 90 deg ONLY when it improves fit,
 * and never upside down. Centers within slot.
 */
function fitPageIntoSlot(page, slotX, slotY, slotW, slotH) {
    const effW = page.effectiveWidth || 210;
    const effH = page.effectiveHeight || 297;
    // Scale if placed upright in slot
    const scaleUpright = Math.min(slotW / effW, slotH / effH);
    // Scale if rotated 90 deg in slot
    const scaleRotated = Math.min(slotW / effH, slotH / effW);
    // Rule: rotate by 90 degrees only when it improves fit (scale is significantly larger) and slot aspect ratio differs
    const shouldRotate90 = scaleRotated > scaleUpright * 1.12;
    const chosenScale = shouldRotate90 ? scaleRotated : scaleUpright;
    const finalRot = shouldRotate90 ? (page.totalRotation + 90) % 360 : page.totalRotation;
    // Rendered dimensions inside slot
    const renderedW = (shouldRotate90 ? effH : effW) * chosenScale;
    const renderedH = (shouldRotate90 ? effW : effH) * chosenScale;
    // Centering offsets
    const x = slotX + (slotW - renderedW) / 2;
    const y = slotY + (slotH - renderedH) / 2;
    return {
        pageNumber: page.pageNumber,
        originalWidth: page.width,
        originalHeight: page.height,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        width: Math.round(renderedW * 100) / 100,
        height: Math.round(renderedH * 100) / 100,
        scale: Math.round(chosenScale * 1000) / 1000,
        rotation: finalRot
    };
}
