import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const run=(...args:string[])=>spawnSync('python3',['tools/import-town.py',...args],{encoding:'utf8'});
const cereaSpec=async()=>JSON.parse(await readFile('towns/cerea.town.json','utf8'));

test('the Cerea town spec rebuilds the checked-in district byte for byte',{timeout:120000},async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'cerea-town-'));
 try{
  const output=path.join(directory,'cerea.json');
  const result=run('towns/cerea.town.json','--output',output);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/Cerea Centro: 558 road shape\/junction nodes, 583 segments, 51 streets, 1081 prepared building masses/);
  assert.ok((await readFile(output)).equals(await readFile('public/maps/cerea.json')),'Saves rely on the unchanged map signature');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('footprints that no road touches keep every corner',async()=>{
 const source=JSON.parse(await readFile('data/sources/cerea-osm.json','utf8')),map=JSON.parse(await readFile('public/maps/cerea.json','utf8'));
 const {lat,lon}=map.provenance.origin,k=111320*Math.cos(lat*Math.PI/180),round=(v:number)=>Math.round(v*100)/100;
 const rings=new Map<number,string>();
 for(const e of source.elements)if(e.tags?.building&&e.geometry?.length>=4)rings.set(e.id,JSON.stringify(e.geometry.slice(0,-1).map((g:any)=>[round((g.lon-lon)*k),round(-(g.lat-lat)*111320)])));
 const trimmed=new Set(map.provenance.trimmedFootprints);let lostCorner=0,checked=0;
 for(const b of map.buildings){const ring=rings.get(b.osmId);if(!ring||trimmed.has(b.osmId))continue;checked++;
  const points=JSON.parse(ring);if(JSON.stringify(b.points.map((p:any)=>[p.x,p.z]))===JSON.stringify(points.slice(0,-1)))lostCorner++;}
 assert.ok(checked>500);assert.equal(lostCorner,0,'An unclipped footprint used to lose its last corner');
});

test('a town spec is validated before any work, naming the problem',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'cerea-town-spec-'));
 try{
  const cases:[string,(spec:any)=>void,RegExp][]=[
   ['no stops',spec=>{spec.stops=[];},/"stops" must be a confirmed, non-empty list/],
   ['unknown stop',spec=>{spec.stops.push({landmark:'arena',bay:'Sosta Arena'});},/names no confirmed landmark/],
   ['repeated landmark',spec=>{spec.landmarks.push({...spec.landmarks[0]});},/landmark id "library" is repeated/],
   ['fare to itself',spec=>{spec.content.fares.push(['Ugo','post','post']);},/fare .* must be \[passenger, pickup stop, different destination stop\]/],
   ['start not a stop',spec=>{spec.content.start='arena';},/"content.start" must be a stop/],
   ['unimplemented preset',spec=>{spec.preset='sketch';},/preset "sketch" is not implemented yet/],
   ['unknown policy',spec=>{spec.stoppingPolicy='everywhere';},/"stoppingPolicy" must be/],
   ['inverted box',spec=>{spec.area.bbox.north=spec.area.bbox.south-0.01;},/south < north/],
   ['future spec',spec=>{spec.specVersion=2;},/specVersion must be 1/],
  ];
  for(const [name,change,message] of cases){
   const spec=await cereaSpec();change(spec);
   const file=path.join(directory,`${name.replace(/\W+/g,'-')}.town.json`);await writeFile(file,JSON.stringify(spec));
   const result=run(file,'--output',path.join(directory,'never.json'));
   assert.notEqual(result.status,0,name);assert.match(result.stderr,message,name);
  }
  // A confirmed landmark that is not in the extract fails instead of silently disappearing.
  const spec=await cereaSpec();spec.landmarks.push({osmId:1,id:'nowhere',name:'Nowhere',road:'Via Roma',kind:'civic',height:9});
  const file=path.join(directory,'missing-landmark.town.json');await writeFile(file,JSON.stringify(spec));
  const result=run(file,'--output',path.join(directory,'never.json'));
  assert.notEqual(result.status,0);assert.match(result.stderr,/Confirmed landmarks not found in the extract or outside the area: nowhere/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
