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

  // мягкое появление блоков
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
  $$('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('in'));
})();
