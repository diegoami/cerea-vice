import { test } from "node:test";
import assert from "node:assert/strict";
import { AtlasNotes } from "../src/navigation/AtlasNotes";

test("a manual atlas pin stays at its placed location while the crosshair moves", () => {
  const notes = new AtlasNotes();
  assert.equal(notes.marker, undefined);
  notes.pointAt({ x: 93, z: -44 });
  notes.place();
  notes.move(1, -1, 1);
  assert.deepEqual(notes.marker, { x: 93, z: -44 });
  assert.notDeepEqual(notes.cursor, notes.marker);
  notes.place();
  assert.deepEqual(notes.marker, notes.cursor);
  notes.remove();
  assert.equal(notes.marker, undefined);
});

test("atlas cursor stays inside the paper map and has consistent diagonal speed", () => {
  const notes = new AtlasNotes();
  notes.move(1, 1, 1);
  assert.ok(Math.abs(Math.hypot(notes.cursor.x, notes.cursor.z) - 70) < 0.001);
  notes.move(10, 1, -1);
  assert.deepEqual(notes.cursor, {x:120, z:-120});
  notes.pointAt({x:-500,z:500});
  assert.deepEqual(notes.cursor, {x:-120,z:120});
});
