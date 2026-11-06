import {test} from 'node:test';
import assert from 'node:assert/strict';
import harbor from '../public/maps/harbor.json';
import cerea from '../public/maps/cerea.json';
import {District,inRect,type Rect} from '../src/world/district';
import {createCar,type CollisionSource} from '../src/driving/Car';
import {createMission} from '../src/mission/Mission';
import {createParking} from '../src/navigation/Parking';
import {DemoDriver} from '../src/game/DemoDriver';
import {SpatialGrid,rectBounds} from '../src/world/SpatialGrid';
import {carFootprint} from '../src/world/Traffic';
import type {DistrictDefinition} from '../src/world/schema';

function map(junction=false):DistrictDefinition{
 const nodes=junction?[{id:'a',x:0,z:0,label:'South'},{id:'b',x:0,z:-80,label:'Middle'},{id:'j',x:0,z:-160,label:'Crossing'},{id:'e',x:80,z:-160,label:'East'},{id:'w',x:-80,z:-160,label:'West'}]:[{id:'a',x:0,z:0,label:'South west'},{id:'b',x:0,z:-160,label:'North west'},{id:'c',x:80,z:-160,label:'North east'},{id:'d',x:80,z:0,label:'South east'}];
 const links=junction?[['a','b'],['b','j'],['j','e'],['j','w']]:[['a','b'],['b','c'],['c','d'],['d','a']];
 return {...structuredClone(harbor),version:1,id:'parking-recovery',bounds:{minX:-100,maxX:120,minZ:-210,maxZ:60},nodes,roads:links.map(([a,b],i)=>({a,b,name:`Street ${i}`,roadClass:'primary'})),spawn:{...harbor.spawn,x:1.8,z:-25,heading:0},mission:{...harbor.mission,nodeId:'a',bayId:'hotel',duration:500},parkingZones:[{id:'hotel',name:'Destination',x:0,z:0,width:6,depth:6}],landmarks:[],buildings:[],features:[],areas:[{name:'Town',x:0,z:-80,width:200,depth:240}]};
}
function drive(data:unknown,seconds=180,extra:Rect[]=[]){
 const context=new District(data),car=new(createCar(context).Car)(),mission=new(createMission(context).Mission)(),parking=new(createParking(context).Parking)(),bot=new DemoDriver(context),solid=new SpatialGrid([...context.district.buildings,...extra],rectBounds);let reverse=0,firstReverseZ:number|undefined,minZ=car.z;
 for(let i=0;i<seconds*60&&!mission.finished;i++){const action=bot.update(1/60,car,parking,mission,solid);car.update(1/60,action,solid);parking.update(1/60,car,car.speed);mission.update(1/60,car,parking.stopped);minZ=Math.min(minZ,car.z);if(car.gear==='R'){reverse+=1/60;firstReverseZ??=car.z;}}
 return {car,mission,bot,reverse,firstReverseZ,minZ};
}
test('a destination behind the taxi uses the forward street loop instead of an immediate U-turn',()=>{
 const result=drive(map());assert.ok(result.mission.finished);assert.ok(result.minZ< -140);assert.ok(result.bot.distanceDriven>250);assert.equal(result.reverse,0);assert.ok(result.bot.forwardDetours>0);assert.equal(result.car.collisions,0);
});
test('a narrow road with no loop is followed to the next crossing before turning back',()=>{
 const data=map(true);data.buildings=[{x:-8,z:-70,width:7,depth:120,height:8,color:0x997766},{x:8,z:-70,width:7,depth:120,height:8,color:0x997766}];
 const result=drive(data);assert.ok(result.mission.finished);assert.ok(result.minZ< -140);assert.ok(result.firstReverseZ===undefined||result.firstReverseZ< -130,'Reversing is deferred until the crossing');assert.ok(result.bot.forwardDetours>0);assert.equal(result.car.collisions,0);
});
test('a blocked narrow street is backed out of to take another road, without repeating the same manoeuvre',()=>{
 const data=map();data.mission.nodeId='c';Object.assign(data.parkingZones[0],{x:80,z:-160});data.buildings=[{x:-8,z:-75,width:7,depth:140,height:8,color:0x997766},{x:8,z:-75,width:7,depth:140,height:8,color:0x997766}];
 const result=drive(data,240,[{x:0,z:-50,width:10,depth:4}]);
 assert.ok(result.mission.finished);assert.ok(result.bot.backouts>0);assert.ok(result.bot.distanceDriven>250);assert.equal(result.car.collisions,0);
});
test('left-side traffic takes a forward loop and can back out of a blocked narrow street',()=>{
 const loop=map();loop.drivingSide='left';loop.spawn.x=-1.8;const first=drive(loop);assert.ok(first.mission.finished);assert.equal(first.reverse,0);assert.ok(first.bot.forwardDetours>0);
 const data=map();data.drivingSide='left';data.spawn.x=-1.8;data.mission.nodeId='c';Object.assign(data.parkingZones[0],{x:80,z:-160});data.buildings=[{x:-8,z:-75,width:7,depth:140,height:8,color:0x997766},{x:8,z:-75,width:7,depth:140,height:8,color:0x997766}];
 const second=drive(data,240,[{x:0,z:-50,width:10,depth:4}]);assert.ok(second.mission.finished,JSON.stringify({x:second.car.x,z:second.car.z,h:second.car.heading,gear:second.car.gear,activity:second.bot.activity,backouts:second.bot.backouts,route:(second.bot as any).route.slice(0,3),backout:(second.bot as any).backout}));assert.ok(second.bot.backouts>0);assert.equal(second.car.collisions,0);
});
test('an occupied graph waypoint is bypassed and the taxi reconnects farther along the street',()=>{
 const data=map();data.nodes=[{id:'a',x:0,z:0,label:'Start'},{id:'b',x:0,z:-55,label:'Occupied junction'},{id:'c',x:0,z:-180,label:'Destination'}];data.roads=[{a:'a',b:'b',name:'Street',roadClass:'primary'},{a:'b',b:'c',name:'Street',roadClass:'primary'}];data.mission.nodeId='c';Object.assign(data.parkingZones[0],{x:0,z:-180});
 const result=drive(data,180,[carFootprint({x:1.8,z:-55,heading:0})]);assert.ok(result.mission.finished);assert.ok(result.car.z< -170);assert.equal(result.car.collisions,0);
});
for(const dropoff of [false,true])test(`a valid stop at the parking edge completes ${dropoff?'dropoff':'pickup'} without repositioning`,()=>{
 const data=structuredClone(cerea);const [pickup,destination]=data.taxi.stops;data.taxi.fares=[{passenger:'Parking fixture',pickupId:pickup.id,destinationId:destination.id}];
 const context=new District(data),car=new(createCar(context).Car)(),mission=new(createMission(context).Mission)({authored:true,seed:1}),parking=new(createParking(context).Parking)(),bot=new DemoDriver(context);
 const first=context.parkingZones.find(b=>b.id===pickup.bayId)!;car.reset({...first,heading:0});mission.requestFares(car);mission.acceptFare(mission.fareBoard[0].id);
 if(dropoff){mission.serveAtStop(car,true);mission.update(6,car,true);}
 const bay=dropoff?context.parkingZones.find(b=>b.id===destination.bayId)!:first;
 car.reset({x:bay.x+bay.width/2-1.3,z:bay.z,heading:0});parking.update(1,car,0);assert.ok(mission.canServe(car,true));assert.ok(!inRect(car,bay,1.5));const before={x:car.x,z:car.z};
 const collision:CollisionSource=[];const action=bot.update(1/60,car,parking,mission,collision);
 assert.equal(action.throttle,0);assert.deepEqual({x:car.x,z:car.z},before);if(dropoff)assert.equal(mission.completedFares,1);else assert.ok(mission.boarding>0);
});
test('finishing a pickup in reverse clears that manoeuvre before driving to the new destination',()=>{
 const data=map();data.bounds.maxZ=120;data.nodes=[{id:'p',x:0,z:-15,label:'Pickup'},{id:'a',x:0,z:0,label:'Middle'},{id:'d',x:0,z:80,label:'Dropoff'}];data.roads=[{a:'p',b:'a',name:'Street'},{a:'a',b:'d',name:'Street'}];data.spawn={...data.spawn,x:-1.8,z:0,heading:Math.PI};data.mission={...data.mission,nodeId:'d',bayId:'drop'};data.parkingZones=[{id:'hotel',name:'Pickup',x:0,z:-15,width:30,depth:30},{id:'drop',name:'Dropoff',x:0,z:80,width:8,depth:8}];
 data.taxi={...cerea.taxi,endless:true,stops:[{id:'p',bayId:'hotel',nodeId:'p',name:'Pickup',road:'Street',description:'Pickup'},{id:'d',bayId:'drop',nodeId:'d',name:'Dropoff',road:'Street',description:'Dropoff'},{id:'a',bayId:'hotel',nodeId:'a',name:'Middle',road:'Street',description:'Middle'}],fares:[{passenger:'Fixture',pickupId:'p',destinationId:'d'}]};
 const context=new District(data),car=new(createCar(context).Car)(),mission=new(createMission(context).Mission)({authored:true,seed:1}),parking=new(createParking(context).Parking)(),bot=new DemoDriver(context);
 const tick=()=>{const action=bot.update(1/60,car,parking,mission,[]);car.update(1/60,action,[]);parking.update(1/60,car,car.speed);mission.update(1/60,car,parking.stopped);};
 for(let i=0;i<600&&!mission.boarding;i++)tick();assert.ok(mission.boarding>0);assert.equal(car.gear,'R');
 while(mission.boarding>0)tick();const before={x:car.x,z:car.z};const action=bot.update(1/60,car,parking,mission,[]);
 assert.equal(car.gear,'D','The previous reverse manoeuvre must not continue into the new ride');assert.equal(action.throttle,0);assert.deepEqual({x:car.x,z:car.z},before);
});
