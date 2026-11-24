import { tr, LANG, INTL, LOCALE, localizeCatalog } from './i18n.js';
import { sendGoalToMetrika } from './metrika.js';
// Grey prototype of the configurator: steps, state, build code, price, PNG specification.
import { PhoneScene } from './scene.js';
import { encode, decode, shrink, exportImageName } from './code.js';
import { applyRules, frameWindow, symbolSizeRange, frameOf, frameHasForm, plateForm, plaqueOf, plaqueSizeRange, plaqueYRange, symbolYRange } from './rules.js';
import { SIDES, loadFont, fit, sanitize as sanitizeSide } from './engrave.js';
import { normalize, esc, cleanPlaqueLine, PLAQUE_CHARS_HINT, screwMetals } from './normalize.js';

// loading and failure screen lives in index.html (audit, stage 4, B6); without 3D graphics the configurator does not start
const boot = window.__boot || { step() {}, done() {}, fail() {}, show() {}, isDone: () => true, NET: '' };
if (window.__noWebGL) await new Promise(() => {});
const getJson = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };
const cat = localizeCatalog(await getJson('data/catalog.5cdf68201f.json'));
// Analytics must never break the configurator: a failing goal call is ignored.
const goal = name => { try { sendGoalToMetrika(name); } catch (e) { console.warn(e); } };
goal('constructor_view');
const SE = cat.side_engraving; await loadFont(SE);                               // the engraving font is needed before the first measurement
const $ = s => document.querySelector(s);
// two customisation types (11.11.2026): full — the current configurator; light — only the back panel changes (no G10, camera plate, frame, insert)
// "Sample builds" — the first menu section, before "Model": a catalogue of ready-made designs right in the panel, without a pop-up window (owner's change 19.11.2026)
const STEPS_FULL = [
  ['ready', tr('Примеры сборок')], ['model', tr('Модель')], ['body', tr('Корпус')], ['g10', tr('Кант')], ['plate', tr('Блок камер')], ['frame', tr('Обрамление')],   // label "Rama" (frame) → "Obramlenie" (framing) (owner's decision 13.11.2026, customer-facing name of the frame section)
    // label "Plato" (plate) → "Blok kamer" (camera plate) (board sticker: customer-facing name, 13.11.2026)
  ['insert', tr('Вкладка')], ['symbol', tr('Символ')], ['plaque', tr('Табличка')], ['side', tr('Гравировка')], ['pack', tr('Упаковка')], ['summary', tr('Итог')],
];
const STEPS_LIGHT = [['ready', tr('Примеры сборок')], ['model', tr('Модель')], ['body', tr('Корпус')], ['panel', tr('Панель')], ['symbol', tr('Символ')], ['plaque', tr('Табличка')], ['side', tr('Гравировка')], ['pack', tr('Упаковка')], ['summary', tr('Итог')]];
let STEPS = STEPS_FULL;
const DEF = {
  model: 'PM', color: 'BK', storage: '256', wall: '1', g10: '1',
  // build on entry (owner's change 18.11.2026): camera plate "diamond grid · polished", frame "Adamant · polished", everything in black titanium,
  // insert — black alligator. Frame screws — "in the frame colour" (opts empty): the same black titanium as in the sample link
  plate: { id: '5', metal: 'TB' }, frame: { id: '15', metal: 'TB', opts: {} }, insert: '26',   // default insert: "Black alligator" (26, former working name "… · TXT 1"; the former "Black alligator" 25 was removed by the owner 20.11.2026)
  symbol: { id: '0', metal: 'GD', d: 24, x: 0, y: -25, base: { f: 'S', m: '0', e: '1' } }, plaque: { id: '0', metal: 'GD', font: '1', text: '', x: 0, y: 40 }, side: { l: '', r: '' }, pack: '0',
  mode: null, light: { mat: 'M', metal: 'GP', carbon: 'BK', satin: '1', tex: '0', laser: '0', lc: 'G', ec: '0' },
};
let st = structuredClone(DEF), step = 0, visited = new Set([0]), notes = [];
let symGroup = null, lastSym = null, packLid = false;   // packLid — case lid is closed (view only)                     // theme open in the symbols menu (UI only, not part of the build code)
const urlCode = new URLSearchParams(location.search).get('code');
// Last build (audit, stage 5, L13): the code is stored only in the customer's browser, for 30 days; the record appears after the first change to the build
const LAST = INTL ? `caviar18pro.${LANG}.last` : 'caviar18pro.last', LAST_DAYS = 30; let touched = false;
function saveLast(code) { if (!st.mode || !touched) return; try { localStorage.setItem(LAST, JSON.stringify({ code, t: Date.now() })); } catch {} }   // storage may be unavailable (private mode) — the configurator works without it too
function readLast() { try { const o = JSON.parse(localStorage.getItem(LAST) || 'null'); if (!o || typeof o.code !== 'string' || !(Date.now() - o.t < LAST_DAYS * 864e5)) return null;
    const r = decode(o.code, DEF); return r.ok && r.st.mode ? { code: o.code, t: o.t, st: r.st } : null; } catch { return null; } }
// open a build by code: the same check for the link, the "Build code" field and the saved build; if the code is not recognised the current build is left unchanged
function openCode(text) { const r = decode(text, DEF); if (!r.ok) return { ok: false, why: r.warn[0] || tr('это не код сборки') };
  st = r.st; touched = true; const sn = sanitize(st), fs = fitSides(), rr = applyRules(cat, st); notes = [...r.warn, ...sn, ...fs, ...rr.notes]; return { ok: true, notes: [...notes] }; }
// enamel-only base (Pobedonosets, zodiac): in the state and the code — always f 'E', otherwise the enamel colour does not get into the build code (13.11.2026)
const enamelOnly = s => { const B = cat.symbols.find(x => x.id === s.symbol.id)?.base; if (B?.finishes && !B.finishes.some(x => x.id === 'S')) s.symbol.base = { f: 'S', m: '0', e: '1', ...(s.symbol.base || {}), f: 'E' }; };
// single point where the state is brought in line with the catalogue (audit, stage 1): everything opened by code goes through it; returns the list of substitutions
function sanitize(s) { const ns = normalize(cat, s, DEF); enamelOnly(s); fixLight(s); return ns; }
let badUrlCode = null;                                                                              // the code from the link was not recognised — the reason
if (urlCode) { const r = decode(urlCode, DEF); if (r.ok) { st = r.st; touched = true; notes = [...r.warn, ...sanitize(st)]; } else badUrlCode = r.warn[0] || tr('это не код сборки'); }   // by code — straight into its own customisation type, skipping the start screen

const scene = new PhoneScene($('#gl'), cat);
if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) window.__scene = scene;   // for checks from the console — on the local machine only (stage 7, B4)
// loading and failures (audit, stage 4, B6)
boot.step(tr('Загружаем модель телефона…')); scene.ready.then(() => boot.done());
let busyTimer; scene.onBusy = on => { clearTimeout(busyTimer); if (on) busyTimer = setTimeout(() => { $('#busy').classList.add('on'); }, 350); else $('#busy').classList.remove('on'); };   // 19.11.2026: loading effect over the whole scene (class on — fade-in)   // short follow-up loads do not show the indicator
let errTimer; scene.onLoadError = () => { if (!boot.isDone()) { boot.fail(boot.NET); return; }
  clearTimeout(errTimer); errTimer = setTimeout(() => toast([tr('Не удалось загрузить часть деталей.'), tr('Проверьте соединение с интернетом и нажмите «Повторить». Ваша сборка сохранена.')], 60000, { label: tr('Повторить'), fn: () => scene.retry() }), 200); };
scene.onContextLost = () => boot.show(tr('Система выгрузила 3D-графику, чтобы освободить память. Ваша сборка сохранена — нажмите «Восстановить».'), tr('Восстановить'));
scene.onContextRestored = () => location.reload();
const metalName = id => (cat.metals.find(m => m.id === id) || {}).name;

// There is no undo in the UI (owner's change 15.11.2026). remember() marks that the build has been changed: from that moment it is saved for "Continue"
function remember() { touched = true; }
function commit(mutator, moved) {
  remember();
  mutator(st); const fs = fitSides(); const r = applyRules(cat, st, moved); notes = [...fs, ...r.notes]; render(false);
  if (fs.length) toast([...fs.map(t => t[0].toUpperCase() + t.slice(1) + (LANG === 'zh' ? '。' : '.')), tr('Проверьте надпись на шаге «Гравировка» или отмените изменение.')], 12000);   // L1: truncation does not happen silently
}
// engraving: the text is fitted to the area of its side (on the Pro the areas are shorter — on a model change the excess is cut off)
function fitSides() { st.side ??= { l: '', r: '' }; const out = [];
  for (const [s] of SIDES) { const old = st.side[s] || '', f = fit(SE, st.model, s, old); let t = f.text;
    if (t.trim() !== sanitizeSide(old).trim()) {                                   // does not fit (L1): cut at a whole word, with a message
      const full = sanitizeSide(old), midWord = full[t.length] && full[t.length] !== ' ' && !t.endsWith(' ');
      if (midWord && /\S\s+\S/.test(t)) t = t.replace(/\s+\S*$/, '');
      out.push(tr`гравировка на ${s === 'l' ? tr('левой') : tr('правой')} грани не помещается на ${cat.models[st.model].name}: «${old.trim()}» сокращена до «${t.trim()}»`); }
    st.side[s] = t; }
  return out; }
// start screen: choice of customisation type
function showStart(on) { if (on) renderStart(); else hintOnce(); $('#start').hidden = !on; document.body.classList.toggle('starting', on); if (on) $('#start').querySelector('[data-resume], [data-back], [data-mode]')?.focus(); }
// Switching the customisation type (audit, stage 5, L4): the build is not reset. Model, body, storage, symbol, nameplate and engraving are shared;
// the parts of each type are kept side by side in the state, so going back to the previous type brings its parts back too. The switch is undone with the ↶ button
function startMode(mode) { const was = st.mode; showStart(false); if (was === mode) return;
  if (was) remember(); st.mode = mode; STEPS = mode === 'light' ? STEPS_LIGHT : STEPS_FULL; step = 0; visited = new Set([0]);
  const r = applyRules(cat, st); notes = was ? r.notes : []; render(true);
  if (notes.length) toast([tr('Вид кастома изменён. Символ и табличка поставлены по правилам нового вида:'), ...notes], 12000); }
// Minimum price of a customisation type for the start screen (L12): the catalogue is iterated with the same calculation as the build price; prices are test values
const minCache = {};
function minPrice(mode) { if (mode in minCache) return minCache[mode]; const keep = st; let best = Infinity;
  const cost = () => { const p = price(); return p.missing.length || !Number.isFinite(p.total) ? Infinity : p.total; };
  try { const sto = [...cat.storage].sort((a, b) => (a.price || 0) - (b.price || 0))[0].id;
    for (const model of Object.keys(cat.models)) { const base = () => { const s = structuredClone(DEF); s.mode = mode; s.model = model; s.storage = sto; s.symbol.id = '0'; s.plaque.id = '0'; return s; };
      if (mode === 'light') { for (const mat of LT.materials) for (const mt of mat.id === 'C' ? [null] : LT.metals) { st = base(); st.light.mat = mat.id; if (mt) st.light.metal = mt.id; st.light.tex = '0'; st.light.laser = '0'; fixLight(st); best = Math.min(best, cost()); } continue; }
      const ins = [...cat.inserts].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0].id;
      for (const form of Object.keys(cat.forms)) { const pls = cat.plates.filter(p => (p.form || 'emperor') === form && !p.hidden), frs = cat.frames.filter(f => frameHasForm(f, form) && !f.hidden); if (!pls.length || !frs.length) continue;
        // the costs of the camera plate and the frame add up, so the minimum is searched in turn: first the camera plate, then the frame
        let bp = null, bv = Infinity; for (const p of pls) for (const m of cat.metals) { st = base(); st.insert = ins; st.frame = { id: frs[0].id, metal: st.frame.metal, opts: {} }; st.plate = { id: p.id, metal: m.id }; const v = cost(); if (v < bv) { bv = v; bp = st.plate; } }
        if (!bp) continue;
        for (const f of frs) for (const m of cat.metals) { st = base(); st.insert = ins; st.plate = { ...bp }; st.frame = { id: f.id, metal: m.id, opts: {} }; best = Math.min(best, cost()); } } }
  } catch (e) { console.error(e); } finally { st = keep; }
  return minCache[mode] = best; }
// Start screen (L12, L13): cards of the customisation types with an image and a "from" price; saved build — "Continue"
const MODES = [['light', tr('Лёгкий кастом'), tr('Меняется только керамическая панель спинки: металл с сатином, фактурой или лазерной гравировкой либо карбон. Символ, табличка и гравировка на гранях.')],
  ['full', tr('Полный кастом'), tr('Полная сборка спинки: кант, блок камер, обрамление, вкладка, символ, табличка и гравировка на гранях.')]];
// Redesign 21.11.2026 (owner's change: "put these images in and design the page in the style of the Rolls-Royce website"): black screen,
// two full-height halves, each with a promo shot of that customisation type (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/start/<type>.avif, 1600 px, and <type>_900.avif for
// phones), on top — a number, the name in thin letter-spaced capitals, a description and an outline button. The whole half is clickable.
// The former rotation of sample renders (19.11.2026) has been removed.
function renderStart() { const cur = st.mode, last = cur ? null : readLast();
  const when = t => new Date(t).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });
  const foot = last ? tr`<div class="st-foot"><span><b>Продолжить сборку</b><small>${esc(cat.models[last.st.model]?.name || '')} · ${last.st.mode === 'light' ? tr('лёгкий') : tr('полный')} кастом · сохранена ${when(last.t)}</small></span><button type="button" data-resume>Продолжить</button></div>`
    : cur ? tr('<div class="st-foot"><span><small>Сборка не сбрасывается: модель, корпус, память, символ, табличка и гравировка сохраняются.</small></span><button type="button" class="back" data-back>Вернуться к сборке</button></div>') : '';
  $('#start').innerHTML = tr`<div class="start-in${foot ? ' has-foot' : ''}">
    <div class="st-head" aria-hidden="true"><img src="assets/logo.svg" alt="" width="61" height="40"><span>Конструктор iPhone 18 Pro</span></div>
    <div class="sp-cols">${MODES.map(([id, name, text], k) => { const mp = PRICE_ON ? minPrice(id) : NaN;
      return tr`<section class="sp${cur === id ? ' cur' : ''}" data-m="${id}">
        <img class="sp-bg" src="https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/start/${id}.avif" srcset="https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/start/${id}_900.avif 900w, https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/start/${id}.avif 1600w" sizes="(max-width:700px) 100vw, 50vw" alt="" width="1600" height="1600" fetchpriority="high">
        <div class="sp-tx"><small class="sp-num">0${k + 1}</small><h2>${name}</h2><p>${text}</p>${Number.isFinite(mp) ? tr`<i class="sp-price">от ${fmt(mp)}<small>цена тестовая</small></i>` : ''}
          <button type="button" class="sp-open" data-mode="${id}" aria-label="${name}: открыть">${cur === id ? tr('Продолжить') : tr('Открыть')}</button></div></section>`; }).join('')}</div>
    ${foot}</div>`; }
// E11: the panel is re-rendered in full — remember where keyboard focus was and return it to the same element
function focusKey() { const a = document.activeElement; if (!a || !$('#panel').contains(a)) return null; const d = a.dataset, q = v => CSS.escape(v);
  return a.id ? '#' + q(a.id) : d.set ? `[data-set="${q(d.set)}"][data-v="${q(d.v)}"]` : d.symgrp ? `[data-symgrp="${q(d.symgrp)}"]` : d.lid ? `[data-lid="${q(d.lid)}"]` : null; }
