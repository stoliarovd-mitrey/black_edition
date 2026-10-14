'use strict';
const page=document.getElementById('page');
function safeURL(value,image=false){if(typeof value!=='string')return '';if(image&&/^data:image\/(png|jpeg|webp);base64,/i.test(value))return value;try{const u=new URL(value,location.href);return ['https:','http:'].includes(u.protocol)?value:''}catch{return ''}}
function renderPage(data){page.replaceChildren();document.documentElement.style.setProperty('--gold',data.accent||'#b69a68');for(const section of data.sections){const s=document.createElement('section');s.className='section '+section.theme+' '+(section.kind||'');s.id=section.id;const stage=document.createElement('div');stage.className='stage';stage.style.height=(section.height/16)+'vw';stage.style.maxHeight=section.height+'px';stage.style.aspectRatio='1600 / '+section.height;for(const obj of section.items){const el=document.createElement(obj.type==='image'?'img':obj.type==='button'?'a':obj.type==='title'?(section.kind==='hero'?'h1':'h2'):obj.type==='rule'?'div':'p');el.className='item '+obj.type;el.dataset.id=obj.id;el.style.cssText=`left:${obj.x/16}%;top:${obj.y/section.height*100}%;width:${obj.w/16}%;height:${obj.h?obj.h/section.height*100+'%':'auto'};font-size:${obj.size/16}cqw;color:${obj.color||'inherit'};--order:${obj.order||0};text-align:${obj.align||'left'}`;if(obj.type==='image'){el.src=safeURL(obj.src,true);el.alt=obj.alt||'';el.loading=section.kind==='hero'?'eager':'lazy';el.decoding='async';el.style.objectFit=obj.fit||'contain';el.addEventListener('click',()=>{if(!window.EDITOR_MODE)openImage(el.src,el.alt)})}else{el.textContent=obj.text||'';if(obj.type==='button')el.href=safeURL(obj.href||'#contact')}stage.append(el)}applyEditorialFlow(stage,section);s.append(stage);page.append(s);if(section.kind==='hero'){const nav=document.createElement('nav');nav.className='collection-nav';nav.id='collection';nav.setAttribute('aria-label','Модели коллекции');for(const m of data.sections.filter(x=>x.kind==='model')){const a=document.createElement('a');a.href='#'+m.id;a.textContent=m.name+' ↗';nav.append(a)}page.append(nav)}}}
function openImage(src,alt){const d=document.createElement('dialog');d.className='lightbox';const im=document.createElement('img');im.src=src;im.alt=alt;const b=document.createElement('button');b.textContent='Закрыть ×';b.onclick=()=>d.close();d.append(im,b);d.addEventListener('close',()=>d.remove());d.addEventListener('click',e=>{if(e.target===d)d.close()});document.body.append(d);d.showModal()}
window.renderPage=renderPage;window.safeURL=safeURL;
window.pageReady=fetch('content.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Не удалось загрузить содержание');return r.json()}).then(d=>{window.pageData=d;renderPage(d);return d}).catch(e=>{page.textContent=e.message;throw e});

/* Natural text flow follows the live Contrast page's 24px editorial rhythm.
   The legacy coordinate editor retains its canvas; published layout grows with copy. */
function applyEditorialFlow(stage, section) {
  if (window.EDITOR_MODE || section.kind === 'hero') return;
  stage.classList.add('editorial-flow');
  const groups = new Map();
  const children = Array.from(stage.children);
  const objects = new Map(section.items.map(o => [o.id, o]));
  for (const el of children) {
    const o = objects.get(el.dataset.id);
    if (!o) continue;
    let column = o.x < 800 ? 'left' : 'right';
    if (section.id === 'edition') column = o.w > 1000 ? 'full' : o.x < 1000 ? 'left' : o.x < 1300 ? 'middle' : 'right';
    if (!groups.has(column)) groups.set(column, []);
    groups.get(column).push({el,o});
  }
  for (const key of ['left','middle','right','full']) {
    if (!groups.has(key)) continue;
    const column = document.createElement('div');
    column.className = 'editorial-column editorial-' + key;
    const entries = groups.get(key).sort((a,b) => a.o.y-b.o.y);
    if (entries.every(x => x.o.type === 'image')) column.classList.add('editorial-media');
    for (const {el} of entries) column.append(el);
    stage.append(column);
  }
}
