import { inRect, type Point } from "../world/district";
import { District } from "../world/district";
export function createParking(context:District){
const {district,parkingZones}=context;
class Parking {
  private stillTime = 0;
  private armed = false;
  unsafeStops = 0;
  stopped = false;
  zone: string | undefined;
  get legal() { return district.stoppingPolicy === "anywhere" || Boolean(this.zone); }

  reset() {
    this.stillTime = 0;
    this.armed = false;
    this.unsafeStops = 0;
    this.stopped = false;
    this.zone = undefined;
  }

  update(dt: number, position: Point, speed: number) {
    this.zone = parkingZones.find((z) => inRect(position, z, 1.1))?.name;
    // Exact zero is set by the car's low-speed settling or handbrake.
    this.stillTime = speed === 0 ? this.stillTime + dt : 0;
    this.stopped = this.stillTime >= 0.45;
    if (Math.abs(speed) > 1) this.armed = true;
    if (this.stopped && this.armed) {
      if (!this.legal) this.unsafeStops++;
      this.armed = false;
    }
  }
}
return {Parking};
}
export type Parking=InstanceType<ReturnType<typeof createParking>["Parking"]>;
