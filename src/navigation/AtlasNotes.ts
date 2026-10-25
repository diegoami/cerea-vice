import type { Point } from "../world/district";

const bounded = (value: number) => Math.max(-120, Math.min(120, value));

/** Personal pencil marks, independent of the vehicle and mission. Kept for this session. */
export class AtlasNotes {
  cursor: Point = { x: 0, z: 0 };
  marker: Point | undefined;

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
  }

  remove() {
    this.marker = undefined;
  }
}
