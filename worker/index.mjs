const sourceURL = 'https://media.modua.co.kr/';
const keyPattern = /^(?:auto-[a-f0-9]{24}|(?:video|short)-[A-Za-z0-9_-]{11})$/;
const youtubePattern = /^[A-Za-z0-9_-]{11}$/;
const staticKey = /^(?:video|short)-/;
const bundles = new Set(['yvjd1Mu7uRU', 'l4s5wGW3_p8', 'lOIJRPKtwfY', 'CfFCtXU1UTI', 'BUsuA3uuC1c']);
// The Sites build fills these maps from the published files.
const publishedPages = {};
const publishedVideoSizes = {};
export const documentPolicy = [
  "default-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "script-src 'self' https://www.youtube.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' blob: data: https://media.modua.co.kr",
  "media-src 'self' blob:",
  "connect-src 'self' https://www.youtube.com",
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com",
].join('; ');
export const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};
export const htmlSecurityHeaders = {
  'Content-Security-Policy': documentPolicy + "; frame-ancestors 'self'",
  'X-Frame-Options': 'SAMEORIGIN',
};
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
    rewriter.on(selector + ' [data-share-keys][data-source]', {
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
  const previousItems = previous ? JSON.parse(previous.items_json) : [];
  for (const item of previousItems) known.add(item.youtubeId);
  const candidates = [...catalog.values()].filter(item => !bundles.has(item.youtubeId));
  const fresh = candidates.filter(item => !known.has(item.youtubeId));
  const retained = previousItems.map(item => catalog.get(item.youtubeId) ?? item);
  // An upstream snapshot may omit previously selected videos. Keep them until replacements arrive.
  const ranked = [...fresh, ...retained];
  const items = [...ranked.filter(item => !item.short).slice(0, 2), ...ranked.filter(item => item.short).slice(0, 3)];
  if (!items.length) throw new Error('추천할 미디어를 확인할 수 없습니다.');
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
  const contentType = request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
  return request.method === 'POST' && (!origin || origin === new URL(request.url).origin)
    && contentType === 'application/json';
}

function isMcpSyncOwner(request, env) {
  const owner = env.INTRO_MEDIA_SYNC_OWNER_EMAIL?.trim().toLowerCase();
  // Sites authenticates the caller and provides these verified headers on /mcp.
  const caller = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  return Boolean(owner && request.headers.get('oai-authenticated-user-id')?.trim() && caller === owner);
}

async function mcp(request, env) {
  if (!servicePost(request)) return json({ error: 'Method not allowed' }, 405);
  let message;
  try { message = await request.json(); } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, 400);
  }
  const { id, method, params } = message;
  const reply = result => json({ jsonrpc: '2.0', id, result });
  if (method === 'server/discover') return reply({ supportedVersions: ['2026-07-28'], capabilities: { tools: {} } });
  if (method === 'initialize') {
    return reply({ protocolVersion: params?.protocolVersion || '2026-07-28', capabilities: { tools: {} }, serverInfo: { name: 'modua-intro', version: '1.0.0' } });
  }
  if (method === 'notifications/initialized') return new Response(null, { status: 202 });
  if (method === 'tools/list') return reply({ tools });
  if (method === 'tools/call') {
    if (params?.name === 'sync_intro_media' && !isMcpSyncOwner(request, env)) {
      return reply({ isError: true, content: [{ type: 'text', text: '사이트 소유자만 미디어를 동기화할 수 있습니다.' }] });
    }
    try {
      let result;
      if (params?.name === 'sync_intro_media') result = await sync(env);
      else if (params?.name === 'intro_media_status') result = await status(env);
      else return reply({ isError: true, content: [{ type: 'text', text: '지원하지 않는 작업입니다.' }] });
      return reply({ content: [{ type: 'text', text: JSON.stringify(result) }] });
    } catch (error) {
      console.error('Intro media MCP action failed', error.message);
      return reply({ isError: true, content: [{ type: 'text', text: '미디어 작업을 완료할 수 없습니다.' }] });
    }
  }
  return json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  const isHtml = headers.get('Content-Type')?.startsWith('text/html');
  for (const [name, value] of Object.entries(isHtml ? { ...securityHeaders, ...htmlSecurityHeaders } : securityHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    return suffix > 0 && size > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : false;
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (end < start && match[2]) return null;
  if (start >= size) return false;
  return { start, end: Math.min(end, size - 1) };
}

function canSendRange(ifRange, headers) {
  if (!ifRange) return true;
  if (ifRange.startsWith('"')) return ifRange === headers.get('ETag');
  const lastModified = headers.get('Last-Modified');
  return Boolean(lastModified && Date.parse(ifRange) === Date.parse(lastModified));
}

function sliceStream(source, start, end) {
  const reader = source.getReader();
  let offset = 0;
  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.error(new Error('Video ended before the requested range'));
          return;
        }
        const nextOffset = offset + value.byteLength;
        if (nextOffset > start) controller.enqueue(value.subarray(Math.max(start - offset, 0), end + 1 - offset));
        offset = nextOffset;
        if (offset > end) {
          controller.close();
          void reader.cancel().catch(() => {});
          return;
        }
        if (offset > start) return;
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
}

