import { test } from "node:test";
import assert from "node:assert/strict";
import { Parking } from "../src/navigation/Parking";
import { parkingZones, spawn } from "../src/world/district";

const bay = (id: string) => parkingZones.find((zone) => zone.id === id)!;

test("last known position starts at Harbor lay-by and updates only after a settled legal stop", () => {
  const parking = new Parking();
  assert.equal(parking.lastKnownZone.id, "harbor");
  parking.update(1, bay("market"), 4);
  assert.equal(parking.lastKnownZone.id, "harbor", "Passing through a parking bay does not update it");
  parking.update(0.3, bay("market"), 0);
  assert.equal(parking.lastKnownZone.id, "harbor", "An unsettled stop does not update it");
  parking.update(0.2, bay("market"), 0);
  assert.equal(parking.lastKnownZone.id, "market");
  parking.update(1, bay("tower"), 0.01);
  assert.equal(parking.lastKnownZone.id, "market", "Creeping is not a full stop");
  parking.update(1, bay("tower"), 0);
  assert.equal(parking.lastKnownZone.id, "tower");
});

test("driving, unsafe stops and stops at a bay edge preserve the last confirmed parking spot", () => {
  const parking = new Parking();
  parking.update(1, bay("market"), 0);
  parking.update(1, {x: 0,z: 20}, 5);
  assert.equal(parking.lastKnownZone.id, "market");
  parking.update(1, {x: 0,z: 20}, 0);
  assert.equal(parking.stopped, true);
  assert.equal(parking.zone, undefined);
  assert.equal(parking.lastKnownZone.id, "market");
  parking.update(1, spawn, 3);
  parking.update(1, {x: bay("tower").x + bay("tower").width / 2, z: bay("tower").z}, 0);
  assert.equal(parking.lastKnownZone.id, "market");
  parking.reset();
  assert.equal(parking.lastKnownZone.id, "harbor", "Retry returns the marker to the starting bay");
});
