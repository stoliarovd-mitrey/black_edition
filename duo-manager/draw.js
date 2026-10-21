function measure(ctx,t,spacing){return ctx.measureText(t).width+Math.max(0,t.length-1)*spacing;}
function wrap(ctx,text,width,spacing){const lines=[];for(const paragraph of text.split('\n')){if(!paragraph){lines.push('');continue;}let line='';for(const word of paragraph.split(/\s+/)){const trial=line?`${line} ${word}`:word;if(line&&measure(ctx,trial,spacing)>width){lines.push(line);line=word;}else line=trial;}lines.push(line);}return lines;}
function drawLine(ctx,line,x,y,spacing){if(!spacing){ctx.fillText(line,x,y);return;}for(const ch of line){ctx.fillText(ch,x,y);x+=ctx.measureText(ch).width+spacing;}}
function drawField(ctx,f){let size=Number(f.size),spacing=Number(f.spacing)||0;const [x,y,w,h]=f.rect;let lines,lineHeight,ascent;
 for(let n=0;n<500;n++){spacing=(Number(f.spacing)||0)*(size/f.size);ctx.font=`${f.weight} ${size}px Nunito`;lines=wrap(ctx,f.text,w,spacing);lineHeight=f.lineHeight*(size/f.size);ascent=ctx.measureText('HА').actualBoundingBoxAscent||size*.73;const extent=(lines.length-1)*lineHeight+ascent+size*.24;if(extent<=h&&lines.every(t=>measure(ctx,t,spacing)<=w))break;size=Math.max(6,size-1);}
 ctx.fillStyle=f.color;ctx.textBaseline='alphabetic';
 lines.forEach((line,j)=>{const baseline=y+ascent+j*lineHeight;drawLine(ctx,line,x,baseline,spacing);if(f.underline){ctx.strokeStyle=f.color;ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(x,baseline+4);ctx.lineTo(x+measure(ctx,line,spacing),baseline+4);ctx.stroke();}});
}
