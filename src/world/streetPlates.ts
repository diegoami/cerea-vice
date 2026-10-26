import { roadWidth,district,nodes,roads,nodeById,inRect,pointInPolygon,projectToSegment,type Point,type Road} from './district';
import {boardPoints} from './signs';

export interface PlateCoverage {junctionId:string;armId:string;streetName:string}
export interface StreetPlatePlan {
  name:string;position:Point;angle:number;width:number;height:number;
  mount:'wall'|'post';buildingIndex?:number;kind:'junction'|'repeater';
  roadA:string;roadB:string;coverage:PlateCoverage[];viewpoint:Point;
}
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const linksAt=(id:string)=>roads.filter(road=>road.a===id||road.b===id);
function alignment(angle:number,road:Road):number {
  const a=nodeById(road.a),b=nodeById(road.b),length=distance(a,b);
  return Math.abs((Math.cos(angle)*(b.x-a.x)-Math.sin(angle)*(b.z-a.z))/length);
}
/** A plaque runs along its own street, with its normal facing into that street. */
export function plateStreetRoad(plan:Pick<StreetPlatePlan,'position'|'angle'>):Road|undefined {
  return roads.filter(road=>alignment(plan.angle,road)>.94).map(road=>({road,distance:distance(plan.position,projectToSegment(plan.position,nodeById(road.a),nodeById(road.b)))})).sort((a,b)=>a.distance-b.distance)[0]?.road;
}
export function plateIsClear(plan:StreetPlatePlan):boolean {
  return boardPoints(plan).every(point=>{
    if(point.x<district.bounds.minX+.1||point.x>district.bounds.maxX-.1||point.z<district.bounds.minZ+.1||point.z>district.bounds.maxZ-.1)return false;
    if(district.buildings.some((building,index)=>inRect(point,building,index===plan.buildingIndex?-.04:-.2)))return false;
    return roads.every(road=>distance(point,projectToSegment(point,nodeById(road.a),nodeById(road.b)))>roadWidth(road)/2+.1);
  });
}
function clearRay(a:Point,b:Point):boolean {
  const possible=district.buildings.filter(building=>building.x+building.width/2>=Math.min(a.x,b.x)-.1&&building.x-building.width/2<=Math.max(a.x,b.x)+.1&&building.z+building.depth/2>=Math.min(a.z,b.z)-.1&&building.z-building.depth/2<=Math.max(a.z,b.z)+.1);
  const steps=Math.max(1,Math.ceil(distance(a,b)/.25));
  for(let i=1;i<steps;i++)if(possible.some(building=>inRect({x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps},building)))return false;
  return true;
}
export function plateIsVisible(plan:StreetPlatePlan,viewpoint=plan.viewpoint):boolean {
  const dx=viewpoint.x-plan.position.x,dz=viewpoint.z-plan.position.z,length=Math.hypot(dx,dz)||1;
  if((Math.sin(plan.angle)*dx+Math.cos(plan.angle)*dz)/length<.65)return false;
  const ends=boardPoints(plan);
  return [ends[0],plan.position,ends[ends.length-1]].every(point=>clearRay(viewpoint,point));
}
function collidesPlate(plan:StreetPlatePlan,existing:StreetPlatePlan[]):boolean {
  return existing.some(other=>Math.abs(plan.height-other.height)<(plan.width+other.width)*192/1024/2+.12&&boardPoints(plan).some(point=>boardPoints(other).some(second=>distance(point,second)<.3)));
}
function attachStreet(plan:StreetPlatePlan):boolean {
  const road=plateStreetRoad(plan);
  if(!road||road.name!==plan.name)return false;
  const point=projectToSegment(plan.position,nodeById(road.a),nodeById(road.b));
  if(distance(point,plan.position)>roadWidth(road)/2+9)return false;
  plan.roadA=road.a;plan.roadB=road.b;plan.viewpoint=point;
  return plateIsVisible(plan);
}
function findPlate(name:string,anchor:Point,road:Road,kind:StreetPlatePlan['kind'],existing:StreetPlatePlan[],branch?:{origin:Point;dx:number;dz:number}):StreetPlatePlan|undefined {
  const width=Math.max(1.5,Math.min(2.4,.5+name.length*.08));
  const atMouth=(position:Point)=>!branch||(position.x-branch.origin.x)*branch.dx+(position.z-branch.origin.z)*branch.dz>=1;
  const candidates:StreetPlatePlan[]=[];
  const nearby=district.buildings.map((building,index)=>({building,index})).filter(({building})=>Math.abs(building.x-anchor.x)<building.width/2+16&&Math.abs(building.z-anchor.z)<building.depth/2+16);
  for(const {building,index} of nearby) {
    if(!building.points)continue;
    for(let i=0;i<building.points.length;i++){
      const a=building.points[i],b=building.points[(i+1)%building.points.length],length=distance(a,b);
      if(length<width+.4)continue;
      const near=projectToSegment(anchor,a,b),margin=(width/2+.2)/length;
      const t=Math.max(margin,Math.min(1-margin,((near.x-a.x)*(b.x-a.x)+(near.z-a.z)*(b.z-a.z))/(length*length)));
      const position={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
      if(distance(position,anchor)>15)continue;
      let nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length;
      if(pointInPolygon({x:position.x+nx*.1,z:position.z+nz*.1},building.points)){nx=-nx;nz=-nz;}
      const angle=Math.atan2(nx,nz);if(alignment(angle,road)<.94)continue;
      for(const height of [2.6,3.2])if(height+width*192/1024/2+.1<building.height)candidates.push({name,position:{x:position.x+nx*.12,z:position.z+nz*.12},angle,width,height,mount:'wall',buildingIndex:index,kind,roadA:road.a,roadB:road.b,coverage:[],viewpoint:anchor});
    }
  }
  candidates.sort((a,b)=>distance(a.position,anchor)-distance(b.position,anchor)||a.height-b.height);
  for(const candidate of candidates)if(atMouth(candidate.position)&&attachStreet(candidate)&&plateIsClear(candidate)&&!collidesPlate(candidate,existing))return candidate;
  const a=nodeById(road.a),b=nodeById(road.b),length=distance(a,b),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
  for(const shift of [0,2,-2,4,-4,7,-7])for(const side of [1,-1])for(const extra of [.3,1,2.5,5])for(const height of [2.6,3.2]){
    const offset=roadWidth(road)/2+width/2+extra;
    const position={x:anchor.x+dx*shift-dz*offset*side,z:anchor.z+dz*shift+dx*offset*side};
    const centre=projectToSegment(position,a,b);
    const candidate:StreetPlatePlan={name,position,angle:Math.atan2(centre.x-position.x,centre.z-position.z),width,height,mount:'post',kind,roadA:road.a,roadB:road.b,coverage:[],viewpoint:centre};
    if(alignment(candidate.angle,road)<.94)continue;
    if(atMouth(candidate.position)&&attachStreet(candidate)&&plateIsClear(candidate)&&!collidesPlate(candidate,existing))return candidate;
  }
}
function armAnchor(junctionId:string,first:Road,setback:number):{point:Point;road:Road;dx:number;dz:number} {
  let previous=nodeById(junctionId),road=first,id=road.a===junctionId?road.b:road.a;
  const visited=new Set([junctionId]);
  while(!visited.has(id)) {
    visited.add(id);const current=nodeById(id),length=distance(previous,current);
    const links=linksAt(id),next=links.filter(link=>link.name===first.name&&!(link.a===previous.id||link.b===previous.id));
    const stop=setback<=length||links.some(link=>link.name!==first.name)||next.length!==1;
    if(stop){const t=Math.min(.9,setback/length);return {point:{x:previous.x+(current.x-previous.x)*t,z:previous.z+(current.z-previous.z)*t},road,dx:(current.x-previous.x)/length,dz:(current.z-previous.z)/length};}
    setback-=length;previous=current;road=next[0];id=road.a===id?road.b:road.a;
  }
  const a=nodeById(first.a),b=nodeById(first.b),length=distance(a,b);return {point:a,road:first,dx:(b.x-a.x)/length,dz:(b.z-a.z)/length};
}
export function planStreetPlates():{plates:StreetPlatePlan[];missing:PlateCoverage[]} {
  const plates:StreetPlatePlan[]=[],missing:PlateCoverage[]=[];
  const junctions=nodes.filter(node=>new Set(linksAt(node.id).map(road=>road.name)).size>1);
  for(const node of junctions)for(const arm of linksAt(node.id)){
    const armId=arm.a===node.id?arm.b:arm.a,coverage={junctionId:node.id,armId,streetName:arm.name};
    const far=nodeById(armId),length=distance(node,far),branch={origin:node,dx:(far.x-node.x)/length,dz:(far.z-node.z)/length};
    const reuse=plates.find(plate=>plate.name===arm.name&&distance(plate.position,node)<17&&((plate.position.x-node.x)*branch.dx+(plate.position.z-node.z)*branch.dz)>=1);
    if(reuse){reuse.coverage.push(coverage);continue;}
    let plan:StreetPlatePlan|undefined;
    for(const setback of [6,9,13,3,16]){
      const anchor=armAnchor(node.id,arm,setback);
      plan=findPlate(arm.name,anchor.point,anchor.road,'junction',plates,branch);if(plan)break;
    }
    if(plan){plan.coverage.push(coverage);plates.push(plan);}else missing.push(coverage);
  }
  for(const road of roads){
    const a=nodeById(road.a),b=nodeById(road.b),length=distance(a,b);
    for(const t of length>70?[.25,.5,.75]:[.5]){
      const anchor={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
      if(junctions.some(node=>linksAt(node.id).some(link=>link.name===road.name)&&distance(node,anchor)<32))continue;
      if(plates.some(plate=>plate.name===road.name&&distance(plate.position,anchor)<65))continue;
      const plan=findPlate(road.name,anchor,road,'repeater',plates);if(plan)plates.push(plan);
    }
  }
  return {plates,missing};
}
