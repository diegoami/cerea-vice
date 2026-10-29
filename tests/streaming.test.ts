import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {District,inRect,roadWidth,projectToSegment} from '../src/world/district';
import {RouteGraph} from '../src/navigation/RouteGraph';
import {LayeredRouteGraph} from '../src/navigation/LayeredRouteGraph';
import {createMission} from '../src/mission/Mission';
import {createNavigation} from '../src/navigation/Navigation';
import {TileStream} from '../src/world/streaming/TileStream';
import {streamingColliders} from '../src/world/streaming/colliders';
import type {TilePayload,TileManifest} from '../src/world/streaming/schema';
import type {DistrictDefinition} from '../src/world/schema';
const data=JSON.parse(fs.readFileSync('public/maps/cerea-outskirts/manifest.json','utf8')) as DistrictDefinition;
const original=JSON.parse(fs.readFileSync('public/maps/cerea.json','utf8')) as DistrictDefinition;
const context=new District(data);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const provenance={source:'Test fixture',licence:'Test fixture',osmTimestamp:'fixture',synthetic:'fixture'};
const payload=(id:string)=>({version:1,id,provenance,buildings:[],roads:[],features:[],landmarks:[],bays:[],plates:[],boards:[],props:[]} as TilePayload);
const manifest={version:1,tileSize:250,fogDistance:50,loadRadius:151,retainRadius:201,regions:[],portals:[],provenance,tiles:[{id:'0_0',file:'tiles/0_0.json',bytes:10,bounds:{minX:0,maxX:250,minZ:0,maxZ:250}},{id:'20_0',file:'tiles/20_0.json',bytes:10,bounds:{minX:5000,maxX:5250,minZ:0,maxZ:250}}]} as TileManifest;

test('tile lifecycle loads local cells, evicts distant resources, rejects stale completion and disposes on close',async()=>{
 const resolves=new Map<string,(p:TilePayload)=>void>(),disposed:string[]=[],built:string[]=[];
 const stream=new TileStream(manifest,ref=>new Promise(resolve=>resolves.set(ref.id,resolve)),p=>{built.push(p.id);return {dispose(){disposed.push(p.id);}};},2);
 stream.update({x:100,z:100});assert.equal(stream.readyAt({x:100,z:100}),false);assert.equal(stream.readyAt({x:9000,z:9000}),false);
 stream.update({x:5100,z:100});resolves.get('0_0')!(payload('0_0'));resolves.get('20_0')!(payload('20_0'));await flush();
 assert.deepEqual(built,['20_0'],'Stale payload is never installed or built');assert.equal(stream.readyAt({x:5100,z:100}),true);
 stream.update({x:100,z:100});assert.deepEqual(disposed,['20_0']);resolves.get('0_0')!(payload('0_0'));await flush();
 assert.equal(stream.resident.size,1);stream.dispose();assert.equal(stream.resident.size,0);assert.deepEqual(disposed,['20_0','0_0']);
});
test('tile failures stay unready and late completion after close creates no resources',async()=>{
 let resolve!:(p:TilePayload)=>void;let builds=0;
 const stream=new TileStream(manifest,()=>new Promise(r=>resolve=r),()=>{builds++;return {dispose(){}};});
 stream.update({x:100,z:100});stream.dispose();resolve(payload('0_0'));await flush();assert.equal(builds,0);
 const failed=new TileStream(manifest,async()=>{throw new Error('Missing local file');},()=>({dispose(){}}));failed.update({x:100,z:100});await flush();assert.equal(failed.readyAt({x:100,z:100}),false);assert.equal(failed.stats.failures,1);failed.dispose();
});
test('manifest preserves the real city, marks the added link fictional, and owns each visual asset exactly once',()=>{
 assert.deepEqual(data.nodes.slice(0,original.nodes.length),original.nodes);
 assert.deepEqual(data.buildings.slice(0,original.buildings.length),original.buildings);
 assert.deepEqual(data.roads.slice(0,original.roads.length).map(({region,...r})=>r),original.roads);
 assert.match(data.streaming!.provenance.synthetic,/fictional/i);assert.match(data.attribution,/OpenStreetMap/);
 const roads:number[]=[],buildings=[];let plates=0;
 for(const ref of data.streaming!.tiles){assert.equal(ref.bounds.maxX-ref.bounds.minX,250);assert.equal(ref.bounds.maxZ-ref.bounds.minZ,250);
  const file=fs.readFileSync('public/maps/cerea-outskirts/'+ref.file);assert.equal(file.byteLength,ref.bytes);const tile=JSON.parse(file.toString()) as TilePayload;
  assert.equal(tile.id,ref.id);assert.deepEqual(tile.provenance,data.streaming!.provenance);roads.push(...tile.roads);buildings.push(...tile.buildings);plates+=tile.plates.length;
 }
 assert.equal(roads.length,data.roads.length);assert.equal(new Set(roads).size,roads.length);assert.equal(buildings.length,data.buildings.length);assert.ok(plates>100);
});
test('layered routes preserve flat-graph path/cost for every city and test-hamlet taxi pair',()=>{
 const layered=context.graph,flat=new RouteGraph(data.nodes,data.roads);assert.ok(layered instanceof LayeredRouteGraph);
 for(const a of data.taxi!.stops)for(const b of data.taxi!.stops)assert.deepEqual(layered.search(a.nodeId,b.nodeId),flat.search(a.nodeId,b.nodeId));
 assert.ok(layered.detailedGraphsResident<=2);
 const city=data.taxi!.stops.find(s=>s.id==='municipio')!,next=layered.nextLeg(city.nodeId,'test-square','cerea');
 assert.equal(next.path.at(-1),'1399692873');assert.match(next.onward,/Test Hamlet/);assert.ok(!next.path.includes('test-square'));
 const {Mission}=createMission(context),mission=new Mission({authored:true});mission.requestFares(data.spawn);mission.acceptFare(mission.fareBoard[0].id);assert.equal(mission.serveAtStop(data.spawn,true),true);
 assert.equal(mission.routeDistance,flat.search(city.nodeId,'test-square').cost);assert.ok(mission.baseFareCents>400);
 const hint=createNavigation(context).directionHint(data.spawn,data.spawn.heading,mission.target);assert.doesNotMatch(hint,/NaN|undefined|25000/);
});
test('prototype generated buildings avoid roads/bays and resident collision data includes all footprints',()=>{
 for(const b of data.buildings.slice(original.buildings.length))for(const p of b.points??[]){
  assert.ok(!data.roads.some(r=>{const q=projectToSegment(p,context.nodeById(r.a),context.nodeById(r.b));return Math.hypot(p.x-q.x,p.z-q.z)<=roadWidth(r)/2+1.25;}));
  assert.ok(!data.parkingZones.some(z=>inRect(p,z,-.5)));
 }
 const colliders=streamingColliders(context);assert.deepEqual(colliders.slice(-data.buildings.length),data.buildings);
 assert.ok(colliders.length>data.buildings.length,'Water colliders remain resident too');
});
test('prototype rejects remote/path traversal tile references and invalid coarse topology',()=>{
 for(const file of ['https://example.test/map.json','../outside.json','tiles/../../escape.json']){
  const bad=structuredClone(data);bad.streaming!.tiles[0].file=file;assert.throws(()=>new District(bad),/local tile/);
 }
 const bad=structuredClone(data);bad.streaming!.portals.pop();assert.throws(()=>new District(bad),/tree/);
});

