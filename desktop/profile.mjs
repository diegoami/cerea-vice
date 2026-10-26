import { _electron } from 'playwright-core';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile=await mkdtemp(path.join(tmpdir(),'cerea-profile-'));
let app;
try {
 app=await _electron.launch({args:[path.resolve('.'),'--profile',...(process.env.CEREA_DISTRICT?['--district='+process.env.CEREA_DISTRICT]:[]),`--user-data-dir=${profile}`,...(process.platform==='linux'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[])]});
 const page=await app.firstWindow();
 await page.getByRole('button',{name:'Start the engine'}).waitFor();
 if(process.env.CEREA_PICTURE)await page.locator('[data-key=resolution]').selectOption(process.env.CEREA_PICTURE);
 if(process.env.CEREA_DETAIL)await page.locator('[data-key=detail]').selectOption(process.env.CEREA_DETAIL);
 await page.getByRole('button',{name:'Start the engine'}).click();
 await page.waitForFunction(()=>document.querySelector('#stop-state')?.textContent==='P · LEGAL STOP');
 await page.waitForTimeout(2000);
 await page.keyboard.press('f'); // Stopped request exercises nearest-road/route profiling without exposing a live location.
 await page.keyboard.press('Enter'); // Start the first fare, exercising route accounting.
 await page.waitForTimeout(300);
 const result=await page.evaluate(async()=>{
  const samples=[];let last=performance.now();
  for(let i=0;i<150;i++){const now=await new Promise(requestAnimationFrame);if(i>=30)samples.push(now-last);last=now;}
  samples.sort((a,b)=>a-b);
  const gl=document.querySelector('canvas').getContext('webgl2');
  const extension=gl?.getExtension('WEBGL_debug_renderer_info');
  return {cpuTimings:document.querySelector('#performance-stats')?.textContent??'profiling not available',picture:document.querySelector('[data-key=resolution]')?.value??'legacy sharp',detail:document.querySelector('[data-key=detail]')?.value??'legacy',buffer:[gl?.drawingBufferWidth,gl?.drawingBufferHeight],gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):'unavailable',medianMs:samples[60],p95Ms:samples[114],samples:120,viewport:[innerWidth,innerHeight],renderer:gl?.getParameter(gl.RENDERER),userAgent:navigator.userAgent};
 });
 await mkdir('test-results',{recursive:true});
 const label=process.argv[2]??'profile';
 await page.screenshot({path:`test-results/${label}.png`});
 await writeFile(`test-results/${label}.json`,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
} finally{await app?.close();await rm(profile,{recursive:true,force:true});}
