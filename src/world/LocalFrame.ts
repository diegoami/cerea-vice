import type { DistrictDefinition, Point } from './schema';
/** World/atlas coordinates stay double precision. Only render coordinates rebase. */
export class LocalFrame {
 readonly anchor:Point;
 origin:Point;
 constructor(start:Point){this.anchor={x:Math.round(start.x/4096)*4096,z:Math.round(start.z/4096)*4096};this.origin={...this.anchor};}
 rebase(near:Point){if(Math.abs(near.x-this.origin.x)<=512&&Math.abs(near.z-this.origin.z)<=512)return false;this.origin={x:Math.round(near.x/256)*256,z:Math.round(near.z/256)*256};return true;}
 toLocal(point:Point){return {x:point.x-this.origin.x,z:point.z-this.origin.z};}
 toWorld(point:Point){return {x:point.x+this.origin.x,z:point.z+this.origin.z};}
 get contentOffset(){return {x:this.anchor.x-this.origin.x,z:this.anchor.z-this.origin.z};}
}
/** Subtract in JS doubles BEFORE Float32 mesh attributes are allocated. */
export function translateDistrict(data:DistrictDefinition,dx:number,dz:number):DistrictDefinition {
 const copy=structuredClone(data);
 const seen=new WeakSet<object>();
 const visit=(value:unknown)=>{
  if(!value||typeof value!=='object'||seen.has(value))return;
  seen.add(value);
  const record=value as Record<string,unknown>;
  if(typeof record.x==='number'&&typeof record.z==='number'){record.x+=dx;record.z+=dz;}
  if(typeof record.minX==='number'){for(const key of ['minX','maxX'])record[key]=(record[key] as number)+dx;for(const key of ['minZ','maxZ'])record[key]=(record[key] as number)+dz;}
  for(const child of Object.values(record))if(typeof child==='object')visit(child);
 };
 visit(copy);return copy;
}