test('radial tile fog clones shared materials per world and never disposes shared textures',async()=>{
 const {MeshBasicMaterial,Texture}=await import('three');const {TileMaterials}=await import('../src/world/streaming/TileMaterials');
 const map=new Texture(),source=new MeshBasicMaterial({map});source.userData.shared=true;
 const original=source.onBeforeCompile;let disposed=0;map.addEventListener('dispose',()=>disposed++);
 const first=new TileMaterials(),second=new TileMaterials(),a=first.use(source),b=second.use(source);
 assert.notEqual(a,source);assert.notEqual(a,b);assert.equal(first.use(source),a);assert.equal(source.onBeforeCompile,original);
 const shader={vertexShader:'#include <fog_vertex>',fragmentShader:'#include <fog_fragment>'};
 a.onBeforeCompile(shader as Parameters<typeof a.onBeforeCompile>[0],{} as Parameters<typeof a.onBeforeCompile>[1]);
 assert.match(shader.vertexShader,/vTileFogPosition=mvPosition.xyz/);assert.match(shader.fragmentShader,/length\(vTileFogPosition\)/);
 first.dispose();second.dispose();assert.equal(disposed,0);source.dispose();map.dispose();
});

test('directions compare local endpoint costs even when one endpoint is already a coarse portal',()=>{
 const graph=context.graph;assert.ok(graph instanceof LayeredRouteGraph);
 const target=data.taxi!.stops.find(s=>s.id==='municipio')!,portal='test-link-9';
 const fromPortal=graph.nextLeg(portal,target.nodeId,'test-hamlet'),fromSquare=graph.nextLeg('test-square',target.nodeId,'test-hamlet');
 assert.equal(fromPortal.cost,0,'Skipping a zero-length first leg must not replace its comparison cost with the long country leg');
 assert.ok(fromSquare.cost>0);assert.equal(fromPortal.path[0],portal);
 const {Mission}=createMission(context),mission=new Mission({authored:true});
 const take=()=>{mission.requestFares(context.spawn);mission.acceptFare(mission.fareBoard[0].id);};
 take();mission.serveAtStop(mission.target!.bay,true);mission.update(6,mission.target!.bay,true);mission.serveAtStop(mission.target!.bay,true);take();
 const bay=data.parkingZones.find(b=>b.id==='test-hamlet')!;assert.ok(mission.serveAtStop(bay,true));
 assert.match(createNavigation(context).directionHint(bay,0,mission.target),/Turn around safely.*south.*Cerea Centro/);
});

