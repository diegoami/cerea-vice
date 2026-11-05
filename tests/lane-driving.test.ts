import {test} from 'node:test';
import assert from 'node:assert/strict';
import harbor from '../public/maps/harbor.json';
import {District,inRect,type Point} from '../src/world/district';
import {laneRoute} from '../src/driving/LaneRoute';
import {createCar,type CollisionSource} from '../src/driving/Car';
import {createMission} from '../src/mission/Mission';
import {createParking} from '../src/navigation/Parking';
import {DemoDriver} from '../src/game/DemoDriver';
import {carFootprint} from '../src/world/Traffic';
import {planOvertake} from '../src/driving/Overtake';
const fixture=(side:'left'|'right')=>new District({...structuredClone(harbor),id:'lane-fixture',drivingSide:side,bounds:{minX:-100,maxX:100,minZ:-500,maxZ:100},
 nodes:[{id:'a',x:0,z:0,label:'Start'},{id:'b',x:0,z:-400,label:'End'}],roads:[{a:'a',b:'b',name:'Test road',roadClass:'primary',oneWay:false}],
 spawn:{...harbor.spawn,x:side==='left'?-1.8:1.8,z:0,heading:0},mission:{...harbor.mission,nodeId:'b',bayId:'hotel'},parkingZones:[{id:'hotel',name:'Destination',x:0,z:-380,width:12,depth:12}],landmarks:[],buildings:[],features:[],areas:[{name:'Town',x:0,z:-200,width:200,depth:500}]});
