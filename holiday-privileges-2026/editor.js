'use strict';

const pageFolder = 'holiday-privileges-2026';
const publishedURL = new URL('https://stoliarovd-mitrey.github.io/black_edition/' + pageFolder + '/');
const repoAPI = 'https://api.github.com/repos/stoliarovd-mitrey/black_edition';
const sections = {
  meta: 'Название и соцсети', header: 'Шапка', hero: 'Первый экран', subnav: 'Навигация',
  gifts: 'Подарки на выбор', catalog: 'Рекомендации', bespoke: 'Индивидуальный дизайн',
  'gift-packaging': 'Именная упаковка', 'private-gifting': 'Подбор подарка и квиз',
  contact: 'Контакты и условия', footer: 'Подвал'
};
const dynamicLabels = {
  campaignGreeting: ['gifts', 'Начало сообщения об акции'],
  giftMessageLabel: ['gifts', 'Подпись выбранного подарка в сообщении'],
  giftChosen: ['gifts', 'Кнопка после выбора подарка'],
  giftChosenNote: ['gifts', 'Подсказка после выбора подарка'],
  maxCopied: ['contact', 'MAX · сообщение скопировано'],
  maxCopyManually: ['contact', 'MAX · подсказка для ручного копирования'],
  quizProgress: ['private-gifting', 'Счётчик вопросов ({step} и {total})'],
  quizContactButton: ['private-gifting', 'Последняя кнопка квиза'],
  quizNoDate: ['private-gifting', 'Ответ без даты'],
  quizNoBudget: ['private-gifting', 'Ответ без бюджета'],
  quizCompleted: ['private-gifting', 'Заголовок после прохождения квиза']
};
const textTags = new Set(['TITLE', 'P', 'H1', 'H2', 'H3', 'STRONG', 'SPAN', 'A', 'BUTTON', 'SUMMARY', 'LEGEND', 'LABEL', 'DT']);
const get = id => document.getElementById(id);
const frame = get('preview-frame');
const parser = new DOMParser();
const objectURLs = new Map();
const previewImages = new Map();
let draft;
let fields = [];
let selectedSection = 'hero';
let latestSource;
let database;
let pendingFiles = 0;
let publishing = false;
let saveTimer;
let saveQueue = Promise.resolve();
let previewTimer;
let previewScroll = 0;
let previewRevision = 0;

function status(message, error = false) {
  get('editor-status').textContent = message;
  get('editor-status').dataset.error = String(error);
}

