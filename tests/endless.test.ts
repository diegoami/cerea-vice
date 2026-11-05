import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {District} from '../src/world/district';
import {createMission} from '../src/mission/Mission';
import {decodeSave,mapSignature,SAVE_VERSION} from '../src/game/Save';
import {createAtlasNotes} from '../src/navigation/AtlasNotes';
const data=JSON.parse(readFileSync('public/maps/veronese/manifest.json','utf8')),context=new District(data);

test('continuous taxi service passes 17:00 and midnight without cancelling an unpaid ride',()=>{
 const {Mission}=createMission(context),m=new Mission({seed:31});m.requestFares(context.spawn);m.acceptFare(m.fareBoard[0].id);
 const pickup=m.target!.bay;m.serveAtStop(pickup,true);m.update(6,pickup,true);
 const fare=m.snapshot().currentFare;
 m.update(1200,pickup,true);assert.equal(m.finished,false);assert.ok(m.clockHours>17);assert.deepEqual(m.snapshot().currentFare,fare);
 m.update(960,pickup,true);assert.equal(m.finished,false);assert.ok(m.clockHours<2);assert.ok(m.serveAtStop(m.target!.bay,true));assert.equal(m.completedFares,1);
});
test('voluntary rest advances eight hours without earnings changes and refuses a booked passenger',()=>{
 const {Mission}=createMission(context),m=new Mission({seed:2});const money=m.earningsCents;
 assert.ok(m.rest(8));assert.equal(m.clockText,'15:00');assert.ok(m.rest(8));assert.equal(m.clockText,'23:00');assert.ok(m.rest(8));assert.equal(m.clockText,'07:00');assert.equal(m.earningsCents,money);
 m.requestFares(context.spawn);m.acceptFare(m.fareBoard[0].id);const before=m.snapshot();assert.equal(m.rest(8),false);assert.deepEqual(m.snapshot(),before);
});
test('the prior unified-map save signature resumes a completed shift with its clock, receipts and ride intact',()=>{
 const {Mission}=createMission(context),m=new Mission({seed:2});m.requestFares(context.spawn);m.acceptFare(m.fareBoard[0].id);m.serveAtStop(m.target!.bay,true);m.update(6,m.target!.bay,true);
 const snapshot=m.snapshot();snapshot.totalElapsed=1200;snapshot.state='shift-complete';
 const {AtlasNotes}=createAtlasNotes(context),save={version:SAVE_VERSION,district:data.id,map:'c5d8a6c5',dataVersion:1,savedAt:new Date().toISOString(),car:{x:context.spawn.x,z:context.spawn.z,heading:0,speed:0,gear:'D',steering:0,collisions:0},unsafeStops:0,mission:snapshot,atlas:new AtlasNotes().snapshot()};
 const decoded=decodeSave(context,JSON.stringify(save));assert.equal(decoded.mission.state,'active');assert.equal(decoded.mission.totalElapsed,1200);assert.deepEqual(decoded.mission.currentFare,snapshot.currentFare);assert.deepEqual(decoded.mission.receipts,snapshot.receipts);
 assert.notEqual(mapSignature(context),'c5d8a6c5');
});

test('the reported Casaleone post office trip can complete across the old 17:00 closing boundary',async()=>{
 const {createCar}=await import('../src/driving/Car');const {createParking}=await import('../src/navigation/Parking');const {DemoDriver}=await import('../src/game/DemoDriver');const {SpatialGrid,rectBounds}=await import('../src/world/SpatialGrid');const {streamingColliders}=await import('../src/world/streaming/colliders');
 const fixture=structuredClone(data);fixture.taxi.fares=[{passenger:'Fixture',pickupId:'casaleone:chiesa',destinationId:'casaleone:poste'}];
 const c=new District(fixture),car=new (createCar(c).Car)(),parking=new (createParking(c).Parking)(),m=new (createMission(c).Mission)({seed:1,authored:true}),bot=new DemoDriver(c),grid=new SpatialGrid(streamingColliders(c),rectBounds);
 const pickup=c.parkingZones.find(b=>b.id==='casaleone:chiesa')!;car.reset({...pickup,heading:0});m.requestFares(car);m.acceptFare(m.fareBoard[0].id);m.serveAtStop(car,true);m.totalElapsed=1170;
 for(let i=0;i<120*60&&!m.completedFares;i++){const a=bot.update(1/60,car,parking,m,grid);car.update(1/60,a,grid);parking.update(1/60,car,car.speed);m.update(1/60,car,parking.stopped);}
 assert.equal(m.completedFares,1);assert.ok(m.earningsCents>0);assert.ok(m.clockHours>17);assert.equal(m.finished,false);
});
