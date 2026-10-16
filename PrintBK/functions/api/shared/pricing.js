"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultShopConfig = void 0;
exports.priceOrder = priceOrder;
exports.computeFilePrintDetails = computeFilePrintDetails;
const parsePageRange_1 = require("./parsePageRange");
const defaultConfig_1 = require("./defaultConfig");
Object.defineProperty(exports, "defaultShopConfig", { enumerable: true, get: function () { return defaultConfig_1.defaultShopConfig; } });
function roundTo50Paise(val) {
    return Math.round(val * 2) / 2;
}
function priceOrder(basket, config = defaultConfig_1.defaultShopConfig, now = new Date()) {
    const lines = [];
    let subtotal = 0;
    let quotePending = false;
    let potentialSavings = 0;
    let savingsSource = '';
    for (const file of basket.files) {
        const s = file.settings || {};
        const copies = s.copies ?? 1;
        const nUp = s.nUp ?? 1;
        const colorMode = s.colorPlan?.mode ?? s.colorMode ?? 'bw';
        const sided = s.sided ?? 'single';
        const range = s.range ?? 'all';
        const paper = s.paper ?? 'A4';
        const { pages } = (0, parsePageRange_1.parsePageRange)(range, file.pages || 1);
        let physicalPages = pages.length;
        physicalPages = Math.ceil(physicalPages / nUp);
        if (s.booklet) {
            physicalPages = Math.ceil(pages.length / 4) * 2;
        }
        let sheets = physicalPages;
        if (sided === 'double') {
            sheets = Math.ceil(physicalPages / 2);
        }
        const totalSheets = sheets * copies;
        let colorPages = 0;
        let bwPages = 0;
        if (colorMode === 'color' || colorMode === 'colour') {
            colorPages = physicalPages;
            bwPages = 0;
        }
        else if (colorMode === 'bw') {
            colorPages = 0;
            bwPages = physicalPages;
        }
        else if (colorMode === 'custom') {
            const colorSet = new Set(s.colorPlan?.colorPages || []);
            if (s.booklet) {
                for (let i = 0; i < pages.length; i += 2) {
                    const slot = pages.slice(i, i + 2);
                    if (slot.some(p => colorSet.has(p))) {
                        colorPages++;
                    }
                    else {
                        bwPages++;
                    }
                }
            }
            else {
                for (let i = 0; i < pages.length; i += nUp) {
                    const slot = pages.slice(i, i + nUp);
                    if (slot.some(p => colorSet.has(p))) {
                        colorPages++;
                    }
                    else {
                        bwPages++;
                    }
                }
            }
        }
        else {
            const ratio = pages.length > 0 ? ((file.colorPages || 0) / (file.pages || 1)) : 0;
            colorPages = Math.ceil(physicalPages * ratio);
            bwPages = physicalPages - colorPages;
        }
        // User-defined exact rates:
        // B&W single: ₹1.50, double: ₹0.85 per page
        // Colour single: ₹8.00, double: ₹8.00 per page
        const paperMult = config.rates.paperMultipliers?.[paper] ?? 1;
        const bwRate = config.rates.bw ?? 1.50;
        const duplexRate = config.rates.duplex ?? (config.rates.doubleSideDiscount ? Number((bwRate * (1 - config.rates.doubleSideDiscount)).toFixed(2)) : 0.85);
        const colourRate = config.rates.colour ?? config.rates.color ?? 8.00;
        const bulkThreshold = config.rates.bulkTierThreshold ?? config.rates.bulk ?? 100;
        const bulkRate = config.rates.bulkTierRate ?? config.rates.bulkRate ?? 0.80;
        let pricePerPageBW = (sided === 'double' ? duplexRate : bwRate) * paperMult;
        let pricePerPageColor = colourRate * paperMult;
        // Bulk tier check for high-volume orders
        if (totalSheets >= bulkThreshold) {
            pricePerPageBW = Math.min(pricePerPageBW, bulkRate * paperMult);
        }
        const fileTotal = (bwPages * pricePerPageBW + colorPages * pricePerPageColor) * copies;
        const roundedTotal = Math.round(fileTotal * 100) / 100;
        let formulaStr = '';
        if (colorPages > 0 && bwPages > 0) {
            formulaStr = `${colorPages * copies} colour pgs × ₹${pricePerPageColor.toFixed(2)} + ${bwPages * copies} B&W pgs × ₹${pricePerPageBW.toFixed(2)}`;
        }
        else if (colorPages > 0) {
            formulaStr = `${colorPages * copies} pgs × ₹${pricePerPageColor.toFixed(2)} (Colour) × ${copies} cop${copies > 1 ? 'ies' : 'y'}`;
        }
        else {
            formulaStr = `${bwPages * copies} pgs × ₹${pricePerPageBW.toFixed(2)} (${sided === 'double' ? '2-sided' : '1-sided'}) × ${copies} cop${copies > 1 ? 'ies' : 'y'}`;
        }
        const detailStr = (colorPages > 0 && bwPages > 0)
            ? `${physicalPages} pages (${colorPages * copies} colour, ${bwPages * copies} B&W) · ${sided === 'double' ? 'Double-sided' : 'Single-sided'}${nUp > 1 ? ` · ${nUp}-up` : ''}`
            : `${physicalPages} pages · ${colorPages > 0 ? 'Colour' : 'B&W'} · ${sided === 'double' ? 'Double-sided' : 'Single-sided'}${nUp > 1 ? ` · ${nUp}-up` : ''}`;
        lines.push({
            id: file.id,
            name: file.name,
            qty: copies,
            unitPrice: Math.round((roundedTotal / copies) * 100) / 100,
            total: roundedTotal,
            detail: detailStr,
            formula: formulaStr
        });
        subtotal += roundedTotal;
        if (sided === 'single' && !s.booklet) {
            const duplexTotal = (bwPages * duplexRate + colorPages * colourRate) * copies;
            const savings = roundedTotal - (Math.round(duplexTotal * 100) / 100);
            if (savings > potentialSavings) {
                potentialSavings = savings;
                savingsSource = 'printing double-sided';
            }
        }
    }
    for (const svc of (basket.services || [])) {
        if (svc.type === 'request' || svc.category === 'typing_request' || svc.category === 'typing' || (svc.price === 0 && ((svc.name || svc.title || '').toLowerCase().includes('typing') || (svc.name || svc.title || '').toLowerCase().includes('resume')))) {
            quotePending = true;
            continue;
        }
        if (svc.price !== undefined) {
            const lineTotal = Math.round(svc.price * svc.qty * 100) / 100;
            lines.push({
                id: svc.id,
                name: svc.name,
                qty: svc.qty,
                unitPrice: svc.price,
                total: lineTotal,
                detail: svc.detail || svc.type,
                formula: `${svc.qty} qty × ₹${svc.price.toFixed(2)}`
            });
            subtotal += lineTotal;
        }
    }
    let rushFee = 0;
    if (basket.rush && config.rushEnabled) {
        rushFee = roundTo50Paise(subtotal * config.rates.rushSurcharge);
    }
    const gatewayFee = config.rates.gatewayFee || 0;
    const total = subtotal + rushFee + gatewayFee;
    let savingsTip = null;
    if (potentialSavings > 0) {
        savingsTip = `Save ₹${potentialSavings.toFixed(2)} by ${savingsSource}`;
    }
    return {
        lines,
        subtotal,
        rushFee,
        gatewayFee,
        total,
        savingsTip,
        quotePending
    };
}
function computeFilePrintDetails(file) {
    const s = file.settings || {};
    const nUp = s.nUp ?? 1;
    const copies = s.copies ?? 1;
    const sided = s.sided ?? 'single';
    const range = s.range ?? 'all';
    const colorMode = s.colorPlan?.mode ?? s.colorMode ?? 'bw';
    const { pages } = (0, parsePageRange_1.parsePageRange)(range, file.pages || 1);
    const colorSet = new Set(s.colorPlan?.colorPages || s.colorPages || []);
    const colorPrintedPages = [];
    const bwPrintedPages = [];
    let colorFaces = 0;
    let bwFaces = 0;
    for (let i = 0; i < pages.length; i += nUp) {
        const slot = pages.slice(i, i + nUp);
        const isSlotColor = (colorMode === 'color' || colorMode === 'colour')
            ? true
            : colorMode === 'bw'
                ? false
                : colorMode === 'custom'
                    ? slot.some(p => colorSet.has(p))
                    : (file.colorPages ? slot.some(p => p <= file.colorPages) : false);
        if (isSlotColor) {
            colorFaces++;
            slot.forEach(p => colorPrintedPages.push(p));
        }
        else {
            bwFaces++;
            slot.forEach(p => bwPrintedPages.push(p));
        }
    }
    const totalFaces = colorFaces + bwFaces;
    const totalSheetCount = sided === 'double' ? Math.ceil(totalFaces / 2) * copies : totalFaces * copies;
    const colorSheetCount = sided === 'double' ? Math.ceil(colorFaces / 2) * copies : colorFaces * copies;
    const bwSheetCount = Math.max(0, totalSheetCount - colorSheetCount);
    return {
        colorPlan: {
            mode: colorMode,
            colorPages: Array.from(colorSet)
        },
        colorPrintedPages,
        bwPrintedPages,
        colorSheetCount,
        bwSheetCount,
        totalSheetCount
    };
}
