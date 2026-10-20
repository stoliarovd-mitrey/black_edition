const dialog=document.querySelector('dialog');
const menu=document.querySelector('#menu');
const toggle=document.querySelector('.menu-toggle');
toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');menu.hidden=!open;});
menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.hidden=true;toggle.setAttribute('aria-expanded','false');}));
document.querySelectorAll('.card').forEach(card=>card.addEventListener('click',()=>{const src=card.querySelector('img');document.querySelector('#concept-image').src=src.src;document.querySelector('#concept-image').alt=src.alt;document.querySelector('#concept-title').textContent=card.dataset.title;document.querySelector('.reference').textContent='При обращении укажите: '+card.dataset.title;dialog.showModal();dialog.scrollTop=0;document.body.classList.add('locked');}));
document.querySelector('.close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>document.body.classList.remove('locked'));
