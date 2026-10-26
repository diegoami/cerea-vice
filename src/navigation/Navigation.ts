import { type Point, type Road } from "../world/district";
import type { NavigationTarget } from "../world/schema";
import { createHarborNavigation } from "./HarborNavigation";
import { District } from "../world/district";
export function createNavigation(context:District){
const {district,nodeById,roads,hotelBay,areaAt}=context;
const {bearing,compass,directionHint:harborHint,nearestRoad:harborNearest}=createHarborNavigation(context);

function nearestRoad(point: Point) {
  return context.profile.measure("nearest-road",()=>district.id==="harbor"?harborNearest(point):context.nearestRoad(point));
}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
function shortestRoute(start: string, target = district.mission.nodeId): {cost:number;path:string[]} {
  return context.profile.measure("route-search",()=>context.graph.search(start,target));
}
const edgeBetween=(a:string,b:string):Road=>roads.find((road)=>(road.a===a&&road.b===b)||(road.b===a&&road.a===b))!;
const cardinal=(from:Point,to:Point)=> Math.abs(to.x-from.x)>Math.abs(to.z-from.z)?(to.x>from.x?"east":"west"):(to.z>from.z?"south":"north");
function directionHint(point: Point, heading: number, target: NavigationTarget = {name:district.mission.name,nodeId:district.mission.nodeId,bay:hotelBay}): string {
  if (district.id === "harbor") return harborHint(point,heading);
  const nearest=nearestRoad(point);
  const intro=`${nearest.distance>12?"Near":"On"} ${nearest.edge.name}, ${areaAt(point)}, facing ${compass(heading)}.`;
  if (distance(point,target.bay)<35) return `${intro} ${target.name} is beside you. Stop in the marked ${target.bay.name}.`;
  const road=nearest.edge as Road;
  const starts=road.oneWay?[road.b]:[road.a,road.b];
  const best=starts.map((id)=>{const route=shortestRoute(id,target.nodeId);return {...route,cost:route.cost+distance(nearest.point,nodeById(id))};}).sort((a,b)=>a.cost-b.cost)[0];
  if (!best.path.length) return `${intro} This road leaves the playable district. Return to the signed junction and ask again.`;
  let index=0;
  while(index<best.path.length-1) {
    const id=best.path[index];
    if((context.adjacency.get(id)??[]).length!==2) break;
    if(index>0&&edgeBetween(best.path[index-1],id).name!==edgeBetween(id,best.path[index+1]).name)break;
    index++;
  }
  const junction=nodeById(best.path[index]);
  const first=nodeById(best.path[0]);
  const away=distance(nearest.point,first)>2&&Math.cos(Math.atan2(first.x-nearest.point.x,-(first.z-nearest.point.z))-heading)<-0.5;
  if(index===best.path.length-1) return `${intro} ${away?"Turn around safely, then follow":"Follow"} the road ${cardinal(nearest.point,junction)} toward ${target.name}; look for its signed stopping bay.`;
  const next=nodeById(best.path[index+1]);
  const incoming=index>0?nodeById(best.path[index-1]):nearest.point;
  const delta=Math.atan2(Math.sin(Math.atan2(next.x-junction.x,-(next.z-junction.z))-Math.atan2(junction.x-incoming.x,-(junction.z-incoming.z))),Math.cos(Math.atan2(next.x-junction.x,-(next.z-junction.z))-Math.atan2(junction.x-incoming.x,-(junction.z-incoming.z))));
  const instruction=Math.abs(delta)<0.35?"continue":delta>0?"turn right":"turn left";
  return `${intro} ${away?"Turn around safely, then continue":"Continue"} ${cardinal(nearest.point,junction)} to ${junction.label}; ${instruction} onto ${edgeBetween(junction.id,next.id).name}.`;
}
return {bearing,compass,nearestRoad,shortestRoute,directionHint};
}
