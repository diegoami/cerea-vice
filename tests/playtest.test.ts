import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import cerea from '../public/maps/cerea.json';
import outskirts from '../public/maps/cerea-outskirts/manifest.json';
import {District} from '../src/world/district';
import {createMission,guaranteedFare,migrateSnapshot,BOARDING_SECONDS,DEPARTURE_SECONDS,FARE_BOARD_SIZE} from '../src/mission/Mission';
import {createNavigation} from '../src/navigation/Navigation';
import {createAtlasNotes} from '../src/navigation/AtlasNotes';
import {decodeSave,mapSignature,type SaveData} from '../src/game/Save';
import {PassengerPresence,createPerson,carPoint,clearPath,crossesTaxi,kerbOrigin,walkToDoor,DOOR} from '../src/world/People';
import {inRect} from '../src/world/district';
import {LocalFrame} from '../src/world/LocalFrame';
import {defaultBindings,readBindings,bindingConflict,bindingLabel} from '../src/input/Bindings';
import {Input} from '../src/input/Input';

const context=new District(cerea),{Mission}=createMission(context);
type Shift=InstanceType<typeof Mission>;
const ids=(m:Shift)=>m.fareBoard.map(o=>`${o.id}:${o.passenger}:${o.pickupId}/${o.destinationId}:${m.offerGuaranteeCents(o)}`);
/** Request at a stop and accept one listed fare (the first by default). */
function take(m:Shift,position=context.spawn,index=0){assert.equal(m.requestFares(position),true);assert.equal(m.acceptFare(m.fareBoard[index].id),true);}
test('shifts start free driving; deliberate requests list distinct reachable fares reproducibly',()=>{
 const nav=createNavigation(context),pairs=new Set<string>(),pickups=new Set<string>();
 for(let seed=0;seed<80;seed++){
   const mission=new Mission({seed:seed*1833});
   assert.equal(mission.freeDriving,true);assert.equal(mission.fareBoard.length,0,'No automatic offer at shift start');assert.equal(mission.target,undefined);
   mission.update(30,context.spawn,true);assert.equal(mission.fareBoard.length,0,'Stopping alone never offers a fare');
   assert.equal(mission.requestFares(context.spawn),true);assert.equal(mission.fareBoard.length,FARE_BOARD_SIZE);
   const listed=new Set(mission.fareBoard.map(o=>`${o.pickupId}/${o.destinationId}`));assert.equal(listed.size,FARE_BOARD_SIZE,'Listed fares are distinct');
   assert.equal(new Set(mission.fareBoard.map(o=>o.passenger)).size,FARE_BOARD_SIZE,'Each listed passenger is a different person');
   for(const offer of mission.fareBoard){
     assert.notEqual(offer.pickupId,offer.destinationId);assert.equal(offer.quoted,true);
     assert.ok(Number.isFinite(nav.shortestRoute(context.district.taxi!.stops.find(s=>s.id===offer.pickupId)!.nodeId,context.district.taxi!.stops.find(s=>s.id===offer.destinationId)!.nodeId).cost));
     pairs.add(`${offer.pickupId}/${offer.destinationId}`);pickups.add(offer.pickupId);
   }
 }
 assert.ok(pairs.size>30);assert.equal(pickups.size,9);
 const a=new Mission({seed:72}),b=new Mission({seed:72});
 for(let i=0;i<15;i++){a.requestFares(context.spawn);b.requestFares(context.spawn);assert.deepEqual(ids(a),ids(b));const before=ids(a);a.refreshFares(context.spawn);b.refreshFares(context.spawn);assert.notDeepEqual(ids(a),before);}
});
test('reopening, waiting and driving keep the same list; only an explicit new list or acceptance replaces it',()=>{
 const mission=new Mission({seed:75});mission.requestFares(context.spawn);const first=ids(mission),serial=mission.boardSerial;
 for(let i=0;i<3;i++){mission.update(20,context.spawn,false);assert.equal(mission.requestFares({x:context.spawn.x+400,z:context.spawn.z}),true);assert.deepEqual(ids(mission),first,'Closing and reopening never rerolls or requotes');}
 assert.equal(mission.boardSerial,serial);
 mission.refreshFares(context.spawn);const second=ids(mission);assert.notDeepEqual(second,first);assert.ok(mission.fareBoard.every(o=>o.id>=serial),'Replacement fares receive new identities');
 assert.equal(mission.earningsCents,0);assert.equal(mission.completedFares,0);assert.equal(mission.taxiStage,'pickup');
});
test('accepting commits one ride; closing or a new list pays nothing; service still requires a full stop',()=>{
 const mission=new Mission({seed:75});
 assert.equal(mission.acceptFare(0),false,'Nothing can be accepted before a list is requested');
 mission.requestFares(context.spawn);const chosen=mission.fareBoard[2],guarantee=mission.offerGuaranteeCents(chosen);
 assert.equal(mission.serveAtStop(context.spawn,true),false,'A listed fare is not a ride');
 assert.equal(mission.acceptFare(9999),false);
 assert.equal(mission.acceptFare(chosen.id),true);assert.equal(mission.fareBoard.length,0);
 assert.equal(mission.passenger,chosen.passenger);assert.equal(mission.pickupStop!.id,chosen.pickupId);assert.equal(mission.baseFareCents,guarantee);
 assert.equal(mission.requestFares(context.spawn),false,'No overlapping assignments');assert.equal(mission.refreshFares(context.spawn),false);assert.equal(mission.acceptFare(chosen.id),false);
 assert.equal(mission.serveAtStop(mission.target!.bay,false),false);
 assert.equal(mission.serveAtStop(mission.target!.bay,true),true);assert.equal(mission.unfinishedPassenger,true);
 assert.equal(mission.serveAtStop(mission.target!.bay,true),false,'Dropoff waits until the passenger is seated');
 mission.update(BOARDING_SECONDS+600,mission.target!.bay,true);assert.equal(mission.completedFares,0);
 assert.equal(mission.serveAtStop(mission.target!.bay,true),true);assert.equal(mission.receipts[0].baseCents,guarantee);
 assert.equal(mission.receipts[0].bonusCents,0);assert.equal(mission.freeDriving,true);assert.equal(mission.fareBoard.length,0,'Dropoff returns to free driving without an offer');
});
function saved(mission=new Mission({seed:75}),car={speed:0,gear:'R' as const}):SaveData{
 const {AtlasNotes}=createAtlasNotes(context),notes=new AtlasNotes();notes.pointAt({x:40,z:40});notes.place();
 return {version:2,district:context.district.id,map:mapSignature(context),savedAt:new Date().toISOString(),
   car:{x:context.spawn.x,z:context.spawn.z,heading:context.spawn.heading,speed:car.speed,gear:car.gear,steering:0,collisions:3},
   unsafeStops:2,mission:mission.snapshot(),atlas:notes.snapshot()};
}
test('save/load preserves free driving, listed fares, accepted rides, boarding, receipts, atlas estimates and the next list',()=>{
 for(const stage of ['free','listed','accepted','boarding','aboard','completed']){
   const mission=new Mission({seed:75});if(stage!=='free')mission.requestFares(context.spawn);
   if(!['free','listed'].includes(stage))mission.acceptFare(mission.fareBoard[1].id);
   if(['boarding','aboard','completed'].includes(stage)){mission.serveAtStop(mission.target!.bay,true);mission.update(stage==='boarding'?1.5:24,mission.target!.bay,true);}
   if(stage==='completed')mission.serveAtStop(mission.target!.bay,true);
   const data=decodeSave(context,JSON.stringify(saved(mission))),restored=new Mission({seed:983});restored.restore(data.mission);
   assert.deepEqual(restored.snapshot(),mission.snapshot(),stage);assert.equal(data.atlas.source,'estimate');assert.deepEqual(data.atlas.marker,{x:40,z:40});
   assert.equal(restored.boarding,mission.boarding);assert.equal(restored.seatedIdentity,mission.seatedIdentity);
   if(mission.freeDriving){mission.requestFares(context.spawn);restored.requestFares(context.spawn);assert.deepEqual(ids(restored),ids(mission),`${stage}: same list after load`);}
 }
 const boarding=new Mission({seed:75});take(boarding);boarding.serveAtStop(boarding.target!.bay,true);
 assert.throws(()=>decodeSave(context,JSON.stringify(saved(boarding,{speed:-2,gear:'R'}))),'A boarding save must have a stationary taxi');
});
test('0.8 saves migrate: a pending offer becomes a one-fare list with the same quote, an accepted ride stays accepted',()=>{
 const legacy=(mutate:(m:Record<string,unknown>)=>void)=>{const value=saved() as unknown as {version:number;mission:Record<string,unknown>};value.version=1;
   value.mission={elapsed:0,totalElapsed:12,state:'active',taxiStage:'pickup',fareIndex:0,earningsCents:0,bonusEarnedCents:0,receipts:[],directionRequests:{legal:1,unsafe:0},
     offerPending:true,offerQuoted:true,approachDistance:0,currentFare:{passenger:'Elena',pickupId:'municipio',destinationId:'post'},randomState:42,notice:'Old: Guaranteed €0.01'};
   mutate(value.mission);return JSON.stringify(value);};
 let data=decodeSave(context,legacy(()=>{}));assert.equal(data.version,2);
 const pending=new Mission();pending.restore(data.mission);
 assert.equal(pending.freeDriving,true);assert.equal(pending.fareBoard.length,1);assert.equal(pending.fareBoard[0].passenger,'Elena');assert.doesNotMatch(pending.notice,/€0.01/);
 assert.equal(pending.requestFares(context.spawn),true);assert.equal(pending.fareBoard.length,1,'The migrated offer is not rerolled');
 data=decodeSave(context,legacy(m=>{m.offerPending=false;}));const accepted=new Mission();accepted.restore(data.mission);
 assert.equal(accepted.passenger,'Elena');assert.equal(accepted.target!.name,'Municipio di Cerea');assert.equal(accepted.fareBoard.length,0);
 assert.throws(()=>decodeSave(context,legacy(m=>{m.offerPending='yes';})));
});
test('invalid or incompatible saves are rejected without changing the current shift',()=>{
 const mission=new Mission({seed:75});mission.requestFares(context.spawn);const before=mission.snapshot();
 for(const mutate of [
   (s:SaveData)=>{s.version=3 as 2;},(s:SaveData)=>{s.map='old-map';},(s:SaveData)=>{s.car.x=Infinity;},
   (s:SaveData)=>{s.mission.fareBoard[0].destinationId='missing';},(s:SaveData)=>{s.mission.totalElapsed=Infinity;},
   (s:SaveData)=>{s.mission.earningsCents=100;},(s:SaveData)=>{s.atlas.source='gps' as 'estimate';},
   (s:SaveData)=>{s.mission.fareBoard[1].id=s.mission.fareBoard[0].id;},(s:SaveData)=>{s.mission.fareBoard[0].id=s.mission.boardSerial;},
   (s:SaveData)=>{s.mission.currentFare={passenger:'Elena',pickupId:'municipio',destinationId:'post'};},
   (s:SaveData)=>{s.mission.boarding=2;},(s:SaveData)=>{s.mission.fareBoard.push(...s.mission.fareBoard.map(o=>({...o,id:o.id+100})));},
 ]){const data=saved(mission);mutate(data);assert.throws(()=>decodeSave(context,JSON.stringify(data)));assert.deepEqual(mission.snapshot(),before);}
 const invalid=saved(mission).mission;invalid.receipts=[{} as never];assert.throws(()=>mission.restore(invalid));assert.deepEqual(mission.snapshot(),before);
});
test('hamlet fares have a worthwhile guarantee in both directions, independently of the speed bonus',()=>{
 const rural=new District(outskirts),{shortestRoute}=createNavigation(rural),taxi=rural.district.taxi!;
 const city=taxi.stops.find(s=>s.id==='municipio')!,hamlet=taxi.stops.find(s=>s.id==='test-hamlet')!;
 for(const [a,b] of [[city,hamlet],[hamlet,city]]){
   const distance=shortestRoute(a.nodeId,b.nodeId).cost;
   const pay=guaranteedFare(taxi.baseCents,taxi.perKmCents,distance);
   // At a modest 8 m/s with 60 seconds of service/navigation, guarantee alone
   // beats €6 per active minute; positioning and return still merit playtesting.
   assert.ok(pay/100/((distance/8+60)/60)>6,`${distance} metres, €${pay/100}`);
 }
 assert.equal(guaranteedFare(400,120,500),460,'Short city trips retain their existing guaranteed fare');
});
test('long collection compensation is quoted when listed, retained after acceptance and save/load, and pays only on delivery',()=>{
 const rural=new District(outskirts),{Mission}=createMission(rural),mission=new Mission({seed:1771});
 mission.requestFares(rural.spawn);const offer=mission.fareBoard[0];assert.equal(offer.pickupId,'test-hamlet');
 const rideOnly=guaranteedFare(rural.district.taxi!.baseCents,rural.district.taxi!.perKmCents,createNavigation(rural).shortestRoute(rural.district.taxi!.stops.find(s=>s.id==='test-hamlet')!.nodeId,rural.district.taxi!.stops.find(s=>s.id===offer.destinationId)!.nodeId).cost);
 const quote=mission.offerGuaranteeCents(offer);assert.ok(quote>rideOnly+2500);
 mission.requestFares({x:100000,z:100000});assert.equal(mission.offerGuaranteeCents(mission.fareBoard[0]),quote,'Reopening elsewhere keeps the quote');
 mission.acceptFare(offer.id);assert.equal(mission.baseFareCents,quote);assert.equal(mission.earningsCents,0);mission.serveAtStop(mission.target!.bay,true);
 const restored=new Mission();restored.restore(mission.snapshot());assert.equal(restored.baseFareCents,quote);
 restored.update(900,restored.target!.bay,false);restored.serveAtStop(restored.target!.bay,true);
 assert.equal(restored.receipts[0].baseCents,quote);assert.equal(restored.receipts[0].bonusCents,0);
});
test('radio notices never carry a stale price; the post-dropoff notice keeps the payout and offers nothing',()=>{
 const rural=new District(outskirts),{Mission}=createMission(rural),hamlet=rural.parkingZones.find(b=>b.id==='test-hamlet')!;
 for(const seed of [1,2,3]){
  const mission=new Mission({seed});assert.doesNotMatch(mission.notice,/€/);assert.match(mission.notice,/Free driving/);
  mission.requestFares(hamlet);assert.doesNotMatch(mission.notice,/Guaranteed/);
  for(const offer of mission.fareBoard)assert.match(mission.offerText(offer),new RegExp(`Guaranteed €${(mission.offerGuaranteeCents(offer)/100).toFixed(2)}`));
  mission.acceptFare(mission.fareBoard[0].id);mission.serveAtStop(mission.target!.bay,true);mission.update(BOARDING_SECONDS,mission.target!.bay,true);mission.serveAtStop(mission.target!.bay,true);
  assert.match(mission.notice,/Thank you.*Fare €/);assert.match(mission.notice,/Free driving/);assert.doesNotMatch(mission.notice,/Guaranteed/);
  assert.equal(mission.fareBoard.length,0);
 }
});
test('a migrated unquoted 0.8 offer withholds its price until it is quoted from a full stop',()=>{
 const rural=new District(outskirts),{Mission}=createMission(rural),probe=new Mission({seed:683129967});
 probe.requestFares(rural.spawn);const first=probe.fareBoard[0];assert.equal(probe.offerGuaranteeCents(first),7222,'Review fixture: long collection supplement from the start');
 const legacy=migrateSnapshot({...probe.snapshot(),offerPending:true,offerQuoted:false,approachDistance:0,currentFare:{passenger:first.passenger,pickupId:first.pickupId,destinationId:first.destinationId},notice:'Old startup dispatch: Guaranteed €40.80'});
 const restored=new Mission();restored.restore(legacy);
 for(const text of [restored.offerText(restored.fareBoard[0]),restored.objective,restored.notice])assert.doesNotMatch(text,/Guaranteed|€/);
 assert.equal(restored.acceptFare(restored.fareBoard[0].id),false,'An unquoted fare cannot be accepted');
 restored.requestFares(rural.spawn);assert.equal(restored.offerGuaranteeCents(restored.fareBoard[0]),7222);assert.match(restored.offerText(restored.fareBoard[0]),/Guaranteed €72.22/);
 restored.requestFares({x:100000,z:100000});assert.equal(restored.offerGuaranteeCents(restored.fareBoard[0]),7222);
});
test('only B and Backspace decline in menus; handbrake and atlas erasing remain separate',()=>{
 const target=new EventTarget();Object.defineProperty(globalThis,'window',{value:target,configurable:true});
 const buttons=Array.from({length:17},()=>({value:0}));
 Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>[{connected:true,mapping:'standard',axes:[0,0,0,0],buttons}]},configurable:true});
 const input=new Input(structuredClone(defaultBindings));input.context='menu';
 const tap=(code:string)=>{for(const type of ['keydown','keyup']){const event=new Event(type);Object.defineProperty(event,'code',{value:code});target.dispatchEvent(event);}};
 buttons[2].value=1;let actions=input.poll();assert.equal(actions.handbrake,true);assert.equal(actions.declineOffer,false);
 buttons[2].value=0;input.poll();tap('Delete');actions=input.poll();assert.equal(actions.clearMarker,true);assert.equal(actions.declineOffer,false);
 buttons[1].value=1;assert.equal(input.poll().declineOffer,true);assert.equal(input.poll().declineOffer,false);buttons[1].value=0;input.poll();
 tap('Backspace');assert.equal(input.poll().declineOffer,true);assert.equal(input.poll().declineOffer,false);
 input.context='atlas';buttons[2].value=1;actions=input.poll();assert.equal(actions.clearMarker,true);assert.equal(actions.declineOffer,false);
 input.context='driving';buttons[1].value=1;input.poll();input.context='menu';assert.equal(input.poll().declineOffer,false,'Holding the gear button as an offer opens is not a new decline');
 buttons[1].value=0;input.poll();buttons[1].value=1;assert.equal(input.poll().declineOffer,true);
});
test('no figure waits at stops; an accepted, stopped pickup walks one passenger from the kerb into the seat',()=>{
 const mission=new Mission({seed:75}),scene=new THREE.Scene(),presence=new PassengerPresence(context,scene),frame=new LocalFrame(context.spawn);
 const people=()=>scene.children.filter(o=>o.name.startsWith('Passenger'));
 const update=(car:{x:number;z:number;heading:number})=>presence.update(mission,frame,car);
 update({...context.spawn});assert.equal(people().length,0,'Free driving shows no taxi-stop figures');
 mission.requestFares(context.spawn);update({...context.spawn});assert.equal(people().length,0,'Listed fares never show a customer');
 mission.acceptFare(mission.fareBoard[0].id);const bay=mission.target!.bay,car={x:bay.x,z:bay.z,heading:context.spawn.heading};
 update(car);assert.equal(people().length,0,'An accepted customer appears only after stopped service');
 assert.equal(mission.serveAtStop(bay,true),true);
 const world=()=>{const figure=people()[0];return frame.toWorld({x:figure.position.x,z:figure.position.z});};
 const door=carPoint(car,DOOR.x,DOOR.z);let previous=Infinity;
 for(const t of [0,1,2,3]){
   mission.update(t?1:0,bay,true);update(car);assert.equal(people().length,1);assert.equal(mission.seatedIdentity,'');
   const p=world(),gap=Math.hypot(p.x-door.x,p.z-door.z);assert.ok(gap<previous||gap<.05,'The passenger approaches the door');previous=gap;
   assert.ok(Math.hypot(p.x-car.x,p.z-car.z)<18,'Arrival is local, never a distant beacon');
   assert.equal(context.buildings.at(p,.2).some(b=>inRect(p,b,-.2)),false);
 }
 // Render-origin changes and a reload mid-walk keep one figure in the same world place.
 const before=world();frame.rebase({x:car.x+3000,z:car.z});update(car);assert.equal(people().length,1);
 assert.ok(Math.hypot(world().x-before.x,world().z-before.z)<1e-6);
 const restored=new Mission();restored.restore(mission.snapshot());const reloaded=new THREE.Scene();new PassengerPresence(context,reloaded).update(restored,frame,car);
 assert.equal(reloaded.children.filter(o=>o.name.startsWith('Passenger')).length,1);
 mission.update(3,bay,true);update(car);assert.equal(mission.boarding,0);assert.equal(people().length,0,'Seated passengers leave no outside figure');
 assert.equal(mission.seatedIdentity,mission.passengerIdentity);
 const seated=createPerson(mission.passengerIdentity,true),bounds=new THREE.Box3().setFromObject(seated);assert.ok(bounds.max.y-bounds.min.y>.9);
 // Dropoff: the seat clears and the passenger walks away, then is gone; loading drops the walk.
 const destination=mission.target!.bay,there={x:destination.x,z:destination.z,heading:1};
 assert.equal(mission.serveAtStop(destination,true),true);assert.equal(mission.seatedIdentity,'');update(there);assert.equal(people().length,1);
 const exit=world();mission.update(DEPARTURE_SECONDS*.8,destination,true);update({...there,x:there.x+20});
 assert.ok(Math.hypot(world().x-there.x,world().z-there.z)>Math.hypot(exit.x-there.x,exit.z-there.z),'The passenger walks away from where the taxi stopped');
 const after=new Mission();after.restore(mission.snapshot());const resumed=new THREE.Scene();new PassengerPresence(context,resumed).update(after,frame,there);
 assert.equal(resumed.children.filter(o=>o.name.startsWith('Passenger')).length,0);
 mission.update(1,destination,true);update(there);assert.equal(people().length,0);
 // Restarting mid-boarding removes the walking figure.
 take(mission);mission.serveAtStop(mission.target!.bay,true);update(car);assert.equal(people().length,1);mission.reset();update(car);assert.equal(people().length,0);
});
test('every stop has an off-street arrival point and a clear walk that never crosses buildings or the taxi body',()=>{
 for(const data of [cerea,outskirts]){
  const district=new District(data);
  for(const stop of district.district.taxi!.stops){
   const bay=district.parkingZones.find(b=>b.id===stop.bayId)!;
   for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2]){
    const car={x:bay.x,z:bay.z,heading},origin=kerbOrigin(district,district.buildings,stop.id,car),path=walkToDoor(car,origin);
    assert.ok(Math.hypot(origin.x-bay.x,origin.z-bay.z)<20,stop.id);
    assert.equal(clearPath(district.buildings,path),true,`${stop.id} at ${heading}`);
    for(let i=0;i<path.length-1;i++)for(let j=0;j<=20;j++){
     const p={x:path[i].x+(path[i+1].x-path[i].x)*j/20,z:path[i].z+(path[i+1].z-path[i].z)*j/20};
     const c=Math.cos(heading),s=Math.sin(heading),lx=(p.x-car.x)*c+(p.z-car.z)*s,lz=-(p.x-car.x)*s+(p.z-car.z)*c;
     assert.equal(lx>-.9&&lx<1.5&&lz>-2.75&&lz<2.1,false,`${stop.id}: walk crosses the taxi body`);
    }
   }
  }
 }
});
test('walks stay clear of buildings from off-centre parking positions, choosing the clear side of the taxi',()=>{
 // Regression: the detour corner used to push the first leg through OSM building 194101723 at Teatro.
 const teatro=context.district.taxi!.stops.find(s=>s.id==='teatro')!,off={x:38.53,z:-362.08,heading:0};
 assert.ok(teatro);
 assert.equal(clearPath(context.buildings,walkToDoor(off,kerbOrigin(context,context.buildings,'teatro',off),context.buildings)),true,'Teatro off-centre');
 // Regression: the opposite-end detour used to cut across the cabin at Cinema Principe.
 const principe={x:-46.4,z:114.99,heading:0},route=walkToDoor(principe,kerbOrigin(context,context.buildings,'principe',principe),context.buildings);
 assert.equal(crossesTaxi(principe,route),false,'Principe walk avoids the taxi');assert.equal(clearPath(context.buildings,route),true,'Principe walk avoids buildings');
 for(const data of [cerea,outskirts]){
  const district=new District(data),inside=(p:{x:number;z:number},margin:number)=>district.buildings.at(p,margin).some(r=>inRect(p,r,-margin));
  for(const stop of district.district.taxi!.stops){
   const bay=district.parkingZones.find(b=>b.id===stop.bayId)!;
   for(let dx=-bay.width/2+1.5;dx<=bay.width/2-1.5;dx+=1.5)for(let dz=-bay.depth/2+1.5;dz<=bay.depth/2-1.5;dz+=1.5)for(let k=0;k<12;k++){
    const heading=k*Math.PI/6,car={x:bay.x+dx,z:bay.z+dz,heading},door=carPoint(car,DOOR.x,DOOR.z);
    // A door pressed against a wall (or a car overlapping one) has no clear walk to its own door.
    if(inside(door,.35)||[[-1.55,-3.4],[1.95,-3.4],[-1.55,2.8],[1.95,2.8]].some(([x,z])=>inside(carPoint(car,x,z),0)))continue;
    const path=walkToDoor(car,kerbOrigin(district,district.buildings,stop.id,car),district.buildings);
    assert.equal(clearPath(district.buildings,path),true,`${stop.id} at ${dx},${dz},${heading}`);
    assert.equal(crossesTaxi(car,path),false,`${stop.id}: walk crosses the taxi at ${dx},${dz},${heading}`);
   }
  }
 }
});
test('remapped L3/key gear controls keep their edges and never change atlas/menu bindings',()=>{
 const target=new EventTarget();Object.defineProperty(globalThis,'window',{value:target,configurable:true});
 const buttons=Array.from({length:17},()=>({value:0}));
 Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>[{connected:true,mapping:'standard',axes:[0,0,0,0],buttons}]},configurable:true});
 const bindings=structuredClone(defaultBindings);bindings.shiftGear={keys:['KeyG'],button:10};const input=new Input(bindings);
 input.poll();assert.equal(input.drivingReleased,true);
 assert.equal(bindingConflict(bindings,'shiftGear','KeyW'),'throttle');
 buttons[1].value=1;assert.equal(input.poll().shiftGear,false);buttons[1].value=0;buttons[10].value=1;
 assert.equal(input.poll().shiftGear,true);assert.equal(input.poll().shiftGear,false);buttons[10].value=0;input.poll();
 const tap=(code:string)=>{for(const type of ['keydown','keyup']){const e=new Event(type);Object.defineProperty(e,'code',{value:code});target.dispatchEvent(e);}};
 tap('KeyR');assert.equal(input.poll().shiftGear,false);tap('KeyG');assert.equal(input.poll().shiftGear,true);
 input.context='atlas';buttons[1].value=1;const close=input.poll();assert.equal(close.back,true);
 input.context='menu';buttons[1].value=0;input.poll();buttons[0].value=1;assert.equal(input.poll().interact,true);
 Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>JSON.stringify(bindings)},configurable:true});assert.deepEqual(readBindings(),bindings);
 bindings.shiftGear.button=7;assert.deepEqual(readBindings(),defaultBindings,'Stored binding conflicts fall back to defaults');
});
test('Request fares follows its remapped key/button, only while driving, and never leaks across screens',()=>{
 const target=new EventTarget();Object.defineProperty(globalThis,'window',{value:target,configurable:true});
 const buttons=Array.from({length:17},()=>({value:0}));
 Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>[{connected:true,mapping:'standard',axes:[0,0,0,0],buttons}]},configurable:true});
 const tap=(code:string)=>{for(const type of ['keydown','keyup']){const e=new Event(type);Object.defineProperty(e,'code',{value:code});target.dispatchEvent(e);}};
 assert.equal(bindingLabel(defaultBindings,'requestFares'),'O');assert.equal(bindingLabel(defaultBindings,'requestFares',true),'D-pad down');
 const bindings=structuredClone(defaultBindings);bindings.requestFares={keys:['KeyH'],button:14};const input=new Input(bindings);
 tap('KeyO');assert.equal(input.poll().requestFares,false,'The old default key no longer requests fares');
 tap('KeyH');assert.equal(input.poll().requestFares,true);assert.equal(input.poll().requestFares,false);
 buttons[13].value=1;assert.equal(input.poll().requestFares,false);buttons[13].value=0;
 buttons[14].value=1;assert.equal(input.poll().requestFares,true);assert.equal(input.poll().requestFares,false,'Holding does not repeat');
 // Held across the switch to the list, then back to driving: no new edges either way.
 input.context='menu';let actions=input.poll();assert.equal(actions.requestFares,false);assert.equal(actions.refreshFares,false);
 input.context='driving';assert.equal(input.poll().requestFares,false);buttons[14].value=0;input.poll();
 input.context='menu';tap('KeyH');assert.equal(input.poll().requestFares,false,'The list ignores the driving binding');
 buttons[3].value=1;actions=input.poll();assert.equal(actions.refreshFares,true);assert.equal(input.menuHeld,true);
 input.context='driving';actions=input.poll();assert.equal(actions.refreshFares,false);assert.equal(actions.atlas,false,'Y held from the list does not open the atlas');buttons[3].value=0;input.poll();
 input.context='menu';buttons[0].value=1;input.poll();assert.equal(input.menuHeld,true);buttons[0].value=0;input.poll();assert.equal(input.menuHeld,false);
 tap('KeyN');assert.equal(input.poll().refreshFares,true);
 input.context='atlas';tap('KeyH');assert.equal(input.poll().requestFares,false,'The atlas keeps its own controls');
 // Conflicts, saved bindings, restore defaults and 0.8 profiles without the new action.
 assert.equal(bindingConflict(bindings,'requestFares','KeyF'),'information');assert.equal(bindingConflict(bindings,'requestFares',12),'reminder');
 assert.equal(bindingConflict(defaultBindings,'shiftGear',13),'requestFares');
 let stored=JSON.stringify(bindings);Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>stored},configurable:true});
 assert.deepEqual(readBindings(),bindings);
 const old=structuredClone(defaultBindings) as Partial<typeof defaultBindings>;delete old.requestFares;delete old.radioNext;old.shiftGear={keys:['KeyO'],button:10};stored=JSON.stringify(old);
 const migrated=readBindings();assert.deepEqual(migrated.shiftGear,{keys:['KeyO'],button:10},'0.8 choices survive');
 assert.deepEqual(migrated.requestFares,{keys:['KeyH'],button:13},'Request fares gets a free key');
 bindings.requestFares.button=7;stored=JSON.stringify(bindings);assert.deepEqual(readBindings(),defaultBindings,'Stored conflicts fall back to defaults');
 bindings.requestFares.button=9;stored=JSON.stringify(bindings);assert.deepEqual(readBindings(),defaultBindings,'Start stays reserved');
 // Regression: a 0.8 profile already using O, H, V, X, B and N must keep every choice.
 const busy=structuredClone(defaultBindings) as Partial<typeof defaultBindings>;delete busy.requestFares;delete busy.radioNext;
 busy.shiftGear!.keys=['KeyO'];busy.atlas!.keys=['KeyH'];busy.information!.keys=['KeyV'];busy.resetLook!.keys=['KeyX'];busy.glanceLeft!.keys=['KeyB'];busy.glanceRight!.keys=['KeyN'];
 stored=JSON.stringify(busy);const kept=readBindings();
 for(const action of ['shiftGear','atlas','information','resetLook','glanceLeft','glanceRight'] as const)assert.deepEqual(kept[action],busy[action],`${action} survives the upgrade`);
 assert.deepEqual(kept.requestFares,{keys:['KeyC'],button:13},'Request fares takes the next free key');
 assert.deepEqual(kept.radioNext,{keys:['KeyE'],button:15},'The radio then takes the following free key');
 assert.notDeepEqual(kept,defaultBindings);
});
test('0.9 profiles with many custom controls gain the radio control without losing any choice',()=>{
 let stored='';Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>stored},configurable:true});
 // Every letter the radio might prefer is taken, as is its D-pad right default.
 const custom=structuredClone(defaultBindings) as Partial<typeof defaultBindings>;delete custom.radioNext;
 Object.assign(custom,{steerLeft:{keys:['KeyJ'],button:null},steerRight:{keys:['KeyL'],button:null},throttle:{keys:['KeyI'],button:7},brake:{keys:['KeyK'],button:6},
  handbrake:{keys:['KeyV'],button:2},shiftGear:{keys:['KeyH'],button:15},interact:{keys:['KeyX'],button:0},atlas:{keys:['KeyB'],button:3},information:{keys:['KeyN'],button:8},
  requestFares:{keys:['KeyC'],button:13},reminder:{keys:['KeyD','KeyE'],button:12},resetLook:{keys:['KeyF'],button:11},glanceLeft:{keys:['KeyG'],button:4},glanceRight:{keys:['KeyU'],button:5}});
 stored=JSON.stringify(custom);const kept=readBindings();
 for(const action of Object.keys(custom) as (keyof typeof custom)[])assert.deepEqual(kept[action],custom[action],`${action} survives the upgrade`);
 assert.deepEqual(kept.radioNext,{keys:['KeyM'],button:14},'A free key and button are chosen');
 assert.equal(bindingConflict(kept,'radioNext','KeyM'),undefined);assert.equal(bindingConflict(kept,'radioNext',14),undefined);
 // A 0.8 profile gains both later actions with distinct free choices.
 const old=structuredClone(custom);delete old.requestFares;stored=JSON.stringify(old);const both=readBindings();
 assert.deepEqual(both.requestFares,{keys:['KeyO'],button:13});assert.deepEqual(both.radioNext,{keys:['KeyC'],button:14},'C is free once Request fares has O');
 // Saved radio remaps round-trip; a conflicting one still falls back to defaults rather than guessing.
 const remapped={...kept,radioNext:{keys:['Digit1'],button:10}};stored=JSON.stringify(remapped);assert.deepEqual(readBindings(),remapped);
 stored=JSON.stringify({...kept,radioNext:{keys:['KeyM'],button:13}});assert.deepEqual(readBindings(),defaultBindings);
 stored='[]';assert.deepEqual(readBindings(),defaultBindings);
});
test('the radio control is a driving-only edge that never leaks into the atlas or menus',()=>{
 const target=new EventTarget();Object.defineProperty(globalThis,'window',{value:target,configurable:true});
 const buttons=Array.from({length:17},()=>({value:0}));
 Object.defineProperty(globalThis,'navigator',{value:{getGamepads:()=>[{connected:true,mapping:'standard',axes:[0,0,0,0],buttons}]},configurable:true});
 const tap=(code:string)=>{for(const type of ['keydown','keyup']){const e=new Event(type);Object.defineProperty(e,'code',{value:code});target.dispatchEvent(e);}};
 const input=new Input(structuredClone(defaultBindings));
 assert.equal(bindingLabel(defaultBindings,'radioNext'),'V');assert.equal(bindingLabel(defaultBindings,'radioNext',true),'D-pad right');
 tap('KeyV');assert.equal(input.poll().radioNext,true);assert.equal(input.poll().radioNext,false);
 buttons[15].value=1;assert.equal(input.poll().radioNext,true);assert.equal(input.poll().radioNext,false,'Holding does not repeat');
 input.context='atlas';buttons[15].value=0;input.poll();buttons[15].value=1;const atlas=input.poll();
 assert.equal(atlas.radioNext,false);assert.equal(atlas.atlasMoveX,1,'D-pad right still moves the atlas crosshair');
 buttons[15].value=0;input.poll();tap('KeyV');assert.equal(input.poll().radioNext,false);
 input.context='menu';tap('KeyV');buttons[15].value=1;assert.equal(input.poll().radioNext,false);
 input.context='driving';assert.equal(input.poll().radioNext,false,'A press held from a menu is not a new edge');buttons[15].value=0;input.poll();
 assert.equal(bindingConflict(defaultBindings,'requestFares',15),'radioNext');
});
