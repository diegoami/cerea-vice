import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from "../src/game/Game";
import { createCar } from "../src/driving/Car";
import { createParking } from "../src/navigation/Parking";
import { createMission } from "../src/mission/Mission";
import { District } from "../src/world/district";
import plainData from "../public/maps/lower-verona/manifest.json";
import northData from "../public/maps/verona-plain/manifest.json";

const towns=[{id:'lower-verona',name:'Lower Veronese plain'},{id:'verona-plain',name:'Verona and the plain to Oppeano'}];
/** The browser pieces a crossing touches: storage for the hand-over record, and the reload into the next region. */
function browser(){
 const storage=new Map<string,string>(),reloads:string[]=[];
 const location={hash:'',reload:()=>reloads.push(storage.get('cerea-district')??'')};
 Object.assign(globalThis,{localStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)},
  history:{replaceState:(_:unknown,__:string,url:string)=>{location.hash=url;}},window:{location},location});
 return {storage,reloads};
}
function game(data:unknown){
 const context=new District(data),{Game}=createGame(context,towns),{Car}=createCar(context),{Parking}=createParking(context),{Mission}=createMission(context);
 const hints:string[]=[],noop=()=>{};let forgotten=0;
 const g=Object.create(Game.prototype);
 Object.assign(g,{screen:'running',car:new Car(),parking:new Parking(),mission:new Mission(),accumulator:0,waitForDrivingRelease:false,gatewayArmed:true,hasStarted:true,
  world:{updateFrame:noop},cockpit:{reset:noop,update:noop},motion:{reset:noop},
  hud:{setHint:(text:string)=>hints.push(text),forgetAtlasMarker:()=>forgotten++}});
 return {context,game:g,hints,forgotten:()=>forgotten};
}
const atGateway=(h:ReturnType<typeof game>,distance:number)=>{
 const node=h.context.nodeById(h.context.district.gateways![0].nodeId);h.game.car.x=node.x+distance;h.game.car.z=node.z;
};

test('both regions put their shared gateway in the same place, signed with the places beyond (#112)',async()=>{
 const plain=new District(plainData),north=new District(northData);
 const [a]=plain.district.gateways!,[b]=north.district.gateways!;
 assert.equal(a.nodeId,b.nodeId);assert.equal(a.to,'verona-plain');assert.equal(b.to,'lower-verona');
 assert.deepEqual([plain.nodeById(a.nodeId).x,plain.nodeById(a.nodeId).z],[north.nodeById(b.nodeId).x,north.nodeById(b.nodeId).z],'The road meets');
 assert.equal(new Set((plain.adjacency.get(a.nodeId)??[]).map(road=>road.a===a.nodeId?road.b:road.a)).size,1,'The road ends at the gateway');
 assert.deepEqual(a.sign,['OPPEANO','VERONA']);assert.deepEqual(b.sign,['BOVOLONE','CEREA']);
});

test('reaching the gateway with a fare booked only says so; without one, the shift is handed to the next region',()=>{
 const {storage,reloads}=browser(),h=game(plainData);
 h.game.mission.requestFares(h.game.car);h.game.mission.acceptFare(h.game.mission.fareBoard[0].id);assert.ok(h.game.mission.hasRide);
 atGateway(h,3);h.game.checkGateways();
 assert.match(h.hints.at(-1)!,/Finish the fare before leaving this region/);assert.equal(storage.has('cerea-crossing'),false);assert.deepEqual(reloads,[]);
 // Free driving, with fares already earned.
 const free=game(plainData),fresh=free.game.mission.snapshot();
 free.game.mission.restore({...fresh,totalElapsed:900,elapsed:900,earningsCents:1234,bonusEarnedCents:234,receipts:[{passenger:'Elena',pickup:'Teatro',destination:'Arena',distanceMetres:2000,seconds:120,baseCents:1000,bonusCents:234,totalCents:1234}],notice:''});
 atGateway(free,30);free.game.gatewayArmed=true;free.game.checkGateways();assert.deepEqual(reloads,[],'Not there yet');
 atGateway(free,3);free.game.checkGateways();
 assert.deepEqual(reloads,['verona-plain'],'The neighbouring region loads');
 const record=JSON.parse(storage.get('cerea-crossing')!);
 assert.equal(record.from,'lower-verona');assert.equal(record.mission.earningsCents,1234);assert.equal(record.mission.totalElapsed,900);
 // Arrival on the other side.
 const north=game(northData);north.game.screen='briefing';north.game.hasStarted=false;north.game.arriveFromCrossing();
 assert.equal(storage.has('cerea-crossing'),false,'The record is read once');
 assert.equal(north.game.screen,'running');assert.equal(north.game.mission.earningsCents,1234);assert.equal(north.game.mission.totalElapsed,900);
 assert.equal(north.game.mission.receipts.length,1);assert.equal(north.game.mission.fareBoard.length,0);assert.equal(north.game.mission.hasRide,false);
 const gate=north.context.nodeById(north.context.district.gateways![0].nodeId);
 assert.ok(Math.hypot(north.game.car.x-gate.x,north.game.car.z-gate.z)<=8.01,'The car arrives at the gateway');
 assert.equal(north.forgotten(),1,'No marked position in the new region');assert.match(north.game.mission.notice,/^Entered Verona and the plain to Oppeano\./);
 north.game.checkGateways();assert.equal(storage.has('cerea-crossing'),false,'Arriving does not bounce back');
});

test('a hand-over meant for another region, or a stale one, is ignored',()=>{
 const {storage}=browser();
 for(const record of [{version:1,from:'lower-verona',to:'verona',nodeId:'1027266513',savedAt:Date.now()},{version:1,from:'lower-verona',to:'verona-plain',nodeId:'1027266513',savedAt:Date.now()-3600000}]){
  storage.set('cerea-crossing',JSON.stringify({...record,car:{x:0,z:0,heading:0,speed:0,gear:'D'},mission:{}}));
  const north=game(northData);north.game.screen='briefing';north.game.hasStarted=false;north.game.arriveFromCrossing();
  assert.equal(north.game.screen,'briefing');assert.equal(storage.has('cerea-crossing'),false);
 }
});
