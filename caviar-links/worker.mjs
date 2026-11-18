import { readLinks, resolveLink, shortOrigin } from './redirects.js';

const headers = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
};

export function createWorker(data, fetchOrigin = (request) => fetch(request)) {
  const links = readLinks(data);
  return {
    fetch(request) {
      const url = new URL(request.url);
      if (url.origin !== shortOrigin || (request.method !== 'GET' && request.method !== 'HEAD')) {
        return fetchOrigin(request);
      }

      const slug = /^\/([a-z0-9-]+)\/?$/.exec(url.pathname)?.[1];
      const location = resolveLink(links, slug, url.searchParams);
      if (!location) return fetchOrigin(request);

      return new Response(null, { status: 302, headers: { ...headers, Location: location } });
    },
  };
}
