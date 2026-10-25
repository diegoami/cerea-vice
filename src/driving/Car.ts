import type { Actions } from "../input/Input";
import { district, inRect, isPaved, spawn, type Rect } from "../world/district";

export class Car {
  x = spawn.x;
  z = spawn.z;
  heading = spawn.heading;
  speed = 0;
  gear: "D" | "R" = "D";
  steering = 0;
  collisions = 0;
  private impactCooldown = 0;

  reset() {
    this.x = spawn.x;
    this.z = spawn.z;
    this.heading = spawn.heading;
    this.speed = 0;
    this.gear = "D";
    this.steering = 0;
    this.collisions = 0;
    this.impactCooldown = 0;
  }

  shiftGear(): boolean {
    if (this.speed !== 0) return false;
    this.gear = this.gear === "D" ? "R" : "D";
    return true;
  }

  update(dt: number, input: Actions, colliders: Rect[]) {
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    this.steering += (input.steer - this.steering) * Math.min(1, dt * 7);
    const paved = isPaved(this);
    const drag = paved ? 0.45 : 2.4;
    // The trigger controls speed in the explicitly selected direction. Braking
    // removes motion and cannot cross zero or select another gear.
    const direction = this.gear === "D" ? 1 : -1;
    let magnitude = Math.max(0, this.speed * direction);
    magnitude += (input.throttle * (this.gear === "D" ? 9 : 5) - magnitude * drag) * dt;
    magnitude = Math.max(0, magnitude - input.brake * 19 * dt);
    if (input.handbrake) magnitude = Math.max(0, magnitude - 28 * dt);
    if (!input.throttle && magnitude < .12) magnitude = 0;
    magnitude = Math.min(this.gear === "R" ? 6 : paved ? 21 : 7, magnitude);
    this.speed = magnitude === 0 ? 0 : direction * magnitude;
    const grip = input.handbrake ? 1.4 : 1;
    this.heading +=
      (((this.steering * this.speed) / 2.8) * 0.6 * grip * dt) /
      (1 + Math.abs(this.speed) * 0.07);
    this.heading = (this.heading + Math.PI * 2) % (Math.PI * 2);
    const next = {
      x: this.x + Math.sin(this.heading) * this.speed * dt,
      z: this.z - Math.cos(this.heading) * this.speed * dt,
    };
    const hit =
      next.x < district.bounds.minX + 1 || next.x > district.bounds.maxX - 1 ||
      next.z < district.bounds.minZ + 1 || next.z > district.bounds.maxZ - 1 ||
      colliders.some((r) => inRect(next, r, -1.05));
    if (hit) {
      if (Math.abs(this.speed) > 1 && this.impactCooldown === 0) {
        this.collisions++;
        this.impactCooldown = 0.9;
      }
      this.speed = 0;
    } else {
      this.x = next.x;
      this.z = next.z;
    }
  }
}