function render(refocus = true) {
  STEPS = st.mode === 'light' ? STEPS_LIGHT : STEPS_FULL; step = Math.min(step, STEPS.length - 1);
  scene.build(st); if (refocus) scene.focus(STEPS[step][0]); navForStep(STEPS[step][0]);
  $('#title').textContent = cat.models[st.model].name;
  const code = encode(st); showCode(code); $('#price').textContent = priceText();
  $('#tabs').innerHTML = STEPS.map(([k, n], i) => `<button data-i="${i}" class="${i === step ? 'on' : ''} ${visited.has(i) && i !== step ? 'done' : ''}"${i === step ? ' aria-current="step"' : ''}>${n}</button>`).join('');
  $('#tabs').querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  // board fix 3 of 14.11.2026 ("nothing is shown in Summary"): an error in the panel does not leave the previous step's panel on screen
  const fk = focusKey();
  try { $('#panel').innerHTML = panel(STEPS[step][0]); } catch (e) { console.error(e); $('#panel').innerHTML = tr('<p class="muted">Не удалось показать этот раздел. Обновите страницу.</p>'); }
  if (fk) $('#panel').querySelector(fk)?.focus({ preventScroll: true });
  $('#ptitle').textContent = STEPS[step][1];
  // step list as in the reference configurator ("Fixes" board 14.11.2026, fix 1): no numbers, items with dividers
  $('#stepList').innerHTML = STEPS.map(([k, n], i) => `<button data-i="${i}" class="${i === step ? 'on' : ''}${visited.has(i) && i !== step ? ' done' : ''}"${i === step ? ' aria-current="step"' : ''}><span><b>${n}</b></span></button>`).join('');   // owner's change 17.11.2026: captions (the selection) under the step headings removed — names only
  if (STEPS[step][0] === 'summary') prepSpec();
  fitSheet();
  const u = new URL(location); if (st.mode) u.searchParams.set('code', shrink(code)); else u.searchParams.delete('code'); window.history.replaceState(null, '', u);   // the address holds the short code (19.11.2026)   // until a customisation type is chosen the code is not written to the address
}
const fmt = v => Math.round(v).toLocaleString(LOCALE) + ' ' + cat.currency;
// price for the UI: a calculation failure does not leave the previous build's price on screen and does not abort rendering
function safePrice() { try { return price(); } catch (e) { console.error(e); return { lines: [], total: NaN, missing: [tr('расчёт стоимости')] }; } }
// The price is not shown (owner's change 18.11.2026 "remove the price calculation, show Price on request instead"): the price() calculation and catalogue prices
// are kept; PRICE_ON = true brings them back to the screen, the specification and the enquiry
const PRICE_ON = false, PRICE_ASK = tr('Цена по запросу');
const priceText = () => { if (!PRICE_ON) return PRICE_ASK; const p = safePrice(); return Number.isFinite(p.total) ? fmt(p.total) : '—'; };
// a line without a price is a catalogue error (audit, T10): logged to the console once and added to the "no price" list on the "Summary" step
const noPriceSeen = new Set();
const noPrice = name => { if (!noPriceSeen.has(name)) { noPriceSeen.add(name); console.error(tr('Каталог: нет цены — ') + name); } };
// message on top of the UI: the result of opening a code is visible on any step; the text is set via textContent
let toastTimer;
function toast(lines, ms = 9000, action = null) { let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); t.title = tr('Нажмите, чтобы скрыть'); t.onclick = () => { t.hidden = true; }; document.body.append(t); }
  t.replaceChildren(...[].concat(lines).map(x => { const p = document.createElement('p'); p.textContent = x; return p; }));
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.onclick = action.fn; t.append(b); }   // a click hides the message (handler on #toast)
  t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms); }

// ---------- price (test): base + storage + metal by weight + labour + materials ----------
function price() {
  const m = cat.models[st.model], d = cat.dims, win = frameWindow(cat, st), lines = [], missing = [];
  const add = (name, v) => { if (v == null || !Number.isFinite(v)) { missing.push(name); noPrice(name); return; } if (v) lines.push([name, v]); };
  const w = (vol, metal) => { const mt = cat.metals.find(x => x.id === metal); const g = vol / 1000 * mt.density; return [g, g * mt.price_g]; };
  add(tr('База ') + m.name, cat.base_price[st.model]); add(tr('Память'), (cat.storage.find(s => s.id === st.storage) || {}).price);
  if (st.mode === 'light') { for (const [a, b] of lightLines()) add(a, b); }
  else {
  const [px0, py0, px1, py1] = m.plate; const plateVol = ((px1 - px0) * (py1 - py0) * 0.92 - 3 * Math.PI * (d.lens_ring / 2) ** 2) * (d.frame_t + d.plate_t);
  const pl = cat.plates.find(x => x.id === st.plate.id); const [pg, pc] = w(pl.volume_mm3?.[st.model] ?? plateVol, st.plate.metal);   // for an asset camera plate — the volume of the real mesh
  add(tr`Блок камер «${plateTitle(pl)}», ${metalName(st.plate.metal)}`, pc + pl.work); void pg;          // owner's change: only the part and the cost
  const [fx0, fy0, fx1, fy1] = m.frame; const frameVol = ((fx1 - fx0) * (fy1 - fy0) - (win.x1 - win.x0) * (win.y1 - win.y0)) * d.frame_t;
  const fr = frameOf(cat, st); const [fg, fc] = w(fr.volume_mm3?.[st.model] ?? frameVol, st.frame.metal);   // for an asset frame — the volume of the real mesh
  add(tr`Обрамление «${fr.name}», ${metalName(st.frame.metal)}`, fc + fr.work); void fg;
  for (const o of fr.options) {
    const v = (st.frame.opts || {})[o.id] || '0';
    if (o.metal_of) { const mid = v !== '0' ? v : st.frame.metal;   // frame part: mass from volume and metal (a part variant has its own volume)
      const vol = (o.variant_volume?.[(st.frame.opts || {})[o.variant_opt] || '0'] ?? o.volume_mm3)?.[st.model] ?? 0;
      if (vol) add(`${o.part_name || o.name}, ${metalName(mid)}`, w(vol, mid)[1] + (o.work || 0)); }
    else if (o.carbon_of) continue;   // the part's carbon colour is included in the price of the part itself ("Carbon" bezel)
    else if (v !== '0') { const ov = o.values.find(x => x.id === v) || {}; add(`${o.name}: ${ov.name || v}`, ov.price ?? o.price); } }
  if (fr.window_panels) { const l = wpLine(); if (l) add(...l); }
  { const ins = cat.inserts.find(x => x.id === st.insert) || {}; add(tr`Вкладка «${ins.name || ''}»`, ins.price); }
  }
  { const pk = (cat.packs || []).find(x => x.id === st.pack); if (pk?.price) add(tr`Упаковка «${pk.short}»`, pk.price); }   // packaging surcharge (currently both are included in the cost)
  for (const [s, n] of SIDES) if ((st.side?.[s] || '').trim()) add(tr`Боковая гравировка, ${n.toLowerCase()}: «${st.side[s].trim()}»`, SE.price);
  if (st.symbol.id !== '0') { const sy = cat.symbols.find(x => x.id === st.symbol.id); if (!sy.custom) { const ks = st.symbol.d / (sy.asset_h || 1);   // for an asset symbol — the reference volume, × k² along X, Y and × min(1, k) along Z
    const [sg, sc] = w(sy.volume_mm3 ? sy.volume_mm3 * ks * ks * Math.min(1, ks) : Math.PI * (st.symbol.d / 2) ** 2 * d.symbol_t, st.symbol.metal); add(tr`Символ «${sy.name}», ${metalName(st.symbol.metal)}`, sc + sy.work); void sg;
    if (sy.base?.finishes && sb().f === 'E' && !(sy.base.recolor && !sy.base.enamel_price)) add(tr`Основа символа: ${symbolBaseName(sy)}`, sy.base.enamel_price); } }
  if (st.plaque.id !== '0') { const pq = plaqueOf(cat, st); const [qg, qc] = w(pq.volume_mm3 ? pq.volume_mm3 * pq.k * pq.k : pq.w * pq.h * d.plaque_t, st.plaque.metal); add(tr`Табличка «${pq.name}», ${metalName(st.plaque.metal)}`, qc + pq.work); void qg; }   // nameplate size: volume × k² (thickness unchanged)
  return { lines, total: lines.reduce((s, l) => s + l[1], 0), missing };
}

// ---------- light customisation: back panel ----------
const LT = cat.light, byId = (list, id) => list.find(x => x.id === id);
function lightDesc() { const o = st.light; if (o.mat === 'C') return [[tr('Панель'), tr`Карбон · ${byId(LT.carbon.colors, o.carbon)?.name}`]];
  const r = [[tr('Панель'), tr`Металл · ${metalName(o.metal)}`]], tx = byId(LT.textures, o.tex), sa = byId(LT.satin, o.satin), lz = byId(LT.lasers, o.laser);
  if (tx) r.push([tr('Фактура'), tx.name]); r.push([tr('Отделка'), sa ? tr`Сатин ${sa.name.toLowerCase()}` : tr('Глянец')]);
  if (tx && tx.overlay) r.push([tr('Эмаль'), byId(LT.enamel_colors, o.ec)?.name], [tr('Гравировка'), byId(LT.laser_colors, o.lc)?.name]);
  if (!tx && lz) r.push([tr('Лазерная гравировка'), `${lz.name} · ${byId(LT.laser_colors, o.lc)?.name.toLowerCase()}`]);
  return r; }
function lightLines() { const o = st.light, out = [];
  if (o.mat === 'C') { out.push([tr`Панель: карбон, ${byId(LT.carbon.colors, o.carbon)?.name.toLowerCase()}`, LT.carbon.price]); return out; }
  out.push([tr`Панель: ${metalName(o.metal)}`, byId(LT.metals, o.metal)?.price]);
  const tx = byId(LT.textures, o.tex), sa = byId(LT.satin, o.satin), lz = byId(LT.lasers, o.laser);
  if (tx) out.push([tr`Фактура «${tx.name}»`, tx.price]); if (sa) out.push([tr`Сатин «${sa.name}»`, sa.price]);
  if (!tx && lz) out.push([tr`Лазерная гравировка «${lz.name}»`, lz.price]);
  return out; }
// panel finish (board fix 2 of 15.11.2026): satin is vertical only ('1') or polished ('0'); without a texture — satin only
// owner's changes 17.11.2026: laser engraving — only on the LT.laser_metals metals (titanium), on gold plating the laser is removed;
// a texture with no_gloss ("Sunrise rays") — satin only; hidden textures (Damascus, Royal damascus) are not shown in the menu,
// but old codes containing them open as is
// (function declarations over cat.light: fixLight is called when loading by code before LT and byId are declared)
function laserOk(o) { const L = cat.light; return o.mat !== 'C' && (L.laser_metals || L.metals.map(m => m.id)).includes(o.metal); }
function fixLight(s) { const o = s.light; if (!o) return; if (o.satin !== '0') o.satin = '1'; if (o.tex === '0') o.satin = '1';
  if ((cat.light.textures.find(x => x.id === o.tex) || {}).no_gloss) o.satin = '1';
  // a texture moved to laser (17.11.2026, "Skull": moved_to_laser): an old link opens with the laser pattern
  const mv = (cat.light.textures.find(x => x.id === o.tex) || {}).moved_to_laser; if (mv) { o.tex = '0'; o.satin = '1'; o.laser = mv; }
  // a texture limited to its own metals (owner's change 21.11.2026: "Dark roses" — titanium and black titanium only, textures[].metals):
  // on another metal (gold plating) the texture is removed — the panel is smooth
  if (o.mat !== 'C' && !texOk(cat.light.textures.find(x => x.id === o.tex), o.metal)) { o.tex = '0'; o.satin = '1'; }
  if (o.mat !== 'C' && !laserOk(o)) o.laser = '0'; }
function texOk(t, metal) { return !t || !t.metals || t.metals.includes(metal); }
function panelLight() { const o = st.light, none = (path, on, label) => chip(on, label, `data-set="${path}" data-v="0"`);
  let h = tr`<h4>Материал панели</h4>${cards(LT.materials.map(x => card(x.id === o.mat, x.name, x.id === 'C' ? tr`${LT.carbon.colors.length} цветов` : tr`${LT.metals.length} металла · сатин, фактура, лазер`, `data-set="light.mat" data-v="${x.id}"`, x.id === 'C' ? '#1b1b1d' : MET('#dcb978'))))}`;
  if (o.mat === 'C') return h + `${subH(tr('Цвет карбона'))}<div class="chips">${LT.carbon.colors.map(c => chip(c.id === o.carbon, c.name, `data-set="light.carbon" data-v="${c.id}"`, c.icon ? `url(${c.icon}) center/cover` : c.leaf ? `linear-gradient(135deg,${c.hex} 55%,${c.leaf})` : c.hex)).join('')}</div>`;
  // hierarchy as for the camera plate in full customisation (board fix 2 of 15.11.2026): metal → texture → finish (vertical satin or polished;
  // without a texture — satin only) → laser. Metal swatches are 3D: without a texture — the "smooth · satin" camera plate disc, with a texture — the 3D panel of the texture
  const tx = o.tex !== '0', tex = byId(LT.textures, o.tex);
  const MSW = m => tex ? `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/light/${tex.kind}_${m}.avif?v=g2) center/cover` : `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/plate/plain_${o.satin === '0' ? 'gloss' : 'satin'}_${m}.avif?v=p5) center/cover`;
  h += `${subH(tr('Металл'))}<div class="chips">${LT.metals.map(x => { const mt = byId(cat.metals, x.id); return chip(x.id === o.metal, mt.name, `data-set="light.metal" data-v="${x.id}"`, MCOIN(x.id)); }).join('')}</div>`;
  const fsw = gloss => tex ? `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/light/${tex.kind}_${o.metal}.avif?v=g2) center/cover` : `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/plate/plain_${gloss ? 'gloss' : 'satin'}_${o.metal}.avif?v=p5) center/cover`;
  // metal finish goes above the texture (owner's change 17.11.2026): metal → finish → texture → laser
  h += tx && tex.no_gloss ? only(tr('Отделка'), tr('Сатин')) : tx ? `${subH(tr('Отделка · ') + tex.name)}<div class="chips">${chip(o.satin !== '0', tr('Сатин'), `data-set="light.satin" data-v="1"`, FINU('satin'))}${chip(o.satin === '0', tr('Глянец'), `data-set="light.satin" data-v="0"`, FINU('gloss'))}</div>` : only(tr('Отделка'), tr('Сатин'));
  h += tr`<h4>Фактура</h4><div class="chips">${chip(!tx, tr('Гладкая'), `data-set="light.tex" data-v="0"`, FLATSW(''))}${LT.textures.filter(x => !x.hidden || x.id === o.tex).map(x => { const sw = FLATSW(x.kind) || `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/light/${x.kind}_${texOk(x, o.metal) ? o.metal : x.metals[0]}.avif?v=g2) center/cover`;
    return texOk(x, o.metal) ? chip(x.id === o.tex, x.name, `data-set="light.tex" data-v="${x.id}"`, sw) : chip(false, x.name, tr`disabled title="только на титане: ${x.metals.map(m => byId(cat.metals, m).name.toLowerCase()).join(', ')}"`, sw); }).join('')}</div>`;   // texture swatches — from the 3D panels (14.11.2026) in the current metal
  // texture with colour layers (16.11.2026, "Dark roses"; owner's change: above laser engraving): the enamel colour of the roses and the engraving colour of the branches and leaf outlines
  if (tx && tex.overlay) h += tr`<h4>Цвет эмали</h4><div class="chips">${LT.enamel_colors.map(c => chip(c.id === o.ec, c.name, `data-set="light.ec" data-v="${c.id}"`, ESW(c.hex, o.metal))).join('')}</div>`
    + tr`<h4>Цвет гравировки</h4><div class="chips">${LT.laser_colors.map(c => chip(c.id === o.lc, c.name, `data-set="light.lc" data-v="${c.id}"`, c.hex)).join('')}</div>`;
  if (!laserOk(o)) return h + tr`<p class="muted">Без фактуры панель сатинированная. Лазерная гравировка доступна только на титане.</p>`;   // gilding — no laser (17.11.2026)
  h += tr`<h4>Лазерная гравировка</h4><div class="chips">${none('light.laser', o.laser === '0' || tx, tr('Без гравировки'))}${LT.lasers.map(x => chip(!tx && x.id === o.laser, x.name, `data-set="light.laser" data-v="${x.id}"`, `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/laser/${x.kind}.avif?v=c1) center/cover`)).join('')}</div>`;
  if (!tx && o.laser !== '0') h += tr`<h4>Цвет лазерного рисунка</h4><div class="chips">${LT.laser_colors.map(c => chip(c.id === o.lc, c.name, `data-set="light.lc" data-v="${c.id}"`, c.hex)).join('')}</div>`;
  return h + tr`<p class="muted">Без фактуры панель сатинированная, лазерную гравировку можно добавить поверх сатина. С фактурой — сатин или глянец, лазер снимается.</p>`; }

// insert groups (level 1 of the "Insert" menu)
// insert groups (owner's change 16.11.2026): Metal, Carbon, Alligator, Calf, Python; calf — smooth, fine-grain and
// coarse-grain leather (types smooth, fine, pebbled); strip — the group word that is removed from the swatch caption
// Words cut from catalogue names in swatch captions, in the language of the page.
const V_SATIN = ' · ' + tr('вертикальный сатин'), ZODIAC = tr('Зодиак') + ' · ', ENAMEL = tr('эмаль');
const INSERT_GROUPS = [{ types: ['metal'], name: tr('Металл'), sub: tr('Металл · вертикальный сатин') }, { types: ['carbon'], name: tr('Карбон') },
  { types: ['croc'], name: tr('Аллигатор'), strip: { en: /\s*alligator$/i, zh: new RegExp(tr('Аллигатор')) }[LANG] || /^Аллигатор\s*/ }, { types: ['smooth', 'fine', 'pebbled'], name: tr('Телёнок') }, { types: ['python'], name: tr('Питон'), strip: { en: /^Python\s*/, zh: new RegExp(tr('Питон')) }[LANG] || /^Питон\s*/ }];
