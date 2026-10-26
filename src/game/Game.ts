import { district } from "../world/district";
import { availableDistricts, selectDistrict } from "../world/load";
import { WebGLRenderer } from "three";
import { Car } from "../driving/Car";
import { CockpitCamera } from "../driving/CockpitCamera";
import { Cockpit } from "../driving/Cockpit";
import { Input } from "../input/Input";
import { directionHint } from "../navigation/Navigation";
import { Parking } from "../navigation/Parking";
import { Mission } from "../mission/Mission";
import { World } from "../world/World";
import { Hud, type Screen } from "../ui/Hud";

export class Game {
  private readonly renderer = new WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  private readonly world = new World();
  private readonly car = new Car();
  private readonly cockpit = new CockpitCamera();
  private readonly interior = new Cockpit(this.world.scene);
  private readonly input = new Input();
  private readonly parking = new Parking();
  private readonly mission = new Mission();
  private readonly hud: Hud;
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
    this.hud = new Hud(root, () => this.activate(), () => this.requestInformation());
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
        "Graphics context interrupted. Reload the page to restart the prototype.",
      );
    });
    this.cockpit.update(1, this.car, 0);
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  private resize() {
    const width = window.innerWidth,
      height = window.innerHeight;
    const scale = Math.min(window.devicePixelRatio || 1, 2, 1920 / width);
    this.renderer.setSize(
      Math.round(width * scale),
      Math.round(height * scale),
      false,
    );
    this.cockpit.camera.aspect = width / height;
    this.cockpit.camera.updateProjectionMatrix();
  }

  private pause() {
    if (this.screen === "running" || this.screen === "atlas") {
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
      this.car.reset();
      this.parking.reset();
      this.mission.reset();
      this.hud.resetAtlasNotes();
      this.cockpit.reset();
      this.hud.setHint(
        district.mission.hint,
      );
      this.cockpit.update(1, this.car, 0);
    }
    this.screen = "running";
    this.accumulator = 0;
    this.renderer.domElement.focus({ preventScroll: true });
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
    const actions = this.input.poll();
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
    if (this.screen === "running" && !this.input.controllerDisconnected && actions.shiftGear) {
      if (this.parking.stopped && actions.throttle < .1 && this.car.shiftGear())
        this.hud.setHint(`${this.car.gear === "R" ? "Reverse" : "Forward"} selected. RT / W accelerates; LT / S brakes.`);
      else this.hud.setHint("Stop fully and release the accelerator before switching forward / reverse (B / Circle or R).");
    }
    if (this.screen === "atlas") {
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
          if(!this.mission.serveAtStop(this.car,this.parking.stopped))this.hud.setHint(`Stop in ${this.mission.target.bay.name} at ${this.mission.target.name}, then press A / Enter to ${this.mission.taxiStage === "pickup" ? "collect" : "drop off"} ${this.mission.passenger}.`);
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
          this.hud.setHint("Come to a complete stop before opening the atlas. Hold the handbrake, then press Y / Triangle or T.");
        }
      }
    }
    if (this.screen === "running") {
      if(this.waitForDrivingRelease&&actions.throttle<.1&&actions.brake<.1)this.waitForDrivingRelease=false;
      const driving=this.waitForDrivingRelease?{...actions,throttle:0,brake:0}:actions;
      this.accumulator += dt;
      // Fixed 60 Hz simulation keeps handling consistent across render rates.
      while (this.accumulator >= 1 / 60) {
        this.car.update(1 / 60, driving, this.world.colliders);
        this.parking.update(1 / 60, this.car, this.car.speed);
        this.mission.update(1 / 60, this.car, this.parking.stopped);
        this.accumulator -= 1 / 60;
        if (this.mission.finished) {
          this.screen = "result";
          this.accumulator = 0;
          this.releaseMouseLook();
          break;
        }
      }
      this.cockpit.update(dt, this.car, actions.glance, actions);
    }
    if(this.mission.revision!==this.missionRevision) {
      this.missionRevision=this.mission.revision;
      if(this.mission.taxiMode)this.hud.setTaxiMessage(this.mission.notice);
      this.world.setTaxiPassenger(this.mission.taxiMode&&!this.mission.finished&&this.mission.taxiStage==='pickup'?this.mission.target.bay:undefined);
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
    this.interior.update(this.car);
    this.interior.renderMirrors(this.renderer,this.world.scene,dt);
    this.renderer.render(this.world.scene, this.cockpit.camera);
  }
}
