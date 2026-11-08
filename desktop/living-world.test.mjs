import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

test('continuous service supports voluntary rest, a visible night sky and the new selectable London map',{timeout:180000},async()=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4176','--strictPort'],{stdio:'ignore'});let browser;
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch('http://127.0.0.1:4176')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  browser=await chromium.launch({...(process.env.CEREA_BROWSER_EXECUTABLE?{executablePath:process.env.CEREA_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4176');
  const begin=async()=>{await page.getByRole('button',{name:'Start',exact:true}).click();await page.getByRole('button',{name:'Begin game',exact:true}).click();await page.locator('#overlay').waitFor({state:'hidden'});await page.locator('#stream-status').waitFor({state:'hidden'});await page.waitForFunction(()=>/STOP/.test(document.querySelector('#stop-state').textContent));};
  await begin();await page.keyboard.press('p');await page.getByRole('button',{name:'Save game',exact:true}).click();await page.locator('.save-status').filter({hasText:/Saved/}).waitFor();
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('cerea-save-veronese')));
  const rest=async()=>{await page.getByRole('button',{name:'Rest for 8 hours',exact:true}).click();await page.locator('#rest-overlay').waitFor();await page.locator('#rest-overlay').waitFor({state:'hidden'});};
  await rest();assert.match(await page.locator('#timer').innerText(),/^15:/);await rest();assert.match(await page.locator('#timer').innerText(),/^23:/);
  await page.getByRole('button',{name:'Save game',exact:true}).click();await page.locator('.save-status').filter({hasText:/Saved/}).waitFor();const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('cerea-save-veronese')));
  assert.deepEqual(after.car,before.car);assert.deepEqual(after.atlas,before.atlas);assert.equal(after.mission.earningsCents,before.mission.earningsCents);assert.ok(Math.abs(after.mission.totalElapsed-before.mission.totalElapsed-1920)<1e-6);
  // A separate saved fixture views moonrise from the open gateway road; the normal
  // 8-hour rest assertions above use the unchanged player pose and knowledge.
  const map=JSON.parse(await readFile('public/maps/veronese/manifest.json','utf8')),gate=map.nodes.find(n=>n.id==='1027266513');
  const night=structuredClone(after),moon=Math.atan2(-Math.cos((19-6)/12*Math.PI),.28);
  Object.assign(night.car,{x:gate.x,z:gate.z,heading:moon,speed:0,steering:0});night.mission.totalElapsed=1440;night.mission.elapsed=Math.min(night.mission.elapsed,1440);
  await page.evaluate(value=>localStorage.setItem('cerea-save-veronese',JSON.stringify(value)),night);
  await page.getByRole('button',{name:'Continue saved game',exact:true}).click();await page.locator('.save-status').filter({hasText:/Loaded/}).waitFor();
  await page.getByRole('button',{name:'Back to the road'}).click();await page.locator('#overlay').waitFor({state:'hidden'});await page.locator('#stream-status').waitFor({state:'hidden'});await mkdir('test-results',{recursive:true});
  assert.match(await page.locator('#timer').innerText(),/^19:/);await page.screenshot({path:'test-results/living-night-road-browser.png'});await page.screenshot({path:'test-results/living-night-moon-browser.png'});
  await page.keyboard.press('p');await page.getByRole('button',{name:'Main screen',exact:true}).click();await page.getByRole('button',{name:'Confirm: leave game',exact:true}).click();
  await page.getByRole('button',{name:'Start',exact:true}).click();assert.deepEqual(await page.locator('.district-switch button').allInnerTexts(),['Veronese world','London Westminster']);
  await page.getByRole('button',{name:'London Westminster',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#hud')?.getAttribute('data-district')==='london-westminster');await page.getByRole('button',{name:'Begin game',exact:true}).click();await page.locator('#overlay').waitFor({state:'hidden'});await page.locator('#stream-status').waitFor({state:'hidden'});await page.waitForFunction(()=>/STOP/.test(document.querySelector('#stop-state').textContent));assert.equal(await page.locator('#hud').getAttribute('data-district'),'london-westminster');
  await page.keyboard.press('o');await page.locator('.fare-board').waitFor();assert.equal(await page.locator('[data-fare-offer]').count(),4);await page.locator('[data-fare=accept]').click();await page.locator('#overlay').waitFor({state:'hidden'});assert.equal(await page.locator('#goal-caption').textContent(),'PICKUP');
  await page.screenshot({path:'test-results/london-selectable-browser.png'});await page.keyboard.press('p');assert.equal(await page.getByRole('button',{name:'Rest for 8 hours',exact:true}).isDisabled(),true,'An accepted passenger prevents sleeping');assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.kill();}
});
