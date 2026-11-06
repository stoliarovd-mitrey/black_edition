/* Caviar KPI comparison chart. Public UI code; all KPI data remains in encrypted index.html. */
(()=>{
'use strict';
if(document.getElementById('comparisonPeriods'))return;
const html=String.raw\`
<section class="comparison-section" id="comparisonPeriods">
  <div class="sectionbar"><h2>Сравнение периодов</h2><span>Месяцы, недели и общий итог</span></div>
  <div class="panel comparison-panel">
    <div class="comparison-controls">
      <label>Показатель<select id="comparisonMetric"></select></label>
      <label>Детализация<select id="comparisonMode"><option value="month">По месяцам</option><option value="week">По неделям</option><option value="total">Итог по периоду</option></select></label>
    </div>
    <div class="comparison-ranges">
      <fieldset><legend><i class="comparison-key-a"></i>Период A</legend><div class="comparison-dates"><label>С даты<input type="date" id="comparisonAStart"></label><label>По дату<input type="date" id="comparisonAEnd"></label></div></fieldset>
      <fieldset><legend><i class="comparison-key-b"></i>Период B</legend><div class="comparison-dates"><label>С даты<input type="date" id="comparisonBStart"></label><label>По дату<input type="date" id="comparisonBEnd"></label></div></fieldset>
    </div>
    <p class="comparison-warning" id="comparisonWarning" role="status"></p>
    <div class="comparison-scroller" tabindex="0" aria-label="Сравнительный график, доступна горизонтальная прокрутка"><div class="comparison-graph" id="comparisonGraph"></div></div>
    <div class="comparison-legend"><span><i class="comparison-key-a"></i>Период A</span><span><i class="comparison-key-b"></i>Период B</span><span>Подписи над столбцами показывают значения</span></div>
    <div class="comparison-summary" id="comparisonSummary" aria-live="polite"></div>
    <p class="comparison-note">Недели считаются с субботы по пятницу. Столбцы сопоставляются по порядку месяцев или недель. Штриховка обозначает неполный период. Конверсии рассчитываются из сумм за выбранные дни.</p>
  </div>
</section>\`;
const anchor=document.querySelector('.tablebox');
if(!anchor)return;
anchor.insertAdjacentHTML('afterend',html);
const opts={
 russia:{metric:'Посетители',mode:'month',aStart:'2025-09-01',aEnd:'2025-10-31',bStart:'2026-09-01',bEnd:'2026-10-31'},
 global:{metric:'Посетители',mode:'week',aStart:'2026-10-10',aEnd:'2026-10-16',bStart:'2026-10-17',bEnd:'2026-10-23'}
};
const ids={metric:'comparisonMetric',mode:'comparisonMode',aStart:'comparisonAStart',aEnd:'comparisonAEnd',bStart:'comparisonBStart',bEnd:'comparisonBEnd'};
const byId=id=>document.getElementById(id);
const info=()=>opts[store];
const data=()=>store==='russia'?SOURCE.daily:SOURCE.globalDaily;
const days=(a,b)=>Math.round((isoDay(b)-isoDay(a))/86400000)+1;
const nextMonth=s=>isoAdd(s,33).slice(0,7)+'-01';
const shortDay=s=>s.slice(8,10)+'.'+s.slice(5,7);
const valueOf=(p,key)=>p&&p.rows.length?calc(p.rows)[key]:null;
const visible=(v,key)=>{
 if(v===null||v===undefined||!Number.isFinite(v))return '—';
 if(ratio.has(key))return pr(v);
 if(!money.has(key))return nf(v);
 const x=Math.abs(v);
 if(x>=1000000)return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(v/1000000)+' млн';
 if(x>=10000)return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(v/1000)+' тыс';
 return nf(v)+' ₽';
};
function periods(begin,finish,mode,rows){
 if(mode==='total'){
  const a=rows.filter(r=>r.date>=begin&&r.date<=finish);
  return [{start:begin,end:finish,rows:a,complete:a.length===days(begin,finish)}];
 }
 const out=[];let p=mode==='week'?saturday(begin):begin.slice(0,7)+'-01';
 for(let i=0;i<500&&p<=finish;i++){
  const end=mode==='week'?isoAdd(p,6):isoAdd(nextMonth(p),-1);
  const startLimit=p>begin?p:begin,endLimit=end<finish?end:finish;
  const a=rows.filter(r=>r.date>=startLimit&&r.date<=endLimit);
  out.push({start:startLimit,end:endLimit,rows:a,complete:startLimit===p&&endLimit===end&&a.length===days(p,end)});
  p=mode==='week'?isoAdd(p,7):nextMonth(p);
 }
 return out;
}
function difference(key,a,b){
 if(a===null||b===null)return {raw:null,abs:'—',pct:'—'};
 const delta=b-a;
 const sign=delta>0?'+':'';
 const abs=ratio.has(key)?sign+new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(delta*100)+' п.п.':sign+disp(key,delta);
 const pct=a===0?'—':(delta/a>0?'+':'')+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1,minimumFractionDigits:1}).format(delta/a*100)+'%';
 return {raw:delta,abs,pct};
}
function rangeLabel(p,mode){
 if(!p)return 'нет данных';
 if(mode==='month')return new Date(p.start+'T12:00:00Z').toLocaleDateString('ru-RU',{month:'short',year:'numeric',timeZone:'UTC'});
 return shortDay(p.start)+'–'+shortDay(p.end);
}
function render(){
 const o=info();Object.entries(ids).forEach(([name,id])=>byId(id).value=o[name]);
 const graph=byId('comparisonGraph'),warning=byId('comparisonWarning'),summary=byId('comparisonSummary');
 warning.textContent='';summary.innerHTML='';
 const ranges=[o.aStart,o.aEnd,o.bStart,o.bEnd];
 if(ranges.some(s=>!/^\d{4}-\d{2}-\d{2}$/.test(s))||o.aStart>o.aEnd||o.bStart>o.bEnd){
  graph.innerHTML='<div class="comparison-empty">Проверьте даты начала и окончания периодов.</div>';return;
 }
 const rows=data(),pA=periods(o.aStart,o.aEnd,o.mode,rows),pB=periods(o.bStart,o.bEnd,o.mode,rows);
 const pairs=Array.from({length:Math.max(pA.length,pB.length)},(_,i)=>[pA[i]||null,pB[i]||null]);
 const nums=pairs.flatMap(pair=>pair.map(p=>valueOf(p,o.metric))).filter(v=>v!==null&&Number.isFinite(v));
 const peak=Math.max(1,...nums.map(Math.abs));
 const bar=(p,side)=>{
  const v=valueOf(p,o.metric);
  if(v===null)return '<div class="comparison-slot"><span class="comparison-number">—</span></div>';
  const h=Math.max(3,Math.round(Math.abs(v)/peak*150));
  const title=side+': '+disp(o.metric,v)+' ('+p.start+' – '+p.end+')'+(p.complete?'':' · неполный период');
  return '<div class="comparison-slot"><span class="comparison-number">'+esc(visible(v,o.metric))+'</span><div title="'+esc(title)+'" class="comparison-bar comparison-'+side+(p.complete?'':' comparison-partial')+(v<0?' comparison-negative':'')+'" style="height:'+h+'px"></div></div>';
 };
 graph.innerHTML=pairs.map(([a,b],i)=>{
  const av=valueOf(a,o.metric),bv=valueOf(b,o.metric);
  const pct=a&&b&&a.complete&&b.complete?difference(o.metric,av,bv).pct:'—';
  const caption=o.mode==='week'?'Неделя '+(i+1):o.mode==='month'?'Месяц '+(i+1):'Итого';
  return '<div class="comparison-cluster"><div class="comparison-bars">'+bar(a,'a')+bar(b,'b')+'</div>'+
  '<div class="comparison-caption">'+caption+'</div>'+
  '<div class="comparison-range-label">A: '+esc(rangeLabel(a,o.mode))+(a&&!a.complete?' *':'')+'</div>'+
  '<div class="comparison-range-label">B: '+esc(rangeLabel(b,o.mode))+(b&&!b.complete?' *':'')+'</div>'+
  '<div class="comparison-change">'+(pct==='—'?'':esc('Изменение: '+pct))+'</div></div>';
 }).join('')||'<div class="comparison-empty">За выбранные периоды данных нет.</div>';
 const allA=periods(o.aStart,o.aEnd,'total',rows)[0],allB=periods(o.bStart,o.bEnd,'total',rows)[0];
 const av=valueOf(allA,o.metric),bv=valueOf(allB,o.metric);
 const eligible=allA.complete&&allB.complete&&av!==null&&bv!==null&&days(o.aStart,o.aEnd)===days(o.bStart,o.bEnd);
 const delta=eligible?difference(o.metric,av,bv):{abs:'—',pct:'—',raw:null};
 const stat=(name,val,sub,cls='')=>'<div class="comparison-stat"><span>'+esc(name)+'</span><strong class="'+cls+'">'+esc(val)+'</strong><small>'+esc(sub)+'</small></div>';
 const cls=delta.raw>0?'comparison-positive':delta.raw<0?'comparison-negative-text':'';
 summary.innerHTML=stat('Период A',av===null?'—':disp(o.metric,av),o.aStart+' – '+o.aEnd)+
 stat('Период B',bv===null?'—':disp(o.metric,bv),o.bStart+' – '+o.bEnd)+
 stat('Разница B − A',delta.abs,'Абсолютное изменение',cls)+stat('Изменение, %',delta.pct,'Относительно периода A',cls);
 const warnings=[];
 if(!allA.complete||!allB.complete)warnings.push('Один из периодов неполный или содержит отсутствующие дни.');
 if(days(o.aStart,o.aEnd)!==days(o.bStart,o.bEnd))warnings.push('Диапазоны имеют разную продолжительность.');
 if(pA.length!==pB.length)warnings.push('Количество групп A и B различается.');
 if(warnings.length)warnings.push('Для несопоставимых интервалов изменение показано прочерком.');
 warning.textContent=warnings.join(' ');
}
byId('comparisonMetric').innerHTML=keys.map(k=>'<option value="'+esc(k)+'">'+esc(k)+'</option>').join('');
for(const [field,id] of Object.entries(ids))byId(id).addEventListener('change',e=>{info()[field]=e.target.value;render();});
for(const id of ['storeRussia','storeGlobal'])byId(id).addEventListener('click',render);
render();
})();
