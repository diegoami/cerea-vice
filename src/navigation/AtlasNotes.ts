import { spawn, type Point } from "../world/district";

const bounded = (value: number) => Math.max(-120, Math.min(120, value));

/** Personal pencil marks, independent of the vehicle and mission. Kept for this session. */
export class AtlasNotes {
  cursor: Point = { x: spawn.x, z: spawn.z };
  marker: Point | undefined = { x: spawn.x, z: spawn.z };
  source: "start" | "confirmed" | "estimate" = "start";
  label = "Harbor lay-by";

  reset() {
    this.cursor = { x: spawn.x, z: spawn.z };
    this.marker = { ...this.cursor };
    this.source = "start";
    this.label = "Harbor lay-by";
  }

  confirm(position: Point, label: string) {
    this.marker = { x: position.x, z: position.z };
    this.cursor = { ...this.marker };
    this.source = "confirmed";
    this.label = label;
  }

  move(dt: number, x: number, z: number): boolean {
    const length = Math.max(1, Math.hypot(x, z));
    const next = {
      x: bounded(this.cursor.x + (x / length) * 70 * dt),
      z: bounded(this.cursor.z + (z / length) * 70 * dt),
    };
    const changed = next.x !== this.cursor.x || next.z !== this.cursor.z;
    this.cursor = next;
    return changed;
  }

  pointAt(point: Point) {
    this.cursor = { x: bounded(point.x), z: bounded(point.z) };
  }

  place() {
    this.marker = { ...this.cursor };
    this.source = "estimate";
  }

  remove() {
    this.marker = undefined;
  }
}