test('transient tile errors retry after backoff, recover readiness and clear active error state',async()=>{
 let now=0,attempts=0;
 const stream=new TileStream(manifest,async ref=>{attempts++;if(attempts===1)throw new Error('Transient read');return payload(ref.id);},()=>({dispose(){}}),2,()=>now);
 const point={x:100,z:100};stream.update(point);await flush();assert.equal(attempts,1);assert.equal(stream.recovering,true);assert.equal(stream.readyAt(point),false);
 now=499;stream.update(point);await flush();assert.equal(attempts,1,'No tight retry loop');
 now=500;stream.update(point);await flush();assert.equal(attempts,2);assert.equal(stream.readyAt(point),true);assert.equal(stream.recovering,false);assert.equal(stream.stats.failures,1,'Historical failure count remains diagnostic only');stream.dispose();
});
test('persistent errors use capped backoff and stop retrying outside the wanted set or after disposal',async()=>{
 let now=0,attempts=0;
 const stream=new TileStream(manifest,async()=>{attempts++;throw new Error('Still unavailable');},()=>({dispose(){}}),2,()=>now),point={x:100,z:100};
 stream.update(point);await flush();
 for(const delay of [500,1000,2000,4000,8000,8000]){const before=attempts;now+=delay-1;stream.update(point);await flush();assert.equal(attempts,before);now++;stream.update(point);await flush();assert.equal(attempts,before+1);}
 stream.update({x:9000,z:9000});assert.equal(stream.recovering,false);now+=9000;stream.update({x:9000,z:9000});await flush();const before=attempts;stream.dispose();stream.update(point);await flush();assert.equal(attempts,before);
});
test('tile ids/bounds are canonical and the prototype grid has no overlaps or missing cells',()=>{
 const shifted=structuredClone(data);shifted.streaming!.tiles[0].bounds.minX+=250;shifted.streaming!.tiles[0].bounds.maxX+=250;assert.throws(()=>new District(shifted),/canonical grid/);
 const overlap=structuredClone(data);overlap.streaming!.tiles[1].bounds={...overlap.streaming!.tiles[0].bounds};assert.throws(()=>new District(overlap),/canonical grid/);
 const alias=structuredClone(data),tile=alias.streaming!.tiles.find(t=>t.id==='0_0')!;tile.id='-0_0';tile.file='tiles/-0_0.json';assert.throws(()=>new District(alias),/canonical grid/);
 const missing=structuredClone(data);missing.streaming!.tiles.pop();assert.throws(()=>new District(missing),/coverage/);
});

test('street-name textures are shared by their plates and freed when the last tile using them unloads (#51)',async()=>{
 const {Group,MeshBasicMaterial}=await import('three');const {streetNamePlate,releaseStreetNamePlate,streetNameTextures}=await import('../src/world/builders');const {TileMaterials}=await import('../src/world/streaming/TileMaterials');
 const context2d=new Proxy({},{get:()=>()=>{},set:()=>true});
 (globalThis as {document?:unknown}).document={createElement:()=>({width:0,height:0,getContext:()=>context2d})};
 try{
  const plan=(name:string)=>({name,position:{x:0,z:0},angle:0,width:2,height:3,mount:'post' as const});
  const before=streetNameTextures(),first=new Group(),second=new Group();
  streetNamePlate(first,plan('Via Prova'));streetNamePlate(second,plan('Via Prova'));streetNamePlate(second,plan('Via Altra'));
  assert.equal(streetNameTextures(),before+2,'one texture per street name');
  const face=(first.children[0].children[0] as import('three').Mesh).material as InstanceType<typeof MeshBasicMaterial>;
  let freed=0;face.map!.addEventListener('dispose',()=>freed++);
  const materials=new TileMaterials(),copy=materials.use(face);
  assert.equal(releaseStreetNamePlate('Via Prova'),undefined,'another plate still shows Via Prova');assert.equal(freed,0);
  assert.equal(releaseStreetNamePlate('Via Prova'),face);assert.equal(freed,1);
  let copyFreed=0;copy.addEventListener('dispose',()=>copyFreed++);materials.release(face);assert.equal(copyFreed,1);
  assert.equal(releaseStreetNamePlate('Via Altra')!==undefined,true);assert.equal(streetNameTextures(),before);
  assert.equal(releaseStreetNamePlate('Via Prova'),undefined,'releasing an unknown name is harmless');
 }finally{delete (globalThis as {document?:unknown}).document;}
});
