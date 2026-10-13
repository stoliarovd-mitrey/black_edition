'use strict';
function wireLinks(){document.querySelectorAll('[data-link]').forEach(el=>{el.setAttribute('tabindex','0');el.setAttribute('role','link');const open=()=>{const u=el.dataset.link;if(/^(https:\/\/|tel:|mailto:)/.test(u))location.href=u;};el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter')open();};});}
wireLinks();
fetch('published.json?v='+Date.now(),{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(d=>{if(d.version!==1||!Array.isArray(d.slides))throw Error('Format');document.getElementById('presentation').innerHTML=d.slides.map(s=>'<section class="slide">'+s+'</section>').join('');wireLinks();}).catch(()=>{});
