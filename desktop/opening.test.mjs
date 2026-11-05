import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {_electron} from 'playwright-core';
import {checkOpening} from './opening-check.mjs';
test('autonomous opening isolates saves, freezes rules, releases controls and survives gameplay resizes',{timeout:120000},async()=>{
 const profile=await mkdtemp(path.join(tmpdir(),'cerea-opening-'));
 const app=await _electron.launch({args:[path.resolve('.'),'--district=cerea',`--user-data-dir=${profile}`,...(process.platform==='linux'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[])]});
 try{
  const page=await app.firstWindow();
  await checkOpening(page,async(width,height)=>{await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});await page.waitForFunction(({width,height})=>innerWidth===width&&innerHeight===height,{width,height});},'desktop');
 }finally{await app.close();await rm(profile,{recursive:true,force:true});}
});
