import { cp, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { documentPolicy, securityHeaders } from '../worker/index.mjs';

const feedPath = process.argv[2];
if (!feedPath) throw new Error('Usage: node scripts/build-pages.mjs <media-feed.json>');

const feed = JSON.parse(await readFile(feedPath, 'utf8'));
if (!Array.isArray(feed.items) || !feed.items.length || feed.items.some(item => !item?.mediaKey || !item?.youtubeId)) {
  throw new Error('Expected the public Modua media feed');
}

const publicDir = new URL('../public/', import.meta.url);
const pagesDir = new URL('../dist/pages/', import.meta.url);
await cp(fileURLToPath(publicDir), fileURLToPath(pagesDir), { recursive: true });

const sharePages = (await readdir(new URL('share/', pagesDir)))
  .filter(name => name.endsWith('.html'))
  .map(name => `share/${name}`);

const securityMeta = `<meta http-equiv="Content-Security-Policy" content="${documentPolicy}">\n`
  + `<meta name="referrer" content="${securityHeaders['Referrer-Policy']}">\n`;
for (const path of ['index.html', 'mvp/app.html', ...sharePages]) {
  const file = new URL(path, pagesDir);
  const html = (await readFile(file, 'utf8'))
    .replace('<base href="/">', '<base href="../">')
    .replace(/(<meta charset="utf-8">)/i, `$1\n${securityMeta}`);
  await writeFile(file, html);
}

await writeFile(new URL('media-feed.json', pagesDir), JSON.stringify(feed));
await writeFile(new URL('.nojekyll', pagesDir), '');