// "Metal" insert (16.11.2026, "Palmette"): pattern (smooth with vertical satin / palmette) → for a pattern, the finish (satin / polished) →
// metal. Each combination is its own catalogue insert (the build code holds the insert number); the switches pick an insert with the same metal
// finish of the metal insert chosen by the user (owner's change 18.11.2026 "when choosing textures, polished resets to satin"):
// on a pattern change it is used if the new pattern has that finish; "Smooth" exists in satin only and does not overwrite the choice
let insFin = 'satin';
function metalIns(g, cur, isw) {
  const pat = cur.pattern || '', fin = cur.finish || 'satin', find = (p, f, m) => g.items.find(x => (x.pattern || '') === p && (x.finish || 'satin') === f && x.metal === m) || g.items.find(x => (x.pattern || '') === p && (x.finish || 'satin') === f);
  // patterns from the light customisation textures (17.11.2026): the caption is the insert's pattern_name (keys ins_<texture>)
  const pats = [...new Set(g.items.map(x => x.pattern || ''))], PN = { '': tr('Гладкая'), palmette: tr('Ривьера'), ...Object.fromEntries(g.items.filter(x => x.pattern_name).map(x => [x.pattern, x.pattern_name])) };
  // 3D swatches (owner's change 17.11.2026 "this section needs 3D metal swatches"): pattern — a coin of the pattern in the metal,
  // smooth — a satin coin in the metal (like the camera plate swatches), not a flat gradient
  const PS = (p, f, m) => p ? `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/plate/${p}_${f}_${m}.avif?v=p5) center/cover` : SATIN(m);
  const fins = [...new Set(g.items.filter(x => (x.pattern || '') === pat).map(x => x.finish || 'satin'))];
  if (fins.length > 1) insFin = fin;
  // patterns — round swatches with a caption, like "Texture" of the camera plate (owner's change 18.11.2026), without the "engraving" / "vertical satin" captions
  let h = pats.length > 1 ? `${subH(tr('Узор'))}<div class="chips">${pats.map(p => { const x = find(p, p === pat ? fin : insFin, cur.metal) || find(p, 'satin', cur.metal); return chip(p === pat, PN[p] || p, `data-set="insert" data-v="${x.id}"`, FLATSW(p) || PS(p, x.finish || 'satin', cur.metal)); }).join('')}</div>` : '';
  if (fins.length > 1) h += `${subH(tr('Отделка'))}<div class="chips">${fins.map(f => { const x = find(pat, f, cur.metal); return chip(f === fin, f === 'gloss' ? tr('Глянец') : tr('Сатин'), `data-set="insert" data-v="${x.id}"`, FINU(f) || PS(pat, f, cur.metal)); }).join('')}</div>`;
  const ms = g.items.filter(x => (x.pattern || '') === pat && (x.finish || 'satin') === fin);
  return h + `${subH(tr('Металл'))}<div class="chips">${ms.map(x => chip(x.id === cur.id, metalName(x.metal), `data-set="insert" data-v="${x.id}"`, MCOIN(x.metal))).join('')}</div>`; }
// ---------- step panels ----------
// menu with swatches (11.11.2026, following the logic of the Zodiac configurator): level 1 — group cards (icon, name, caption),
// level 2 — "↳ subsection" with round swatches and a caption; the selected one has a border and a tick; at the bottom — the selection card.
// Icons are placeholders for now (colour, metal, texture or a letter); finished icons — the icon key of the catalogue item (path to the image)
const ICON = (sw, label) => sw === 'none' ? '<i class="ic none"></i>' : sw ? `<i class="ic" style="background:${sw}"></i>` : `<i class="ic ph">${(String(label).replace(/<[^>]+>/g, '').trim()[0] || '·')}</i>`;
// metal coins in the style of the Zodiac configurator (owner's change 17.11.2026): a guilloché rosette with a trim, for gold plating —
// a gold/titanium diagonal (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/metal/<ID>.avif, tools/zodiac_style_swatches.py). The metal selection circles in all steps are these coins,
// the card of the selected part at the bottom of the step still shows the part itself
const MCOIN = m => `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/metal/${m}.avif?v=z2) center/cover`;
// universal flat texture swatches in all sections (owner's change 18.11.2026): insert patterns (ins_<…>) and light customisation textures
// (kind) — the same drawings as the camera plate textures; flat swatch https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/plate_flat/<camera plate texture>. Not in the map (ogives, dark roses) — the former swatch
const FLAT = { '': 'plain', rays: 'sunrise', weave: 'weave', waves: 'waves', diamond: 'diamond', palmette: 'palmette', deco_arrows: 'deco_arrows', leaves: 'leaves',
  deco_fans: 'deco_fans', rings: 'rings', ibeam: 'ibeam', hexweave: 'hexweave', octagons: 'octagons' };
const FLATSW = k => { const t = FLAT[String(k || '').replace(/^ins_/, '')]; return t ? `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/plate_flat/${t}.avif?v=f1) center/cover` : null; };
// universal finish swatches (satin — vertical brushing, polished — mirror), owner's change 18.11.2026: "for all options that offer a satin/polished choice"
const FINU = f => ['satin', 'gloss'].includes(f) ? `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/finish/${f}.avif?v=g1) center/cover` : null;
const SATIN = m => `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/plate/plain_satin_${m}.avif?v=p5) center/cover`;   // satin sample in the metal (stage 7, E1)
const swOf = (x, fb) => x && x.icon ? `url(${x.icon}) center/cover` : fb;
const MET = hex => `radial-gradient(circle at 32% 28%, rgba(255,255,255,.55), rgba(255,255,255,0) 46%), linear-gradient(145deg, ${hex}, ${hex} 55%, rgba(0,0,0,.35))`;
// 3D enamel swatch (15.11.2026): a dome of glossy enamel in a setting of the part's metal — https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/enamel/<hex>_<metal>.avif
// (tools/render_enamel_swatches.py); a new colour without a swatch — a flat colour under the image
// Zodiac-style enamel (17.11.2026): a glossy enamel disc over guilloché, a glass highlight (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/enamel_z/<hex>.avif) — independent of the metal
const ESW = (hex, metal) => `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/enamel_z/${hex.replace('#', '').toLowerCase()}.avif?v=z1) center/cover, ${hex}`;
const chip = (on, label, attrs, sw) => `<button class="sw ${on ? 'on' : ''}" aria-pressed="${!!on}" ${attrs}><span class="icw">${ICON(sw, label)}</span><span class="lb">${label}</span></button>`;
const card = (on, label, sub, attrs, sw, off) => `<button class="card ${on ? 'on' : ''}${off ? ' off' : ''}${sw === false ? ' noic' : ''}" aria-pressed="${!!on}" ${off ? 'disabled' : attrs}>${sw === false ? '' : `<span class="icw">${ICON(sw, label)}</span>`}<span class="tx"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span></button>`;
// font swatch (board fix 5 of 15.11.2026): in the circle — the letter "A" in the font's typeface, under the circle — the name only
const chipF = (on, label, attrs, css) => `<button class="sw ${on ? 'on' : ''}" aria-pressed="${!!on}" ${attrs}><span class="icw"><i class="ic tx"><b style="font-family:${css.replace(/"/g, "'")};font-size:22px;font-weight:400;letter-spacing:0">A</b></i></span><span class="lb">${label}</span></button>`;
// text swatch (storage, board 13.11.2026 "write the capacity name inside the swatches"): the number and unit inside the circle, no caption under it
const chipT = (on, label, attrs) => { const [v, u] = String(label).split(' '); return `<button class="sw ${on ? 'on' : ''}" aria-pressed="${!!on}" ${attrs} aria-label="${label}" title="${label}"><span class="icw"><i class="ic tx"><b>${v}</b>${u ? `<small>${u}</small>` : ''}</i></span></button>`; };
const cards = a => `<div class="cards">${a.join('')}</div>`;
const subH = s => `<h4 class="subh">↳ ${s}</h4>`;
// group with a single option (audit, stage 5, L11): nothing to choose from — a line with the value instead of a button
// camera plate name built from the shape, texture and finish names (copy for the "Camera plate" step, 17.11.2026): "Straight · diamond grid · polished"
// symbol size (19.11.2026, "Range Rover" medallion): d — the diameter, and for wide medallions (size: 'width' in the catalogue) — the width
const symSz = sy => sy.size === 'width' ? { label: tr('Ширина'), pre: tr('ширина ') } : { label: tr('Диаметр'), pre: 'Ø ' };
function plateTitle(pl) { const lc = x => (x || '').toLowerCase();
  return `${(cat.forms[pl.form || 'emperor'] || {}).name || ''} · ${lc((cat.plate_textures.find(t => t.id === pl.texture) || {}).name)} · ${lc((cat.finishes.find(f => f.id === pl.finish) || {}).name)}`; }
