import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSuccessRedirectUrl, isValidRedirectUrl } from '../lib/payments/redirect.ts';

test('accepts absolute HTTP(S) merchant destinations', () => {
  for (const url of ['https://merchant.example/thanks', 'http://localhost:3000/return']) {
    assert.equal(isValidRedirectUrl(url), true);
  }
});

test('rejects unsafe schemes, relative paths, credentials and invalid input', () => {
  for (const value of [
    undefined, null, 42, {}, '', '/return', '//merchant.example/return',
    'javascript:alert(1)', 'data:text/html,test', 'ftp://merchant.example',
    'https://user:password@merchant.example', 'not a URL',
  ]) {
    assert.equal(isValidRedirectUrl(value), false);
  }
});

test('adds the verified result while preserving merchant parameters and fragment', () => {
  const destination = new URL(buildSuccessRedirectUrl(
    'https://merchant.example/thanks?cart=123&source=upi#receipt', 'ord_123'
  ));
  assert.equal(destination.searchParams.get('cart'), '123');
  assert.equal(destination.searchParams.get('source'), 'upi');
  assert.equal(destination.searchParams.get('order_id'), 'ord_123');
  assert.equal(destination.searchParams.get('status'), 'VERIFIED');
  assert.equal(destination.hash, '#receipt');
});

test('replaces conflicting result parameters and encodes the order ID', () => {
  const destination = new URL(buildSuccessRedirectUrl(
    'https://merchant.example/?order_id=old&status=PENDING&status=FAILED', 'ord_a&b'
  ));
  assert.deepEqual(destination.searchParams.getAll('status'), ['VERIFIED']);
  assert.deepEqual(destination.searchParams.getAll('order_id'), ['ord_a&b']);
});

test('refuses an unsafe stored redirect destination', () => {
  assert.equal(buildSuccessRedirectUrl('javascript:alert(1)', 'ord_123'), null);
});
