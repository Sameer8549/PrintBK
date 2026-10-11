"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recommendBinding = recommendBinding;
const LIMITS = {
    staple: { maxPages: 50, recommendation: 'spiral' },
    spiral: { maxPages: 300, recommendation: 'comb' },
    comb: { maxPages: 450, recommendation: 'hardcover' },
    hardcover: { maxPages: 800, recommendation: null },
};
function recommendBinding(pageCount, type) {
    const limit = LIMITS[type];
    if (!limit) {
        return { valid: true, maxPages: Infinity, suggestedType: null, message: 'Valid' };
    }
    if (pageCount <= limit.maxPages) {
        return { valid: true, maxPages: limit.maxPages, suggestedType: null, message: 'Valid' };
    }
    return {
        valid: false,
        maxPages: limit.maxPages,
        suggestedType: limit.recommendation,
        message: `${type} binding supports up to ${limit.maxPages} pages. ${limit.recommendation ? 'Consider ' + limit.recommendation + ' instead.' : 'Your document is too large.'}`
    };
}