const only = (title, value) => `<div class="only"><span>${title}</span><b>${value}</b></div>`;
const detail = (sw, title, text) => `<div class="detail"><span class="icw">${ICON(sw, title)}</span><div><b>${title}</b>${text ? `<p>${text}</p>` : ''}</div></div>`;
// frame option "part metal" (metal_of): In the frame colour + the catalogue metals
// screws (metal_of SCREW) — only the metals of the frame's group (screwMetals, owner's change 18.11.2026)
const optValues = o => o.carbon_of ? WP_CARBONS.map(x => ({ id: x.id, name: x.name, hex: x.hex })) : o.metal_of ? [{ id: '0', name: tr('В цвет обрамления') }, ...cat.metals.filter(m => o.metal_of !== 'SCREW' || screwMetals(cat, st.frame.metal).includes(m.id)).map(m => ({ id: m.id, name: m.name, hex: m.hex }))] : o.values;
const metals = (path, cur, title = tr('Металл'), sw) => `<h4>${title}</h4><div class="chips">${cat.metals.map(m => chip(m.id === cur, m.name, `data-set="${path}" data-v="${m.id}"`, MCOIN(m.id))).join('')}</div>`;   // sw — swatch for the current texture (frame, 13.11.2026)
const mmf = v => String(v).replace('.', INTL ? '.' : ',');
const mm1 = v => (+v).toFixed(1).replace('.', INTL ? '.' : ',') + tr(' мм');                          // size in the caption: one digit after the decimal point
const range = (path, label, v, a, b, stp, moved) => `<div class="row"><label for="rg_${path.replace('.', '_')}">${label}</label><input type="range" id="rg_${path.replace('.', '_')}" min="${a}" max="${b}" step="${stp}" value="${v}" data-range="${path}" data-moved="${moved}" aria-valuetext="${mm1(v)}"><output>${mm1(v)}</output></div>`;
function panel(k) {
  const n = notes.length ? notes.map(t => `<div class="note">${esc(t)}</div>`).join('') : '';
  // board 13.11.2026 "remove the swatches, write an explanation below": model cards without swatches, under them — what is chosen here
  if (k === 'ready') return panelReady();
  if (k === 'model') return tr`<h4>Модель</h4>${cards(Object.entries(cat.models).map(([id, m]) => card(id === st.model, m.name, tr`${String(m.W).replace('.', INTL ? '.' : ',')} × ${String(m.H).replace('.', INTL ? '.' : ',')} мм`, `data-set="model" data-v="${id}"`, false)))}
    <p class="muted">Выберите iPhone, который станет основой изделия. От модели зависят размеры корпуса и все детали кастома: блок камер, обрамление, вкладка и символ подбираются под её геометрию.</p>`;
  if (k === 'body') return tr`<h4>Цвет корпуса</h4><div class="chips">${cat.colors.map(c => chip(c.id === st.color, c.name, `data-set="color" data-v="${c.id}"`, swOf(c, c.hex))).join('')}</div>
    <h4>Память</h4><div class="chips">${cat.storage.map(s => chipT(s.id === st.storage, s.name, `data-set="storage" data-v="${s.id}"`)).join('')}</div>
    <h4>Заставка на экране</h4><div class="chips">${cat.wallpapers.map(w => chip(st.wall === w.id, w.name, `data-set="wall" data-v="${w.id}"`, `url(${w.src}) center/cover`)).join('')}</div>`;
  if (k === 'panel') return panelLight();
  if (k === 'g10') return tr`<h4>Цвет канта</h4><div class="chips">${cat.g10.map(c => chip(c.id === st.g10, c.name, `data-set="g10" data-v="${c.id}"`, c.hex)).join('')}</div><p class="muted">Кант — тонкая цветная полоса между корпусом и обрамлением.</p>`;
  if (k === 'plate') { const pl = cat.plates.find(x => x.id === st.plate.id), form = plateForm(cat, st);
    // hierarchy (owner's change 11.11.2026): shape → texture → finish → metal. Each button leads to a camera plate
    // where only this level changes and the rest are kept (if there is no such combination — the nearest one)
    const inForm = f => cat.plates.filter(p => (p.form || 'emperor') === f && !p.hidden);
    const pick = (list, tex, fin) => list.find(p => p.texture === tex && p.finish === fin) || list.find(p => p.texture === tex && p.finish === 'satin') || list.find(p => p.texture === tex) || list[0];
    const cur = inForm(form), texs = cat.plate_textures.filter(t => cur.some(p => p.texture === t.id)), fins = cur.filter(p => p.texture === pl.texture);
    // 3D swatches (board stickers, 13.11.2026): a disc of the real camera plate — texture × finish × metal (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/plate,
    // tools/render_plate_swatches.py). The swatch follows the selection: textures — in the current metal, metals — in the current texture and finish
    const PSW = (tex, fin, met) => `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/plate/${tex}_${fin}_${met}.avif?v=p5) center/cover`;
    // universal flat texture swatches (owner's change 17.11.2026: "universal texture swatches… images of the drawing without depth"):
    // the drawing in the brand light grey #D9D5CB on a dark circle, one per texture — without metal or finish (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/plate_flat)
    // universal 3D finish swatches (owner's choice 17.11.2026, "G1 + S1"): a piece of metal with three grooves at 45°,
    // satin — vertical brushing, polished — mirror chrome; one set for all textures and metals (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/finish). Polishing — the former swatch
    const FINSW = (fin, tex, met) => ['satin', 'gloss'].includes(fin) ? `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/finish/${fin}.avif?v=g1) center/cover` : PSW(tex, fin, met);
    const FSW = tex => `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/plate_flat/${tex}.avif?v=f1) center/cover`;
    // step copy (Notion "07 · Step 'Camera plate'", 17.11.2026): shape (from 18.11.2026 — round swatches, like the body colour) and textures — name only (the "{number} options" and finish captions removed — owner's changes 17–18.11.2026)
    // (the plate-step class shows captions hidden in the other steps); the part card — "{shape} · {texture} · {finish}", below it "{metal} · {shape}"
    const plTitle = plateTitle(pl);
    return tr`<div class="plate-step"><h4>Форма</h4><div class="chips">${Object.entries(cat.forms).map(([f, o]) => { const p = pick(inForm(f), pl.texture, pl.finish);
        return p ? chip(f === form, o.name, `data-set="plate.id" data-v="${p.id}"`, swOf(o)) : ''; }).join('')}</div>
    <h4>Фактура</h4><div class="chips">${texs.map(t => chip(t.id === pl.texture, t.name, `data-set="plate.id" data-v="${pick(cur, t.id, pl.finish).id}"`, FSW(t.id))).join('')}</div>
    ${(fl => fl.length > 1 ? `${subH(tr('Отделка · ') + texs.find(t => t.id === pl.texture).name)}<div class="chips">${fl.map(f => chip(f.id === pl.finish, f.name, `data-set="plate.id" data-v="${fins.find(p => p.finish === f.id).id}"`, FINSW(f.id, pl.texture, st.plate.metal))).join('')}</div>` : only(tr('Отделка'), fl[0]?.name || '—'))(cat.finishes.filter(f => fins.some(p => p.finish === f.id)))}
    ${''/* board fixes 3–4 of 14.11.2026: no explanatory captions in the camera plate */}
    <h4>Металл</h4><div class="chips">${cat.metals.map(m => chip(m.id === st.plate.metal, m.name, `data-set="plate.metal" data-v="${m.id}"`, MCOIN(m.id))).join('')}</div>
    ${detail(PSW(pl.texture, pl.finish, st.plate.metal), plTitle, `${metalName(st.plate.metal)} · ${cat.forms[form].name}`)}</div>
    ${n}`; }
  if (k === 'frame') { const fr = frameOf(cat, st), form = plateForm(cat, st), all = cat.frames.filter(f => frameHasForm(f, form) && !f.hidden);
    // hierarchy (board 13.11.2026): design → finish → metal → bezel and its metal → panels → screws. All swatches are 3D samples
    // of the real assets (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/frame, tools/render_frame_swatches.py) and follow the selected design, finish and metal
    const pick = (des, fin) => all.find(f => f.design === des && f.finish === fin) || all.find(f => f.design === des);
    const fins = all.filter(f => f.design === fr.design), formName = cat.forms[form].name, fm = st.frame.metal;
    const FS = (des, fin, m) => FSW(`design_${des}_${fin}_${m}`);
    // designs — round swatches with a caption, like "Shape" of the camera plate (owner's change 18.11.2026); a design not available for this shape
    // of the camera plate is dimmed and not clickable, the reason is in the tooltip
    return tr`<h4>Дизайн обрамления</h4><div class="chips">${cat.frame_designs.filter(d => !d.hidden).map(d => { const f = pick(d.id, fr.finish);
        return f ? chip(d.id === fr.design, d.name, `data-set="frame.id" data-v="${f.id}"`, FS(d.id, f.finish, fm)) : chip(false, d.name, tr`disabled title="не для ${formName}"`, swOf(d)); }).join('')}</div>
    ${(fl => fl.length > 1 ? `${subH(tr('Отделка · ') + (cat.frame_designs.find(d => d.id === fr.design) || {}).name)}<div class="chips">${fl.map(x => chip(x.id === fr.finish, x.name, `data-set="frame.id" data-v="${fins.find(f => f.finish === x.id).id}" data-keep="1"`, FINU(x.id) || FS(fr.design, x.id, fm))).join('')}</div>` : only(tr('Отделка'), fl[0]?.name || '—'))(cat.finishes.filter(x => fins.some(f => f.finish === x.id)))}
    ${metals('frame.metal', fm, tr('Металл'), m => FS(fr.design, fr.finish, m.id))}
    ${fr.options.filter(o => (o.variant_of || o.metal_of || o.carbon_of) === 'BEZEL').map(o => frameOpt(fr, o)).join('')}
    ${fr.window_panels ? windowPanels() : ''}
    ${fr.options.filter(o => (o.variant_of || o.metal_of || o.carbon_of) !== 'BEZEL').map(o => frameOpt(fr, o)).join('')}
    ${detail(FS(fr.design, fr.finish, fm), fr.name, tr`${metalName(fm)} · под блок камер «${formName}»`)}`; }
  // the "Insert" step restored 14.11.2026: the block was dropped by mistake in commit 072a11b ("Frame", 13.11.2026)
  if (k === 'insert') { const cur = cat.inserts.find(x => x.id === st.insert) || cat.inserts[0];
    // hidden inserts (hidden: the "Ogives" pattern, 18.11.2026) are not shown in the menu; one opened by an old code is visible together with its pattern
    // insert groups by material type → subsection with the group's colours → selection card
    const gs = INSERT_GROUPS.map(g => ({ ...g, items: cat.inserts.filter(x => (!x.hidden || x.id === cur.id || (cur.hidden && cur.pattern && x.pattern === cur.pattern)) && g.types.includes(x.type)) })).filter(g => g.items.length), g0 = gs.find(g => g.types.includes(cur.type)) || gs[0];
    const lbl = x => { let n = x.name.endsWith(V_SATIN) ? x.name.slice(0, -V_SATIN.length) : x.name; if (g0.strip) { n = n.replace(g0.strip, ''); n = n.charAt(0).toUpperCase() + n.slice(1); } return n; };
    // metal — a 3D coin (pattern in the metal, or satin), like the camera plate swatches (change 17.11.2026); leather and carbon — their own icons/colour
    // leather and carbon (18.11.2026, owner's change "the same swatches as in the reference configurator" — caviar-zodiac-duo-final, "Base"):
    // a flat disc of our leather with stitching along the edge, carbon — polished with a trim (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/insert_z/<id>.avif, tools/insert_swatches_z.py)
    const isw = x => x.type === 'metal' ? swOf(x, x.pattern ? `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/plate/${x.pattern}_${x.finish || 'satin'}_${x.metal}.avif?v=p5) center/cover` : SATIN(x.metal)) : `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/insert_z/${x.id}.avif?v=z9) center/cover, ${x.hex}`;
    // material — round swatches with a caption, like "Shape" of the camera plate (owner's change 18.11.2026); the swatch is the group's selected colour, otherwise the first one
    return tr`<h4>Материал вкладки</h4><div class="chips">${gs.map(g => chip(g === g0, g.name,
        `data-set="insert" data-v="${(g === g0 ? cur : g.items[0]).id}"`, isw(g === g0 ? cur : g.items[0]))).join('')}</div>
    ${g0.types.includes('metal') ? metalIns(g0, cur, isw) : `${g0.items.length < 2 ? '' : subH(g0.sub || tr('Цвет · ') + g0.name)}<div class="chips"${g0.items.length < 2 ? ' hidden' : ''}>${g0.items.map(x => chip(x.id === cur.id, lbl(x), `data-set="insert" data-v="${x.id}"`, isw(x))).join('')}</div>`}
    ${detail(isw(cur), cur.name, g0.name)}`; }
  if (k === 'symbol') { const win = frameWindow(cat, st);
    if (win.policy === 'none') return tr('<p class="muted">С этим обрамлением символ не ставится: окно занято его рисунком.</p>');
    // symbol groups ("Symbols by theme" board, 14.11.2026; the look — "Sign" of the caviar-phones.ru/collections/zodiac configurator):
    // a theme switcher, a grid of round coin swatches of the selected theme, at the bottom — the card of the selected symbol
    // "Fixes" board 14.11.2026: hidden symbols (fix 12 — "Coat of arms" and "Medallion" without a model) are not shown in the menu;
    // the "With symbol / Without symbol" choice — cards like "Medallion" in the reference configurator, everything else — in a subordinate block (fix 6)
    const vis = cat.symbols.filter(s => !s.hidden), cur = cat.symbols.find(x => x.id === st.symbol.id), grps = cat.symbol_groups.filter(g => vis.some(s => s.group === g.id))
      .map(g => st.mode === 'light' && g.name_light ? { ...g, name: g.name_light } : g);   // the group's own name in light customisation if name_light is set in the catalogue (currently unused)
    if (!grps.some(g => g.id === symGroup)) symGroup = cur?.group || grps[0].id;
    const lbl = s => { const nm = s.name.startsWith(ZODIAC) ? s.name.slice(ZODIAC.length) : s.name, m = nm.endsWith(' · ' + ENAMEL) ? [nm, nm.slice(0, -ENAMEL.length - 3), ENAMEL] : null; return m ? `${m[1]}<small>${m[2]}</small>` : nm; };
    const on = st.symbol.id !== '0', back = (cur && cur.id !== '0' ? cur : null) || vis.find(s => s.id === lastSym) || vis.find(s => s.group === symGroup);
    const opt = (sel, label, v, ic) => `<button class="card optc ${sel ? 'on' : ''}" aria-pressed="${!!sel}" data-set="symbol.id" data-v="${v}"><span class="icw">${ic}</span><span class="tx"><b>${label}</b></span></button>`;
    // the "With symbol" swatch is always "Caviar Crown" (symbol 40), whichever symbol is selected (owner's change 18.11.2026)
    let h = tr`<h4>Символ</h4><div class="cards">${opt(on, tr('С символом'), back.id, `<i class="ic" style="background:${swOf(cat.symbols.find(s => s.id === '40') || (back.custom ? vis.find(s => s.group) : back))}"></i>`)}${opt(!on, tr('Без символа'), '0', '<i class="ic none"></i>')}</div>`;
    if (!on) return h + n;
    h += `<div class="dep">
      <div class="grptabs">${grps.map(g => { const ss = vis.filter(s => s.group === g.id), on = cur && cur.group === g.id;
        return `<button class="grptab ${g.id === symGroup ? 'on' : ''}${on ? ' has' : ''}" aria-pressed="${g.id === symGroup}" data-symgrp="${g.id}"><b>${g.name}</b><small>${on ? lbl(cur).replace(/<small>.*<\/small>/, '') : ss.length + ' ' + (ss.length % 10 === 1 && ss.length !== 11 ? tr('символ') : ss.length % 10 >= 2 && ss.length % 10 <= 4 && (ss.length < 10 || ss.length > 20) ? tr('символа') : tr('символов'))}</small></button>`; }).join('')}</div>
      <h4>${grps.find(g => g.id === symGroup).name}</h4><div class="chips signs">${vis.filter(s => s.group === symGroup).map(s => chip(s.id === st.symbol.id, lbl(s), `data-set="symbol.id" data-v="${s.id}"`, swOf(s))).join('')}</div>
      ${vis.some(s => s.custom) ? `<div class="cards one">${card(cur?.custom, tr('Свой символ'), tr('по вашему эскизу'), 'data-set="symbol.id" data-v="C"', false)}</div>` : ''}`;
    // owner's change 14.11.2026: all themes — a dense grid as for the zodiac; the card of the selected symbol — under the metal selection
    if (st.symbol.id !== '0') { const sy = cat.symbols.find(x => x.id === st.symbol.id), [a, b] = symbolSizeRange(cat, st);
      if (sy.custom) h += tr('<p class="muted">Свой символ разрабатывается индивидуально — обсудите его с менеджером. ') + (win.ring ? tr('Здесь задаётся размер: в этом обрамлении символ стоит в центре кольца.') : tr('Здесь задаются место и размер.')) + '</p>';
      else h += `<div class="dep">${metals('symbol.metal', st.symbol.metal, tr('Металл'), sy.icon ? m => `url(${sy.icon.replace('.avif', '_' + m.id + '.avif')}) center/cover` : undefined).replace('<h4>', '<h4 class="subh">↳ ').replace('</h4>', ' · ' + sy.name.replace(/ · (?:эмаль|enamel)$/, '') + '</h4>')}${symbolBase(sy)}</div>`;
      if (win.ring) h += tr`<h4>Размер</h4>${range('symbol.d', symSz(sy).label, st.symbol.d, a, b, 0.5, 'symbol')}`;
      else h += tr`<h4>Размер и положение</h4>${range('symbol.d', symSz(sy).label, st.symbol.d, a, b, 0.5, 'symbol')}
        ${range('symbol.y', tr('Вверх-вниз'), st.symbol.y, ...symbolYRange(cat, st, win), 0.5, 'symbol')}`;
      // fix 1 of the "Fixes" board 14.11.2026: the card of the selected symbol — after size and position
      if (sy.group) h += detail(sy.icon ? `url(${sy.icon.replace('.avif', '_' + st.symbol.metal + '.avif')}) center/cover` : swOf(sy), sy.name, tr`${grps.find(g => g.id === sy.group)?.name || ''} · ${metalName(st.symbol.metal)} · ${symSz(sy).pre}${mmf(a)}–${mmf(b)} мм${win.ring ? tr(' в этом обрамлении') : ''}`); }
    return h + '</div>' + n; }
  if (k === 'plaque') { const win = frameWindow(cat, st);
    // round shape swatches, like "Shape" of the camera plate (owner's change 18.11.2026): the nameplate icon in a circle, the name under it; the size is in "Size and position"
    let h = tr`<h4>Форма таблички</h4><div class="chips">${cat.plaques.filter(p => !p.hidden).map(p => chip(p.id === st.plaque.id, p.name, `data-set="plaque.id" data-v="${p.id}"`, p.id === '0' ? 'none' : swOf(p))).join('')}</div>`;
    // 3D metal swatches (owner's change 17.11.2026 "the nameplates section needs swatches too"): the selected nameplate in each
    // metal (https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/plaque/<shape>_<metal>.avif — tools/render_symbol_swatches.py from the nameplate assets); without an asset — satin
    const pq = plaqueOf(cat, st), pqn = pq && pq.asset ? pq.asset.split('/').pop().replace('.glb', '') : null;
    if (st.plaque.id !== '0') h += tr`${metals('plaque.metal', st.plaque.metal, tr('Металл'), m => pqn ? `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/plaque/${pqn}_${m.id}.avif?v=g2) center/cover` : SATIN(m.id))}
      <h4>Шрифт</h4><div class="chips">${cat.fonts.map(f => chipF(f.id === st.plaque.font, f.name, `data-set="plaque.font" data-v="${f.id}"`, f.css)).join('')}</div>
      <h4>Текст (до ${cat.plaque_text_max} символов в строке)</h4><p class="muted">Вторая строка — по желанию; текст центрируется по числу строк. Одна длинная строка переносится сама, если в одну она мельче ${String(cat.plaque_font_min_mm || 2).replace('.', INTL ? '.' : ',')} мм.</p>${(() => { const [l1 = '', l2 = ''] = (st.plaque.text || '').split('\n');
        return tr`<label class="fl" for="ptext">Первая строка</label><input type="text" id="ptext" maxlength="${cat.plaque_text_max}" value="${esc(l1)}" autocomplete="off"><label class="fl" for="ptext2">Вторая строка — по желанию</label><input type="text" id="ptext2" maxlength="${cat.plaque_text_max}" value="${esc(l2)}" autocomplete="off"><p class="muted">${esc(PLAQUE_CHARS_HINT)}</p>`; })()}
      <h4>Размер и положение</h4>${(([a, b]) => range('plaque.w', tr('Ширина'), st.plaque.w ?? plaqueOf(cat, st).w, a, b, 0.5, 'plaque'))(plaqueSizeRange(cat, st))}
      ${range('plaque.y', tr('Вверх-вниз'), st.plaque.y, ...plaqueYRange(cat, st, win), 0.5, 'plaque')}`;   // board fix 5 of 14.11.2026: nameplate width, like the symbol diameter
    return h + n; }
  if (k === 'side') return SIDES.map(([s, n, where]) => { const f = fit(SE, st.model, s, st.side?.[s]);
      return tr`<h4>${n} <span class="muted" style="text-transform:none;letter-spacing:0">· ${where}</span></h4>
      <label class="fl" for="side_${s}">Текст гравировки</label><input type="text" id="side_${s}" data-side="${s}" value="${esc(f.text)}" autocomplete="off" aria-describedby="side_${s}_left side_${s}_msg" style="text-transform:uppercase;letter-spacing:.1em">
      <p class="muted" id="side_${s}_left">${sideLeft(f)}</p><p class="note" id="side_${s}_msg" role="status" hidden></p>`; }).join('');
  if (k === 'pack') { const PK = cat.packs || [], cur = PK.find(x => x.id === st.pack) || PK[0];   // 16.11.2026: packaging choice (red Royal Gift / anniversary black "15 YEARS")
    return tr`<h4>Упаковка</h4>${cards(PK.map(x => card(x.id === cur.id, x.short, !PRICE_ON ? '' : x.price ? '+ ' + fmt(x.price) : tr('входит в стоимость'), `data-set="pack" data-v="${x.id}"`, `url(${x.swatch}) center/cover`)))}
    ${detail(`url(${cur.swatch}) center/cover`, cur.name, tr`${cur.desc} Смартфон лежит в ложементе спинкой вверх.${!PRICE_ON ? '' : cur.price ? tr(' Доплата ') + fmt(cur.price) + '.' : tr(' Футляр входит в стоимость.')}`)}
    <h4>Посмотреть футляр</h4><div class="cards">${[['0', tr('Открыта')], ['1', tr('Закрыта')]].map(([v, n]) => `<button class="card noic ${(packLid ? '1' : '0') === v ? 'on' : ''}" aria-pressed="${(packLid ? '1' : '0') === v}" data-lid="${v}"><span class="tx"><b>${n}</b></span></button>`).join('')}</div>`; }   // 14.11.2026: 3D of the case and the slipcase; the lid is view only, not part of the build code
  if (k === 'summary') { const p = PRICE_ON ? safePrice() : { missing: [] };
    return tr`${PRICE_ON ? tr`<h4>Ориентировочная стоимость</h4><div style="font-size:26px">${Number.isFinite(p.total) ? fmt(p.total) : '—'}</div><p class="muted">Цены тестовые. Окончательную стоимость подтвердит менеджер Caviar.</p>
    ${p.missing.length ? tr`<div class="note">Расчёт неполный, нет цены для: ${esc(p.missing.join('; '))}.</div>` : ''}` : tr`<h4>Стоимость</h4><div style="font-size:26px">${PRICE_ASK}</div><p class="muted">Стоимость рассчитает и подтвердит менеджер Caviar.</p>`}
    <h4 id="codeLbl">Код сборки</h4><input type="text" id="codeIn" aria-labelledby="codeLbl" value="${esc(encode(st))}" autocomplete="off" spellcheck="false"><div class="btns"><button id="copyCode">Копировать</button><button id="loadCode">Открыть по коду</button></div>
    <h4>Спецификация</h4><div class="spec">${specRows().map(([a, b]) => `<div><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join('')}</div>
    <div class="btns savedesign"><button id="saveDesign">⤓ Скачать дизайн</button></div><div class="btns savespec"><button id="saveSpec">⤓ Скачать спецификацию</button></div>`; }   // board fix 4 of 14.11.2026: without the "Calculation" block
  return '';
}
const sideLeft = f => LANG === 'zh'
  ? (f.text.trim() ? `尚可輸入 ${f.left} 個字元 · 已使用 ${f.w.toFixed(1)} / ${f.L.toFixed(1)} mm` : `約可容納 ${f.left} 個字元 · 區域 ${f.L.toFixed(1)} mm`)
  : LANG === 'en'
  ? (f.text.trim() ? `${f.left} character${f.left === 1 ? '' : 's'} remaining · ${f.w.toFixed(1)} of ${f.L.toFixed(1)} mm used` : `Space for about ${f.left} character${f.left === 1 ? '' : 's'} · area ${f.L.toFixed(1)} mm`)
  : f.text.trim() ? tr`Осталось ${f.left} ${plural(f.left, tr('символ'), tr('символа'), tr('символов'))} · занято ${f.w.toFixed(1).replace('.', INTL ? '.' : ',')} из ${f.L.toFixed(1).replace('.', INTL ? '.' : ',')} мм`
  : tr`Поместится около ${f.left} ${plural(f.left, tr('символа'), tr('символов'), tr('символов'))} · область ${f.L.toFixed(1).replace('.', INTL ? '.' : ',')} мм`;
const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };
// symbol base (Mercedes, owner's change 11.11.2026): satin with a choice of metal or enamel with a choice of colour
const sb = () => { const b = { f: 'S', m: '0', e: '1', ...(st.symbol.base || {}) }, B = cat.symbols.find(x => x.id === st.symbol.id)?.base;
  if (B?.finishes && !B.finishes.some(x => x.id === 'S')) b.f = 'E'; return b; };   // enamel-only base (Pobedonosets) — always enamel
function symbolBase(sy) { if (!sy.base?.finishes) return ''; const b = sb(), B = sy.base;
  if (B.recolor) return tr`<h4>Цвет эмали</h4><div class="chips">${B.enamel.map(c => chip(b.e === c.id, c.name, `data-set="symbol.base.e" data-v="${c.id}"`, ESW(c.hex, st.symbol.metal))).join('')}</div>`;   // the symbol's enamel can be recoloured (zodiac)
  let h = B.finishes.length > 1 ? tr`<h4>Основа</h4><div class="chips">${B.finishes.map(f => chip(b.f === f.id, f.name, `data-set="symbol.base.f" data-v="${f.id}"`, f.id === 'E' ? ESW((B.enamel.find(c => c.id === b.e) || B.enamel[0]).hex, st.symbol.metal) : SATIN(b.m !== '0' ? b.m : st.symbol.metal))).join('')}</div>` : only(tr('Основа'), B.finishes[0].name);
  if (b.f === 'E') h += `${subH(tr('Цвет эмали'))}<div class="chips">${B.enamel.map(c => chip(b.e === c.id, c.name, `data-set="symbol.base.e" data-v="${c.id}"`, ESW(c.hex, st.symbol.metal))).join('')}</div>`;
  else h += `${subH(tr('Металл основы'))}<div class="chips">${chip(b.m === '0', tr('Как у символа'), `data-set="symbol.base.m" data-v="0"`, SATIN(st.symbol.metal))}${cat.metals.map(m => chip(b.m === m.id, m.name, `data-set="symbol.base.m" data-v="${m.id}"`, SATIN(m.id))).join('')}</div>`;
  return h; }
function symbolBaseName(sy) { if (!sy?.base?.finishes) return ''; const b = sb();
  return b.f === 'E' ? tr`эмаль ${(sy.base.enamel.find(c => c.id === b.e) || sy.base.enamel[0]).name.toLowerCase()}` : tr`сатин, ${metalName(b.m !== '0' ? b.m : st.symbol.metal).toLowerCase()}`; }
// panels in the windows of the "Ring" frame (11.11.2026): option WP — 0 | M<metal><S|D|F> | C<T|F>
const WPC = cat.window_panels;
// frame swatches (13.11.2026): 3D samples of the assets — design × finish × metal, screw, bezel, panels, carbon
const bezelCarbon = fr => { const o = fr.options.find(x => x.variant_of === 'BEZEL'); return o ? (o.values.find(v => v.id === ((st.frame.opts || {})[o.id] || '0')) || {}).carbon : null; };
const FSW = n => `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/frame/${n}.avif?v=g2) center/cover`;   // ?v=g2: gold #e2ad6a (18.11.2026)
// frame option with swatches: bezel (texture; carbon has no metal), bezel and screw metal — a sample of the part in that metal
function frameOpt(fr, o) { const op = st.frame.opts || {}, fm = st.frame.metal, cur = op[o.id] || '0', set = v => `data-set="frame.opts.${o.id}" data-v="${v}" data-keep="1"`;
  const bp = fr.options.find(x => x.variant_of === 'BEZEL'), bv = bp ? (bp.values.find(v => v.id === (op[bp.id] || '0')) || bp.values[0]) : null;
  const bzOpt = fr.options.find(x => x.metal_of === 'BEZEL'), bzm = bzOpt && op[bzOpt.id] && op[bzOpt.id] !== '0' ? op[bzOpt.id] : fm;
  let sw = v => v.hex, head = `<h4>${o.name}</h4>`;
  // bezel carbon (owner's change 19.11.2026): a single "Carbon" button (the swatch is the selected carbon), below — the insert carbons (option BC)
  const bco = fr.options.find(x => x.carbon_of === 'BEZEL'), bcId = (bco && op[bco.id]) || '196', bcIns = WP_CARBONS.find(x => x.id === bcId) || WP_CARBONS[0];
  if (o.carbon_of === 'BEZEL') { if (!bv?.carbon) return ''; return `${subH(o.name)}<div class="chips">${WP_CARBONS.map(x => chip(x.id === bcId, x.name, set(x.id), INS_SW(x))).join('')}</div>`; }
  if (o.variant_of === 'BEZEL') sw = v => v.carbon ? (bcIns ? INS_SW(bcIns) : FSW('carbon_T')) : FSW(`bezel_${v.id}_${bzm}`);
  else if (o.metal_of === 'BEZEL') { if (bv?.carbon) return ''; head = subH(o.name); sw = v => FSW(`bezel_${bv ? bv.id : '0'}_${v.id === '0' ? fm : v.id}`); }
  else if (o.metal_of === 'SCREW') sw = v => FSW(`screw_${v.id === '0' ? fm : v.id}`);
  if (o.fixed != null) return '';   // an option with a fixed value (screws — in the frame colour, 21.11.2026) is not shown
  else if (o.color_of === 'ENAMEL') sw = v => ESW(v.hex, fm);
  const vals = optValues(o); if (vals.length < 2) return vals.length ? only(o.name, vals[0].name) : '';
  return `${head}<div class="chips">${vals.map(v => chip(cur === v.id, v.name, set(v.id), sw(v))).join('')}</div>`; }
// "Ring" without panels is withdrawn (owner's change 17.11.2026 "in the ring frame remove the no-panels option"): no selection or the old code "0" —
// panels in the frame metal, satin
// panel carbon (owner's change 19.11.2026): a single "Carbon" button, below — all current insert carbons (with maps), like the metal for textures;
// code WP = C<insert id>. The former CT / CF are converted by normalize (WP_LEGACY)
const WP_CARBONS = cat.inserts.filter(x => x.type === 'carbon' && x.maps && !x.hidden);
const INS_SW = x => `url(https://teatromisterio.github.io/Test-Constructor-iPhone-18-Pro/assets/swatches/insert_z/${x.id}.avif?v=z9) center/cover, ${x.hex}`;
const wpParse = () => { let v = (st.frame.opts || {}).WP || '0'; if (v === '0') v = 'M' + st.frame.metal + 'S'; return v[0] === 'M' ? { k: 'M', metal: v.slice(1, 3), fin: v[3] || 'S' } : v[0] === 'C' ? { k: 'C', c: v.slice(1) } : { k: '0' }; };
function windowPanels() { const w = wpParse(), m = w.metal || st.frame.metal, f = w.fin || 'S', set = v => `data-set="frame.opts.WP" data-v="${v}" data-keep="1"`;
  // panels (board 13.11.2026 "panel selection by swatches with captions"): one row — metal in three finishes and "Carbon"; below — the panel metal or carbon
  const K = { S: 'satin', D: 'diamond', F: 'flute' }, ins = cat.inserts.find(x => x.id === st.insert) || {};
  const cDef = w.k === 'C' ? w.c : (ins.type === 'carbon' && ins.maps ? ins.id : WP_CARBONS[0]?.id), cSel = WP_CARBONS.find(x => x.id === cDef) || WP_CARBONS[0];
  const items = [...WPC.finishes.map(x => chip(w.k === 'M' && f === x.id, x.name, set('M' + m + x.id), FSW(`panel_${K[x.id]}_${m}`))),
    ...(cSel ? [chip(w.k === 'C', tr('Карбон'), set('C' + cSel.id), INS_SW(cSel))] : [])];
  let h = tr`<h4>Панели в окнах</h4><div class="chips">${items.join('')}</div>`;
  if (w.k === 'M') h += `${subH(tr('Металл панелей'))}<div class="chips">${cat.metals.map(x => chip(x.id === m, x.name, set('M' + x.id + f), FSW(`panel_${K[f]}_${x.id}`))).join('')}</div>`;
  if (w.k === 'C') h += `${subH(tr('Цвет · карбон'))}<div class="chips">${WP_CARBONS.map(x => chip(x.id === w.c, x.name, set('C' + x.id), INS_SW(x))).join('')}</div>`;
  return h + tr('<p class="muted">Панели ставятся в две верхние боковые и центральное нижнее окна, остальные окна — материал вкладки.</p>'); }
function wpLine() { const w = wpParse(); if (w.k === 'M') { const f = WPC.finishes.find(x => x.id === w.fin); return [tr`Панели в окнах: ${metalName(w.metal).toLowerCase()}, ${f.name.toLowerCase()}`, (WPC.metal_price[w.metal] || 0) + f.price]; }
  if (w.k === 'C') { const c = cat.inserts.find(x => x.id === w.c); return [tr`Панели в окнах: ${(c ? c.name : tr('карбон')).toLowerCase()}`, WPC.carbon[0].price]; } return null; }
function specRows() {
  const m = cat.models[st.model], pl = cat.plates.find(x => x.id === st.plate.id), fr = frameOf(cat, st);
  const rows = [[tr('Вид кастома'), st.mode === 'light' ? tr('Лёгкий') : tr('Полный')], [tr('Модель'), m.name], [tr('Цвет корпуса'), cat.colors.find(c => c.id === st.color).name], [tr('Память'), cat.storage.find(s => s.id === st.storage).name]];
  rows.push([tr('Заставка'), cat.wallpapers.find(w => w.id === st.wall)?.name || cat.wallpapers[0].name]);
  if (st.mode === 'light') rows.push(...lightDesc()); else rows.push(
    [tr('Кант'), cat.g10.find(c => c.id === st.g10).name], [tr('Блок камер'), `${plateTitle(pl)} · ${metalName(st.plate.metal)}`],
    [tr('Обрамление'), `${fr.name} · ${metalName(st.frame.metal)}`], ...fr.options.filter(o => o.fixed == null && !(o.metal_of === 'BEZEL' && bezelCarbon(fr)) && !(o.carbon_of && !bezelCarbon(fr))).map(o => [o.name, (optValues(o).find(v => v.id === ((st.frame.opts || {})[o.id] || (o.carbon_of ? '196' : '0'))) || {}).name || '—']),   // a carbon bezel has no metal
    ...(fr.window_panels && wpLine() ? [[tr('Панели в окнах'), wpLine()[0].replace(tr('Панели в окнах: '), '')]] : []),
    [tr('Вкладка'), cat.inserts.find(x => x.id === st.insert)?.name || '—']);
  for (const [s, n] of SIDES) if ((st.side?.[s] || '').trim()) rows.push([tr('Гравировка: ') + n.toLowerCase(), `«${st.side[s].trim()}»`]);
  if (st.symbol.id !== '0') { const sy = cat.symbols.find(x => x.id === st.symbol.id); rows.push([tr('Символ'), tr`${sy.name}${sy.custom ? tr(' · по вашему эскизу') : ' · ' + metalName(st.symbol.metal)} · ${symSz(sy).pre}${mmf(st.symbol.d)} мм`]); if (sy.base?.finishes) rows.push(sy.base.recolor ? [tr('Эмаль символа'), (n => n.startsWith(ENAMEL + ' ') ? n.slice(ENAMEL.length + 1) : n)(symbolBaseName(sy)).replace(/^./, c => c.toUpperCase())] : [tr('Основа символа'), symbolBaseName(sy)]); }   // "Symbol enamel: Beige", without repeating the word (21.11.2026)
  if (st.plaque.id !== '0') { const pq = cat.plaques.find(x => x.id === st.plaque.id); rows.push([tr('Табличка'), `${pq.name} · ${metalName(st.plaque.metal)} · ${(() => { const q = plaqueOf(cat, st); return tr`${q.w.toFixed(1).replace('.', INTL ? '.' : ',')} × ${q.h.toFixed(1).replace('.', INTL ? '.' : ',')} мм`; })()} · ${(st.plaque.text || '').trim() ? `«${st.plaque.text.trim().replace(/\n/g, ' / ')}»` : tr('без текста')}`]); }   // empty text — "no text" rather than empty quotes (check 21.11.2026)
  return rows;
}

// ---------- PNG specification: back snapshot + card ----------
// Specification (audit, stage 8: B5, E8, T11). An image in the brand style: logo, a snapshot of the back in the same colour as in the viewport,
// build contents, total cost (per-part prices are for internal use only, owner's decision 15.11.2026),
// a QR code with a link to the build, and the full code. On a phone the system "Share" sheet opens, otherwise the file is downloaded.
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
let qrLib, specLogo;
const getQr = () => qrLib ??= new Promise((res, rej) => { const el = document.createElement('script'); el.src = 'vendor/qrcode/qrcode.js'; el.onload = () => res(window.qrcode); el.onerror = rej; document.head.append(el); });
// everything loaded over the network is prepared in advance (on entering "Summary"): by the time the button is pressed the image is built at once, and "Share" opens on that same press
// Traditional Chinese glyphs come from system fonts: the interface font has Latin and Cyrillic only.
const CJK_FONTS = LANG === 'zh' ? '"PingFang TC", "Microsoft JhengHei", "Noto Sans TC", "Noto Sans CJK TC", ' : '';
function prepSpec() { specLogo ??= loadImg('assets/logo.svg'); return Promise.all([getQr(), specLogo, document.fonts?.load('800 40px "Nunito Sans"'), document.fonts?.load('400 24px "Nunito Sans"')]).catch(() => {}); }
const buildUrl = code => { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('code', shrink(code)); return u.href; };   // "Share" link, QR, enquiry — the short code
// QR: a link to the build; if the link is too long for a QR code of reasonable size — the build code only (it is pasted on the "Summary" step)
function makeQr(code) { for (const [text, isUrl] of [[buildUrl(code), true], [code, false]]) { if (text.length > 1100) continue;
    try { const q = window.qrcode(0, 'M'); q.addData(text, 'Byte'); q.make(); if (q.getModuleCount() <= 105) return { q, n: q.getModuleCount(), isUrl }; } catch {} }
  return null; }
// Specification (owner's change 15.11.2026, modelled on the Zodiac sheet): header — logo and the model with the customisation type; three views at one
// scale — left side, back, right side (light snapshot studio, no dark crushed areas in the metal: scene.snapshots); build contents;
// estimated cost; a "Contact a manager" card with the build's QR code; a disclaimer at the bottom
async function drawSpec() { await prepSpec(); const logo = await specLogo.catch(() => null);
  const rows = specRows(), p = PRICE_ON ? safePrice() : { total: NaN }, code = encode(st), shots = scene.snapshots(1020), qr = window.qrcode ? makeQr(code) : null, MG = cat.manager || {};
  const W = 1080, PAD = 76, F = '"Nunito Sans", ' + CJK_FONTS + 'system-ui, sans-serif', GOLD = '#a99975', GOLD_L = '#C9BC98', INK = '#F2EFE8', MUTED = '#9A968C', LINE = 'rgba(255,255,255,.1)';
  const c = document.createElement('canvas'); c.width = W; c.height = 6000; const g = c.getContext('2d');
  const caps = (text, x, y, color = GOLD, size = 20, align = 'left', sp = 3) => { g.font = `700 ${size}px ${F}`; g.fillStyle = color; g.textAlign = align; if ('letterSpacing' in g) g.letterSpacing = sp + 'px'; g.fillText(text.toUpperCase(), x, y); if ('letterSpacing' in g) g.letterSpacing = '0px'; };
  const wrap = (text, maxW, anyChar) => { const out = []; let line = '';                                  // wrap by words; the build code — at any character
    for (const w of anyChar ? [...text] : text.split(/(\s+|[\u2e80-\u9fff\uff00-\uffef])/).filter(Boolean)) { if (line && g.measureText(line + w).width > maxW) { out.push(line.trimEnd()); line = anyChar ? w : w.trimStart(); } else line += w; }
    if (line.trim()) out.push(line.trimEnd()); return out; };
  const rrect = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  g.fillStyle = '#0D1117'; g.fillRect(0, 0, W, c.height);
  // header: logo on the left, model and customisation type on the right
  let y = 56; const LH = 92; if (logo) g.drawImage(logo, PAD, y, LH * logo.naturalWidth / logo.naturalHeight, LH); else caps('Caviar', PAD, y + 60, INK, 40);
  g.font = `800 42px ${F}`; g.fillStyle = INK; g.textAlign = 'right'; g.fillText(cat.models[st.model].name, W - PAD, y + 42);
  caps(st.mode === 'light' ? tr('Лёгкий кастом') : tr('Полный кастом'), W - PAD, y + 82, GOLD, 18, 'right', 2);
  y += LH + 56;
  // three views on a transparent background right on the sheet, behind the phones — a shared soft pool of light, as in the viewport
  const L = shots.left, B = shots.back, R = shots.right, GAP = Math.max(16, Math.min(44, (W - PAD * 2 - L.width - B.width - R.width) / 2));
  let x = (W - (L.width + B.width + R.width + GAP * 2)) / 2; const H = B.height;
  const gr = g.createRadialGradient(W / 2, y + H * 0.5, 40, W / 2, y + H * 0.5, H * 0.62); gr.addColorStop(0, '#18202c'); gr.addColorStop(1, 'rgba(13,17,23,0)'); g.fillStyle = gr; g.fillRect(0, y - 20, W, H + 40);
  for (const img of [L, B, R]) { g.drawImage(img, x, y); x += img.width + GAP; }   // snapshots with a transparent background, no backing plates (owner's change 15.11.2026)
  y += H + 84;
  caps(tr('Состав сборки'), PAD, y); y += 22; g.fillStyle = LINE; g.fillRect(PAD, y, W - PAD * 2, 1); y += 46;
  for (const [a, b] of rows) { g.font = `400 25px ${F}`; g.textAlign = 'left'; g.fillStyle = MUTED; g.fillText(a, PAD, y);
    g.font = `600 25px ${F}`; g.fillStyle = INK; g.textAlign = 'right'; const ls = wrap(b, W - PAD * 2 - 330); ls.forEach((l, i) => g.fillText(l, W - PAD, y + i * 34));
    y += 34 * ls.length + 8; g.fillStyle = LINE; g.fillRect(PAD, y - 14, W - PAD * 2, 1); y += 20; }
  y += 30; caps(PRICE_ON ? tr('Ориентировочная стоимость') : tr('Стоимость'), PAD, y); y += 74;
  g.font = `800 64px ${F}`; g.fillStyle = GOLD_L; g.textAlign = 'left'; g.fillText(!PRICE_ON ? PRICE_ASK : Number.isFinite(p.total) ? '≈ ' + fmt(p.total) : '—', PAD, y); y += 44;
  g.font = `400 22px ${F}`; g.fillStyle = MUTED; g.fillText(PRICE_ON ? tr('Цены тестовые. Окончательную стоимость подтвердит менеджер Caviar.') : tr('Стоимость рассчитает и подтвердит менеджер Caviar.'), PAD, y); y += 90;
  // manager card: the build's QR code on the left, contacts on the right
  const CP = 40, QS = 228, cx0 = PAD, cw = W - PAD * 2, y0 = y, tx = cx0 + CP + QS + 52, tw = cx0 + cw - CP - tx;
  let qy = y0 + CP, ty = y0 + CP + 16;
  if (qr) { const quiet = 3, cell = QS / (qr.n + quiet * 2); g.fillStyle = '#fff'; rrect(cx0 + CP, qy, QS, QS, 10); g.fill(); g.fillStyle = '#000';
    for (let r = 0; r < qr.n; r++) for (let col = 0; col < qr.n; col++) if (qr.q.isDark(r, col)) g.fillRect(cx0 + CP + (col + quiet) * cell, qy + (r + quiet) * cell, cell + 0.4, cell + 0.4);
    qy += QS + 34; g.font = `400 18px ${F}`; g.fillStyle = MUTED; g.textAlign = 'left';
    for (const l of wrap(qr.isUrl ? tr('Отсканируйте, чтобы открыть эту сборку в конструкторе') : tr('В QR-коде — код сборки: вставьте его в конструкторе на шаге «Итог»'), QS + 20)) { g.fillText(l, cx0 + CP, qy); qy += 25; } }
  caps(tr('Связаться с менеджером'), tx, ty, GOLD, 18, 'left', 3); ty += 50;
  if (MG.name) { g.font = `700 30px ${F}`; g.fillStyle = INK; g.textAlign = 'left'; g.fillText(MG.name, tx, ty); ty += 50; }
  for (const [lab, val] of [[tr('Телефон'), MG.phone], ['Email', MG.email], ['Telegram', MG.telegram], ['WhatsApp', MG.whatsapp], [tr('Сайт'), MG.site]]) { if (!val) continue;
    g.font = `400 18px ${F}`; g.fillStyle = MUTED; g.fillText(lab, tx, ty); ty += 30; g.font = `600 25px ${F}`; g.fillStyle = INK; for (const l of wrap(String(val), tw)) { g.fillText(l, tx, ty); ty += 32; } ty += 14; }
  const ch = Math.max(qy, ty) - y0 + CP - 14;
  g.save(); rrect(cx0, y0, cw, ch, 18); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.5; g.stroke(); g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#121820'; g.fill(); g.restore();
  y = y0 + ch + 44;
  // the build code — for the manager (the design opens by it), in small print under the card
  g.font = `400 18px ${F}`; g.fillStyle = MUTED; g.textAlign = 'left'; g.fillText(tr('Код сборки'), PAD, y); y += 30;
  g.font = `600 18px ui-monospace, Menlo, Consolas, monospace`; g.fillStyle = GOLD_L; for (const l of wrap(code, W - PAD * 2, true)) { g.fillText(l, PAD, y); y += 26; }
  y += 40; g.font = `400 18px ${F}`; g.fillStyle = MUTED; g.textAlign = 'center';
  g.fillText(tr('Изображение носит иллюстративный характер. Финальный вид изделия согласуется с менеджером.  ·  ') + new Date().toLocaleDateString(LOCALE), W / 2, y); y += 56;
  const out = document.createElement('canvas'); out.width = W; out.height = y; out.getContext('2d').drawImage(c, 0, 0); return { canvas: out, code, qr: qr ? (qr.isUrl ? 'url' : 'code') : 'none' }; }
// Design (owner's change 15.11.2026 "a download design button… 1080×1920, the build code at the bottom of the image, no other
// information"): a dark sheet background with a light pool, the back of the phone (light snapshot studio, as on the specification), the build code at the bottom
async function drawDesign() { await prepSpec();
  const W = 1080, H = 1920, code = encode(st), MONO = 'ui-monospace, Menlo, Consolas, monospace';
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#0D1117'; g.fillRect(0, 0, W, H);
  g.font = `600 26px ${MONO}`; const lines = [], LH = 38; let line = '';
  const MAXW = W - 160, fits = t => g.measureText(t).width <= MAXW;
  for (let ch of code.match(/[^-]+-?/g) || [code]) { if (line && !fits(line + ch) && fits(ch)) { lines.push(line); line = ''; }   // a fragment is wrapped as a whole if it fits on a line by itself
    while (!fits(line + ch)) { let k = ch.length; while (k > 1 && !fits(line + ch.slice(0, k))) k--; if (ch.length - k === 1 && k > 2) k--;   // do not leave a single character on a line
      lines.push(line + ch.slice(0, k)); line = ''; ch = ch.slice(k); }   // a long fragment without hyphens (nameplate and engraving text) is cut by width, otherwise the code ran past the edge of the image (check 22.11.2026)
    line += ch; } if (line) lines.push(line);   // wrap after a hyphen, code fragments are not broken
  const codeTop = H - 90 - lines.length * LH, top = 110, bottom = codeTop - 70, m = cat.models[st.model];
  const ph = Math.min(bottom - top, (W - 180) * (m.H + 12) / (m.W + 12)), shot = scene.snapshots(Math.round(ph), ['back']).back;
  const cy = (top + bottom) / 2, gr = g.createRadialGradient(W / 2, cy, 60, W / 2, cy, shot.height * 0.7);
  gr.addColorStop(0, '#1A2330'); gr.addColorStop(1, 'rgba(13,17,23,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.drawImage(shot, Math.round((W - shot.width) / 2), Math.round(cy - shot.height / 2));
  g.font = `600 26px ${MONO}`; g.fillStyle = '#C9BC98'; g.textAlign = 'center'; lines.forEach((l, i) => g.fillText(l, W / 2, codeTop + 26 + i * LH));
  return { canvas: c, code }; }
let specBusy = false;
async function saveSpec(btn, design) { if (specBusy) return; specBusy = true; const label = btn?.textContent; if (btn) btn.textContent = design ? tr('Готовим изображение…') : tr('Готовим спецификацию…');
  try { const { canvas, code } = await (design ? drawDesign() : drawSpec()), name = exportImageName(code, design);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png')); if (!blob) throw new Error(tr('картинка не собрана'));   // toBlob instead of a long data URL: large images download on a phone too (T11)
    const file = new File([blob], name, { type: 'image/png' });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {           // phone: the system "Share" sheet — save to "Photos" or send to a messenger
      try { await navigator.share({ files: [file], title: 'Caviar · ' + cat.models[st.model].name }); if (!design) goal('constructor_spec_download'); return; } catch (e) { if (e?.name === 'AbortError') return; } }   // the menu was dismissed — download nothing
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.download = name; a.href = url; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    if (!design) goal('constructor_spec_download');
  } catch (e) { console.error(e); toast([design ? tr('Не удалось собрать изображение.') : tr('Не удалось собрать спецификацию.'), tr('Попробуйте ещё раз; код сборки можно скопировать на шаге «Итог».')]); }
  finally { specBusy = false; if (btn) btn.textContent = label; } }

// ---------- events ----------
function setPath(obj, path, v) { const k = path.split('.'); let o = obj; while (k.length > 1) { const kk = k.shift(); o[kk] = o[kk] || {}; o = o[kk]; } o[k[0]] = v; }
$('#panel').addEventListener('click', e => {
  const lb = e.target.closest('[data-lid]'); if (lb) { packLid = lb.dataset.lid === '1'; scene.setLid(packLid); $('#panel').querySelectorAll('[data-lid]').forEach(b => { b.classList.toggle('on', b === lb); b.setAttribute('aria-pressed', b === lb); }); return; }
  const rd = e.target.closest('[data-ready]'); if (rd) { loadReady(rd.dataset.ready); return; }
  const rgt = e.target.closest('[data-readygrp]'); if (rgt) { readyGroup = rgt.dataset.readygrp; render(false); return; }   // sample section — without changing the build
  const gt = e.target.closest('[data-symgrp]'); if (gt) { symGroup = gt.dataset.symgrp; render(false); return; }   // symbol theme — without changing the build
  const b = e.target.closest('[data-set]');
  if (b) { const path = b.dataset.set, v = b.dataset.v, prevSym = st.symbol.id; commit(s => { setPath(s, path, v); if (path === 'frame.id' && !b.dataset.keep) s.frame.opts = {};
      if (path === 'frame.metal') for (const o of frameOf(cat, s).options) if (o.metal_of === 'SCREW' && s.frame.opts?.[o.id] && s.frame.opts[o.id] !== '0' && !screwMetals(cat, v).includes(s.frame.opts[o.id])) s.frame.opts[o.id] = '0';   // screws of another group — in the frame colour
      if (path === 'light.tex' && v !== '0') s.light.laser = '0';            // texture and laser do not combine; satin is applied over the texture
      if (path === 'light.laser' && v !== '0') s.light.tex = '0';
      if (path.startsWith('light.')) fixLight(s);
      if (path === 'symbol.id' && v === '0' && prevSym !== '0') lastSym = prevSym;   // "Without symbol" → "With symbol" brings back the previous symbol
      if (path === 'symbol.id' && v !== '0') { const sy = cat.symbols.find(x => x.id === v); lastSym = v; if (v !== prevSym) s.symbol.d = sy.d;   // "With symbol" when a symbol is already selected — without resetting the size
        if (sy.base && v !== prevSym) s.symbol.base = { f: 'S', m: '0', e: '1', ...(sy.base.default || {}) }; }
      if (path.startsWith('symbol.')) enamelOnly(s); }, path.startsWith('plaque') ? 'plaque' : 'symbol');   // symbol change — that symbol's default base (Pobedonosets, 13.11.2026: enamel; Mercedes — satin)
    if (/^(symbol|plaque)\.(id)$/.test(path)) scene.focus(STEPS[step][0]); if (path === 'wall') scene.focus('screen'); return; }
  if (e.target.id === 'saveSpec') saveSpec(e.target);
  if (e.target.id === 'saveDesign') saveSpec(e.target, true);
  if (e.target.id === 'copyCode') copyCode(e.target);
  if (e.target.id === 'loadCode') { const r = openCode($('#codeIn').value);
    if (!r.ok) { toast([tr('Код не распознан: ') + r.why + '.', tr('Текущая сборка не изменена.')]); return; }   // audit, B2: garbage and an empty field do not overwrite the build
    remember(); step = 1; visited = new Set([1]); render();
    toast(notes.length ? [tr('Сборка открыта с изменениями:'), ...notes] : tr('Сборка открыта по коду.'), notes.length ? 12000 : 3000); }
});
// Input (audit, stage 3, T8): while typing, the scene is rebuilt with a delay, the field value is rewritten only if it
// has changed, the caret stays at the place of the edit. The action is closed by the change event (slider released, field lost focus)
let rangeTimer, rangeJob = null, textTimer, textJob = null;
const editStart = () => remember();
const buildLater = job => { textJob = job; clearTimeout(textTimer); textTimer = setTimeout(flushBuild, 180); };
const flushBuild = () => { clearTimeout(textTimer); if (textJob) { const j = textJob; textJob = null; j(); } };
// rewrite the field value keeping the caret position: removed — how many characters were removed before the caret
const setValueKeepCaret = (el, v, removed) => { const pos = Math.max(0, Math.min(v.length, (el.selectionStart ?? v.length) - removed)); el.value = v; try { el.setSelectionRange(pos, pos); } catch {} };
$('#panel').addEventListener('input', e => {
  if (e.target.dataset.range) { const path = e.target.dataset.range, v = +e.target.value; e.target.nextElementSibling.textContent = mm1(v); e.target.setAttribute('aria-valuetext', mm1(v));
    clearTimeout(rangeTimer); const moved = e.target.dataset.moved; editStart();
    rangeJob = () => { rangeJob = null; setPath(st, path, v); notes = applyRules(cat, st, moved).notes; scene.build(st);
      showCode(encode(st)); $('#price').textContent = priceText();
      document.querySelectorAll('[data-range]').forEach(r => { const val = r.dataset.range.split('.').reduce((o, k) => o[k], st); if (+r.value !== val) { r.value = val; r.nextElementSibling.textContent = mm1(val); } }); };
    rangeTimer = setTimeout(() => rangeJob?.(), 30); }
  if (e.target.id === 'ptext' || e.target.id === 'ptext2') { editStart();
    for (const el of [$('#ptext'), $('#ptext2')]) if (el) { const c = cleanPlaqueLine(el.value, cat.plaque_text_max);   // audit, L2: the character set and the length are in the state, not only in the field attribute
      if (c !== el.value) setValueKeepCaret(el, c, el.value.length - c.length); }
    const l1 = $('#ptext')?.value || '', l2 = $('#ptext2')?.value || ''; st.plaque.text = l2.trim() ? `${l1}\n${l2}` : l1; showCode(encode(st)); buildLater(() => scene.build(st)); }
  if (e.target.dataset.side) { const s = e.target.dataset.side, el = e.target, raw = el.value, clean = sanitizeSide(raw), f = fit(SE, st.model, s, raw); editStart();
    // capitals, allowed characters, no wider than the area. Characters removed as invalid were at the caret; those that did not fit — at the end of the line
    if (raw !== f.text) setValueKeepCaret(el, f.text, raw.length - clean.length);
    const msg = $(`#side_${s}_msg`), over = [...clean.trimEnd()].length - [...f.text.trimEnd()].length;                 // L1: the excess is not entered — and the user is told so
    if (msg) { msg.hidden = over <= 0; if (over > 0) msg.textContent = tr`Больше не помещается: область гравировки на этой грани — ${f.L.toFixed(1).replace('.', INTL ? '.' : ',')} мм. ${over === 1 ? tr('Последний знак не добавлен') : tr('Последние знаки (') + over + tr(') не добавлены')}.`; }
    st.side[s] = f.text; $(`#side_${s}_left`).innerHTML = sideLeft(f); showCode(encode(st)); $('#price').textContent = priceText();
    buildLater(() => { scene.build(st); scene.focusSide(s); }); }
});
// Audit 18.11.2026, 1.1: the field loses focus as soon as another panel button is pressed, and a re-render at that moment replaced the button under the finger —
// the first click after typing text was lost. Until the press has finished, the re-render is deferred to the end of the click
let pressing = false, renderDue = false;
addEventListener('pointerdown', () => { pressing = true; }, true);
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => setTimeout(() => { pressing = false; if (renderDue) { renderDue = false; render(false); } }, 0), true);
$('#panel').addEventListener('change', e => { if (e.target.dataset.range || e.target.id === 'ptext' || e.target.id === 'ptext2' || e.target.dataset.side) { clearTimeout(rangeTimer); rangeJob?.(); flushBuild();
  if (pressing) renderDue = true; else render(false); } });
$('#panel').addEventListener('focusin', e => { if (e.target.dataset.side) scene.focusSide(e.target.dataset.side); });
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; go(+b.dataset.i); });
function go(i) { step = Math.max(0, Math.min(STEPS.length - 1, i)); visited.add(step); notes = []; render(true); $('#panel').scrollTop = 0; }
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#start').hidden && st.mode) showStart(false); });   // Esc on the type selection screen — return to the build
// ---------- Menu bottom sheet on a phone (audit, stage 6, E9) ----------
// "mid" — the default height: by content, but no higher than half the screen (the phone is fully visible above the sheet). The handle can be dragged:
// the sheet follows the finger and stays where it was released ("free", up to 85 % of the screen); at the very bottom — it collapses to the tabs ("min").
// The sheet lies on top of the viewport: the scene size does not change, the framing shifts to the visible part.
// That there are more options below is shown by a half-cut row and a fade at the bottom edge.
const isMobile = () => !matchMedia('(min-width: 900px)').matches;
let sheetState = 'mid'; const appH = () => $('#app').clientHeight;   // height of the configurator screen (innerHeight gives a different number when the page is zoomed)
function sheetSizes() { const pn = $('#panel'), kids = pn.children, chrome = $('#handle').offsetHeight + $('#tabs').offsetHeight, row = $('#viewport').clientHeight;
  let top = Infinity, bot = -Infinity; for (const k of kids) { const r = k.getBoundingClientRect(); if (r.height) { top = Math.min(top, r.top); bot = Math.max(bot, r.bottom); } }   // hidden elements (the message under the field) are not counted
  const content = bot > top ? bot - top + 28 : 0, want = chrome + content;                         // height of the content, not of the scroll window
  const mid = Math.max(chrome, Math.min(want, Math.round(appH() * 0.5), row - 8)), max = Math.max(mid, Math.min(want, Math.round(appH() * 0.85), row - 8));
  return { min: chrome, mid, max, chrome, more: max > mid + 8 }; }
