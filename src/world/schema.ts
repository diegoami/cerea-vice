export interface Point { x: number; z: number }
export interface Rect extends Point { width: number; depth: number; points?: Point[]; holes?: Point[][] }
export interface RoadNode extends Point { id: string; label: string }
export interface Road { a: string; b: string; name: string; width?: number; oneWay?: boolean; bridge?: boolean; osmId?: number; roadClass?: string; region?:string }
export interface ParkingZone extends Rect { id: string; name: string }
export interface Landmark extends Rect { id: string; name: string; road: string; kind?: string; height?: number; osmId?: number }
export interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface MapBuilding extends Rect { height: number; color: number; osmId?: number }
export interface MapLine { name: string; kind: "water" | "rail"; width: number; points: Point[] }
/** A river or lake drawn as an area. `solid` is the same water minus every road corridor, so bridges stay drivable. */
export interface WaterArea { name: string; points: Point[]; holes?: Point[][]; solid: Rect[] }
export interface NavigationTarget { name:string; nodeId:string; bay:ParkingZone; road?:string }
export interface TaxiStop { id:string; name:string; road:string; bayId:string; nodeId:string; description:string }
export interface TaxiFare { passenger:string; pickupId:string; destinationId:string }
export interface TaxiDefinition {
  startHour:number; endHour:number; clockRate:number;
  baseCents:number; perKmCents:number; maxBonusCents:number;
  stops:TaxiStop[]; fares:TaxiFare[];
}
export interface DistrictDefinition {
  streaming?:import("./streaming/schema").TileManifest;
  version: 1;
  id: string;
  /** Version of this district's map data; a save made for another version is refused with both numbers. */
  dataVersion?: number;
  name: string;
  description: string;
  attribution: string;
  sourceUrl: string;
  stoppingPolicy?: "marked-bays" | "anywhere";
  bounds: Bounds;
  nodes: RoadNode[];
  roads: Road[];
  parkingZones: ParkingZone[];
  landmarks: Landmark[];
  buildings: MapBuilding[];
  features: MapLine[];
  waterAreas?: WaterArea[];
  areas: (Rect & { name: string })[];
  spawn: Point & { heading: number; name: string };
  taxi?:TaxiDefinition;
  mission: { name: string; objective: string; hint: string; duration: number; bayId: string; nodeId: string };
}
