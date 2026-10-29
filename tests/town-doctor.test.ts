import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import registryData from '../public/maps/towns.json';
import {District} from '../src/world/district';
import {validateRegistry} from '../src/world/load';
import {createStreetPlates} from '../src/world/streetPlates';
import type {DistrictDefinition,MapBuilding} from '../src/world/schema';
import {checkBays,checkClearance,checkDrivable,checkNetwork,checkPlates,checkSize,checkStops,checkTown,measureSize,BUDGETS} from '../tools/town-doctor';

const registry=validateRegistry(registryData);
const cerea=():DistrictDefinition=>JSON.parse(readFileSync('public/maps/cerea.json','utf8'));
const square=(x:number,z:number,half:number,hole?:number):MapBuilding=>{
 const ring=(h:number)=>[{x:x-h,z:z-h},{x:x+h,z:z-h},{x:x+h,z:z+h},{x:x-h,z:z+h}];
 return {x,z,width:2*half,depth:2*half,height:8,color:0xb9a287,points:ring(half),...(hole?{holes:[ring(hole)]}:{}),osmId:-1};
};
const teatro=(data:DistrictDefinition)=>data.parkingZones.find(b=>b.id==='teatro')!;

for(const town of registry.towns)
 test(`${town.id} passes the town doctor`,{timeout:120000},()=>{
  for(const check of checkTown(town))assert.deepEqual(check.problems,[],`${town.id}: ${check.title}`);
 });

test('the doctor reports a road network in two pieces',()=>{
 const data=cerea(),{minX,minZ}=data.bounds;
 data.nodes.push({id:'cut-a',x:minX+5,z:minZ+5,label:'Via Isolata'},{id:'cut-b',x:minX+40,z:minZ+5,label:'Via Isolata'});
 data.roads.push({a:'cut-a',b:'cut-b',name:'Via Isolata',width:8});
 assert.equal(checkNetwork(new District(cerea())).problems.length,0);
 assert.match(checkNetwork(new District(data)).problems.join(),/2 node\(s\) cut off from the network \(Via Isolata\)/);
});

test('the doctor reports a stop that one-way streets let you leave but never reach',()=>{
 const data=cerea(),node=data.taxi!.stops.find(s=>s.id==='teatro')!.nodeId;
 for(const road of data.roads)if(road.a===node||road.b===node)Object.assign(road,{oneWay:true,a:node,b:road.a===node?road.b:road.a});
 const problems=checkStops(new District(data)).problems.join('\n');
 assert.match(problems,/→ teatro is unreachable/);assert.doesNotMatch(problems,/teatro →/);
 assert.deepEqual(checkNetwork(new District(data)).problems,[],'the network itself stays connected');
});

test('the doctor reports a covered bay, and a clear bay the car cannot get into (#73)',()=>{
 const covered=cerea(),bay=teatro(covered);covered.buildings.push(square(bay.x,bay.z,3));
 assert.match(checkBays(new District(covered)).problems.join(),/teatro: bay teatro is covered by building -1/);
 // A courtyard around the bay: the bay itself is clear, the way in is not.
 const enclosed=cerea(),inner=teatro(enclosed);enclosed.buildings.push(square(inner.x,inner.z,inner.width/2+6,inner.width/2+.5));
 assert.match(checkBays(new District(enclosed)).problems.join(),/teatro: the car cannot get from Via Cesare Battisti into bay teatro/);
});

test('the doctor reports a building on a road, both as clearance and as a blocked drive',()=>{
 const data=cerea(),road=data.roads.find(r=>r.name==='Via Gandhi')!,a=data.nodes.find(n=>n.id===road.a)!,b=data.nodes.find(n=>n.id===road.b)!;
 data.buildings.push(square((a.x+b.x)/2,(a.z+b.z)/2,1.5));
 const context=new District(data);
 assert.match(checkClearance(context).problems.join(),/building -1 covers [\d.]+ m² of Via Gandhi/);
 assert.match(checkDrivable(context).problems.join(),/Via Gandhi .* is blocked by building -1/);
});

test('the doctor reports a street plate standing on another street',()=>{
 const context=new District(cerea()),plan=createStreetPlates(context).planStreetPlates();
 const plate=plan.plates.find(p=>p.name==='Via Dante')!;plate.name='Via Gandhi';
 assert.match(checkPlates(context,plan).problems.join(),/a Via Gandhi plate near .* stands on Via Dante/);
});

test('the size report measures delivery, and budgets fail with the figure and the limit',()=>{
 const single=measureSize('public/maps/cerea.json',new District(cerea()));
 assert.equal(single.delivery,'single');assert.equal(single.streetNames,51);assert.ok(single.plateMiB>12&&single.plateMiB<13,'51 street names at a quarter MiB each');
 const tiled=measureSize('public/maps/cerea-outskirts/manifest.json',new District(JSON.parse(readFileSync('public/maps/cerea-outskirts/manifest.json','utf8'))));
 assert.equal(tiled.delivery,'tiled');assert.equal(tiled.tiles,55);assert.ok(tiled.residentPlateNames!>0&&tiled.residentPlateNames!<=tiled.streetNames);
 const over=checkSize({...single,bytes:BUDGETS.single.bytes+1,buildings:BUDGETS.single.buildings+1});
 assert.deepEqual(over.problems,[`the district file 1,600,001 bytes is over the budget of 1,600,000 bytes`,`buildings 3,501 is over the budget of 3,500`]);
 assert.deepEqual(checkSize(single).problems,[]);
});