function registry(page) {
  const result = [];
  const elements = [...page.querySelectorAll('*')];
  const messageScript = page.getElementById('page-messages');
  const messages = JSON.parse(messageScript.textContent);
  const background = elements.find(element => element.tagName === 'STYLE' && element.textContent.includes('.hero{'));
  const getSection = element => {
    const section = element.closest('section[id]');
    if (section && sections[section.id]) return section.id;
    if (element.closest('.subnav')) return 'subnav';
    if (element.closest('footer')) return 'footer';
    return element.closest('head') ? 'meta' : 'header';
  };
  const add = field => result.push(field);

  elements.forEach((element, index) => {
    const section = getSection(element);
    const card = element.closest('.gift,.catalog-card');
    const group = card?.querySelector('h3')?.textContent.trim()
      || (element.closest('.gift-quiz-step') ? element.closest('.gift-quiz-step').querySelector('legend').textContent.trim() : '');
    const put = (key, label, value, kind = 'text', advanced = false, extra = {}) =>
      add({ id: index + ':' + key, index, key, label, value, kind, section, group, advanced, ...extra });
    const attr = (name, label, kind, advanced) => {
      if (element.hasAttribute(name)) put(name, label, element.getAttribute(name), kind, advanced, { attribute: name });
    };

    if (element.tagName === 'IMG') {
      attr('src', element.closest('.brand,footer') ? 'Логотип' : 'Изображение', 'image');
      attr('alt', 'Описание изображения', 'text', true);
    }
    if (element.tagName === 'LINK' && element.rel === 'icon') attr('href', 'Иконка вкладки', 'image');
    if (element.matches('meta[name="description"]')) attr('content', 'Описание для поиска', 'text');
    if (element.matches('meta[property="og:image"]')) attr('content', 'Изображение для соцсетей', 'image');
    if (element.matches('meta[property="og:title"]')) attr('content', 'Заголовок для соцсетей', 'text');
    if (element.tagName === 'A' && !element.closest('.skip')) {
      const label = element.textContent.trim() || element.getAttribute('aria-label') || 'логотип';
      attr('href', 'Ссылка · ' + label, 'link', true);
    }
    attr('aria-label', 'Подпись для экранного диктора', 'text', true);
    attr('data-gift', 'Название подарка в сообщении', 'text', true);

    if (element.matches('textarea.max-message') && element.textContent.trim()) {
      put('content', 'Сообщение менеджеру', element.textContent.trim(), 'text', true);
    }
    if (!textTags.has(element.tagName) || element.id === 'gift-quiz-progress') return;
    const tags = { TITLE: 'Название вкладки', H1: 'Заголовок', H2: 'Заголовок', H3: 'Заголовок',
      P: 'Текст', A: 'Текст ссылки', BUTTON: 'Текст кнопки', STRONG: 'Выделенный текст',
      SUMMARY: 'Текст кнопки', LEGEND: 'Вопрос', LABEL: 'Подпись поля', DT: 'Подпись ответа', SPAN: 'Текст' };
    const label = element.classList.contains('eyebrow') ? 'Надзаголовок' : tags[element.tagName];
    const children = [...element.childNodes];
    if (children.every(node => node.nodeType === 3 || node.nodeName === 'BR')) {
      const value = children.map(node => node.nodeName === 'BR' ? '\n' : node.textContent).join('').trim();
      if (value) put('content', label, value);
      return;
    }
    children.forEach((node, child) => {
      if (node.nodeType !== 3 || !node.nodeValue.trim()) return;
      const radio = element.querySelector(':scope > input[type="radio"]');
      put('node-' + child, radio ? 'Вариант ответа' : label, node.nodeValue.trim(), 'text', false, { child, radio: Boolean(radio) });
    });
  });

  const image = background?.textContent.match(/(\.hero\{[^}]*?background:[^;}]*?url\()['"]([^'"]+)['"](\))/);
  if (!image) throw new Error('Не найдено фоновое изображение первого экрана.');
  add({ id: 'hero-background', key: 'background', index: elements.indexOf(background), label: 'Фон первого экрана',
    value: image[2], kind: 'image', section: 'hero', group: '', advanced: false });

  for (const [key, [section, label]] of Object.entries(dynamicLabels)) {
    add({ id: 'message:' + key, key, label, value: messages[key], kind: 'text', section,
      group: '', advanced: true, message: true });
  }
  return result;
}

function valueOf(field) { return draft.values[field.id] ?? field.value; }

function safeURL(value, kind) {
  if (kind === 'link' && value.startsWith('#')) return value;
  const url = new URL(value, publishedURL);
  const protocols = kind === 'link' ? ['https:', 'mailto:', 'tel:'] : ['https:'];
  if (!protocols.includes(url.protocol) || url.username || url.password || !value) throw new Error('Введите HTTPS-ссылку или путь к файлу на сайте.');
  return value;
}

function localURL(path) {
  const file = draft.files[path];
  if (!file) return new URL(path, publishedURL).href;
  if (!objectURLs.has(path)) objectURLs.set(path, URL.createObjectURL(file));
  return objectURLs.get(path);
}

