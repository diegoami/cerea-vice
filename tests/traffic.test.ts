import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Scene} from 'three';
import {Traffic,carFootprint} from '../src/world/Traffic';
import {District,inRect,projectToSegment,roadWidth} from '../src/world/district';
import {SpatialGrid,rectBounds} from '../src/world/SpatialGrid';
import {streamingColliders} from '../src/world/streaming/colliders';
import {createCar} from '../src/driving/Car';
import {idleActions} from '../src/game/DemoDriver';
import harbor from '../public/maps/harbor.json';
const context=new District(JSON.parse(readFileSync('public/maps/veronese/manifest.json','utf8')));
test('traffic never enters a one-way map-edge sink with no legal continuation',()=>{
 const data={...structuredClone(harbor),id:'traffic-sink',mission:{...harbor.mission,nodeId:'a'},bounds:{minX:-1000,maxX:1000,minZ:-1000,maxZ:1000},
  nodes:[{id:'a',x:-200,z:-100,label:'Entry'},{id:'b',x:200,z:-100,label:'Map edge'}],roads:[{a:'a',b:'b',name:'One-way dead end',roadClass:'primary',oneWay:true}],buildings:[],landmarks:[],features:[],parkingZones:harbor.parkingZones.map(p=>({...p,x:p.x+600,z:p.z+600}))};
 const traffic=new Traffic(new District(data),new Scene(),{at:()=>[]});
 for(let i=0;i<120;i++)traffic.update(1/60,{x:0,z:0,heading:0,speed:0});
 assert.equal(traffic.agents.length,0);traffic.dispose();
});
test('traffic keeps circulating instead of parking in the carriageway, and resumes after an obstruction clears',()=>{
 const data={...structuredClone(harbor),id:'traffic-loop',mission:{...harbor.mission,nodeId:'a'},spawn:{...harbor.spawn,x:0,z:0},bounds:{minX:-1000,maxX:1000,minZ:-1000,maxZ:1000},
  nodes:[['a',-100,-100],['b',100,-100],['c',100,100],['d',-100,100]].map(([id,x,z])=>({id:String(id),x:Number(x),z:Number(z),label:String(id)})),
  roads:[['a','b'],['b','c'],['c','d'],['d','a']].map(([a,b])=>({a,b,name:'Loop road',roadClass:'primary',oneWay:true})),buildings:[],landmarks:[],features:[],parkingZones:harbor.parkingZones.map(p=>({...p,x:p.x+600,z:p.z+600}))};
 const c=new District(data);let obstruction:ReturnType<typeof carFootprint>[]=[];
 const traffic=new Traffic(c,new Scene(),{at:()=>obstruction}),player={x:0,z:0,heading:0,speed:0};
 for(let i=0;i<60*60;i++)traffic.update(1/60,player);
 assert.equal(traffic.agents.length,3);const starts=traffic.agents.map(a=>a.distanceDriven);
 const first=traffic.agents[0];obstruction=[{...carFootprint(first.car),width:8,depth:8,points:undefined}];
 for(let i=0;i<20*60;i++)traffic.update(1/60,player);obstruction=[];
 const recovered=traffic.agents.map(a=>a.distanceDriven);
 for(let i=0;i<60*60;i++)traffic.update(1/60,player);
 for(let i=0;i<3;i++){assert.ok(recovered[i]>=starts[i]);assert.ok(traffic.agents[i].distanceDriven-recovered[i]>100,'Every car continues after the obstruction, without despawning or a pose reset');}
 assert.ok(traffic.agents.some(a=>a.recoveries>0));
 const yielding=traffic.agents[0],beforeYield=yielding.distanceDriven;
 Object.assign(player,{x:yielding.car.x+Math.sin(yielding.car.heading)*45,z:yielding.car.z-Math.cos(yielding.car.heading)*45,heading:yielding.car.heading+Math.PI,speed:4});
 for(let i=0;i<30*60;i++)traffic.update(1/60,player);
 assert.ok(yielding.yieldPoint,'There is a clear shoulder in this fixture');assert.equal(yielding.car.speed,0);
 for(const point of carFootprint(yielding.car).points!)for(const road of c.roads)assert.ok(Math.hypot(point.x-projectToSegment(point,c.nodeById(road.a),c.nodeById(road.b)).x,point.z-projectToSegment(point,c.nodeById(road.a),c.nodeById(road.b)).z)>roadWidth(road)/2,'A car waits entirely outside the carriageway');
 Object.assign(player,{x:0,z:0,speed:0});for(let i=0;i<30*60;i++)traffic.update(1/60,player);
 assert.ok(yielding.distanceDriven>beforeYield+50,'A pulled-over car rejoins traffic after the taxi passes');traffic.dispose();
});
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

test('a close taxi cannot trap a traffic car inside the enlarged safety buffer',()=>{
 const traffic=new Traffic(context,new Scene(),new SpatialGrid(streamingColliders(context),rectBounds));traffic.update(1/60,{...context.spawn,speed:0});
 const npc=traffic.agents[0],before={x:npc.car.x,z:npc.car.z},player={x:npc.car.x-Math.sin(npc.car.heading)*2.98,z:npc.car.z+Math.cos(npc.car.heading)*2.98,heading:npc.car.heading,speed:0};
 for(let i=0;i<10*60;i++){traffic.update(1/60,player);assert.ok(!inRect(player,carFootprint(npc.car),-1.05),'Moving out must preserve physical clearance');}
 assert.ok(Math.hypot(npc.car.x-before.x,npc.car.z-before.z)>10,'The car drives out of the buffer rather than freezing in the lane');traffic.dispose();
});

test('a taxi keeps completing real jobs with traffic instead of becoming boxed into an orbit',async()=>{
 const {createMission}=await import('../src/mission/Mission');const {createParking}=await import('../src/navigation/Parking');const {DemoDriver}=await import('../src/game/DemoDriver');const {chooseStartPlace}=await import('../src/game/StartPlace');
 const car=new (createCar(context).Car)(),parking=new (createParking(context).Parking)(),mission=new (createMission(context).Mission)({seed:683129967}),bot=new DemoDriver(context),traffic=new Traffic(context,new Scene(),new SpatialGrid(streamingColliders(context),rectBounds));car.reset(chooseStartPlace(context,()=>.01));
 let progressDistance=0,lastAction=0,lastProgress=0,longestStall=0;
 for(let i=0;i<1200*60;i++){
  const a=bot.update(1/60,car,parking,mission,traffic.collisionSource);traffic.update(1/60,car);
  assert.ok(!traffic.agents.some(npc=>inRect(car,carFootprint(npc.car),-1.05)),'An NPC must not rotate its body into the taxi and trap it');
  car.update(1/60,a,traffic.collisionSource);parking.update(1/60,car,car.speed);mission.update(1/60,car,parking.stopped);
  if(bot.distanceDriven-progressDistance>10||bot.actionsCompleted!==lastAction||mission.boarding>0){progressDistance=bot.distanceDriven;lastAction=bot.actionsCompleted;lastProgress=i;}
  longestStall=Math.max(longestStall,(i-lastProgress)/60);
 }
 // Actual lane keeping and following slower traffic change journey duration.
 // Require both types of work and sustained movement, rather than a racing quota.
 assert.ok(mission.completedFares>=2);assert.ok(bot.localFaresChosen>0&&bot.interTownFaresChosen>0);assert.ok(bot.distanceDriven>11000);assert.ok(longestStall<60,`${longestStall}s without progress`);assert.equal(car.collisions,0);traffic.dispose();
});
