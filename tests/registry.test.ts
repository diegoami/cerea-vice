import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import registryData from '../public/maps/towns.json';
import {District} from '../src/world/district';
import {validateRegistry,requestedDistrict,selectDistrict,type TownRegistry} from '../src/world/load';

const registry=validateRegistry(registryData);
const load=(map:string)=>JSON.parse(readFileSync(`public/maps/${map}`,'utf8'));

test('the district list rejects malformed entries, naming the problem',()=>{
 const variant=(change:(data:any)=>void)=>{const data=structuredClone(registryData) as any;change(data);return ()=>validateRegistry(data);};
 assert.throws(variant(d=>{d.towns.push({...d.towns[0]});}),/"cerea" is listed twice/);
 assert.throws(variant(d=>{d.default='atlantis-centro';}),/default district is not listed/);
 assert.throws(variant(d=>{d.towns[0].map='../../secret.json';}),/needs a map file inside maps\//);
 assert.throws(variant(d=>{d.towns[0].map='/etc/cerea.json';}),/needs a map file inside maps\//);
 assert.throws(variant(d=>{delete d.towns[1].taxi;}),/"harbor" needs taxi and provenance flags/);
 assert.throws(variant(d=>{d.towns[0].frame='global';}),/unknown frame/);
 assert.throws(variant(d=>{d.towns[0].id='Cerea Centro';}),/invalid id/);
 assert.throws(variant(d=>{d.towns=[];}),/no districts are listed/);
 assert.throws(variant(d=>{d.version=2;}),/version must be 1/);
 // Displayed text cannot carry markup; folders loaded at runtime (#33) will be untrusted.
 assert.throws(variant(d=>{d.towns[0].name='<img src=x onerror=alert(1)>';}),/"cerea" needs a plain-text name and attribution/);
 assert.throws(variant(d=>{d.towns[1].attribution='<b>x</b>';}),/"harbor" needs a plain-text name and attribution/);
});

test('every listed district loads and matches its entry, map file and spec',()=>{
 const ids=new Set(registry.towns.map(t=>t.id));
 for(const town of registry.towns){
  assert.ok(existsSync(`public/maps/${town.map}`),`${town.id}: maps/${town.map} exists`);
  const data=load(town.map),context=new District(data);
  assert.equal(context.district.id,town.id,`${town.id}: the map's id matches`);
  assert.equal(data.attribution,town.attribution,`${town.id}: attribution matches`);
  assert.equal(data.dataVersion??1,town.dataVersion,`${town.id}: data version matches`);
  assert.equal(Boolean(data.taxi),town.taxi,`${town.id}: taxi flag matches`);
  assert.equal(Boolean(data.provenance),town.provenance,`${town.id}: provenance flag matches`);
  assert.equal(town.frame==='authored',!town.provenance,`${town.id}: only authored districts lack provenance`);
  if(town.derivedFrom)assert.ok(ids.has(town.derivedFrom),`${town.id}: derived from a listed district`);
  if(town.spec){
   const spec=JSON.parse(readFileSync(town.spec,'utf8'));
   assert.deepEqual([spec.id,spec.name,spec.dataVersion,spec.attribution,spec.output],[town.id,town.name,town.dataVersion,town.attribution,`public/maps/${town.map}`],`${town.id}: the registry entry is the spec's`);
  }
  if(data.streaming&&town.id!=='cerea-outskirts')assert.ok(data.subtitle,`${town.id}: a streamed district says what it is, not the outskirts prototype's subtitle`);
  for(const view of town.views??[])if(view.bay)assert.ok(context.parkingZones.some(b=>b.id===view.bay),`${town.id}: view ${view.name} names a bay`);
 }
});

// Stops, bays, drivability and the rest are checked for every listed district in town-doctor.test.ts.

test('an unlisted or removed district falls back to the default without deleting anything',()=>{
 const storage=new Map<string,string>();let removed=0,reloads=0;
 const location={hash:'',href:'cerea://game/'};
 Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:()=>removed++},configurable:true});
 Object.defineProperty(globalThis,'window',{value:{location:{...location,get hash(){return location.hash;},reload:()=>reloads++}},configurable:true});
 Object.defineProperty(globalThis,'history',{value:{replaceState:(_s:unknown,_t:string,url:string)=>{location.hash=url;}},configurable:true});
 const list:TownRegistry={...registry};
 assert.equal(requestedDistrict(list),'cerea','Nothing chosen: the default');
 location.hash='#district=harbor';assert.equal(requestedDistrict(list),'harbor','The URL choice wins');
 location.hash='#district=atlantis-centro';storage.set('cerea-district','atlantis');
 assert.equal(requestedDistrict(list),'cerea','Unlisted choices fall back to the default');
 assert.equal(storage.get('cerea-district'),'atlantis','The remembered choice is not overwritten');assert.equal(removed,0);
 storage.set('cerea-district','cerea-outskirts');location.hash='';assert.equal(requestedDistrict(list),'cerea-outskirts','A listed remembered choice is used');
 selectDistrict(list.towns,'atlantis');assert.equal(reloads,0,'An unlisted district is never selected');
 selectDistrict(list.towns,'harbor');assert.equal(reloads,1);assert.equal(storage.get('cerea-district'),'harbor');assert.equal(location.hash,'#district=harbor');
});

