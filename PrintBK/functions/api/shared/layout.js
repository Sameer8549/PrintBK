"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.photoLayout = photoLayout;
function photoLayout(preset, customOpts) {
    const A4_W = 210;
    const A4_H = 297;
    if (preset === 'Passport 8-up') {
        // 35x45mm passport. Let's arrange 2 columns, 4 rows
        // Standard photo paper might be 4x6 inch (102x152 mm) for passport prints,
        // but assuming A4 here unless specified. Let's assume 4x6 for 8-up passport
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
        // 85.6 x 54 mm
        return {
            paperWidth: A4_W,
            paperHeight: A4_H,
            slots: [
                { x: 20, y: 20, width: 85.6, height: 54 },
                { x: 20, y: 90, width: 85.6, height: 54 } // back
            ]
        };
    }
    if (preset === 'Aadhaar') {
        // Similar to ID but maybe different dimensions or same
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
        // Two 4x6 inch (102x152 mm) prints on A4
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
    // Fallback (e.g. Resume, Full page)
    return {
        paperWidth: A4_W,
        paperHeight: A4_H,
        slots: [{ x: 10, y: 10, width: A4_W - 20, height: A4_H - 20 }]
    };
}
