"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePageRange = parsePageRange;
function parsePageRange(text, pageCount) {
    const t = text.trim().toLowerCase();
    if (t === 'all' || t === '') {
        return { pages: Array.from({ length: pageCount }, (_, i) => i + 1), message: 'All pages' };
    }
    if (t === 'last') {
        return { pages: [pageCount], message: `Page ${pageCount}` };
    }
    if (t.startsWith('last ')) {
        const num = parseInt(t.replace('last ', ''), 10);
        if (!isNaN(num) && num > 0) {
            const start = Math.max(1, pageCount - num + 1);
            const arr = Array.from({ length: pageCount - start + 1 }, (_, i) => start + i);
            return { pages: arr, message: `Last ${arr.length} pages` };
        }
    }
    let normalized = text
        .toLowerCase()
        .replace(/pages?/g, '')
        .replace(/ and /g, ',')
        .replace(/ to /g, '-')
        .replace(/–/g, '-') // en-dash
        .replace(/\.\./g, '-')
        .replace(/;/g, ',')
        .replace(/\s+/g, '');
    const parts = normalized.split(',').map(p => p.trim()).filter(Boolean);
    const pageSet = new Set();
    let hasInvalid = false;
    for (const part of parts) {
        if (part.includes('-')) {
            const idx = part.indexOf('-');
            const leftStr = part.slice(0, idx);
            const rightStr = part.slice(idx + 1);
            let start = leftStr === '' ? 1 : parseInt(leftStr, 10);
            let end = rightStr === '' ? pageCount : parseInt(rightStr, 10);
            if (isNaN(start) || isNaN(end)) {
                hasInvalid = true;
                continue;
            }
            if (start > end) {
                const temp = start;
                start = end;
                end = temp;
            }
            start = Math.max(1, start);
            end = Math.min(pageCount, end);
            if (start > pageCount) {
                hasInvalid = true;
                continue;
            }
            for (let i = start; i <= end; i++) {
                pageSet.add(i);
            }
        }
        else {
            const num = parseInt(part, 10);
            if (!isNaN(num) && num >= 1 && num <= pageCount) {
                pageSet.add(num);
            }
            else {
                hasInvalid = true;
            }
        }
    }
    const pages = Array.from(pageSet).sort((a, b) => a - b);
    if (pages.length === 0) {
        return { pages: [], message: 'Invalid range' };
    }
    let msg = `${pages.length} page${pages.length > 1 ? 's' : ''}`;
    if (pages.length === pageCount)
        msg = 'All pages';
    if (hasInvalid)
        msg += ' (some parts ignored)';
    return { pages, message: msg };
}
