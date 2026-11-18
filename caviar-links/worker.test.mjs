import assert from 'node:assert/strict';
import test from 'node:test';
import { readLinks, resolveLink } from './redirects.js';
import { createWorker } from './worker.mjs';

const origin = 'https://caviar.global';
const campaign = 'https://caviar.global/collections/example/';
const worker = createWorker({ promo: campaign });

test('serves a temporary redirect and forwards campaign parameters', async () => {
  const response = await worker.fetch(new Request(
    `${origin}/promo/?utm_source=whatsapp&yclid=123&other=ignored`,
  ));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), `${campaign}?utm_source=whatsapp&yclid=123`);
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

test('supports HEAD on published links', async () => {
  const known = await worker.fetch(new Request(`${origin}/promo`, { method: 'HEAD' }));
  assert.equal(known.status, 302);
  assert.equal(await known.text(), '');
});

test('forwards regular site requests to the origin without changing the request', async () => {
  const response = new Response('origin');
  let received;
  const router = createWorker({ promo: campaign }, (request) => {
    received = request;
    return response;
  });

  for (const request of [
    new Request(origin),
    new Request(`${origin}/promo-page`),
    new Request(`${origin}/promo/collection`),
    new Request(`${origin}/promo`, { method: 'POST' }),
    new Request('https://www.caviar.global/promo'),
  ]) {
    assert.equal(await router.fetch(request), response);
    assert.equal(received, request);
  }
});
