/* Layout settings are applied after content discovery, keeping text IDs stable. */
(() => {
  'use strict';
  const main = document.querySelector('main');
  const originalChildren = [...main.children];
  const blocks = originalChildren.filter(el => el.matches('section,article,nav')).map((element,index) => {
    const type = element.matches('.hero') ? 'hero' : element.matches('.model') ? 'model' : element.matches('.lineup') ? 'lineup' : element.matches('.details') ? 'details' : element.matches('.intro,.contact') ? 'columns' : element.matches('nav') ? 'nav' : element.matches('.film-section,.city-break') ? 'media' : 'chapter';
    const id = element.id || element.querySelector('h1[id],h2[id]')?.id || `section-${index+1}`;
    element.dataset.layoutId = id;
    const heading = element.querySelector('h1,h2');
    const label = heading ? [...heading.childNodes].map(node=>node.nodeName==='BR'?' ':node.textContent).join('').trim() : element.getAttribute('aria-label') || (element.matches('.film-section') ? 'Фильм о коллекции' : 'Раздел');
    return {id,type,label,element,index,reverse:element.classList.contains('model-reverse'),canHeight:element.matches('.hero,.city-break')};
  });
  const style = document.createElement('style');
  style.dataset.layoutStyle = '';
  document.head.append(style);
  let layout = {}, guide, appliedOrder = null;
  let guideSettings = {visible:false,columns:12};
  const number = (value,min,max) => value!=='' && value!==null && value!==undefined && Number.isFinite(Number(value)) ? Math.min(max,Math.max(min,Number(value))) : null;
  const rule = (selector,values) => `${selector}{${values.join(';')}}`;
  const blockSelector = block => `[data-layout-id="${block.id}"]`;
  function apply(value = {}) {
    layout = value && typeof value==='object' ? value : {};
    const settings = layout.global || {};
    const css = ['[data-layout-hidden],[data-layout-target-hidden]{display:none!important}'];
    const maxWidth = number(settings.maxWidth,800,2400), side = number(settings.side,12,160), globalGap = number(settings.gap,8,160);
    if (maxWidth!==null || side!==null) {
      const inset = `max(${side??24}px,calc((100vw - ${maxWidth??1540}px)/2))`;
      css.push(rule('.section-pad,.collection-nav,.site-header,.footer',[`padding-left:${inset}!important`,`padding-right:${inset}!important`]));
      css.push(rule('.hero-copy,.hero-topline',[`left:${inset}`,`right:${inset}`]));
      css.push(rule('.hero h1',[`font-size:clamp(46px,calc((100vw - ${inset} - ${inset}) * .195),320px)`]));
      css.push(rule('.city-caption',[`left:${inset}`]));
      // Keep comfortable margins on narrow screens even with a wide desktop margin.
      css.push(`@media(max-width:760px){.section-pad,.collection-nav,.site-header,.footer{padding-left:${Math.min(side??24,32)}px!important;padding-right:${Math.min(side??24,32)}px!important}.hero-copy,.hero-topline{left:${Math.min(side??24,32)}px;right:${Math.min(side??24,32)}px}.hero h1{font-size:clamp(40px,calc((100vw - ${Math.min(side??24,32)*2}px) * .195),160px)}.city-caption{left:${Math.min(side??24,32)}px}}`);
    }
    if(globalGap!==null) css.push(rule('.model,.intro,.details,.contact,.lineup-grid,.detail-grid',[`gap:${globalGap}px`]));
    const order = Array.isArray(layout.order) ? [...new Set(layout.order)].map(id=>blocks.find(block=>block.id===id)).filter(Boolean) : [];
    const orderKey=order.map(block=>block.id).join('|');
    if(orderKey!==appliedOrder) {
    if(order.length) {
      const ordered=[...order,...blocks.filter(block=>!order.includes(block))];
      for(const block of ordered)main.append(block.element);
      const marker=document.getElementById('models');
      const firstModel=ordered.find(block=>block.type==='model'&&!layout.blocks?.[block.id]?.hidden);
      if(marker&&firstModel)main.insertBefore(marker,firstModel.element);
    } else for(const element of originalChildren)main.append(element);
    appliedOrder=orderKey;
    }
    for(const block of blocks) {
      const config=layout.blocks?.[block.id]||{}, selector=blockSelector(block), values=[];
      block.element.toggleAttribute('data-layout-hidden',config.hidden===true);
      const paddingTop=number(config.paddingTop,0,240),paddingBottom=number(config.paddingBottom,0,240),gap=number(config.gap,0,160),height=number(config.height,300,1200);
      if(paddingTop!==null)values.push(`padding-top:${paddingTop}px!important`);
      if(paddingBottom!==null)values.push(`padding-bottom:${paddingBottom}px!important`);
      if(gap!==null)values.push(`gap:${gap}px!important`);
      if(height!==null&&block.canHeight) values.push(`height:${height}px`,`min-height:${height}px`,`max-height:none`);
      if(values.length)css.push(rule(selector,values));
      if(block.type==='model') {
        const variant=['image-left','image-right','image-top','image-bottom'].includes(config.variant)?config.variant:null;
        const share=number(config.imageShare,30,70),ratio=['1','4/3','3/4','16/9'].includes(config.ratio)?config.ratio:null;
        const mode=variant||(block.reverse?'image-right':'image-left');
        if(variant||share!==null) {
          const stacked=['image-top','image-bottom'].includes(mode),imageFirst=['image-left','image-top'].includes(mode),imageColumn=imageFirst?1:2;
          css.push(`@media(min-width:761px){${selector}{grid-template-columns:${stacked?'minmax(0,1fr)':imageFirst?`minmax(0,${share??53}fr) minmax(0,${100-(share??53)}fr)`:`minmax(0,${100-(share??53)}fr) minmax(0,${share??53}fr)`}}${selector} .model-visual{grid-column:${stacked?1:imageColumn};grid-row:${stacked?(imageFirst?1:2):1}}${selector} .model-copy{grid-column:${stacked?1:3-imageColumn};grid-row:${stacked?(imageFirst?2:1):1};${stacked?'max-width:100%':''}}}`);
          if(stacked)css.push(`@media(max-width:760px){${selector} .model-visual{grid-row:${imageFirst?1:2}!important}${selector} .model-copy{grid-row:${imageFirst?2:1}!important}}`);
        }
        if(ratio)css.push(rule(`${selector} .model-visual`,[`aspect-ratio:${ratio}`]));
      }
      if(['columns','details'].includes(block.type)&&['two-columns','stacked'].includes(config.variant)) {
        css.push(`@media(min-width:761px){${selector}{grid-template-columns:${config.variant==='stacked'?'minmax(0,1fr)':'minmax(0,1fr) minmax(0,1fr)'}}${selector} .intro-copy{padding-top:0}${config.variant==='stacked'?`${selector} .contact-copy,${selector} .intro-copy{max-width:100%}`:''}}`);
      }
      if(['lineup','details'].includes(block.type)) {
        const columns=number(config.columns,1,6),mobileColumns=number(config.mobileColumns,1,2);
        const grid=`${selector} ${block.type==='lineup'?'.lineup-grid':'.detail-grid'}`;
        if(columns!==null)css.push(`@media(min-width:761px){${grid}{grid-template-columns:repeat(${Math.round(columns)},minmax(0,1fr))}}`);
        if(mobileColumns!==null)css.push(`@media(max-width:760px){${grid}{grid-template-columns:repeat(${Math.round(mobileColumns)},minmax(0,1fr))}}`);
        if(gap!==null)css.push(rule(grid,[`gap:${gap}px!important`]));
      }
    }
    for(const anchor of document.querySelectorAll('a[href^="#"]:not(.skip-link)')) {
      const target=document.getElementById(anchor.getAttribute('href').slice(1));
      anchor.toggleAttribute('data-layout-target-hidden',!!target?.closest('[data-layout-hidden]'));
    }
    style.textContent=css.join('\n');
    setGuides(guideSettings);
  }
  function setGuides(settings) {
    guideSettings={...guideSettings,...settings};
    if(!guideSettings.visible) {guide?.remove();guide=null;return;}
    if(!guide){guide=document.createElement('div');guide.dataset.editorOnly='';guide.setAttribute('aria-hidden','true');document.body.append(guide);}
    const global=layout.global||{},width=number(global.maxWidth,800,2400),side=number(global.side,12,160),gap=number(global.gap,8,160)??24;
    const columns=[4,6,12].includes(Number(guideSettings.columns))?Number(guideSettings.columns):12;
    const inset=width!==null||side!==null?`max(${Math.min(side??24,innerWidth<=760?32:160)}px,calc((100vw - ${width??1540}px)/2))`:'max(var(--side),calc((100vw - 1540px)/2))';
    guide.style.cssText=`position:fixed;top:0;bottom:0;left:${inset};right:${inset};z-index:500;pointer-events:none;display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:${gap}px`;
    guide.replaceChildren(...Array.from({length:columns},()=>{const el=document.createElement('i');el.style.cssText='background:#c35c9912;border-left:1px solid #c35c9940;border-right:1px solid #c35c9940';return el;}));
  }
  window.addEventListener('resize',()=>{if(guideSettings.visible)setGuides(guideSettings);});
  window.CaviarLayout={blocks,apply,setGuides};
})();
