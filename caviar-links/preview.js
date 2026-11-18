import { readLinks, resolveLink } from './redirects.js';

const status = document.querySelector('#status');
const list = document.querySelector('#links');
const currentUrl = new URL(window.location.href);
const slug = currentUrl.searchParams.get('s');

try {
  const response = await fetch('./links.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Link registry could not be loaded.');
  const links = readLinks(await response.json());

  if (slug !== null) {
    const destination = resolveLink(links, slug, currentUrl.searchParams);
    status.textContent = destination ? 'Открываем страницу Caviar…' : 'Такой ссылки нет.';
    if (destination) window.location.replace(destination);
  } else {
    status.hidden = links.size > 0;
    status.textContent = 'Ссылок пока нет.';
    document.querySelector('#controls').hidden = false;

    for (const name of links.keys()) {
      const item = document.createElement('li');
      const address = document.createElement('code');
      address.textContent = `go.caviar.global/${name}`;
      const preview = document.createElement('a');
      preview.href = `?${new URLSearchParams({ s: name })}`;
      preview.textContent = 'Проверить переход';
      preview.setAttribute('aria-label', `Проверить переход ${name}`);
      item.append(address, preview);
      list.append(item);
    }
  }
} catch {
  status.textContent = 'Не удалось загрузить ссылки. Обновите страницу и попробуйте ещё раз.';
}
