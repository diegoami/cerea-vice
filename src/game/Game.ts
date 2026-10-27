import { StreamingWorld } from "../world/streaming/StreamingWorld";
import { SettingsPanel, readSettings, renderSize } from "../presentation/Settings";
import { Sound } from "../presentation/Sound";
import { BodyMotion } from "../presentation/Motion";
import { Retro } from "../presentation/Retro";
import { availableDistricts, selectDistrict } from "../world/load";
import { WebGLRenderer } from "three";
import { createCar } from "../driving/Car";
import { CockpitCamera } from "../driving/CockpitCamera";
import { Cockpit } from "../driving/Cockpit";
import { Input } from "../input/Input";
import { createNavigation } from "../navigation/Navigation";
import { createParking } from "../navigation/Parking";
import { createMission } from "../mission/Mission";
import { createWorld } from "../world/World";
import { createHud, type Screen } from "../ui/Hud";
import { District } from "../world/district";
import {PassengerPresence} from '../world/People';
import {ControlsPanel} from '../input/ControlsPanel';
import {bindingLabel} from '../input/Bindings';
import {decodeSave,mapSignature,saveKey,type SaveData} from './Save';
export function createGame(context:District){
const {district}=context;
const {Car}=createCar(context);
const {directionHint}=createNavigation(context);
const {Parking}=createParking(context);
const {Mission}=createMission(context);
const makeWorld=()=>district.streaming?new StreamingWorld(context):new (createWorld(context).World)();
const {Hud}=createHud(context);
class Game {
  private readonly timingPanel=context.profile.enabled?document.createElement("pre"):undefined;
  private timingRefresh=0;
  private readonly sound = new Sound();
  private readonly motion = new BodyMotion();
  private readonly settings = readSettings();
  private settingsPanel!: SettingsPanel;
  private readonly retro = new Retro();
  private readonly renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  private readonly world = makeWorld();
  private readonly people = new PassengerPresence(context,this.world.scene);
  private readonly streamStatus=document.createElement("div");
  private readonly car = new Car();
  private readonly cockpit = new CockpitCamera(this.world.frame);
  private readonly interior = new Cockpit(this.world.scene);
  private readonly input = new Input();
  private controlsPanel!:ControlsPanel;
  private saveButton!:HTMLButtonElement;
  private saveStatus!:HTMLElement;
  private hasStarted=false;
  private readonly parking = new Parking();
  private readonly mission = new Mission();
  private readonly hud: InstanceType<typeof Hud>;
  private screen: Screen = "briefing";
  private previousTime = 0;
  private accumulator = 0;
  private districtSwitchReady = false;
  private ignorePauseUntil = 0;
  private missionRevision = -1;
  private waitForDrivingRelease = false;

  constructor(root: HTMLElement) {
    this.renderer.setPixelRatio(1);
    this.renderer.domElement.id = "viewport";
    this.renderer.domElement.tabIndex = -1;
    this.renderer.domElement.setAttribute(
      "aria-label",
      `First-person view of ${district.name}`,
    );
    root.append(this.renderer.domElement);
    this.streamStatus.id="stream-status";this.streamStatus.hidden=true;this.streamStatus.setAttribute("role","status");root.append(this.streamStatus);
    if(this.timingPanel){this.timingPanel.id="performance-stats";this.timingPanel.setAttribute("aria-label","CPU profiling timings");root.append(this.timingPanel);}
    this.hud = new Hud(root, () => this.activate(), () => this.requestInformation(),accept=>this.chooseOffer(accept));
    this.hud.setBindings(this.input.bindings);
    this.settingsPanel=new SettingsPanel(this.settings,()=>{this.resize();this.world.setDetail(this.settings.detail);});
    this.controlsPanel=new ControlsPanel(this.input.bindings,()=>this.hud.setBindings(this.input.bindings));
    this.settingsPanel.addAction('Change controls',()=>this.controlsPanel.open());
    this.saveButton=this.settingsPanel.addAction('Save shift',()=>this.save());
    this.settingsPanel.addAction('Continue saved shift',()=>this.load());
    this.saveStatus=document.createElement('p');this.saveStatus.setAttribute('role','status');this.saveStatus.className='save-status';
    this.saveButton.parentElement!.append(this.saveStatus);
    this.world.setDetail(this.settings.detail);
    this.renderer.domElement.addEventListener("click", () => {
      if(this.screen!=="running" || document.pointerLockElement===this.renderer.domElement)return;
      try { const result=this.renderer.domElement.requestPointerLock(); result?.catch(()=>this.hud.setHint("Mouse look could not capture the pointer. Click the windshield again, or use the right stick / Q and E.")); }
      catch { this.hud.setHint("Click the windshield to capture mouse look, or use the right stick / Q and E."); }
    });
    document.addEventListener("pointerlockchange", () => {
      const captured=document.pointerLockElement===this.renderer.domElement;
      if(captured&&this.screen!=="running") {this.releaseMouseLook();return;}
      this.input.setMouseCaptured(captured);
      if(!captured&&this.screen==="running") {this.pause();this.ignorePauseUntil=performance.now()+250;}
    });
    window.addEventListener("pointerdown",()=>this.sound.unlock());
    window.addEventListener("keydown",()=>this.sound.unlock());
    window.addEventListener("pagehide",()=>{this.sound.dispose();if(this.world instanceof StreamingWorld)this.world.dispose();},{once:true});
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("blur", () => this.pause());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pause();
    });
    this.renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.pause();
      this.hud.setHint(
        "Graphics context interrupted. Restart the application to continue.",
      );
    });
    this.cockpit.update(1, this.car, 0);
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  private resize() {
    const width = window.innerWidth,
      height = window.innerHeight;
    const size=renderSize(width,height,this.settings.resolution,window.devicePixelRatio||1);
    this.renderer.setSize(size.width,size.height,false);
    this.renderer.domElement.classList.toggle('pixel-picture',this.settings.resolution!=='sharp');
    this.cockpit.camera.aspect = width / height;
    this.cockpit.camera.updateProjectionMatrix();
  }

  private pause() {
    if (this.screen === "running" || this.screen === "atlas" || this.screen==='offer') {
      this.screen = "paused";
      this.accumulator = 0;
      this.releaseMouseLook();
    }
  }

  private releaseMouseLook() {
    this.input.setMouseCaptured(false);
    if(document.pointerLockElement===this.renderer.domElement)document.exitPointerLock();
  }

  private activate() {
    if (this.screen === "running") return;
    if(this.screen === "atlas")this.waitForDrivingRelease=true;
    if (this.screen === "briefing" || this.screen === "result") {
      this.hasStarted=true;
      this.car.reset();
      this.parking.reset();
      this.mission.reset();
      if(this.mission.taxiMode){
        try{
          const key=`cerea-last-opening-${district.id}`;
          const pair=()=>`${this.mission.pickupStop!.id}/${this.mission.destinationStop!.id}`;
          if(localStorage.getItem(key)===pair())this.mission.declineOffer();
          localStorage.setItem(key,pair());
        }catch{/* Dispatch still works without persistent browser storage. */}
      }
      this.hud.resetAtlasNotes();
      this.cockpit.reset();
      this.motion.reset();
      this.hud.setHint(
        district.mission.hint,
      );
      this.cockpit.update(1, this.car, 0);
    }
    this.sound.unlock();
    this.screen = "running";
    this.waitForDrivingRelease=true;
    this.accumulator = 0;
    this.renderer.domElement.focus({ preventScroll: true });
  }

  private chooseOffer(accept:boolean){
    if(this.screen!=='offer')return;
    if(accept){this.mission.acceptOffer();this.screen='running';this.waitForDrivingRelease=true;}
    else {this.mission.declineOffer();this.mission.quoteOffer(this.car);}
    this.hud.setBindings(this.input.bindings);this.accumulator=0;
  }

  private save(){
    if(!this.hasStarted||this.mission.finished)return;
    try{
      const {x,z,heading,speed,gear,steering,collisions}=this.car;
      const value:SaveData={version:1,district:district.id,map:mapSignature(context),savedAt:new Date().toISOString(),
        car:{x,z,heading,speed,gear,steering,collisions},unsafeStops:this.parking.unsafeStops,mission:this.mission.snapshot(),atlas:this.hud.saveAtlas()};
      decodeSave(context,JSON.stringify(value));
      localStorage.setItem(saveKey(context),JSON.stringify(value));
      this.saveStatus.textContent=`Saved ${this.mission.clockText}. Continue saved shift restores this district. Starting a new shift keeps the save until you explicitly save again.`;
    }catch{this.saveStatus.textContent='Save failed. Storage is unavailable or full; the previous save has been kept.';}
  }

  private load(){
    try{
      const text=localStorage.getItem(saveKey(context));
      if(!text){this.saveStatus.textContent='No saved shift for this district yet.';return;}
      const value=decodeSave(context,text);
      this.mission.restore(value.mission);Object.assign(this.car,value.car);
      this.parking.reset();this.parking.unsafeStops=value.unsafeStops;this.parking.update(0,this.car,this.car.speed);
      this.hud.restoreAtlas(value.atlas);this.world.updateFrame(this.car);
      this.cockpit.reset();this.motion.reset();this.cockpit.update(1,this.car,0);
      this.hasStarted=true;this.screen='paused';this.accumulator=0;this.waitForDrivingRelease=true;this.releaseMouseLook();
      this.saveStatus.textContent=`Loaded ${this.mission.clockText}. Paused; resume when ready.`;
    }catch{this.saveStatus.textContent='Could not load this save: it is unavailable, damaged or belongs to an older map. Your current shift and stored save have been kept.';}
  }

  private requestInformation() {
    if (this.screen !== "running" && this.screen !== "atlas") return;
    if (this.mission.recordDirectionRequest(this.parking.stopped, this.parking.legal)) {
      const message = directionHint(this.car, this.car.heading, this.mission.target);
      this.hud.setHint(message);
      this.hud.confirmAtlasPosition(this.car, this.parking.zone);
      this.hud.setAtlasInformation(message);
    } else this.hud.setHint("Come to a complete stop first. Hold the handbrake, then ask again.");
  }

  private frame(time: number) {
    const dt = this.previousTime
      ? Math.min((time - this.previousTime) / 1000, 0.1)
      : 0;
    this.previousTime = time;
    this.input.context=this.screen==='atlas'?'atlas':this.screen==='running'?'driving':'menu';
    const actions = this.input.poll();
    const menu=this.input.settingsInput;
    const editing=this.controlsPanel.visible;
    this.controlsPanel.update(dt,this.input.currentPad);
    if(editing){actions.interact=false;actions.pause=false;actions.atlasPage=0;}
    if(this.settingsPanel.update(!editing&&(this.screen==="briefing"||this.screen==="paused"),dt,menu.move,menu.confirm)&&!menu.keyboardConfirm)actions.interact=false;
    this.saveButton.disabled=!this.hasStarted||this.mission.finished;
    if(this.screen==='running'&&this.waitForDrivingRelease&&this.input.drivingReleased===false){
      actions.interact=false;actions.information=false;actions.atlas=false;actions.reminder=false;actions.shiftGear=false;actions.glance=0;actions.resetLook=false;
    }
    if (this.screen === "briefing" && actions.glance === 0) this.districtSwitchReady = true;
    if (this.screen === "briefing" && this.districtSwitchReady && actions.atlasPage) {
      this.districtSwitchReady = false;
      const index=availableDistricts.findIndex((map)=>map.id===district.id);
      selectDistrict(availableDistricts[(index+availableDistricts.length+Math.sign(actions.atlasPage))%availableDistricts.length].id);
      return;
    }
    if (this.input.controllerDisconnected) {
      this.pause();
      this.hud.setHint("Controller disconnected. Reconnect and press A / Cross, or Enter on the keyboard, to resume.");
    }
    if (this.screen === "running" && !this.input.controllerDisconnected && !this.waitForDrivingRelease && actions.shiftGear) {
      if (this.parking.stopped && actions.throttle < .1 && this.car.shiftGear())
        this.hud.setHint(`${this.car.gear === "R" ? "Reverse" : "Forward"} selected. ${bindingLabel(this.input.bindings,'throttle',this.input.device==='Controller')} accelerates; ${bindingLabel(this.input.bindings,'brake',this.input.device==='Controller')} brakes.`);
      else this.hud.setHint(`Stop fully and release the accelerator before switching forward / reverse (${bindingLabel(this.input.bindings,'shiftGear',this.input.device==='Controller')}).`);
    }
    if(this.screen==='offer'){
      if(actions.pause)this.pause();
      else if(actions.declineOffer)this.chooseOffer(false);
      else if(actions.interact)this.chooseOffer(true);
    } else if (this.screen === "atlas") {
      if (actions.atlas || actions.back || actions.pause) this.activate();
      else {
        if (actions.atlasPage) this.hud.turnAtlasPage(actions.atlasPage);
        this.hud.controlAtlasView(dt,actions.atlasZoom,actions.atlasZoomStep,actions.atlasPanX,actions.atlasPanY,actions.resetLook);
        this.hud.moveAtlasCursor(dt, actions.atlasMoveX, actions.atlasMoveY);
        if (actions.information) this.requestInformation();
        else if (actions.interact) this.hud.placeAtlasMarker();
        if (actions.clearMarker) this.hud.removeAtlasMarker();
      }
    } else if (!this.input.controllerDisconnected) {
      if (actions.pause && performance.now() >= this.ignorePauseUntil) {
        if (this.screen !== "running") this.activate();
        else this.pause();
      }
      if (actions.interact) {
        if(this.screen !== "running")this.activate();
        else if(this.mission.taxiMode) {
          if(!this.mission.serveAtStop(this.car,this.parking.stopped))this.hud.setHint(`Stop in ${this.mission.target.bay.name} at ${this.mission.target.name}, then press ${bindingLabel(this.input.bindings,'interact',this.input.device==='Controller')} to ${this.mission.taxiStage === "pickup" ? "collect" : "drop off"} ${this.mission.passenger}.`);
        }
      }
      if (actions.information) this.requestInformation();
      if (actions.reminder && this.screen === "running") {
        this.hud.remindMission(this.mission);
      }
      if (actions.atlas && this.screen === "running") {
        if (this.parking.stopped && this.car.speed === 0) {
          this.screen = "atlas";
          this.accumulator = 0;
          this.releaseMouseLook();
        } else {
          this.hud.setHint(`Come to a complete stop before opening the atlas. Hold the handbrake, then press ${bindingLabel(this.input.bindings,'atlas',this.input.device==='Controller')}.`);
        }
      }
    }
    this.world.updateFrame(this.car);
    const worldReady=!(this.world instanceof StreamingWorld)||this.world.readyAt(this.car);
    this.streamStatus.hidden=worldReady||this.screen!=="running";
    this.streamStatus.textContent=this.world instanceof StreamingWorld&&this.world.stream.recovering?'Scenery load interrupted. Retrying automatically… time is paused. Restart the application if it persists.':'Loading scenery… simulation time is paused.';
    if(this.screen==="running"&&!worldReady)this.accumulator=0;
    if (this.screen === "running"&&worldReady) {
      if(this.waitForDrivingRelease&&actions.throttle<.1&&actions.brake<.1&&(this.input.drivingReleased??true))this.waitForDrivingRelease=false;
      const driving=this.waitForDrivingRelease?{...actions,throttle:0,brake:0,steer:0,handbrake:false}:actions;
      this.accumulator += dt;
      // Fixed 60 Hz simulation keeps handling consistent across render rates.
      while (this.accumulator >= 1 / 60) {
        const physicsStart=context.profile.start();
        this.car.update(1 / 60, driving, this.world.collisionIndex);
        this.parking.update(1 / 60, this.car, this.car.speed);
        this.mission.update(1 / 60, this.car, this.parking.stopped);
        context.profile.end("physics-step",physicsStart);
        this.accumulator -= 1 / 60;
        if (this.mission.finished) {
          this.screen = "result";
          this.accumulator = 0;
          this.releaseMouseLook();
          break;
        }
      }
      this.world.updateFrame(this.car);
      this.cockpit.update(dt, this.car, actions.glance, actions);
    }
    if(this.screen==='running'&&this.mission.offerPending&&this.parking.stopped){this.mission.quoteOffer(this.car);this.screen='offer';this.accumulator=0;this.releaseMouseLook();}
    if(this.mission.revision!==this.missionRevision) {
      this.missionRevision=this.mission.revision;
      if(this.mission.taxiMode)this.hud.setTaxiMessage(this.mission.notice);
    }
    if(this.mission.taxiMode)this.world.updateDaylight(this.mission.clockHours);
    this.hud.show(this.screen, this.mission, this.car, this.parking);
    this.hud.update(
      this.car,
      this.mission,
      this.parking,
      this.input.device,
      this.input.gamepadBlocked,
      this.input.controllerStatus,
    );
    this.sound.update(dt,this.screen==='running',this.car.speed,this.car.gear,this.car.steering,this.settings);
    if(this.screen==='running')this.motion.update(dt,this.car.speed,this.car.steering,this.settings.motion);
    this.people.update(this.mission,this.world.frame,this.car);
    this.interior.setPassenger(this.mission.unfinishedPassenger?this.mission.pickupStop!.id:'');
    this.interior.update({...this.car,...this.world.frame.toLocal(this.car)},this.motion.roll,this.motion.pitch,this.motion.wobble);
    const renderStart=context.profile.start();
    this.interior.renderMirrors(this.renderer,this.world.scene,dt);
    if(this.settings.resolution==='sharp')this.renderer.render(this.world.scene, this.cockpit.camera);
    else this.retro.render(this.renderer,this.world.scene,this.cockpit.camera);
    context.profile.end("render",renderStart);
    if(this.timingPanel&&time>=this.timingRefresh){this.timingRefresh=time+500;this.timingPanel.textContent=context.profile.text()+(this.world instanceof StreamingWorld?`\ntiles: ${this.world.stream.resident.size} resident · ${this.world.stream.stats.loads} loads / ${this.world.stream.stats.unloads} unloads`:"");}
  }
}
return {Game};
}
export type Game=InstanceType<ReturnType<typeof createGame>["Game"]>;
