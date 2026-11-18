import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { readLinks, shortOrigin } from './redirects.js';

const project = new URL('./', import.meta.url);
const entries = new URL('entries/', project);
const output = new URL('.wrangler/caviar-links/', project);
const hostname = new URL(shortOrigin).hostname;

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

const links = readLinks(await readJson(new URL('links.json', project)));
const files = (await readdir(entries)).filter((file) => file.endsWith('.json')).sort();
for (const file of files) {
  const slug = file.slice(0, -5);
  if (links.has(slug)) throw new Error(`Duplicate short link: ${slug}`);
  const destination = await readJson(new URL(encodeURIComponent(file), entries));
  links.set(slug, readLinks({ [slug]: destination }).get(slug));
}

for (const destination of links.values()) {
  const url = new URL(destination);
  const slug = url.pathname.replace(/^\/|\/$/g, '');
  if ((url.origin === shortOrigin || url.hostname === `www.${hostname}`) && links.has(slug)) {
    throw new Error(`The destination is already a short link: ${destination}`);
  }
}

const configuration = await readJson(new URL('wrangler.jsonc', project));
configuration.main = 'entry.mjs';
// A trailing wildcard is required by Cloudflare to match a query string.
// The Worker checks the exact pathname and forwards all other requests to the origin.
configuration.routes = [...links.keys()].sort().map((slug) => ({
  pattern: `${hostname}/${slug}*`,
  zone_name: hostname,
}));

await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(new URL('links.json', output), JSON.stringify(Object.fromEntries(links))),
  writeFile(new URL('wrangler.json', output), JSON.stringify(configuration, null, 2)),
  writeFile(new URL('entry.mjs', output), [
    "import registry from './links.json' with { type: 'json' };",
    "import { createWorker } from '../../worker.mjs';",
    'export default createWorker(registry);',
    '',
  ].join('\n')),
]);
