import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {_electron} from 'playwright-core';
import {checkTownAtlas} from './town-atlas-check.mjs';
test('native town/regional atlas retains knowledge, zoom and drag across modes and resizes',{timeout:240000},async()=>{
 const profile=await mkdtemp(path.join(tmpdir(),'cerea-town-atlas-'));
 const app=await _electron.launch({args:[path.resolve('.'),'--district=veronese',`--user-data-dir=${profile}`,...(process.platform==='linux'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[])]});
 try{const page=await app.firstWindow();await checkTownAtlas(page,async(width,height)=>{await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});await page.waitForFunction(({width,height})=>innerWidth===width&&innerHeight===height,{width,height});},'native');}
 finally{await app.close();await rm(profile,{recursive:true,force:true});}
});
