export interface Point {
  x: number;
  z: number;
}
export const areaAt = (point: Point): string =>
  point.x >= 50 ? "Waterfront" : point.z >= 35 ? "Harbor Ward" : "Old Town";
export interface RoadNode extends Point {
  id: string;
  label: string;
}
export interface Road {
  a: string;
  b: string;
  name: string;
}
export interface Rect {
  x: number;
  z: number;
  width: number;
  depth: number;
}
export interface ParkingZone extends Rect {
  id: string;
  name: string;
}

// North is -Z, east is +X. All distances are game metres.
export const nodes: RoadNode[] = [
  { id: "sw", x: -80, z: 80, label: "Harbor bend" },
  { id: "s", x: 0, z: 80, label: "Service Station junction" },
  { id: "se", x: 80, z: 80, label: "East Quay bend" },
  { id: "w", x: -80, z: 0, label: "Market junction" },
  { id: "c", x: 0, z: 0, label: "Central Crossroads" },
  { id: "e", x: 80, z: 0, label: "Hotel junction" },
  { id: "nw", x: -80, z: -80, label: "Water Tower bend" },
  { id: "n", x: 0, z: -80, label: "Tower junction" },
  { id: "ne", x: 80, z: -80, label: "Blue Hotel bend" },
];
export const roads: Road[] = [
  { a: "sw", b: "s", name: "Harbor Road" },
  { a: "s", b: "se", name: "Harbor Road" },
  { a: "sw", b: "w", name: "Market Street" },
  { a: "w", b: "nw", name: "Market Street" },
  { a: "w", b: "c", name: "Market Street" },
  { a: "c", b: "e", name: "Market Street" },
  { a: "nw", b: "n", name: "Tower Lane" },
  { a: "n", b: "ne", name: "Tower Lane" },
  { a: "s", b: "c", name: "Central Avenue" },
  { a: "c", b: "n", name: "Central Avenue" },
  { a: "se", b: "e", name: "East Quay" },
  { a: "e", b: "ne", name: "East Quay" },
];
export const nodeById = (id: string): RoadNode =>
  nodes.find((n) => n.id === id)!;
export const ROAD_WIDTH = 16;
export const parkingZones: ParkingZone[] = [
  { id: "harbor", name: "Harbor lay-by", x: -52, z: 90, width: 26, depth: 12 },
  {
    id: "market",
    name: "Market stopping bay",
    x: -90,
    z: 32,
    width: 12,
    depth: 24,
  },
  {
    id: "tower",
    name: "Water Tower lay-by",
    x: -35,
    z: -90,
    width: 24,
    depth: 12,
  },
  {
    id: "hotel",
    name: "Blue Hotel forecourt",
    x: 93,
    z: -44,
    width: 18,
    depth: 28,
  },
];
export const hotelBay = parkingZones.find((z) => z.id === "hotel")!;
export const spawn = { x: -52, z: 90, heading: Math.PI / 2 };
export const inRect = (p: Point, r: Rect, margin = 0): boolean =>
  Math.abs(p.x - r.x) <= r.width / 2 - margin &&
  Math.abs(p.z - r.z) <= r.depth / 2 - margin;

export function roadRect(road: Road): Rect {
  const a = nodeById(road.a),
    b = nodeById(road.b);
  return {
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    width: Math.abs(a.x - b.x) + ROAD_WIDTH,
    depth: Math.abs(a.z - b.z) + ROAD_WIDTH,
  };
}
export const isPaved = (p: Point): boolean =>
  roads.some((r) => inRect(p, roadRect(r))) ||
  parkingZones.some((r) => inRect(p, r));

export interface Landmark extends Rect {
  id: string;
  name: string;
  road: string;
}

// Shared by the scenery and the printed atlas.
export const landmarks: Landmark[] = [
  { id: "hotel", name: "Blue Hotel", road: "East Quay", x: 111, z: -44, width: 13, depth: 32 },
  { id: "market", name: "Old Market", road: "Market Street", x: -42, z: -41, width: 38, depth: 37 },
  { id: "tower", name: "Water Tower", road: "Tower Lane", x: -99, z: -93, width: 15, depth: 15 },
  { id: "station", name: "Service Station", road: "Harbor Road", x: 24, z: 99, width: 28, depth: 12 },
];
export const landmarkById = (id: string): Landmark => landmarks.find((place) => place.id === id)!;
export const canal = { x: 40, z: -88, width: 12, depth: 48 };
export const harbor = { x: 0, z: 152, width: 600, depth: 80 };
