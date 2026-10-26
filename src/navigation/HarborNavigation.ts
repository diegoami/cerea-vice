import { SpatialGrid } from "../world/SpatialGrid";
import { type Point, type RoadNode } from "../world/district";
import { District } from "../world/district";
interface Edge {
  a: string;
  b: string;
  name: string;
}
export function createHarborNavigation(context:District){
const {areaAt,nodeById,nodes,roads}=context;
const bearing = (heading: number): number =>
  ((((heading * 180) / Math.PI) % 360) + 360) % 360;
const compassNames = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (heading: number): string =>
  compassNames[Math.round(bearing(heading) / 45) % 8];
const cardinal = (a: Point, b: Point): string =>
  Math.abs(b.x - a.x) > Math.abs(b.z - a.z)
    ? b.x > a.x
      ? "east"
      : "west"
    : b.z > a.z
      ? "south"
      : "north";
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.z - a.z);
const hotelNode: RoadNode = { id: "hotel", x: 80, z: -44, label: "Blue Hotel" };
const graphNodes = [...nodes, hotelNode];
const lookup = (id: string) => (id === "hotel" ? hotelNode : nodeById(id));
const edges: Edge[] = roads.flatMap((r) =>
  r.a === "e" && r.b === "ne"
    ? [
        { a: "e", b: "hotel", name: r.name },
        { a: "hotel", b: "ne", name: r.name },
      ]
    : [r],
);
function project(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)),
  );
  return { x: a.x + dx * t, z: a.z + dz * t };
}
const edgeGrid=new SpatialGrid(edges,edge=>{const a=lookup(edge.a),b=lookup(edge.b);return {minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z)};});
function nearestRoad(p:Point){return edgeGrid.nearest(p,edge=>{const point=project(p,lookup(edge.a),lookup(edge.b));return {edge,point,distance:distance(p,point)};});
}
function route(start: string): { cost: number; path: string[] } {
  const costs = new Map(graphNodes.map((n) => [n.id, Infinity]));
  const previous = new Map<string, string>();
  const remaining = new Set(graphNodes.map((n) => n.id));
  costs.set(start, 0);
  while (remaining.size) {
    const current = [...remaining].sort(
      (a, b) => costs.get(a)! - costs.get(b)!,
    )[0];
    remaining.delete(current);
    if (current === "hotel") break;
    for (const edge of edges.filter(
      (e) => e.a === current || e.b === current,
    )) {
      const next = edge.a === current ? edge.b : edge.a;
      const cost =
        costs.get(current)! + distance(lookup(current), lookup(next));
      if (cost < costs.get(next)!) {
        costs.set(next, cost);
        previous.set(next, current);
      }
    }
  }
  const path = ["hotel"];
  while (path[0] !== start) path.unshift(previous.get(path[0])!);
  return { cost: costs.get("hotel")!, path };
}
function turn(from: Point, at: Point, to: Point): string {
  const first = Math.atan2(at.x - from.x, -(at.z - from.z));
  const second = Math.atan2(to.x - at.x, -(to.z - at.z));
  const delta = Math.atan2(Math.sin(second - first), Math.cos(second - first));
  return Math.abs(delta) < 0.2
    ? "continue"
    : delta > 0
      ? "turn right"
      : "turn left";
}
function directionHint(p: Point, heading: number): string {
  const nearest = nearestRoad(p);
  const intro = `${nearest.distance > 13 ? "Near" : "On"} ${nearest.edge.name} in ${areaAt(p)}, facing ${compass(heading)}.`;
  const options = [nearest.edge.a, nearest.edge.b]
    .map((id) => {
      const result = route(id);
      return {
        ...result,
        cost: result.cost + distance(nearest.point, lookup(id)),
      };
    })
    .sort((a, b) => a.cost - b.cost);
  const best = options[0];
  const target = lookup(best.path[0]);
  if (target.id === "hotel") {
    if (distance(nearest.point, hotelNode) < 12)
      return `${intro} The Blue Hotel is beside you. Pull into the marked forecourt on the east side of East Quay and stop.`;
    return `${intro} Follow East Quay ${cardinal(nearest.point, hotelNode)} to the blue facade. Stop inside the signed forecourt on the east side.`;
  }
  const next = lookup(best.path[1]);
  const nextRoad = edges.find(
    (e) =>
      (e.a === target.id && e.b === next.id) ||
      (e.b === target.id && e.a === next.id),
  )!;
  if (distance(nearest.point, target) < 9) {
    return `${intro} At ${target.label}, take ${nextRoad.name} ${cardinal(target, next)} toward ${next.label}.`;
  }
  const desiredHeading = Math.atan2(
    target.x - nearest.point.x,
    -(target.z - nearest.point.z),
  );
  const facingAway = Math.cos(desiredHeading - heading) < -0.5;
  return `${intro} ${facingAway ? "Turn around safely, then head" : "Continue"} ${cardinal(nearest.point, target)} to ${target.label}; ${turn(nearest.point, target, next)} onto ${nextRoad.name} (${cardinal(target, next)}).`;
}
return {bearing,compass,nearestRoad,directionHint};
}
