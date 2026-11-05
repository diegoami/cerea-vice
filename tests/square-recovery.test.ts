import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Scene} from 'three';
import {District} from '../src/world/district';
import {createCar} from '../src/driving/Car';
import {vehicleClearance} from '../src/driving/VehicleClearance';
import {createMission} from '../src/mission/Mission';
import {createParking} from '../src/navigation/Parking';
import {DemoDriver} from '../src/game/DemoDriver';
import {Traffic} from '../src/world/Traffic';
import {SpatialGrid,rectBounds} from '../src/world/SpatialGrid';
import {streamingColliders} from '../src/world/streaming/colliders';
import harbor from '../public/maps/harbor.json';

const data=JSON.parse(readFileSync('public/maps/veronese/manifest.json','utf8'));
data.taxi.fares=[{passenger:'Square regression',pickupId:'bovolone:sanfilippo',destinationId:'bovolone:municipio'}];
const context=new District(data),solid=new SpatialGrid(streamingColliders(context),rectBounds);
for(const reverse of [false,true])test(`Bovolone's San Filippo to Municipio trip leaves the square without a reversing loop (${reverse?'opposite':'forward'} start)`,()=>{
 const bay=context.parkingZones.find(b=>b.id==='bovolone:sanfilippo')!,road=context.nearestRoad(bay)!.edge,a=context.nodeById(road.a),b=context.nodeById(road.b),sign=reverse?-1:1;
 const car=new(createCar(context).Car)(),mission=new(createMission(context).Mission)({seed:1,authored:true}),parking=new(createParking(context).Parking)(),bot=new DemoDriver(context),traffic=new Traffic(context,new Scene(),solid);
 car.reset({...bay,heading:Math.atan2((b.x-a.x)*sign,-(b.z-a.z)*sign)});car.unlimited=true;
 let backwards=0;
 try{
  for(let i=0;i<180*60&&!mission.completedFares;i++){
   const action=bot.update(1/60,car,parking,mission,traffic.collisionSource);traffic.update(1/60,car);car.update(1/60,action,traffic.collisionSource);parking.update(1/60,car,car.speed);mission.update(1/60,car,parking.stopped);
   if(car.gear==='R')backwards+=1/60;
   assert.ok(vehicleClearance(car,solid,context.district.bounds)>=-.01,`The bonnet/cabin must stay out of buildings at ${car.x}, ${car.z}`);
  }
  assert.equal(mission.completedFares,1,'The accepted fare is delivered using ordinary movement');assert.ok(backwards<15,`${backwards}s reversing`);assert.ok(bot.recoveries<4);assert.equal(car.collisions,0);
 }finally{traffic.dispose();}
});

test('clearance includes the bonnet and cabin while preserving a building courtyard',()=>{
 const bounds={minX:-100,maxX:100,minZ:-100,maxZ:100},wall={x:0,z:-4,width:10,depth:2};
 assert.ok(vehicleClearance({x:0,z:0,heading:0},[wall],bounds)>0);
 assert.ok(vehicleClearance({x:0,z:-.6,heading:0},[wall],bounds)<0,'The bonnet reaches the wall before the centre collision circle');
 const courtyard={x:0,z:0,width:30,depth:30,points:[{x:-15,z:-15},{x:15,z:-15},{x:15,z:15},{x:-15,z:15}],holes:[[{x:-5,z:-5},{x:5,z:-5},{x:5,z:5},{x:-5,z:5}]]};
 assert.ok(vehicleClearance({x:0,z:0,heading:0},[courtyard],bounds)>0);
});

test('a taxi stranded on the far side of a square building finds its nearby street instead of reversing forever',()=>{
 const map={...structuredClone(harbor),id:'square-reconnect',bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},nodes:[{id:'a',x:-25,z:-30,label:'North approach'},{id:'b',x:-25,z:0,label:'Destination'}],roads:[{a:'a',b:'b',name:'West street',roadClass:'residential'}],spawn:{...harbor.spawn,x:10,z:25,heading:Math.PI},mission:{...harbor.mission,nodeId:'b',bayId:'hotel',duration:500},parkingZones:[{id:'hotel',name:'Destination',x:-25,z:0,width:6,depth:6}],buildings:[{x:0,z:0,width:30,depth:40,height:9,color:0x997766}],landmarks:[],features:[],areas:[{name:'Square',x:0,z:25,width:100,depth:60}]};
 const c=new District(map),car=new(createCar(c).Car)(),mission=new(createMission(c).Mission)(),parking=new(createParking(c).Parking)(),bot=new DemoDriver(c),grid=new SpatialGrid(c.district.buildings,rectBounds);
 for(let i=0;i<180*60&&!mission.finished;i++){
  const action=bot.update(1/60,car,parking,mission,grid);car.update(1/60,action,grid);parking.update(1/60,car,car.speed);mission.update(1/60,car,parking.stopped);
  assert.ok(vehicleClearance(car,grid,c.district.bounds)>=-.01,'Recovery must keep the cabin and bonnet out of the building');
 }
 assert.ok(mission.finished);assert.ok(bot.distanceDriven>60);assert.ok(bot.recoveries<5);assert.equal(car.collisions,0);
});
