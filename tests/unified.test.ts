import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {District,inRect} from '../src/world/district';
import {combineRegions} from '../src/world/Unified';
import {loadTile} from '../src/world/streaming/loadTile';
import {RouteGraph} from '../src/navigation/RouteGraph';
import {chooseStartPlace} from '../src/game/StartPlace';
import {createMission,guaranteedFare,collectionSupplement} from '../src/mission/Mission';
import {mapSignature,decodeSave,SAVE_VERSION} from '../src/game/Save';
import {createAtlasNotes} from '../src/navigation/AtlasNotes';
const read=(id:string)=>JSON.parse(readFileSync(`public/maps/${id}/manifest.json`,'utf8'));
const data=read('veronese'),context=new District(data,{assetBase:'https://game.test/maps/veronese/'});

test('the unified world preserves source geometry and joins the real gateway in one directed graph',()=>{
 const south=read('lower-verona'),north=read('verona-plain'),built=combineRegions([south,north]);
 const {provenance,...stored}=data;assert.deepEqual(built,stored);
 assert.equal(context.nodes.length,south.nodes.length+north.nodes.length-1);assert.equal(context.district.buildings.length,24901);
 assert.equal(context.district.taxi!.stops.length,69);assert.equal(new Set(context.district.taxi!.stops.map(s=>s.townId)).size,9);
 for(const town of new Set(context.district.taxi!.stops.map(s=>s.townId))){const labels=new Set(context.district.taxi!.stops.filter(s=>s.townId===town).map(s=>s.town));assert.equal(labels.size,1);assert.match([...labels][0]!,/^[A-Z]/);}
 assert.equal(context.district.gateways,undefined,'The joined gateway is an ordinary road, including with a passenger aboard');
 const flat=new RouteGraph(context.nodes,context.roads);
 for(const [a,b] of [['cerea:municipio','verona-south:barbieri'],['oppeano:sangiovanni','legnago:comune'],['nogara:chiesa','san-giovanni-lupatoto:municipio']]){
  const from=data.taxi.stops.find((s:any)=>s.id===a),to=data.taxi.stops.find((s:any)=>s.id===b);
  for(const [start,end] of [[from,to],[to,from]]){const route=context.graph.search(start.nodeId,end.nodeId);assert.ok(route.path.includes('1027266513'));assert.deepEqual(route,flat.search(start.nodeId,end.nodeId));}
 }
 assert.equal(mapSignature(new District(south)),mapSignature(new District(read('lower-verona'))),'Legacy manifests remain unmodified');
});

test('composite cells rebase both source payloads, have one ground, and empty padding needs no fetch',async()=>{
 let reads=0;
 const loader=async(url:URL)=>{reads++;return JSON.parse(readFileSync(`public${url.pathname}`,'utf8'));};
 const shared=context.district.streaming!.tiles.find(t=>t.sources?.length===2&&t.id==='-5_-23')??context.district.streaming!.tiles.find(t=>t.sources?.length===2)!;
 const payload=await loadTile(context,shared,loader);assert.equal(reads,2);assert.equal(payload.id,shared.id);assert.ok(payload.roads.some(i=>i>=shared.sources![1].offsets.roads));assert.ok(payload.roads.some(i=>i<shared.sources![1].offsets.roads));
 const expected=shared.sources!.flatMap(source=>read(source.map).streaming.tiles.filter((t:any)=>t.id===shared.id).flatMap((t:any)=>JSON.parse(readFileSync(`public/maps/${source.map}/${t.file}`,'utf8')).roads.map((i:number)=>i+source.offsets.roads)));
 assert.deepEqual(payload.roads,expected);
 const empty=context.district.streaming!.tiles.find(t=>t.sources?.length===0)!;const count=reads;
 const padding=await loadTile(context,empty,loader);assert.equal(reads,count);assert.deepEqual(padding.roads,[]);
 const bad=structuredClone(data);bad.streaming.tiles[0].sources=[{map:'../../escape',offsets:{roads:0,features:0,landmarks:0,bays:0},bytes:1}];assert.throws(()=>new District(bad),/composed tile/);
});

