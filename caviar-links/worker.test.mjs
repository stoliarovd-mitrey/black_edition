import assert from 'node:assert/strict';
import test from 'node:test';
import { readLinks, resolveLink } from './redirects.js';
import { createWorker } from './worker.mjs';

const origin = 'https://go.caviar.global';
const worker = createWorker({ promo: 'https://caviar.global/promo/' });

test('serves a temporary redirect and forwards campaign parameters', async () => {
  const response = await worker.fetch(new Request(
    `${origin}/promo/?utm_source=whatsapp&yclid=123&other=ignored`,
  ));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://caviar.global/promo/?utm_source=whatsapp&yclid=123');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('preserves configured attribution and URL fragments', () => {
  const links = readLinks({ example: 'https://caviar-phones.ru/catalog/?utm_source=email#collection' });
  const query = new URLSearchParams('utm_source=other&utm_campaign=holidays');
  assert.equal(resolveLink(links, 'example', query), 'https://caviar-phones.ru/catalog/?utm_source=email&utm_campaign=holidays#collection');
});

test('rejects unapproved destinations and invalid slugs', () => {
  assert.throws(() => readLinks({ example: 'https://example.com/' }));
  assert.throws(() => readLinks({ example: 'http://caviar.global/' }));
  assert.throws(() => readLinks({ 'two/parts': 'https://caviar.global/' }));
});

test('returns correct responses for the root, unknown links and unsupported methods', async () => {
  const root = await worker.fetch(new Request(origin));
  assert.equal(root.headers.get('location'), 'https://caviar.global/');
  const known = await worker.fetch(new Request(`${origin}/promo`, { method: 'HEAD' }));
  assert.equal(known.status, 302);
  assert.equal(await known.text(), '');
  const missing = await worker.fetch(new Request(`${origin}/unknown`, { method: 'HEAD' }));
  assert.equal(missing.status, 404);
  assert.equal(await missing.text(), '');
  const unsupported = await worker.fetch(new Request(`${origin}/promo`, { method: 'POST' }));
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get('allow'), 'GET, HEAD');
});
