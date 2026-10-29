import {defaultBindings} from '../src/input/Bindings';
import {StreamingWorld} from "../src/world/streaming/StreamingWorld";
import { LocalFrame } from "../src/world/LocalFrame";
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from "../src/game/Game";
import { createCar } from "../src/driving/Car";
import { createParking } from "../src/navigation/Parking";
import { createMission } from "../src/mission/Mission";
import { BodyMotion } from '../src/presentation/Motion';
import { defaults } from '../src/presentation/Settings';
import type { Actions } from '../src/input/Input';
import { type Screen } from "../src/ui/Hud";
import { District } from "../src/world/district";
import contextHarbor from "../public/maps/harbor.json";
import cerea from "../public/maps/cerea.json";
let context=new District(contextHarbor);
let {Game}=createGame(context);
let {Car}=createCar(context);
let {Parking}=createParking(context);
let {Mission}=createMission(context);
interface Harness {
 screen:Screen;car:InstanceType<typeof Car>;parking:InstanceType<typeof Parking>;mission:InstanceType<typeof Mission>;waitForDrivingRelease:boolean;
 frame(time:number):void;pause():void;requestInformation():void;
}
const idle:Actions={steer:0,throttle:0,brake:0,handbrake:false,glance:0,interact:false,pause:false,reminder:false,atlas:false,back:false,declineOffer:false,requestFares:false,radioNext:false,refreshFares:false,atlasPage:0,atlasMoveX:0,atlasMoveY:0,clearMarker:false,information:false,shiftGear:false,lookX:0,lookY:0,mouseX:0,mouseY:0,resetLook:false,atlasZoom:0,atlasZoomStep:0,atlasPanX:0,atlasPanY:0};
function harness(data:unknown=contextHarbor){
 if(data!==contextHarbor){context=new District(data);({Game}=createGame(context));({Car}=createCar(context));({Parking}=createParking(context));({Mission}=createMission(context));}
 else if(context.district.id!=='harbor'){context=new District(contextHarbor);({Game}=createGame(context));({Car}=createCar(context));({Parking}=createParking(context));({Mission}=createMission(context));}
 Object.defineProperty(globalThis,'document',{configurable:true,value:{pointerLockElement:null}});
 let actions={...idle},markers=0,estimates=0,clock=1000,radioSkips=0;
 const game=Object.create(Game.prototype) as Harness;
 const noop=()=>{};
 Object.assign(game,{
  controlsPanel:{visible:false,update:noop},saveButton:{disabled:false},people:{update:noop},
  streamStatus:{hidden:true,textContent:''},screen:'running',car:new Car(),parking:new Parking(),mission:new Mission(),previousTime:1000,accumulator:0,
  districtSwitchReady:false,ignorePauseUntil:0,missionRevision:-1,waitForDrivingRelease:false,
  input:{bindings:structuredClone(defaultBindings),settingsInput:{move:0,confirm:false,keyboardConfirm:false},poll:()=>({...actions}),controllerDisconnected:false,setMouseCaptured:noop,menuHeld:false,drivingReleased:true},
  retro:{render:noop},renderer:{domElement:{focus:noop},render:noop},world:{frame:new LocalFrame({x:0,z:0}),updateFrame:noop,collisionIndex:[],colliders:[],updateDaylight:noop},
  cockpit:{update:noop,camera:{}},interior:{update:noop,renderMirrors:noop,setPassenger:noop},sound:{update:noop,unlock:noop,state:'running'},radio:{update:noop,next:()=>radioSkips++,playable:true,summary:'1/2 Test'},motion:new BodyMotion(),
  settings:{...defaults},settingsPanel:{update:()=>false},
  hud:{setHint:noop,confirmAtlasPosition:()=>markers++,setAtlasInformation:noop,show:noop,update:noop,setTaxiMessage:noop,
   turnAtlasPage:noop,controlAtlasView:noop,moveAtlasCursor:noop,placeAtlasMarker:()=>estimates++,removeAtlasMarker:noop,refresh:noop,setFareSelection:noop,remindMission:noop,setSound:noop},
 });
 game.parking.update(1,game.car,0);
 return {game,step:(next:Partial<Actions>={},dt=100)=>{actions={...idle,...next};clock+=dt;game.frame(clock);},markers:()=>markers,estimates:()=>estimates,radioSkips:()=>radioSkips};
}
test('Game atlas and pause freeze actual mission time and return without a gear change',()=>{
 const h=harness();h.step();assert.ok(h.game.mission.elapsed>0);
 h.step({atlas:true});assert.equal(h.game.screen,'atlas');
 const elapsed=h.game.mission.elapsed;const position=[h.game.car.x,h.game.car.z];
 for(let i=0;i<15;i++)h.step({throttle:1,atlasZoom:1,shiftGear:true});
 assert.equal(h.game.mission.elapsed,elapsed);assert.deepEqual([h.game.car.x,h.game.car.z],position);assert.equal(h.game.car.gear,'D');
 h.step({back:true,shiftGear:true,throttle:1});assert.equal(h.game.screen,'running');assert.equal(h.game.car.gear,'D');assert.equal(h.game.car.speed,0);
 h.game.pause();assert.equal(h.game.screen,'paused');const paused=h.game.mission.elapsed;
 for(let i=0;i<10;i++)h.step({throttle:1});assert.equal(h.game.mission.elapsed,paused);
});
test('Game marker writes require a successful stopped request or deliberate atlas placement',()=>{
 const h=harness();h.game.parking.stopped=false;h.game.requestInformation();assert.equal(h.markers(),0);
 h.game.parking.stopped=true;h.game.requestInformation();assert.equal(h.markers(),1);
 h.step({atlas:true});h.step({interact:true});assert.equal(h.estimates(),1);assert.equal(h.markers(),1);
 h.step({information:true});assert.equal(h.markers(),2);assert.equal(h.game.screen,'atlas');
 h.step({back:true});for(let i=0;i<10;i++)h.step({throttle:1});assert.equal(h.markers(),2);
 h.game.pause();h.game.requestInformation();assert.equal(h.markers(),2);
});
test('Game holds driving inputs until both atlas triggers are released and gates gear at a settled stop',()=>{
 const h=harness();h.step({atlas:true});h.step({back:true,throttle:1});
 for(let i=0;i<5;i++)h.step({throttle:1});assert.equal(h.game.car.speed,0);
 h.step({brake:.5});assert.equal(h.game.waitForDrivingRelease,true);
 h.step();assert.equal(h.game.waitForDrivingRelease,false);
 h.step({shiftGear:true});assert.equal(h.game.car.gear,'R');
 h.step({throttle:1});assert.ok(h.game.car.speed<0);
 h.step({shiftGear:true,throttle:1});assert.equal(h.game.car.gear,'R');
});


