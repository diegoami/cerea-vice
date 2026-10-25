import * as THREE from "three";
import { planJunctionSigns } from "./signs";
import { planStreetPlates } from "./streetPlates";
import { box, building, material, sign, signpost, streetNamePlate } from "./builders";
import {
  roads,
  nodeById,
  roadRect,
  parkingZones,
  landmarkById,
  canal,
  harbor,
  type Rect,
} from "./district";

export class HarborWorld {
  readonly scene = new THREE.Scene();
  readonly colliders: Rect[] = [];

  constructor() {
    const scene = this.scene;
    scene.background = new THREE.Color(0x879da7);
    scene.fog = new THREE.Fog(0x879da7, 115, 340);
    scene.add(new THREE.HemisphereLight(0xfce3bc, 0x526271, 2.4));
    const sun = new THREE.DirectionalLight(0xffd39d, 2.1);
    sun.position.set(-70, 100, 40);
    scene.add(sun);
    box(scene, 0, -0.4, 0, 280, 0.7, 260, 0x647c6b);
    // Harbor water and a solid quay wall keep the compact play space legible.
    box(scene, harbor.x, -0.3, harbor.z, harbor.width, 0.1, harbor.depth, 0x4f7d8b);
    box(scene, 0, 0.35, 114, 246, 0.7, 3, 0xb8b39a);
    for (let x = -110; x <= 110; x += 12)
      box(scene, x, 1.3, 114, 0.3, 2, 0.3, 0x324854);
    box(scene, 0, 2, 114, 236, 0.15, 0.15, 0x324854);
    box(scene, -121, 0.8, 0, 2, 1.6, 228, 0x7a8880);
    box(scene, 121, 0.8, 0, 2, 1.6, 228, 0x7a8880);
    box(scene, 0, 0.8, -114, 244, 1.6, 2, 0x7a8880);

    // Sidewalk layer, then roads. Lane paint stops short of every junction.
    for (const road of roads) {
      const r = roadRect(road);
      box(scene, r.x, -0.015, r.z, r.width + 4, 0.08, r.depth + 4, 0xa0a28c);
    }
    for (const road of roads) {
      const a = nodeById(road.a),
        b = nodeById(road.b),
        r = roadRect(road);
      box(scene, r.x, 0.04, r.z, r.width, 0.06, r.depth, 0x424e53);
      const horizontal = a.z === b.z;
      for (let t = 14; t < 70; t += 10) {
        const x = a.x + ((b.x - a.x) * t) / 80,
          z = a.z + ((b.z - a.z) * t) / 80;
        box(
          scene,
          x,
          0.08,
          z,
          horizontal ? 4 : 0.2,
          0.02,
          horizontal ? 0.2 : 4,
          0xcbbd85,
        );
      }
    }
    for (const zone of parkingZones) {
      box(scene, zone.x, 0.06, zone.z, zone.width, 0.08, zone.depth, 0x546b68);
      const stripe = 0xdccf9d;
      box(
        scene,
        zone.x - zone.width / 2,
        0.12,
        zone.z,
        0.2,
        0.03,
        zone.depth,
        stripe,
      );
      box(
        scene,
        zone.x + zone.width / 2,
        0.12,
        zone.z,
        0.2,
        0.03,
        zone.depth,
        stripe,
      );
      for (const side of [-1, 1])
        box(
          scene,
          zone.x,
          0.12,
          zone.z + (side * zone.depth) / 2,
          zone.width,
          0.03,
          0.2,
          stripe,
        );
      signpost(
        scene,
        zone.x,
        zone.z + zone.depth / 2 + 1,
        ["P  LEGAL STOP"],
        0,
        "#315b59",
        5,
      );
      signpost(
        scene,
        zone.x + zone.width / 2 + 1,
        zone.z,
        ["P  LEGAL STOP"],
        -Math.PI / 2,
        "#315b59",
        5,
      );
    }

    // Four distinct blocks, with generous road margins for forgiving arcade turns.
    building(
      scene,
      this.colliders,
      { x: -46, z: 43, width: 40, depth: 36 },
      11,
      0x927e6e,
    );
    building(
      scene,
      this.colliders,
      { x: 43, z: 40, width: 29, depth: 36 },
      15,
      0x76847e,
    );
    building(
      scene,
      this.colliders,
      landmarkById("market"),
      9,
      0xaf6857,
    );
    building(
      scene,
      this.colliders,
      { x: 40, z: -42, width: 34, depth: 38 },
      18,
      0x7a828b,
    );
    // The red market hall and striped awnings are a close-range cue.
    sign(scene, -42, 6.5, -21.9, ["OLD MARKET"], 24, 0, "#713f3b");
    sign(scene, -61.1, 6.5, -41, ["OLD MARKET"], 23, -Math.PI / 2, "#713f3b");
    for (let x = -58; x < -25; x += 4)
      box(scene, x, 3.6, -20, 3.8, 0.35, 4, x % 8 === -2 ? 0xf2dfb3 : 0xb6554b);

    // Blue Hotel is outside the east loop, directly behind its signed arrival bay.
    building(
      scene,
      this.colliders,
      landmarkById("hotel"),
      22,
      0x427baf,
    );
    sign(scene, 104.4, 15, -44, ["BLUE", "HOTEL"], 13, -Math.PI / 2, "#234b72");
    sign(scene, 111, 18, -27.9, ["BLUE HOTEL"], 12, 0, "#234b72");
    sign(scene, 111, 18, -60.1, ["BLUE HOTEL"], 12, Math.PI, "#234b72");
    box(scene, 101.8, 4, -44, 5, 0.5, 9, 0xe7d8ab);
    signpost(
      scene,
      100,
      -29,
      ["BLUE HOTEL", "STOP IN FORECOURT"],
      -Math.PI / 2,
      "#234b72",
    );

    // Water tower: the skyline anchor, visible over surrounding low blocks.
    const tower = landmarkById("tower");
    for (const dx of [-5, 5])
      for (const dz of [-5, 5]) {
        box(scene, tower.x + dx, 13, tower.z + dz, 1.1, 26, 1.1, 0x536b70);
      }
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 10, 10),
      material(0xd3c3a0),
    );
    tank.position.set(tower.x, 29, tower.z);
    scene.add(tank);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(10, 5, 10),
      material(0x9f614e),
    );
    roof.position.set(tower.x, 36.5, tower.z);
    scene.add(roof);
    this.colliders.push(tower);
    sign(scene, -99, 29, -83.8, ["HARBOR", "WATER"], 15, 0, "#546963");

    // Service station: a low yellow canopy, two pumps and a large roadside label.
    const station = landmarkById("station");
    box(scene, station.x, 5, station.z, station.width, 1, station.depth, 0xd8ad58);
    for (const x of [13, 35]) box(scene, x, 2.5, 100, 0.7, 5, 0.7, 0xc7b890);
    for (const x of [19, 29]) {
      box(scene, x, 1.2, 99, 1.5, 2.4, 1.3, 0xd28460);
      this.colliders.push({ x, z: 99, width: 2, depth: 2 });
    }
    sign(scene, 24, 5, 92.9, ["SERVICE STATION"], 25, Math.PI, "#6d5733");
    sign(scene, 24, 5, 105.1, ["SERVICE STATION"], 25, 0, "#6d5733");
    signpost(scene, 12, 91, ["SERVICE STATION"], Math.PI, "#6d5733");

    // A level bridge keeps the arcade controller two-dimensional. Water is visible beside the deck.
    box(scene, canal.x, 0, canal.z, canal.width, 0.04, canal.depth, 0x4f7d8b);
    for (const z of [-90, -70]) {
      box(scene, 40, 0.35, z, 28, 0.7, 0.8, 0xa7ab98);
      box(scene, 40, 1.5, z, 28, 0.18, 0.25, 0x425c63);
      for (let x = 28; x <= 52; x += 6)
        box(scene, x, 1, z, 0.3, 1.6, 0.3, 0x425c63);
      this.colliders.push({ x: 40, z, width: 28, depth: 0.8 });
    }
    signpost(scene, 23, -91, ["CANAL BRIDGE", "TOWER LANE"], Math.PI / 2);

    // An unused harbor rail spur crosses Market Street: no trains or signal simulation.
    for (let x = -113; x <= -69; x += 3)
      box(scene, x, 0.09, 60, 0.6, 0.03, 5.5, 0x6b6356);
    for (const z of [58.2, 61.8])
      box(scene, -91, 0.12, z, 46, 0.06, 0.16, 0xb1b5ac);
    signpost(scene, -91, 69, ["RAIL CROSSING"], 0, "#6d5733");
    signpost(scene, -69, 51, ["RAIL CROSSING"], 0, "#6d5733");

    // Named areas provide another verbal cue without adding a map.
    signpost(scene, 60, 69, ["WATERFRONT"], Math.PI / 2);
    signpost(scene, 60, -69, ["WATERFRONT"], Math.PI / 2);
    signpost(scene, -12, 29, ["OLD TOWN"], 0);
    signpost(scene, -12, 60, ["HARBOR WARD"], 0);

    for(const plate of planStreetPlates().plates)streetNamePlate(scene,plate);
    for(const plan of planJunctionSigns().signs) {
      signpost(scene,plan.position.x,plan.position.z,plan.rows,plan.angle,"#163b3d",plan.width,plan.height);
    }

    // Small deterministic scenery, outside the driving corridors.
    for (const [x, z] of [
      [-110, 65],
      [-108, 0],
      [-105, -42],
      [18, -104],
      [50, -104],
      [110, 23],
      [-25, 108],
    ]) {
      box(scene, x, 2.2, z, 0.7, 4.4, 0.7, 0x6d6253);
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(4, 10, 5),
        material(0x41695c),
      );
      crown.position.set(x, 7, z);
      scene.add(crown);
      this.colliders.push({ x, z, width: 2, depth: 2 });
    }
    // Backdrop warehouses and distant hills are decoration, beyond the bounded district.
    for (let i = 0; i < 7; i++) {
      box(
        scene,
        -150 + i * 50,
        8 + (i % 3) * 3,
        -142,
        32,
        16 + (i % 3) * 6,
        22,
        0x67787b,
      );
    }
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(15, 16),
      new THREE.MeshBasicMaterial({ color: 0xe9c293, fog: false }),
    );
    sunDisc.position.set(160, 95, -240);
    scene.add(sunDisc);
  }
}
