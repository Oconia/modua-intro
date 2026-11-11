import { access, readFile, writeFile } from 'node:fs/promises';

const publicDir = new URL('../public/', import.meta.url);
const site = 'https://modua.co.kr';
const indexFile = new URL('index.html', publicDir);
const source = (await readFile(indexFile, 'utf8')).replace(/\r\n/g, '\n');
const videos = JSON.parse(source.match(/<script id="media-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = value => String(value).replace(/[&<>"']/g, character => entities[character]);

function image(path, width, height, alt) {
  return { path, width, height, alt, type: path.endsWith('.png') ? 'image/png' : 'image/jpeg' };
}

function shareImage(id, alt) {
  return image(`share/thumbs/${id}.jpg`, 1200, 630, alt);
}

function videoImage(video) {
  return image(video.poster, video.posterWidth, video.posterHeight, `${video.title} 영상 포스터`);
}

const entries = [
  {
    id: 'page', type: 'WebPage', path: '/',
    title: '모두아 | 후원 그다음의 이야기가 이어지는 곳',
    description: '후원으로 연결된 사람들의 대화, 소식, 활동 기록을 만나보세요.',
    images: [
      shareImage('page', '텃밭을 함께 가꾸는 사람들과 모두아 제목'),
      image('Modua_Share.jpg', 1348, 926, '모두아 소개와 소식·대화 기능을 보여 주는 체험 화면'),
    ],
  },
  {
    id: 'media', type: 'CollectionPage', path: '/share/media',
    title: '모두아 미디어',
    description: '모두의기부 참여팀과 함께하는 사람들의 영상과 쇼츠를 만나보세요.',
    images: [
      shareImage('media', '야외에서 함께 작업하는 사람들과 모두아 미디어 제목'),
      videoImage(videos.find(video => video.id === 'dream')),
      videoImage(videos.find(video => video.id === 'jjaim-short')),
    ],
  },
  ...videos.map(video => ({
    id: video.id, type: 'WebPage', path: `/share/${video.id}`,
    title: `${video.title} | 모두아 미디어`,
    description: `${video.publisher}의 ${video.kind}. ${video.title}`,
    images: [shareImage(video.id, `${video.title} 공유 이미지`), videoImage(video)],
  })),
];

function metadata({ title, description, path, images, type }) {
  const url = site + path;
  const property = (name, value) => `<meta property="${name}" content="${escape(value)}">`;
  const meta = (name, value) => `<meta name="${name}" content="${escape(value)}">`;
  const tags = [
    `<link rel="canonical" href="${url}">`,
    meta('robots', 'max-image-preview:large'),
    property('og:type', 'website'),
    property('og:site_name', '모두아'),
    property('og:locale', 'ko_KR'),
    property('og:title', title),
    property('og:description', description),
    property('og:url', url),
  ];
  for (const picture of images) {
    tags.push(
      property('og:image', `${site}/${picture.path}`),
      property('og:image:type', picture.type),
      property('og:image:width', picture.width),
      property('og:image:height', picture.height),
      property('og:image:alt', picture.alt),
    );
  }
  tags.push(
    meta('twitter:card', 'summary_large_image'),
    meta('twitter:title', title),
    meta('twitter:description', description),
    meta('twitter:image', `${site}/${images[0].path}`),
    meta('twitter:image:alt', images[0].alt),
  );

  const organizationId = `${site}/#organization`;
  const websiteId = `${site}/#website`;
  const imageId = `${url}#primary-image`;
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', '@id': organizationId, name: '주식회사 오코니아', url: 'https://www.oconia.co.kr/' },
      { '@type': 'WebSite', '@id': websiteId, url: `${site}/`, name: '모두아', inLanguage: 'ko', publisher: { '@id': organizationId } },
      {
        '@type': type, '@id': `${url}#webpage`, url, name: title, description, inLanguage: 'ko',
        isPartOf: { '@id': websiteId },
        primaryImageOfPage: { '@id': imageId },
        image: images.map((picture, index) => ({
          '@type': 'ImageObject',
          ...(index === 0 ? { '@id': imageId } : {}),
          contentUrl: `${site}/${picture.path}`,
          width: picture.width,
          height: picture.height,
          caption: picture.alt,
        })),
      },
    ],
  };
  tags.push(`<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`);
  return ['<!-- social-metadata -->', ...tags, '<!-- /social-metadata -->'].join('\n');
}

function initialCards(short) {
  return videos.filter(video => video.short === short).map(video => {
    const poster = videoImage(video);
    return `<article class="media-card">
  <a class="video-cover" href="share/${video.id}.html">
    <img src="${poster.path}" alt="${escape(poster.alt)}" width="${poster.width}" height="${poster.height}" loading="lazy">
    <span class="play" aria-hidden="true">▶</span>
  </a>
  <div class="media-meta"><div><h3>${escape(video.title)}</h3><p>${escape(video.publisher)}</p></div></div>
</article>`;
  }).join('\n');
}

function replaceBlock(document, name, content) {
  const block = new RegExp(`<!-- ${name} -->[\\s\\S]*?<!-- /${name} -->`, 'g');
  if ([...document.matchAll(block)].length !== 1) throw new Error(`Expected one ${name} block`);
  return document.replace(block, () => content);
}

for (const { images } of entries) {
  for (const picture of images) {
    if (!picture.width || !picture.height) throw new Error(`Missing dimensions for ${picture.path}`);
    await access(new URL(picture.path, publicDir));
  }
}

const template = [
  ['video-cards', initialCards(false)],
  ['short-cards', initialCards(true)],
].reduce((document, [name, content]) =>
  replaceBlock(document, name, `<!-- ${name} -->\n${content}\n<!-- /${name} -->`), source);

for (const entry of entries) {
  let page = replaceBlock(template, 'social-metadata', metadata(entry))
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escape(entry.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${escape(entry.description)}">`);
  if (entry.id !== 'page') {
    page = page.replace('<head>', '<head><base href="/">')
      .replace('<body>', `<body data-share-entry="${entry.id}">`);
  }
  await writeFile(entry.id === 'page' ? indexFile : new URL(`share/${entry.id}.html`, publicDir), page);
}

const sitemap = entries.map(entry => {
  const pictures = entry.images.map(picture => `    <image:image><image:loc>${site}/${picture.path}</image:loc></image:image>`).join('\n');
  return `  <url>\n    <loc>${site}${entry.path}</loc>\n${pictures}\n  </url>`;
}).join('\n');
await writeFile(new URL('sitemap.xml', publicDir), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${sitemap}\n</urlset>\n`);
