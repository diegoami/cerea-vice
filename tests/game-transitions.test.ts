import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/Game';
import { Car } from '../src/driving/Car';
import { Parking } from '../src/navigation/Parking';
import { Mission } from '../src/mission/Mission';
import { BodyMotion } from '../src/presentation/Motion';
import { defaults } from '../src/presentation/Settings';
import type { Actions } from '../src/input/Input';
import type { Screen } from '../src/ui/Hud';

const idle:Actions={steer:0,throttle:0,brake:0,handbrake:false,glance:0,interact:false,pause:false,reminder:false,atlas:false,back:false,atlasPage:0,atlasMoveX:0,atlasMoveY:0,clearMarker:false,information:false,shiftGear:false,lookX:0,lookY:0,mouseX:0,mouseY:0,resetLook:false,atlasZoom:0,atlasZoomStep:0,atlasPanX:0,atlasPanY:0};
interface Harness {
 screen:Screen;car:Car;parking:Parking;mission:Mission;waitForDrivingRelease:boolean;
 frame(time:number):void;pause():void;requestInformation():void;
}
/** Exercise the real Game methods; stub only browser/render/UI boundaries. */
function harness(){
 Object.defineProperty(globalThis,'document',{configurable:true,value:{pointerLockElement:null}});
 let actions={...idle},markers=0,estimates=0,clock=1000;
 const game=Object.create(Game.prototype) as Harness;
 const noop=()=>{};
 Object.assign(game,{
  screen:'running',car:new Car(),parking:new Parking(),mission:new Mission(),previousTime:1000,accumulator:0,
  districtSwitchReady:false,ignorePauseUntil:0,missionRevision:-1,waitForDrivingRelease:false,
  input:{settingsInput:{move:0,confirm:false,keyboardConfirm:false},poll:()=>({...actions}),controllerDisconnected:false,setMouseCaptured:noop},
  retro:{render:noop},renderer:{domElement:{focus:noop},render:noop},world:{colliders:[],updateDaylight:noop},
  cockpit:{update:noop,camera:{}},interior:{update:noop,renderMirrors:noop},sound:{update:noop,unlock:noop},motion:new BodyMotion(),
  settings:{...defaults},settingsPanel:{update:()=>false},
  hud:{setHint:noop,confirmAtlasPosition:()=>markers++,setAtlasInformation:noop,show:noop,update:noop,setTaxiMessage:noop,
   turnAtlasPage:noop,controlAtlasView:noop,moveAtlasCursor:noop,placeAtlasMarker:()=>estimates++,removeAtlasMarker:noop},
 });
 game.parking.update(1,game.car,0);
 return {game,step:(next:Partial<Actions>={},dt=100)=>{actions={...idle,...next};clock+=dt;game.frame(clock);},markers:()=>markers,estimates:()=>estimates};
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
