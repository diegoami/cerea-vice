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
 const {Mission}=createMission(context),mission=new Mission();assert.equal(mission.serveAtStop(data.spawn,true),true);
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
