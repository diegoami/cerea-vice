import type {District} from '../world/district';
import {createMission,migrateSnapshot,type LegacyMissionSnapshot,type MissionSnapshot} from '../mission/Mission';
import {createAtlasNotes,type AtlasSnapshot} from '../navigation/AtlasNotes';

/** Version 2 adds free driving, the fare list and boarding progress. */
export const SAVE_VERSION=2;
/** With no top speed a car can be saved well above 72 km/h; anything beyond this is treated as damaged. */
const MAX_SAVED_SPEED=400;
export interface SaveData {
 version:2;district:string;map:string;savedAt:string;
 /** The map's data version when saved; absent in saves made before data versions (treated as 1). */
 dataVersion?:number;
 car:{x:number;z:number;heading:number;speed:number;gear:'D'|'R';steering:number;collisions:number};
 unsafeStops:number;mission:MissionSnapshot;atlas:AtlasSnapshot;
}
export const saveKey=(context:District)=>`cerea-save-${context.district.id}`;
export function mapSignature(context:District){
 let hash=2166136261;
 const data=JSON.stringify(context.district);
 for(const c of data)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 return hash.toString(16);
}
/** A save for the same district made with a different version of its map data. */
export class MapVersionError extends Error {
 constructor(readonly saved:number,readonly current:number){super(`This save is for version ${saved} of this map; the game has version ${current}`);}
}
export const mapDataVersion=(context:District)=>context.district.dataVersion??1;
/** Validate into fresh domain objects before changing the current game. 0.8 (version 1) saves migrate. */
export function decodeSave(context:District,text:string):SaveData{
 const value=JSON.parse(text) as Omit<SaveData,'version'|'mission'>&{version:number;mission:MissionSnapshot|LegacyMissionSnapshot};
 if(value&&value.district===context.district.id&&value.map!==mapSignature(context)){
  const saved=Number.isSafeInteger(value.dataVersion)?value.dataVersion!:1;
  if(saved!==mapDataVersion(context))throw new MapVersionError(saved,mapDataVersion(context));
 }
 if(!value||(value.version!==1&&value.version!==SAVE_VERSION)||value.district!==context.district.id||value.map!==mapSignature(context)||typeof value.savedAt!=='string'||!Number.isFinite(Date.parse(value.savedAt)))throw new Error('This save belongs to a different map or game version');
 const c=value.car,b=context.district.bounds;
 if(!c||![c.x,c.z,c.heading,c.speed,c.steering].every(Number.isFinite)||c.x<b.minX+1||c.x>b.maxX-1||c.z<b.minZ+1||c.z>b.maxZ-1||
   Math.abs(c.speed)>MAX_SAVED_SPEED||Math.abs(c.steering)>1||!['D','R'].includes(c.gear)||(c.gear==='D'?c.speed<0:c.speed>0)||
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
