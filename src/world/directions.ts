import { district, landmarks, nodes, nodeById, roads } from "./district";

import { shortestRoute } from "../navigation/Navigation";

let cacheDistrict: object | undefined;
const localDestinations = new Map<string, {exit:string;name:string;cost:number}[]>();
function nearbyDestinations(nodeId:string) {
  if(cacheDistrict!==district){localDestinations.clear();cacheDistrict=district;}
  if(!localDestinations.has(nodeId)) {
    const entries=landmarks.map((place)=>{
      const target=[...nodes].sort((a,b)=>Math.hypot(a.x-place.x,a.z-place.z)-Math.hypot(b.x-place.x,b.z-place.z))[0];
      const route=shortestRoute(nodeId,target.id);
      return {exit:route.path[1],name:place.kind==="church"?"San Zeno":place.kind==="library"?"Biblioteca":place.kind==="civic"?"Municipio":place.name,cost:route.cost};
    }).filter((entry)=>entry.exit&&entry.cost<220).sort((a,b)=>a.cost-b.cost);
    localDestinations.set(nodeId,entries);
  }
  return localDestinations.get(nodeId)!;
}

export type SignDirection = "left" | "straight" | "right";
export interface DirectionRow {
  text: string;
  detail: string;
  direction: SignDirection;
}

/** A board belongs to one approach: arrows are relative to its approaching driver. */
export function junctionDirections(nodeId: string, approachId: string): DirectionRow[] {
  const node = nodeById(nodeId);
  const approach = nodeById(approachId);
  const heading = Math.atan2(node.x - approach.x, -(node.z - approach.z));
  return roads
    .filter((road) => road.a === nodeId || road.b === nodeId)
    .map((road) => ({ road, exit: nodeById(road.a === nodeId ? road.b : road.a) }))
    .filter(({ road, exit }) => exit.id !== approachId && (!road.oneWay || road.a === nodeId))
    .map(({ road, exit }): DirectionRow => {
      const exitHeading = Math.atan2(exit.x - node.x, -(exit.z - node.z));
      const turn = Math.atan2(Math.sin(exitHeading - heading), Math.cos(exitHeading - heading));
      let detail = exit.label;
      if(district.id!=="harbor") detail=nearbyDestinations(nodeId).find((destination)=>destination.exit===exit.id)?.name ?? (road.oneWay?"Senso unico":"Centro");
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
}
