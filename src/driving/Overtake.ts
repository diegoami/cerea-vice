import {inRect,roadWidth,type District,type Point} from '../world/district';
import type {Car,CollisionSource} from './Car';
const angle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
/** A conservative, fixed passing corridor. The driver still uses normal steering and collision physics. */
export function planOvertake(context:District,car:Car,route:Point[],colliders:CollisionSource){
 if(Array.isArray(colliders)||!colliders.moving)return;
 const road=context.nearestRoad(car)?.edge;if(!road||roadWidth(road)<7)return;
 const wanted=/^(primary|secondary|trunk)$/.test(road.roadClass??'')?17:13;
 const forward={x:Math.sin(car.heading),z:-Math.cos(car.heading)},right={x:Math.cos(car.heading),z:Math.sin(car.heading)},side=context.district.drivingSide==='left'?-1:1;
 const relative=(p:Point)=>({along:(p.x-car.x)*forward.x+(p.z-car.z)*forward.z,across:(p.x-car.x)*right.x+(p.z-car.z)*right.z});
 const moving=colliders.moving(),lead=moving.filter(p=>{const r=relative(p);return r.along>9&&r.along<40&&Math.abs(r.across)<2&&p.speed>1&&p.speed<wanted-3&&Math.abs(angle(p.heading-car.heading))<.35;}).sort((a,b)=>relative(a).along-relative(b).along)[0];
 if(!lead)return;
 const average=(Math.max(4,car.speed)+wanted)/2,closing=average-lead.speed;if(closing<3)return;
 const length=Math.max(70,average*((relative(lead).along+18)/closing+2));if(length>160)return;
 let straight=false;
 for(const p of route){const r=relative(p);if(r.along< -1||Math.abs(r.across)>1.2)return;if(r.along>length+15){straight=true;break;}}
 if(!straight)return;
 // Crossing a side road or entering a bend while passing is not an acceptable gap.
 const seen=new Set<string>();
 for(const edge of context.roadGrid.at(car,length+15))for(const id of [edge.a,edge.b]){
  if(seen.has(id))continue;seen.add(id);const p=context.nodeById(id),r=relative(p);
  if(r.along>0&&r.along<length+15&&Math.abs(r.across)<6&&(context.adjacency.get(id)?.length??0)>2)return;
 }
 const point=(along:number,across:number)=>({x:car.x+forward.x*along+right.x*across,z:car.z+forward.z*along+right.z*across});
 const points=[point(10,-side*3.6),point(length-18,-side*3.6),point(length,0)];
 let from:Point=car,travel=0;
 for(const to of points){
  const distance=Math.hypot(to.x-from.x,to.z-from.z),steps=Math.ceil(distance/.8);
  for(let i=1;i<=steps;i++){
   const p={x:from.x+(to.x-from.x)*i/steps,z:from.z+(to.z-from.z)*i/steps},time=(travel+distance*i/steps)/average;
   if(!context.isPaved(p)||colliders.at(p,1.35).some(b=>inRect(p,b,-1.35)))return;
   // Predict other cars throughout the manoeuvre, including the return gap.
   for(const other of moving)for(const uncertainty of [-.8,0,.8]){
    const t=Math.max(0,time+uncertainty),future={x:other.x+Math.sin(other.heading)*other.speed*t,z:other.z-Math.cos(other.heading)*other.speed*t};
    const dx=p.x-future.x,dz=p.z-future.z,along=Math.abs(dx*Math.sin(other.heading)-dz*Math.cos(other.heading)),across=Math.abs(dx*Math.cos(other.heading)+dz*Math.sin(other.heading));
    if(along<3.25&&across<2.125)return;
   }
  }
  travel+=distance;from=to;
 }
 return {points,length,forward};
}
