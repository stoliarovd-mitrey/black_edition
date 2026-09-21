const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(!reduced&&'IntersectionObserver'in window){
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}
  }),{threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
  const counter=document.querySelector('[data-count]');
  if(counter){
    const countObserver=new IntersectionObserver(entries=>{
      if(!entries[0].isIntersecting)return;
      countObserver.disconnect();
      const start=performance.now();
      const tick=now=>{
        const p=Math.min(1,(now-start)/1000);
        counter.textContent=Math.round(19*(1-(1-p)**3));
        if(p<1)requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },{threshold:.6});
    countObserver.observe(counter);
  }
}
const video=document.querySelector('#hero-film');
if(video&&!reduced){
  let visible=true,failed=false;
  const sync=()=>{
    if(failed)return;
    if(!video.src)video.src=video.dataset.src;
    if(visible&&!document.hidden)video.play().catch(()=>{});
    else video.pause();
  };
  video.addEventListener('playing',()=>video.classList.add('is-playing'));
  video.addEventListener('error',()=>{failed=true;video.classList.remove('is-playing')});
  if('IntersectionObserver'in window)new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync()},{threshold:.05}).observe(document.querySelector('#hero'));
  document.addEventListener('visibilitychange',sync);
  sync();
}
const dialog=document.querySelector('#model-dialog');
document.querySelectorAll('[data-model]').forEach(button=>button.addEventListener('click',()=>{
  const section=document.getElementById(button.dataset.model);
  const src=section.querySelector('img');
  document.querySelector('#dialog-image').src=src.src;
  document.querySelector('#dialog-image').alt=src.alt;
  document.querySelector('#dialog-title').textContent=section.querySelector('.product__title').textContent;
  document.querySelector('#dialog-device').textContent=section.querySelector('.eyebrow').textContent;
  document.querySelector('#dialog-details').replaceChildren(...[...section.querySelectorAll('.copy')].map(p=>p.cloneNode(true)));
  dialog.showModal();
}));
document.querySelector('.dialog-close')?.addEventListener('click',()=>dialog.close());
dialog?.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});