// the bottom edge of the mid sheet cuts a row of options roughly in half — it is clear that the list continues
function peek(h, chrome) { const pn = $('#panel'), base = pn.getBoundingClientRect().top; let best = null;
  for (const e of pn.querySelectorAll('.sw, .card, .row, .detail, .only, .grptab, input[type=text], .spec > div')) { const r = e.getBoundingClientRect(); if (!r.height) continue;
    const c = Math.round(chrome + r.top - base + Math.min(r.height, 88) * 0.5);     // the sheet height at which this row is half visible
    if (c >= chrome + 96 && c <= h + 36 && (best == null || Math.abs(c - h) < Math.abs(best - h))) best = c; }   // the row nearest to half the screen; above the half — by no more than 36 px
  return best ?? h; }
function applySheet(h, live) { const sh = $('#sheet'); sh.classList.toggle('drag', !!live); sh.style.height = h + 'px';
  $('#viewport').style.setProperty('--inset', h + 'px'); scene.setInset(Math.min(h, Math.round(appH() * 0.5) + 36), live); }   // the expanded sheet does not change the framing: it stays as for the mid one
function fitSheet() { const sh = $('#sheet');
  if (!isMobile()) { sh.style.height = ''; sh.classList.remove('drag'); $('#viewport').style.setProperty('--inset', '0px'); scene.setInset(0); updMore(); return; }
  const z = sheetSizes();
  // "free" — the height the user set themselves: the sheet stays where it was released (owner's change 15.11.2026), and no higher than the content
  applySheet(sheetState === 'free' ? Math.max(z.min, Math.min(z.max, sheetFree)) : sheetState === 'mid' && z.more ? peek(z.mid, z.chrome) : z[sheetState]); sh.dataset.state = sheetState;
  $('#handleLbl').textContent = sheetState === 'min' ? tr('Открыть меню') : tr('Свернуть меню');
  $('#handle').setAttribute('aria-expanded', sheetState !== 'min'); requestAnimationFrame(updMore); setTimeout(updMore, 360); }
