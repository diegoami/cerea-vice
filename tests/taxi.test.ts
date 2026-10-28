import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import cerea from '../public/maps/cerea.json';
import harbor from '../public/maps/harbor.json';
import { inRect } from "../src/world/district";
import { createMission } from "../src/mission/Mission";
import { createNavigation } from "../src/navigation/Navigation";
import { District } from "../src/world/district";
import contextHarbor from "../public/maps/harbor.json";
let context=new District(contextHarbor);
let {district,parkingZones,spawn,roads}=context;
let {Mission}=createMission(context);
let {shortestRoute,directionHint}=createNavigation(context);
function useDistrict(data:unknown){context=new District(data);({district,parkingZones,spawn,roads}=context);({Mission}=createMission(context));({shortestRoute,directionHint}=createNavigation(context));}
afterEach(()=>useDistrict(harbor));
type Shift=InstanceType<typeof Mission>;
/** Request the list and accept its first entry, as a player would from a full stop. */
function take(shift:Shift,position=spawn){assert.equal(shift.requestFares(position),true);assert.equal(shift.acceptFare(shift.fareBoard[0].id),true);}
/** Service, then let the passenger walk over and sit down. */
function board(shift:Shift){assert.equal(shift.serveAtStop(shift.target!.bay,true),true);shift.update(5.5,shift.target!.bay,true);assert.equal(shift.boarding,0);}
test('expanded real district has nine reachable taxi goals and clear pickup areas',()=>{
  useDistrict(cerea);
  assert.ok(new Set(roads.map(road=>road.name)).size>=45);
  assert.ok(district.taxi!.stops.length>=9);
  for(const a of district.taxi!.stops){
    const bay=parkingZones.find(bay=>bay.id===a.bayId)!;
    assert.equal(district.buildings.some(building=>inRect(bay,building,-1.05)),false,a.name);
    for(const b of district.taxi!.stops)assert.ok(Number.isFinite(shortestRoute(a.nodeId,b.nodeId).cost),`${a.name} → ${b.name}`);
  }
});
test('passengers need deliberate stopped pickup and dropoff; each fare gives a new target',()=>{
  useDistrict(cerea);const shift=new Mission({authored:true});
  assert.equal(shift.target,undefined,'A shift starts with free driving');assert.equal(shift.serveAtStop(spawn,true),false);
  take(shift);
  assert.equal(shift.passenger,'Elena');assert.equal(shift.target!.name,'Municipio di Cerea');
  shift.update(1,spawn,true);assert.equal(shift.taxiStage,'pickup');
  assert.equal(shift.serveAtStop(spawn,false),false);
  assert.equal(shift.serveAtStop({x:-300,z:300},true),false);
  assert.equal(shift.serveAtStop(spawn,true),true);
  assert.equal(shift.taxiStage,'dropoff');assert.equal(shift.target!.name,'Ufficio Postale di Cerea');assert.equal(shift.earningsCents,0);
  assert.equal(shift.seatedIdentity,'','The seat stays empty while the passenger walks over');
  shift.update(5.5,spawn,true);assert.notEqual(shift.seatedIdentity,'');
  assert.equal(shift.serveAtStop(spawn,true),false);
  assert.match(directionHint(shift.target!.bay,0,shift.target),/Ufficio Postale di Cerea is beside you/);
  shift.update(30,shift.target!.bay,true);
  assert.equal(shift.completedFares,0,'Stopping alone cannot collect the fare');
  assert.equal(shift.serveAtStop(shift.target!.bay,true),true);
  assert.equal(shift.completedFares,1);assert.ok(shift.earningsCents>400);
  assert.equal(shift.target,undefined,'Dropoff returns to free driving');assert.equal(shift.fareBoard.length,0,'No automatic offer after dropoff');
  assert.match(shift.notice,/Fare €/);assert.match(shift.notice,/Free driving/);
  take(shift);
  assert.equal(shift.taxiStage,'pickup');assert.equal(shift.passenger,'Marco');assert.equal(shift.target!.name,'Cinema Principe');
});
test('a faster version of the same ride pays a larger bonus, while slow rides retain their base fare',()=>{
  useDistrict(cerea);
  const finish=(seconds:number)=>{const shift=new Mission({authored:true});take(shift);board(shift);shift.update(seconds,spawn,false);shift.serveAtStop(shift.target!.bay,true);return shift;};
  const fast=finish(20),slow=finish(500);
  assert.equal(fast.receipts[0].baseCents,slow.receipts[0].baseCents);
  assert.ok(fast.earningsCents>slow.earningsCents);
  assert.equal(slow.receipts[0].bonusCents,0);assert.ok(slow.earningsCents>=400);
});
test('the shift runs from 07:00 to 17:00 and ends after twenty active minutes',()=>{
  useDistrict(cerea);const shift=new Mission({authored:true});
  assert.equal(shift.clockText,'07:00');assert.equal(shift.duration,1200);
  shift.update(60,spawn,false);assert.equal(shift.clockText,'07:30');
  take(shift);shift.serveAtStop(spawn,true);shift.update(5000,spawn,false);
  assert.equal(shift.clockText,'17:00');assert.equal(shift.state,'shift-complete');assert.equal(shift.finished,true);
  assert.equal(shift.remaining,0);assert.equal(shift.earningsCents,0,'Unfinished passengers do not pay a completed fare');
  assert.equal(shift.unfinishedPassenger,true);assert.equal(shift.serveAtStop(shift.target!.bay,true),false);
  assert.equal(shift.requestFares(spawn),false,'No fares after closing time');
  shift.reset();assert.equal(shift.clockText,'07:00');assert.equal(shift.completedFares,0);assert.equal(shift.earningsCents,0);
});
test('a full sequence keeps dispatching without ending the shift or repeating the library objective',()=>{
  useDistrict(cerea);const shift=new Mission({authored:true}),targets=new Set<string>();
  for(let i=0;i<12;i++){
    take(shift);targets.add(shift.target!.name);board(shift);
    targets.add(shift.target!.name);shift.update(10,spawn,false);assert.equal(shift.serveAtStop(shift.target!.bay,true),true);
  }
  assert.equal(shift.completedFares,12);assert.equal(shift.finished,false);assert.ok(targets.size>=8);
  assert.equal(shift.receipts.reduce((sum,receipt)=>sum+receipt.totalCents,0),shift.earningsCents);
});