test('directed lane routes respect both driving sides and reverse the lane on the return journey',()=>{
 for(const side of ['left','right'] as const){const c=fixture(side),sign=side==='left'?-1:1;
  for(const p of laneRoute(c,['a','b']))assert.ok(Math.abs(p.x-sign*1.8)<1e-6);
  for(const p of laneRoute(c,['b','a']))assert.ok(Math.abs(p.x+sign*1.8)<1e-6);
 }
});
for(const side of ['left','right'] as const)test(`the demo holds its ${side} lane and passes a car parked clear on the shoulder`,()=>{
 const c=fixture(side),sign=side==='left'?-1:1,car=new(createCar(c).Car)(),mission=new(createMission(c).Mission)(),parking=new(createParking(c).Parking)(),bot=new DemoDriver(c),obstacle={x:sign*7,z:-80,heading:0,speed:0},body=carFootprint(obstacle);
 const collision:CollisionSource={at:(p:Point,r=0)=>inRect(p,body,-r)?[body]:[],moving:()=>[obstacle]};
 for(let i=0;i<15*60;i++){const a=bot.update(1/60,car,parking,mission,collision);car.update(1/60,a,collision);parking.update(1/60,car,car.speed);mission.update(1/60,car,parking.stopped);assert.ok(Math.abs(car.x-sign*1.8)<.5,'Ordinary straight driving stays out of the road centre');}
 assert.ok(car.z< -120);assert.equal(car.collisions,0);
});
test('the demo uses a clear verge to pass a stationary car blocking its lane, then continues the journey',()=>{
 const c=fixture('right'),car=new(createCar(c).Car)(),mission=new(createMission(c).Mission)(),parking=new(createParking(c).Parking)(),bot=new DemoDriver(c),obstacle={x:1.8,z:-55,heading:0,speed:0},body=carFootprint(obstacle);
 const collision:CollisionSource={at:(p:Point,r=0)=>inRect(p,body,-r)?[body]:[],moving:()=>[obstacle]};let usedVerge=false;
 for(let i=0;i<60*60;i++){const a=bot.update(1/60,car,parking,mission,collision);car.update(1/60,a,collision);parking.update(1/60,car,car.speed);mission.update(1/60,car,parking.stopped);usedVerge||=Math.abs(car.x)>4;}
 assert.ok(car.z< -100,'It passes the obstruction instead of waiting indefinitely');assert.ok(usedVerge,'The bypass may use the clear verge');assert.equal(car.collisions,0);
});
test('the demo follows a slower car at a safe gap when the passing lane is blocked',()=>{
 const c=fixture('right'),car=new(createCar(c).Car)(),mission=new(createMission(c).Mission)(),parking=new(createParking(c).Parking)(),bot=new DemoDriver(c),other={x:1.8,z:-30,heading:0,speed:6};
 const blocked={x:-1.8,z:-180,width:1.6,depth:360};
 const collision:CollisionSource={at:(p:Point,r=0)=>[carFootprint(other),blocked].filter(body=>inRect(p,body,-r)),moving:()=>[other]};
 for(let i=0;i<15*60;i++){other.z-=other.speed/60;const a=bot.update(1/60,car,parking,mission,collision);car.update(1/60,a,collision);parking.update(1/60,car,car.speed);mission.update(1/60,car,parking.stopped);}
 assert.ok(car.speed>4&&car.speed<8);assert.ok(car.z-other.z>7&&car.z-other.z<18);assert.equal(bot.overtakesStarted,0);assert.equal(car.collisions,0);
});
for(const side of ['left','right'] as const)test(`the demo overtakes a slower car on a clear straight and returns to its ${side} lane`,()=>{
 const c=fixture(side),sign=side==='left'?-1:1,car=new(createCar(c).Car)(),mission=new(createMission(c).Mission)(),parking=new(createParking(c).Parking)(),bot=new DemoDriver(c),other={x:sign*1.8,z:-11,heading:0,speed:8};car.speed=8;
 const collision:CollisionSource={at:(p:Point,r=0)=>{const body=carFootprint(other);return inRect(p,body,-r)?[body]:[];},moving:()=>[other]};let usedPassingLane=false;
 for(let i=0;i<18*60;i++){other.z-=other.speed/60;const a=bot.update(1/60,car,parking,mission,collision);car.update(1/60,a,collision);parking.update(1/60,car,car.speed);mission.update(1/60,car,parking.stopped);usedPassingLane||=car.x*sign< -1;}
 assert.ok(usedPassingLane);assert.ok(car.z<other.z-8);assert.ok(Math.abs(car.x-sign*1.8)<.6);assert.ok(bot.overtakesCompleted>0);assert.equal(car.collisions,0);
});
test('the demo waits behind slower traffic when an oncoming car occupies the passing corridor',()=>{
 const c=fixture('right'),car=new(createCar(c).Car)(),mission=new(createMission(c).Mission)(),parking=new(createParking(c).Parking)(),bot=new DemoDriver(c),lead={x:1.8,z:-30,heading:0,speed:6},oncoming={x:-1.8,z:-150,heading:Math.PI,speed:8};
 const collision:CollisionSource={at:(p:Point,r=0)=>[carFootprint(lead),carFootprint(oncoming)].filter(body=>inRect(p,body,-r)),moving:()=>[lead,oncoming]};
 for(let i=0;i<5*60;i++){lead.z-=lead.speed/60;oncoming.z+=oncoming.speed/60;const a=bot.update(1/60,car,parking,mission,collision);car.update(1/60,a,collision);parking.update(1/60,car,car.speed);mission.update(1/60,car,parking.stopped);}
 assert.equal(bot.overtakesStarted,0);assert.ok(car.x>1);assert.equal(car.collisions,0);
});
test('overtaking is refused before a junction or on a narrow road',()=>{
 const base=fixture('right').district;
 const junction=new District({...base,nodes:[...base.nodes,{id:'j',x:0,z:-50,label:'Junction'},{id:'side',x:50,z:-50,label:'Side road'}],roads:[{...base.roads[0],b:'j'},{...base.roads[0],a:'j'},{a:'j',b:'side',name:'Side road'}]});
 const narrow=new District({...base,roads:base.roads.map(r=>({...r,width:5.5}))});
 for(const c of [junction,narrow]){const car=new(createCar(c).Car)();car.speed=13;const other={x:1.8,z:-25,heading:0,speed:6},collision:CollisionSource={at:()=>[],moving:()=>[other]};
  assert.equal(planOvertake(c,car,[{x:1.8,z:-400}],collision),undefined);
 }
});
test('overtaking is refused when another car would occupy the return gap',()=>{
 const c=fixture('right'),car=new(createCar(c).Car)();car.speed=8;
 const lead={x:1.8,z:-11,heading:0,speed:8},ahead={x:1.8,z:-34,heading:0,speed:8};
 const collision:CollisionSource={at:(p:Point,r=0)=>[carFootprint(lead),carFootprint(ahead)].filter(b=>inRect(p,b,-r)),moving:()=>[lead,ahead]};
 assert.equal(planOvertake(c,car,[{x:1.8,z:-400}],collision),undefined);
});