test('the region manifest is reproducible from its specs and keeps its towns at real scale',{timeout:400000},async()=>{
 const {spawnSync}=await import('node:child_process');const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const path=await import('node:path');
 const directory=await mkdtemp(path.join(tmpdir(),'cerea-region-'));
 try{
  const output=path.join(directory,'region.json');
  const result=spawnSync('python3',['tools/build-region.py','regions/lower-verona.region.json','--output',output],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const built=JSON.parse(readFileSync(output,'utf8')),shipped=load('lower-verona/manifest.json');
  // Every field of the fresh build is in the shipped manifest unchanged, except the tiler's additions:
  // its streaming block, and features split into pieces of at most 100 m for tile ownership.
  assert.deepEqual(Object.keys(shipped).filter(k=>k!=='streaming').sort(),Object.keys(built).sort());
  for(const key of Object.keys(built))if(key!=='features')assert.deepEqual(shipped[key],built[key],`${key} matches a fresh build`);
  const split=built.features.flatMap((f:any)=>f.points.slice(1).flatMap((b:any,i:number)=>{const a=f.points[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/100));return Array.from({length:n},(_,j)=>({...f,points:[{x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n},{x:a.x+(b.x-a.x)*(j+1)/n,z:a.z+(b.z-a.z)*(j+1)/n}]}));}));
  assert.deepEqual(shipped.features,split,'features are the fresh build split as the tiler does');
  // Each town moves rigidly: its own street geometry is its town map shifted by one offset.
  const cerea=load('cerea.json'),placed=built.provenance.compression.towns.cerea.placed;
  const first=cerea.nodes[0],shifted=built.nodes.find((n:any)=>n.id===first.id);
  // The provenance records offsets to 0.1 m.
  assert.ok(Math.abs(shifted.x-(first.x+placed[0]))<0.06&&Math.abs(shifted.z-(first.z+placed[1]))<0.06,'Cerea keeps its real streets');
  const second=cerea.nodes[200],moved=built.nodes.find((n:any)=>n.id===second.id);
  assert.ok(Math.abs((moved.x-shifted.x)-(second.x-first.x))<0.02&&Math.abs((moved.z-shifted.z)-(second.z-first.z))<0.02,'Distances inside a town are unchanged');
  assert.equal(built.provenance.compression.k,0.6);
  // Villages on the corridors are placed rigidly too, and carry no stops of their own.
  const region=JSON.parse(readFileSync('regions/lower-verona.region.json','utf8')),villages=region.villages.map((v:any)=>JSON.parse(readFileSync(v.spec,'utf8')).id);
  assert.deepEqual(Object.keys(built.provenance.compression.villages).sort(),[...villages].sort());
  assert.ok(villages.length>=5&&built.taxi.stops.every((s:any)=>!villages.includes(s.id.split(':')[0])),'Villages have no stops');
  for(const id of villages){const name=JSON.parse(readFileSync(`towns/${id}.town.json`,'utf8')).name;assert.ok(built.areas.some((a:any)=>a.name===name),`${name} is labelled`);}
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('corridor roads inside a town zone move rigidly with the town',()=>{
 const region=JSON.parse(readFileSync('regions/lower-verona.region.json','utf8')),shipped=load('lower-verona/manifest.json');
 const roads=JSON.parse(readFileSync(region.corridors.extract,'utf8')),geo=new Map<string,{lat:number;lon:number}>();
 for(const w of roads.elements)if(w.type==='way')w.nodes.forEach((id:number,i:number)=>geo.set(String(id),w.geometry[i]));
 const cerea=load('cerea.json'),spec=JSON.parse(readFileSync('towns/cerea.town.json','utf8')),{lat,lon}=spec.area.origin;
 const own=new Set(cerea.nodes.map((n:any)=>n.id)),placed=shipped.provenance.compression.towns.cerea.placed,b=cerea.bounds,m=region.zoneMargin;
 const local=(g:{lat:number;lon:number})=>({x:Math.round((g.lon-lon)*111320*Math.cos(lat*Math.PI/180)*100)/100,z:Math.round(-(g.lat-lat)*111320*100)/100});
 let checked=0;
 for(const n of shipped.nodes){
  if(own.has(n.id)||!geo.has(n.id))continue;const p=local(geo.get(n.id)!);
  if(p.x<b.minX-m||p.x>b.maxX+m||p.z<b.minZ-m||p.z>b.maxZ+m)continue;
  checked++;assert.ok(Math.abs(n.x-(p.x+placed[0]))<0.1&&Math.abs(n.z-(p.z+placed[1]))<0.1,`corridor node ${n.id} in Cerea's zone keeps its real place in town`);
 }
 assert.ok(checked>0,'Cerea has corridor nodes inside its zone');
});

test('the region builder rejects settings it would ignore, and rebuilds a town only when its inputs change',{timeout:180000},async()=>{
 const {spawnSync}=await import('node:child_process');const {mkdtemp,rm,writeFile}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const path=await import('node:path');
 const run=(file:string,...extra:string[])=>spawnSync('python3',['tools/build-region.py',file,...extra],{encoding:'utf8'});
 const directory=await mkdtemp(path.join(tmpdir(),'cerea-region-spec-'));
 try{
  const region=JSON.parse(readFileSync('regions/lower-verona.region.json','utf8'));
  const withZone=structuredClone(region);withZone.towns[0].zone=550;await writeFile(path.join(directory,'zone.json'),JSON.stringify(withZone));
  const zone=run(path.join(directory,'zone.json'));assert.notEqual(zone.status,0);assert.match(zone.stderr,/A town entry takes only "spec"/);
  const unknown={...region,bands:400};await writeFile(path.join(directory,'unknown.json'),JSON.stringify(unknown));
  const bad=run(path.join(directory,'unknown.json'));assert.notEqual(bad.status,0);assert.match(bad.stderr,/Unknown region settings: bands/);
  // A one-town region in a temporary place: built, then reused, then rebuilt after a spec edit.
  const town=JSON.parse(readFileSync('towns/sanguinetto.town.json','utf8'));town.id='sanguinetto-inputs-test';town.output=path.join(directory,'town.json');
  const townFile=path.join(directory,'town.town.json');await writeFile(townFile,JSON.stringify(town));
  const one={...region,towns:[{spec:townFile}]};const oneFile=path.join(directory,'one.json');await writeFile(oneFile,JSON.stringify(one));
  let result=run(oneFile,'--towns-only');assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/sanguinetto-inputs-test: building \(no output yet\)/);
  result=run(oneFile,'--towns-only');assert.match(result.stdout,/sanguinetto-inputs-test: up to date/);
  town.content.mission.name='Changed';await writeFile(townFile,JSON.stringify(town));
  result=run(oneFile,'--towns-only');assert.match(result.stdout,/sanguinetto-inputs-test: building \(inputs changed\)/);
 }finally{await rm(directory,{recursive:true,force:true});await rm('build/towns/sanguinetto-inputs-test.inputs.sha256',{force:true});}
});

test('every listed district labels its places with their own names; only Cerea keeps its short forms (#80)',async()=>{
 const {createAtlas}=await import('../src/ui/Atlas');const {atlasLabel,directionsName}=await import('../src/world/placeNames');
 for(const town of registry.towns){
  const context=new District(load(town.map)),html=createAtlas(context).atlasMarkup('map');
  const shown=[...html.matchAll(/class="atlas-place-label"[^>]*>([^<]*)<\/text>/g)].map(m=>m[1]);
  const xml=(s:string)=>s.replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
  assert.deepEqual(shown,context.landmarks.map(place=>xml(atlasLabel(place).toUpperCase())),`${town.id}: atlas labels`);
  // Distinct places never share a label.
  const byLabel=new Map<string,Set<string>>();for(const place of context.landmarks){const label=atlasLabel(place);byLabel.set(label,(byLabel.get(label)??new Set()).add(place.name));}
  for(const [label,names] of byLabel)assert.equal(names.size,1,`${town.id}: ${label} names ${[...names].join(', ')}`);
  // The same for directions, which also write the direction boards in streamed tiles.
  const byDirection=new Map<string,Set<string>>();for(const place of context.landmarks){const name=directionsName(place);byDirection.set(name,(byDirection.get(name)??new Set()).add(place.name));}
  for(const [name,names] of byDirection)assert.equal(names.size,1,`${town.id}: directions call ${[...names].join(', ')} "${name}"`);
 }
 const verona=new District(load('verona/manifest.json')),churches=verona.landmarks.filter(p=>p.kind==='church');
 assert.deepEqual(churches.map(atlasLabel),churches.map(p=>p.name));assert.ok(churches.length>=4);
 assert.ok(churches.every(p=>directionsName(p)===p.name),'directions name Verona\'s churches too');
 const cerea=new District(load('cerea.json')),church=cerea.landmarks.find(p=>p.kind==='church')!;
 assert.deepEqual([atlasLabel(church),directionsName(church)],['San Zeno','San Zeno'],'Cerea keeps its familiar short form');
});
