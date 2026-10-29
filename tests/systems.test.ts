import { test } from "node:test";
import assert from "node:assert/strict";
import { createCar } from "../src/driving/Car";
import type { Actions } from "../src/input/Input";
import { createMission } from "../src/mission/Mission";
import { createParking } from "../src/navigation/Parking";
import { createNavigation } from "../src/navigation/Navigation";
import { District } from "../src/world/district";
import contextHarbor from "../public/maps/harbor.json";
let context=new District(contextHarbor);
let {hotelBay,nodes,roads,spawn}=context;
let {Car}=createCar(context);
let {Mission}=createMission(context);
let {Parking}=createParking(context);
let {compass,directionHint}=createNavigation(context);
const idle: Actions = {
  steer: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  glance: 0,
  interact: false,
  pause: false,
  reminder: false,
  atlas: false,
  back: false,
  declineOffer: false, requestFares: false, radioNext: false, refreshFares: false,
  atlasPage: 0,
  atlasMoveX: 0,
  atlasMoveY: 0,
  clearMarker: false,
  information: false,
  shiftGear: false,
  atlasZoom: 0, atlasZoomStep: 0, atlasPanX: 0, atlasPanY: 0,
  lookX: 0, lookY: 0, mouseX: 0, mouseY: 0, resetLook: false,
};
test("district contains a connected loop, T-junctions and crossroads", () => {
  const degrees = nodes.map(
    (n) => roads.filter((r) => r.a === n.id || r.b === n.id).length,
  );
  assert.ok(degrees.filter((d) => d === 3).length >= 2);
  assert.ok(degrees.includes(4));
  const reached = new Set([nodes[0].id]);
  for (let i = 0; i < nodes.length; i++)
    for (const road of roads) {
      if (reached.has(road.a)) reached.add(road.b);
      if (reached.has(road.b)) reached.add(road.a);
    }
  assert.equal(reached.size, nodes.length);
  assert.ok(roads.length >= nodes.length); // Connected graph has at least one cycle.
});
test("direction hints work on every road, reflect heading and handle off-road requests", () => {
  for (const road of roads) {
    const a = nodes.find((n) => n.id === road.a)!,
      b = nodes.find((n) => n.id === road.b)!;
    const point = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    for (let heading = 0; heading < Math.PI * 2; heading += Math.PI / 2) {
      const hint = directionHint(point, heading);
      assert.ok(hint.includes(road.name));
      assert.ok(hint.includes(`facing ${compass(heading)}`));
      assert.doesNotMatch(hint, /undefined|NaN|\bx:|\bz:/);
      assert.ok(hint.length < 260);
    }
  }
  assert.match(directionHint({ x: 40, z: 40 }, 0), /Near /);
  assert.match(directionHint({ x: 80, z: -42 }, 0), /forecourt/);
  assert.match(directionHint(spawn, Math.PI * 1.5), /Turn around safely/);
});
test("directions require a settled full stop; unsafe stops count once per stop episode", () => {
  const parking = new Parking();
  parking.update(1, { x: 0, z: 20 }, 5);
  parking.update(2, { x: 0, z: 20 }, 0.01);
  assert.equal(parking.stopped, false);
  parking.update(0.3, { x: 0, z: 20 }, 0);
  assert.equal(parking.stopped, false);
  parking.update(0.2, { x: 0, z: 20 }, 0);
  assert.equal(parking.stopped, true);
  assert.equal(parking.unsafeStops, 1);
  parking.update(10, { x: 0, z: 20 }, 0);
  assert.equal(parking.unsafeStops, 1);
  parking.update(1, spawn, 4);
  parking.update(1, spawn, 0);
  assert.equal(parking.zone, "Harbor lay-by");
  assert.equal(parking.unsafeStops, 1);
});
test("mission requires stopping inside the hotel bay and distinguishes late arrival", () => {
  const mission = new Mission();
  mission.update(30, hotelBay, false);
  assert.equal(mission.state, "active");
  mission.update(20, { x: 80, z: -44 }, true);
  assert.equal(mission.state, "active");
  mission.update(1, hotelBay, true);
  assert.equal(mission.state, "success");
  mission.update(999, hotelBay, true);
  assert.equal(mission.elapsed, 51);
  mission.reset();
  mission.update(181, spawn, true);
  assert.equal(mission.state, "overdue");
  assert.equal(mission.remaining, 0);
  mission.update(1, hotelBay, true);
  assert.equal(mission.state, "late");
  mission.reset();
  mission.update(180, hotelBay, true);
  assert.equal(mission.state, "success");
});
test("direction requests require a full stop and retain legal versus unsafe counts", () => {
  const mission = new Mission();
  assert.equal(mission.recordDirectionRequest(false, true), false);
  assert.equal(mission.directionRequestCount, 0);
  assert.equal(mission.recordDirectionRequest(true, true), true);
  assert.equal(mission.recordDirectionRequest(true, true), true);
  assert.equal(mission.recordDirectionRequest(true, false), true);
  assert.equal(mission.directionRequestCount, 3);
  assert.deepEqual(mission.directionRequests, { legal: 2, unsafe: 1 });
  mission.update(181, spawn, true);
  assert.equal(mission.recordDirectionRequest(true, false), true);
  mission.update(1, hotelBay, true);
  assert.equal(mission.recordDirectionRequest(true, true), false);
  assert.equal(mission.directionRequestCount, 4);
  mission.reset();
  assert.equal(mission.directionRequestCount, 0);
  assert.deepEqual(mission.directionRequests, { legal: 0, unsafe: 0 });
});
test("car brakes, reverses, handbrakes to exact zero and collides with solid geometry", () => {
  const car = new Car();
  for (let i = 0; i < 60; i++) car.update(1 / 60, { ...idle, throttle: 1 }, []);
  assert.ok(car.speed > 0);
  for (let i = 0; i < 120; i++) car.update(1 / 60, { ...idle, brake: 1 }, []);
  assert.equal(car.speed, 0, "Holding brake stops without reversing");
  assert.equal(car.gear, "D");
  assert.equal(car.shiftGear(), true);
  for (let i = 0; i < 60; i++) car.update(1 / 60, { ...idle, throttle: 1 }, []);
  assert.ok(car.speed < 0);
  assert.equal(car.shiftGear(), false, "Direction changes are rejected while moving");
  for (let i = 0; i < 120; i++) car.update(1 / 60, { ...idle, brake: 1 }, []);
  assert.equal(car.speed, 0);
  assert.equal(car.gear, "R", "Braking in reverse does not select forward");
  for (let i = 0; i < 60; i++)
    car.update(1 / 60, { ...idle, handbrake: true }, []);
  assert.equal(car.speed, 0);
  car.reset();
  assert.equal(car.gear, "D");
  car.x = 0;
  car.z = 10;
  car.heading = 0;
  car.speed = 10;
  const obstacle = { x: 0, z: 0, width: 10, depth: 10 };
  for (let i = 0; i < 90; i++)
    car.update(1 / 60, { ...idle, throttle: 1 }, [obstacle]);
  assert.ok(car.z >= 6);
  assert.ok(car.collisions > 0);
});
test("arcade car can drive a complete route and stop at the destination before deadline", () => {
  const car = new Car(),
    parking = new Parking(),
    mission = new Mission();
  const waypoints = [
    { x: -28, z: 82 },
    { x: 0, z: 80 },
    { x: 0, z: 50 },
    { x: 0, z: 16 },
    { x: 16, z: 0 },
    { x: 60, z: 0 },
    { x: 80, z: -16 },
    { x: 82, z: -44 },
    { x: 93, z: -44 },
  ];
  let index = 0;
  for (let frame = 0; frame < 60 * 170 && !mission.finished; frame++) {
    const target = waypoints[index];
    const distance = Math.hypot(target.x - car.x, target.z - car.z);
    if (distance < 7 && index < waypoints.length - 1) index++;
    const desired = Math.atan2(target.x - car.x, -(target.z - car.z));
    const angle = Math.atan2(
      Math.sin(desired - car.heading),
      Math.cos(desired - car.heading),
    );
    const arriving = index === waypoints.length - 1 && distance < 4;
    const targetSpeed = Math.abs(angle) > 0.5 ? 4 : 8;
    car.update(
      1 / 60,
      {
        ...idle,
        steer: Math.max(-1, Math.min(1, angle * 2.5)),
        throttle: !arriving && car.speed < targetSpeed ? 0.7 : 0,
        handbrake: arriving,
      },
      [],
    );
    parking.update(1 / 60, car, car.speed);
    mission.update(1 / 60, car, parking.stopped);
  }
  assert.equal(
    mission.state,
    "success",
    JSON.stringify({
      index,
      x: car.x,
      z: car.z,
      speed: car.speed,
      heading: car.heading,
    }),
  );
  assert.equal(parking.zone, "Blue Hotel forecourt");
  assert.equal(car.collisions, 0);
});
test("with no top speed the car keeps gaining on paved roads, feels the same in town and cannot skip through walls", () => {
  const onRoad = (car: InstanceType<typeof Car>, seconds: number, input: Partial<Actions>) => {
    for (let i = 0; i < seconds * 60; i++) { car.x = spawn.x; car.z = spawn.z; car.heading = spawn.heading; car.update(1 / 60, { ...idle, ...input }, []); }
  };
  assert.equal(context.isPaved(spawn), true);
  const normal = new Car(), free = new Car(); free.unlimited = true;
  onRoad(normal, 30, { throttle: 1 });
  assert.ok(normal.speed <= 21, "The normal setting keeps its limit");
  // Identical below 15 m/s: the same acceleration in town.
  const a = new Car(), b = new Car(); b.unlimited = true;
  for (let i = 0; i < 60; i++) { onRoad(a, 1 / 60, { throttle: 1 }); onRoad(b, 1 / 60, { throttle: 1 }); if (a.speed < 15) assert.equal(b.speed, a.speed); }
  onRoad(free, 30, { throttle: 1 });
  assert.ok(free.speed > 50, `No limit: full throttle passes 180 km/h within 30 s (${free.speed.toFixed(1)} m/s)`);
  const cruising = new Car(); cruising.unlimited = true; onRoad(cruising, 30, { throttle: 0.6 });
  assert.ok(cruising.speed > 10 && cruising.speed < 13, "Part throttle settles at a steady speed");
  const coasting = new Car(); coasting.unlimited = true; coasting.speed = 80; onRoad(coasting, 5, {});
  assert.ok(coasting.speed < 50 && coasting.speed > 0, "Releasing the throttle slows the car");
  // Leaving the road fast brakes hard, not instantly.
  let grass = { x: spawn.x, z: spawn.z };
  for (let r = 4; r < 120 && context.isPaved(grass); r += 2) for (let k = 0; k < 16 && context.isPaved(grass); k++) grass = { x: spawn.x + Math.cos(k * Math.PI / 8) * r, z: spawn.z + Math.sin(k * Math.PI / 8) * r };
  assert.equal(context.isPaved(grass), false);
  const offRoad = new Car(); offRoad.unlimited = true; offRoad.speed = 60;
  for (let i = 0; i < 60; i++) { offRoad.x = grass.x; offRoad.z = grass.z; offRoad.update(1 / 60, idle, []); }
  assert.ok(offRoad.speed > 25 && offRoad.speed < 45, `About 2.5 g on grass (${offRoad.speed.toFixed(1)} m/s after 1 s)`);
  // At 400 m/s one step is 6.7 m; moving in half-metre steps still stops at a 20 cm wall.
  const fast = new Car(); fast.unlimited = true; fast.x = spawn.x; fast.z = spawn.z; fast.heading = 0; fast.speed = 400;
  const wall = { x: spawn.x, z: spawn.z - 4, width: 10, depth: 0.2 };
  fast.update(1 / 60, idle, [wall]);
  assert.equal(fast.speed, 0); assert.ok(fast.z > wall.z, "The car stops before the wall"); assert.equal(fast.collisions, 1);
});
