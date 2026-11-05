import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DemoDriver} from '../src/game/DemoDriver';
import {createCar} from '../src/driving/Car';
import {createMission} from '../src/mission/Mission';
import {createParking} from '../src/navigation/Parking';
import {District,type Rect} from '../src/world/district';
import {SpatialGrid,rectBounds} from '../src/world/SpatialGrid';
import {createWorld} from '../src/world/World';
import data from '../public/maps/cerea.json';
import harbor from '../public/maps/harbor.json';

function harness(map:unknown=data){
 const context=new District(map);
 // Stub canvas painting only; use the production world's complete collision geometry.
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,getContext:()=>new Proxy({}, {get(target,key){if(key==='measureText')return (text:string)=>({width:text.length*12});if(key==='createLinearGradient')return ()=>({addColorStop(){}});return Reflect.get(target,key)??(()=>{});}})})}});
 const world=new (createWorld(context).World)();
 const car=new (createCar(context).Car)(),mission=new (createMission(context).Mission)({seed:683129967}),parking=new (createParking(context).Parking)(),bot=new DemoDriver(context);
 const tick=(seconds:number,colliders=world.collisionIndex)=>{
  for(let i=0;i<Math.ceil(seconds*60);i++){
   const actions=bot.update(1/60,car,parking,mission,colliders);
   car.update(1/60,actions,colliders);parking.update(1/60,car,car.speed);mission.update(1/60,car,parking.stopped);
  }
 };
 return {context,world,car,mission,parking,bot,tick};
}
test('autonomous taxi completes real fares, preserves progress past closing and keeps exploring',()=>{
 const h=harness();h.tick(1250);
 assert.equal(h.mission.state,'shift-complete');assert.ok(h.mission.completedFares>=3);
 assert.ok(h.mission.earningsCents>2000);assert.ok(h.bot.actionsCompleted>=14);assert.ok(h.bot.distanceDriven>4000);
 const progress=h.mission.snapshot(),distance=h.bot.distanceDriven;
 h.tick(90);assert.deepEqual(h.mission.snapshot(),progress);assert.ok(h.bot.distanceDriven>distance+100,'After closing, the car keeps exploring without resetting the shift');
 console.log({fares:h.mission.completedFares,earnings:h.mission.earningsCents,metres:Math.round(h.bot.distanceDriven),recoveries:h.bot.recoveries,collisions:h.car.collisions});
});
test('blocked movement triggers normal reversing and replanning; boarding never counts as a stall',()=>{
 const h=harness();h.tick(1);
 assert.ok(h.mission.boarding>0);const recoveries=h.bot.recoveries;
 h.tick(h.mission.boarding+.1);assert.equal(h.bot.recoveries,recoveries,'Intentional boarding is progress, not a stall');
 const wall:Rect={x:h.car.x,z:h.car.z-6,width:30,depth:2};
 // A temporary unexpected obstruction around the car, then removal: physics still owns every move.
 const cage:Rect[]=[{x:h.car.x,z:h.car.z-3,width:30,depth:2},{x:h.car.x,z:h.car.z+3,width:30,depth:2},{x:h.car.x-3,z:h.car.z,width:2,depth:30},{x:h.car.x+3,z:h.car.z,width:2,depth:30}];
 const original=h.world.collisionIndex;
 const blocked=new SpatialGrid([...h.world.colliders,wall,...cage],rectBounds);
 h.tick(30,blocked);assert.ok(h.bot.recoveries>0,'A trapped route must trigger recovery');
 const before={x:h.car.x,z:h.car.z};h.tick(300,original);
 assert.ok(Math.hypot(h.car.x-before.x,h.car.z-before.z)>25,'Reverses and drives out using ordinary controls');
 assert.ok(h.bot.distanceDriven>200);
});

test('Harbor demo drives to its legacy hotel bay and continues exploring after arrival',()=>{
 const h=harness(harbor);h.tick(240);
 assert.ok(h.mission.finished);assert.ok(h.bot.distanceDriven>200);
 const distance=h.bot.distanceDriven;h.tick(90);assert.ok(h.bot.distanceDriven>distance+50);
});

test('a persistent road obstruction is bypassed and the booked passenger is delivered',()=>{
 const h=harness();h.tick(10);
 const wall:Rect={x:h.car.x+Math.sin(h.car.heading)*6,z:h.car.z-Math.cos(h.car.heading)*6,width:12,depth:4};
 const blocked=new SpatialGrid([...h.world.colliders,wall],rectBounds);
 h.tick(300,blocked);
 assert.ok(h.bot.recoveries>0);assert.ok(h.mission.completedFares>=1,'A recovery must get past the wall and finish real work without removing the obstruction');
 assert.ok(h.bot.distanceDriven>500);
});

test('path tracking drives a useful urban pace without repeated large steering changes or gear thrashing',()=>{
 const h=harness();let moving=0,totalSpeed=0,largeChanges=0,lastSteer=0,reverseTime=0,maxReverse=0;
 for(let i=0;i<180*60;i++){
  const beforeSpeed=h.car.speed,beforeGear=h.car.gear,settled=h.parking.stopped;
  const action=h.bot.update(1/60,h.car,h.parking,h.mission,h.world.collisionIndex);
  if(beforeGear!==h.car.gear){assert.equal(beforeSpeed,0);assert.ok(settled);}
  h.car.update(1/60,action,h.world.collisionIndex);h.parking.update(1/60,h.car,h.car.speed);h.mission.update(1/60,h.car,h.parking.stopped);
  if(Math.abs(h.car.speed)>1){moving++;totalSpeed+=Math.abs(h.car.speed);if(Math.abs(action.steer-lastSteer)>.2)largeChanges++;lastSteer=action.steer;}
  if(h.car.gear==='R'){reverseTime+=1/60;maxReverse=Math.max(maxReverse,reverseTime);}else reverseTime=0;
 }
 assert.ok(h.bot.distanceDriven>1500,'Old driver covered only about 792 m on this seed');
 assert.ok(totalSpeed/moving>9,'Moving mean must exceed 32 km/h on this route');
 assert.ok(largeChanges<40,'Old driver changed steering by more than 0.2 on 473 updates');
 assert.ok(maxReverse<7,'A reverse manoeuvre must finish rather than remain in reverse');assert.equal(h.car.collisions,0);
});
