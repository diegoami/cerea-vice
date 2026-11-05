import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
import {checkOpening} from './opening-check.mjs';

test('production browser opening, small-window touch scrolling and release handoff',{timeout:120000},async()=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4175','--strictPort'],{stdio:'ignore'});
 let browser;
 try{
  let ready=false;
  for(let i=0;i<100;i++){try{ready=(await fetch('http://127.0.0.1:4175')).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.ok(ready,'Production preview must start');
  browser=await chromium.launch({...(process.env.CEREA_BROWSER_EXECUTABLE?{executablePath:process.env.CEREA_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:4175');
  await checkOpening(page,(width,height)=>page.setViewportSize({width,height}),'browser');await page.close();
  const controller=await browser.newPage();await controller.goto('http://127.0.0.1:4175');
  await controller.getByRole('button',{name:'Start',exact:true}).waitFor();
  await controller.evaluate(()=>{window.pad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[window.pad]});});
  await controller.waitForTimeout(100);
  await controller.evaluate(()=>window.pad.buttons[9].value=1);await controller.getByRole('button',{name:'Begin game'}).waitFor();
  await controller.waitForTimeout(250);assert.equal(await controller.getByRole('button',{name:'Begin game'}).isVisible(),true);
  await controller.evaluate(()=>window.pad.buttons[9].value=0);await controller.waitForTimeout(100);
  await controller.evaluate(()=>window.pad.buttons[0].value=1);await controller.getByRole('button',{name:'Release controls to begin…'}).waitFor();
  await controller.evaluate(()=>window.pad.buttons[0].value=0);await controller.locator('#overlay').waitFor({state:'hidden'});await controller.close();
  const touch=await browser.newContext({hasTouch:true,viewport:{width:390,height:844}}),small=await touch.newPage();
  await small.goto('http://127.0.0.1:4175');await small.getByRole('button',{name:'Start',exact:true}).tap();
  await small.getByRole('button',{name:'Begin game'}).waitFor();
  const cdp=await small.context().newCDPSession(small);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:420}]});
  for(const y of [380,330,280,220])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await small.waitForFunction(()=>document.querySelector('#overlay').scrollTop>10);
  const reading=await small.locator('#overlay').boundingBox(),options=await small.locator('.presentation-settings').boundingBox();
  assert.ok(reading.y+reading.height<=options.y,'Options do not obscure the instructions on a small viewport');
  await small.screenshot({path:'test-results/opening-browser-touch-rules.png'});
  await small.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerdown',{pointerId:55})));
  await small.getByRole('button',{name:'Begin game'}).tap();await small.getByRole('button',{name:'Release controls to begin…'}).waitFor();
  await small.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup',{pointerId:55})));
  await small.locator('#overlay').waitFor({state:'hidden'});assert.equal(await small.locator('#opening').count(),0);
  await touch.close();
 }finally{await browser?.close();server.kill();}
});
