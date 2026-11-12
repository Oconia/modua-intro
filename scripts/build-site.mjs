import { cp, mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { htmlSecurityHeaders, securityHeaders } from '../worker/index.mjs';

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
await cp(fileURLToPath(new URL('worker/index.mjs', root)), fileURLToPath(new URL('index.js', server)));
await cp(fileURLToPath(new URL('.openai/hosting.json', root)), fileURLToPath(new URL('hosting.json', config)));

// Leave the public /media/*.mp4 URLs to the Worker so it can handle byte ranges.
for (const file of await readdir(new URL('media/', client))) {
  if (file.endsWith('.mp4')) await rename(new URL('media/' + file, client), new URL(file, video));
}

// Cover static responses served directly by the hosting platform.
const headers = Object.entries({ ...securityHeaders, ...htmlSecurityHeaders })
  .map(([name, value]) => `  ${name}: ${value}`).join('\n');
await writeFile(new URL('_headers', client), `/*\n${headers}\n`);
