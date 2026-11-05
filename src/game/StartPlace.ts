import type {District} from '../world/district';
export interface StartPlace {x:number;z:number;heading:number;name:string;townId:string;landmarkId:string}
/** Sample towns first, so Verona's greater number of landmarks does not bias every launch. */
export function chooseStartPlace(context:District,random:()=>number=Math.random,exceptTown?:string):StartPlace{
 const stops=context.district.taxi!.stops;
 const towns=[...new Set(stops.map(s=>s.townId??context.district.id))].filter(id=>id!==exceptTown);
 const townId=towns[Math.min(towns.length-1,Math.floor(random()*towns.length))]??stops[0].townId??context.district.id;
 const choices=stops.filter(s=>(s.townId??context.district.id)===townId),stop=choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];
 const bay=context.parkingZones.find(b=>b.id===stop.bayId)!,road=context.nearestRoad(bay)!.edge;
 const a=context.nodeById(road.a),b=context.nodeById(road.b),reverse=!road.oneWay&&random()<.5;
 return {x:bay.x,z:bay.z,heading:Math.atan2((b.x-a.x)*(reverse?-1:1),-(b.z-a.z)*(reverse?-1:1)),name:stop.name,townId,landmarkId:stop.id};
}
