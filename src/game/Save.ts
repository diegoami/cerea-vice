import type {District} from '../world/district';
import {createMission,migrateSnapshot,type LegacyMissionSnapshot,type MissionSnapshot} from '../mission/Mission';
import {createAtlasNotes,type AtlasSnapshot} from '../navigation/AtlasNotes';

/** Version 2 adds free driving, the fare list and boarding progress. */
export const SAVE_VERSION=2;
export interface SaveData {
 version:2;district:string;map:string;savedAt:string;
 /** The map's data version when saved; absent in saves made before data versions (treated as 1). */
 dataVersion?:number;
 car:{x:number;z:number;heading:number;speed:number;gear:'D'|'R';steering:number;collisions:number};
 unsafeStops:number;mission:MissionSnapshot;atlas:AtlasSnapshot;
}
export const saveKey=(context:District)=>`cerea-save-${context.district.id}`;
const hashText=(data:string)=>{let hash=2166136261;for(const c of data)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;return hash.toString(16);};
/** The map a save belongs to. A streamed map's tile file list (sizes) is delivery, not map content, so it is left out. */
export function mapSignature(context:District){
 const {streaming,...district}=context.district;
 return hashText(JSON.stringify(streaming?{...district,streaming:{...streaming,tiles:undefined}}:district));
}
/** Signatures earlier builds wrote: the whole district including tile sizes, and maps whose tiles were since regenerated. */
const supersededSignatures:Record<string,string[]>={
 // Up to 0.14.0-rc.1. Their tiles were regenerated for town signs and single direction rows (#84); the map data is unchanged.
 // The Lower Veronese plain then gained the road north of Bovolone to its gateway (#112, aabb8738); earlier saves still fit.
 "lower-verona":["fabb226f","aabb8738"],
 "verona":["6834cb33"],
};
const matchesMap=(context:District,map:unknown)=>map===mapSignature(context)||map===hashText(JSON.stringify(context.district))||(supersededSignatures[context.district.id]??[]).includes(map as string);
/** A save for the same district made with a different version of its map data. */
export class MapVersionError extends Error {
 constructor(readonly saved:number,readonly current:number){super(`This save is for version ${saved} of this map; the game has version ${current}`);}
}
export const mapDataVersion=(context:District)=>context.district.dataVersion??1;
/** Validate into fresh domain objects before changing the current game. 0.8 (version 1) saves migrate. */
export function decodeSave(context:District,text:string):SaveData{
 const value=JSON.parse(text) as Omit<SaveData,'version'|'mission'>&{version:number;mission:MissionSnapshot|LegacyMissionSnapshot};
 if(value&&value.district===context.district.id&&!matchesMap(context,value.map)){
  const saved=Number.isSafeInteger(value.dataVersion)?value.dataVersion!:1;
  if(saved!==mapDataVersion(context))throw new MapVersionError(saved,mapDataVersion(context));
 }
 if(!value||(value.version!==1&&value.version!==SAVE_VERSION)||value.district!==context.district.id||!matchesMap(context,value.map)||typeof value.savedAt!=='string'||!Number.isFinite(Date.parse(value.savedAt)))throw new Error('This save belongs to a different map or game version');
 const c=value.car,b=context.district.bounds;
 if(!c||![c.x,c.z,c.heading,c.speed,c.steering].every(Number.isFinite)||c.x<b.minX+1||c.x>b.maxX-1||c.z<b.minZ+1||c.z>b.maxZ-1||
   Math.abs(c.steering)>1||!['D','R'].includes(c.gear)||(c.gear==='D'?c.speed<0:c.speed>0)||
   !Number.isSafeInteger(c.collisions)||c.collisions<0||!Number.isSafeInteger(value.unsafeStops)||value.unsafeStops<0)throw new Error('Invalid saved vehicle');
 const mission=value.version===1?migrateSnapshot(value.mission as LegacyMissionSnapshot):value.mission as MissionSnapshot;
 // A passenger still walking to the taxi requires the taxi to be standing still.
 if(mission?.boarding>0&&c.speed!==0)throw new Error('Invalid saved boarding');
 const {Mission}=createMission(context),{AtlasNotes}=createAtlasNotes(context);
 const check=new Mission({seed:1});check.restore(mission);new AtlasNotes().restore(value.atlas);
 const {x,z,heading,speed,gear,steering,collisions}=c;
 return {version:SAVE_VERSION,district:value.district,map:value.map,dataVersion:mapDataVersion(context),savedAt:value.savedAt,car:{x,z,heading,speed,gear,steering,collisions},
   unsafeStops:value.unsafeStops,mission:check.snapshot(),atlas:value.atlas};
}
