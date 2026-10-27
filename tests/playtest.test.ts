import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import cerea from '../public/maps/cerea.json';
import outskirts from '../public/maps/cerea-outskirts/manifest.json';
import {District} from '../src/world/district';
import {createMission,guaranteedFare} from '../src/mission/Mission';
import {createNavigation} from '../src/navigation/Navigation';
import {createAtlasNotes} from '../src/navigation/AtlasNotes';
import {decodeSave,mapSignature,type SaveData} from '../src/game/Save';
import {PassengerPresence,createPerson} from '../src/world/People';
import {LocalFrame} from '../src/world/LocalFrame';
import {defaultBindings,readBindings,bindingConflict} from '../src/input/Bindings';
import {Input} from '../src/input/Input';

const context=new District(cerea),{Mission}=createMission(context);
test('new shifts vary reachable distinct pickup/destination pairs; seeded shifts reproduce the sequence',()=>{
 const nav=createNavigation(context),pairs=new Set<string>(),pickups=new Set<string>();
 for(let seed=0;seed<80;seed++){
   const mission=new Mission({seed:seed*1833});
   assert.equal(mission.offerPending,true);assert.notEqual(mission.pickupStop!.id,mission.destinationStop!.id);
   assert.ok(Number.isFinite(nav.shortestRoute(mission.pickupStop!.nodeId,mission.destinationStop!.nodeId).cost));
   pairs.add(`${mission.pickupStop!.id}/${mission.destinationStop!.id}`);pickups.add(mission.pickupStop!.id);
 }
 assert.ok(pairs.size>30);assert.equal(pickups.size,9);
 const a=new Mission({seed:72}),b=new Mission({seed:72});
 for(let i=0;i<15;i++){assert.equal(a.offerText,b.offerText);const before=a.offerText;a.declineOffer();b.declineOffer();assert.notEqual(a.offerText,before);}
});
test('an offer must be accepted, declining cannot board or earn, and both service steps still require a full stop',()=>{
 const mission=new Mission({seed:75});const pickup=mission.target.bay;
 assert.equal(mission.serveAtStop(pickup,true),false);assert.equal(mission.declineOffer(),true);
 assert.equal(mission.earningsCents,0);assert.equal(mission.completedFares,0);assert.equal(mission.taxiStage,'pickup');
 assert.equal(mission.acceptOffer(),true);assert.equal(mission.declineOffer(),false);
 assert.equal(mission.serveAtStop(mission.target.bay,false),false);
 const guarantee=mission.baseFareCents;
 assert.equal(mission.serveAtStop(mission.target.bay,true),true);assert.equal(mission.unfinishedPassenger,true);
 mission.update(600,mission.target.bay,true);assert.equal(mission.completedFares,0);
 assert.equal(mission.serveAtStop(mission.target.bay,true),true);assert.equal(mission.receipts[0].baseCents,guarantee);
 assert.equal(mission.receipts[0].bonusCents,0);assert.equal(mission.offerPending,true);
});
function saved(mission=new Mission({seed:75})):SaveData{
 const {AtlasNotes}=createAtlasNotes(context),notes=new AtlasNotes();notes.pointAt({x:40,z:40});notes.place();
 return {version:1,district:context.district.id,map:mapSignature(context),savedAt:new Date().toISOString(),
   car:{x:context.spawn.x,z:context.spawn.z,heading:context.spawn.heading,speed:0,gear:'R',steering:0,collisions:3},
   unsafeStops:2,mission:mission.snapshot(),atlas:notes.snapshot()};
}
test('save/load preserves pending offers, accepted rides, receipts, timers, atlas estimates and the next dispatch',()=>{
 for(const stage of ['offer','accepted','aboard','completed']){
   const mission=new Mission({seed:75});if(stage!=='offer')mission.acceptOffer();
   if(stage==='aboard'||stage==='completed'){mission.serveAtStop(mission.target.bay,true);mission.update(24,mission.target.bay,false);}
   if(stage==='completed')mission.serveAtStop(mission.target.bay,true);
   const data=decodeSave(context,JSON.stringify(saved(mission))),restored=new Mission({seed:983});restored.restore(data.mission);
   assert.deepEqual(restored.snapshot(),mission.snapshot());assert.equal(data.atlas.source,'estimate');assert.deepEqual(data.atlas.marker,{x:40,z:40});
   if(mission.offerPending){mission.declineOffer();restored.declineOffer();assert.equal(restored.offerText,mission.offerText);}
 }
});
test('invalid or incompatible saves are rejected without changing the current shift',()=>{
 const mission=new Mission({seed:75}),before=mission.snapshot();
 for(const mutate of [
   (s:SaveData)=>{s.version=2 as 1;},(s:SaveData)=>{s.map='old-map';},(s:SaveData)=>{s.car.x=Infinity;},
   (s:SaveData)=>{s.mission.currentFare!.destinationId='missing';},(s:SaveData)=>{s.mission.totalElapsed=Infinity;},
   (s:SaveData)=>{s.mission.earningsCents=100;},(s:SaveData)=>{s.atlas.source='gps' as 'estimate';},
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
test('long collection compensation is quoted once, retained after acceptance and save/load, and pays only on delivery',()=>{
 const rural=new District(outskirts),{Mission}=createMission(rural),mission=new Mission({seed:1771});
 assert.equal(mission.pickupStop!.id,'test-hamlet');
 const rideOnly=mission.baseFareCents;mission.quoteOffer(rural.spawn);const quote=mission.baseFareCents;
 assert.ok(quote>rideOnly+2500);mission.quoteOffer({x:100000,z:100000});assert.equal(mission.baseFareCents,quote);
 mission.acceptOffer();assert.equal(mission.earningsCents,0);mission.serveAtStop(mission.target.bay,true);
 const restored=new Mission();restored.restore(mission.snapshot());assert.equal(restored.baseFareCents,quote);
 restored.update(900,restored.target.bay,false);restored.serveAtStop(restored.target.bay,true);
 assert.equal(restored.receipts[0].baseCents,quote);assert.equal(restored.receipts[0].bonusCents,0);
});
test('initial, declined and post-dropoff radio notices match the fixed quoted guarantee, including restored rc.1 saves',()=>{
 const rural=new District(outskirts),{Mission}=createMission(rural),hamlet=rural.parkingZones.find(b=>b.id==='test-hamlet')!;
 for(const seed of [1,2,3]){
  const mission=new Mission({seed});
  const check=()=>assert.ok(mission.notice.includes(mission.offerText),mission.notice);
  mission.quoteOffer(hamlet);check();
  mission.declineOffer();mission.quoteOffer(hamlet);check();
  const value=mission.snapshot();value.notice='Old dispatch: Guaranteed €0.01';
  const restored=new Mission();restored.restore(value);assert.ok(restored.notice.includes(restored.offerText));assert.doesNotMatch(restored.notice,/€0.01/);
  mission.acceptOffer();mission.serveAtStop(mission.target.bay,true);mission.serveAtStop(mission.target.bay,true);
  mission.quoteOffer(hamlet);check();assert.match(mission.notice,/Thank you.*Fare €/,'Quoting the next offer must retain the completed payout');
 }
});
test('unquoted startup and restored offers never advertise an incomplete guarantee',()=>{
 const rural=new District(outskirts),{Mission}=createMission(rural),mission=new Mission({seed:683129967});
 assert.equal(mission.baseFareCents,4080,'Review fixture has a long collection supplement that is not quoted yet');
 for(const text of [mission.offerText,mission.objective,mission.notice]){assert.doesNotMatch(text,/Guaranteed|€/);assert.match(text,/Stop to receive a fare quote/);}
 const value=mission.snapshot();value.notice='Old startup dispatch: Guaranteed €40.80';
 const restored=new Mission();restored.restore(value);assert.doesNotMatch(restored.notice,/Guaranteed|€/);
 restored.quoteOffer(rural.spawn);assert.equal(restored.baseFareCents,7222);assert.match(restored.offerText,/Guaranteed €72.22/);assert.ok(restored.notice.includes(restored.offerText));
 restored.declineOffer();assert.doesNotMatch(restored.offerText,/Guaranteed|€/);assert.doesNotMatch(restored.notice,/Guaranteed/);
 restored.quoteOffer(rural.spawn);const quote=restored.baseFareCents;restored.quoteOffer({x:100000,z:100000});assert.equal(restored.baseFareCents,quote);
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
test('passenger visibility follows boarding/dropoff independently of visual tile reloads or render-origin changes',()=>{
 const mission=new Mission({seed:75}),scene=new THREE.Scene(),presence=new PassengerPresence(context,scene),frame=new LocalFrame(context.spawn);
 const waiting=scene.getObjectByName(`Waiting at ${mission.pickupStop!.id}`)!;
 presence.update(mission,frame,context.spawn);assert.equal(waiting.visible,true);
 mission.acceptOffer();mission.serveAtStop(mission.target.bay,true);presence.update(mission,frame,context.spawn);assert.equal(waiting.visible,false);
 frame.rebase({x:2500,z:2500});presence.update(mission,frame,context.spawn);assert.equal(waiting.visible,false);
 const restored=new Mission();restored.restore(mission.snapshot());presence.update(restored,frame,context.spawn);assert.equal(waiting.visible,false);
 const seated=createPerson(mission.pickupStop!.id,true),bounds=new THREE.Box3().setFromObject(seated);assert.ok(bounds.max.y-bounds.min.y>.9);
 mission.serveAtStop(mission.target.bay,true);presence.update(mission,frame,context.spawn);assert.equal(waiting.visible,true);
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