function setSheet(state) { sheetState = state; fitSheet(); }
let sheetFree = null;                                                             // sheet height set by finger (px)
const nextSheet = () => sheetState === 'min' ? (sheetFree ? 'free' : 'mid') : 'min';   // tap on the handle: collapse — restore the previous height
{ const hd = $('#handle'); let d = null;                                           // the handle can be dragged: the sheet follows the finger and settles in the nearest position
  hd.addEventListener('pointerdown', e => { if (!isMobile()) return; d = { y: e.clientY, h: $('#sheet').offsetHeight, moved: false, z: sheetSizes() }; try { hd.setPointerCapture(e.pointerId); } catch {} });
  hd.addEventListener('pointermove', e => { if (!d) return; const dy = e.clientY - d.y; if (Math.abs(dy) > 6) d.moved = true; if (d.moved) applySheet(Math.max(d.z.min, Math.min(d.z.max, d.h - dy)), true); });
  const end = () => { if (!d) return; const dd = d; d = null; if (!dd.moved) { setSheet(nextSheet()); return; }
    const h = $('#sheet').offsetHeight; if (h < dd.z.min + 28) { setSheet('min'); return; }     // released at the very bottom — collapsed
    sheetFree = h; sheetState = 'free'; fitSheet(); };                                           // otherwise it stays where it was released
  hd.addEventListener('pointerup', end); hd.addEventListener('pointercancel', () => { if (d) { d = null; fitSheet(); } });
  hd.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheet(nextSheet()); } }); }
