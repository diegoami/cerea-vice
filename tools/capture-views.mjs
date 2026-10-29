// Comparable windshield screenshots and colour statistics for palette / picture-mode reviews.
// Usage (after `npm run build`; under Xvfb on headless Linux):
//   xvfb-run -a -s '-screen 0 1920x1200x24' node tools/capture-views.mjs <label> [pictures]
// Writes test-results/views/<label>/*.png and summary.json. Poses are fixed map
// positions loaded through the ordinary saved-shift path, so no game globals exist.
import {_electron} from 'playwright-core';
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const label=process.argv[2]??'views';
const available=(await readFile('src/presentation/Settings.ts','utf8')).match(/resolution:([^;]+);/)[1];
const pictures=(process.argv[3]??['sharp','retro-fine','retro'].join(',')).split(',').filter(p=>available.includes(`'${p}'`));
const hours=(process.env.CEREA_HOURS??'8,16.5').split(',').map(Number);
const size={width:1280,height:720};
const out=path.join('test-results','views',label);
// Every registered district with fixed poses (`views` in public/maps/towns.json) is captured.
const districts=JSON.parse(await readFile('public/maps/towns.json','utf8')).towns.filter(town=>town.views?.length)
 .map(town=>({id:town.id,map:`public/maps/${town.map}`,poses:town.views}));

/** Heading along the nearest road (forward is +sin(h), -cos(h)), for a stable look down a street. */
function pose(map,spec){
 const nodes=new Map(map.nodes.map(n=>[n.id,n]));
 const bay=spec.bay&&map.parkingZones.find(p=>p.id===spec.bay);
 let target=bay?{x:bay.x,z:bay.z}:{x:NaN,z:spec.z};
 let best;
 for(const road of map.roads){const a=nodes.get(road.a),b=nodes.get(road.b);const dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz||1;
  if(Number.isNaN(target.x)){if((a.z-spec.z)*(b.z-spec.z)>0)continue;const t=(spec.z-a.z)/(dz||1);const p={x:a.x+dx*t,z:spec.z};const d=Math.abs(p.x);if(!best||d<best.d)best={d,a,b,p};continue;}
  const t=Math.max(0,Math.min(1,((target.x-a.x)*dx+(target.z-a.z)*dz)/l2)),p={x:a.x+dx*t,z:a.z+dz*t},d=Math.hypot(p.x-target.x,p.z-target.z);
  if(!best||d<best.d)best={d,a,b,p};}
 if(Number.isNaN(target.x))target=best.p;
 const heading=bay&&Math.hypot(bay.x-map.spawn.x,bay.z-map.spawn.z)<1?map.spawn.heading:Math.atan2(best.b.x-best.a.x,-(best.b.z-best.a.z));
 return {x:target.x,z:target.z,heading:(heading+Math.PI*2)%(Math.PI*2)};
}

/** Mean CIELAB per band of the windshield (sky / street / lower), plus a green-hue share. */
async function stats(page,png){
 return page.evaluate(async b64=>{
  const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const c=canvas.getContext('2d');c.drawImage(img,0,0);
  const {data,width,height}=c.getImageData(0,0,img.width,img.height);
  const lin=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
  const f=t=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116;
  const bands={sky:[0,.3],street:[.3,.62],lower:[.62,1],all:[0,1]},result={};
  for(const [name,[from,to]] of Object.entries(bands)){
   let n=0,L=0,A=0,B=0,R=0,G=0,Bl=0,green=0;
   for(let y=Math.floor(from*height);y<Math.floor(to*height);y+=2)for(let x=0;x<width;x+=2){
    const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
    const lr=lin(r),lg=lin(g),lb=lin(b);
    const X=(.4124*lr+.3576*lg+.1805*lb)/.95047,Y=.2126*lr+.7152*lg+.0722*lb,Z=(.0193*lr+.1192*lg+.9505*lb)/1.08883;
    const l=116*f(Y)-16,a=500*(f(X)-f(Y)),bb=200*(f(Y)-f(Z));
    n++;L+=l;A+=a;B+=bb;R+=r;G+=g;Bl+=b;
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    if(max-min>12&&max===g)green++;
   }
   const k=v=>Math.round(v/n*10)/10;
   result[name]={L:k(L),a:k(A),b:k(B),rgb:[k(R),k(G),k(Bl)],greenDominantPct:k(green*100)};
  }
  return result;
 },png.toString('base64'));
}

await mkdir(out,{recursive:true});
const summary=[];
for(const district of districts){
 const map=JSON.parse(await readFile(district.map,'utf8'));
 const profile=await mkdtemp(path.join(tmpdir(),'cerea-views-'));
 const app=await _electron.launch({args:[path.resolve('.'),`--district=${district.id}`,`--user-data-dir=${profile}`,...(process.platform==='linux'?['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']:[])]});
 try{
  const page=await app.firstWindow();
  await app.evaluate(({BrowserWindow},s)=>BrowserWindow.getAllWindows()[0].setContentSize(s.width,s.height),size);
  await page.waitForFunction(s=>innerWidth===s.width&&innerHeight===s.height,size);
  await page.addInitScript(()=>{Math.random=()=>75/4294967296;});await page.reload();
  await page.getByRole('button',{name:'Start the engine'}).click();
  await page.waitForFunction(()=>/STOP/.test(document.querySelector('#stop-state')?.textContent??''),{},{timeout:60000});
  await page.keyboard.press('p');await page.getByRole('button',{name:'Back to the road'}).waitFor();
  await page.getByRole('button',{name:'Save shift'}).click();
  const key=`cerea-save-${district.id}`;
  const base=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),key));
  for(const spec of district.poses){
   const where=pose(map,{...spec,bay:spec.bay});
   for(const hour of hours){
    const save=structuredClone(base);Object.assign(save.car,where,{speed:0,gear:'D',steering:0});
    save.mission.totalElapsed=(hour-map.taxi.startHour)*3600/map.taxi.clockRate;save.mission.elapsed=0;
    await page.evaluate(([k,v])=>localStorage.setItem(k,v),[key,JSON.stringify(save)]);
    await page.evaluate(()=>{document.querySelector('.save-status').textContent='';});
    await page.getByRole('button',{name:'Continue saved shift'}).click();
    await page.waitForFunction(()=>/Loaded/.test(document.querySelector('.save-status')?.textContent??''));
    await page.waitForTimeout(district.id==='cerea'?1500:6000);
    for(const picture of pictures){
     await page.locator('[data-key=resolution]').selectOption(picture);
     await page.waitForTimeout(900);
     const buffer=await page.locator('#viewport').evaluate(c=>[c.width,c.height]);
     const png=await page.locator('#viewport').screenshot({style:'#hud,#stream-status,#performance-stats{visibility:hidden !important}'});
     const file=path.join(out,`${district.id}-${spec.name}-${String(hour).replace('.','h')}-${picture}.png`);
     await writeFile(file,png);
     summary.push({file:path.resolve(file),district:district.id,pose:spec.name,hour,picture,buffer,colour:await stats(page,png)});
     console.log(summary.at(-1).file,JSON.stringify(summary.at(-1).colour.all));
    }
   }
  }
 }finally{await app.close();await rm(profile,{recursive:true,force:true});}
}
await writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,1)+'\n');
