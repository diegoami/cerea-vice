import { PerspectiveCamera } from "three";
import type { Car } from "./Car";

export class CockpitCamera {
  readonly camera = new PerspectiveCamera(70, 1, 0.1, 450);
  private glance = 0;

  update(dt: number, car: Car, glance: number) {
    this.glance += (glance * 1.05 - this.glance) * Math.min(1, dt * 9);
    const angle = car.heading + this.glance;
    this.camera.position.set(car.x, 2.05, car.z);
    this.camera.lookAt(
      car.x + Math.sin(angle) * 30,
      1.65,
      car.z - Math.cos(angle) * 30,
    );
  }
}