test('Game freezes physical/taxi time while streamed scenery is unavailable, then resumes without marker writes',()=>{
 const h=harness();let ready=false;
 const world=Object.assign(Object.create(StreamingWorld.prototype),{frame:new LocalFrame({x:0,z:0}),updateFrame:()=>{},updateDaylight:()=>{},readyAt:()=>ready,collisionIndex:[],stream:{stats:{failures:0}}});
 Object.assign(h.game,{world});const before=h.game.mission.elapsed;
 for(let i=0;i<30;i++)h.step({throttle:1});
 assert.equal(h.game.mission.elapsed,before);assert.equal(h.game.car.speed,0);assert.equal(h.markers(),0);
 ready=true;h.step({throttle:1});assert.ok(h.game.mission.elapsed>before);assert.ok(h.game.car.speed>0);assert.equal(h.markers(),0);
});

test('held remapped buttons cannot serve, request information, reopen the atlas or shift after a menu closes',()=>{
 const h=harness();h.game.waitForDrivingRelease=true;
 const game=h.game as unknown as {input:{drivingReleased:boolean}};game.input.drivingReleased=false;
 h.step({interact:true,information:true,atlas:true,shiftGear:true});
 assert.equal(h.game.screen,'running');assert.equal(h.markers(),0);assert.equal(h.game.car.gear,'D');
 game.input.drivingReleased=true;h.step();assert.equal(h.game.waitForDrivingRelease,false);
 h.step({atlas:true});assert.equal(h.game.screen,'atlas');
});

