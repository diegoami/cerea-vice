import harborData from "../../public/maps/harbor.json";
import type { DistrictDefinition, Point, Rect, Road, RoadNode, Landmark } from "./schema";
export type { Point, Rect, Road, RoadNode, Landmark, DistrictDefinition } from "./schema";

export let district = harborData as DistrictDefinition;
export let nodes = district.nodes;
export let roads = district.roads;
export let parkingZones = district.parkingZones;
export let landmarks = district.landmarks;
export let spawn = district.spawn;
export let hotelBay = parkingZones.find((zone) => zone.id === district.mission.bayId)!;
export const ROAD_WIDTH = 16;
export const canal = { x: 40, z: -88, width: 12, depth: 48 };
export const harbor = { x: 0, z: 152, width: 600, depth: 80 };

export function validateDistrict(value: unknown): asserts value is DistrictDefinition {
  if (!value || typeof value !== "object") throw new Error("Invalid district file");
  const data = value as DistrictDefinition;
  if (data.version !== 1 || !data.id || !data.name || !Array.isArray(data.nodes) || !Array.isArray(data.roads) || !Array.isArray(data.parkingZones) || !Array.isArray(data.landmarks) || !Array.isArray(data.buildings) || !Array.isArray(data.features) || !Array.isArray(data.areas)) throw new Error("Incomplete district file");
  const plainText = (value: unknown) => typeof value === "string" && value.length > 0 && value.length < 500 && !/[<>]/.test(value);
  if (!plainText(data.name) || !plainText(data.description) || !plainText(data.attribution) || data.nodes.some((node) => !plainText(node.label)) || data.roads.some((road) => !plainText(road.name))) throw new Error("District names must be plain text");
  if (data.stoppingPolicy !== undefined && !["marked-bays","anywhere"].includes(data.stoppingPolicy)) throw new Error("Invalid stopping policy");
  const validPoint = (point: Point) => point && Number.isFinite(point.x) && Number.isFinite(point.z);
  const ids = new Set(data.nodes.map((node) => node.id));
  if (!ids.size || ids.size !== data.nodes.length || data.nodes.some((node) => !validPoint(node))) throw new Error("Invalid district nodes");
  if (data.roads.some((road) => !ids.has(road.a) || !ids.has(road.b) || road.a === road.b || !road.name || (road.width !== undefined && (!(road.width > 2) || !Number.isFinite(road.width))))) throw new Error("Invalid district roads");
  if (!data.bounds || !Object.values(data.bounds).every(Number.isFinite) || data.bounds.minX >= data.bounds.maxX || data.bounds.minZ >= data.bounds.maxZ) throw new Error("Invalid district bounds");
  if (!validPoint(data.spawn) || !Number.isFinite(data.spawn.heading) || !data.spawn.name || !data.mission || !data.parkingZones.some((zone) => zone.id === data.mission.bayId) || !(data.mission.duration > 0)) throw new Error("Invalid district journey");
  for (const rect of [...data.parkingZones, ...data.landmarks, ...data.buildings, ...data.areas]) {
    if (!validPoint(rect) || !(rect.width > 0) || !(rect.depth > 0) || !Number.isFinite(rect.width) || !Number.isFinite(rect.depth) || (rect.points && (rect.points.length < 3 || rect.points.some((point) => !validPoint(point))))) throw new Error("Invalid district footprint");
  }
  if ([...data.buildings,...data.landmarks].some(shape=>shape.holes?.some(hole=>hole.length<3||hole.some(point=>!validPoint(point))))) throw new Error("Invalid footprint holes");
  if (data.buildings.some((building)=>!Number.isFinite(building.height)||building.height<=0||!Number.isFinite(building.color))) throw new Error("Invalid building dimensions");
  if (data.id !== "harbor" && !ids.has(data.mission.nodeId)) throw new Error("Missing destination road node");
  if (!plainText(data.mission.name)||!plainText(data.mission.objective)||!plainText(data.mission.hint)||!plainText(data.spawn.name)) throw new Error("Invalid journey text");
  if ([...data.landmarks,...data.parkingZones,...data.areas].some((place)=>!plainText(place.name))) throw new Error("Invalid place name");
  for (const feature of data.features) if (!(feature.width>0) || feature.points?.length<2 || feature.points.some((point) => !validPoint(point)) || !["water", "rail"].includes(feature.kind)) throw new Error("Invalid map feature");
}

export function activateDistrict(value: unknown) {
  validateDistrict(value);
  district = value;
  nodes = district.nodes; roads = district.roads; parkingZones = district.parkingZones;
  landmarks = district.landmarks; spawn = district.spawn;
  hotelBay = parkingZones.find((zone) => zone.id === district.mission.bayId)!;
}
export const nodeById = (id: string): RoadNode => {
  const node = nodes.find((node) => node.id === id);
  if (!node) throw new Error(`Unknown road node: ${id}`);
  return node;
};
export const landmarkById = (id: string): Landmark => landmarks.find((place) => place.id === id)!;
export const areaAt = (point: Point): string => district.areas.find((area) => inRect(point, area))?.name ?? district.name;

export function projectToSegment(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return { x: a.x + dx * t, z: a.z + dz * t };
}
export function pointInPolygon(point: Point, vertices: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i], b = vertices[j];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x) inside = !inside;
  }
  return inside;
}
export function inRect(point: Point, rect: Rect, margin = 0): boolean {
  if (rect.points) {
    if (pointInPolygon(point, rect.points) && !(rect.holes??[]).some(hole=>pointInPolygon(point,hole))) return true;
    return margin < 0 && [rect.points,...(rect.holes??[])].some(ring=>ring.some((a,i) => {
      const nearest = projectToSegment(point,a,ring[(i+1)%ring.length]);
      return Math.hypot(point.x-nearest.x,point.z-nearest.z) <= -margin;
    }));
  }
  return Math.abs(point.x-rect.x) <= rect.width/2-margin && Math.abs(point.z-rect.z) <= rect.depth/2-margin;
}
export function roadRect(road: Road): Rect {
  const a=nodeById(road.a), b=nodeById(road.b), width=road.width??ROAD_WIDTH;
  return { x:(a.x+b.x)/2,z:(a.z+b.z)/2,width:Math.abs(a.x-b.x)+width,depth:Math.abs(a.z-b.z)+width };
}
export function isPaved(point: Point): boolean {
  return roads.some((road) => {
    const projected=projectToSegment(point,nodeById(road.a),nodeById(road.b));
    return Math.hypot(point.x-projected.x,point.z-projected.z) <= (road.width??ROAD_WIDTH)/2;
  }) || parkingZones.some((zone)=>inRect(point,zone));
}
