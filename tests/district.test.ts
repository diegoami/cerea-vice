import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import cerea from "../public/maps/cerea.json";
import harbor from "../public/maps/harbor.json";
import { validateDistrict, inRect, projectToSegment } from "../src/world/district";
import { createNavigation } from "../src/navigation/Navigation";
import { createAtlas } from "../src/ui/Atlas";
import type {DistrictDefinition} from "../src/world/schema";
import { roadWidth } from "../src/world/district";
import { createParking } from "../src/navigation/Parking";
import { createMission } from "../src/mission/Mission";
import { createAtlasNotes } from "../src/navigation/AtlasNotes";
import { District } from "../src/world/district";
import contextHarbor from "../public/maps/harbor.json";
let context=new District(contextHarbor);
let {district,nodes,roads,spawn,isPaved,nodeById,roadRect}=context;
let {shortestRoute,nearestRoad,directionHint}=createNavigation(context);
let {atlasMarkup}=createAtlas(context);
let {Parking}=createParking(context);
let {Mission}=createMission(context);
let {AtlasNotes}=createAtlasNotes(context);
function useDistrict(data:unknown){context=new District(data);({district,nodes,roads,spawn,isPaved,nodeById,roadRect}=context);({shortestRoute,nearestRoad,directionHint}=createNavigation(context));({atlasMarkup}=createAtlas(context));({Parking}=createParking(context));({Mission}=createMission(context));({AtlasNotes}=createAtlasNotes(context));}
afterEach(()=>useDistrict(harbor));
test("Cerea loads real street geometry, connected routes, named landmarks and accessible stopping bays",()=>{
  useDistrict(cerea);
  assert.equal(district.name,"Cerea Centro");
  assert.ok(new Set(roads.map((road)=>road.name)).size>=20);
  assert.ok(roads.some((road)=>road.name==="Via Paride"&&road.oneWay));
  assert.ok(roads.some((road)=>Math.abs(nodeById(road.a).x-nodeById(road.b).x)>2&&Math.abs(nodeById(road.a).z-nodeById(road.b).z)>2));
  assert.ok(district.landmarks.some((place)=>place.name==="Biblioteca di Cerea"));
  for(const bay of district.parkingZones) {
    assert.ok(isPaved(bay));
    assert.equal(district.buildings.some((building)=>inRect(bay,building,-1.05)),false,`${bay.name} must not be inside a building`);
  }
  const start=nearestRoad(spawn).edge;
  const route=shortestRoute(start.a);
  assert.ok(Number.isFinite(route.cost)&&route.cost>200);
  for(let i=0;i<route.path.length-1;i++) assert.ok(roads.some((road)=>(road.a===route.path[i]&&road.b===route.path[i+1])||(!road.oneWay&&road.b===route.path[i]&&road.a===route.path[i+1])),"Route follows the imported one-way topology");
  for(let i=0;i<route.path.length-1;i++) {
    const a=nodeById(route.path[i]),b=nodeById(route.path[i+1]);
    const steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z));
    for(let step=0;step<=steps;step++) {
      const point={x:a.x+(b.x-a.x)*step/steps,z:a.z+(b.z-a.z)*step/steps};
      assert.equal(district.buildings.some((building)=>inRect(point,building,-1.05)),false,"A suggested road must not run through a solid building");
    }
  }
  assert.match(directionHint(spawn,spawn.heading),/Via Venticinque Aprile/);
  const mission=new Mission({authored:true});mission.update(1,spawn,true);assert.equal(mission.taxiMode,true);assert.equal(mission.state,"active");assert.equal(mission.serveAtStop(spawn,true),true);assert.equal(mission.target.name,"Ufficio Postale di Cerea");
  const parking=new Parking();parking.update(1,spawn,0);assert.equal(parking.zone,"Sosta Municipio");
  const notes=new AtlasNotes();assert.equal(notes.label,"Sosta Municipio");
  assert.equal(nodes.length,new Set(nodes.map((node)=>node.id)).size);
});
test("angled road paving uses distance to the road rather than filling its bounding rectangle",()=>{
  const data=structuredClone(cerea);
  data.nodes=[{id:"a",x:0,z:0,label:"A"},{id:"b",x:100,z:100,label:"B"}];
  delete (data as {taxi?:unknown}).taxi;
  data.mission.nodeId="b";
  data.roads=[{a:"a",b:"b",name:"Diagonal",width:8,roadClass:"residential",oneWay:false,bridge:false,osmId:1}];
  useDistrict(data);
  assert.equal(isPaved({x:50,z:50}),true);
  assert.equal(isPaved({x:10,z:90}),false);
  assert.deepEqual(projectToSegment({x:10,z:90},data.nodes[0],data.nodes[1]),{x:50,z:50});
});
test("district validation rejects broken connections and degenerate bounds",()=>{
  const data=structuredClone(cerea);
  data.roads[0].a="missing";
  assert.throws(()=>validateDistrict(data),/roads/);
  data.roads=structuredClone(cerea.roads);data.bounds.maxX=data.bounds.minX;
  assert.throws(()=>validateDistrict(data),/bounds/);
});
test('widthless roads use the same 8 m surface for paving, bounds and the atlas',()=>{
  const data=structuredClone(cerea) as DistrictDefinition;
  delete data.taxi;
  data.nodes=[{id:'a',x:0,z:0,label:'A'},{id:'b',x:100,z:0,label:'B'}];
  data.roads=[{a:'a',b:'b',name:'Test road'}];data.mission.nodeId='b';
  useDistrict(data);
  assert.equal(roadWidth(roads[0]),8);assert.equal(roadRect(roads[0]).depth,8);
  assert.equal(isPaved({x:50,z:3.9}),true);assert.equal(isPaved({x:50,z:4.1}),false);
  assert.match(atlasMarkup('map'),/stroke-width="8"/);
});
test('district validation rejects unsafe optional map text',()=>{
  for(const field of ['landmarkRoad','landmarkKind','featureName','roadClass']) {
    const data=structuredClone(cerea);
    if(field==='landmarkRoad')data.landmarks[0].road='<img>';
    else if(field==='landmarkKind')data.landmarks[0].kind='<img>';
    else if(field==='featureName')data.features[0].name='<img>';
    else data.roads[0].roadClass='<img>';
    assert.throws(()=>validateDistrict(data),/text|names/,field);
  }
});