test('Game never opens fares by itself; a stopped request opens the list, reading freezes time and closing keeps it',()=>{
 const h=harness(cerea),game=h.game as Harness&{input:{menuHeld:boolean;drivingReleased:boolean}};
 for(let i=0;i<20;i++)h.step();assert.equal(h.game.screen,'running','Shift start and stopping never show a fare popup');
 assert.equal(h.game.mission.fareBoard.length,0);
 h.step({throttle:1});h.step({requestFares:true,throttle:1});assert.equal(h.game.screen,'running','Moving requests are refused');assert.equal(h.game.mission.fareBoard.length,0);
 for(let i=0;i<30;i++)h.step({handbrake:true});h.step();
 h.step({requestFares:true});assert.equal(h.game.screen,'fares');const listed=JSON.stringify(h.game.mission.fareBoard),clock=h.game.mission.totalElapsed;
 // Held presses from driving are ignored until released.
 game.input.menuHeld=true;h.step({interact:true});h.step({declineOffer:true});assert.equal(h.game.screen,'fares');assert.equal(h.game.mission.hasRide,false);
 game.input.menuHeld=false;h.step();for(let i=0;i<10;i++)h.step({throttle:1,steer:1});
 assert.equal(h.game.mission.totalElapsed,clock,'Reading the list stops the shift clock');assert.equal(h.game.car.speed,0);
 h.step({declineOffer:true});assert.equal(h.game.screen,'running');assert.equal(h.game.mission.hasRide,false);assert.equal(h.game.mission.earningsCents,0);
 for(let i=0;i<10;i++)h.step();assert.equal(h.game.screen,'running','A closed list does not reopen automatically');
 h.step({requestFares:true});assert.equal(h.game.screen,'fares');assert.equal(JSON.stringify(h.game.mission.fareBoard),listed,'Reopening shows the same fares');
 h.game.pause();assert.equal(h.game.screen,'paused');assert.equal(JSON.stringify(h.game.mission.fareBoard),listed);
 assert.equal(h.markers(),0);assert.equal(h.estimates(),0);
});
test('Game accepts the selected listed fare once, then holds driving input until released; marker untouched',()=>{
 const h=harness(cerea),game=h.game as Harness&{input:{drivingReleased:boolean}};h.step();h.step();
 h.step({requestFares:true});h.step();const third=h.game.mission.fareBoard[2];
 h.step({atlasMoveY:1});h.step({atlasMoveY:1});h.step();h.step({atlasMoveY:1});h.step({atlasMoveY:-1});h.step({atlasMoveY:0});h.step({atlasMoveY:1});
 game.input.drivingReleased=false;h.step({interact:true});assert.equal(h.game.screen,'running');assert.equal(h.game.mission.passenger,third.passenger,'Selection moves one entry per press, reversing at once');
 assert.equal(h.game.waitForDrivingRelease,true);h.step({interact:true,requestFares:true,throttle:1});
 assert.equal(h.game.mission.taxiStage,'pickup');assert.equal(h.game.car.speed,0);assert.equal(h.game.screen,'running');
 game.input.drivingReleased=true;h.step();h.step({requestFares:true});assert.equal(h.game.screen,'running','No second list while a ride is accepted');
 assert.equal(h.markers(),0);assert.equal(h.estimates(),0);
});
test('Game holds the taxi while the passenger walks over, then releases it',()=>{
 const h=harness(cerea);h.step();h.step();h.step({requestFares:true});h.step();h.step({interact:true});h.step();
 const bay=h.game.mission.target!.bay;Object.assign(h.game.car,{x:bay.x,z:bay.z});for(let i=0;i<10;i++)h.step();
 h.step({interact:true});assert.ok(h.game.mission.boarding>0);
 for(let i=0;i<20;i++)h.step({throttle:1,shiftGear:true});assert.equal(h.game.car.speed,0);assert.equal(h.game.car.gear,'D');
 for(let i=0;i<60;i++)h.step();assert.equal(h.game.mission.boarding,0);h.step({throttle:1});h.step({throttle:1});assert.ok(h.game.car.speed>0);
});
test('Radio next track works only while driving with the folder radio on, and never touches the atlas or clock',()=>{
 const h=harness(),game=h.game as Harness&{settings:typeof defaults};
 h.step();h.step({radioNext:true});assert.equal(h.radioSkips(),0,'Radio off: nothing changes');
 game.settings.radio=true;h.step({radioNext:true});assert.equal(h.radioSkips(),0,'The built-in tune has no track list');
 game.settings.radioSource='folder';h.step({radioNext:true});assert.equal(h.radioSkips(),1);
 h.step({atlas:true});assert.equal(h.game.screen,'atlas');const elapsed=h.game.mission.elapsed;
 h.step({radioNext:true});assert.equal(h.game.mission.elapsed,elapsed);h.step({back:true});h.game.pause();h.step({radioNext:true});
 assert.equal(h.radioSkips(),1,'Atlas and pause ignore the driving radio control');
 assert.equal(h.markers(),0);assert.equal(h.estimates(),0);
});