function pageDocument(mode, exported = {}) {
  const page = parser.parseFromString(draft.html, 'text/html');
  const elements = [...page.querySelectorAll('*')];
  const messageScript = page.getElementById('page-messages');
  const messages = JSON.parse(messageScript.textContent);
  const imageValue = value => mode === 'publish' ? value :
    exported[value] || previewImages.get(value) || new URL(value, publishedURL).href;

  fields.forEach(field => {
    const changed = Object.hasOwn(draft.values, field.id);
    if (!changed && (field.kind !== 'image' || mode === 'publish')) return;
    let value = valueOf(field);
    if (field.kind === 'image') value = imageValue(value);
    if (field.message) { messages[field.key] = value; return; }
    const element = elements[field.index];
    if (field.key === 'background') {
      element.textContent = element.textContent.replace(/(\.hero\{[^}]*?background:[^;}]*?url\()['"][^'"]+['"](\))/, (_, prefix, suffix) =>
        prefix + '"' + value.replace(/["'<>\\\r\n]/g, char => '%' + char.charCodeAt(0).toString(16)) + '"' + suffix);
    } else if (field.attribute) {
      const absoluteImage = mode === 'publish' && element.matches('meta[property="og:image"]');
      element.setAttribute(field.attribute, absoluteImage ? new URL(value, publishedURL).href : value);
    } else if (field.child !== undefined) {
      const node = element.childNodes[field.child];
      node.nodeValue = node.nodeValue.replace(/^(\s*)[\s\S]*?(\s*)$/, (_, before, after) => before + value + after);
      if (field.radio) element.querySelector(':scope > input[type="radio"]').value = value;
    } else if (element.matches('title,textarea')) {
      element.textContent = value;
    } else {
      const lines = value.split('\n');
      element.replaceChildren(...lines.flatMap((line, index) => index ? [page.createElement('br'), line] : [line]));
    }
  });

  messageScript.textContent = '\n' + JSON.stringify(messages, null, 2).replaceAll('<', '\\u003c') + '\n';
  const drafts = [
    ['.selection [data-draft]', messages.campaignGreeting],
    ['#gift-packaging .gift-channel-links a:not([id])', page.getElementById('gift-packaging-max-message').textContent],
    ['#private-gifting [data-quiz-draft]', page.getElementById('private-gifting-max-message').textContent]
  ];
  for (const [selector, message] of drafts) {
    for (const link of page.querySelectorAll(selector)) {
      // Preserve independently edited links that do not use a messenger draft.
      const address = new URL(link.getAttribute('href'), publishedURL);
      if (address.hostname === 't.me' || address.hostname === 'wa.me') {
        address.searchParams.set('text', message);
        link.href = address.href;
      }
    }
  }
  if (mode !== 'publish') {
    page.querySelectorAll('style').forEach(style => {
      style.textContent = style.textContent.replace(/url\(['"](\.\.?\/[^'"]+)['"]\)/g,
        (_, path) => 'url("' + new URL(path, publishedURL).href + '")');
    });
    page.querySelectorAll('link[rel="preload"][href]').forEach(link => {
      link.href = new URL(link.getAttribute('href'), publishedURL).href;
    });
    page.querySelectorAll('a[href]:not([href^="#"])').forEach(link => {
      link.href = new URL(link.getAttribute('href'), publishedURL).href;
    });
  }
  return page;
}

const serialize = page => '<!doctype html>\n' + page.documentElement.outerHTML;

function showPreview(scrollToSection = false) {
  const page = pageDocument('preview');
  const revision = ++previewRevision;
  const focus = scrollToSection ? selectedSection : null;
  const previewPolicy = page.createElement('meta');
  previewPolicy.httpEquiv = 'Content-Security-Policy';
  previewPolicy.content = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: blob: data:; font-src https:; form-action 'none'; base-uri 'none'";
  page.head.prepend(previewPolicy);
  const script = page.createElement('script');
  script.textContent = `
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (link && !link.getAttribute('href').startsWith('#')) event.preventDefault();
    });
    const section = ${JSON.stringify(focus)};
    requestAnimationFrame(() => {
      const element = section && document.getElementById(section);
      if (element) element.scrollIntoView({behavior:'instant'});
      else scrollTo(0,${scrollToSection ? 0 : previewScroll});
    });
    addEventListener('scroll', () => parent.postMessage({caviarPreview: ${revision}, scroll: scrollY}, '*'), {passive:true});
  `;
  page.body.append(script);
  frame.srcdoc = serialize(page);
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(showPreview, 190);
}

addEventListener('message', event => {
  if (event.source === frame.contentWindow && event.data?.caviarPreview === previewRevision &&
      Number.isFinite(event.data.scroll)) previewScroll = event.data.scroll;
});

function renderNavigation() {
  const nav = get('section-nav');
  nav.replaceChildren(...Object.entries(sections).map(([key, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-current', String(selectedSection === key));
    button.addEventListener('click', () => {
      selectedSection = key;
      for (const child of nav.children) child.setAttribute('aria-current', String(child === button));
      renderFields();
      clearTimeout(previewTimer);
      showPreview(true);
    });
    return button;
  }));
}

function renderFields() {
  get('section-title').textContent = sections[selectedSection];
  const destination = get('fields');
  destination.replaceChildren();
  const advanced = document.createElement('details');
  advanced.className = 'advanced';
  const summary = document.createElement('summary');
  summary.textContent = 'Ссылки и сообщения';
  advanced.append(summary);
  let lastGroup = '';
  for (const field of fields.filter(field => field.section === selectedSection)) {
    if (!field.advanced && field.group && field.group !== lastGroup) {
      const heading = document.createElement('h3');
      heading.className = 'field-group';
      heading.textContent = field.group;
      destination.append(heading);
    }
    if (!field.advanced) lastGroup = field.group;
    (field.advanced ? advanced : destination).append(renderField(field));
  }
  if (advanced.childElementCount > 1) destination.append(advanced);
}

function renderField(field) {
  const block = document.createElement('div');
  block.className = field.kind === 'image' ? 'field image-field' : 'field';
  const input = document.createElement(field.kind === 'text' ? 'textarea' : 'input');
  const label = document.createElement('label');
  input.id = 'field-' + field.id;
  input.value = valueOf(field);
  if (input.tagName === 'TEXTAREA') input.rows = input.value.length > 85 ? 3 : 1;
  label.htmlFor = input.id;
  label.textContent = field.label + (field.advanced && field.group ? ' · ' + field.group : '');
  block.append(label);
  if (field.kind === 'image') {
    const image = document.createElement('img');
    image.src = localURL(input.value);
    image.alt = '';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml';
    file.setAttribute('aria-label', 'Загрузить файл · ' + field.label);
    file.addEventListener('change', async () => {
      if (!file.files.length) return;
      ++pendingFiles;
      setButtons();
      status('Обрабатываем изображение…');
      try {
        const blob = await imageBlob(file.files[0], field.key === 'background' ? 2000 : 1600);
        const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        const path = 'assets/editor-' + asHex(digest).slice(0, 24) + '.webp';
        previewImages.set(path, await dataURI(blob));
        draft.files[path] = blob;
        input.value = path;
        input.dispatchEvent(new Event('input'));
      } catch (error) {
        status(error.message || 'Не удалось открыть изображение.', true);
      } finally {
        --pendingFiles;
        file.value = '';
        setButtons();
      }
    });
    block.append(image, input, file);
    input.setAttribute('aria-label', field.label + ' · ссылка или путь');
    input.addEventListener('input', () => {
      try { image.src = localURL(safeURL(input.value.trim(), 'image')); }
      catch { /* Keep the last valid thumbnail while the URL is being entered. */ }
    });
  } else {
    block.append(input);
  }
  input.addEventListener('input', () => {
    try {
      const value = field.kind === 'text' ? input.value : safeURL(input.value.trim(), field.kind);
      input.setCustomValidity('');
      if (value === field.value) delete draft.values[field.id];
      else draft.values[field.id] = value;
      schedulePreview();
      scheduleSave();
      setButtons();
    } catch (error) {
      input.setCustomValidity(error.message);
      status(error.message, true);
    }
  });
  return block;
}

async function imageBlob(file, limit) {
  if (file.size > 30 * 1024 * 1024 || !/^image\/(jpeg|png|webp|avif|gif|svg\+xml)$/.test(file.type)) {
    throw new Error('Выберите JPG, PNG, WebP, AVIF, GIF или SVG до 30 МБ.');
  }
  const src = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = src;
    await image.decode();
    const ratio = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const webp = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .88));
    if (webp?.type !== 'image/webp') throw new Error('Браузер не поддерживает конвертацию в WebP.');
    return webp;
  } finally {
    URL.revokeObjectURL(src);
  }
}

