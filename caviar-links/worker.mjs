import registry from './links.json' with { type: 'json' };
import { readLinks, resolveLink } from './redirects.js';

const home = 'https://caviar.global/';
const headers = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};

export function createWorker(data) {
  const links = readLinks(data);
  return {
    fetch(request) {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
      }

      const url = new URL(request.url);
      const slug = /^\/([a-z0-9-]+)\/?$/.exec(url.pathname)?.[1];
      const location = url.pathname === '/' ? home : resolveLink(links, slug, url.searchParams);
      if (location) return new Response(null, { status: 302, headers: { ...headers, Location: location } });

      const message = request.method === 'HEAD' ? null : 'This Caviar link was not found.';
      return new Response(message, {
        status: 404,
        headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' },
      });
    },
  };
}

export default createWorker(registry);
