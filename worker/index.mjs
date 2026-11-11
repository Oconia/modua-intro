const sourceURL = 'https://media.modua.co.kr/';
const keyPattern = /^(?:auto-[a-f0-9]{24}|(?:video|short)-[A-Za-z0-9_-]{11})$/;
const youtubePattern = /^[A-Za-z0-9_-]{11}$/;
const staticKey = /^(?:video|short)-/;
const bundles = new Set(['yvjd1Mu7uRU', 'l4s5wGW3_p8', 'lOIJRPKtwfY', 'CfFCtXU1UTI', 'BUsuA3uuC1c']);
const tools = [
  {
    name: 'sync_intro_media',
    description: '모두아 미디어의 공개 영상과 쇼츠를 읽어 모두아 소개 페이지에 새 콘텐츠를 반영합니다. 기존 콘텐츠를 중복 추가하지 않습니다.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'intro_media_status',
    description: '모두아 소개 페이지에 저장된 영상·쇼츠와 최근 동기화 시각을 확인합니다.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];

function json(value, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

function sourceVideo(element, short) {
  const mediaKey = element.getAttribute('data-share-keys')?.trim();
  const title = element.getAttribute('aria-label')?.trim();
  const href = element.getAttribute('data-source');
  if (!keyPattern.test(mediaKey ?? '') || !title || !href) return null;
  let videoURL;
  try { videoURL = new URL(href); } catch { return null; }
  if (videoURL.protocol !== 'https:' || !['www.youtube.com', 'youtube.com'].includes(videoURL.hostname)) return null;
  const youtubeId = videoURL.pathname === '/watch' ? videoURL.searchParams.get('v') : /^\/shorts\/([^/]+)$/.exec(videoURL.pathname)?.[1];
  if (!youtubePattern.test(youtubeId ?? '')) return null;

  const photo = element.getAttribute('data-photo-src');
  let posterPath;
  if (photo === `/auto-preview/${mediaKey}.jpg`) posterPath = photo;
  else if (staticKey.test(mediaKey) && mediaKey.endsWith(youtubeId)) posterPath = `/assets/videos/${youtubeId}.avif`;
  if (!posterPath) return null;

  return {
    id: 'remote-' + youtubeId,
    youtubeId,
    mediaKey,
    title: title.slice(0, 240),
    publisher: (element.getAttribute('data-publisher') || '모두의기부').slice(0, 80),
    kind: short ? '쇼츠' : '유튜브 본편',
    short,
    width: short ? 540 : 960,
    height: short ? 960 : 540,
    poster: new URL(posterPath, sourceURL).href,
    sharePoster: new URL(staticKey.test(mediaKey) ? `/assets/share/content/${mediaKey}.jpg` : posterPath, sourceURL).href,
  };
}

async function readSource() {
  const response = await fetch(sourceURL, {
    redirect: 'manual',
    headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
    throw new Error(`모두아 미디어 응답을 읽을 수 없습니다 (HTTP ${response.status}).`);
  }
  const catalog = new Map();
  const tracks = [false, false];
  const rewriter = new HTMLRewriter();
  for (const [index, selector] of ['#mgo-video-track', '#mgo-shorts-track'].entries()) {
    rewriter.on(selector, { element() { tracks[index] = true; } });
    rewriter.on(selector + ' button[data-share-keys]', {
      element(button) {
        const video = sourceVideo(button, index === 1);
        if (video && !catalog.has(video.youtubeId)) catalog.set(video.youtubeId, video);
      },
    });
  }
  await rewriter.transform(response).arrayBuffer();
  if (!tracks.every(Boolean) || ![...catalog.values()].some(item => item.short) ||
      ![...catalog.values()].some(item => !item.short)) {
    throw new Error('모두아 미디어에서 본편과 쇼츠 목록을 확인할 수 없습니다.');
  }
  return catalog;
}

async function status(env) {
  const row = await env.DB.prepare('SELECT items_json, synced_at FROM intro_media_feed WHERE id=1').first();
  return { syncedAt: row?.synced_at ?? null, items: row ? JSON.parse(row.items_json) : [] };
}

async function sync(env) {
  const syncedAt = new Date().toISOString();
  const catalog = await readSource();
  const previous = await env.DB.prepare('SELECT catalog_json, items_json FROM intro_media_feed WHERE id=1').first();
  const known = new Set(previous ? JSON.parse(previous.catalog_json) : []);
  const candidates = [...catalog.values()].filter(item => !bundles.has(item.youtubeId));
  const fresh = candidates.filter(item => !known.has(item.youtubeId));
  const retained = (previous ? JSON.parse(previous.items_json) : [])
    .map(item => catalog.get(item.youtubeId)).filter(Boolean);
  // The source lists newly published items first. Preserve existing selections when no new item replaces them.
  const ranked = [...fresh, ...retained];
  const items = [...ranked.filter(item => !item.short).slice(0, 2), ...ranked.filter(item => item.short).slice(0, 3)];
  for (const id of catalog.keys()) known.add(id);
  const result = await env.DB.prepare(`INSERT INTO intro_media_feed (id, catalog_json, items_json, synced_at) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET catalog_json=excluded.catalog_json, items_json=excluded.items_json, synced_at=excluded.synced_at
    WHERE intro_media_feed.synced_at < excluded.synced_at`)
    .bind(JSON.stringify([...known]), JSON.stringify(items), syncedAt).run();
  const saved = await status(env);
  const added = items.filter(item => fresh.some(candidate => candidate.youtubeId === item.youtubeId)).length;
  return { ...saved, sourceCount: catalog.size, added: result.meta.changes ? added : 0 };
}

function servicePost(request) {
  const origin = request.headers.get('Origin');
  return request.method === 'POST' && (!origin || origin === new URL(request.url).origin)
    && request.headers.get('Content-Type')?.startsWith('application/json');
}

function isSyncOwner(request, env) {
  const owner = env.INTRO_MEDIA_SYNC_OWNER_EMAIL?.trim().toLowerCase();
  const caller = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  return Boolean(owner && request.headers.get('oai-authenticated-user-id') && caller === owner);
}

async function mcp(request, env) {
  if (!servicePost(request)) return json({ error: 'Method not allowed' }, 405);
  const { id, method, params } = await request.json();
  const reply = result => json({ jsonrpc: '2.0', id, result });
  if (method === 'server/discover') return reply({ supportedVersions: ['2026-07-28'], capabilities: { tools: {} } });
  if (method === 'initialize') {
    return reply({ protocolVersion: params?.protocolVersion || '2026-07-28', capabilities: { tools: {} }, serverInfo: { name: 'modua-intro', version: '1.0.0' } });
  }
  if (method === 'notifications/initialized') return new Response(null, { status: 202 });
  if (method === 'tools/list') return reply({ tools });
  if (method === 'tools/call') {
    if (params?.name === 'sync_intro_media' && !isSyncOwner(request, env)) {
      return reply({ isError: true, content: [{ type: 'text', text: '사이트 소유자만 미디어를 동기화할 수 있습니다.' }] });
    }
    try {
      let result;
      if (params?.name === 'sync_intro_media') result = await sync(env);
      else if (params?.name === 'intro_media_status') result = await status(env);
      else throw new Error('지원하지 않는 작업입니다.');
      return reply({ content: [{ type: 'text', text: JSON.stringify(result) }] });
    } catch (error) {
      console.error('Intro media MCP action failed', error.message);
      return reply({ isError: true, content: [{ type: 'text', text: error.message }] });
    }
  }
  return json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (request.method === 'GET' && (pathname === '/media-feed.json' || pathname === '/api/media')) {
        return json(await status(env));
      }
      if (pathname === '/api/media/sync') {
        if (!servicePost(request)) return json({ error: 'Method not allowed' }, 405);
        if (!isSyncOwner(request, env)) return json({ error: '사이트 소유자만 미디어를 동기화할 수 있습니다.' }, 403);
        return json(await sync(env));
      }
      if (pathname === '/mcp') return await mcp(request, env);
      return await env.ASSETS.fetch(request);
    } catch (error) {
      console.error('Intro media request failed', pathname, error.message);
      return json({ error: '미디어 목록을 동기화할 수 없습니다.' }, 503);
    }
  },
};
