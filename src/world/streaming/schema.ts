import type { Bounds, DistrictDefinition, MapBuilding, Point } from '../schema';
import type { StreetPlatePlan } from '../streetPlates';
import type { PropPlan } from '../Scenery';
import type { DirectionRow } from '../directions';
export interface Region {id:string;name:string;nodeIds:string[]}
export interface Portal {from:string;to:string;nodeId:string}
export interface TileRef {id:string;file:string;bounds:Bounds;bytes:number}
export interface TileManifest {
 version:1;tileSize:number;fogDistance:number;loadRadius:number;retainRadius:number;
 tiles:TileRef[];regions:Region[];portals:Portal[];
 provenance:{source:string;licence:string;osmTimestamp:string;synthetic:string};
}
export interface RoadsideBoard {position:Point;angle:number;rows:(string|DirectionRow)[];width:number;height:number;color:string;mounted?:boolean}
export interface TilePayload {
 version:1;id:string;provenance:TileManifest['provenance'];
 buildings:MapBuilding[];roads:number[];features:number[];landmarks:number[];bays:number[];
 plates:StreetPlatePlan[];boards:RoadsideBoard[];props:PropPlan[];
}
export interface PrototypeDefinition extends DistrictDefinition {streaming:TileManifest}
