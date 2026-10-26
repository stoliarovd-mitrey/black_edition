const $=s=>document.querySelector(s), dialog=$('#project-dialog'), success=$('#success-dialog'), form=$('#request-form'), config=window.CAVIAR_CONFIG;
let activeCard;
const catalog=$('.catalog'), samsungMarkup=catalog.innerHTML;
let device='fold';
const devices={fold:'Samsung Galaxy Z Fold 8 Ultra',duo:'iPhone Duo',ip18:'iPhone 18 Pro/Pro Max'};
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const menu=$('#menu'),toggle=$('.menu-toggle');
toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));menu.hidden=!open;});
menu.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menu.hidden=true;toggle.setAttribute('aria-expanded','false');}));
function step(isForm){$('#project-step').hidden=isForm;$('#form-step').hidden=!isForm;dialog.classList.toggle('form-open',isForm);dialog.setAttribute('aria-labelledby',isForm?'form-title':'concept-title');dialog.scrollTop=0;if(dialog.open)$(isForm?'#form-title':'#concept-title').focus({preventScroll:true});}
function openProject(card){activeCard=card;const img=card.querySelector('img'),title=card.dataset.title.replace(' · ',' — ');$('#concept-image').src=card.dataset.full||img.src;$('#project-step .eyebrow').textContent='Custom '+devices[device];$('#concept-image').alt=title;$('.project-name').textContent=title;form.reset();form.elements.project.value=title;form.elements.device.value=devices[device];form.elements.project_id.value=card.dataset.id||img.src.split('/').pop().replace('.webp','');$('#form-error').textContent='';const message='Здравствуйте! Меня интересует дизайн-концепция Caviar «'+title+'» ('+devices[device]+'). '+location.href.split('#')[0]+'#device='+device+'&project='+encodeURIComponent(card.dataset.id||img.src.split('/').pop().replace('.webp',''));$('#whatsapp').href=config.whatsapp+'?text='+encodeURIComponent(message);$('#telegram').href=config.telegram+'?text='+encodeURIComponent(message);$('#max').href=config.max;step(false);dialog.showModal();document.body.classList.add('locked');}
catalog.addEventListener('click',e=>{const card=e.target.closest('.card');if(card)openProject(card);});
$('#discuss').onclick=()=>step(true);$('.back').onclick=()=>step(false);
[dialog,success].forEach(d=>{d.querySelector('.close').onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});d.addEventListener('close',()=>{if(!dialog.open&&!success.open){document.body.classList.remove('locked');activeCard?.focus({preventScroll:true});}});});
$('#return').onclick=()=>success.close();
form.elements.phone.addEventListener('input',()=>form.elements.phone.setCustomValidity(''));
form.addEventListener('submit',async e=>{e.preventDefault();const phone=form.elements.phone;phone.setCustomValidity(phone.value.replace(/\D/g,'').length>=7?'':'Укажите корректный номер телефона');if(!form.reportValidity())return;const button=form.querySelector('[type=submit]');button.disabled=true;$('#form-error').textContent='';try{if(config.endpoint){const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form))),signal:AbortSignal.timeout(15000)});if(!response.ok||(await response.json()).success!==true)throw new Error('send');}dialog.close();success.showModal();document.body.classList.add('locked');}catch{ $('#form-error').textContent='Не удалось отправить запрос. Попробуйте ещё раз или напишите менеджеру.';}finally{button.disabled=false;}});
if(config.endpoint)document.querySelectorAll('.demo-note').forEach(el=>el.hidden=true);

function updateCollectionLinks(){
 $('.collection-links').innerHTML=[...catalog.querySelectorAll('.collection')].map(section=>`<a href="#${section.id}">${escapeHTML(section.querySelector('h2').textContent)}</a>`).join('');
}
function selectDevice(key,save=true){
 if(!devices[key])key='fold';
 device=key;
 if(dialog.open)dialog.close();
 if(success.open)success.close();
 document.querySelectorAll('[role=tab]').forEach(t=>{const on=t.dataset.device===key;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;});
 catalog.setAttribute('aria-labelledby','tab-'+key);
 if(key==='fold')catalog.innerHTML=samsungMarkup;
 else catalog.innerHTML=window.CAVIAR_COLLECTIONS.filter(c=>c.device===key).map(c=>`<section class="collection" id="${key}-${c.id}" aria-labelledby="title-${key}-${c.id}"><div class="section-heading"><h2 id="title-${key}-${c.id}">${escapeHTML(c.title)}</h2></div><div class="grid">${c.items.map(m=>`<button class="card" data-id="${m.id}" data-full="${m.full}" data-title="${escapeHTML(c.title+' · '+m.name)}" aria-label="Открыть концепт: ${escapeHTML(m.name)}"><span class="card-visual"><img src="${m.thumb}" alt="${escapeHTML(m.name)}" width="597" height="800" loading="lazy" decoding="async"><span class="card-details" aria-hidden="true">Подробнее</span></span></button>`).join('')}</div></section>`).join('');
 updateCollectionLinks();
 if(save)history.replaceState(null,'','#device='+key);
}
document.querySelectorAll('[role=tab]').forEach(t=>{
 t.onclick=()=>selectDevice(t.dataset.device);
 t.onkeydown=e=>{const tabs=[...document.querySelectorAll('[role=tab]')],i=tabs.indexOf(t);let next;if(e.key==='ArrowRight')next=(i+1)%tabs.length;if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;if(next!==undefined){e.preventDefault();tabs[next].focus();selectDevice(tabs[next].dataset.device);}};
});
function openHash(){const params=new URLSearchParams(location.hash.slice(1)),key=params.get('device'),id=params.get('project');if(key&&devices[key]&&key!==device)selectDevice(key,false);if(id){const card=[...catalog.querySelectorAll('.card')].find(c=>(c.dataset.id||c.querySelector('img').getAttribute('src').split('/').pop().replace('.webp',''))===id);if(card&&!dialog.open)openProject(card);}}
window.addEventListener('hashchange',openHash);updateCollectionLinks();openHash();
