(()=>{
 const api='https://api.github.com/repos/stoliarovd-mitrey/black_edition';
 const path='/contents/samsung-concepts/page-content.js';
 let busy=false,remoteForLoad=null;
 const say=text=>$('#github-status').textContent=text;
 const baseReady=saveQueue.catch(()=>{});
 function decode64(value){return new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0)));}
 function encode64(value){const bytes=new TextEncoder().encode(value);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
 function parseSource(source){const prefix='window.CAVIAR_PAGE_DATA = ';if(!source.startsWith(prefix))throw Error('format');return validate(JSON.parse(source.slice(prefix.length).trim().replace(/;$/,'')));}
 async function request(route,token,options={}){
  const response=await fetch(api+route,{...options,cache:'no-store',redirect:'error',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(60000)});
  if(!response.ok){const e=new Error('github');e.status=response.status;throw e;}
  return response.json();
 }
 async function getRemote(token){const file=await request(path+'?ref=main',token);let content=file.content;if(!content){content=(await request('/git/blobs/'+file.sha,token)).content;}return {sha:file.sha,data:parseSource(decode64(content))};}
 function message(e){if(e.status===401)return 'GitHub не принял токен. Проверьте его значение и срок действия.';if(e.status===403||e.status===404)return 'Нет доступа к репозиторию. Проверьте выбор black_edition и право Contents: Read and write у токена.';if(e.status===409||e.status===422)return 'Файл изменился или запись запрещена правилами ветки. Обновите проверку кнопкой «Опубликовать на сайте».';if(e.name==='TimeoutError')return 'GitHub не ответил вовремя. Проверьте интернет и повторите публикацию.';if(e.message==='format')return 'Содержимое файла в GitHub имеет неизвестный формат. Публикация остановлена.';return 'Не удалось завершить публикацию. Черновик сохранён; проверьте интернет и повторите попытку.';}
 async function publish(overwrite=false){
  if(busy)return;
  const token=$('#github-token').value.trim();if(!token){say('Вставьте GitHub-токен в поле выше.');$('#github-token').focus();return;}
  busy=true;$('#github-publish').disabled=true;$('#github-overwrite').disabled=true;$('#github-load').disabled=true;$('#github-token').disabled=true;$('#github-conflict').hidden=true;
  try{
   const snapshot=clone(data);validate(snapshot);await save();await baseReady;
   say('Проверяем актуальную версию в GitHub…');
   const remote=await getRemote(token);remoteForLoad=remote;
   const serialized=JSON.stringify(snapshot),remoteJSON=JSON.stringify(remote.data);
   if(serialized===remoteJSON){await CaviarStore.putPublishBase(remoteJSON);say('Эти правки уже сохранены в GitHub. Дополнительная публикация не требуется.');return;}
   const baseline=await CaviarStore.getPublishBase();
   if(!overwrite&&baseline!==remoteJSON){$('#github-conflict').hidden=false;say(baseline?'В GitHub есть изменения, которых не было в начале редактирования.':'Для этого черновика ещё не сохранена исходная версия. Выберите, какую версию использовать.');return;}
   const source='window.CAVIAR_PAGE_DATA = '+JSON.stringify(snapshot,null,2)+';\n';
   if(new TextEncoder().encode(source).length>90*1024*1024){say('Размер страницы превышает лимит GitHub. Уменьшите загруженные изображения.');return;}
   say('Отправляем правки в GitHub…');
   await request(path,token,{method:'PUT',body:JSON.stringify({message:'Update concept page from browser editor',branch:'main',sha:remote.sha,content:encode64(source)})});
   // Commit succeeded even if browser draft metadata cannot be persisted.
   try{await CaviarStore.putPublishBase(serialized);}catch{}
   $('#github-token').value='';
   say('Правки сохранены в GitHub. GitHub Pages обновит страницу после завершения сборки, обычно в течение 1–2 минут.');
   const link=document.createElement('a');link.href='./?published='+Date.now();link.target='_blank';link.rel='noopener';link.textContent='Открыть страницу ↗';link.className='link-button';$('#github-status').append(document.createElement('br'),link);
   status('Правки отправлены на публикацию'+(JSON.stringify(data)!==serialized?' · В редакторе есть более новые изменения':''));
  }catch(e){say(message(e));}finally{busy=false;$('#github-publish').disabled=false;$('#github-overwrite').disabled=false;$('#github-load').disabled=false;$('#github-token').disabled=false;}
 }
 $('#github-publish').onclick=()=>publish(false);
 $('#github-overwrite').onclick=()=>publish(true);
 $('#github-load').onclick=async()=>{if(busy||!remoteForLoad)return;remember();data=clone(remoteForLoad.data);selectedCol='';selectedProject='';changed();render();await save();try{await CaviarStore.putPublishBase(JSON.stringify(data));say('Актуальная версия загружена. Можно продолжать редактирование.');$('#github-conflict').hidden=true;}catch{say('Не удалось сохранить исходную версию в браузере.');}};
 $('#export-dialog').addEventListener('close',()=>{$('#github-token').value='';});
})();
