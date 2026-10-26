import { test } from 'node:test';
import assert from 'node:assert/strict';
import cerea from '../public/maps/cerea.json';
import harbor from '../public/maps/harbor.json';
import { District,inRect,projectToSegment,roadWidth } from '../src/world/district';
import { SpatialGrid,rectBounds } from '../src/world/SpatialGrid';
import { createNavigation } from '../src/navigation/Navigation';
import { createCar } from '../src/driving/Car';
import { createMission } from '../src/mission/Mission';
import { createAtlas } from '../src/ui/Atlas';
import { createAtlasNotes } from '../src/navigation/AtlasNotes';
import { createSigns } from '../src/world/signs';
import { createStreetPlates } from '../src/world/streetPlates';
import { LocalFrame,translateDistrict } from '../src/world/LocalFrame';
import { CockpitCamera } from '../src/driving/CockpitCamera';
import { Vector3 } from 'three';
import type { Point } from '../src/world/schema';

const context=new District(cerea);
const points:Point[]=[...cerea.nodes,...cerea.parkingZones,...cerea.buildings.flatMap(b=>b.points??[]),...Array.from({length:800},(_,i)=>({x:cerea.bounds.minX+(i*37%1300)-100,z:cerea.bounds.minZ+(i*71%1300)-100})),{x:-100000,z:100000}];
const bruteNearest=(p:Point)=>context.roads.map(edge=>{const point=projectToSegment(p,context.nodeById(edge.a),context.nodeById(edge.b));return {edge,point,distance:Math.hypot(p.x-point.x,p.z-point.z)};}).sort((a,b)=>a.distance-b.distance)[0];
const brutePaved=(p:Point)=>context.roads.some(r=>{const q=projectToSegment(p,context.nodeById(r.a),context.nodeById(r.b));return Math.hypot(q.x-p.x,q.z-p.z)<=roadWidth(r)/2;})||context.parkingZones.some(b=>inRect(p,b));
function bruteRoute(start:string,target:string){
 const costs=new Map(context.nodes.map(n=>[n.id,Infinity])),previous=new Map<string,string>(),remaining=new Set(costs.keys());costs.set(start,0);
 while(remaining.size){const current=[...remaining].reduce((a,b)=>costs.get(a)!<costs.get(b)!?a:b);remaining.delete(current);if(!Number.isFinite(costs.get(current)!))break;if(current===target)break;
  for(const edge of context.roads){const next=edge.a===current?edge.b:edge.b===current&&!edge.oneWay?edge.a:undefined;if(!next)continue;const a=context.nodeById(current),b=context.nodeById(next),cost=costs.get(current)!+Math.hypot(a.x-b.x,a.z-b.z);if(cost<costs.get(next)!){costs.set(next,cost);previous.set(next,current);}}
 }
 const cost=costs.get(target)??Infinity;if(!Number.isFinite(cost))return {cost,path:[]};const path=[target];while(path[0]!==start)path.unshift(previous.get(path[0])!);return {cost,path};
}
test('Cerea indexed collision, paving and nearest road match exhaustive answers including boundaries and outside bounds',()=>{
 const grid=new SpatialGrid(cerea.buildings,rectBounds);
 for(const p of points){
  assert.equal(grid.at(p,1.05).some(b=>inRect(p,b,-1.05)),cerea.buildings.some(b=>inRect(p,b,-1.05)));
  assert.equal(context.isPaved(p),brutePaved(p));assert.deepEqual(context.nearestRoad(p),bruteNearest(p));
 }
});
test('heap routes preserve original Dijkstra costs AND paths for all taxi pairs and boundary nodes',()=>{
 const nav=createNavigation(context),ids=[...cerea.taxi.stops.map(s=>s.nodeId),...context.nodes.filter(n=>(context.adjacency.get(n.id)?.length??0)===1).map(n=>n.id)];
 for(const start of ids)for(const target of cerea.taxi.stops.map(s=>s.nodeId))assert.deepEqual(nav.shortestRoute(start,target),bruteRoute(start,target));
});
test('indexed signs and street plates match the same planners with exhaustive candidate sets',()=>{
 const exhaustive=new District(cerea);
 exhaustive.buildings.at=()=>exhaustive.district.buildings;
 exhaustive.buildings.query=()=>exhaustive.district.buildings;
 exhaustive.roadGrid.at=()=>exhaustive.roads;
 exhaustive.roadGrid.nearest=(_point,evaluate)=>exhaustive.roads.map(evaluate).sort((a,b)=>a.distance-b.distance)[0];
 assert.deepEqual(createSigns(context).planJunctionSigns(),createSigns(exhaustive).planJunctionSigns());
 assert.deepEqual(createStreetPlates(context).planStreetPlates(),createStreetPlates(exhaustive).planStreetPlates());
});
test('two district systems coexist without changing each other or their atlas knowledge',()=>{
 const c=new District(cerea),h=new District(harbor),{Car:C}=createCar(c),{Car:H}=createCar(h),carC=new C(),carH=new H();
 const {Mission:CM}=createMission(c),{Mission:HM}=createMission(h),mc=new CM(),mh=new HM();
 const atlasC=createAtlas(c),atlasH=createAtlas(h),{AtlasNotes:Notes}=createAtlasNotes(c),notes=new Notes();notes.confirm(carC,'snapshot');
 const before=createNavigation(c).directionHint(carC,carC.heading,mc.target);
 assert.ok(mc.taxiMode);assert.ok(!mh.taxiMode);assert.match(atlasC.atlasMarkup('index'),/Cordioli/);assert.match(atlasH.atlasMarkup('map'),/HARBOR ROAD/);
 carH.reset();new HM().reset();assert.equal(createNavigation(c).directionHint(carC,carC.heading,mc.target),before);assert.deepEqual(notes.marker,{x:c.spawn.x,z:c.spawn.z});assert.equal(notes.source,'confirmed');
});
test('local-frame Float32 projections preserve millimetre motion beyond 20 km and across rebases',()=>{
 const shifted=translateDistrict(context.district,25000,25000),frame=new LocalFrame(shifted.spawn),{Car}=createCar(new District(shifted)),car=new Car();
 const camera=new CockpitCamera(frame);frame.rebase(car);camera.update(1,car,0);
 const object={x:car.x+10.001,z:car.z-30.001};
 const project=()=>{const local=frame.toLocal(object),gpu=new Vector3(Math.fround(local.x),1,Math.fround(local.z));camera.camera.updateMatrixWorld();return gpu.project(camera.camera);};
 const before=project();object.x+=.001;const after=project();assert.ok(after.x>before.x,'1 mm movement remains visible to Float32 projection');

 // Force a rebase while holding physical camera/object positions fixed.
 const oldOrigin={...frame.origin};frame.rebase({x:car.x+700,z:car.z});assert.notDeepEqual(frame.origin,oldOrigin);camera.update(1,car,0);
 assert.ok(project().distanceTo(after)<.00001,'No projected jump at a rebase');
 assert.deepEqual(frame.toWorld(frame.toLocal(car)),{x:car.x,z:car.z});
 const localData=translateDistrict(shifted,-frame.anchor.x,-frame.anchor.z);assert.ok(Math.max(...localData.nodes.map(n=>Math.abs(n.x)))<4096);
});

