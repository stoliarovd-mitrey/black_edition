(() => {
  const video = document.querySelector('#hero-film');
  if (!video) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = true, failed = false;
  const sync = () => {
    if (motion.matches || failed) { video.pause(); video.classList.remove('is-playing'); return; }
    if (!video.getAttribute('src')) video.src = video.dataset.src;
    if (visible && !document.hidden) video.play().catch(() => {});
    else video.pause();
  };
  video.addEventListener('playing', () => video.classList.add('is-playing'));
  video.addEventListener('error', () => { failed = true; sync(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting; sync();
  }, {threshold: 0.05}).observe(document.querySelector('#hero'));
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', sync);
  sync();
})();
