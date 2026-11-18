import { destinationUrl, isSlug, readLinks, resolveLink, shortOrigin } from './redirects.js';

const currentUrl = new URL(window.location.href);
const slug = currentUrl.searchParams.get('s');

if (slug === null) {
  showGenerator();
} else {
  await openPreview();
}

function showGenerator() {
  document.querySelector('#generator').hidden = false;
  const form = document.querySelector('#create-link');
  const destination = document.querySelector('#destination');
  const error = document.querySelector('#error');
  const result = document.querySelector('#result');
  const shortUrl = document.querySelector('#short-url');
  const publish = document.querySelector('#publish');
  const notice = document.querySelector('#notice');
  const record = document.querySelector('#record');
  const fallback = document.querySelector('#copy-fallback');
  const usedSlugs = new Set();
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.hidden = true;
    fallback.hidden = true;
    notice.textContent = '';

    let url;
    try {
      url = destinationUrl(destination.value.trim());
    } catch {
      result.hidden = true;
      error.textContent = 'Укажите HTTPS-ссылку на caviar.global или caviar-phones.ru.';
      error.hidden = false;
      return;
    }

    let code;
    do {
      code = Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => alphabet[byte & 31]).join('');
    } while (usedSlugs.has(code));
    usedSlugs.add(code);

    const editor = new URL('https://github.com/stoliarovd-mitrey/black_edition/new/main/caviar-links/entries');
    editor.searchParams.set('filename', `${code}.json`);
    publish.href = editor.href;
    shortUrl.value = `${shortOrigin}/${code}`;
    record.value = `${JSON.stringify(url)}\n`;
    result.hidden = false;
    shortUrl.focus();
    shortUrl.select();
  });

  document.querySelector('#copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shortUrl.value);
      notice.textContent = 'Ссылка скопирована.';
    } catch {
      shortUrl.focus();
      shortUrl.select();
      notice.textContent = 'Скопируйте выделенную ссылку.';
    }
  });

  publish.addEventListener('click', () => {
    fallback.hidden = false;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(record.value).then(() => {
        notice.textContent = 'Запись скопирована.';
      }).catch(() => {
        notice.textContent = 'Скопируйте запись из поля ниже.';
      });
    }
  });
}

async function openPreview() {
  const status = document.querySelector('#status');
  status.textContent = 'Открываем страницу Caviar…';
  status.hidden = false;
  if (!isSlug(slug)) {
    status.textContent = 'Такой ссылки нет.';
    return;
  }

  try {
    const catalog = await fetch('./links.json', { cache: 'no-cache' });
    if (!catalog.ok) throw new Error('Link registry could not be loaded.');
    let links = readLinks(await catalog.json());
    if (!links.has(slug)) {
      const entry = await fetch(`./entries/${slug}.json`, { cache: 'no-cache' });
      if (entry.ok) links = readLinks({ [slug]: await entry.json() });
      else if (entry.status !== 404) throw new Error('Link could not be loaded.');
    }

    const destination = resolveLink(links, slug, currentUrl.searchParams);
    if (destination) window.location.replace(destination);
    else status.textContent = 'Такой ссылки нет.';
  } catch {
    status.textContent = 'Не удалось загрузить ссылку. Обновите страницу и попробуйте ещё раз.';
  }
}
