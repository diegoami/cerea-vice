import {inRect,projectToSegment,type Point} from '../world/district';
import type {Bounds} from '../world/schema';
import type {CollisionSource} from './Car';
// Cockpit.ts: camera/driver origin is left of the cabin centre; the bonnet
// reaches farther forward than the small collision circle used by Car physics.
const outline=[[-.75,-2.75],[.32,-2.75],[1.4,-2.75],[1.4,-.5],[1.4,1.9],[.32,1.9],[-.75,1.9],[-.75,-.5]];
/** Negative means the rendered vehicle enters a solid. Small positive values are clamped. */
export function vehicleClearance(car:Point&{heading:number},colliders:CollisionSource,bounds:Bounds){
 const nearby=(Array.isArray(colliders)?colliders:colliders.at(car,3.25)).filter(b=>Math.abs(b.x-car.x)<b.width/2+3.25&&Math.abs(b.z-car.z)<b.depth/2+3.25);
 const c=Math.cos(car.heading),s=Math.sin(car.heading);let clearance=.2;
 for(const [x,z] of outline){
  const p={x:car.x+c*x-s*z,z:car.z+s*x+c*z};
  clearance=Math.min(clearance,p.x-bounds.minX-.1,bounds.maxX-p.x-.1,p.z-bounds.minZ-.1,bounds.maxZ-p.z-.1);
  for(const b of nearby){
   if(!inRect(p,b,-.1))continue;
   let gap:number;
   if(!b.points){const dx=Math.abs(p.x-b.x)-b.width/2,dz=Math.abs(p.z-b.z)-b.depth/2;gap=dx<=0&&dz<=0?Math.max(dx,dz):Math.hypot(Math.max(0,dx),Math.max(0,dz));}
   else{
    gap=Infinity;
    for(const ring of [b.points,...(b.holes??[])])for(let i=0;i<ring.length;i++){const q=projectToSegment(p,ring[i],ring[(i+1)%ring.length]);gap=Math.min(gap,Math.hypot(p.x-q.x,p.z-q.z));}
    if(inRect(p,b))gap=-gap;
   }
   clearance=Math.min(clearance,gap-.1);
  }
 }
 return clearance;
}
