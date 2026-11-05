import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function checkHudLayout(page){
 const map=JSON.parse(await readFile('public/maps/veronese/manifest.json','utf8'));
 const cases=map.taxi.stops.map(s=>({landmark:s.name.replace(/\s*\([^)]+\)$/,''),town:s.townId==='verona-south'?'Verona':s.townId==='cerea'?'Cerea':s.town,street:s.road}));
 const failures=await page.evaluate(cases=>{
  const title=document.querySelector('#objective-title'),town=document.querySelector('#goal-town'),street=document.querySelector('#goal-street'),earnings=document.querySelector('#earnings');
  const restore=[title,town,street,earnings].map(e=>e.textContent),bad=[];
  earnings.textContent='€12345.67';
  for(const c of cases){
   title.textContent=c.landmark;town.textContent=c.town;street.textContent=c.street;
   const panel=document.querySelector('.destination-panel').getBoundingClientRect(),compass=document.querySelector('.compass-panel').getBoundingClientRect(),header=document.querySelector('.topbar').getBoundingClientRect(),money=earnings.getBoundingClientRect(),time=document.querySelector('#timer').getBoundingClientRect();
   if(panel.right>compass.left-8||panel.bottom>header.bottom+1||panel.left<0||money.right>time.left-4||time.right>innerWidth)bad.push({case:c,panel:{right:panel.right,bottom:panel.bottom},compass:compass.left,header:header.bottom});
   for(const e of [title,town,street,earnings])if(e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1)bad.push({case:c,clipped:e.id});
  }
  [title,town,street,earnings].forEach((e,i)=>e.textContent=restore[i]);return bad;
 },cases);
 assert.deepEqual(failures,[],`Every landmark, town, street and earnings counter fits at ${await page.evaluate(()=>innerWidth)}`);
 assert.equal(await page.locator('.district-tag').count(),0,'The world-name banner is removed');
 assert.equal(await page.locator('.objective').count(),0,'The duplicate objective card is removed');
}
