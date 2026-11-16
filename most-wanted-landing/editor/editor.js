(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const repo = 'stoliarovd-mitrey/black_edition';
  const folder = 'most-wanted-landing/';
  const landingURL = new URL('../', location.href);
  const draftKey = `caviar:${repo}:${folder}:v1`;
  const clone = value => structuredClone(value);
  let cms, fields = [], published, state, activeID, filter = 'all', busy = false, database;
  let history = [], files = new Map(), blobURLs = new Map(), saveTimer, toastTimer, lastEdit = 0, lastField = '';
  let saveQueue = Promise.resolve(), ready = false, initializing = false;
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
  function fail(error) { console.error(error); toast(error.message || 'Не удалось выполнить действие. Черновик сохранён.'); }
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('caviar-most-wanted-editor', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function readDraft() {
    return new Promise((resolve, reject) => {
      const request = database.transaction('drafts').objectStore('drafts').get(draftKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function usedFiles(doc = state) {
    const paths = new Set(Object.values(doc.overrides).map(item => item.url).filter(Boolean));
    return [...files].filter(([path]) => paths.has(path));
  }
  function saveDraft() {
    clearTimeout(saveTimer);
    if (!database) { $('save-status').textContent = 'Скачайте копию черновика'; return Promise.resolve(); }
    const draft = {state: clone(state), baseRevision: published.revision, files: usedFiles(), savedAt: new Date().toISOString()};
    saveQueue = saveQueue.catch(() => {}).then(() => new Promise((resolve, reject) => {
      const transaction = database.transaction('drafts', 'readwrite');
      transaction.objectStore('drafts').put(draft, draftKey);
      transaction.oncomplete = () => { $('save-status').textContent = 'Черновик сохранён в браузере'; resolve(); };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Сохранение прервано'));
    })).catch(error => { $('save-status').textContent = 'Скачайте копию черновика'; toast('Браузер не сохранил черновик. Скачайте его копию.'); console.error(error); });
    return saveQueue;
  }
  function scheduleSave() { $('save-status').textContent = 'Сохраняем черновик…'; clearTimeout(saveTimer); saveTimer = setTimeout(saveDraft, 350); }
  function changedIDs() {
    return [...new Set([...Object.keys(state.overrides), ...Object.keys(published.overrides)])].filter(id => JSON.stringify(state.overrides[id] || {}) !== JSON.stringify(published.overrides[id] || {}));
  }
  function previewOverrides() {
    const overrides = clone(state.overrides);
    for (const item of Object.values(overrides)) if (item.url && files.has(item.url)) {
      if (!blobURLs.has(item.url)) blobURLs.set(item.url, URL.createObjectURL(files.get(item.url).blob));
      item.url = blobURLs.get(item.url);
    }
    return overrides;
  }
  function applyPreview() { cms.apply(previewOverrides()); updateStatus(); }
  function updateStatus() {
    const changes = changedIDs();
    $('change-count').textContent = changes.length ? `Изменено элементов: ${changes.length}` : 'Изменений нет';
    $('publish').disabled = busy || !changes.length;
    $('reset').disabled = busy || !changes.length;
    $('undo').disabled = busy || !history.length;
    document.querySelectorAll('.field-item').forEach(button => {
      button.classList.toggle('active', button.dataset.id === activeID);
      button.querySelector('.changed').hidden = !changes.includes(button.dataset.id);
    });
  }
  function checkpoint() {
    const now = Date.now();
    if (now - lastEdit > 700 || lastField !== activeID) { history.push(clone(state)); if (history.length > 60) history.shift(); }
    lastEdit = now; lastField = activeID;
  }
  function changeField(patch) {
    if (busy || !activeID) return;
    checkpoint();
    state.overrides[activeID] = {...(state.overrides[activeID] || {}), ...patch};
    applyPreview(); scheduleSave();
  }
  function renderList() {
    const list = $('field-list'); list.replaceChildren();
    const term = $('search').value.toLocaleLowerCase('ru');
    const groups = new Map();
    for (const field of fields) {
      const currentText = state.overrides[field.id]?.text || field.label;
      if (filter !== 'all' && field.kind !== filter) continue;
      if (term && !`${field.section} ${field.label} ${currentText}`.toLocaleLowerCase('ru').includes(term)) continue;
      if (!groups.has(field.section)) groups.set(field.section, []);
      groups.get(field.section).push(field);
    }
    for (const [name, group] of groups) {
      const section = document.createElement('section'); section.className = 'field-group';
      const heading = document.createElement('h3'); heading.textContent = name; section.append(heading);
      for (const field of group) {
        const button = document.createElement('button'); button.className = 'field-item'; button.dataset.id = field.id;
        const type = document.createElement('span'); type.className = 'type'; type.textContent = {text:'T',image:'Ф',video:'В'}[field.kind];
        const label = document.createElement('span'); label.className = 'label'; label.textContent = state.overrides[field.id]?.text || field.label;
        const dot = document.createElement('span'); dot.className = 'changed'; dot.setAttribute('aria-label','Изменено');
        button.title = `${field.section}: ${label.textContent}`; button.append(type, label, dot);
        button.addEventListener('click', () => select(field.id)); section.append(button);
      }
      list.append(section);
    }
    if (!groups.size) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Ничего не найдено'; list.append(empty); }
    updateStatus();
  }
  function select(id, scroll = true) {
    const field = fields.find(item => item.id === id); if (!field || busy) return;
    activeID = id; lastField = '';
    const doc = $('preview').contentDocument;
    doc.querySelectorAll('[data-editor-selected]').forEach(el => el.removeAttribute('data-editor-selected'));
    const target = field.element.tagName === 'SOURCE' ? field.element.parentElement : field.element;
    const targetDialog = target.closest('dialog');
    doc.querySelectorAll('dialog[open]').forEach(dialog => { if (dialog !== targetDialog) dialog.close(); });
    if (targetDialog && !targetDialog.open) targetDialog.showModal();
    target.dataset.editorSelected = 'true';
    if (scroll) target.scrollIntoView({block:'center',behavior:'smooth'});
    $('inspector-empty').hidden = true; $('inspector-content').hidden = false;
    $('field-kind').textContent = {text:'ТЕКСТ',image:'ИЗОБРАЖЕНИЕ',video:'ВИДЕО'}[field.kind];
    $('field-title').textContent = field.kind === 'text' ? field.label.slice(0, 100) : field.label;
    $('field-section').textContent = field.section;
    $('text-controls').hidden = field.kind !== 'text'; $('media-controls').hidden = field.kind === 'text';
    if (field.kind === 'text') $('text-value').value = state.overrides[id]?.text ?? field.original;
    else renderMedia(field);
    updateStatus();
  }
  function renderMedia(field) {
    const change = state.overrides[field.id] || {};
    const path = change.url || field.original;
    const url = files.has(path) ? (blobURLs.get(path) || URL.createObjectURL(files.get(path).blob)) : new URL(path, landingURL).href;
    if (files.has(path)) blobURLs.set(path, url);
    const oldVideo = $('media-preview').querySelector('video'); if (oldVideo) oldVideo.pause();
    const media = document.createElement(field.kind === 'video' ? 'video' : 'img');
    media.src = url;
    if (field.kind === 'video') { media.controls = true; media.preload = 'metadata'; media.playsInline = true; }
    else media.alt = 'Предпросмотр выбранного изображения';
    media.addEventListener('error', () => toast('Не удалось загрузить медиа. Проверьте файл или прямую ссылку.'));
    $('media-preview').replaceChildren(media);
    $('media-file').accept = field.kind === 'video' ? 'video/mp4,video/webm,.mp4,.webm' : 'image/jpeg,image/png,image/webp,image/gif,image/avif,.jpg,.jpeg,.png,.webp,.gif,.avif';
    $('media-file').value = '';
    $('media-url').value = files.has(path) ? '' : new URL(path, landingURL).href;
    $('upload-hint').textContent = field.kind === 'video' ? 'MP4 или WebM · до 45 МБ' : 'JPG, PNG, WebP, GIF, AVIF · до 45 МБ';
    $('file-info').textContent = files.has(path) ? `${files.get(path).name} · ${(files.get(path).blob.size / 1048576).toFixed(1)} МБ · готов к публикации` : 'Можно заменить файл загрузкой или ссылкой.';
    $('alt-control').hidden = field.kind !== 'image';
    $('media-alt').value = change.alt ?? field.originalAlt;
    $('media-usage').textContent = field.targets.length > 1 ? `Замена применяется во всех связанных местах (${field.targets.length}), включая миниатюры и детали.` : 'Замена применяется к этому элементу страницы.';
  }
  async function upload(file) {
    if (!file || busy) return;
    const field = fields.find(item => item.id === activeID); if (!field || field.kind === 'text') return;
    const ext = file.name.split('.').pop().toLowerCase();
    const allowed = field.kind === 'video' ? ['mp4','webm'] : ['jpg','jpeg','png','webp','gif','avif'];
    if (!allowed.includes(ext)) return toast(`Неподходящий формат. Допустимы: ${allowed.join(', ')}.`);
    if (file.size > 45 * 1048576) return toast('Размер файла превышает 45 МБ. Сожмите его или укажите прямую ссылку.');
    if (!file.size) return toast('Этот файл пуст.');
    const mime = file.type || ({mp4:'video/mp4',webm:'video/webm',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',avif:'image/avif'}[ext]);
    const path = `assets/editor/${crypto.randomUUID()}.${ext}`;
    files.set(path, {name:file.name, blob:file, type:mime});
    changeField({url:path, mime}); renderMedia(field);
    await saveDraft(); toast('Файл заменён в черновике');
  }
  async function confirmAction(title, body) {
    $('confirm-title').textContent = title; $('confirm-body').textContent = body;
    $('confirm-dialog').showModal();
    return new Promise(resolve => {
      const finish = answer => { $('confirm-dialog').close(); $('confirm-yes').onclick = null; $('confirm-no').onclick = null; $('confirm-dialog').oncancel = null; resolve(answer); };
      $('confirm-yes').onclick = () => finish(true); $('confirm-no').onclick = () => finish(false);
      $('confirm-dialog').oncancel = event => { event.preventDefault(); finish(false); };
    });
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function toDataURL(blob) { return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }
  async function backup() {
    const attachments = [];
    for (const [path, file] of usedFiles()) attachments.push({path, name:file.name, type:file.type, data:await toDataURL(file.blob)});
    download(new Blob([JSON.stringify({format:'caviar-most-wanted-draft',version:1,baseRevision:published.revision,state,files:attachments},null,2)],{type:'application/json'}),`most-wanted-draft-${new Date().toISOString().slice(0,10)}.json`);
    toast('Черновик скачан вместе с загруженными файлами');
  }
  async function importDraft(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== 'caviar-most-wanted-draft' || data.version !== 1 || !data.state?.overrides) throw new Error('Это не черновик редактора Most Wanted.');
      const validIDs = new Set(fields.map(field => field.id));
      if (Object.keys(data.state.overrides).some(id => !validIDs.has(id))) throw new Error('Черновик относится к другой структуре страницы.');
      if (!await confirmAction('Открыть черновик?', 'Текущие изменения будут заменены. Сначала скачайте их, если хотите сохранить отдельную копию.')) return;
      const importedFiles = new Map();
      for (const item of data.files || []) {
        if (!/^assets\/editor\/[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp|gif|avif|mp4|webm)$/.test(item.path) || typeof item.data !== 'string' || !/^data:(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm));base64,/.test(item.data)) throw new Error('Черновик содержит неподдерживаемый файл.');
        const response = await fetch(item.data); const blob = await response.blob();
        if (blob.size > 45 * 1048576) throw new Error('Файл в черновике превышает 45 МБ.');
        importedFiles.set(item.path, {name:item.name, type:blob.type, blob});
      }
      history.push(clone(state)); state = clone(data.state); files = new Map([...files, ...importedFiles]); applyPreview(); renderList(); if(activeID) select(activeID,false); await saveDraft(); toast('Черновик открыт');
    } catch (error) { fail(error); }
    finally { $('import-file').value = ''; }
  }
  async function exportHTML() {
    const doc = $('preview').contentDocument.cloneNode(true);
    doc.querySelectorAll('[data-editor-only],script[src*="content.js"],base').forEach(el => el.remove());
    doc.documentElement.classList.remove('caviar-editor-preview');
    doc.querySelectorAll('[data-editor-selected]').forEach(el => el.removeAttribute('data-editor-selected'));
    doc.querySelectorAll('dialog[open]').forEach(el => el.removeAttribute('open'));
    const base = doc.createElement('base'); base.href = landingURL.href; doc.head.prepend(base);
    const dataURLs = new Map();
    for (const [path, file] of usedFiles()) dataURLs.set(blobURLs.get(path), await toDataURL(file.blob));
    for (const el of doc.querySelectorAll('[src],[poster]')) for (const attribute of ['src','poster']) if(dataURLs.has(el.getAttribute(attribute))) el.setAttribute(attribute,dataURLs.get(el.getAttribute(attribute)));
    download(new Blob(['<!doctype html>\n'+doc.documentElement.outerHTML],{type:'text/html;charset=utf-8'}),'most-wanted-edited.html');
    toast('HTML скачан. Исходные медиа и оформление загружаются с опубликованного сайта.');
  }
  async function publish() {
    const token = $('github-token').value.trim(); if (!token) { $('github-token').focus(); return toast('Вставьте GitHub-токен для публикации.'); }
    busy = true; updateStatus(); $('confirm-publish').disabled = true; $('deployment-link').hidden = true;
    const progress = message => $('publish-progress').textContent = message;
    const api = async (path, method='GET', body) => {
      const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if ([401,403,404].includes(response.status)) throw new Error('GitHub не разрешил запись. Проверьте токен, репозиторий black_edition и разрешение Contents: Read and write.');
        throw new Error(`GitHub: ${data.message || response.status}. Черновик сохранён.`);
      }
      return data;
    };
    try {
      progress('Проверяем актуальную версию страницы…');
      const branch = await api('git/ref/heads/main');
      const head = branch.object.sha;
      const latestFile = await api(`contents/${folder}content.json?ref=${head}`);
      const latest = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(latestFile.content.replace(/\s/g,'')), char=>char.charCodeAt(0))));
      if (latest.revision !== published.revision) throw new Error('Страница уже изменена в другом редакторе. Скачайте текущий черновик и обновите редактор перед публикацией.');
      const commit = await api(`git/commits/${head}`);
      const entries = [];
      const pending = usedFiles();
      for (let index=0; index<pending.length; index++) {
        const [path, file] = pending[index]; progress(`Загружаем файл ${index+1} из ${pending.length}: ${file.name}`);
        const blob = await api('git/blobs','POST',{encoding:'base64',content:(await toDataURL(file.blob)).split(',')[1]});
        entries.push({path:folder+path,mode:'100644',type:'blob',sha:blob.sha});
      }
      const next = {version:1,revision:crypto.randomUUID(),updatedAt:new Date().toISOString(),overrides:clone(state.overrides)};
      entries.push({path:folder+'content.json',mode:'100644',type:'blob',content:JSON.stringify(next,null,2)+'\n'});
      progress('Сохраняем изменения в репозитории…');
      const tree = await api('git/trees','POST',{base_tree:commit.tree.sha,tree:entries});
      const saved = await api('git/commits','POST',{message:'Update Most Wanted content from visual editor',tree:tree.sha,parents:[head]});
      const fresh = await api('git/ref/heads/main');
      if (fresh.object.sha !== head) throw new Error('Во время публикации репозиторий обновился. Нажмите «Сохранить на GitHub» ещё раз. Черновик сохранён.');
      await api('git/refs/heads/main','PATCH',{sha:saved.sha,force:false});
      published = clone(next); state = clone(next); history = [];
      // Keep uploaded Blobs in the local draft until GitHub Pages deploys their paths.
      await saveDraft(); renderList(); updateStatus();
      progress('Изменения сохранены на GitHub. Посадочная обновится после сборки Pages, обычно через 1–2 минуты.');
      $('deployment-link').hidden = false; toast('Изменения отправлены на публикацию');
    } catch (error) { progress(error.message); await saveDraft(); }
    finally { busy = false; $('github-token').value = ''; $('confirm-publish').disabled = false; updateStatus(); }
  }
  async function init() {
    if (ready || initializing) return;
    initializing = true;
    try {
      cms = $('preview').contentWindow.CaviarContent;
      if (!cms) throw new Error('Не удалось загрузить посадочную. Обновите редактор.');
      await cms.ready;
      ready = true; fields = cms.fields; published = clone(cms.document); state = clone(published);
      try {
        database = await openDB(); const draft = await readDraft();
        if (draft?.state?.overrides) {
          files = new Map(draft.files || []);
          if (draft.baseRevision === published.revision) state = draft.state;
          else if (JSON.stringify(draft.state.overrides) !== JSON.stringify(published.overrides)) {
            if (await confirmAction('Найдён старый черновик', 'Опубликованная страница уже обновилась. Восстановить ваш черновик поверх неё? Можно отменить и загрузить опубликованную версию.')) state = {...clone(published), overrides:clone(draft.state.overrides)};
          }
        }
        $('save-status').textContent = 'Черновик сохранён в браузере';
      } catch { $('save-status').textContent = 'Скачайте копию черновика'; toast('Автосохранение недоступно. Скачивайте черновик перед закрытием.'); }
      applyPreview(); renderList();
      $('backup').disabled = false; $('download-html').disabled = false;
      const first = fields.find(field => field.element.closest('h1')); if (first) select(first.id,false);
    } catch (error) { $('save-status').textContent = 'Не удалось загрузить страницу'; fail(error); }
    finally { initializing = false; }
  }
  $('preview').addEventListener('load',init);
  if ($('preview').contentWindow?.CaviarContent) init();
  window.addEventListener('message',event => {
    if (event.origin !== location.origin || event.source !== $('preview').contentWindow) return;
    if (event.data?.type === 'caviar-select') select(event.data.id,false);
    if (event.data?.type === 'caviar-ready') init();
  });
  $('search').addEventListener('input', () => ready && renderList());
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(el=>el.classList.toggle('active',el===button));if(ready)renderList();}));
  document.querySelectorAll('[data-width]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-width]').forEach(el=>el.classList.toggle('active',el===button));$('preview-shell').classList.toggle('mobile',button.dataset.width==='mobile');}));
  $('text-value').addEventListener('input',()=>changeField({text:$('text-value').value}));
  $('media-alt').addEventListener('input',()=>changeField({alt:$('media-alt').value}));
  $('media-file').addEventListener('change',()=>upload($('media-file').files[0]).catch(fail));
  $('drop-zone').addEventListener('dragover',event=>{event.preventDefault();$('drop-zone').classList.add('drag');});
  $('drop-zone').addEventListener('dragleave',()=>$('drop-zone').classList.remove('drag'));
  $('drop-zone').addEventListener('drop',event=>{event.preventDefault();$('drop-zone').classList.remove('drag');upload(event.dataTransfer.files[0]).catch(fail);});
  $('apply-url').addEventListener('click',()=>{
    const url=$('media-url').value.trim();
    try { const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw new Error();if(/(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(parsed.hostname))return toast('Укажите прямую ссылку на MP4 или WebM.'); }
    catch { return toast('Укажите полный адрес файла, начиная с https://'); }
    changeField({url});renderMedia(fields.find(field=>field.id===activeID));
  });
  $('undo').addEventListener('click',()=>{if(busy||!history.length)return;state=history.pop();lastField='';applyPreview();renderList();if(activeID)select(activeID,false);scheduleSave();});
  $('revert-field').addEventListener('click',()=>{if(busy)return;lastField='';checkpoint();if(published.overrides[activeID])state.overrides[activeID]=clone(published.overrides[activeID]);else delete state.overrides[activeID];applyPreview();renderList();select(activeID,false);scheduleSave();});
  $('reset').addEventListener('click',async()=>{if(busy||!await confirmAction('Сбросить изменения?', 'Черновик вернётся к опубликованной версии. Вы сможете отменить сброс кнопкой «Отменить».'))return;history.push(clone(state));state=clone(published);applyPreview();renderList();if(activeID)select(activeID,false);await saveDraft();});
  $('backup').addEventListener('click',()=>backup().catch(fail));
  $('download-html').addEventListener('click',()=>exportHTML().catch(fail));
  $('import').addEventListener('click',()=>ready&&$('import-file').click());
  $('import-file').addEventListener('change',()=>importDraft($('import-file').files[0]));
  $('publish').addEventListener('click',()=>{$('publish-summary').textContent=`Будет изменено элементов: ${changedIDs().length}. Новых файлов: ${usedFiles().length}.`;$('publish-progress').textContent='';$('deployment-link').hidden=true;$('publish-dialog').showModal();});
  $('publish-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();else $('github-token').value='';});
  $('publish-dialog').querySelector('form').addEventListener('submit',event=>{if(busy)event.preventDefault();else $('github-token').value='';});
  $('confirm-publish').addEventListener('click',publish);
  window.addEventListener('pagehide',()=>{if(ready)saveDraft();});
  window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
})();
