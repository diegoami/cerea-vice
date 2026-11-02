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
  const mission=new Mission({authored:true}),position=cerea.spawn;
  assert.equal(mission.requestFares(position),true);assert.equal(mission.acceptFare(mission.fareBoard[0].id),true);
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

test('region boards name the towns each exit leads to, and towns and villages are signed where you enter and leave (#84)',async()=>{
  const {createSigns}=await import("../src/world/signs");
  const {townSignName}=await import("../src/world/placeNames");
  const {RouteGraph}=await import("../src/navigation/RouteGraph");
  const region=new District((await import("../public/maps/lower-verona/manifest.json",{with:{type:"json"}})).default);
  const plain=new District({...region.district,streaming:undefined});
  const signs=createSigns(plain,{signPlaces:true}),names=new Map(plain.district.areas.map(area=>[townSignName(area).toUpperCase(),area]));
  const graph=new RouteGraph(plain.nodes,plain.district.roads);
  const boards=signs.planJunctionSigns().signs;let named=0;
  for(const board of boards){
    const here=plain.areaAt(plain.nodeById(board.junctionId));
    for(const row of board.rows){
      const area=names.get(row.detail);if(!area)continue;named++;
      assert.notEqual(area.name,here,'A board never signs the town it stands in');
      // The exit named for a town is a legal first step of a drivable route there.
      const exits=(plain.adjacency.get(board.junctionId)??[]).filter(road=>road.name.toUpperCase()===row.text&&(!road.oneWay||road.a===board.junctionId));
      const centre=[...plain.nodes].sort((a,b)=>Math.hypot(a.x-area.x,a.z-area.z)-Math.hypot(b.x-area.x,b.z-area.z))[0];
      assert.ok(exits.some(exit=>Number.isFinite(graph.search(exit.a===board.junctionId?exit.b:exit.a,centre.id).cost)),`${row.text} reaches ${area.name}`);
    }
    assert.equal(new Set(board.rows.map(row=>JSON.stringify(row))).size,board.rows.length,'No duplicated rows');
  }
  assert.ok(named>boards.length/2,`Most region junction boards name a town (${named} rows on ${boards.length} boards)`);
  const places=signs.planPlaceSigns();
  for(const area of plain.district.areas){
    const name=townSignName(area).toUpperCase();
    assert.ok(places.some(sign=>sign.rows.length===1&&sign.rows[0]===name),`${name} has an entry sign`);
    assert.ok(places.some(sign=>sign.rows[0]==='FINE'&&sign.rows[1]===name),`${name} has an exit sign`);
  }
  assert.ok(places.every(sign=>signs.boardIsClear(sign)),'Place signs stand clear of roads and buildings');
  assert.ok(!places.some(sign=>sign.rows.join(' ').includes('CENTRO DI')),'Signs say Cerea, not the area\'s long name');
  // Other maps never sign places: a single town has none, and the outskirts prototype's areas are a test fixture.
  useDistrict(cerea);
  assert.deepEqual(createSigns(context,{signPlaces:true}).planPlaceSigns(),[]);
  const outskirts=new District((await import("../public/maps/cerea-outskirts/manifest.json",{with:{type:"json"}})).default);
  assert.deepEqual(createSigns(outskirts).planPlaceSigns(),[]);
  assert.ok(!createSigns(outskirts).planJunctionSigns().signs.some(board=>board.rows.some(row=>/FICTIONAL|HAMLET/.test(row.detail))));
  assert.ok(!createSigns(context).planJunctionSigns().signs.some(board=>board.rows.some(row=>row.detail==='CEREA'||row.detail==='CENTRO DI CEREA')));
});
