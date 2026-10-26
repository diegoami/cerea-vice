import type { Point, Rect } from './schema';
export interface Box {minX:number;maxX:number;minZ:number;maxZ:number}
export function rectBounds(rect:Rect):Box {
 const bounds={minX:Math.min(rect.x-rect.width/2,rect.x+rect.width/2),maxX:Math.max(rect.x-rect.width/2,rect.x+rect.width/2),minZ:Math.min(rect.z-rect.depth/2,rect.z+rect.depth/2),maxZ:Math.max(rect.z-rect.depth/2,rect.z+rect.depth/2)};
 const include=(point:Point)=>{bounds.minX=Math.min(bounds.minX,point.x);bounds.maxX=Math.max(bounds.maxX,point.x);bounds.minZ=Math.min(bounds.minZ,point.z);bounds.maxZ=Math.max(bounds.maxZ,point.z);};
 for(const point of rect.points??[])include(point);
 for(const hole of rect.holes??[])for(const point of hole)include(point);
 return bounds;
}
/** Conservative broad phase. Exact predicates remain the source of truth. */
export class SpatialGrid<T> {
 private cells=new Map<string,{x:number;z:number;ids:number[]}>();
 readonly bounds:Box;
 constructor(readonly items:readonly T[],box:(item:T)=>Box,readonly size=32){
  if(!Number.isFinite(size)||size<=0)throw new Error("Grid size must be positive and finite");
  const boxes=items.map(box);
  this.bounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
  for(const b of boxes){this.bounds.minX=Math.min(this.bounds.minX,b.minX);this.bounds.maxX=Math.max(this.bounds.maxX,b.maxX);this.bounds.minZ=Math.min(this.bounds.minZ,b.minZ);this.bounds.maxZ=Math.max(this.bounds.maxZ,b.maxZ);}
  for(const [id,b] of boxes.entries())for(let x=Math.floor(b.minX/size);x<=Math.floor(b.maxX/size);x++)for(let z=Math.floor(b.minZ/size);z<=Math.floor(b.maxZ/size);z++){
   const key=`${x},${z}`,cell=this.cells.get(key)??{x,z,ids:[]};cell.ids.push(id);this.cells.set(key,cell);
  }
 }
 query(box:Box):T[]{return this.ids(box).map(id=>this.items[id]);}
 private ids(box:Box):number[]{
  const minX=Math.floor(box.minX/this.size),maxX=Math.floor(box.maxX/this.size),minZ=Math.floor(box.minZ/this.size),maxZ=Math.floor(box.maxZ/this.size),found=new Set<number>();
  if((maxX-minX+1)*(maxZ-minZ+1)>this.cells.size*2){
   for(const cell of this.cells.values())if(cell.x>=minX&&cell.x<=maxX&&cell.z>=minZ&&cell.z<=maxZ)for(const id of cell.ids)found.add(id);
  }else for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++)for(const id of this.cells.get(`${x},${z}`)?.ids??[])found.add(id);
  return [...found].sort((a,b)=>a-b); // Preserve source order for ties and planners.
 }
 at(point:Point,radius=0){return this.query({minX:point.x-radius,maxX:point.x+radius,minZ:point.z-radius,maxZ:point.z+radius});}
 nearest<R extends {distance:number}>(point:Point,evaluate:(item:T)=>R):R {
  if(!Number.isFinite(point.x)||!Number.isFinite(point.z))throw new Error('Nearest query requires finite coordinates');
  if(!this.items.length)throw new Error('Cannot query an empty spatial grid');
  const b=this.bounds;
  let radius=Math.max(this.size,Math.hypot(Math.max(b.minX-point.x,0,point.x-b.maxX),Math.max(b.minZ-point.z,0,point.z-b.maxZ))+this.size);
  let best:R|undefined,bestId=Infinity;const seen=new Set<number>();
  for(;;radius*=2){
   for(const id of this.ids({minX:point.x-radius,maxX:point.x+radius,minZ:point.z-radius,maxZ:point.z+radius})){
    if(seen.has(id))continue;seen.add(id);const candidate=evaluate(this.items[id]);
    if(!best||candidate.distance<best.distance||(candidate.distance===best.distance&&id<bestId)){best=candidate;bestId=id;}
   }
   if(best&&(best.distance<=radius||seen.size===this.items.length))return best;
  }
 }
}
