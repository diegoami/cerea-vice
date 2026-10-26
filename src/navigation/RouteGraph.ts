import type { Point, Road, RoadNode } from '../world/schema';
interface Entry {id:string;cost:number;order:number}
/** Cost then reverse source-node order matches the original Dijkstra tie rule. */
class Heap {
 private items:Entry[]=[];
 private before(a:Entry,b:Entry){return a.cost<b.cost||(a.cost===b.cost&&a.order>b.order);}
 push(value:Entry){const a=this.items;let i=a.length;a.push(value);while(i>0){const p=(i-1)>>1;if(!this.before(value,a[p]))break;a[i]=a[p];i=p;}a[i]=value;}
 pop(){const a=this.items;if(!a.length)return;const first=a[0],last=a.pop()!;if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&this.before(a[child+1],a[child]))child++;if(!this.before(a[child],last))break;a[i]=a[child];i=child;}a[i]=last;}return first;}
}
export class RouteGraph {
 private nodes:Map<string,RoadNode>;
 private order:Map<string,number>;
 private links=new Map<string,{id:string;distance:number}[]>();
 constructor(nodes:RoadNode[],roads:Road[]){
  this.nodes=new Map(nodes.map(n=>[n.id,n]));this.order=new Map(nodes.map((n,i)=>[n.id,i]));
  for(const n of nodes)this.links.set(n.id,[]);
  const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
  for(const r of roads){const d=distance(this.nodes.get(r.a)!,this.nodes.get(r.b)!);this.links.get(r.a)!.push({id:r.b,distance:d});if(!r.oneWay)this.links.get(r.b)!.push({id:r.a,distance:d});}
 }
 search(start:string,target:string):{cost:number;path:string[]}{
  if(!this.nodes.has(start)||!this.nodes.has(target))return {cost:Infinity,path:[]};
  const costs=new Map<string,number>([[start,0]]),previous=new Map<string,string>(),heap=new Heap();
  heap.push({id:start,cost:0,order:this.order.get(start)!});
  for(let current=heap.pop();current;current=heap.pop()){
   if(current.cost!==costs.get(current.id))continue;
   if(current.id===target){const path=[target];while(path[0]!==start)path.unshift(previous.get(path[0])!);return {cost:current.cost,path};}
   for(const link of this.links.get(current.id)!){const cost=current.cost+link.distance;if(cost<(costs.get(link.id)??Infinity)){costs.set(link.id,cost);previous.set(link.id,current.id);heap.push({id:link.id,cost,order:this.order.get(link.id)!});}}
  }
  return {cost:Infinity,path:[]};
 }
}