test('starts sample every town, use real clear landmark bays and do not mutate signed map content',()=>{
 const signature=mapSignature(context),towns=new Set<string>();
 for(let i=0;i<9;i++){
  const values=[(i+.1)/9,.43,.2];const place=chooseStartPlace(context,()=>values.shift()??.2);towns.add(place.townId);
  const stop=context.district.taxi!.stops.find(s=>s.id===place.landmarkId)!,bay=context.parkingZones.find(b=>b.id===stop.bayId)!;
  assert.ok(inRect(place,bay,1.1));assert.ok(Number.isFinite(place.heading));
  assert.notEqual(chooseStartPlace(context,()=>.4,place.townId).townId,place.townId);
 }
 assert.equal(towns.size,9);assert.equal(mapSignature(context),signature);
});

test('local and inter-town fares share one persistent board, pay a premium and survive cross-region saves',()=>{
 const {Mission}=createMission(context),mission=new Mission({seed:331}),start=chooseStartPlace(context,()=>.01);
 assert.ok(mission.requestFares(start));assert.equal(mission.fareBoard.length,4);
 assert.equal(mission.fareBoard.filter(f=>mission.isInterTown(f)).length,2);
 const original=structuredClone(mission.fareBoard);mission.requestFares(start);assert.deepEqual(mission.fareBoard,original);
 const north=new Set(['verona-south','san-giovanni-lupatoto','oppeano']);
 let inter=mission.fareBoard.find(f=>north.has(context.district.taxi!.stops.find(s=>s.id===f.destinationId)!.townId!));
 for(let i=0;!inter&&i<12;i++){mission.refreshFares(start);inter=mission.fareBoard.find(f=>north.has(context.district.taxi!.stops.find(s=>s.id===f.destinationId)!.townId!));}
 assert.ok(inter,'A fare can cross the old region boundary');assert.match(mission.fareLabel(inter),/^Inter-town/);
 assert.equal(mission.offerGuaranteeCents(inter),guaranteedFare(400,120,mission.offerRouteDistance(inter))+collectionSupplement(inter.approachDistance)+1200);
 const expected=mission.offerGuaranteeCents(inter);mission.acceptFare(inter.id);
 const pickup=mission.target!.bay;assert.ok(mission.serveAtStop(pickup,true));mission.update(6,pickup,true);
 const destination=mission.target!.bay;
 const {AtlasNotes}=createAtlasNotes(context);
 const save={version:SAVE_VERSION,district:data.id,map:mapSignature(context),dataVersion:1,savedAt:new Date().toISOString(),car:{x:destination.x,z:destination.z,heading:0,speed:0,gear:'D',steering:0,collisions:0},unsafeStops:0,mission:mission.snapshot(),atlas:new AtlasNotes().snapshot()};
 const decoded=decodeSave(context,JSON.stringify(save)),loaded=new Mission({seed:2});loaded.restore(decoded.mission);
 assert.ok(loaded.serveAtStop(destination,true));assert.ok(loaded.earningsCents>=expected);assert.equal(loaded.completedFares,1);
 assert.equal(loaded.receipts[0].baseCents,expected);
});

test('small towns retain two distinct local and two inter-town offers across repeated completed rides',()=>{
 const {Mission}=createMission(context),mission=new Mission({seed:44}),start=chooseStartPlace(context,()=>.99);
 assert.equal(start.townId,'oppeano');
 for(let i=0;i<24;i++){
  mission.requestFares(start);assert.equal(mission.fareBoard.length,4);assert.equal(mission.fareBoard.filter(f=>mission.isInterTown(f)).length,2);
  assert.equal(new Set(mission.fareBoard.map(f=>`${f.pickupId}/${f.destinationId}`)).size,4);
  const local=mission.fareBoard.find(f=>!mission.isInterTown(f))!;mission.acceptFare(local.id);
  const pickup=mission.target!.bay;assert.ok(mission.serveAtStop(pickup,true));mission.update(6,pickup,true);assert.ok(mission.serveAtStop(mission.target!.bay,true));
 }
});
