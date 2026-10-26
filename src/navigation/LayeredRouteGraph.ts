import {RouteGraph} from './RouteGraph';
import type {Road,RoadNode} from '../world/schema';
import type {Region,Portal} from '../world/streaming/schema';
/** Coarse region/portal planning; detailed graphs are built lazily with a bounded cache. */
export class LayeredRouteGraph {
 private cache=new Map<string,RouteGraph>();
 private lookup:Map<string,RoadNode>;
 private membership=new Map<string,string[]>();
 private byRegion=new Map<string,Region>();
 constructor(private nodes:RoadNode[],private roads:Road[],regions:Region[],private portals:Portal[]){
  this.lookup=new Map(nodes.map(n=>[n.id,n]));
  for(const r of regions){this.byRegion.set(r.id,r);for(const id of r.nodeIds)this.membership.set(id,[...(this.membership.get(id)??[]),r.id]);}
 }
 private graph(id:string){let graph=this.cache.get(id);if(!graph){const region=this.byRegion.get(id)!;const ids=new Set(region.nodeIds);graph=new RouteGraph(this.nodes.filter(n=>ids.has(n.id)),this.roads.filter(r=>r.region===id));this.cache.set(id,graph);if(this.cache.size>2)this.cache.delete(this.cache.keys().next().value!);}return graph;}
 private coarse(from:string,to:string):{regions:string[];portals:string[]}|undefined{
  const queue=[{regions:[from],portals:[] as string[]}],seen=new Set([from]);
  for(let i=0;i<queue.length;i++){const current=queue[i],region=current.regions.at(-1)!;if(region===to)return current;
   for(const p of this.portals){const next=p.from===region?p.to:p.to===region?p.from:undefined;if(next&&!seen.has(next)){seen.add(next);queue.push({regions:[...current.regions,next],portals:[...current.portals,p.nodeId]});}}
  }
 }
 private plans(start:string,target:string,preferred?:string){
  const origins=preferred&&this.membership.get(start)?.includes(preferred)?[preferred]:this.membership.get(start)??[];
  return origins.flatMap(from=>(this.membership.get(target)??[]).flatMap(to=>{const plan=this.coarse(from,to);return plan?[plan]:[];}));
 }
 search(start:string,target:string):{cost:number;path:string[]}{
  let best={cost:Infinity,path:[] as string[]};
  for(const plan of this.plans(start,target)){
   const endpoints=[start,...plan.portals,target];let cost=0,path:string[]=[];
   for(let i=0;i<plan.regions.length;i++){const leg=this.graph(plan.regions[i]).search(endpoints[i],endpoints[i+1]);cost+=leg.cost;path.push(...(i?leg.path.slice(1):leg.path));}
   if(Number.isFinite(cost)){cost=0;for(let i=1;i<path.length;i++){const a=this.lookup.get(path[i-1])!,b=this.lookup.get(path[i])!;cost+=Math.hypot(a.x-b.x,a.z-b.z);}}
   if(cost<best.cost)best={cost,path};
  }
  return best;
 }
 /** Directions need only the current region and next portal, not distant street searches. */
 nextLeg(start:string,target:string,preferred?:string){
  let best={cost:Infinity,path:[] as string[],onward:''};
  for(const plan of this.plans(start,target,preferred)){
   let at=start;
   for(let i=0;i<plan.regions.length;i++){
    const end=plan.portals[i]??target,leg=this.graph(plan.regions[i]).search(at,end);at=end;
    if(!Number.isFinite(leg.cost))break;
    if(leg.path.length>1||i===plan.regions.length-1){if(leg.cost<best.cost)best={...leg,onward:plan.regions.length>1?this.byRegion.get(plan.regions.at(-1)!)!.name:''};break;}
   }
  }
  return best;
 }
 get detailedGraphsResident(){return this.cache.size;}
}
