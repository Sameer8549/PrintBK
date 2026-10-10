import { describe, it, expect } from 'vitest';
import { recommendBinding } from './binding';

describe('recommendBinding', () => {
  it('validates staple binding correctly', () => {
    expect(recommendBinding(40, 'staple').valid).toBe(true);
    const result = recommendBinding(60, 'staple');
    expect(result.valid).toBe(false);
    expect(result.suggestedType).toBe('spiral');
  });

  it('validates comb binding correctly', () => {
    expect(recommendBinding(400, 'comb').valid).toBe(true);
    const result = recommendBinding(500, 'comb');
    expect(result.valid).toBe(false);
    expect(result.suggestedType).toBe('hardcover');
  });

  it('validates hardcover correctly', () => {
    const result = recommendBinding(1000, 'hardcover');
    expect(result.valid).toBe(false);
    expect(result.suggestedType).toBe(null);
  });
});
