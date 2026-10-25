import type { Actions } from "../input/Input";
import { district, inRect, isPaved, spawn, type Rect } from "../world/district";

export class Car {
  x = spawn.x;
  z = spawn.z;
  heading = spawn.heading;
  speed = 0;
  steering = 0;
  collisions = 0;
  private impactCooldown = 0;

  reset() {
    this.x = spawn.x;
    this.z = spawn.z;
    this.heading = spawn.heading;
    this.speed = 0;
    this.steering = 0;
    this.collisions = 0;
    this.impactCooldown = 0;
  }

  update(dt: number, input: Actions, colliders: Rect[]) {
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    this.steering += (input.steer - this.steering) * Math.min(1, dt * 7);
    const paved = isPaved(this);
    const drag = paved ? 0.45 : 2.4;
    // Holding brake slows forward motion first, then smoothly engages reverse.
    let acceleration = input.throttle * (this.speed < -0.2 ? 17 : 9);
    acceleration -= input.brake * (this.speed > 0.2 ? 19 : 5);
    this.speed += (acceleration - this.speed * drag) * dt;
    if (input.handbrake)
      this.speed =
        Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - 28 * dt);
    if (!input.throttle && !input.brake && Math.abs(this.speed) < 0.12)
      this.speed = 0;
    this.speed = Math.max(-6, Math.min(paved ? 21 : 7, this.speed));
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
      this.speed *= -0.22;
    } else {
      this.x = next.x;
      this.z = next.z;
    }
  }
}
