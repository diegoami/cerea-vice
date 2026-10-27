import {_electron} from 'playwright-core';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';
const profile=await mkdtemp(path.join(tmpdir(),'cerea-tile-profile-'));let app;
try{
 app=await _electron.launch({args:[path.resolve('.'),'--district=cerea-outskirts','--tile-lab',`--user-data-dir=${profile}`,...(process.platform==='linux'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[])]});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.waitForFunction(()=>window.tileLabResult?.done,{},{timeout:180000});
 const result=await page.evaluate(()=>window.tileLabResult);if(errors.length||result.error)throw new Error(JSON.stringify({errors,result}));
 await mkdir('test-results',{recursive:true});await writeFile('test-results/C-tile-lab.json',JSON.stringify(result,null,2)+'\n');await page.screenshot({path:'test-results/C-tile-lab.png'});console.log(JSON.stringify(result,null,2));
}finally{await app?.close();await rm(profile,{recursive:true,force:true});}
