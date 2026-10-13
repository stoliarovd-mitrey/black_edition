(function(){'use strict';var edit=document.body.dataset.mode==='edit',repo='stoliarovd-mitrey/black_edition',path='world-treasures/deck.json',deck=null,index=0,selected=null,frame=document.getElementById('frame'),localKey='caviar-world-treasures-draft-v1';function E(t,c){var e=document.createElement(t);if(c)e.className=c;return e}function msg(t){var e=E('div','toast');e.textContent=t;document.body.appendChild(e);setTimeout(function(){e.remove()},2700)}function txt(e,t){e.textContent=t;return e}function resolveImage(src){if(typeof src==='string'&&src.startsWith('embedded:'))return deck&&deck.embeddedImages&&deck.embeddedImages[src.slice(9)]||'';return src||''}function scale(){var availW=frame.parentElement.clientWidth-28,availH=frame.parentElement.clientHeight-105;return Math.min(availW/960,availH/540,1.75)}function slideRender(s,n,printing){var el=E('section','slide '+s.theme+(edit?' edit':''));el.style.setProperty('--leftBg',s.leftBg||'#eee');if(printing)el.classList.add('printslide');el.dataset.slide=n;s.objects.forEach(function(o){var e;if(o.type==='rect'){e=E('div','object rect');e.style.background=o.color}else if(o.type==='image'){e=E('img','object image');e.src=resolveImage(o.src);e.draggable=false;e.alt=o.id;e.style.objectFit=o.fit||'contain'}else{e=txt(E('div','object text '+(o.font||'sans')),o.text);e.style.fontSize=(o.size||16)+'px';e.style.color=o.color||'#26353e';e.style.fontWeight=o.weight||'400';e.style.textAlign=o.align||'left';e.style.letterSpacing=(o.spacing||0)+'px';if(o.lineHeight)e.style.lineHeight=o.lineHeight}e.style.left=o.x+'px';e.style.top=o.y+'px';e.style.width=o.w+'px';e.style.height=o.h+'px';e.dataset.object=o.id;if(edit&&o.type!=='rect'&&!printing){e.addEventListener('pointerdown',function(ev){pick(s,o);startPointer(ev,o,e)});if(selected===o)e.classList.add('selected')}el.appendChild(e);if(edit&&selected===o&&!printing){var h=E('span','handle resize-handle');h.style.left=(o.x+o.w-7)+'px';h.style.top=(o.y+o.h-7)+'px';h.addEventListener('pointerdown',function(ev){ev.stopPropagation();startPointer(ev,o,e,true)});el.appendChild(h)}});return el}function render(){if(!deck)return;frame.innerHTML='';var k=scale(),stage=E('div','stage');stage.style.width=960*k+'px';stage.style.height=540*k+'px';var el=slideRender(deck.slides[index],index,false);el.style.transform='scale('+k+')';stage.appendChild(el);frame.appendChild(stage);document.getElementById('counter').textContent=String(index+1).padStart(2,'0')+' / '+String(deck.slides.length).padStart(2,'0');if(edit)renderList()}function go(i){index=(i+deck.slides.length)%deck.slides.length;selected=null;render();if(edit)inspector()}function renderList(){var l=document.getElementById('slideList');l.innerHTML='';deck.slides.forEach(function(s,i){var b=txt(E('button','slideBtn'+(i===index?' chosen':'')),String(i+1).padStart(2,'0')+'   '+s.name);b.onclick=function(){go(i)};l.appendChild(b)})}function pick(s,o){selected=o;render();inspector()}function startPointer(ev,o,e,forceSize){if(ev.button!==0)return;ev.preventDefault();var ini={x:ev.clientX,y:ev.clientY,ox:o.x,oy:o.y,w:o.w,h:o.h},k=scale(),isSize=forceSize||(ev.offsetX>(o.w*k-19)&&ev.offsetY>(o.h*k-19));function move(v){var dx=(v.clientX-ini.x)/k,dy=(v.clientY-ini.y)/k;if(isSize){o.w=Math.max(20,Math.round(ini.w+dx));o.h=Math.max(12,Math.round(ini.h+dy))}else{o.x=Math.round(ini.ox+dx);o.y=Math.round(ini.oy+dy)}var target=frame.querySelector('[data-object="'+o.id+'"]');if(target){target.style.left=o.x+'px';target.style.top=o.y+'px';target.style.width=o.w+'px';target.style.height=o.h+'px'}var handle=frame.querySelector('.resize-handle');if(handle){handle.style.left=(o.x+o.w-7)+'px';handle.style.top=(o.y+o.h-7)+'px'}syncFields()}function up(){document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);store()}document.addEventListener('pointermove',move);document.addEventListener('pointerup',up)}function syncFields(){if(!selected)return;['x','y','w','h'].forEach(function(p){var e=document.querySelector('#attr-'+p);if(e)e.value=selected[p]})}
var databasePromise=null, draftTimer=null;
function dbOpen(){
  if(!databasePromise)databasePromise=new Promise(function(resolve,reject){
    if(!window.indexedDB){reject(new Error('IndexedDB unavailable'));return}
    var req=indexedDB.open('world-treasures-editor',1);
    req.onupgradeneeded=function(){if(!req.result.objectStoreNames.contains('drafts'))req.result.createObjectStore('drafts')};
    req.onsuccess=function(){resolve(req.result)};
    req.onerror=function(){reject(req.error)}
  });
  return databasePromise
}
async function saveDraft(){
  clearTimeout(draftTimer);
  var db=await dbOpen();
  return new Promise(function(resolve,reject){
    var tx=db.transaction('drafts','readwrite');
    tx.objectStore('drafts').put(JSON.stringify(deck),'slides');
    tx.oncomplete=resolve;
    tx.onerror=function(){reject(tx.error)}
  })
}
async function getDraft(){
  try{
    var db=await dbOpen();
    var raw=await new Promise(function(resolve,reject){
      var tx=db.transaction('drafts','readonly'),req=tx.objectStore('drafts').get('slides');
      req.onsuccess=function(){resolve(req.result)};
      req.onerror=function(){reject(req.error)}
    });
    if(raw)return JSON.parse(raw)
  }catch(e){console.warn('Local draft unavailable',e)}
  try{
    var rawOld=localStorage.getItem(localKey);
    if(rawOld)return JSON.parse(rawOld)
  }catch(e){}
  return null
}
function dataUrl(blob){return new Promise(function(resolve,reject){
  var reader=new FileReader();
  reader.onload=function(){resolve(reader.result)};
  reader.onerror=function(){reject(new Error('Не удалось открыть изображение'))};
  reader.readAsDataURL(blob)
})}
async function imageData(file){
  if(!file||!['image/jpeg','image/png','image/webp','image/avif'].includes(file.type))throw Error('Нужен JPG, PNG, WebP или AVIF');
  if(file.size>20*1024*1024)throw Error('Максимальный размер файла: 20 МБ');
  var bitmap=await createImageBitmap(file);
  try{
    var rate=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));
    var canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*rate));
    canvas.height=Math.max(1,Math.round(bitmap.height*rate));
    var ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    var processed=await new Promise(function(ok){canvas.toBlob(ok,'image/webp',.88)});
    if(!processed)throw Error('Не удалось подготовить изображение');
    if(processed.size>8*1024*1024)throw Error('Файл слишком велик даже после сжатия');
    return await dataUrl(processed)
  }finally{bitmap.close&&bitmap.close()}
}
async function updateImage(file,target,allMatches){
  if(!file||!target||target.type!=='image')return;
  try{
    var data=await imageData(file),oldSrc=target.src,num=0;
    if(allMatches){
      deck.slides.forEach(function(s){s.objects.forEach(function(o){
        if(o.type==='image'&&o.src===oldSrc){o.src=data;num++}
      })})
    }else{target.src=data;num=1}
    store();render();inspector();
    msg('Изображение заменено'+(num>1?' в '+num+' местах':''))
  }catch(e){msg(e.message)}
}
async function appendImage(file){
  if(!file)return;
  try{
    var data=await imageData(file);
    var o={id:'image-'+Date.now(),type:'image',src:data,x:240,y:120,w:250,h:300,fit:'contain'};
    deck.slides[index].objects.push(o);
    selected=o;store();render();inspector();msg('Изображение добавлено')
  }catch(e){msg(e.message)}
}

