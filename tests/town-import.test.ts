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

test('every town spec in towns/ is valid and has its extract',async()=>{
 const {readdir}=await import('node:fs/promises');
 const specs=(await readdir('towns')).filter(f=>f.endsWith('.town.json'));
 assert.ok(specs.length>=6,'Cerea and the five lower-plain towns');
 for(const file of specs){const result=run(`towns/${file}`,'--check');assert.equal(result.status,0,`${file}: ${result.stderr}`);}
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
   ['unknown preset',spec=>{spec.preset='ultra';},/"preset" must be "sketch", "town" or "full"/],
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

test('presets change buildings, plates and props, never the streets, and each passes the town doctor',{timeout:240000},async()=>{
 const {checkTown,measureSize}=await import('../tools/town-doctor');
 const {District}=await import('../src/world/district');const {createScenery}=await import('../src/world/Scenery');const {createStreetPlates}=await import('../src/world/streetPlates');const {createSigns}=await import('../src/world/signs');
 const directory=await mkdtemp(path.join(tmpdir(),'cerea-presets-'));
 try{
  const town=JSON.parse(await readFile('public/maps/cerea.json','utf8')),built:Record<string,any>={};
  for(const preset of ['sketch','full']){
   const spec={...await cereaSpec(),preset},specFile=path.join(directory,`cerea-${preset}.town.json`);
   await writeFile(specFile,JSON.stringify(spec));
   const result=run(specFile,'--output',path.join(directory,`cerea-${preset}.json`));assert.equal(result.status,0,result.stderr);
   built[preset]=JSON.parse(await readFile(path.join(directory,`cerea-${preset}.json`),'utf8'));
   assert.equal(built[preset].preset,preset);
   assert.deepEqual([built[preset].nodes,built[preset].roads],[town.nodes,town.roads],`${preset}: every named street stays as in town`);
   assert.deepEqual(built[preset].landmarks.map((l:any)=>l.id),town.landmarks.map((l:any)=>l.id),`${preset}: every confirmed landmark stays`);
   for(const check of checkTown({id:`cerea-${preset}`,map:`cerea-${preset}.json`},directory))assert.deepEqual(check.problems,[],`${preset}: ${check.title}`);
  }
  assert.equal(town.preset,undefined,'town is the default and is not written');
  // Sketch: small outbuildings dropped, touching footprints merged into blocks, landmarks kept whole.
  const sketch=new District(built.sketch);
  assert.ok(built.sketch.buildings.length<town.buildings.length*.6,`sketch keeps ${built.sketch.buildings.length} of ${town.buildings.length} masses`);
  assert.ok(built.sketch.buildings.some((b:any)=>b.holes),'merged blocks keep their courtyards as holes');
  for(const landmark of built.sketch.landmarks)assert.ok(built.sketch.buildings.some((b:any)=>b.osmId===landmark.osmId),`${landmark.id} keeps its own mass`);
  const {isMajorRoad}=createSigns(sketch),plates=createStreetPlates(sketch).planStreetPlates().plates;
  assert.ok(plates.length>0&&plates.every(p=>sketch.roads.some(r=>r.name===p.name&&isMajorRoad(r))),'sketch plates name major roads only');
  assert.deepEqual(createScenery(sketch).planProps(),[],'no props in a sketch');
  assert.equal(measureSize(path.join(directory,'cerea-sketch.json'),sketch).plateNames,new Set(plates.map(p=>p.name)).size);
  // Full: the same masses as town here, with façades varying per building rather than per 65 m block.
  const full=createScenery(new District(built.full)),standard=createScenery(new District(town));
  assert.equal(built.full.buildings.length,town.buildings.length);
  const blocks=new Map<string,any[]>();for(const b of town.buildings){const key=`${Math.floor(b.x/65)},${Math.floor(b.z/65)}`;blocks.set(key,[...(blocks.get(key)??[]),b]);}
  const busiest=[...blocks.values()].sort((a,b)=>b.length-a.length)[0];
  const variants=(scenery:typeof full)=>new Set(busiest.map((b:any)=>scenery.facadeVariant(b.x,b.z))).size;
  assert.equal(variants(standard),1);
  assert.ok(variants(full)>variants(standard),'neighbouring buildings get different façades in full');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('the Verona spec rebuilds and tiles to the shipped map, with courtyards, squares and its tall tower',{timeout:240000},async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'verona-town-'));
 try{
  const tiles=path.join(directory,'verona');
  const result=run('towns/verona.town.json','--output',path.join(tiles,'manifest.json'));assert.equal(result.status,0,result.stderr);
  const {readdir}=await import('node:fs/promises');
  assert.ok((await readFile(path.join(tiles,'manifest.json'))).equals(await readFile('public/maps/verona/manifest.json')),'manifest');
  const files=(await readdir('public/maps/verona/tiles')).sort();assert.deepEqual((await readdir(path.join(tiles,'tiles'))).sort(),files);
  for(const file of files)assert.ok((await readFile(path.join(tiles,'tiles',file))).equals(await readFile(`public/maps/verona/tiles/${file}`)),file);
  const map=JSON.parse(await readFile('public/maps/verona/manifest.json','utf8')),source=JSON.parse(await readFile('data/sources/verona-osm.json','utf8'));
  // Palazzo Barbieri is a multipolygon relation: its mass keeps a courtyard.
  assert.ok(map.buildings.some((b:any)=>b.osmId===1868908&&b.holes?.length),'Palazzo Barbieri keeps its courtyard');
  assert.equal(map.landmarks.find((l:any)=>l.id==='lamberti').height,84,'a landmark keeps its real height');
  assert.ok(map.buildings.every((b:any)=>b.height<=30||map.landmarks.some((l:any)=>l.osmId===b.osmId)),'other buildings stay capped at 30 m');
  // Squares are paved ground, and a highway mapped as an area is not also a loop of road around its edge.
  for(const name of ['Piazza Bra','Piazza delle Erbe','Piazza dei Signori'])assert.ok(map.pavedAreas.some((a:any)=>a.name===name),name);
  const areaWays=new Set(source.elements.filter((e:any)=>e.tags?.highway&&e.tags?.area==='yes').map((e:any)=>e.id));
  const unbuilt=new Set(source.elements.filter((e:any)=>['construction','proposed'].includes(e.tags?.highway)).map((e:any)=>e.id));
  assert.ok(areaWays.size>10&&unbuilt.size>0);
  assert.ok(map.roads.every((r:any)=>!areaWays.has(r.osmId)&&!unbuilt.has(r.osmId)),'no road from a square outline or an unbuilt street');
  // The gates are mapped points: the stop sits on the nearest remaining building, not the removed gate.
  for(const [id,gate] of [['borsari',138812787],['leoni',694354426]] as const)assert.notEqual(map.landmarks.find((l:any)=>l.id===id).osmId,gate);
 }finally{await rm(directory,{recursive:true,force:true});}
});