function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('caviar-holiday-editor', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storedDraft() {
  return new Promise((resolve, reject) => {
    const request = database.transaction('drafts').objectStore('drafts').get('current');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function activeFiles() {
  return Object.fromEntries([...new Set(Object.values(draft.values))]
    .filter(value => Object.hasOwn(draft.files, value)).map(value => [value, draft.files[value]]));
}

function writeDraft(snapshot) {
  if (!database) return Promise.reject(new Error('Хранилище браузера недоступно.'));
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('drafts', 'readwrite');
    transaction.objectStore('drafts').put(snapshot, 'current');
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 200);
  status('Черновик обновлён…');
}

function save(reportStatus = true) {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const snapshot = { ...draft, values: { ...draft.values }, files: activeFiles() };
  saveQueue = saveQueue.catch(() => {}).then(() => writeDraft(snapshot));
  saveQueue.then(() => {
    if (!reportStatus || snapshot.sha !== draft.sha || publishing) return;
    if (latestSource && latestSource.sha !== draft.sha) {
      status('Есть другая версия лендинга. Черновик сохранён. Перед публикацией редактор проверит версию на GitHub.');
    } else status(Object.keys(draft.values).length ? 'Черновик сохранён в браузере.' : 'Нет неопубликованных изменений.');
  }, () => status('Черновик не удалось сохранить. Можно скачать HTML или опубликовать правки.', true));
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && saveTimer) save();
});

const asHex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
async function gitHash(html) {
  const encoder = new TextEncoder();
  const length = encoder.encode(html).length;
  return asHex(await crypto.subtle.digest('SHA-1', encoder.encode('blob ' + length + '\0' + html)));
}

async function loadPage() {
  const response = await fetch('./index.html?editor=' + Date.now(), { cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось загрузить лендинг (' + response.status + ').');
  const html = await response.text();
  if (!html.includes('id="page-messages"')) throw new Error('Лендинг ещё обновляется. Перезагрузите редактор через минуту.');
  return { html, sha: await gitHash(html), values: {}, files: {} };
}

function setButtons() {
  const changed = draft && Object.keys(draft.values).length > 0;
  get('discard').disabled = !changed || publishing || pendingFiles > 0;
  get('download').disabled = !draft || pendingFiles > 0;
  get('publish').disabled = !changed || publishing || pendingFiles > 0;
}

function openSource(source) {
  draft = source;
  for (const url of objectURLs.values()) URL.revokeObjectURL(url);
  objectURLs.clear();
  for (const path of previewImages.keys()) {
    if (!Object.hasOwn(draft.files, path)) previewImages.delete(path);
  }
  fields = registry(parser.parseFromString(draft.html, 'text/html'));
  renderNavigation();
  renderFields();
  setButtons();
  showPreview(true);
}

function dataURI(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

get('download').addEventListener('click', async () => {
  try {
    const media = Object.fromEntries(await Promise.all(Object.entries(activeFiles())
      .map(async ([path, blob]) => [path, await dataURI(blob)])));
    const url = URL.createObjectURL(new Blob([serialize(pageDocument('export', media))], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'index.html';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    status(error.message || 'Не удалось скачать HTML.', true);
  }
});

get('discard').addEventListener('click', async () => {
  if (!confirm('Удалить черновик и загрузить текущий лендинг?')) return;
  try {
    latestSource = await loadPage();
    openSource(latestSource);
    save();
  } catch (error) { status(error.message, true); }
});

const dialog = get('publish-dialog');
const tokenField = get('github-token');
const publishStatus = get('publish-status');
const confirmPublish = get('confirm-publish');
const cancelPublish = get('cancel-publish');
get('publish').addEventListener('click', () => {
  tokenField.value = '';
  publishStatus.textContent = '';
  publishStatus.dataset.error = 'false';
  dialog.showModal();
});
cancelPublish.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { tokenField.value = ''; });
dialog.addEventListener('cancel', event => { if (publishing) event.preventDefault(); });

function github(token) {
  return async (path, options = {}) => {
    const response = await fetch(repoAPI + path, {
      cache: 'no-store', credentials: 'omit', redirect: 'error',
      method: options.method || 'GET',
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('GitHub не принял токен. Проверьте, что он действителен.');
      if (response.status === 403 || response.status === 404) throw new Error('GitHub не дал доступ к репозиторию. Проверьте, что у токена есть Contents: Read and write для black_edition.');
      if (response.status === 409 || response.status === 422) throw new Error('GitHub отклонил обновление ветки. Проверьте её правила или загрузите свежую версию лендинга.');
      throw new Error('Ошибка GitHub (' + response.status + '). Черновик можно скачать в HTML.');
    }
    return response.json();
  };
}

async function publishToGitHub(api, html, assets) {
  const head = (await api('/git/ref/heads/main')).object.sha;
  const current = await api('/contents/' + pageFolder + '/index.html?ref=' + head);
  if (current.sha !== draft.sha) throw new Error('Лендинг обновили в GitHub после загрузки редактора. Скачайте черновик и загрузите свежую версию, чтобы не перезаписать чужие правки.');
  const baseTree = (await api('/git/commits/' + head)).tree.sha;
  const tree = [{ path: pageFolder + '/index.html', mode: '100644', type: 'blob', content: html }];
  for (const [path, file] of Object.entries(assets)) {
    const content = (await dataURI(file)).split(',')[1];
    const { sha } = await api('/git/blobs', { method: 'POST', body: { content, encoding: 'base64' } });
    tree.push({ path: pageFolder + '/' + path, mode: '100644', type: 'blob', sha });
  }
  const next = await api('/git/trees', { method: 'POST', body: { base_tree: baseTree, tree } });
  const commit = await api('/git/commits', { method: 'POST',
    body: { message: 'Update Caviar holiday landing', tree: next.sha, parents: [head] } });
  await api('/git/refs/heads/main', { method: 'PATCH', body: { sha: commit.sha, force: false } });
  return commit.sha;
}

get('publish-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (publishing) return;
  const token = tokenField.value.trim();
  if (!token) return;
  tokenField.value = '';
  publishing = true;
  setButtons();
  tokenField.disabled = confirmPublish.disabled = cancelPublish.disabled = true;
  publishStatus.dataset.error = 'false';
  publishStatus.textContent = 'Отправляем изменения в GitHub…';

  try {
    const html = serialize(pageDocument('publish'));
    const sha = await gitHash(html);
    const commit = await publishToGitHub(github(token), html, activeFiles());
    latestSource = { html, sha, values: {}, files: {} };
    openSource(latestSource);
    dialog.close();
    save(false);
    status('Опубликовано в GitHub (' + commit.slice(0, 7) + '). Обновление лендинга может занять несколько минут.');
  } catch (error) {
    publishStatus.dataset.error = 'true';
    publishStatus.textContent = error.message || 'Публикация не завершилась.';
  } finally {
    publishing = false;
    tokenField.disabled = confirmPublish.disabled = cancelPublish.disabled = false;
    setButtons();
  }
});

get('mobile-preview').addEventListener('click', event => {
  const open = get('workspace').classList.toggle('show-preview');
  event.currentTarget.setAttribute('aria-pressed', String(open));
  event.currentTarget.textContent = open ? 'К редактированию' : 'Предпросмотр';
});
const stage = get('preview-stage');
function resizePreview() {
  const width = stage.clientWidth - 24;
  const height = stage.clientHeight - 24;
  if (width <= 0 || height <= 0) return;
  const mobile = stage.classList.contains('is-mobile');
  const viewportWidth = mobile ? Math.min(390, width) : Math.max(1100, width);
  const scale = mobile ? 1 : width / viewportWidth;
  frame.style.width = viewportWidth + 'px';
  frame.style.height = Math.floor(height / scale) + 'px';
  frame.style.zoom = scale;
}
new ResizeObserver(resizePreview).observe(stage);

for (const button of document.querySelectorAll('[data-viewport]')) {
  button.addEventListener('click', () => {
    stage.classList.toggle('is-mobile', button.dataset.viewport === 'mobile');
    resizePreview();
    document.querySelectorAll('[data-viewport]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  });
}

async function initialize() {
  let stored;
  try {
    database = await openStore();
    stored = await storedDraft();
  } catch { /* Editing can continue without browser storage. */ }
  try {
    latestSource = await loadPage();
  } catch (error) {
    if (!stored?.html) throw error;
  }
  const hasDraft = stored?.html && Object.keys(stored.values || {}).length > 0;
  const source = hasDraft ? stored : latestSource || stored;
  await Promise.all(Object.entries(source.files).map(async ([path, blob]) => {
    previewImages.set(path, await dataURI(blob));
  }));
  openSource(source);
  status(hasDraft ? 'Открыт черновик из этого браузера.' : 'Выберите раздел и измените его содержимое.');
}
initialize().catch(error => status(error.message, true));
