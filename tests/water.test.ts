import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {District,inRect} from '../src/world/district';
import {streamingColliders} from '../src/world/streaming/colliders';

test('a water area is solid except where a road crosses it, and is validated',{timeout:120000},async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'cerea-water-'));
 try{
  const data=JSON.parse(await readFile('public/maps/cerea.json','utf8'));
  const nodes=new Map(data.nodes.map((n:any)=>[n.id,n]));
  // A 60 m square of water centred on a long, straight road segment: the road acts as a bridge.
  const road=data.roads.map((r:any)=>({r,a:nodes.get(r.a) as any,b:nodes.get(r.b) as any})).find(({a,b}:any)=>Math.hypot(b.x-a.x,b.z-a.z)>25)!;
  const mid={x:(road.a.x+road.b.x)/2,z:(road.a.z+road.b.z)/2};
  data.waterAreas=[{name:'Test water',points:[{x:mid.x-30,z:mid.z-30},{x:mid.x+30,z:mid.z-30},{x:mid.x+30,z:mid.z+30},{x:mid.x-30,z:mid.z+30}]}];
  const file=path.join(directory,'district.json');await writeFile(file,JSON.stringify(data));
  const prepared=spawnSync('node',['tools/prepare-town.mjs',file],{encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr);
  const result=JSON.parse(await readFile(file,'utf8')),context=new District(result);
  assert.equal(result.waterAreas.length,1);assert.equal(result.waterAreas[0].points.length,4,'The drawn area keeps the whole square');
  const solid=streamingColliders(context).filter(r=>result.waterAreas[0].solid.includes(r));
  const blocked=(p:{x:number;z:number})=>solid.some(r=>inRect(p,r,-1.05));
  assert.equal(blocked(mid),false,'The crossing road stays drivable');
  const length=Math.hypot(road.b.x-road.a.x,road.b.z-road.a.z),nx=-(road.b.z-road.a.z)/length,nz=(road.b.x-road.a.x)/length;
  const beside=[1,-1].map(s=>({x:mid.x+nx*s*20,z:mid.z+nz*s*20})).filter(p=>!context.isPaved(p));
  assert.ok(beside.length>0&&beside.every(blocked),'Water beside the road is solid');
  // Malformed water areas are rejected.
  for(const bad of [[{name:'x',points:[{x:0,z:0},{x:1,z:1}],solid:[]}],[{name:'<b>',points:result.waterAreas[0].points,solid:[]}],[{name:'x',points:result.waterAreas[0].points}]])
   assert.throws(()=>new District({...result,waterAreas:bad}),/Invalid water area/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('squares are paved, drivable ground drawn in the atlas, and invalid squares are refused',async()=>{
 const {readFileSync}=await import('node:fs');const {District}=await import('../src/world/district');const {createAtlas}=await import('../src/ui/Atlas');
 const verona=JSON.parse(readFileSync('public/maps/verona/manifest.json','utf8')),context=new District(verona);
 const bra=verona.pavedAreas.find((a:any)=>a.name==='Piazza Bra');
 // A point of the square well away from every road centreline is paved only because of the square.
 const xs=bra.points.map((p:any)=>p.x),zs=bra.points.map((p:any)=>p.z);let found=false;
 for(let x=Math.min(...xs);x<=Math.max(...xs)&&!found;x+=2)for(let z=Math.min(...zs);z<=Math.max(...zs)&&!found;z+=2){
  const p={x,z};if(!context.onSquare(p)||context.nearestRoad(p).distance<6||context.parkingZones.some(b=>Math.hypot(b.x-p.x,b.z-p.z)<20))continue;
  assert.ok(context.isPaved(p));found=true;
 }
 assert.ok(found,'Piazza Bra has open paved ground away from its streets');
 assert.match(createAtlas(context).atlasMarkup('map'),/fill="#e9e0c9"/,'the atlas draws squares');
 const cerea=JSON.parse(readFileSync('public/maps/cerea.json','utf8'));
 assert.doesNotMatch(createAtlas(new District(cerea)).atlasMarkup('map'),/#e9e0c9/,'Cerea has none');
 assert.throws(()=>new District({...cerea,pavedAreas:[{name:'<b>',points:[{x:0,z:0},{x:1,z:0},{x:0,z:1}]}]}),/Invalid paved area/);
 assert.throws(()=>new District({...cerea,pavedAreas:[{name:'Piazza',points:[{x:0,z:0}]}]}),/Invalid paved area/);
});

test('a river centreline inside its mapped river area is not solid, so bridges stay open',async()=>{
 const {readFileSync}=await import('node:fs');const {District}=await import('../src/world/district');const {streamingColliders}=await import('../src/world/streaming/colliders');
 const context=new District(JSON.parse(readFileSync('public/maps/verona/manifest.json','utf8')));
 const lines=streamingColliders(context).filter(r=>!(r as any).osmId&&r.points?.length===4&&!context.district.waterAreas!.some(a=>a.solid.includes(r)));
 assert.ok(lines.every(r=>!context.inWaterArea(r)),'no Adige line piece inside the Adige area');
});
