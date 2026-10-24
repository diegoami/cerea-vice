import { test } from "node:test";
import assert from "node:assert/strict";
import { junctionDirections } from "../src/world/directions";
import { nodes, roads } from "../src/world/district";

test("hotel signs reverse left/right for opposite approaches to Central Crossroads", () => {
  const eastbound = junctionDirections("c", "w").find((row) => row.detail === "BLUE HOTEL");
  const northbound = junctionDirections("c", "s").find((row) => row.detail === "BLUE HOTEL");
  const southbound = junctionDirections("c", "n").find((row) => row.detail === "BLUE HOTEL");
  assert.equal(eastbound?.direction, "straight");
  assert.equal(northbound?.direction, "right");
  assert.equal(southbound?.direction, "left");
});

test("every junction approach signs every onward exit without a U-turn", () => {
  for (const node of nodes) {
    const connected = roads.filter((road) => road.a === node.id || road.b === node.id);
    for (const road of connected) {
      const from = road.a === node.id ? road.b : road.a;
      const rows = junctionDirections(node.id, from);
      assert.equal(rows.length, connected.length - 1);
      assert.equal(new Set(rows.map((row) => row.direction)).size, rows.length);
      assert.ok(rows.every((row) => row.text && row.detail));
    }
  }
  assert.equal(junctionDirections("s", "sw").find((row) => row.text === "CENTRAL AVENUE")?.direction, "left");
  assert.equal(junctionDirections("e", "c").find((row) => row.detail === "BLUE HOTEL")?.direction, "left");
});
