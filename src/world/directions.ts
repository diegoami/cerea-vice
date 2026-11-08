import { createNavigation } from "../navigation/Navigation";
import { RouteGraph } from "../navigation/RouteGraph";
import { District } from "./district";
import { directionsName, townSignName } from "./placeNames";
export type SignDirection = "left" | "straight" | "right";
export interface DirectionRow {
  text: string;
  detail: string;
  direction: SignDirection;
  /** Exact outgoing road bearing relative to the approach, for surveyed destination boards. */
  turnAngle?:number;
  kind?:'town'|'landmark';
  destinationId?:string;
  destinationIds?:string[];
}
export function createDirections(context:District,{signPlaces=false}:{signPlaces?:boolean}={}){
const {district,landmarks,nodes,nodeById}=context;
const {shortestRoute}=createNavigation(context);
let cacheDistrict: object | undefined;
const localDestinations = new Map<string, {exit:string;name:string;cost:number}[]>();
function nearbyDestinations(nodeId:string) {
  if(cacheDistrict!==district){localDestinations.clear();cacheDistrict=district;}
  if(!localDestinations.has(nodeId)) {
    const entries=landmarks.map((place)=>{
      const target=[...nodes].sort((a,b)=>Math.hypot(a.x-place.x,a.z-place.z)-Math.hypot(b.x-place.x,b.z-place.z))[0];
      const route=shortestRoute(nodeId,target.id);
      return {exit:route.path[1],name:directionsName(place),cost:route.cost};
    }).filter((entry)=>entry.exit&&entry.cost<220).sort((a,b)=>a.cost-b.cost);
    localDestinations.set(nodeId,entries);
  }
  return localDestinations.get(nodeId)!;
}
// Towns and villages a region's boards can name (#84). Only the region tiler asks for them: other maps' areas
// are neighbourhoods (Harbor) or a test fixture's countryside (the outskirts prototype), not places on a sign.
const places=signPlaces&&district.areas.length>1?district.areas:[];
// Towns outrank villages on a board; villages are the small sketch zones (about 250-400 m across).
const isTown=(area:{width:number;depth:number})=>Math.min(area.width,area.depth)>=600;
let placeCosts:{area:string;name:string;town:boolean;costs:Map<string,number>}[]|undefined;
function costsToPlaces(){
  if(!placeCosts){
    const graph=new RouteGraph(nodes,district.roads);
    placeCosts=places.map(area=>{const centre=[...nodes].sort((a,b)=>Math.hypot(a.x-area.x,a.z-area.z)-Math.hypot(b.x-area.x,b.z-area.z))[0];
      return {area:area.name,name:townSignName(area),town:isTown(area),costs:graph.costsTo(centre.id)};});
  }
  return placeCosts;
}
/** For each legal exit, the other town (else village) whose shortest route from this junction leaves by it. */
function placesByExit(nodeId:string,exits:{road:{a:string;b:string};exit:{id:string;x:number;z:number}}[]){
  const here=context.areaAt(nodeById(nodeId)),node=nodeById(nodeId),best=new Map<string,{name:string;town:boolean;cost:number}>();
  for(const place of costsToPlaces()){
    if(place.area===here)continue;
    let choice:{exit:string;cost:number}|undefined;
    for(const {exit} of exits){const cost=Math.hypot(exit.x-node.x,exit.z-node.z)+(place.costs.get(exit.id)??Infinity);if(cost<(choice?.cost??Infinity))choice={exit:exit.id,cost};}
    if(!choice||!Number.isFinite(choice.cost))continue;
    const current=best.get(choice.exit);
    if(!current||(place.town&&!current.town)||(place.town===current.town&&choice.cost<current.cost))best.set(choice.exit,{name:place.name,town:place.town,cost:choice.cost});
  }
  return best;
}
function junctionDirections(nodeId: string, approachId: string): DirectionRow[] {
  const node = nodeById(nodeId);
  const approach = nodeById(approachId);
  const heading = Math.atan2(node.x - approach.x, -(node.z - approach.z));
  const legal=(context.adjacency.get(nodeId)??[])
    .map((road) => ({ road, exit: nodeById(road.a === nodeId ? road.b : road.a) }))
    .filter(({ road }) => !road.oneWay || road.a === nodeId);
  const towns=places.length?placesByExit(nodeId,legal):undefined;
  const inPlace=places.some(area=>area.name===context.areaAt(node));
  const rows=legal
    .filter(({ exit }) => exit.id !== approachId)
    .map(({ road, exit }): DirectionRow => {
      const exitHeading = Math.atan2(exit.x - node.x, -(exit.z - node.z));
      const turn = Math.atan2(Math.sin(exitHeading - heading), Math.cos(exitHeading - heading));
      let detail = exit.label;
      if(district.id!=="harbor") detail=nearbyDestinations(nodeId).find((destination)=>destination.exit===exit.id)?.name ?? towns?.get(exit.id)?.name ?? (road.oneWay?"Senso unico":towns&&!inPlace?"":"Centro");
      if (district.id === "harbor" && (exit.id === "e" || exit.id === "ne")) detail = "Blue Hotel";
      if (district.id === "harbor" && exit.id === "nw") detail = "Water Tower";
      if (district.id === "harbor" && exit.id === "w") detail = "Old Market";
      return {
        text: road.name.toUpperCase(),
        detail: detail.toUpperCase(),
        direction: Math.abs(turn) < 0.2 ? "straight" : turn < 0 ? "left" : "right",
      };
    })
    .sort((a, b) => ["left", "straight", "right"].indexOf(a.direction) - ["left", "straight", "right"].indexOf(b.direction));
  // Two carriageways or splayed exits of one street can sign the same thing twice; keep one row.
  return rows.filter((row,i)=>rows.findIndex(other=>other.text===row.text&&other.detail===row.detail&&other.direction===row.direction)===i);
}
return {junctionDirections};
}
