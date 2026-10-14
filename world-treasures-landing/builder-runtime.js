'use strict';
/* Published GrapesJS data is optional. No builder project means the original World Treasures page is untouched. */
(async function(){
 const page=document.getElementById('page');
 function fallback(){
   const old=document.createElement('script');
   old.src='app.js';
   old.onerror=()=>{page.textContent='Не удалось загрузить страницу.'};
   document.body.append(old);
 }
 function clean(html){
   const doc=new DOMParser().parseFromString('<div id="safe-root">'+html+'</div>','text/html');
   const root=doc.getElementById('safe-root');
   if(!root)throw Error('Некорректный HTML');
   root.querySelectorAll('script,iframe,object,embed,form,link,meta,style,base').forEach(el=>el.remove());
   for(const el of root.querySelectorAll('*')){
     for(const a of Array.from(el.attributes)){
       const n=a.name.toLowerCase(),v=a.value.trim();
       if(n.startsWith('on')||n==='srcdoc')el.removeAttribute(a.name);
       if(['href','src','poster'].includes(n)){
         if(!v || /^javascript:/i.test(v) || /^data:/i.test(v) && !/^data:image\/(png|jpeg|webp);base64,/i.test(v))el.removeAttribute(a.name);
       }
     }
   }
   return root.innerHTML;
 }
 try{
   const r=await fetch('./builder-data.json',{cache:'no-store'});
   if(r.status===404){fallback();return}
   if(!r.ok)throw Error('Не удалось загрузить опубликованную версию');
   const data=await r.json();
   if(data.version!==1||typeof data.html!=='string'||typeof data.css!=='string'||data.html.length>2000000||data.css.length>500000)throw Error('Некорректный проект');
   const theme=document.createElement('link');theme.rel='stylesheet';theme.href='builder-theme.css';document.head.append(theme);
   const css=document.createElement('style');css.id='builder-custom-css';css.textContent=data.css.replace(/@import[^;]*;/gi,'');
   document.head.append(css);
   page.innerHTML=clean(data.html);
   document.body.classList.add('builder-published');
   page.querySelectorAll('img').forEach(img=>{
     img.loading=img.closest('.wt-hero')?'eager':'lazy';
     img.decoding='async';
     img.addEventListener('error',()=>{
       if(img.dataset.fallback){img.src=img.dataset.fallback;img.removeAttribute('data-fallback')}
     },{once:true});
   });
 }catch(err){console.warn('Builder display fallback:',err.message);fallback()}
})();
