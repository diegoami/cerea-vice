import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
import {checkTownAtlas} from './town-atlas-check.mjs';
test('town/regional atlas zooms quickly and drags continuously without network or marker updates',{timeout:240000},async t=>{
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4178','--strictPort'],{stdio:'ignore'});let browser;
 t.after(()=>server.kill());
 try{
  let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch('http://127.0.0.1:4178')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  browser=await chromium.launch({...(process.env.CEREA_BROWSER_EXECUTABLE?{executablePath:process.env.CEREA_BROWSER_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  const context=await browser.newContext({hasTouch:true});const page=await context.newPage();await page.goto('http://127.0.0.1:4178/#district=veronese&opening=rules');
  await checkTownAtlas(page,(width,height)=>page.setViewportSize({width,height}),'browser',{offline:true});
  const closing=Date.now();await page.close();console.info({pageCloseMs:Date.now()-closing});
 }finally{console.info('Closing atlas browser');await browser?.close();server.kill();console.info('Atlas browser closed');}
});
