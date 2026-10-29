import type {District} from '../district';
import type {Rect} from '../schema';
/** Resident collision topology is independent of rendering/asset readiness. */
export function streamingColliders(context:District):Rect[]{
 const result:Rect[]=[];
 for(const feature of context.district.features){
  if(feature.kind!=='water')continue;
  for(let i=0;i<feature.points.length-1;i++){
   const a=feature.points[i],b=feature.points[i+1],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/6);
   const nx=-(b.z-a.z)/(length||1)*feature.width/2,nz=(b.x-a.x)/(length||1)*feature.width/2;
   for(let j=0;j<steps;j++){
    const p={x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps},q={x:a.x+(b.x-a.x)*(j+1)/steps,z:a.z+(b.z-a.z)*(j+1)/steps};
    if(context.isPaved({x:(p.x+q.x)/2,z:(p.z+q.z)/2}))continue;
    result.push({x:(p.x+q.x)/2,z:(p.z+q.z)/2,width:Math.abs(q.x-p.x)+feature.width,depth:Math.abs(q.z-p.z)+feature.width,points:[{x:p.x+nx,z:p.z+nz},{x:q.x+nx,z:q.z+nz},{x:q.x-nx,z:q.z-nz},{x:p.x-nx,z:p.z-nz}]});
   }
  }
 }
 // Water areas carry their own collision shape: the water minus every road corridor, so bridges stay open.
 for(const area of context.district.waterAreas??[])result.push(...area.solid);
 return [...result,...context.district.buildings];
}