// a fade at the bottom edge of the panel instead of the "More below" badge (E2): it is clear that the list continues, and nothing is covered
function updMore() { const pn = $('#panel'), mob = isMobile();
  $('#sheet').classList.toggle('more', !(mob && sheetState === 'min') && pn.scrollHeight - pn.clientHeight - pn.scrollTop > 12);
  const vp = $('#viewport'); vp.classList.toggle('tight', vp.clientHeight - (mob ? $('#sheet').offsetHeight : 0) < 220); }   // little room: the controls hint is hidden
$('#panel').addEventListener('scroll', updMore);   // the list scrolls inside the sheet; only the user changes the sheet height
addEventListener('resize', () => fitSheet());
document.fonts?.ready.then(() => fitSheet());   // the UI font has finished loading — the content height has changed
// desktop: the step list and the "Build" block
$('#stepList').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(+b.dataset.i); });
$('#copyD').onclick = e => copyCode(e.currentTarget);
// "Download specification" moved to the "Summary" step, under "Download design" (owner's change 18.11.2026).
// "Sample builds": cards from cat.ready in the panel of the first section. A click opens the build by its code via the same path as "Open by code";
// the section stays open — the samples can be browsed and viewed in 3D. The sample currently on screen unchanged is marked
let readyOn = null;   // { id, code } of the last opened sample
// Sample sections (owner's change 23.11.2026): buttons above the cards — cat.ready_groups; a sample belongs to a section by its group field.
// Sections without samples are not shown (international versions have no heraldry); samples without a group (light customisation) — no buttons.
// A cover sample is a full-card render without a caption: its name goes to aria-label
let readyGroup = null;   // section open in the samples menu (UI only)
function panelReady() { const all = readyList(), cur = readyOn && readyOn.code === encode(st) ? readyOn.id : null;
  const grps = (cat.ready_groups || []).filter(g => all.some(d => d.group === g.id));
  if (grps.length && !grps.some(g => g.id === readyGroup)) readyGroup = all.find(d => d.id === cur)?.group || grps[0].id;
  const list = grps.length ? all.filter(d => d.group === readyGroup) : all;
  return tr`<p class="muted rg-lead">Выберите пример — он откроется в конструкторе, и его можно изменить под себя.</p>
    ${grps.length > 1 ? `<div class="grptabs rg-tabs">${grps.map(g => `<button type="button" class="grptab ${g.id === readyGroup ? 'on' : ''}" aria-pressed="${g.id === readyGroup}" data-readygrp="${esc(g.id)}"><b>${esc(g.name)}</b></button>`).join('')}</div>` : ''}
    <div class="rgrid">${list.map(d => `<button type="button" class="rg${d.cover ? ' cover' : ''}${d.id === cur ? ' on' : ''}" data-ready="${esc(d.id)}" aria-pressed="${d.id === cur}"${d.cover ? ` aria-label="${esc(d.name)}" title="${esc(d.name)}"` : ''}>${d.cover
      ? `<img src="${esc(d.img)}" alt="" width="560" height="956" loading="lazy">` : `<img src="${esc(d.img)}" alt="" width="460" height="972" loading="lazy"><b>${esc(d.name)}</b>`}</button>`).join('')}</div>`; }
// each customisation type has its own samples: light — those marked mode "light" in the catalogue, full — those without the mark (owner's change 19.11.2026)
const readyList = () => (cat.ready || []).filter(d => (d.mode || 'full') === (st.mode === 'light' ? 'light' : 'full'));
function loadReady(id) { const d = (cat.ready || []).find(x => x.id === id); if (!d) return; const r = openCode(d.code);
  if (!r?.ok) { toast([tr('Этот пример открыть не удалось.'), tr('Текущая сборка не изменена.')]); return; }
  remember(); notes = []; readyOn = { id: d.id, code: encode(st) }; render(true); readyOn.code = encode(st);
  toast(r.notes.length ? [tr`Открыт пример «${d.name}» с изменениями:`, ...r.notes] : tr`Открыт пример «${d.name}». Его можно изменить под себя.`, r.notes.length ? 12000 : 3000); }
function showCode(code) { $('#codeD').textContent = code; saveLast(code); }
// Copying (audit, stage 8, T12): "Copied" — only if the browser really copied; otherwise the code is selected for manual copying
async function copyText(text) { try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
  try { const i = document.createElement('textarea'); i.value = text; i.setAttribute('readonly', ''); i.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
    ($('#dlg').open ? $('#dlg') : document.body).append(i); i.select(); const ok = document.execCommand('copy'); i.remove(); return ok; } catch { return false; } }
async function copyCode(btn) { const ok = await copyText(encode(st)), short = btn.id === 'copyD'; btn.dataset.t ??= btn.textContent;
  btn.textContent = ok ? (short ? '✓' : tr('Скопировано')) : (short ? '✕' : tr('Не скопировано')); setTimeout(() => { btn.textContent = btn.dataset.t; }, 1800);
  if (!ok) { const f = $('#dlg').open ? $('#dlgBody input[readonly]') : $('#codeIn'); f?.focus(); f?.select();
    if (!$('#dlg').open) toast([tr('Браузер не дал скопировать код.'), f ? tr('Код выделен — скопируйте его вручную.') : tr('Откройте шаг «Итог» и скопируйте код из поля «Код сборки».')]); } }
// step value for the step list (desktop)
function stepValue(k) {
  const m = cat.models[st.model], f = x => x || '—';
  if (k === 'model') return m.name;
  if (k === 'body') return `${f(cat.colors.find(c => c.id === st.color)?.name)} · ${f(cat.storage.find(s => s.id === st.storage)?.name)}`;
  if (k === 'g10') return f(cat.g10.find(c => c.id === st.g10)?.name);
  if (k === 'plate') return `${f(cat.plates.find(x => x.id === st.plate.id)?.name)} · ${f(metalName(st.plate.metal))}`;
  if (k === 'frame') return `${f(frameOf(cat, st)?.name)} · ${f(metalName(st.frame.metal))}`;
  if (k === 'insert') return f(cat.inserts.find(x => x.id === st.insert)?.name);
  if (k === 'symbol') return st.symbol.id === '0' ? tr('Без символа') : f(cat.symbols.find(x => x.id === st.symbol.id)?.name);
  if (k === 'plaque') return st.plaque.id === '0' ? tr('Без таблички') : `«${(st.plaque.text || '…').replace(/\n/g, ' / ')}»`;
  if (k === 'side') return [st.side?.l, st.side?.r].filter(x => (x || '').trim()).map(x => `«${x.trim()}»`).join(' · ') || tr('Без гравировки');
  if (k === 'panel') return lightDesc().map(r => r[1]).join(' · ');
  if (k === 'pack') return f((cat.packs || []).find(x => x.id === st.pack)?.short || tr('Футляр Royal Gift'));
  if (k === 'summary') return PRICE_ON ? '≈ ' + priceText() : PRICE_ASK;
  return '';
}
// Enquiry (owner's change 15.11.2026: "the same enquiry form window" as in the Zodiac configurator on caviar-phones.ru): name, phone
// with the mask +7(___)___-__-__, email, messenger, comment, consent; validation and texts — as in Zodiac. Sending — POST FormData to
// LEAD_ENDPOINT with the same set of fields as Zodiac (code, link, specification, price, specification image). The enquiry receiver is
// /ajax/api/ of the Caviar site: enabled only when the configurator is opened on caviar-phones.ru; on the test page (GitHub Pages)
// the enquiry is not sent anywhere, and the thank-you window says so honestly
const LEAD_ENDPOINT = LANG === 'ru' && /(^|\.)caviar-phones\.ru$/.test(location.hostname) ? '/ajax/api/' : null;
const POLICY_URL = INTL ? 'https://caviar.global/info/legal-information/' : 'https://caviar-phones.ru/info/warranty/';   // the same link as in the Zodiac form
const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
function phoneMask(inp) {
  if (INTL) { inp.placeholder = '+971 56 173 4747'; inp.maxLength = 30; return; }   // +7(XXX)XXX-XX-XX: digits after +7; 8 or 7 at the start of the number is the country code
  let prevN = 0;
  const fmtP = v => { let d = v.replace(/\D/g, ''); if (v.startsWith('+7')) d = d.slice(1);   // the mask's "+7" is not a digit of the number
    if (d.length === 11 && /^[78]/.test(d)) d = d.slice(1);                                     // a whole number was pasted: 8 / 7 is the country code
    else if (prevN === 0 && d.length === 1 && /[78]/.test(d)) d = '';                           // the first typed 8 / 7 is the country code
    d = d.slice(0, 10);
    const t = '+7(___)___-__-__'.split(''); let i = 0; for (let k = 0; k < t.length && i < d.length; k++) if (t[k] === '_') t[k] = d[i++]; return { s: t.join(''), n: d.length }; };
  const put = () => { const r = fmtP(inp.value); inp.value = r.s; prevN = r.n; const pos = r.n ? [3, 4, 5, 7, 8, 9, 11, 12, 14, 15][r.n - 1] + 1 : 3; inp.setSelectionRange(pos, pos); };
  inp.value = '+7(___)___-__-__'; inp.addEventListener('input', put); inp.addEventListener('focus', () => setTimeout(put, 0));
  inp.addEventListener('keydown', e => { if (e.key !== 'Backspace' || inp.selectionStart !== inp.selectionEnd) return; e.preventDefault();
    const r = fmtP(inp.value); let d = inp.value.replace(/\D/g, '').slice(1); d = d.slice(0, Math.max(0, r.n - 1)); inp.value = d; put(); }); }
async function sendLead(d) {
  const p = PRICE_ON ? safePrice() : { total: NaN }, code = encode(st), est = Number.isFinite(p.total) ? fmt(p.total) : '';
  const spec = specRows().map(([k, v]) => `${k}: ${v}`).join('\n') + (est ? tr`\nОриентировочно: ≈ ${est}` : '');
  const fields = { a: 'contructor-zodiac', title: 'Contructor-iPhone-18-Pro', name: d.name, phone: d.phone, email: d.email, messenger: d.messenger || '', comment: d.comment || '',
    code, link: buildUrl(code), spec, price: est, price_rub: est, lang: LANG, page: location.href };
  if (!LEAD_ENDPOINT) { console.warn(tr('[Конструктор iPhone 18 Pro] тестовая страница — заявка не отправлена. Данные заявки:'), fields); await new Promise(r => setTimeout(r, 600)); return false; }
  const fd = new FormData(); Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  try { await prepSpec(); const { canvas } = await drawSpec(); const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.88)); if (blob) fd.append('image', blob, `Caviar-iPhone-18-Pro-${code.slice(0, 60)}.jpg`); } catch (e) { /* no image */ }
  const r = await fetch(LEAD_ENDPOINT, { method: 'POST', body: fd }); if (!r.ok) throw new Error(r.status);
  const j = await r.json(); if (!j || String(j.success).toLowerCase() !== 'true') throw new Error('success=false'); return true; }
function leadThanks(sent) {
  $('#dlgBody').innerHTML = tr`<button type="button" class="dlg-x" aria-label="Закрыть">${X_ICON}</button>
    <div class="lead-thanks"><h3>${sent ? tr('Заявка принята') : tr('Заявка не отправлена')}</h3><p class="lead-lead">${sent ? tr`Ваш ${esc(cat.models[st.model].name)} уже обрёл форму. Менеджер Caviar свяжется с вами, чтобы обсудить детали и сроки изготовления.`
      : tr('Это тестовая страница конструктора: форма заполнена верно, но заявка никуда не ушла. На сайте Caviar она сразу попадёт менеджеру.')}</p>
    ${internationalManagerCard()}<button type="button" class="lead-cta" id="leadBack">Вернуться к конструктору</button></div>`;
  $('#dlgBody .dlg-x').onclick = $('#leadBack').onclick = () => $('#dlg').close(); }
