import { district, nodeById, nodes, roads, hotelBay, projectToSegment, areaAt, type Point, type Road } from "../world/district";
import { bearing, compass, directionHint as harborHint, nearestRoad as harborNearest } from "./HarborNavigation";
export { bearing, compass };

export function nearestRoad(point: Point) {
  if (district.id === "harbor") return harborNearest(point);
  return roads.map((edge) => {
    const projected = projectToSegment(point,nodeById(edge.a),nodeById(edge.b));
    return {edge,point:projected,distance:Math.hypot(point.x-projected.x,point.z-projected.z)};
  }).sort((a,b)=>a.distance-b.distance)[0];
}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
export function shortestRoute(start: string, target = district.mission.nodeId): {cost:number;path:string[]} {
  const costs=new Map(nodes.map((node)=>[node.id,Infinity]));
  const previous=new Map<string,string>(); const remaining=new Set(costs.keys()); costs.set(start,0);
  while (remaining.size) {
    const current=[...remaining].reduce((a,b)=>costs.get(a)!<costs.get(b)!?a:b);
    remaining.delete(current);
    if (!Number.isFinite(costs.get(current)!)) break;
    if (current===target) break;
    for (const edge of roads) {
      const next=edge.a===current?edge.b:edge.b===current&&!edge.oneWay?edge.a:undefined;
      if (!next) continue;
      const cost=costs.get(current)!+distance(nodeById(current),nodeById(next));
      if (cost<costs.get(next)!) { costs.set(next,cost);previous.set(next,current); }
    }
  }
  const cost=costs.get(target)??Infinity;
  if (!Number.isFinite(cost)) return {cost,path:[]};
  const path=[target];while(path[0]!==start)path.unshift(previous.get(path[0])!);
  return {cost,path};
}
const edgeBetween=(a:string,b:string):Road=>roads.find((road)=>(road.a===a&&road.b===b)||(road.b===a&&road.a===b))!;
const cardinal=(from:Point,to:Point)=> Math.abs(to.x-from.x)>Math.abs(to.z-from.z)?(to.x>from.x?"east":"west"):(to.z>from.z?"south":"north");

export function directionHint(point: Point, heading: number): string {
  if (district.id === "harbor") return harborHint(point,heading);
  const nearest=nearestRoad(point);
  const intro=`${nearest.distance>12?"Near":"On"} ${nearest.edge.name}, ${areaAt(point)}, facing ${compass(heading)}.`;
  if (distance(point,hotelBay)<35) return `${intro} ${district.mission.name} is beside you. Stop in the marked ${hotelBay.name}.`;
  const road=nearest.edge as Road;
  const starts=road.oneWay?[road.b]:[road.a,road.b];
  const best=starts.map((id)=>{const route=shortestRoute(id);return {...route,cost:route.cost+distance(nearest.point,nodeById(id))};}).sort((a,b)=>a.cost-b.cost)[0];
  if (!best.path.length) return `${intro} This road leaves the playable district. Return to the signed junction and ask again.`;
  let index=0;
  while(index<best.path.length-1) {
    const id=best.path[index];
    if(roads.filter((r)=>r.a===id||r.b===id).length!==2) break;
    if(index>0&&edgeBetween(best.path[index-1],id).name!==edgeBetween(id,best.path[index+1]).name)break;
    index++;
  }
  const junction=nodeById(best.path[index]);
  const first=nodeById(best.path[0]);
  const away=distance(nearest.point,first)>2&&Math.cos(Math.atan2(first.x-nearest.point.x,-(first.z-nearest.point.z))-heading)<-0.5;
  if(index===best.path.length-1) return `${intro} ${away?"Turn around safely, then follow":"Follow"} the road ${cardinal(nearest.point,junction)} toward ${district.mission.name}; look for its signed stopping bay.`;
  const next=nodeById(best.path[index+1]);
  const incoming=index>0?nodeById(best.path[index-1]):nearest.point;
  const delta=Math.atan2(Math.sin(Math.atan2(next.x-junction.x,-(next.z-junction.z))-Math.atan2(junction.x-incoming.x,-(junction.z-incoming.z))),Math.cos(Math.atan2(next.x-junction.x,-(next.z-junction.z))-Math.atan2(junction.x-incoming.x,-(junction.z-incoming.z))));
  const instruction=Math.abs(delta)<0.35?"continue":delta>0?"turn right":"turn left";
  return `${intro} ${away?"Turn around safely, then continue":"Continue"} ${cardinal(nearest.point,junction)} to ${junction.label}; ${instruction} onto ${edgeBetween(junction.id,next.id).name}.`;
}
