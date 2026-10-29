import type { Actions } from "../input/Input";
import { SpatialGrid } from "../world/SpatialGrid";
import { inRect, type Rect } from "../world/district";
import { District } from "../world/district";
export function createCar(context:District){
const {district,isPaved,spawn}=context;
class Car {
  x = spawn.x;
  z = spawn.z;
  heading = spawn.heading;
  speed = 0;
  gear: "D" | "R" = "D";
  steering = 0;
  collisions = 0;
  /** No top speed on paved roads (the "Top speed: No limit" setting). Reverse and grass keep their limits. */
  unlimited = false;
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

  update(dt: number, input: Actions, colliders: Rect[] | SpatialGrid<Rect>) {
    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    this.steering += (input.steer - this.steering) * Math.min(1, dt * 7);
    const paved = isPaved(this);
    // The trigger controls speed in the explicitly selected direction. Braking
    // removes motion and cannot cross zero or select another gear.
    const direction = this.gear === "D" ? 1 : -1;
    let magnitude = Math.max(0, this.speed * direction);
    // Normally drag grows with speed and levels the car off near 20 m/s. With no top speed it stops
    // growing past 15 m/s: the same feel in town, while full throttle keeps gaining on open roads.
    // Leaving the road fast brakes hard (about 2.5 g) instead of stopping dead at the grass limit.
    const resistance = paved
      ? (this.unlimited ? Math.min(magnitude * 0.45, 6.75) : magnitude * 0.45)
      : (this.unlimited ? Math.min(magnitude * 2.4, 16.8) + (magnitude > 7 ? 8 : 0) : magnitude * 2.4);
    magnitude += (input.throttle * (this.gear === "D" ? 9 : 5) - resistance) * dt;
    magnitude = Math.max(0, magnitude - input.brake * 19 * dt);
    if (input.handbrake) magnitude = Math.max(0, magnitude - 28 * dt);
    if (!input.throttle && magnitude < .12) magnitude = 0;
    magnitude = Math.min(this.gear === "R" ? 6 : this.unlimited ? Infinity : paved ? 21 : 7, magnitude);
    this.speed = magnitude === 0 ? 0 : direction * magnitude;
    const grip = input.handbrake ? 1.4 : 1;
    this.heading +=
      (((this.steering * this.speed) / 2.8) * 0.6 * grip * dt) /
      (1 + Math.abs(this.speed) * 0.07);
    this.heading = (this.heading + Math.PI * 2) % (Math.PI * 2);
    // Move in steps of at most half a metre, so high speed cannot skip through a wall or a corner.
    const steps = Math.max(1, Math.ceil((Math.abs(this.speed) * dt) / 0.5));
    for (let step = 0; step < steps; step++) {
      const next = {
        x: this.x + (Math.sin(this.heading) * this.speed * dt) / steps,
        z: this.z - (Math.cos(this.heading) * this.speed * dt) / steps,
      };
      const hit =
        next.x < district.bounds.minX + 1 || next.x > district.bounds.maxX - 1 ||
        next.z < district.bounds.minZ + 1 || next.z > district.bounds.maxZ - 1 ||
        (colliders instanceof SpatialGrid?colliders.at(next,1.05):colliders).some((r) => inRect(next, r, -1.05));
      if (hit) {
        if (Math.abs(this.speed) > 1 && this.impactCooldown === 0) {
          this.collisions++;
          this.impactCooldown = 0.9;
        }
        this.speed = 0;
        break;
      }
      this.x = next.x;
      this.z = next.z;
    }
  }
}
return {Car};
}
export type Car=InstanceType<ReturnType<typeof createCar>["Car"]>;
