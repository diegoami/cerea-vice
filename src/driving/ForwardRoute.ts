import {RouteGraph} from '../navigation/RouteGraph';
import {inRect,type District,type Point} from '../world/district';
export const roadKey=(road:{a:string;b:string})=>`${road.a}/${road.b}`;
export function forwardEnd(context:District,car:Point&{heading:number}){
 const road=context.nearestRoad(car)?.edge;if(!road)return;
 const a=context.nodeById(road.a),b=context.nodeById(road.b),dot=(b.x-a.x)*Math.sin(car.heading)-(b.z-a.z)*Math.cos(car.heading),length=Math.hypot(b.x-a.x,b.z-a.z)||1;
 if(Math.abs(dot)/length<.35||road.oneWay&&dot<0)return;
 const entry=dot>=0?b:a;
 const along=(entry.x-car.x)*Math.sin(car.heading)-(entry.z-car.z)*Math.cos(car.heading),distance=Math.hypot(entry.x-car.x,entry.z-car.z);
 if(along<-2||distance>4&&along<distance*.35)return;
 return {road,entry:entry.id,behind:dot>=0?road.a:road.b};
}
export function turnSpace(context:District,car:Point){
 return !context.buildings.at(car,6.5).some(b=>inRect(car,b,-6.5))&&
  Array.from({length:8},(_,i)=>({x:car.x+Math.cos(i*Math.PI/4)*6,z:car.z+Math.sin(i*Math.PI/4)*6})).every(p=>!context.inWaterArea(p));
}
/** Other nearby street entries facing the car, for leaving an offset parking bay. */
export function forwardConnections(context:District,car:Point&{heading:number},target:string,blocked:ReadonlyMap<string,number>,forbidden:ReadonlyMap<string,number>,maxCost:number){
 const occupied=context.nearestRoad(car)?.edge,graph=blocked.size?new RouteGraph(context.nodes,context.roads.filter(r=>!blocked.has(roadKey(r)))):context.graph;
 const options=context.roadGrid.at(car,72).filter(r=>r!==occupied&&!blocked.has(roadKey(r))).flatMap(road=>(road.oneWay?[road.b]:[road.a,road.b]).map(entry=>({road,entry,node:context.nodeById(entry)}))).filter(o=>{
  const dx=o.node.x-car.x,dz=o.node.z-car.z,distance=Math.hypot(dx,dz),angle=Math.abs(Math.atan2(Math.sin(Math.atan2(dx,-dz)-car.heading),Math.cos(Math.atan2(dx,-dz)-car.heading)));
  return distance>8&&distance<=72&&angle<1.2&&!forbidden.has(`${roadKey(o.road)}:${o.entry}`);
 }).sort((a,b)=>Math.hypot(a.node.x-car.x,a.node.z-car.z)-Math.hypot(b.node.x-car.x,b.node.z-car.z)).slice(0,12);
 return options.map(o=>{
  let route=graph.search(o.entry,target);const other=o.road.a===o.entry?o.road.b:o.road.a;
  if(route.path[1]===other)route=new RouteGraph(context.nodes,context.roads.filter(r=>r!==o.road&&!blocked.has(roadKey(r)))).search(o.entry,target);
  const distance=Math.hypot(o.node.x-car.x,o.node.z-car.z);
  return {...o,...route,cost:route.cost+distance};
 }).filter(o=>{
  if(!Number.isFinite(o.cost)||o.cost>maxCost)return false;
  const next=o.path[1]&&context.nodeById(o.path[1]);if(!next)return true;
  const heading=Math.atan2(next.x-o.node.x,-(next.z-o.node.z));
  return Math.abs(Math.atan2(Math.sin(heading-car.heading),Math.cos(heading-car.heading)))<1.8;
 }).sort((a,b)=>a.cost-b.cost).slice(0,4);
}
/** Continue along the occupied road, then use other real streets instead of an immediate U-turn. */
export function forwardRoute(context:District,car:Point&{heading:number},target:string,blocked:ReadonlyMap<string,number>,forbiddenEntries:ReadonlyMap<string,number>,maxCost:number,junctions:boolean,visited:ReadonlyMap<string,number>){
 const forward=forwardEnd(context,car);if(!forward||forbiddenEntries.has(`${roadKey(forward.road)}:${forward.entry}`))return;
 const graph=new RouteGraph(context.nodes,context.roads.filter(r=>r!==forward.road&&!blocked.has(roadKey(r))));
 const loop=graph.search(forward.entry,target);
 if(Number.isFinite(loop.cost)&&loop.cost<=maxCost)return {entry:forward.entry,path:loop.path,temporary:false};
 if(!junctions)return;
 const candidates=context.nodes.filter(n=>{
  const d=Math.hypot(n.x-car.x,n.z-car.z);
  const links=context.adjacency.get(n.id)??[];
  return d>12&&d<250&&!visited.has(n.id)&&links.length>2&&links.filter(r=>!r.oneWay||r.a===n.id).length>=2;
 }).sort((a,b)=>Math.hypot(a.x-car.x,a.z-car.z)-Math.hypot(b.x-car.x,b.z-car.z)).slice(0,16);
 const routes=candidates.map(n=>({node:n,...graph.search(forward.entry,n.id)})).filter(r=>Number.isFinite(r.cost));
 routes.sort((a,b)=>(a.cost+(turnSpace(context,a.node)?0:100))-(b.cost+(turnSpace(context,b.node)?0:100)));
 if(routes[0])return {entry:forward.entry,path:routes[0].path,temporary:true};
}
