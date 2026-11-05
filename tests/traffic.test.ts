import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Scene} from 'three';
import {Traffic,carFootprint} from '../src/world/Traffic';
import {District,inRect} from '../src/world/district';
import {SpatialGrid,rectBounds} from '../src/world/SpatialGrid';
import {streamingColliders} from '../src/world/streaming/colliders';
import {createCar} from '../src/driving/Car';
import {idleActions} from '../src/game/DemoDriver';
const context=new District(JSON.parse(readFileSync('public/maps/veronese/manifest.json','utf8')));
test('a bounded traffic population spawns away from the taxi and bays, follows directed access and disposes',()=>{
 const scene=new Scene(),traffic=new Traffic(context,scene,new SpatialGrid(streamingColliders(context),rectBounds)),player={...context.spawn,speed:0};
 for(let i=0;i<3;i++)traffic.update(1/60,player);assert.equal(traffic.agents.length,3);
 for(const a of traffic.agents){assert.ok(Math.hypot(a.car.x-player.x,a.car.z-player.z)>70);if(a.road.oneWay)assert.equal(a.from,a.road.a);assert.ok(!context.parkingZones.some(b=>inRect(a.car,b,-2)));}
 for(let i=0;i<1800;i++)traffic.update(1/60,player);assert.ok(traffic.agents.length<=3);
 for(const a of traffic.agents)assert.ok(!context.parkingZones.some(b=>carFootprint(a.car).points!.some(p=>inRect(p,b))),'Traffic never occupies a service bay');
 traffic.dispose();assert.equal(traffic.agents.length,0);assert.equal(scene.children.length,0);
});
test('traffic participates in the normal player collision path rather than being a ghost',()=>{
 const traffic=new Traffic(context,new Scene(),new SpatialGrid(streamingColliders(context),rectBounds)),player={...context.spawn,speed:0};traffic.update(1/60,player);
 const npc=traffic.agents[0];assert.ok(npc);const car=new (createCar(context).Car)();car.reset({x:npc.car.x-Math.sin(npc.car.heading)*8,z:npc.car.z+Math.cos(npc.car.heading)*8,heading:npc.car.heading});
 for(let i=0;i<180;i++)car.update(1/60,{...idleActions(),throttle:1},traffic.collisionSource);
 assert.ok(car.collisions>0);assert.ok(Math.hypot(car.x-npc.car.x,car.z-npc.car.z)>2);traffic.dispose();
});

test('a taxi keeps completing real jobs with traffic instead of becoming boxed into an orbit',async()=>{
 const {createMission}=await import('../src/mission/Mission');const {createParking}=await import('../src/navigation/Parking');const {DemoDriver}=await import('../src/game/DemoDriver');const {chooseStartPlace}=await import('../src/game/StartPlace');
 const car=new (createCar(context).Car)(),parking=new (createParking(context).Parking)(),mission=new (createMission(context).Mission)({seed:683129967}),bot=new DemoDriver(context),traffic=new Traffic(context,new Scene(),new SpatialGrid(streamingColliders(context),rectBounds));car.reset(chooseStartPlace(context,()=>.01));
 for(let i=0;i<600*60;i++){
  const a=bot.update(1/60,car,parking,mission,traffic.collisionSource);traffic.update(1/60,car);
  assert.ok(!traffic.agents.some(npc=>inRect(car,carFootprint(npc.car),-1.05)),'An NPC must not rotate its body into the taxi and trap it');
  car.update(1/60,a,traffic.collisionSource);parking.update(1/60,car,car.speed);mission.update(1/60,car,parking.stopped);
 }
 assert.ok(mission.completedFares>=2);assert.ok(bot.distanceDriven>6000);assert.equal(car.collisions,0);traffic.dispose();
});
