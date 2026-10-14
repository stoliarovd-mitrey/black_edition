'use strict';
/*
 * World Treasures no-code editor, built on GrapesJS (BSD-3-Clause).
 * GrapesJS project data is the editing source of truth. HTML/CSS are published
 * alongside it in one GitHub file, ensuring an atomic public-site update.
 */
(function(){
 const $=id=>document.getElementById(id);
 const repo='stoliarovd-mitrey/black_edition';
 const endpoint='https://api.github.com/repos/'+repo+'/contents/world-treasures-landing/builder-data.json';
 const localName='caviar-world-treasures-grapes-v1';
 let editor, publishedSha=null, hasPublished=false, initialProject=null, initialStamp=null, draftDb=null, draftTimer=null, busy=false, chosen=null, editorReady=false;
 const htmlSafe=value=>String(value||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
 const br=value=>htmlSafe(value).replace(/\n/g,'<br>');
 const objText=(section,type)=>section.items.filter(o=>o.type===type);
 const imgItem=section=>section.items.find(o=>o.type==='image');
 const attr=(name,value)=>' '+name+'="'+htmlSafe(value)+'"';
 const notice=text=>{$('status').textContent=text};
 const styleTheme=section=>section.theme==='dark'?'wt-dark':section.theme==='stone'?'wt-stone':'wt-light';
 const sectionLabel=section=>attr('data-section-name',section.name||section.id);
 const container=inner=>'<div class="wt-container">'+inner+'</div>';
 function anchor(o,fill){
   if(!o)return '';
   const link=String(o.href||'#contact');
   return '<a class="wt-button'+(fill?' wt-button-fill':'')+'" href="'+htmlSafe(link)+'">'+br(o.text||'Подробнее')+'</a>';
 }
 function textParagraphs(items){
   return items.map(o=>'<p>'+br(o.text)+'</p>').join('');
 }
 function fromLegacy(data){
   const sections=data.sections.map(s=>{
     const t=objText(s,'title')[0],texts=objText(s,'text'),notes=objText(s,'note'),button=objText(s,'button')[0],images=objText(s,'image');
     if(s.kind==='hero'){
       return '<section class="wt-hero" id="hero"'+sectionLabel(s)+'><div class="wt-hero-gallery">'+images.map(o=>'<img'+attr('src',o.src)+attr('alt',o.alt||'Caviar World Treasures')+'>').join('')+'</div>'+
       '<div class="wt-hero-content"><p class="wt-label">CAVIAR · ЮВЕЛИРНАЯ КОЛЛЕКЦИЯ</p><h1>WORLD<br>TREASURES</h1></div></section>';
     }
     if(s.kind==='model'){
       const img=imgItem(s),left=img&&img.x<700;
       const visual='<div class="wt-media"><img'+attr('src',img?.src||'')+attr('alt',s.name)+'></div>';
       const lead=texts[0]?'<h3>'+br(texts[0].text)+'</h3>':'';
       const body='<div class="wt-copy"><h2>'+br(t?.text||s.name)+'</h2>'+lead+textParagraphs(texts.slice(1))+anchor(button,false)+'</div>';
       const contents=left?visual+body:body+visual;
       return '<section class="wt-section '+styleTheme(s)+'" id="'+htmlSafe(s.id)+'"'+sectionLabel(s)+'>'+container('<div class="wt-columns'+(left?'':' wt-reverse')+'">'+visual+body+'</div>')+'</section>';
     }
     if(s.kind==='inspiration'){
       const im=imgItem(s),content='<div class="wt-copy"><p class="wt-label">Источник вдохновения</p><h2>'+br(t?.text||'Вдохновение')+'</h2>'+textParagraphs(texts)+'</div>';
       const fallback=s.id.replace('inspiration-','');
       return '<section class="wt-section wt-inspiration '+styleTheme(s)+'" id="'+htmlSafe(s.id)+'"'+sectionLabel(s)+'>'+container('<div class="wt-columns">'+
        '<div class="wt-media"><img class="wt-image-card"'+attr('src',im?.src||'')+attr('alt',im?.alt||s.name)+attr('data-fallback','assets/'+fallback+'.webp')+'></div>'+content+'</div>')+'</section>';
     }
     if(s.id==='idea'||s.id==='packaging'){
       return '<section class="wt-section '+styleTheme(s)+'" id="'+htmlSafe(s.id)+'"'+sectionLabel(s)+'>'+container('<div class="wt-columns">'+
         '<div class="wt-copy"><h2>'+br(t?.text||s.name)+'</h2></div><div class="wt-copy">'+textParagraphs(texts)+anchor(button,true)+'</div></div>')+'</section>';
     }
     if(s.id==='craft'){
       const eye=objText(s,'eyebrow');
       return '<section class="wt-section '+styleTheme(s)+'" id="craft"'+sectionLabel(s)+'>'+container(
         '<div class="wt-columns"><div class="wt-copy"><h2>'+br(t?.text)+'</h2></div><div class="wt-copy">'+textParagraphs(texts.slice(0,1))+'</div></div>'+
         '<div class="wt-grid" style="margin-top:55px;grid-template-columns:repeat(2,minmax(0,1fr))">'+
          eye.map((e,i)=>'<div class="wt-grid-item"><p class="wt-label">'+br(e.text)+'</p>'+textParagraphs(texts.slice(i+1,i+2))+'</div>').join('')+
         '</div>')+'</section>';
     }
     if(s.id==='edition'){
       const nums=objText(s,'number');
       const stat='<div class="wt-stat-grid">'+nums.map((n,i)=>'<div><div class="wt-stat">'+br(n.text)+'</div><p class="wt-stat-note">'+br(notes[i]?.text||'')+'</p></div>').join('')+'</div>';
       return '<section class="wt-section '+styleTheme(s)+'" id="edition"'+sectionLabel(s)+'>'+container('<div class="wt-columns"><div class="wt-copy"><h2>'+br(t?.text||s.name)+'</h2>'+textParagraphs(texts)+'</div>'+stat+'</div>')+'</section>';
     }
     if(s.id==='contact'){
       return '<section class="wt-section wt-dark" id="contact"'+sectionLabel(s)+'>'+container('<div class="wt-columns"><div class="wt-copy"><p class="wt-label">CAVIAR · WORLD TREASURES</p><h2>'+br(t?.text||'Связаться')+'</h2></div><div class="wt-copy">'+textParagraphs(texts)+
        '<div class="wt-button-row">'+objText(s,'button').map(b=>anchor(b,true)).join('')+'</div></div></div>')+'</section>';
     }
     return '<section class="wt-section '+styleTheme(s)+'"'+sectionLabel(s)+'>'+container('<h2>'+br(t?.text||s.name)+'</h2>'+textParagraphs(texts))+'</section>';
   });
   return '<div class="wt-page">'+sections.join('')+'</div>';
 }
 function reusableBlocks(){
   const block=(id,label,category,content)=>editor.BlockManager.add(id,{label,category,content});
   const section=(cls,body)=>'<section class="wt-section '+cls+'" data-section-name="Новая секция">'+container(body)+'</section>';
   const cta='<div class="wt-copy"><p class="wt-label">CAVIAR</p><h2>НОВАЯ КОЛЛЕКЦИЯ</h2><p>Дважды кликните, чтобы изменить текст.</p><a class="wt-button wt-button-fill" href="#contact">Узнать больше</a></div>';
   block('wt-section-dark','◧ Тёмная секция','01 · Секции',section('wt-dark','<div class="wt-columns">'+cta+'<div class="wt-media"><img src="assets/qasr.webp" alt="Модель Caviar"></div></div>'));
   block('wt-section-light','◨ Светлая секция','01 · Секции',section('wt-light','<div class="wt-columns">'+cta+'<div class="wt-media"><img src="assets/omkara.webp" alt="Модель Caviar"></div></div>'));
   block('wt-section-stone','▨ Светлый блок','01 · Секции',section('wt-stone',cta));
   block('wt-hero','◈ Первый экран','01 · Секции','<section class="wt-hero" data-section-name="Первый экран"><div class="wt-hero-gallery"><img src="assets/qasr.webp" alt=""><img src="assets/omkara.webp" alt=""><img src="assets/dali.webp" alt=""><img src="assets/jingtai.webp" alt=""></div><div class="wt-hero-content"><p class="wt-label">CAVIAR COLLECTION</p><h1>НОВАЯ КОЛЛЕКЦИЯ</h1></div></section>');
   block('wt-inspiration','▧ Изображение + текст','01 · Секции',section('wt-stone','<div class="wt-columns"><div class="wt-media"><img class="wt-image-card" src="assets/jingtai.webp" alt="Источник вдохновения"></div>'+cta+'</div>'));
   block('wt-callout','◉ Призыв к действию','01 · Секции',section('wt-dark','<div class="wt-callout"><p class="wt-label">CAVIAR</p><h2>СОЗДАЙТЕ СВОЮ ИСТОРИЮ</h2><p>Короткое описание предложения.</p><a class="wt-button wt-button-fill" href="#contact">Связаться</a></div>'));
   block('wt-gallery','▦ Галерея','01 · Секции',section('wt-light','<h2 style="margin-bottom:30px">ГАЛЕРЕЯ</h2><div class="wt-gallery"><img src="assets/qasr.webp" alt="Модель 1"><img src="assets/omkara.webp" alt="Модель 2"><img src="assets/dali.webp" alt="Модель 3"></div>'));
   block('wt-two-columns','▥ Две колонки','01 · Секции',section('wt-light','<div class="wt-columns"><div class="wt-copy"><h2>ЗАГОЛОВОК</h2><p>Первый столбец текста</p></div><div class="wt-copy"><p>Второй столбец текста</p></div></div>'));
   block('wt-heading','H Заголовок','02 · Элементы','<h2>НОВЫЙ ЗАГОЛОВОК</h2>');
   block('wt-text','¶ Текст','02 · Элементы','<p>Нажмите дважды, чтобы изменить этот текст.</p>');
   block('wt-image','▣ Изображение','02 · Элементы','<img src="assets/qasr.webp" alt="Изображение" style="width:100%;max-height:600px;object-fit:contain">');
   block('wt-button','▣ Кнопка','02 · Элементы','<a class="wt-button" href="#contact">Новая кнопка</a>');
   block('wt-button-fill','▣ Золотая кнопка','02 · Элементы','<a class="wt-button wt-button-fill" href="#contact">Узнать больше</a>');
   block('wt-divider','━ Разделитель','02 · Элементы','<hr class="wt-divider">');
   block('wt-label','A Подпись','02 · Элементы','<p class="wt-label">Подпись раздела</p>');
 }
 function getSection(c){
   while(c&&c.get('tagName')!=='section')c=c.parent();
   return c;
 }
 function listSections(){
   const root=$('sections-list');root.replaceChildren();
   if(!editor)return;
   const all=editor.getWrapper().find('section');
   const current=getSection(editor.getSelected());
   all.forEach((sec,i)=>{
     const row=document.createElement('div');row.className='b-section'+(current===sec?' active':'');
     const label=document.createElement('button');label.className='b-section-name';label.textContent=sec.getAttributes()['data-section-name']||sec.getAttributes().id||'Секция '+(i+1);
     label.onclick=()=>{editor.select(sec);editor.Canvas.scrollTo(sec);};row.append(label);
     for(const [symbol,delta] of [['↑',-1],['↓',1]]){
       const btn=document.createElement('button');btn.className='b-mini';btn.type='button';btn.textContent=symbol;btn.title=delta<0?'Поднять секцию':'Опустить секцию';
       btn.onclick=()=>moveSection(sec,delta);row.append(btn);
     }
     root.append(row);
   });
 }
 function moveSection(component,delta){
   const s=getSection(component);if(!s){notice('Выберите секцию');return}
   const parent=s.parent(),siblings=parent.components(),current=siblings.indexOf(s),target=current+delta;
   if(target<0||target>=siblings.length){notice('Дальше переместить нельзя');return}
   // GrapesJS move() adjusts forward insertion indexes and treats at=index+1 as a no-op.
   s.move(parent,{at:delta>0?current+2:target});editor.select(s);listSections();notice('Порядок секций изменён');
 }
 function getTypeName(c){
   const t=(c.get('tagName')||'div').toLowerCase();
   if(t==='section')return 'Секция';if(t==='img')return 'Изображение';if(t==='a')return 'Кнопка / ссылка';if(/^h[1-6]$/.test(t))return 'Заголовок';if(t==='p')return 'Текст';return 'Блок '+t;
 }
 function selectProperties(){
   const c=editor.getSelected();chosen=c;
   $('none-selected').classList.toggle('b-hidden',!!c);
   $('selected-form').classList.toggle('b-hidden',!c);
   if(!c){listSections();return}
   const tag=(c.get('tagName')||'').toLowerCase(),isImg=tag==='img',isLink=tag==='a',isText=['p','h1','h2','h3','h4','h5','h6','a','span'].includes(tag);
   $('selected-type').textContent=getTypeName(c);
   $('text-field').classList.toggle('b-hidden',!isText);
   $('url-field').classList.toggle('b-hidden',!isLink);
   $('image-fields').classList.toggle('b-hidden',!isImg);
   if(isText)$('element-text').value=(c.get('content')||c.components().models.map(x=>x.get('content')||'').join('')).replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'');
   if(isLink)$('element-url').value=c.getAttributes().href||'';
   if(isImg){$('image-url').value=c.getAttributes().src||'';$('image-alt').value=c.getAttributes().alt||''}
   $('font-size').value=c.getStyle()['font-size']||'';
   $('align').value=c.getStyle()['text-align']||'';
   const color=c.getStyle().color||'#333333';$('text-color').value=/^#[0-9a-f]{6}$/i.test(color)?color:'#333333';
   listSections();
 }
 function setAttr(key,value){
   if(!chosen)return;
   chosen.addAttributes({[key]:value});
 }
 function safeUrl(value,kind){
   const val=String(value||'').trim();
   if(kind==='image'&&/^data:image\/(png|jpeg|webp);base64,/i.test(val))return val;
   if(val.startsWith('#')||val.startsWith('assets/')||val.startsWith('model.html'))return val;
   try{const u=new URL(val,location.href);if(['https:','http:'].includes(u.protocol))return val}catch{}
   return null;
 }
 function wireControls(){
   $('element-text').addEventListener('change',()=>{
     if(!chosen)return;
     const value=htmlSafe($('element-text').value).replace(/\n/g,'<br>');
     chosen.components(value);notice('Текст обновлён');
   });
   $('element-url').addEventListener('change',()=>{
     const value=safeUrl($('element-url').value,'link');
     if(value===null){notice('Укажите обычную ссылку https:// или #раздел');return}
     setAttr('href',value);
   });
   $('image-url').addEventListener('change',()=>{
     const value=safeUrl($('image-url').value,'image');
     if(value===null){notice('Некорректный адрес изображения');return}
     setAttr('src',value);
   });
   $('image-alt').addEventListener('change',()=>setAttr('alt',$('image-alt').value));
   $('image-upload').addEventListener('change',async()=>{
     const file=$('image-upload').files[0];if(!file||!chosen)return;
     if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>15*1024*1024){notice('Используйте JPG, PNG или WebP до 15 МБ');return}
     try{
       const bitmap=await createImageBitmap(file);
       const width=Math.min(bitmap.width,1300),scale=width/bitmap.width;
       const cvs=document.createElement('canvas');cvs.width=width;cvs.height=Math.round(bitmap.height*scale);
       cvs.getContext('2d').drawImage(bitmap,0,0,cvs.width,cvs.height);bitmap.close();
       const url=cvs.toDataURL('image/webp',.72);
       setAttr('src',url);setAttr('alt',file.name);$('image-url').value=url;notice('Изображение загружено в черновик');
     }catch(e){notice('Ошибка загрузки: '+e.message)}
     $('image-upload').value='';
   });
   $('font-size').onchange=()=>chosen?.addStyle({'font-size':$('font-size').value});
   $('align').onchange=()=>chosen?.addStyle({'text-align':$('align').value});
   $('text-color').onchange=()=>chosen?.addStyle({color:$('text-color').value});
   $('duplicate').onclick=()=>{
     if(!chosen)return;
     const cloned=chosen.clone(),parent=chosen.parent(),at=parent.components().indexOf(chosen)+1;
     const attributes=Object.assign({},cloned.getAttributes());delete attributes.id;cloned.setAttributes(attributes);
     parent.components().add(cloned,{at});editor.select(cloned);notice('Элемент скопирован');
   };
   $('remove').onclick=()=>{if(chosen&&confirm('Удалить выбранный элемент?')){chosen.remove();chosen=null;selectProperties();notice('Элемент удалён')}};
   $('move-up').onclick=()=>moveSection(chosen,-1);
   $('move-down').onclick=()=>moveSection(chosen,1);
   $('new-section').onclick=()=>{
     const added=editor.addComponents('<section class="wt-section wt-light" data-section-name="Новая секция"><div class="wt-container"><div class="wt-copy"><h2>НОВАЯ СЕКЦИЯ</h2><p>Измените этот текст</p></div></div></section>');
     editor.select(added[0]);listSections();notice('Секция добавлена внизу страницы');
   };
   document.querySelectorAll('.b-tab').forEach(button=>button.onclick=()=>{
     const group=button.dataset.tabGroup;
     document.querySelectorAll('.b-tab[data-tab-group="'+group+'"]').forEach(b=>b.classList.remove('active'));
     button.classList.add('active');
     const scope=group==='left'?'.b-left':'.b-right';
     document.querySelectorAll(scope+' .b-pane').forEach(p=>p.classList.remove('active'));
     $(button.dataset.pane).classList.add('active');
   });
   $('undo').onclick=()=>{editor.UndoManager.undo();listSections()};
   $('redo').onclick=()=>{editor.UndoManager.redo();listSections()};
   for(const [id,device] of [['desktop','Desktop'],['tablet','Tablet'],['mobile','Mobile']])
     $(id).onclick=()=>{editor.setDevice(device);notice('Предпросмотр: '+id)};
   let preview=false;
   $('preview').onclick=()=>{
     preview=!preview;
     if(preview)editor.runCommand('core:preview');else editor.stopCommand('core:preview');
     $('preview').textContent=preview?'Редактировать':'Просмотр';
   };
   $('export').onclick=()=>{
     const documentData=serialize();
     const blob=new Blob([JSON.stringify(documentData,null,2)],{type:'application/json'});
     const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='world-treasures-builder.json';a.click();
     setTimeout(()=>URL.revokeObjectURL(url),2000);notice('Резервная копия скачана');
   };
   $('publish').onclick=()=>{$('publish-message').textContent='';$('publish-dialog').showModal()};
   $('cancel-publish').onclick=()=>$('publish-dialog').close();
   $('publish-dialog').addEventListener('close',()=>{$('token').value=''});
   $('confirm-publish').onclick=publish;
 }
 function serialize(){
   const html=editor.getHtml(),css=editor.getCss();
   return {version:1,html,css,project:editor.getProjectData(),updatedAt:new Date().toISOString()};
 }
 function bytesBase64(value){
   const bytes=new TextEncoder().encode(value);
   const chunk=0x6000;let result='';
   for(let i=0;i<bytes.length;i+=chunk)result+=String.fromCharCode(...bytes.subarray(i,i+chunk));
   return btoa(result);
 }
 async function publish(){
   if(busy)return;
   const token=$('token').value.trim(),status=$('publish-message');
   if(!token){status.textContent='Нужен GitHub-токен с правом записи в репозиторий.';return}
   const data=serialize(),json=JSON.stringify(data);
   if(new TextEncoder().encode(json).length>920000){status.textContent='Проект больше 920 КБ. Сожмите изображения или используйте ссылки на файлы вместо загрузки внутрь редактора.';return}
   const btn=$('confirm-publish');busy=true;btn.disabled=true;
   try{
     status.textContent='Проверяем версию на GitHub…';
     const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'};
     const r=await fetch(endpoint+'?ref=main',{headers,cache:'no-store'});
     let currentSha=null;
     if(r.ok){const file=await r.json();currentSha=file.sha}
     else if(r.status!==404)throw Error('GitHub: '+r.status+'. Проверьте токен.');
     if(publishedSha===null&&hasPublished&&currentSha){
       const fresh=await r.clone().json().catch(()=>null);
       const encoded=fresh?.content||'';
       const utf8=encoded?Uint8Array.from(atob(encoded.replace(/\\s/g,'')),c=>c.charCodeAt(0)):null;
       const parsed=utf8?JSON.parse(new TextDecoder().decode(utf8)):null;
       if(!parsed||parsed.updatedAt!==initialStamp)throw Error('Опубликованная версия изменилась с момента открытия конструктора. Обновите страницу.');
       publishedSha=currentSha;
     }
     if(currentSha!==publishedSha)throw Error('Кто-то уже изменил опубликованную страницу. Сохраните черновик, обновите конструктор и повторите публикацию.');
     status.textContent='Сохраняем новую версию…';
     const body={message:'Publish World Treasures from visual GrapesJS editor',content:bytesBase64(json),branch:'main'};
     if(currentSha)body.sha=currentSha;
     const out=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify(body)});
     if(!out.ok){const response=await out.json().catch(()=>({}));throw Error('GitHub '+out.status+': '+(response.message||'Ошибка публикации'))}
     const response=await out.json();
     publishedSha=response.content.sha;hasPublished=true;initialStamp=data.updatedAt;
     initialProject=structuredClone(editor.getProjectData());
     status.textContent='Готово. Опубликовано на GitHub. GitHub Pages обычно обновляется через 1–2 минуты.';
     notice('Страница опубликована. Можно открыть сайт.');
     $('token').value='';
   }catch(e){status.textContent=e.message;notice('Ошибка публикации. Ваш черновик сохранён.')}
   finally{busy=false;btn.disabled=false}
 }
 function draftOpen(){
   return new Promise((resolve,reject)=>{
     const req=indexedDB.open(localName,1);
     req.onupgradeneeded=()=>req.result.createObjectStore('items');
     req.onsuccess=()=>resolve(req.result);
     req.onerror=()=>reject(req.error);
   });
 }
 function readDraft(){
   if(!draftDb)return Promise.resolve(null);
   return new Promise(resolve=>{
     const req=draftDb.transaction('items').objectStore('items').get('draft');
     req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null);
   });
 }
 function saveDraft(){
   if(!draftDb||!editor)return;
   try{
     const tx=draftDb.transaction('items','readwrite');
     tx.objectStore('items').put({project:editor.getProjectData(),baseSha:publishedSha,createdAt:new Date().toISOString()},'draft');
     tx.oncomplete=()=>notice('Черновик сохранён в браузере. Для публикации нажмите «Опубликовать».');
   }catch(err){notice('Не удалось сохранить черновик. Используйте кнопку «Скачать».')}
 }
 function scheduleDraft(){
   if(!editorReady)return;
   clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,1500);
 }
 function createEditor(){
   editor=grapesjs.init({
     container:'#gjs',height:'100%',width:'auto',storageManager:false,
     fromElement:false,
     noticeOnUnload:false,
     panels:{defaults:[]},
     canvas:{styles:['builder-theme.css','https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;500;600;700;800&display=swap']},
     blockManager:{appendTo:'#blocks'},
     layerManager:{appendTo:'#layers'},
     traitManager:{appendTo:'#traits'},
     styleManager:{appendTo:'#styles',sectors:[
       {name:'Размеры и отступы',open:true,buildProps:['width','height','min-height','max-width','padding','margin']},
       {name:'Текст',open:false,buildProps:['font-family','font-size','font-weight','line-height','letter-spacing','color','text-align']},
       {name:'Фон и граница',open:false,buildProps:['background-color','background-image','border','border-radius','box-shadow']},
       {name:'Расположение',open:false,buildProps:['display','flex-direction','justify-content','align-items','gap']}
     ]},
     deviceManager:{devices:[
       {name:'Desktop',width:''},
       {name:'Tablet',width:'820px',widthMedia:'900px'},
       {name:'Mobile',width:'390px',widthMedia:'700px'}
     ]},
     selectorManager:{componentFirst:true},
     avoidInlineStyle:false
   });
   reusableBlocks();wireControls();
   editor.on('component:selected',selectProperties);
   editor.on('component:deselected',selectProperties);
   editor.on('component:add',listSections);
   editor.on('component:remove',listSections);
   editor.on('component:update',listSections);
   editor.on('update',scheduleDraft);
 }
 async function boot(){
   if(!window.grapesjs){notice('GrapesJS не загрузился. Проверьте доступ к CDN.');return}
   let remote=null,legacy=null;
   try{
     const r=await fetch('builder-data.json',{cache:'no-store'});
     if(r.ok){remote=await r.json();hasPublished=true}
     else if(r.status!==404)throw Error('Ответ сервера '+r.status);
   }catch(e){notice('Опубликованная версия недоступна, открываем исходный проект.')}
   if(remote){
     if(remote.version!==1||!remote.project)throw Error('Опубликованный проект не содержит редактируемых данных');
     initialStamp=remote.updatedAt;
     try{
       const r=await fetch(endpoint+'?ref=main',{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
       if(r.ok)publishedSha=(await r.json()).sha;
     }catch(e){notice('Не удалось проверить SHA публикации. Публикация будет заблокирована, пока не обновите страницу.')}
   }else{
     const r=await fetch('content.json',{cache:'no-store'});
     if(!r.ok)throw Error('Не удалось загрузить текущий лендинг');
     legacy=await r.json();
   }
   createEditor();
   if(remote)editor.loadProjectData(remote.project);
   else editor.setComponents(fromLegacy(legacy));
   initialProject=structuredClone(editor.getProjectData());
   try{
     draftDb=await draftOpen();
     const draft=await readDraft();
     if(draft?.project && draft.baseSha===publishedSha){
       if(confirm('Есть несохранённый черновик. Продолжить редактирование?'))editor.loadProjectData(draft.project);
     }
   }catch(e){notice('Локальное сохранение недоступно. Пользуйтесь кнопкой «Скачать».')}
   editorReady=true;listSections();selectProperties();
   notice('Конструктор готов. Перетаскивайте блоки, редактируйте текст, сохраняйте и публикуйте по кнопке.');
 }
 boot().catch(e=>{notice('Ошибка: '+e.message);console.error(e)});
})();
