import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const frames=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
export async function checkTownAtlas(page,resize,label,{offline=false}={}){
 const started=Date.now(),progress=stage=>console.info({atlas:label,stage,elapsedMs:Date.now()-started});
 const capture=async file=>{await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await frames(page);await page.screenshot({path:file});};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForFunction(()=>{const opening=document.querySelector('#opening');return opening&&(opening.hidden||document.querySelector('#opening button')?.disabled===false);});
 if(await page.getByRole('button',{name:'Start',exact:true}).isVisible())await page.getByRole('button',{name:'Start',exact:true}).click();
 await page.getByRole('button',{name:'Begin game',exact:true}).waitFor();
 await page.evaluate(()=>Math.random=()=>.08);
 await page.getByRole('button',{name:'Begin game',exact:true}).click();await page.locator('#overlay').waitFor({state:'hidden'});
 await page.locator('#stream-status').waitFor({state:'hidden'});await page.waitForFunction(()=>/STOP/.test(document.querySelector('#stop-state').textContent));await frames(page);
 await resize(960,640);await page.keyboard.press('t');await page.locator('.atlas-book[data-atlas-mode=town]').waitFor();
 assert.equal(await page.locator('.atlas-pin').evaluate(e=>e.style.display),'none','Opening the current town does not locate the car');
 await page.locator('.atlas-map[data-raster-ready=true]').waitFor();
 await page.keyboard.press('f');await page.waitForFunction(()=>/Last information received/.test(document.querySelector('#atlas-marker-status').textContent));
 const labelPixels=await page.locator('.atlas-map [data-street]').evaluateAll(labels=>{const label=labels.find(e=>e.style.display!=='none');return label?parseFloat(label.style.fontSize)*label.ownerSVGElement.getScreenCTM().a:0;});
 assert.ok(Math.abs(labelPixels-14)<.8,`Information-panel layout keeps labels readable: ${labelPixels}px`);progress('information-layout');
 await page.keyboard.press('t');await page.locator('#overlay').waitFor({state:'hidden'});await frames(page);await page.keyboard.press('p');
 await page.getByRole('button',{name:'Save game',exact:true}).click();
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('cerea-save-veronese')));
 assert.equal(before.atlas.source,'confirmed');
 await page.getByRole('button',{name:'Back to the road'}).click();await page.locator('#overlay').waitFor({state:'hidden'});await frames(page);
 await page.keyboard.press('t');await page.locator('.atlas-book[data-atlas-mode=town]').waitFor();
 progress('town-open');console.info(await page.locator('.atlas-map').evaluate(e=>({paperDrawMs:e.dataset.paperDrawMs,paperEncodeMs:e.dataset.paperEncodeMs})));
 assert.match(await page.locator('#atlas-title').innerText(),/Cerea/);
 assert.ok(await page.locator('.atlas-map [data-street]').count()>20);
 const toolbar=await page.locator('.atlas-zoom-controls').boundingBox(),drawing=await page.locator('.atlas-map').boundingBox();
 assert.ok(toolbar.y+toolbar.height<=drawing.y+1,'Zoom controls never cover printed street or landmark names');
 assert.ok(await page.locator('.atlas-map *').count()<1200,'Town view contains local batched geometry');
 const pin=await page.locator('.atlas-pin').getAttribute('transform'),status=await page.locator('#atlas-marker-status').innerText(),clock=await page.locator('#timer').innerText();
 if(offline)await page.context().setOffline(true);
 await mkdir('test-results',{recursive:true});await resize(1440,900);await capture(`test-results/town-atlas-${label}-town.png`);
 const paper=await page.locator('[data-atlas-paper]').elementHandle();
 const zoomSamples=[];
 for(let i=0;i<3;i++){
  const value=Number.parseInt(await page.locator('#atlas-zoom-level').innerText()),start=Date.now();
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.waitForFunction(v=>Number.parseInt(document.querySelector('#atlas-zoom-level').textContent)>=v*2,value);
  zoomSamples.push(Date.now()-start);
 }
 progress('zoom');
 assert.equal(await page.locator('#atlas-zoom-level').innerText(),'800%');
 assert.equal(await paper.evaluate(e=>e===document.querySelector('.atlas-map [data-atlas-paper]')),true,'Zoom reuses the cached paper rather than repainting all geometry');await paper.dispose();
 for(let i=0;i<4;i++)await page.getByRole('button',{name:'Zoom out',exact:true}).click();
 await page.locator('.atlas-book[data-atlas-mode=regional]').waitFor();console.info(await page.locator('.atlas-map').evaluate(e=>({regionalDrawMs:e.dataset.paperDrawMs,regionalEncodeMs:e.dataset.paperEncodeMs})));
 assert.equal(await page.locator('.atlas-map .atlas-scenery-buildings,.atlas-map [data-street]').count(),0);
 const regionalNodes=await page.locator('.atlas-map *').count();assert.ok(regionalNodes<300,'Regional map is towns and connecting roads, not the global street atlas');
 assert.equal(await page.locator('.atlas-town-areas [data-atlas-sheet]').count(),9);
 // Regional capture is performed by the native Windows smoke; SwiftShader's capture stalls after this mode switch.
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 const initialView=await page.locator('.atlas-map').getAttribute('viewBox');let map=await page.locator('.atlas-map').boundingBox();
 await page.mouse.move(map.x+map.width*.6,map.y+map.height*.5);await page.mouse.down();await page.mouse.move(map.x+map.width*.35,map.y+map.height*.6,{steps:2});await page.mouse.up();
 assert.notEqual(await page.locator('.atlas-map').getAttribute('viewBox'),initialView,'Regional dragging can cross old quadrant boundaries');
 await page.getByRole('button',{name:'Regional map',exact:true}).click();
 await page.locator('.atlas-town-areas [data-atlas-sheet=oppeano]').click();await page.locator('.atlas-book[data-atlas-mode=town]').waitFor();assert.equal(await page.locator('#atlas-title').innerText(),'Oppeano');
 map=await page.locator('.atlas-map').boundingBox();await page.mouse.move(map.x+map.width*.5,map.y+map.height*.5);await page.mouse.down();
 await page.mouse.move(map.x+map.width*.6,map.y+map.height*.5,{steps:1});await page.locator('.atlas-book[data-atlas-mode=regional]').waitFor();
 assert.equal(await page.locator('.atlas-map').evaluate(e=>e.hasPointerCapture(1)),true,'Dragging survives changing from town to regional drawing');
 const continued=await page.locator('.atlas-map').getAttribute('viewBox');await page.mouse.move(map.x+map.width*.8,map.y+map.height*.65,{steps:2});await page.mouse.up();
 assert.notEqual(await page.locator('.atlas-map').getAttribute('viewBox'),continued,'The same drag continues across the region');
 assert.equal(await page.locator('.atlas-map').evaluate(e=>e.hasPointerCapture(1)),false,'The transferred capture is released at the end of the drag');
 progress('regional-drag');
 for(const size of [[960,640],[1280,800]]){await resize(...size);await frames(page);assert.ok(await page.locator('.atlas-map').evaluate(e=>e.getBoundingClientRect().height)>100);}
 if(label==='browser'){
  await resize(390,844);await page.locator('.atlas-mode-navigation [data-atlas-sheet]').tap();
  const touchBox=await page.locator('.atlas-map').boundingBox();assert.ok(touchBox.width>220&&touchBox.height>150,'Portrait atlas keeps a usable map surface');
  const cdp=await page.context().newCDPSession(page),x=touchBox.x+touchBox.width*.45,y=touchBox.y+touchBox.height*.5;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(const offset of [30,70,100])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+offset,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  await page.locator('.atlas-book[data-atlas-mode=regional]').waitFor();
  await resize(1280,800);progress('portrait-touch');
 }
 assert.equal(await page.locator('.atlas-pin').getAttribute('transform'),pin);assert.equal(await page.locator('#atlas-marker-status').innerText(),status);assert.equal(await page.locator('#timer').innerText(),clock);
 // A deliberate rural estimate remains possible; an information request in the atlas restores known location.
 await page.getByRole('button',{name:'Regional map',exact:true}).click();
 await page.keyboard.down('ArrowDown');
 await page.waitForFunction(()=>{
  const svg=document.querySelector('.atlas-map'),match=svg.querySelector('.atlas-cursor').getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/);if(!match)return false;
  const x=Number(match[1]),z=Number(match[2]);
  return ![...svg.querySelectorAll('.atlas-town-areas rect')].some(r=>x>=Number(r.getAttribute('x'))&&x<=Number(r.getAttribute('x'))+Number(r.getAttribute('width'))&&z>=Number(r.getAttribute('y'))&&z<=Number(r.getAttribute('y'))+Number(r.getAttribute('height')));
 });
 await page.keyboard.up('ArrowDown');await page.keyboard.press('Enter');await page.waitForFunction(()=>/Your estimated position/.test(document.querySelector('#atlas-marker-status').textContent));
 await page.keyboard.press('f');await page.waitForFunction(()=>/Last information received/.test(document.querySelector('#atlas-marker-status').textContent));
 assert.equal(await page.locator('.atlas-pin').getAttribute('transform'),pin);assert.equal(await page.locator('#timer').innerText(),clock);

 progress('estimate-and-information');
 await page.keyboard.press('t');await page.locator('#overlay').waitFor({state:'hidden'});await frames(page);await page.keyboard.press('p');
 await page.getByRole('button',{name:'Save game',exact:true}).click();const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('cerea-save-veronese')));
 assert.deepEqual(after.car,before.car,'Atlas navigation never drives or turns the car');
 assert.deepEqual(after.atlas.marker,before.atlas.marker);assert.equal(after.atlas.source,before.atlas.source);assert.equal(after.atlas.label,before.atlas.label);
 assert.deepEqual(errors,[]);if(offline)await page.context().setOffline(false);
 console.info({atlas:label,regionalSvgNodes:regionalNodes,zoomClickMs:zoomSamples});
}
