import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const client = new URL('client/', output);
const server = new URL('server/', output);
const config = new URL('.openai/', output);
const video = new URL('_video/', client);
for (const directory of [client, server, config, video]) {
  await mkdir(directory, { recursive: true });
}

await cp(fileURLToPath(new URL('public/', root)), fileURLToPath(client), { recursive: true });
await cp(fileURLToPath(new URL('.openai/hosting.json', root)), fileURLToPath(new URL('hosting.json', config)));

// Leave the public /media/*.mp4 URLs to the Worker so it can handle byte ranges.
const sizes = {};
for (const file of await readdir(new URL('media/', client))) {
  if (!file.endsWith('.mp4')) continue;
  const asset = new URL('media/' + file, client);
  sizes['/media/' + file] = (await stat(asset)).size;
  await rename(asset, new URL(file, video));
}

// Serve HTML from the Worker so the asset server cannot bypass its security headers.
const pages = {};
for (const path of await readdir(new URL('public/', root), { recursive: true })) {
  if (!path.endsWith('.html')) continue;
  const route = path.replaceAll('\\', '/');
  const asset = new URL(route, client);
  const html = await readFile(asset, 'utf8');
  const etag = '"' + createHash('sha256').update(html).digest('hex') + '"';
  pages['/' + route] = { html, etag };
  await rm(asset);
}
await rm(new URL('_headers', client), { force: true });
const worker = await readFile(new URL('worker/index.mjs', root), 'utf8');
await writeFile(new URL('index.js', server), worker +
  `\nObject.assign(publishedPages, ${JSON.stringify(pages)});\nObject.assign(publishedVideoSizes, ${JSON.stringify(sizes)});\n`);
