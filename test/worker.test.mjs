import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../worker/index.mjs';

const origin = 'https://modua.test';
const owner = 'owner@example.test';
const identity = {
  'oai-authenticated-user-id': 'test-owner',
  'oai-authenticated-user-email': owner,
};
const syncCall = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'sync_intro_media' } };

function post(path, payload, headers = {}) {
  return new Request(origin + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
}

test('only the authenticated Sites tool can run an owner sync', async () => {
  const env = { INTRO_MEDIA_SYNC_OWNER_EMAIL: owner };
  const publicResponse = await worker.fetch(post('/api/media/sync', {}, identity), env);
  assert.equal(publicResponse.status, 403);
  const anonymous = await worker.fetch(post('/mcp', syncCall), env);
  assert.equal((await anonymous.json()).result.isError, true);
  const nonOwner = await worker.fetch(post('/mcp', syncCall, { ...identity, 'oai-authenticated-user-email': 'other@example.test' }), env);
  assert.equal((await nonOwner.json()).result.isError, true);
});

function mediaFixture(t, previous, upstream) {
  let row = {
    catalog_json: JSON.stringify(previous.map(item => item.youtubeId)),
    items_json: JSON.stringify(previous),
    synced_at: '2026-01-01T00:00:00.000Z',
  };
  t.mock.method(globalThis, 'fetch', async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }));
  class SourceRewriter {
    handlers = new Map();
    on(selector, handler) { this.handlers.set(selector, handler); return this; }
    transform(response) {
      for (const short of [false, true]) {
        const track = short ? '#mgo-shorts-track' : '#mgo-video-track';
        this.handlers.get(track).element({});
        for (const { youtubeId } of upstream.filter(item => item.short === short)) {
          const attrs = {
            'data-share-keys': (short ? 'short-' : 'video-') + youtubeId,
            'aria-label': 'Audit video',
            'data-source': 'https://www.youtube.com/watch?v=' + youtubeId,
          };
          this.handlers.get(track + ' [data-share-keys][data-source]').element({ getAttribute: name => attrs[name] });
        }
      }
      return response;
    }
  }
  globalThis.HTMLRewriter = SourceRewriter;
  t.after(() => { delete globalThis.HTMLRewriter; });
  const env = {
    INTRO_MEDIA_SYNC_OWNER_EMAIL: owner,
    DB: {
      prepare: () => ({
        first: async () => row,
        bind: (catalog, items, time) => ({ async run() {
          row = { catalog_json: catalog, items_json: items, synced_at: time };
          return { meta: { changes: 1 } };
        } }),
      }),
    },
  };
  return env;
}

test('an incomplete source snapshot cannot clear existing recommendations', async t => {
  const previous = [
    { youtubeId: 'vidA0000001', short: false }, { youtubeId: 'vidB0000001', short: false },
    { youtubeId: 'vidC0000001', short: true }, { youtubeId: 'vidD0000001', short: true },
    { youtubeId: 'vidE0000001', short: true },
  ];
  const upstream = [
    { youtubeId: 'yvjd1Mu7uRU', short: false }, { youtubeId: 'l4s5wGW3_p8', short: true },
  ];
  const env = mediaFixture(t, previous, upstream);
  const response = await worker.fetch(post('/mcp', syncCall, identity), env);
  assert.deepEqual(JSON.parse((await response.json()).result.content[0].text).items, previous);
  upstream.push({ youtubeId: 'newA0000001', short: false });
  const updated = await worker.fetch(post('/mcp', syncCall, identity), env);
  const items = JSON.parse((await updated.json()).result.content[0].text).items;
  assert.deepEqual(items.map(item => item.youtubeId), ['newA0000001', 'vidA0000001', 'vidC0000001', 'vidD0000001', 'vidE0000001']);
});

test('video requests support bounded, open and suffix ranges', async () => {
  const bytes = new TextEncoder().encode('abcdefghij');
  const env = { ASSETS: { fetch: async request => {
    assert.equal(new URL(request.url).pathname, '/_video/dream.mp4');
    assert.equal(request.headers.has('Range'), false);
    const body = request.method === 'HEAD' ? null : new ReadableStream({
      start(stream) {
        stream.enqueue(bytes.slice(0, 4));
        stream.enqueue(bytes.slice(4));
        stream.close();
      },
    });
    return new Response(body, { headers: { 'Content-Length': '10', 'Content-Type': 'video/mp4', ETag: '"video"' } });
  } } };
  const get = headers => worker.fetch(new Request(origin + '/media/dream.mp4', { headers }), env);
  for (const [range, text, contentRange] of [
    ['bytes=2-5', 'cdef', 'bytes 2-5/10'],
    ['bytes=7-', 'hij', 'bytes 7-9/10'],
    ['bytes=-2', 'ij', 'bytes 8-9/10'],
  ]) {
    const partial = await get({ Range: range });
    assert.equal(partial.status, 206);
    assert.equal(partial.headers.get('Content-Range'), contentRange);
    assert.equal(partial.headers.get('Content-Length'), String(text.length));
    assert.equal(await partial.text(), text);
  }
  const invalid = await get({ Range: 'bytes=10-' });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get('Content-Range'), 'bytes */10');
  const stale = await get({ Range: 'bytes=2-5', 'If-Range': '"old"' });
  assert.equal(stale.status, 200);
  assert.equal(await stale.text(), 'abcdefghij');
  const head = await worker.fetch(new Request(origin + '/media/dream.mp4', { method: 'HEAD' }), env);
  assert.equal(head.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(head.headers.get('Content-Length'), '10');
});

test('HTML responses restrict framing and executable scripts', async () => {
  const env = { ASSETS: { fetch: async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }) } };
  const response = await worker.fetch(new Request(origin), env);
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'self'/);
  assert.match(response.headers.get('Content-Security-Policy'), /script-src 'self' https:\/\/www\.youtube\.com;/);
  assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
});
