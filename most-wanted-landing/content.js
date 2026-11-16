/* Shared content model for the landing page and its separate editor. */
(() => {
  'use strict';
  const scriptURL = new URL(document.currentScript.src);
  const baseURL = new URL('./', scriptURL);
  const fields = [];
  const groups = new Map();
  let editorMode = false;
  try { editorMode = new URLSearchParams(location.search).get('editor') === '1' && parent !== window && parent.location.origin === location.origin; } catch {}
  const sectionName = element => {
    const section = element.closest('article, section, header, footer, nav, dialog');
    if (!section) return 'Страница';
    if (section.matches('header')) return 'Шапка';
    if (section.matches('footer')) return 'Подвал';
    if (section.matches('nav')) return 'Навигация';
    if (section.matches('dialog')) return section.id === 'contact-dialog' ? 'Окно связи' : 'Окно просмотра';
    return (section.querySelector('h1,h2')?.innerText || section.getAttribute('aria-label') || section.querySelector('.eyebrow')?.textContent || 'Видео коллекции').trim().replace(/\s+/g, ' ');
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const element = node.parentElement;
    const value = node.textContent.trim();
    if (!value || !/[\p{L}\p{N}]/u.test(value) || element.closest('script,style,svg,video,[data-close],.motion-toggle,.skip-link,[data-cms-field]')) continue;
    const prefix = node.textContent.match(/^\s*/)[0];
    const suffix = node.textContent.match(/\s*$/)[0];
    fields.push({id: `text-${String(fields.length + 1).padStart(3, '0')}`, kind: 'text', label: value, section: sectionName(element), value, original: value, node, element, prefix, suffix});
  }
  // Explicit fields can be added without shifting existing saved text IDs.
  document.querySelectorAll('[data-cms-field]').forEach(element => {
    const value=element.textContent.trim();
    fields.push({id:element.dataset.cmsField,kind:'text',label:element.dataset.cmsLabel||value,section:sectionName(element),value,original:value,node:element,element,prefix:'',suffix:''});
  });
  function addMedia(element, attribute, kind) {
    const value = element.getAttribute(attribute);
    if (!value) return;
    const key = `${kind}:${value.replace(/-(?:720|1440)(?=\.webp(?:$|\?))/, '')}`;
    let field = groups.get(key);
    if (!field) {
      const isPoster = attribute === 'poster';
      field = {id: `media-${String(groups.size + 1).padStart(3, '0')}`, kind, section: sectionName(element), label: isPoster ? 'Обложка видео' : kind === 'video' ? (element.closest('video')?.classList.contains('hero-video') ? 'Фоновое видео' : 'Фильм о коллекции') : (element.alt || 'Изображение'), value, original: value, alt: element.alt || '', originalAlt: element.alt || '', targets: [], element};
      groups.set(key, field);
      fields.push(field);
    }
    field.targets.push({element, attribute, value, srcset: element.getAttribute('srcset'), alt: element.getAttribute('alt')});
  }
  document.querySelectorAll('img').forEach(el => addMedia(el, 'src', 'image'));
  document.querySelectorAll('video[poster]').forEach(el => addMedia(el, 'poster', 'image'));
  document.querySelectorAll('video source').forEach(el => addMedia(el, 'src', 'video'));
  let current = {version: 1, revision: 'initial', overrides: {}};
  let applied = {};
  const validURL = value => {
    if (typeof value !== 'string' || !value.trim() || value.length > 12000) return false;
    try { return ['https:', 'http:', 'blob:'].includes(new URL(value, baseURL).protocol); } catch { return false; }
  };
  function apply(overrides = {}) {
    applied = overrides;
    for (const field of fields) {
      const change = overrides[field.id] || {};
      if (field.kind === 'text') {
        const value = typeof change.text === 'string' ? change.text : field.original;
        field.node.textContent = field.prefix + value + field.suffix;
        field.value = value;
        if (value.includes('\n')) field.element.style.whiteSpace = 'pre-line';
      } else {
        const changed = validURL(change.url);
        const url = changed ? change.url : null;
        field.value = url || field.original;
        field.alt = typeof change.alt === 'string' ? change.alt : field.originalAlt;
        for (const target of field.targets) {
          const nextURL = url || target.value;
          if (target.element.getAttribute(target.attribute) !== nextURL) {
            target.element.setAttribute(target.attribute, nextURL);
            if (target.attribute === 'src' && target.element.tagName === 'SOURCE') {
              const video = target.element.parentElement;
              if (changed) target.element.type = /\.webm(?:$|\?)/i.test(url) || change.mime === 'video/webm' ? 'video/webm' : 'video/mp4';
              else target.element.type = 'video/mp4';
              video.load();
              if (video.autoplay && !editorMode) video.play().catch(() => {});
            }
          }
          if (target.attribute === 'src' && target.element.tagName === 'IMG') {
            if (changed) target.element.removeAttribute('srcset');
            else if (target.srcset) target.element.setAttribute('srcset', target.srcset);
            if (typeof change.alt === 'string') target.element.alt = change.alt;
            else if (target.alt !== null) target.element.alt = target.alt;
          }
        }
      }
    }
  }
  const ready = fetch(new URL('content.json', baseURL), {cache: 'no-store'}).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).then(data => {
    if (data.version === 1 && data.overrides && typeof data.overrides === 'object') current = data;
    apply(current.overrides);
    window.CaviarLayout?.apply(current.layout || {});
  }).catch(error => { console.warn('Caviar content:', error.message); });
  window.CaviarContent = {fields, apply, ready, baseURL: baseURL.href, get document() { return current; }, get overrides() { return applied; }};
  if (editorMode) {
    document.documentElement.classList.add('caviar-editor-preview');
    const style = document.createElement('style');
    style.dataset.editorOnly = '';
    style.textContent = '[data-editor-selected]{outline:3px solid #c06b98!important;outline-offset:5px!important} .caviar-editor-preview a,.caviar-editor-preview button{cursor:crosshair}';
    document.head.append(style);
    document.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      if (document.documentElement.dataset.editorMode === 'layout') {
        const block = event.target.closest('[data-layout-id]');
        event.preventDefault(); event.stopImmediatePropagation();
        if (block) parent.postMessage({type:'caviar-select-block', id:block.dataset.layoutId}, location.origin);
        return;
      }
      const candidates = fields.filter(f => f.element === event.target || f.element.contains(event.target) || f.targets?.some(target => target.element === event.target || target.element.contains(event.target)));
      const field = candidates.find(f => f.kind === 'image' && event.target.closest('img')) || candidates.find(f => f.kind === 'text') || candidates[0];
      event.preventDefault(); event.stopImmediatePropagation();
      if (field) parent.postMessage({type:'caviar-select', id:field.id}, location.origin);
    }, true);
    ready.then(() => {
      document.querySelectorAll('video').forEach(video => video.pause());
      parent.postMessage({type:'caviar-ready'}, location.origin);
    });
  }
})();