test('two World instances from one bound factory own independent render origins',async()=>{
 // World construction needs painted canvases but no WebGL renderer. Stub painting only.
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>new Proxy({}, {get(target,key){if(key==='measureText')return (text:string)=>({width:text.length*12});if(key==='createLinearGradient')return ()=>({addColorStop(){}});return Reflect.get(target,key)??(()=>{});}})})}});
 try{
  const {createWorld}=await import('../src/world/World');const {World}=createWorld(new District(harbor));
  const first=new World(),second=new World(),origin={...second.frame.origin};
  assert.notEqual(first.frame,second.frame);first.updateFrame({x:1000,z:1000});
  assert.deepEqual(second.frame.origin,origin);assert.notDeepEqual(first.frame.origin,origin);
 }finally{if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}
});

test('spatial grid and polygon bounds handle collections above the argument-count limit',()=>{
 const items=Array.from({length:150000},(_,i)=>({x:i%1000,z:Math.floor(i/1000),width:1,depth:1}));
 const grid=new SpatialGrid(items,rectBounds);
 assert.deepEqual(grid.bounds,{minX:-.5,maxX:999.5,minZ:-.5,maxZ:149.5});
 assert.ok(grid.at(items[items.length-1]).includes(items[items.length-1]));
 const vertices=Array.from({length:150000},()=>({x:0,z:0}));vertices[0]={x:-20,z:-30};vertices[vertices.length-1]={x:40,z:50};
 assert.deepEqual(rectBounds({x:0,z:0,width:2,depth:2,points:vertices}),{minX:-20,maxX:40,minZ:-30,maxZ:50});
 assert.deepEqual(rectBounds({x:0,z:0,width:2,depth:2,holes:[vertices]}),{minX:-20,maxX:40,minZ:-30,maxZ:50});
 const empty=new SpatialGrid<never>([],()=>{throw new Error('not called');});
 assert.deepEqual(empty.query({minX:0,maxX:1,minZ:0,maxZ:1}),[]);
 assert.deepEqual(empty.bounds,{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
});

test('legacy Harbor rejects a nonzero render anchor instead of mixing coordinate frames',async()=>{
 const {createWorld}=await import('../src/world/World');
 assert.doesNotThrow(()=>createWorld(new District(harbor)));
 assert.throws(()=>createWorld(new District(translateDistrict(new District(harbor).district,25000,25000))),/Harbor requires its authored coordinates/);
});
