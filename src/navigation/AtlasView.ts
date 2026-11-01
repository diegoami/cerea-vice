import { type Point } from "../world/district";
import { District } from "../world/district";
export function createAtlasView(context:District){
const {district}=context;
class AtlasView {
  base:{x:number;z:number;width:number;height:number};
  readonly overview:{x:number;z:number;width:number;height:number};
  centre:Point;
  zoom=1;
  constructor(){
    const b=district.bounds,span=Math.max(b.maxX-b.minX,b.maxZ-b.minZ),u=span/240;
    this.base={x:(b.minX+b.maxX-span)/2-14*u,z:(b.minZ+b.maxZ-span)/2-17*u,width:span+28*u,height:span+28*u};
    if(span>4000)this.base={x:b.minX-150,z:b.minZ-150,width:b.maxX-b.minX+300,height:b.maxZ-b.minZ+300};
    this.overview={...this.base};
    this.centre={x:this.base.x+this.base.width/2,z:this.base.z+this.base.height/2};
  }
  get box(){return {x:this.centre.x-this.base.width/this.zoom/2,z:this.centre.z-this.base.height/this.zoom/2,width:this.base.width/this.zoom,height:this.base.height/this.zoom};}
  private clamp(){const hw=this.base.width/this.zoom/2,hh=this.base.height/this.zoom/2;this.centre.x=Math.max(this.base.x+hw,Math.min(this.base.x+this.base.width-hw,this.centre.x));this.centre.z=Math.max(this.base.z+hh,Math.min(this.base.z+this.base.height-hh,this.centre.z));}
  reset(){this.zoom=1;this.centre={x:this.base.x+this.base.width/2,z:this.base.z+this.base.height/2};}
  setSheet(sheet?:{minX:number;minZ:number;span:number}){
    const u=sheet?sheet.span/240:0;
    this.base=sheet?{x:sheet.minX-14*u,z:sheet.minZ-17*u,width:sheet.span+28*u,height:sheet.span+28*u}:{...this.overview};
    this.reset();
  }
  zoomAt(factor:number,anchor:Point=this.centre){
    const next=Math.max(1,Math.min(8,this.zoom*factor)),ratio=this.zoom/next;
    this.centre={x:anchor.x+(this.centre.x-anchor.x)*ratio,z:anchor.z+(this.centre.z-anchor.z)*ratio};this.zoom=next;this.clamp();
  }
  pan(dx:number,dz:number){this.centre={x:this.centre.x+dx,z:this.centre.z+dz};this.clamp();}
  focus(point:Point,zoom=4){this.zoom=Math.max(1,Math.min(8,zoom));this.centre={...point};this.clamp();}
  ensureVisible(point:Point){
    const box=this.box,mx=box.width*.12,mz=box.height*.12;
    const dx=point.x<box.x+mx?point.x-(box.x+mx):point.x>box.x+box.width-mx?point.x-(box.x+box.width-mx):0;
    const dz=point.z<box.z+mz?point.z-(box.z+mz):point.z>box.z+box.height-mz?point.z-(box.z+box.height-mz):0;
    this.pan(dx,dz);
  }
}
return {AtlasView};
}
export type AtlasView=InstanceType<ReturnType<typeof createAtlasView>["AtlasView"]>;
