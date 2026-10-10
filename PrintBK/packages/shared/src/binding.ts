export type BindingType = 'staple' | 'spiral' | 'comb' | 'hardcover';

export interface BindingLimit {
  maxPages: number;
  recommendation: BindingType | null;
}

const LIMITS: Record<BindingType, BindingLimit> = {
  staple: { maxPages: 50, recommendation: 'spiral' },
  spiral: { maxPages: 300, recommendation: 'comb' },
  comb: { maxPages: 450, recommendation: 'hardcover' },
  hardcover: { maxPages: 800, recommendation: null },
};

export function recommendBinding(pageCount: number, type: BindingType): { valid: boolean, maxPages: number, suggestedType: BindingType | null, message: string } {
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
