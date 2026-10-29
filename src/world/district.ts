import { validateStreaming } from "./streaming/validate";
import { LayeredRouteGraph } from "../navigation/LayeredRouteGraph";
import { Profiler } from "../diagnostics/Profiler";
import { RouteGraph } from "../navigation/RouteGraph";
import { SpatialGrid, rectBounds } from "./SpatialGrid";
import type { DistrictDefinition, Point, Rect, Road, RoadNode, Landmark, MapBuilding, PavedArea } from "./schema";
export type { Point, Rect, Road, RoadNode, ParkingZone, Landmark, DistrictDefinition } from "./schema";

export const ROAD_WIDTH = 8;
export const roadWidth = (road: Road): number => road.width ?? ROAD_WIDTH;
export const canal = { x: 40, z: -88, width: 12, depth: 48 };
export const harbor = { x: 0, z: 152, width: 600, depth: 80 };

export function validateDistrict(value: unknown): asserts value is DistrictDefinition {
  if (!value || typeof value !== "object") throw new Error("Invalid district file");
  const data = value as DistrictDefinition;
  if (data.version !== 1 || !data.id || !data.name || !Array.isArray(data.nodes) || !Array.isArray(data.roads) || !Array.isArray(data.parkingZones) || !Array.isArray(data.landmarks) || !Array.isArray(data.buildings) || !Array.isArray(data.features) || !Array.isArray(data.areas)) throw new Error("Incomplete district file");
  const plainText = (value: unknown) => typeof value === "string" && value.length > 0 && value.length < 500 && !/[<>]/.test(value);
  if (!plainText(data.name) || !plainText(data.description) || !plainText(data.attribution) || data.nodes.some((node) => !plainText(node.label)) || data.roads.some((road) => (!plainText(road.name)||(road.roadClass!==undefined&&!plainText(road.roadClass))))) throw new Error("District names must be plain text");
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
  if (data.landmarks.some(place=>!plainText(place.road)||(place.kind!==undefined&&!plainText(place.kind))) || data.features.some(feature=>!plainText(feature.name))) throw new Error("Invalid map text");
  if(data.taxi) {
    const taxi=data.taxi;
    if(!Number.isFinite(taxi.startHour)||!Number.isFinite(taxi.endHour)||taxi.startHour<0||taxi.endHour>24||taxi.startHour>=taxi.endHour||!Number.isFinite(taxi.clockRate)||taxi.clockRate<=0||taxi.clockRate>120)throw new Error("Invalid taxi shift clock");
    if([taxi.baseCents,taxi.perKmCents,taxi.maxBonusCents].some(value=>!Number.isFinite(value)||value<0))throw new Error("Invalid taxi fares");
    if(!Array.isArray(taxi.stops)||taxi.stops.length<3||!Array.isArray(taxi.fares)||!taxi.fares.length)throw new Error("Missing taxi goals");
    const stops=new Set(taxi.stops.map(stop=>stop.id));
    if(stops.size!==taxi.stops.length||taxi.stops.some(stop=>!plainText(stop.name)||!plainText(stop.road)||!plainText(stop.description)||!ids.has(stop.nodeId)||!data.parkingZones.some(bay=>bay.id===stop.bayId)))throw new Error("Invalid taxi stop");
    if(taxi.fares.some(fare=>!plainText(fare.passenger)||!stops.has(fare.pickupId)||!stops.has(fare.destinationId)||fare.pickupId===fare.destinationId))throw new Error("Invalid taxi itinerary");
  }
  if (data.subtitle!==undefined&&!plainText(data.subtitle)) throw new Error("Invalid district subtitle");
  if (data.preset!==undefined&&!['sketch','town','full'].includes(data.preset)) throw new Error("Invalid district preset");
  if (data.dataVersion!==undefined&&!(Number.isSafeInteger(data.dataVersion)&&data.dataVersion>=1)) throw new Error("Invalid map data version");
  validateStreaming(data);
  for (const feature of data.features) if (!(feature.width>0) || feature.points?.length<2 || feature.points.some((point) => !validPoint(point)) || !["water", "rail"].includes(feature.kind)) throw new Error("Invalid map feature");
  const ring=(points:unknown)=>Array.isArray(points)&&points.length>=3&&points.every(validPoint);
  if (data.waterAreas!==undefined && (!Array.isArray(data.waterAreas) || data.waterAreas.some(area=>!plainText(area.name)||!ring(area.points)||(area.holes!==undefined&&(!Array.isArray(area.holes)||!area.holes.every(ring)))||!Array.isArray(area.solid)||area.solid.some(piece=>!ring(piece.points)||![piece.x,piece.z,piece.width,piece.depth].every(Number.isFinite)||(piece.holes!==undefined&&!piece.holes.every(ring)))))) throw new Error("Invalid water area");
  if (data.pavedAreas!==undefined && (!Array.isArray(data.pavedAreas) || data.pavedAreas.some(area=>!plainText(area.name)||!ring(area.points)||(area.holes!==undefined&&(!Array.isArray(area.holes)||!area.holes.every(ring)))))) throw new Error("Invalid paved area");
}

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