function inspector(){
  if(!edit)return;
  var c=document.getElementById('inspector');c.innerHTML='';
  if(!selected){
    c.appendChild(txt(E('p','hint'),'Нажмите на изображение для замены. Новый файл можно также добавить кнопкой вверху.'));
    return
  }
  var s=selected;
  function field(n,key,val,kind){
    var l=txt(E('label'),n),e=kind==='textarea'?E('textarea'):E('input');
    e.value=val==null?'':val;
    e.id='attr-'+key;
    if(kind==='number')e.type='number';
    e.addEventListener('input',function(){
      s[key]=kind==='number'?Number(e.value):e.value;
      store();render()
    });
    c.appendChild(l);c.appendChild(e)
  }
  if(s.type==='image'){
    c.appendChild(txt(E('label'),'ИЗОБРАЖЕНИЕ'));
    var wrap=E('div','image-editor'),prev=E('img','image-preview');
    prev.src=resolveImage(s.src);prev.alt='Предпросмотр изображения';
    wrap.appendChild(prev);
    var zone=E('div','image-drop');
    zone.tabIndex=0;zone.setAttribute('role','button');
    zone.appendChild(txt(E('span'),'Загрузить другое изображение'));
    zone.appendChild(txt(E('small'),'JPG, PNG, WebP, AVIF · перетащите или нажмите'));
    wrap.appendChild(zone);
    var input=E('input','image-upload-input');input.type='file';
    input.accept='image/jpeg,image/png,image/webp,image/avif';
    wrap.appendChild(input);
    var total=deck.slides.reduce(function(acc,v){
      return acc+v.objects.filter(function(o){return o.type==='image'&&o.src===s.src}).length
    },0);
    var checkLine=E('label','image-check'),check=E('input');
    check.type='checkbox';check.checked=total>1;
    checkLine.appendChild(check);
    checkLine.appendChild(txt(E('span'),'Заменить во всех местах ('+total+')'));
    wrap.appendChild(checkLine);
    var note=E('p','image-upload-note');
    note.textContent='Изображение сохраняется внутри файла презентации при публикации. Отдельная загрузка файла в GitHub больше не нужна.';
    wrap.appendChild(note);
    input.addEventListener('change',function(){
      if(input.files&&input.files[0])updateImage(input.files[0],s,check.checked)
    });
    zone.addEventListener('click',function(){input.click()});
    zone.addEventListener('keydown',function(ev){
      if(ev.key===' '||ev.key==='Enter'){ev.preventDefault();input.click()}
    });
    zone.addEventListener('dragover',function(ev){
      ev.preventDefault();zone.classList.add('is-over')
    });
    zone.addEventListener('dragleave',function(){zone.classList.remove('is-over')});
    zone.addEventListener('drop',function(ev){
      ev.preventDefault();zone.classList.remove('is-over');
      if(ev.dataTransfer&&ev.dataTransfer.files[0])updateImage(ev.dataTransfer.files[0],s,check.checked)
    });
    c.appendChild(wrap);
    field('Ссылка / путь изображения','src',s.src,'text');
    var fitLabel=txt(E('label'),'Масштабирование картинки'),sel=E('select');
    [['contain','Целиком'],['cover','Заполнить область'],['fill','Растянуть']].forEach(function(a){
      var op=E('option');op.value=a[0];op.textContent=a[1];sel.appendChild(op)
    });
    sel.value=s.fit||'contain';
    sel.onchange=function(){s.fit=sel.value;store();render()};
    c.appendChild(fitLabel);c.appendChild(sel)
  }else if(s.type==='text'){
    field('Текст','text',s.text,'textarea')
  }
  var g=E('div','twocol');c.appendChild(g);
  ['x','y','w','h'].forEach(function(p){
    var wrap=E('div'),l=txt(E('label'),p.toUpperCase()),inp=E('input');
    inp.type='number';inp.id='attr-'+p;inp.value=s[p];
    inp.oninput=function(){s[p]=Number(inp.value);store();render()};
    wrap.appendChild(l);wrap.appendChild(inp);g.appendChild(wrap)
  });
  if(s.type==='text'){
    field('Размер шрифта','size',s.size,'number');
    field('Цвет текста (HEX)','color',s.color,'text')
  }
  var del=txt(E('button'),'Удалить элемент');
  del.style.marginTop='14px';
  del.onclick=function(){
    deck.slides[index].objects=deck.slides[index].objects.filter(function(o){return o!==s});
    selected=null;store();render();inspector()
  };
  c.appendChild(del)
}
function store(){if(!edit)return;clearTimeout(draftTimer);draftTimer=setTimeout(function(){saveDraft().catch(function(e){console.warn('Черновик не сохранён',e)})},350)}document.getElementById('prev').onclick=function(){go(index-1)};document.getElementById('next').onclick=function(){go(index+1)};document.addEventListener('keydown',function(e){if(e.target.matches('input,textarea'))return;if(e.key==='ArrowRight')go(index+1);if(e.key==='ArrowLeft')go(index-1)});window.addEventListener('resize',render);if(edit){document.getElementById('addImage').onclick=function(){document.getElementById('quickImageFile').click()};document.getElementById('quickImageFile').onchange=function(){if(this.files&&this.files[0])appendImage(this.files[0]);this.value=''};document.getElementById('addText').onclick=function(){var o={id:'custom-'+Date.now(),type:'text',text:'Новый текст',x:500,y:255,w:320,h:55,size:22,color:'#263441',font:'sans'};deck.slides[index].objects.push(o);selected=o;store();render();inspector()};document.getElementById('saveDraft').onclick=async function(){try{await saveDraft();msg('Черновик сохранён в браузере')}catch(e){msg('Ошибка сохранения: '+e.message)}};document.getElementById('downloadJson').onclick=function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(deck,null,2)],{type:'application/json'}));a.download='world-treasures-deck.json';a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},2000)};
document.getElementById('publish').onclick=async function(){
  var token=document.getElementById('pat').value.trim();
  if(!token){msg('Вставьте токен GitHub в поле слева');return}
  var btn=this,status=document.getElementById('saveStatus');
  btn.disabled=true;btn.textContent='Публикация…';
  try{
    status.textContent='Подготовка изменений и изображений…';
    // All images are kept in a shared image dictionary inside deck.json.
    // This avoids a separate GitHub asset-upload request and duplicates across slides.
    var copy=JSON.parse(JSON.stringify(deck));
    if(!copy.embeddedImages||typeof copy.embeddedImages!=='object')copy.embeddedImages={};
    var pending=new Map();
    for(var slide of copy.slides)for(var object of slide.objects){
      if(object.type==='image' && typeof object.src==='string' && object.src.startsWith('data:image/')){
        var data=object.src;
        if(!pending.has(data)){
          var b64=data.split(',')[1]||'';
          var binary=Uint8Array.from(atob(b64),function(c){return c.charCodeAt(0)});
          var digest=await crypto.subtle.digest('SHA-256',binary);
          var hash=Array.from(new Uint8Array(digest)).map(function(c){return c.toString(16).padStart(2,'0')}).join('');
          pending.set(data,hash);
          copy.embeddedImages[hash]=data;
        }
        object.src='embedded:'+pending.get(data);
      }
    }
    var used=new Set();
    copy.slides.forEach(function(slide){slide.objects.forEach(function(o){
      if(o.type==='image'&&typeof o.src==='string'&&o.src.startsWith('embedded:'))used.add(o.src.slice(9))
    })});
    Object.keys(copy.embeddedImages).forEach(function(key){if(!used.has(key))delete copy.embeddedImages[key]});
    var content=JSON.stringify(copy,null,2);
    var bytes=new TextEncoder().encode(content);
    if(bytes.length>18*1024*1024)throw Error('Презентация больше 18 МБ. Сожмите добавленные изображения.');
    var api='https://api.github.com/repos/'+repo+'/contents/'+path;
    var h={'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
    status.textContent='Проверка доступа к презентации…';
    var current=await fetch(api,{headers:h});
    if(!current.ok){
      var g=await current.json().catch(function(){return {}});
      throw Error('GitHub '+current.status+': '+(g.message||'не удалось открыть файл презентации'));
    }
    var old=await current.json(),str='';
    for(var i=0;i<bytes.length;i++)str+=String.fromCharCode(bytes[i]);
    status.textContent='Сохранение презентации одним файлом…';
    var saved=await fetch(api,{method:'PUT',headers:h,body:JSON.stringify({message:'Update World Treasures slides and embedded images',content:btoa(str),sha:old.sha,branch:'main'})});
    if(!saved.ok){
      var err=await saved.json().catch(function(){return {}});
      var detail=String(err.message||'Ошибка GitHub');
      if(saved.status===403||saved.status===401)throw Error('GitHub отказал в записи ('+saved.status+'). Проверьте, что токен имеет Contents: Read and write и доступ к stoliarovd-mitrey/black_edition. Ответ: '+detail);
      throw Error('Не удалось сохранить: '+saved.status+'. '+detail);
    }
    deck=copy;
    await saveDraft();
    render();inspector();
    status.textContent='Опубликовано! Слайды и изображения сохранены. GitHub Pages обновится в течение нескольких минут.';
    msg('Слайды и изображения опубликованы')
  }catch(e){
    status.textContent=e.message||String(e);
    msg('Не удалось опубликовать — черновик сохранён')
  }finally{btn.disabled=false;btn.textContent='Опубликовать на GitHub'}
}
}else{document.getElementById('full').onclick=function(){document.documentElement.requestFullscreen?.()};document.getElementById('print').onclick=function(){var c=E('div','printwrap');deck.slides.forEach(function(s,i){c.appendChild(slideRender(s,i,true))});document.body.appendChild(c);window.print();setTimeout(function(){c.remove()},1000)}}fetch('deck.json?'+Date.now()).then(function(r){if(!r.ok)throw Error(r.status);return r.json()}).then(async function(data){deck=data;if(edit){var draft=await getDraft();if(draft&&draft.slides)deck=draft}render();if(edit)inspector()}).catch(function(e){frame.textContent='Не удалось загрузить данные презентации: '+e.message})})();