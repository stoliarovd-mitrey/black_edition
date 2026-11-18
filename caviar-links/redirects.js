export const shortOrigin = 'https://caviar.global';

const allowedHosts = new Set([
  'caviar.global',
  'www.caviar.global',
  'caviar-phones.ru',
  'www.caviar-phones.ru',
]);

const campaignParameters = [
  'utm_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
  'gclid', 'gbraid', 'wbraid', 'yclid', 'fbclid', 'msclkid',
];

export function isSlug(slug) {
  return typeof slug === 'string' && slug.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function destinationUrl(destination) {
  const url = new URL(destination);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowedHosts.has(url.hostname)) {
    throw new Error('Укажите HTTPS-ссылку на caviar.global или caviar-phones.ru.');
  }
  return url.href;
}

export function readLinks(data) {
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    throw new Error('links.json must be an object.');
  }

  const links = new Map();
  for (const [slug, destination] of Object.entries(data)) {
    if (!isSlug(slug) || typeof destination !== 'string') {
      throw new Error(`Invalid short link: ${slug}`);
    }

    links.set(slug, destinationUrl(destination));
  }
  return links;
}

export function resolveLink(links, slug, searchParams) {
  const destination = links.get(slug);
  if (!destination) return null;

  const url = new URL(destination);
  for (const parameter of campaignParameters) {
    const value = searchParams.get(parameter);
    if (value && !url.searchParams.has(parameter)) {
      url.searchParams.set(parameter, value);
    }
  }
  return url.href;
}
