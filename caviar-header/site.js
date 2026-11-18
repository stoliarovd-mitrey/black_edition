// Caviar demo: слайдер, карусель, вкладки готовых сборок, форма заявки (демо — без отправки)
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // главный слайдер
  const hs = $('.hs');
  if (hs) {
    const track = $('.hs-track', hs), slides = $$('.item', track), dots = $('.hs-dots', hs);
    let i = 0, timer;
    slides.forEach((_, k) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Слайд ' + (k + 1)); b.onclick = () => go(k, true); dots.appendChild(b); });
    function go(k, user) {
      i = (k + slides.length) % slides.length;
      track.style.transform = `translateX(${-100 * i}%)`;
      $$('button', dots).forEach((b, n) => b.classList.toggle('on', n === i));
      slides.forEach((s, n) => s.setAttribute('aria-hidden', n === i ? 'false' : 'true'));
      // картинки текущего и соседних слайдов подставляем по мере листания (за краем ленты браузер их сам не грузит)
      [i, i + 1, i - 1].forEach(k => { const s = slides[(k + slides.length) % slides.length];
        $$('source[data-srcset]', s).forEach(el => { el.srcset = el.dataset.srcset; el.removeAttribute('data-srcset'); });
        $$('img[data-src]', s).forEach(el => { el.src = el.dataset.src; el.removeAttribute('data-src'); }); });
      // видео-фон, как на caviar-phones.ru: играет только активный слайд
      slides.forEach((s, n) => { const v = $('video', s); if (!v) return;
        if (n === i) { v.preload = 'auto'; v.addEventListener('playing', () => s.classList.add('vr'), { once: true }); v.play().catch(() => {}); }
        else v.pause(); });
      if (user) restart();
    }
    function restart() { clearInterval(timer); timer = setInterval(() => go(i + 1), 6500); }
    $('.hs-arrow.prev', hs).onclick = () => go(i - 1, true);
    $('.hs-arrow.next', hs).onclick = () => go(i + 1, true);
    let x0 = null;
    hs.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    hs.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1), true); x0 = null; });
    go(0); restart();
  }

  // карусели
  $$('.rail').forEach(r => {
    const t = $('.rail-track', r), step = () => t.clientWidth * 0.75;
    $('.rail-arrow.prev', r)?.addEventListener('click', () => t.scrollBy({ left: -step(), behavior: 'smooth' }));
    $('.rail-arrow.next', r)?.addEventListener('click', () => t.scrollBy({ left: step(), behavior: 'smooth' }));
  });

  // вкладки готовых сборок
  const tabs = $$('.tabs [role=tab]');
  function openTab(id, focus) {
    tabs.forEach(t => { const on = t.dataset.tab === id; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
    $$('.panel').forEach(p => p.classList.toggle('on', p.id === 'tab-' + id));
  }
  tabs.forEach((t, n) => {
    t.addEventListener('click', () => { openTab(t.dataset.tab); history.replaceState(null, '', '#' + t.dataset.tab); });
    t.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const k = (n + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; openTab(tabs[k].dataset.tab, true); } });
  });
  if (tabs.length) {
    const h = location.hash.slice(1), known = tabs.some(t => t.dataset.tab === h);
    openTab(known ? h : tabs[0].dataset.tab);
    if (known) setTimeout(() => $('#ready')?.scrollIntoView(), 50);
  }

  // «Заказать эту сборку» — подставляем сборку в форму
  const sel = $('#f-base');
  $$('[data-order]').forEach(a => a.addEventListener('click', () => {
    if (!sel) return;
    const v = a.dataset.order; if (![...sel.options].some(o => o.value === v)) sel.add(new Option(v, v));
    sel.value = v;
    const code = a.dataset.code, note = $('#f-code'); if (note) note.value = code || '';
  }));

  // форма — демо: ничего не отправляем
  const form = $('.form');
  form?.addEventListener('submit', e => { e.preventDefault(); form.classList.add('sent'); $('.ok', form).scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });

  // заявка, пришедшая с карточки товара: ?order=…&code=…
  const qs = new URLSearchParams(location.search);
  if (sel && qs.get('order')) {
    const v = 'Модель «' + qs.get('order') + '»';
    sel.add(new Option(v, v)); sel.value = v;
    const note = $('#f-code'); if (note && qs.get('code')) note.value = qs.get('code');
  }

  // каталог: сортировка и фильтр
  const list = $('.itemlist');
  if (list) {
    const items = $$('.item', list);
    $$('.sorting [data-sort]').forEach(b => b.addEventListener('click', () => {
      $$('.sorting [data-sort]').forEach(x => x.classList.toggle('active', x === b));
      const m = b.dataset.sort, pr = el => el.dataset.price ? +el.dataset.price : null;
      const sorted = items.slice().sort((a, c) => {
        if (m === 'pop') return a.dataset.pop - c.dataset.pop;
        if (m === 'date') return c.dataset.date - a.dataset.date;
        const pa = pr(a), pc = pr(c);                       // «цена по запросу» — в конце списка
        if (pa === null || pc === null) return (pa === null) - (pc === null);
        return m === 'asc' ? pa - pc : pc - pa;
      });
      sorted.forEach(el => list.appendChild(el));
    }));
    const fb = $('.btn-filter-show'), fo = $('.filter-opts');
    fb?.addEventListener('click', () => { const open = fo.hidden; fo.hidden = !open; fb.setAttribute('aria-expanded', open); });
    $$('.filter-opts [data-kind]').forEach(b => b.addEventListener('click', () => {
      $$('.filter-opts [data-kind]').forEach(x => x.classList.toggle('active', x === b));
      items.forEach(el => { el.hidden = b.dataset.kind !== 'all' && el.dataset.kind !== b.dataset.kind; });
    }));
  }

  // карточка товара: галерея
  const gal = $('.gallery');
  if (gal) {
    const tr = $('.g-track', gal), sl = $$('.slide', tr), nav = $$('.gnav li'), dots = $('.g-dots'), cnt = $('.g-count b');
    let g = 0;
    sl.forEach((_, k) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', 'Слайд ' + (k + 1)); b.onclick = () => show(k); dots.appendChild(b); });
    function show(k) {
      g = (k + sl.length) % sl.length; tr.style.transform = `translateX(${-100 * g}%)`;
      nav.forEach((li, n) => li.classList.toggle('active', n === g));
      $$('button', dots).forEach((b, n) => b.classList.toggle('on', n === g));
      if (cnt) cnt.textContent = g + 1;
      $$('img[loading="lazy"]', sl[(g + 1) % sl.length]).forEach(i => { i.loading = 'eager'; });
    }
    nav.forEach((li, n) => li.addEventListener('click', () => show(n)));
    $('.g-prev')?.addEventListener('click', () => show(g - 1));
    $('.g-next')?.addEventListener('click', () => show(g + 1));
    let gx = null;
    gal.addEventListener('touchstart', ev => { gx = ev.touches[0].clientX; }, { passive: true });
    gal.addEventListener('touchend', ev => { if (gx === null) return; const dx = ev.changedTouches[0].clientX - gx; if (Math.abs(dx) > 40) show(g + (dx < 0 ? 1 : -1)); gx = null; });
    show(0);
  }
  $$('.infobox .toggle').forEach(t => t.addEventListener('click', () => t.parentElement.classList.toggle('open')));

  // «Изменить в конструкторе»: модель и память из селектов попадают в код сборки
  const ctorBtn = $('.pbtn--ctor');
  if (ctorBtn) {
    const sm = $('#p-model'), ss = $('#p-mem'), order = $('[data-order-link]');
    const upd = () => {
      const code = ctorBtn.dataset.code.replace(/^A1-(PM|P)\.([A-Z]+)\.[^-]+/, `A1-${sm.value}.$2.${ss.value}`);
      ctorBtn.href = ctorBtn.dataset.ctor + '?code=' + code;
      if (order) order.href = order.href.split('?')[0] + '?order=' + encodeURIComponent('Держава') + '&code=' + encodeURIComponent(code) + '#request';
    };
    sm.addEventListener('change', upd); ss.addEventListener('change', upd); upd();
  }

  // мягкое появление блоков
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
  $$('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('in'));
})();