// International manager details are also available from the enquiry form.
function internationalManagerCard() {
  if (!INTL) return '';
  const T = LANG === 'zh' ? { title: '聯絡您的專屬顧問', phone: '電話', site: '網站', hello: n => `${n} 您好，我想洽詢這款 Caviar 設計：` }
    : { title: 'Contact your manager', phone: 'Phone', site: 'Website', hello: n => `Hello ${n}, I would like to discuss this Caviar design: ` };
  const m = cat.manager, message = T.hello(m.name) + buildUrl(encode(st));
  return `<div class="manager-contact"><h4>${T.title}</h4><strong>${esc(m.name)}</strong>
    <dl><div><dt>${T.phone}</dt><dd><a href="tel:${m.phone.replace(/[^+0-9]/g, '')}">${esc(m.phone)}</a></dd></div>
    <div><dt>Email</dt><dd><a href="mailto:${m.email}?subject=Caviar%20iPhone%2018%20Pro&amp;body=${encodeURIComponent(message)}">${esc(m.email)}</a></dd></div>
    <div><dt>Telegram</dt><dd><a href="https://t.me/${m.telegram.slice(1)}" target="_blank" rel="noopener">${esc(m.telegram)}</a></dd></div>
    <div><dt>WhatsApp</dt><dd><a href="https://wa.me/${m.whatsapp}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">${esc(m.whatsapp)}</a></dd></div>
    <div><dt>${T.site}</dt><dd><a href="https://${m.site}" target="_blank" rel="noopener">${esc(m.site)}</a></dd></div></dl></div>`;
}
$('#order').onclick = () => { prepSpec(); $('#dlg').setAttribute('aria-label', tr('Заявка'));   // the build code is not shown in the form (owner's change 18.11.2026); it goes into the enquiry from sendLead
  $('#dlgBody').innerHTML = tr`<button type="button" class="dlg-x" aria-label="Закрыть">${X_ICON}</button>
    <h3>Заявка на ${esc(cat.models[st.model].name)}</h3>
    <p class="lead-lead">Менеджер Caviar свяжется с вами и уточнит детали.</p>
    <div class="lead-form">
      <label class="lead-f"><span>Имя *</span><input name="name" type="text" autocomplete="name" required></label>
      <label class="lead-f"><span>Телефон *</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" required></label>
      <label class="lead-f"><span>Email *</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="lead-f"><span>Мессенджер</span><select name="messenger"><option value="">Не важно</option><option value="Telegram">Telegram</option><option value="WhatsApp">WhatsApp</option></select></label>
      <label class="lead-f"><span>Комментарий</span><textarea name="comment" rows="3"></textarea></label>
      <label class="lead-consent"><input type="checkbox" name="consent"><span>Я согласен на обработку персональных данных и принимаю <a href="${POLICY_URL}" target="_blank" rel="noopener">политику конфиденциальности</a></span></label>
      <p class="lead-err" role="alert"></p>
      <button type="submit" class="lead-cta">Отправить заявку</button>
    </div>${internationalManagerCard()}`;
  const form = $('#dlgBody'), el = n => form.elements[n], err = form.querySelector('.lead-err'), submit = form.querySelector('.lead-cta');
  form.noValidate = true; phoneMask(el('phone')); $('#dlgBody .dlg-x').onclick = () => $('#dlg').close();
  form.onsubmit = e => { e.preventDefault(); const d = {}; new FormData(form).forEach((v, k) => { d[k] = String(v).trim(); });
    const digits = (d.phone.match(/\d/g) || []).length;
    const bad = { name: !d.name, phone: INTL ? !/^(?:\+|00)?[0-9][0-9 ()./-]{5,29}$/.test(d.phone.trim()) || digits < 7 || digits > 17 : digits < 11, email: !d.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) };
    ['name', 'phone', 'email'].forEach(k => { el(k).classList.toggle('is-invalid', bad[k]); el(k).setAttribute('aria-invalid', bad[k] ? 'true' : 'false'); });
    const first = ['name', 'phone', 'email'].find(k => bad[k]);
    if (first || !el('consent').checked) { err.textContent = !d.name || digits <= 1 || !d.email || !el('consent').checked ? tr('Заполните имя, телефон и email и подтвердите согласие') : bad.phone ? tr('Проверьте номер телефона') : tr('Проверьте адрес email');
      if (first) el(first).focus(); return; }
    err.textContent = ''; submit.disabled = true; submit.textContent = tr('Отправляем…');
    sendLead(d).then(sent => { if (sent) goal('constructor_form_submit'); leadThanks(sent); }).catch(() => { err.textContent = tr('Не удалось отправить. Попробуйте ещё раз или свяжитесь с нами напрямую.'); submit.disabled = false; submit.textContent = tr('Отправить заявку'); }); };
  $('#dlg').showModal(); goal('constructor_form_open'); setTimeout(() => el('name').focus({ preventScroll: true }), 30);
  $('#dlg').onclick = e => { const r = $('#dlg').getBoundingClientRect();   // a click on the backdrop (outside the window) — close, as in Zodiac
    if (e.target === $('#dlg') && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) $('#dlg').close(); }; };
// the controls hint — by device type (E5); shown once, when a build is open
$('#hint').textContent = matchMedia('(pointer: coarse)').matches ? tr('Вращайте одним пальцем, приближайте и сдвигайте двумя') : tr('Вращайте мышью, приближайте колесом, сдвигайте с Shift');
// navigation panel (16.11.2026): rotate / pan, zoom in / zoom out, reset view
$('#nav').addEventListener('click', e => { const b = e.target.closest('[data-nav]'); if (!b || b.disabled) return; const a = b.dataset.nav;
  if (a === 'rotate' || a === 'pan') { scene.setNav(a); $('#nav').querySelectorAll('[data-nav=rotate],[data-nav=pan]').forEach(x => x.setAttribute('aria-pressed', x === b)); }
  else if (a === 'in') scene.zoomBy(0.8); else if (a === 'out') scene.zoomBy(1.25); });
function navForStep(k) { const pb = $('#nav [data-nav=pan]'), pack = k === 'pack'; pb.disabled = pack;   // in packaging, panning is disabled (horizontal rotation, 14.11.2026)
  if (pack && scene.navMode === 'pan') { scene.setNav('rotate'); $('#nav [data-nav=rotate]').setAttribute('aria-pressed', 'true'); pb.setAttribute('aria-pressed', 'false'); } }
let hinted = false; function hintOnce() { if (hinted) return; hinted = true; const h = $('#hint'); h.style.opacity = 1; setTimeout(() => { h.style.opacity = 0; }, 6000); }
// start screen and the "Change customisation type" button
document.body.insertAdjacentHTML('beforeend', tr('<div id="start" role="dialog" aria-modal="true" aria-label="Вид кастомизации" hidden></div>'));
$('#start').addEventListener('click', e => { const b = e.target.closest('[data-mode], .sp[data-m]'); if (b && !e.target.closest('.st-foot')) { startMode(b.dataset.mode || b.dataset.m); return; }
  if (e.target.closest('[data-back]')) { showStart(false); return; }
  if (e.target.closest('[data-resume]')) { const last = readLast(), r = last && openCode(last.code);                       // L13: the saved code goes through the same check as a code from a link
    if (!r?.ok) { try { localStorage.removeItem(LAST); } catch {} toast([tr('Сохранённую сборку открыть не удалось.'), tr('Выберите вид кастомизации и соберите дизайн заново.')]); renderStart(); return; }
    step = 1; visited = new Set([1]); showStart(false); render(true);
    toast(r.notes.length ? [tr('Сборка открыта с изменениями:'), ...r.notes] : tr('Сборка открыта — продолжайте с того места, где остановились.'), r.notes.length ? 12000 : 4000); } });
// Header (owner's change 15.11.2026): a single "Close" button — exit to the customisation type selection. There is no undo, reset, "Customisation type" button
// or full-screen mode. The build is not reset on exit: the selection screen has "Return to the build"
$('#closeBtn').onclick = () => showStart(true);
fixLight(st); notes.push(...fitSides()); const loadNotes = [...notes]; applyRules(cat, st); render(true); showStart(!st.mode);
// audit, B2: the result of opening a link is visible to the customer — the code was not recognised or was opened with substitutions
if (badUrlCode) toast([tr('Код сборки из ссылки не распознан: ') + badUrlCode + '.', tr('Выберите вид кастомизации и соберите дизайн заново.')], 12000);
else if (loadNotes.length) toast([tr('Сборка открыта с изменениями:'), ...loadNotes], 12000);

// ---------- Interactive guide (owner's task 19.11.2026) ----------
// The "Guide" button in the header starts the tutorial: a backdrop with a "window" around the target element, with an explanation next to it. The tutorial goes through all
// menu sections from the first to "Place order": first it asks to click the section in the menu, then explains its panel. While it runs, clicks
// outside the highlighted element do nothing. "Next" performs the step for the user, "Finish tutorial" and Esc stop it at any moment.
const TOUR_TXT = {
  ready: tr('Здесь готовые дизайны Caviar. Нажмите на любой пример — он откроется в конструкторе, и его можно изменить под себя. Или пропустите этот шаг и соберите дизайн с нуля.'),
  model: tr('Выберите iPhone, который станет основой изделия: Pro Max или Pro. От модели зависят размеры всех деталей.'),
  body: tr('Выберите цвет корпуса и объём памяти. Здесь же — заставка на экране, с которой смартфон показан в конструкторе.'),
  panel: tr('Панель спинки: выберите материал, фактуру или лазерную гравировку и их цвета.'),
  g10: tr('Кант — тонкая цветная полоса между корпусом и обрамлением. Выберите её цвет.'),
  plate: tr('Блок камер: выберите форму, фактуру и металл площадки вокруг камер.'),
  frame: tr('Обрамление — рама, которая задаёт характер всего дизайна. Выберите её дизайн, металл и отделку.'),
  insert: tr('Вкладка заполняет окно обрамления: кожа, карбон или металл с узором. Выберите материал и цвет.'),
  symbol: tr('Символ — объёмная эмблема на спинке. Выберите его из каталога, задайте металл, размер и положение.'),
  plaque: tr('Табличка с вашим текстом: имя, дата, девиз. Выберите форму и шрифт, впишите текст и поставьте табличку на место.'),
  side: tr('Гравировка на боковых гранях корпуса. Впишите текст — конструктор покажет его на грани.'),
  pack: tr('Упаковка: выберите футляр, в котором приедет смартфон, и рассмотрите его со всех сторон.'),
  summary: tr('Итог: вся сборка одним списком. Здесь можно скачать картинку дизайна и спецификацию, а также скопировать код сборки, чтобы вернуться к ней позже.'),
};
const tour = { on: false, i: 0, list: [], hole: null, pop: null };
const tourVis = e => !!e && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0;
function tourSteps() { const a = [
    { sel: '#viewport', inside: true, title: tr('Ваш смартфон'), text: tr('Это ваш будущий смартфон в 3D. Вращайте его мышью или пальцем, приближайте колесом мыши или двумя пальцами. Все изменения сразу видны на модели.') },
    { sel: '#nav', title: tr('Управление видом'), text: tr('Этими кнопками переключается вращение и перемещение модели, а «+» и «−» приближают и отдаляют её.') }];
  STEPS.forEach(([k, n], i) => { a.push({ menu: i, title: n, text: tr`Нажмите «${n}» в меню разделов.` }); a.push({ sel: '#panel', title: n, text: TOUR_TXT[k] || tr('Выберите нужные параметры в этом разделе.') }); });
  a.push({ sel: '#order', last: true, title: tr('Оформление заказа'), text: tr('Когда дизайн готов, нажмите «Оформить заказ»: откроется форма заявки, а менеджер Caviar свяжется с вами и подтвердит стоимость. На этом обучение завершено.') });
  return a; }
function tourTarget(s) { if (s.menu != null) return [...document.querySelectorAll(`#stepList button[data-i="${s.menu}"], #tabs button[data-i="${s.menu}"]`)].find(tourVis) || null;
  if (s.sel === '#panel') return tourVis($('#stepList')) ? $('#panel') : $('#sheet');
  const e = $(s.sel); return tourVis(e) ? e : null; }
function tourStart() { if (tour.on || !st.mode || !$('#start').hidden) return;
  tour.hole = Object.assign(document.createElement('div'), { id: 'tourHole' }); tour.hole.setAttribute('aria-hidden', 'true');
  tour.pop = Object.assign(document.createElement('div'), { id: 'tourPop' }); tour.pop.setAttribute('role', 'dialog'); tour.pop.setAttribute('aria-label', tr('Инструкция')); tour.pop.setAttribute('aria-live', 'polite');
  document.body.append(tour.hole, tour.pop); document.body.classList.add('touring'); $('#toast')?.setAttribute('hidden', '');
  tour.pop.onclick = e => { if (e.target.closest('[data-tour="next"]')) tourNext(true); else if (e.target.closest('[data-tour="end"]')) tourEnd(); };
  tour.list = tourSteps(); tour.on = true; tour.i = -1; tourNext(false); requestAnimationFrame(tourPlace); }
function tourShow() { const s = tour.list[tour.i], n = tour.list.length;
  tour.pop.innerHTML = tr`<small>Инструкция · шаг ${tour.i + 1} из ${n}</small><b>${esc(s.title)}</b><p>${esc(s.text)}</p>
    <div class="tour-b"><button type="button" class="tour-end" data-tour="end">Закончить обучение</button><button type="button" class="tour-next" data-tour="next">${s.last ? tr('Готово') : tr('Далее')}</button></div>`;
  tour.hole.classList.toggle('flat', !!s.inside);
  if (s.menu != null) tourTarget(s)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  tour.pop.querySelector('.tour-next').focus({ preventScroll: true }); }
// byBtn — the step was made with the "Next" button: the menu section is opened for the user
function tourNext(byBtn) { if (!tour.on) return; const s = tour.list[tour.i];
  if (s?.last) { tourEnd(true); return; }
  if (byBtn && s?.menu != null && step !== s.menu) go(s.menu);
  tour.i++; const nx = tour.list[tour.i]; if (!nx) { tourEnd(true); return; }
  if (nx.menu != null && step === nx.menu) { tour.i++; }                              // the section is already open — go straight to its explanation
  tourShow(); }
function tourEnd(done) { if (!tour.on) return; tour.on = false; tour.hole.remove(); tour.pop.remove(); document.body.classList.remove('touring'); $('#tourBtn')?.focus({ preventScroll: true });
  if (done === true) toast(tr('Обучение завершено. Инструкцию можно запустить снова кнопкой в шапке.'), 4000); }
function tourPlace() { if (!tour.on) return; const s = tour.list[tour.i], t = tourTarget(s), H = tour.hole, P = tour.pop, W = innerWidth, Hh = innerHeight;
  const pw = P.offsetWidth, ph = P.offsetHeight, cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v)); let x, y;
  if (!t) { H.style.cssText = `left:${W / 2}px;top:${Hh / 2}px;width:0;height:0`; x = (W - pw) / 2; y = (Hh - ph) / 2; }
  else { const r = t.getBoundingClientRect(), pad = s.inside ? 0 : 6, x0 = cl(r.left - pad, 2, W - 2), y0 = cl(r.top - pad, 2, Hh - 2), x1 = cl(r.right + pad, 2, W - 2), y1 = cl(r.bottom + pad, 2, Hh - 2);
    H.style.cssText = `left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px`;
    const g = 14, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, fx = v => cl(v, 8, W - 8 - pw), fy = v => cl(v, 8, Hh - 8 - ph);
    const c = s.inside ? [] : [[x0 - g - pw, fy(cy - ph / 2)], [x1 + g, fy(cy - ph / 2)], [fx(cx - pw / 2), y0 - g - ph], [fx(cx - pw / 2), y1 + g]];
    const ok = c.find(([a, b]) => a >= 8 && a <= W - 8 - pw && b >= 8 && b <= Hh - 8 - ph);
    [x, y] = ok || [fx(cx - pw / 2), fy(y0 + 16)]; }
  P.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; requestAnimationFrame(tourPlace); }
// while the tutorial runs, clicks outside the highlighted element do nothing; a click on the target menu section moves on
document.addEventListener('click', e => { if (!tour.on || tour.pop.contains(e.target)) return; const s = tour.list[tour.i], t = tourTarget(s);
  if (t && t.contains(e.target)) { if (s.last) tourEnd(); else if (s.menu != null) setTimeout(() => tourNext(false), 0); return; }
  e.preventDefault(); e.stopPropagation(); tour.hole.classList.remove('nudge'); void tour.hole.offsetWidth; tour.hole.classList.add('nudge'); }, true);
document.addEventListener('keydown', e => { if (tour.on && e.key === 'Escape') { e.stopPropagation(); tourEnd(); } }, true);
$('#tourBtn').onclick = tourStart;
