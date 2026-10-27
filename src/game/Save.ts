import type {District} from '../world/district';
import {createMission,type MissionSnapshot} from '../mission/Mission';
import {createAtlasNotes,type AtlasSnapshot} from '../navigation/AtlasNotes';

export interface SaveData {
 version:1;district:string;map:string;savedAt:string;
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
/** Validate into fresh domain objects before changing the current game. */
export function decodeSave(context:District,text:string):SaveData{
 const value=JSON.parse(text) as SaveData;
 if(!value||value.version!==1||value.district!==context.district.id||value.map!==mapSignature(context)||typeof value.savedAt!=='string'||!Number.isFinite(Date.parse(value.savedAt)))throw new Error('This save belongs to a different map or game version');
 const c=value.car,b=context.district.bounds;
 if(!c||![c.x,c.z,c.heading,c.speed,c.steering].every(Number.isFinite)||c.x<b.minX+1||c.x>b.maxX-1||c.z<b.minZ+1||c.z>b.maxZ-1||
   Math.abs(c.speed)>21||Math.abs(c.steering)>1||!['D','R'].includes(c.gear)||(c.gear==='D'?c.speed<0:c.speed>0)||
   !Number.isSafeInteger(c.collisions)||c.collisions<0||!Number.isSafeInteger(value.unsafeStops)||value.unsafeStops<0)throw new Error('Invalid saved vehicle');
 const {Mission}=createMission(context),{AtlasNotes}=createAtlasNotes(context);
 new Mission({seed:1}).restore(value.mission);new AtlasNotes().restore(value.atlas);
 const {x,z,heading,speed,gear,steering,collisions}=c;
 return {version:1,district:value.district,map:value.map,savedAt:value.savedAt,car:{x,z,heading,speed,gear,steering,collisions},
   unsafeStops:value.unsafeStops,mission:value.mission,atlas:value.atlas};
}
