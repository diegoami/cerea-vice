import {checkHudLayout} from './hud-check.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
export async function checkOpening(page,resize,label,district='cerea'){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'Start',exact:true}).waitFor();
 const key=`cerea-save-${district}`;
 await page.evaluate(key=>{localStorage.setItem(key,'existing manual save');Math.random=()=>683129967/4294967296;},key);
 await page.reload();await page.getByRole('button',{name:'Start',exact:true}).waitFor();
 const before=await page.evaluate(()=>JSON.stringify(localStorage));
 await page.keyboard.down('w');await page.keyboard.down('f');await page.keyboard.down('t');
 await page.waitForTimeout(6500);
 await page.waitForFunction(()=>/PASSENGER|COLLECT|DROP|FARE/.test(document.querySelector('#objective-stage').textContent));
 await page.keyboard.up('w');await page.keyboard.up('f');await page.keyboard.up('t');
 assert.equal(await page.locator('#overlay').isHidden(),true,'Gameplay keys cannot open the atlas in the demo');
 assert.equal(await page.locator('.demo-label').textContent(),'DEMO  MODE');
 assert.match(await page.locator('#objective-stage').innerText(),/PASSENGER|COLLECT|DROP|FARE/,'The autonomous driver accepts and services real taxi work');
 assert.equal(await page.evaluate(()=>JSON.stringify(localStorage)),before,'Demo does not write saves, dispatch history or crossing state');
 await mkdir('test-results',{recursive:true});
 for(const [w,h] of [[960,640],[1280,900],[1440,900],[1920,1080]]){
  await resize(w,h);await checkHudLayout(page);
  await page.waitForFunction(()=>{
   const canvas=document.querySelector('#viewport'),gl=canvas.getContext('webgl2'),limit=Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),gl.getParameter(gl.MAX_TEXTURE_SIZE),...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
   const scale=Math.min(devicePixelRatio||1,2,3840/innerWidth,2160/innerHeight,limit/innerWidth,limit/innerHeight);
   return Math.abs(canvas.width-Math.round(innerWidth*scale))<=1&&Math.abs(canvas.height-Math.round(innerHeight*scale))<=1&&!canvas.classList.contains('pixel-picture');
  });
  await page.screenshot({path:`test-results/opening-${label}-demo-${w}.png`});
 }
 // Held Enter can open the rules only once; repeated keydowns cannot confirm.
 await page.keyboard.down('Enter');await page.getByRole('button',{name:'Begin game'}).waitFor();
 const frozen=await page.locator('#timer').innerText();
 await page.keyboard.down('Enter');await page.waitForTimeout(500);
 assert.equal(await page.getByRole('button',{name:'Begin game'}).isVisible(),true);
 assert.equal(await page.locator('#timer').innerText(),frozen,'Rules freeze the demo clock');
 await page.keyboard.up('Enter');
 for(const [w,h] of [[960,640],[1440,900]]){await resize(w,h);await page.screenshot({path:`test-results/opening-${label}-rules-${w}.png`});}
 if(district==='veronese'){
  await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>document.activeElement?.getAttribute('data-district')==='london-westminster');
  await page.keyboard.press('ArrowUp');await page.waitForFunction(()=>document.activeElement?.getAttribute('data-district')==='veronese');
 }
 await page.keyboard.press('End');assert.ok(await page.locator('#overlay').evaluate(e=>e.scrollTop)>100,'Keyboard scrolls the instructions');
 await page.keyboard.press('Home');
 await page.evaluate(()=>{window.openingPad={connected:true,mapping:'standard',axes:[0,0,0,1],buttons:Array.from({length:17},()=>({value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.openingPad]});});
 await page.waitForFunction(()=>document.querySelector('#overlay').scrollTop>30,null,{timeout:10000});
 await page.evaluate(()=>window.openingPad.axes[3]=0);
 // Change a binding and check the rules name the current control, not a stale default.
 await page.getByRole('button',{name:'Change controls',exact:true}).click();
 await page.locator('[data-control=shiftGear][data-device=key]').click();await page.keyboard.press('g');await page.getByRole('button',{name:'Back',exact:true}).click();
 await page.waitForFunction(()=>/Forward \/ reverse\s+G/.test(document.querySelector('.opening-instructions').innerText));
 await page.keyboard.down('w');
 await page.getByRole('button',{name:'Begin game',exact:true}).click();
 await page.getByRole('button',{name:'Release controls to begin…'}).waitFor();
 await page.waitForTimeout(600);assert.equal(await page.locator('#timer').innerText(),frozen,'Confirmation waits for the held accelerator');
 await page.keyboard.up('w');await page.locator('#overlay').waitFor({state:'hidden'});
 assert.equal(await page.locator('#opening').count(),0,'Opening DOM is destroyed');
 assert.match(await page.locator('#objective-stage').innerText(),/FREE DRIVING/);
 assert.match(await page.locator('#taxi-status').innerText(),/€0.00/);
 assert.equal(await page.locator('#gear').innerText(),'D');
 assert.equal(await page.evaluate(key=>JSON.stringify(localStorage.getItem(key)),key),JSON.stringify('existing manual save'));
 // A renderer resize listener must outlive opening disposal. Then drive and ask information.
 for(const [w,h] of [[1280,720],[960,640],[1440,900]]){
  await resize(w,h);await page.waitForTimeout(120);
  assert.ok(await page.locator('#viewport').evaluate(e=>e.width>0&&e.height>0));
 }
 const top=await page.locator('#overlay').evaluate(e=>e.scrollTop);
 await page.keyboard.press('End');assert.equal(await page.locator('#overlay').evaluate(e=>e.scrollTop),top,'Opening key listener has been removed');
 await page.locator('#stream-status').waitFor({state:'hidden'});
 const idleHeading=await page.locator('#heading').innerText();
 await page.waitForTimeout(5000);
 assert.match(await page.locator('#objective-stage').innerText(),/FREE DRIVING/,'The bot cannot book work after handoff');
 assert.equal(await page.locator('#speed').innerText(),'00','Fresh player car stays still without input');
 assert.equal(await page.locator('#heading').innerText(),idleHeading,'No autonomous steering survives handoff');
 await page.keyboard.down('w');await page.waitForTimeout(1200);await page.keyboard.up('w');
 assert.doesNotMatch(await page.locator('#stop-state').innerText(),/STOP/,'Fresh player controls drive the car');
 assert.equal(await page.locator('#prompt').isHidden(),true,'Travel does not repeat stopped-control instructions');
 await page.screenshot({path:`test-results/opening-${label}-playing.png`});
 await page.keyboard.press('p');await page.getByRole('button',{name:/^Save (game|shift)$/}).click();
 await page.locator('.save-status').filter({hasText:/Saved/}).waitFor();
 assert.notEqual(await page.evaluate(key=>localStorage.getItem(key),key),'existing manual save','Manual saving resumes after handoff');
 await page.getByRole('button',{name:/^Continue saved (game|shift)$/}).click();await page.locator('.save-status').filter({hasText:/Loaded/}).waitFor();
 assert.deepEqual(errors,[]);
}
