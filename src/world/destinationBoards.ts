import {RouteGraph} from '../navigation/RouteGraph';
import {inRect,type District,type Point,type Road} from './district';
import type {DirectionRow} from './directions';
import {directionsName,townSignName} from './placeNames';
import {mappedTowns} from './towns';

const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const major=(r:Road)=>['trunk','primary','secondary','tertiary','trunk_link','primary_link','secondary_link','tertiary_link'].includes(r.roadClass??'');
/** Static public guidance to legal town entrances and real landmark stopping nodes. */
export function createDestinationGuide(context:District){
 const towns=mappedTowns(context),graph=new RouteGraph(context.nodes,context.roads);
 const entrances=towns.map(town=>{
  const targets=(mainOnly:boolean)=>{
   const result=new Set<string>();
   for(const r of context.roads){
    if(mainOnly&&!major(r))continue;
    const a=context.nodeById(r.a),b=context.nodeById(r.b),insideA=inRect(a,town.area),insideB=inRect(b,town.area);
    if(insideA===insideB)continue;
    if(!insideA)result.add(b.id);else if(!r.oneWay)result.add(a.id);
   }
   return [...result];
  };
  let nodes=targets(true);if(!nodes.length)nodes=targets(false);if(!nodes.length)nodes=town.stops.map(s=>s.nodeId);
  return {town,nodes,costs:undefined as Map<string,number>|undefined};
 });
 const stops=new Map((context.district.taxi?.stops??[]).map(s=>[s.id,s]));
 const rawPlaces=context.landmarks.map(place=>{
  const stop=stops.get(place.id),target=stop?.nodeId??context.nodes.reduce((best,n)=>distance(n,place)<distance(best,place)?n:best).id;
  return {place,target,townId:stop?.townId,costs:undefined as Map<string,number>|undefined};
 });
 const places:(typeof rawPlaces[number]&{members:typeof context.landmarks})[]=[];
 for(const place of rawPlaces){
  const shared=places.find(p=>p.target===place.target&&p.townId===place.townId&&distance(p.place,place.place)<25);
  if(shared)shared.members.push(place.place);else places.push({...place,members:[place.place]});
 }
 /** Ignore tiny OSM shape segments: use the actual approach/exit up to the next crossing. */
 function along(junction:string,first:string,forward:boolean){
  let previous=junction,current=first,travelled=0;const seen=new Set([junction]);
  while(!seen.has(current)){
   seen.add(current);const a=context.nodeById(previous),b=context.nodeById(current),length=distance(a,b);
   if(travelled+length>=25){const t=(25-travelled)/length;return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};}
   travelled+=length;const links=context.adjacency.get(current)??[];if(links.length!==2)return b;
   const next=links.find(r=>r.a!==previous&&r.b!==previous&&(!r.oneWay||(forward?r.a===current:r.b===current)));
   if(!next)return b;previous=current;current=next.a===current?next.b:next.a;
  }
  return context.nodeById(current);
 }
 const cache=new Map<string,DirectionRow[]>();
 return (junctionId:string,approachId:string,landmarkId?:string)=>{
  const key=`${junctionId}:${approachId}:${landmarkId??''}`,cached=cache.get(key);if(cached)return cached;
  const node=context.nodeById(junctionId),links=context.adjacency.get(junctionId)??[];
  if(!links.some(r=>(r.a===approachId||r.b===approachId)&&(!r.oneWay||r.b===junctionId)))return [];
  const approach=along(junctionId,approachId,false),heading=Math.atan2(node.x-approach.x,-(node.z-approach.z));
  const exits=links.filter(r=>!r.oneWay||r.a===junctionId).map(road=>({road,node:context.nodeById(road.a===junctionId?road.b:road.a)})).filter(e=>e.node.id!==approachId);
  interface Candidate {row:DirectionRow;cost:number;exit:string}
  const candidate=(costs:Map<string,number>,name:string,kind:'town'|'landmark',destinationId:string):Candidate|undefined=>{
   const cost=costs.get(junctionId);if(cost===undefined||cost<=.01)return;
   const exit=exits.find(e=>Math.abs(distance(node,e.node)+(costs.get(e.node.id)??Infinity)-cost)<.01);if(!exit)return;
   const ahead=along(junctionId,exit.node.id,true),angle=Math.atan2(ahead.x-node.x,-(ahead.z-node.z))-heading,turn=Math.atan2(Math.sin(angle),Math.cos(angle));
   let text=name.toUpperCase(),detail='';
   if(kind==='landmark'&&text.length>27){const spaces=[...text.matchAll(/ /g)].map(m=>m.index!);const split=spaces.sort((a,b)=>Math.abs(a-text.length/2)-Math.abs(b-text.length/2))[0];if(split){detail=text.slice(split+1);text=text.slice(0,split);}}
   return {cost,exit:exit.node.id,row:{text,detail,kind,destinationId,turnAngle:turn,direction:Math.abs(turn)<Math.PI/6?'straight':turn<0?'left':'right'}};
  };
  const townCandidates:Candidate[]=[],localCandidates:Candidate[]=[];
  for(const entry of entrances){
   if(inRect(node,entry.town.area))continue;
   entry.costs??=graph.costsTo(entry.nodes);
   const next=candidate(entry.costs,townSignName(entry.town.area),'town',entry.town.id);if(next)townCandidates.push(next);
  }
  const here=towns.find(t=>inRect(node,t.area));
  for(const place of places){
   if(here&&place.townId&&place.townId!==here.id||distance(node,place.place)>1400)continue;
   place.costs??=graph.costsTo(place.target,1600);
   const next=candidate(place.costs,directionsName(place.place),'landmark',place.place.id);
   if(next){
    if(place.members.length>1){
      next.row.text=directionsName(place.place).toUpperCase();
      next.row.detail=place.members.slice(1).map(p=>/^Municipio\b/.test(p.name)?'Municipio':/^Teatro\b/.test(p.name)?'Teatro':directionsName(p)).join(' / ').toUpperCase();
      next.row.destinationIds=place.members.map(p=>p.id);
    }
    localCandidates.push(next);
   }
  }
  const sort=(a:Candidate,b:Candidate)=>a.cost-b.cost||a.row.text.localeCompare(b.row.text);
  townCandidates.sort(sort);localCandidates.sort((a,b)=>Number(Math.abs(b.row.turnAngle!)>=.45)-Number(Math.abs(a.row.turnAngle!)>=.45)||sort(a,b));
  // Cover each town exit before repeating a town along the same road; reserve space for local places.
  const selected=townCandidates.filter((c,i)=>townCandidates.findIndex(o=>o.exit===c.exit)===i).slice(0,3);
  if(landmarkId){const forced=localCandidates.find(c=>c.row.destinationId===landmarkId||c.row.destinationIds?.includes(landmarkId));if(!forced){cache.set(key,[]);return [];}selected.push(forced);}
  const local=localCandidates.filter((c,i)=>localCandidates.findIndex(o=>o.exit===c.exit)===i);
  for(const next of local.slice(0,selected.length<=1?2:1))if(selected.length<4&&!selected.includes(next))selected.push(next);
  for(const next of [...townCandidates,...localCandidates])if(selected.length<4&&!selected.includes(next))selected.push(next);
  const rows=selected.sort((a,b)=>a.row.turnAngle!-b.row.turnAngle!||a.cost-b.cost).map(c=>c.row);
  cache.set(key,rows);return rows;
 };
}