export class District {
 readonly district:DistrictDefinition;
 readonly nodes;readonly roads;readonly parkingZones;readonly landmarks;readonly spawn;readonly hotelBay;
 readonly assetBase?:string;
 readonly profile:Profiler;
 readonly graph:RouteGraph | LayeredRouteGraph;
 readonly buildings:SpatialGrid<MapBuilding>;
 readonly roadGrid:SpatialGrid<Road>;
 readonly nodeMap:Map<string,RoadNode>;
 readonly adjacency=new Map<string,Road[]>();
 constructor(value:unknown,options:{profile?:boolean;assetBase?:string}={}){
  validateDistrict(value);this.district=value;this.profile=new Profiler(options.profile);this.assetBase=options.assetBase;
  this.nodes=value.nodes;this.roads=value.roads;this.parkingZones=value.parkingZones;this.landmarks=value.landmarks;this.spawn=value.spawn;
  this.hotelBay=value.parkingZones.find(zone=>zone.id===value.mission.bayId)!;
  this.graph=value.streaming?new LayeredRouteGraph(this.nodes,this.roads,value.streaming.regions,value.streaming.portals):new RouteGraph(this.nodes,this.roads);
  this.nodeMap=new Map(this.nodes.map(node=>[node.id,node]));
  for(const node of this.nodes)this.adjacency.set(node.id,[]);
  for(const road of this.roads){this.adjacency.get(road.a)!.push(road);this.adjacency.get(road.b)!.push(road);}
  this.buildings=new SpatialGrid(value.buildings,rectBounds);
  this.roadGrid=new SpatialGrid(this.roads,road=>rectBounds(this.roadRect(road)));
 }
 nodeById=(id:string):RoadNode=>{const node=this.nodeMap.get(id);if(!node)throw new Error(`Unknown road node: ${id}`);return node;};
 landmarkById=(id:string):Landmark=>this.landmarks.find(place=>place.id===id)!;
 areaAt=(point:Point):string=>this.district.areas.find(area=>inRect(point,area))?.name??this.district.name;
 roadRect=(road:Road):Rect=>{const a=this.nodeById(road.a),b=this.nodeById(road.b),width=roadWidth(road);return {x:(a.x+b.x)/2,z:(a.z+b.z)/2,width:Math.abs(a.x-b.x)+width,depth:Math.abs(a.z-b.z)+width};};
 private squares?:SpatialGrid<PavedArea>;
 isPaved=(point:Point):boolean=>this.roadGrid.at(point).some(road=>{const p=projectToSegment(point,this.nodeById(road.a),this.nodeById(road.b));return Math.hypot(point.x-p.x,point.z-p.z)<=roadWidth(road)/2;})||this.parkingZones.some(zone=>inRect(point,zone))||this.onSquare(point);
 /** On a square (paved open ground, #25). */
 onSquare=(point:Point):boolean=>{
  const areas=this.district.pavedAreas;if(!areas?.length)return false;
  this.squares??=new SpatialGrid(areas,area=>{const xs=area.points.map(p=>p.x),zs=area.points.map(p=>p.z);return {minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};},64);
  return this.squares.at(point).some(area=>pointInPolygon(point,area.points)&&!(area.holes??[]).some(hole=>pointInPolygon(point,hole)));
 };
 /** Inside a river or lake area: its own collision shape (water minus road corridors) applies there, so a
  * river's centreline drawn through it is not solid too (it used to block a bridge over the Adige, #25). */
 inWaterArea=(point:Point):boolean=>(this.district.waterAreas??[]).some(area=>pointInPolygon(point,area.points)&&!(area.holes??[]).some(hole=>pointInPolygon(point,hole)));
 nearestRoad=(point:Point)=>this.roadGrid.nearest(point,edge=>{const p=projectToSegment(point,this.nodeById(edge.a),this.nodeById(edge.b));return {edge,point:p,distance:Math.hypot(point.x-p.x,point.z-p.z)};});
}
