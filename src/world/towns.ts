import {inRect,type District,type Rect} from './district';
import type {TaxiStop} from './schema';

export interface MappedTown {id:string;name:string;area:Rect&{name:string};stops:TaxiStop[]}
const cache=new WeakMap<District,MappedTown[]>();
/** Authored town extents and dispatch identities; never inferred from the player's position. */
export function mappedTowns(context:District):MappedTown[]{
 const cached=cache.get(context);if(cached)return cached;
 const groups=new Map<string,TaxiStop[]>();
 for(const stop of context.district.taxi?.stops??[]){if(!stop.townId)continue;const group=groups.get(stop.townId)??[];group.push(stop);groups.set(stop.townId,group);}
 if(!groups.size&&context.district.taxi?.endless)groups.set(context.district.id,[...context.district.taxi.stops]);
 const towns=[...groups].map(([id,stops])=>{
  const points=stops.map(s=>context.nodeById(s.nodeId)),centre={x:points.reduce((n,p)=>n+p.x,0)/points.length,z:points.reduce((n,p)=>n+p.z,0)/points.length};
  const areas=context.district.areas.map(area=>({area,count:points.filter(p=>inRect(p,area)).length}));
  areas.sort((a,b)=>b.count-a.count||Math.hypot(a.area.x-centre.x,a.area.z-centre.z)-Math.hypot(b.area.x-centre.x,b.area.z-centre.z));
  const bounds=context.district.bounds;
  const area=areas[0]?.area??{name:context.district.name,x:(bounds.minX+bounds.maxX)/2,z:(bounds.minZ+bounds.maxZ)/2,width:bounds.maxX-bounds.minX,depth:bounds.maxZ-bounds.minZ};
  return {id,name:stops[0].town??area.name,area,stops};
 });
 cache.set(context,towns);return towns;
}
