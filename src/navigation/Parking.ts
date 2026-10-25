import { inRect, parkingZones, spawn, type Point } from "../world/district";

export class Parking {
  private stillTime = 0;
  private armed = false;
  unsafeStops = 0;
  stopped = false;
  zone: string | undefined;
  lastKnownZone = parkingZones.find((zone) => inRect(spawn, zone, 1.1))!;

  reset() {
    this.stillTime = 0;
    this.armed = false;
    this.unsafeStops = 0;
    this.stopped = false;
    this.zone = undefined;
    this.lastKnownZone = parkingZones.find((zone) => inRect(spawn, zone, 1.1))!;
  }

  update(dt: number, position: Point, speed: number) {
    const legalZone = parkingZones.find((zone) => inRect(position, zone, 1.1));
    this.zone = legalZone?.name;
    // Exact zero is set by the car's low-speed settling or handbrake.
    this.stillTime = speed === 0 ? this.stillTime + dt : 0;
    this.stopped = this.stillTime >= 0.45;
    if (this.stopped && legalZone) this.lastKnownZone = legalZone;
    if (Math.abs(speed) > 1) this.armed = true;
    if (this.stopped && this.armed) {
      if (!this.zone) this.unsafeStops++;
      this.armed = false;
    }
  }
}
