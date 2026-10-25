import { district, hotelBay, inRect, type Point } from "../world/district";

export type MissionState = "active" | "overdue" | "success" | "late";
export class Mission {
  readonly duration = district.mission.duration;
  readonly objective = district.mission.objective;
  directionRequests = { legal: 0, unsafe: 0 };
  elapsed = 0;
  state: MissionState = "active";
  get remaining() {
    return Math.max(0, this.duration - this.elapsed);
  }
  get finished() {
    return this.state === "success" || this.state === "late";
  }
  get directionRequestCount() {
    return this.directionRequests.legal + this.directionRequests.unsafe;
  }
  reset() {
    this.elapsed = 0;
    this.state = "active";
    this.directionRequests = { legal: 0, unsafe: 0 };
  }

  recordDirectionRequest(stopped: boolean, legallyParked: boolean): boolean {
    if (!stopped || this.finished) return false;
    this.directionRequests[legallyParked ? "legal" : "unsafe"]++;
    return true;
  }

  update(dt: number, position: Point, stopped: boolean) {
    if (this.finished) return;
    this.elapsed += dt;
    if (this.elapsed > this.duration) this.state = "overdue";
    if (stopped && inRect(position, hotelBay, 1.1))
      this.state = this.elapsed <= this.duration ? "success" : "late";
  }
}