async function serveVideo(request, env) {
  const url = new URL(request.url);
  const videoPath = url.pathname;
  url.pathname = url.pathname.replace(/^\/media\//, '/_video/');
  const requestHeaders = new Headers(request.headers);
  const range = requestHeaders.get('Range');
  const ifRange = requestHeaders.get('If-Range');
  requestHeaders.delete('Range');
  requestHeaders.delete('If-Range');
  requestHeaders.set('Accept-Encoding', 'identity');
  const response = await env.ASSETS.fetch(new Request(url, { method: request.method, headers: requestHeaders }));
  if (response.status !== 200) return response;
  const headers = new Headers(response.headers);
  const size = publishedVideoSizes[videoPath] ?? Number(headers.get('Content-Length') ?? NaN);
  const encoding = headers.get('Content-Encoding');
  if (!Number.isSafeInteger(size) || size < 0 || (encoding && encoding !== 'identity')) return response;
  headers.set('Accept-Ranges', 'bytes');
  const part = request.method === 'GET' && range && canSendRange(ifRange, headers) ? parseRange(range, size) : null;
  if (part === null) return new Response(response.body, { status: 200, headers });
  if (part === false) {
    await response.body?.cancel();
    headers.set('Content-Range', `bytes */${size}`);
    headers.set('Content-Length', '0');
    return new Response(null, { status: 416, headers });
  }
  const length = part.end - part.start + 1;
  headers.set('Content-Range', `bytes ${part.start}-${part.end}/${size}`);
  headers.set('Content-Length', String(length));
  const sliced = sliceStream(response.body, part.start, part.end);
  if (typeof FixedLengthStream !== 'undefined') {
    const output = new FixedLengthStream(length);
    void sliced.pipeTo(output.writable).catch(() => {});
    return new Response(output.readable, { status: 206, headers });
  }
  return new Response(sliced, { status: 206, headers });
}

function servePage(request, url) {
  const path = url.pathname;
  const candidate = path === '/' || path === '/index' ? '/index.html' : path.endsWith('.html') ? path : path + '.html';
  const page = publishedPages[candidate];
  if (!page) return null;
  if (path === '/index' || path.endsWith('.html')) {
    const canonical = candidate === '/index.html' ? '/' : candidate.slice(0, -5);
    return new Response(null, { status: 308, headers: { Location: canonical + url.search } });
  }
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=0, must-revalidate',
    ETag: page.etag,
  };
  const unchanged = request.headers.get('If-None-Match') === page.etag;
  const body = request.method === 'HEAD' || unchanged ? null : page.html;
  return new Response(body, { status: unchanged ? 304 : 200, headers });
}

async function route(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  if (request.method === 'GET' && (pathname === '/media-feed.json' || pathname === '/api/media')) {
    return json(await status(env));
  }
  if (pathname === '/api/media/sync') {
    return json({ error: '연결된 모두아 도구에서 미디어를 동기화해 주세요.' }, 403);
  }
  if (pathname === '/mcp') return mcp(request, env);
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (/^\/media\/[a-z0-9-]+\.mp4$/.test(pathname)) return serveVideo(request, env);
    const page = servePage(request, url);
    if (page) return page;
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    try {
      return withSecurityHeaders(await route(request, env));
    } catch (error) {
      console.error('Intro media request failed', new URL(request.url).pathname, error.message);
      return withSecurityHeaders(json({ error: '미디어 요청을 처리할 수 없습니다.' }, 503));
    }
  },
};
