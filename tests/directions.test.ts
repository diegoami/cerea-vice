import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createDirections } from "../src/world/directions";
import cerea from "../public/maps/cerea.json";
import harbor from "../public/maps/harbor.json";
import { createNavigation } from "../src/navigation/Navigation";
import { createMission } from "../src/mission/Mission";
import { District } from "../src/world/district";
import contextHarbor from "../public/maps/harbor.json";
let context=new District(contextHarbor);
let {nodes,roads}=context;
let {junctionDirections}=createDirections(context);
let {directionHint}=createNavigation(context);
let {Mission}=createMission(context);
function useDistrict(data:unknown){context=new District(data);({nodes,roads}=context);({junctionDirections}=createDirections(context));({directionHint}=createNavigation(context));({Mission}=createMission(context));}
afterEach(()=>useDistrict(harbor));
test("hotel signs reverse left/right for opposite approaches to Central Crossroads", () => {
  const eastbound = junctionDirections("c", "w").find((row) => row.detail === "BLUE HOTEL");
  const northbound = junctionDirections("c", "s").find((row) => row.detail === "BLUE HOTEL");
  const southbound = junctionDirections("c", "n").find((row) => row.detail === "BLUE HOTEL");
  assert.equal(eastbound?.direction, "straight");
  assert.equal(northbound?.direction, "right");
  assert.equal(southbound?.direction, "left");
});
test("every junction approach signs every onward exit without a U-turn", () => {
  for (const node of nodes) {
    const connected = roads.filter((road) => road.a === node.id || road.b === node.id);
    for (const road of connected) {
      const from = road.a === node.id ? road.b : road.a;
      const rows = junctionDirections(node.id, from);
      assert.equal(rows.length, connected.length - 1);
      assert.equal(new Set(rows.map((row) => row.direction)).size, rows.length);
      assert.ok(rows.every((row) => row.text && row.detail));
    }
  }
  assert.equal(junctionDirections("s", "sw").find((row) => row.text === "CENTRAL AVENUE")?.direction, "left");
  assert.equal(junctionDirections("e", "c").find((row) => row.detail === "BLUE HOTEL")?.direction, "left");
});
test('Cerea Paride/Cordioli boards name the correct turns and suppress a one-way entrance',()=>{
  useDistrict(cerea);
  const northbound=junctionDirections('1229988085','3214419205');
  assert.deepEqual(northbound.map(row=>[row.text,row.direction]),[['VIA PARIDE','straight'],['VIA CORDIOLI','right']]);
  const southbound=junctionDirections('1229988085','2432129518');
  assert.deepEqual(southbound.map(row=>[row.text,row.direction]),[['VIA CORDIOLI','left']]);
  assert.equal(southbound.some(row=>row.text==='VIA PARIDE'),false,'No arrow may direct the driver against Paride one-way access');
});
test('Cerea information follows the current taxi target and gives a useful return instruction',()=>{
  useDistrict(cerea);
  const mission=new Mission(),position=cerea.spawn;
  assert.match(directionHint(position,position.heading,mission.target),/Municipio di Cerea is beside you/);
  assert.equal(mission.serveAtStop(position,true),true);
  assert.match(directionHint(position,position.heading,mission.target),/Continue north.*turn left onto Via Municipio/);
  const oratory=cerea.taxi.stops.find(stop=>stop.id==='oratory')!;
  const target={...oratory,bay:cerea.parkingZones.find(bay=>bay.id===oratory.bayId)!};
  assert.match(directionHint(position,position.heading,target),/Turn around safely, then continue south/);
  assert.match(directionHint(target.bay,0,target),/Oratorio dello Spasimo is beside you/);
  for(const stop of cerea.taxi.stops) {
    const hint=directionHint(position,position.heading,{...stop,bay:cerea.parkingZones.find(bay=>bay.id===stop.bayId)!});
    assert.match(hint,/On Via Venticinque Aprile/);assert.doesNotMatch(hint,/undefined|NaN/);
  }
});
