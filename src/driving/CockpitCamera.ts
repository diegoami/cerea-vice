import { PerspectiveCamera } from "three";
import type { Car } from "./Car";

export interface LookControls {
  lookX: number;
  lookY: number;
  mouseX: number;
  mouseY: number;
  resetLook: boolean;
}
const forwardPitch=-Math.atan2(.4,30);
export class CockpitCamera {
  readonly camera = new PerspectiveCamera(70, 1, .1, 1500);
  private glance = 0;
  private yaw = 0;
  private elevation = forwardPitch;
  get yawOffset() { return this.yaw; }
  get pitch() { return this.elevation; }

  reset() { this.yaw=0;this.elevation=forwardPitch;this.glance=0; }
  update(dt: number, car: Car, glance: number, look?:LookControls) {
    if(look?.resetLook)this.reset();
    else if(look) {
      this.yaw+=look.lookX*2.4*dt+look.mouseX*.0025;
      this.yaw=Math.atan2(Math.sin(this.yaw),Math.cos(this.yaw));
      this.elevation=Math.max(-Math.PI/3,Math.min(Math.PI/3,this.elevation-look.lookY*1.7*dt-look.mouseY*.0025));
    }
    this.glance+=(glance*1.05-this.glance)*Math.min(1,dt*9);
    const angle=car.heading+this.yaw+this.glance;
    const horizontal=Math.cos(this.elevation)*30;
    this.camera.position.set(car.x,2.05,car.z);
    this.camera.lookAt(car.x+Math.sin(angle)*horizontal,2.05+Math.sin(this.elevation)*30,car.z-Math.cos(angle)*horizontal);
  }
}
