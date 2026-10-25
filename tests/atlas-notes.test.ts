import { test } from "node:test";
import assert from "node:assert/strict";
import { AtlasNotes } from "../src/navigation/AtlasNotes";

test("a manual atlas pin stays at its placed location while the crosshair moves", () => {
  const notes = new AtlasNotes();
  assert.deepEqual(notes.marker, {x:-52,z:90});
  notes.pointAt({ x: 93, z: -44 });
  notes.place();
  assert.equal(notes.source, "estimate");
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
  notes.pointAt({x:0,z:0});
  notes.move(1, 1, 1);
  assert.ok(Math.abs(Math.hypot(notes.cursor.x, notes.cursor.z) - 70) < 0.001);
  notes.move(10, 1, -1);
  assert.deepEqual(notes.cursor, {x:120, z:-120});
  notes.pointAt({x:-500,z:500});
  assert.deepEqual(notes.cursor, {x:-120,z:120});
});


test("information replaces an estimate with a snapshot, and retry resets to the known start", () => {
  const notes = new AtlasNotes();
  notes.pointAt({x:93,z:-44});
  notes.place();
  const informedPosition = {x:0,z:30};
  notes.confirm(informedPosition, "Central Avenue, Old Town");
  assert.equal(notes.source, "confirmed");
  assert.equal(notes.label, "Central Avenue, Old Town");
  assert.deepEqual(notes.marker, informedPosition);
  informedPosition.x = 50;
  assert.equal(notes.marker?.x, 0, "The marker is a snapshot, not a live reference");
  notes.move(1,1,0);
  assert.equal(notes.marker?.x, 0);
  notes.reset();
  assert.deepEqual(notes.marker, {x:-52,z:90});
  assert.equal(notes.source, "start");
});
