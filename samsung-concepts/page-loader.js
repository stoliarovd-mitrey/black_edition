(async()=>{
 let data=window.CAVIAR_PAGE_DATA;
 if(new URLSearchParams(location.search).has('draft')){try{data=await CaviarStore.get()||data;}catch(e){console.warn('Draft unavailable',e);}}
 window.PAGE_DATA=data;window.CAVIAR_COLLECTIONS=data.collections;
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.renderCollectionMarkup=(key)=>data.collections.filter(c=>c.device===key).map(c=>`<section class="collection" id="${key}-${c.id}" aria-labelledby="title-${key}-${c.id}"><div class="section-heading"><h2 id="title-${key}-${c.id}">${esc(c.title)}</h2></div><div class="grid">${c.items.map(m=>`<button class="card" data-id="${esc(m.id)}" data-full="${esc(m.full)}" data-title="${esc(c.title+' · '+m.name)}" aria-label="Открыть концепт: ${esc(m.name)}"><span class="card-visual"><img src="${esc(m.thumb||m.full)}" alt="${esc(m.name)}" width="597" height="800" loading="lazy" decoding="async"><span class="card-details" aria-hidden="true">Подробнее</span></span></button>`).join('')}</div></section>`).join('')||'<p class="empty-catalog">В этой категории пока нет проектов.</p>';
 document.querySelector('.catalog').innerHTML=renderCollectionMarkup('fold');
 for(const t of data.texts){const el=document.querySelector(t.selector);if(el){el.textContent=t.value;if(el.matches('h1'))el.style.whiteSpace='pre-line';}}
 document.querySelector('.hero-visual img').src=data.hero;
 for(const [key,value] of Object.entries(data.devices))document.querySelector('#tab-'+key).textContent=value;
 const script=document.createElement('script');script.src='app.js?v=editor1';document.body.append(script);
})();
