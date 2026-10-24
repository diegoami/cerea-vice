import { WebGLRenderer } from "three";
import { Car } from "../driving/Car";
import { CockpitCamera } from "../driving/CockpitCamera";
import { Input } from "../input/Input";
import { directionHint } from "../navigation/Navigation";
import { Parking } from "../navigation/Parking";
import { Mission } from "../mission/Mission";
import { World } from "../world/World";
import { Hud, type Screen } from "../ui/Hud";

export class Game {
  private readonly renderer = new WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
  });
  private readonly world = new World();
  private readonly car = new Car();
  private readonly cockpit = new CockpitCamera();
  private readonly input = new Input();
  private readonly parking = new Parking();
  private readonly mission = new Mission();
  private readonly hud: Hud;
  private screen: Screen = "briefing";
  private previousTime = 0;
  private accumulator = 0;

  constructor(root: HTMLElement) {
    this.renderer.setPixelRatio(1);
    this.renderer.domElement.id = "viewport";
    this.renderer.domElement.tabIndex = -1;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "First-person view of Harbor District",
    );
    root.append(this.renderer.domElement);
    this.hud = new Hud(root, () => this.activate());
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
    const scale = Math.min(1, 960 / width);
    this.renderer.setSize(
      Math.round(width * scale),
      Math.round(height * scale),
      false,
    );
    this.cockpit.camera.aspect = width / height;
    this.cockpit.camera.updateProjectionMatrix();
  }

  private pause() {
    if (this.screen === "running") {
      this.screen = "paused";
      this.accumulator = 0;
    }
  }

  private activate() {
    if (this.screen === "running") return;
    if (this.screen === "briefing" || this.screen === "result") {
      this.car.reset();
      this.parking.reset();
      this.mission.reset();
      this.hud.setHint(
        "Blue Hotel is on East Quay, northeast of here. Follow the street signs. Stop anywhere to ask for more.",
      );
      this.cockpit.update(1, this.car, 0);
    }
    this.screen = "running";
    this.accumulator = 0;
    this.renderer.domElement.focus({ preventScroll: true });
  }

  private frame(time: number) {
    const dt = this.previousTime
      ? Math.min((time - this.previousTime) / 1000, 0.1)
      : 0;
    this.previousTime = time;
    const actions = this.input.poll();
    if (actions.pause) {
      if (this.screen === "paused") this.activate();
      else this.pause();
    }
    if (actions.interact) {
      if (this.screen !== "running") this.activate();
      else if (
        this.mission.recordDirectionRequest(
          this.parking.stopped,
          Boolean(this.parking.zone),
        )
      )
        this.hud.setHint(directionHint(this.car, this.car.heading));
      else
        this.hud.setHint(
          "Come to a complete stop first. Hold the handbrake, then ask again.",
        );
    }
    if (actions.reminder && this.screen === "running") {
      this.hud.remindMission(this.mission);
    }
    if (this.screen === "running") {
      this.accumulator += dt;
      // Fixed 60 Hz simulation keeps handling consistent across render rates.
      while (this.accumulator >= 1 / 60) {
        this.car.update(1 / 60, actions, this.world.colliders);
        this.parking.update(1 / 60, this.car, this.car.speed);
        this.mission.update(1 / 60, this.car, this.parking.stopped);
        this.accumulator -= 1 / 60;
        if (this.mission.finished) {
          this.screen = "result";
          this.accumulator = 0;
          break;
        }
      }
      this.cockpit.update(dt, this.car, actions.glance);
    }
    this.hud.show(this.screen, this.mission, this.car, this.parking);
    this.hud.update(
      this.car,
      this.mission,
      this.parking,
      this.input.device,
      this.input.gamepadBlocked,
    );
    this.renderer.render(this.world.scene, this.cockpit.camera);
  }
}
