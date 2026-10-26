import { roadWidth, district, nodes, roads, nodeById, projectToSegment, inRect, type Point, type Road } from "./district";
import { junctionDirections, type DirectionRow } from "./directions";

export interface RoadSignPlan {
  junctionId: string;
  approachId: string;
  position: Point;
  angle: number;
  width: number;
  height: number;
  rows: DirectionRow[];
}
export const isMajorRoad=(road:Road)=>["primary","secondary","tertiary"].includes(road.roadClass??"");
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Trace back along the real approach, including short OSM shape segments. */
function approachPoints(junctionId:string,incoming:Road):Point[] {
  const result:Point[]=[nodeById(junctionId)];
  let previous=junctionId,current=incoming.a===junctionId?incoming.b:incoming.a;
  const seen=new Set([junctionId]);
  let length=0;
  while(!seen.has(current)) {
    seen.add(current);const point=nodeById(current);length+=distance(result[result.length-1],point);result.push(point);
    if(length>=45)break;
    const links=roads.filter(road=>road.a===current||road.b===current);
    if(links.length!==2)break;
    const next=links.find(road=>road.a!==previous&&road.b!==previous);
    if(!next)break;
    previous=current;current=next.a===current?next.b:next.a;
  }
  return result;
}
function pointBack(path:Point[],setback:number):{point:Point;dx:number;dz:number} {
  let remaining=setback;
  for(let i=0;i<path.length-1;i++) {
    const near=path[i],far=path[i+1],length=distance(near,far);
    if(remaining<=length||i===path.length-2) {
      const t=Math.min(.95,remaining/length);
      return {point:{x:near.x+(far.x-near.x)*t,z:near.z+(far.z-near.z)*t},dx:(near.x-far.x)/length,dz:(near.z-far.z)/length};
    }
    remaining-=length;
  }
  throw new Error('Empty junction approach');
}
export function boardPoints(plan: Pick<RoadSignPlan,"position"|"width"|"angle">): Point[] {
  const steps=Math.ceil(plan.width/.2);
  return Array.from({length:steps+1},(_,i)=>{const t=-plan.width/2+plan.width*i/steps;return {x:plan.position.x+Math.cos(plan.angle)*t,z:plan.position.z-Math.sin(plan.angle)*t};});
}
export function boardIsClear(plan: Pick<RoadSignPlan,"position"|"width"|"angle">):boolean {
  return boardPoints(plan).every(point=>{
    if(point.x<district.bounds.minX+.2||point.x>district.bounds.maxX-.2||point.z<district.bounds.minZ+.2||point.z>district.bounds.maxZ-.2)return false;
    if(district.buildings.some(building=>inRect(point,building,-.3)))return false;
    return roads.every(road=>{const nearest=projectToSegment(point,nodeById(road.a),nodeById(road.b));return distance(point,nearest)>roadWidth(road)/2+.2;});
  });
}
export function planJunctionSigns():{signs:RoadSignPlan[];missing:string[]} {
  const signs:RoadSignPlan[]=[],missing:string[]=[];
  for(const node of nodes) {
    const links=roads.filter(road=>road.a===node.id||road.b===node.id);
    const majorNames=new Set(links.filter(isMajorRoad).map(road=>road.name));
    if(majorNames.size<2)continue;
    for(const incoming of links) {
      if(!isMajorRoad(incoming))continue;
      if(incoming.oneWay&&incoming.b!==node.id)continue;
      const approachId=incoming.a===node.id?incoming.b:incoming.a;
      const rows=junctionDirections(node.id,approachId).filter(row=>[...majorNames].some(name=>name.toUpperCase()===row.text));
      if(!rows.length)continue;
      const path=approachPoints(node.id,incoming);
      const available=path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);
      let selected:RoadSignPlan|undefined;
      // Prefer the right verge and a compact board. Left-side placement is allowed
      // when a façade occupies the right verge. Never bury a board in a building.
      for(const width of [4.2,3.6,3]) {
        for(const side of [1,-1]) {
          for(const setback of [12,16,20,8,24,28,4,32]) {
            if(setback>available-1)continue;
            const {point,dx,dz}=pointBack(path,setback);
            for(const extra of [.5,1.5,3,5,8]) {
              const offset=roadWidth(incoming)/2+width/2+extra;
              const plan={junctionId:node.id,approachId,position:{x:point.x-dz*offset*side,z:point.z+dx*offset*side},angle:Math.atan2(-dx,-dz),width,height:3.2,rows};
              if(boardIsClear(plan)){selected=plan;break;}
            }
            if(selected)break;
          }
          if(selected)break;
        }
        if(selected)break;
      }
      if(selected)signs.push(selected);else missing.push(`${node.id}:${approachId}`);
    }
  }
  return {signs,missing};
}

export function planParkingSigns():{zoneId:string;position:Point;angle:number;width:number;height:number;label:string}[] {
  return district.parkingZones.map(zone=>{
    for(const extra of [1,2,4,6])for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2,Math.PI/4,-Math.PI/4,Math.PI*3/4,-Math.PI*3/4]) {
      const radius=Math.max(zone.width,zone.depth)/2+extra;
      const position={x:zone.x-Math.sin(angle)*radius,z:zone.z-Math.cos(angle)*radius};
      const plan={zoneId:zone.id,position,angle,width:1.8,height:2.6,label:zone.name};
      if(boardIsClear(plan))return plan;
    }
    throw new Error(`No clear parking sign position: ${zone.name}`);
  });
}

/** Explain the mapped one-way restriction at the western end of Viale della Vittoria. */
export function planVittoriaNoEntrySign():{position:Point;angle:number;width:number;height:number}|undefined {
  const road=roads.find(road=>road.name==="Viale della Vittoria"&&road.oneWay&&roads.filter(other=>other.a===road.b||other.b===road.b).some(other=>other.name!==road.name));
  if(!road)return;
  const path=approachPoints(road.b,road);
  for(const setback of [5,8,12,16])for(const side of [1,-1])for(const extra of [.5,2,4]) {
    const {point,dx,dz}=pointBack(path,setback);
    const offset=roadWidth(road)/2+.9+extra;
    const plan={position:{x:point.x-dz*offset*side,z:point.z+dx*offset*side},angle:Math.atan2(dx,dz),width:1.8,height:2.8};
    if(boardIsClear(plan))return plan;
  }
}

export function planEdgeSigns():{position:Point;angle:number;width:number;height:number;boundary:boolean}[] {
  const result:{position:Point;angle:number;width:number;height:number;boundary:boolean}[]=[];
  for(const node of nodes) {
    const links=roads.filter(road=>road.a===node.id||road.b===node.id);
    if(links.length!==1)continue;
    const road=links[0];if(road.oneWay&&road.a===node.id)continue;
    const path=approachPoints(node.id,road);
    const boundary=Math.min(node.x-district.bounds.minX,district.bounds.maxX-node.x,node.z-district.bounds.minZ,district.bounds.maxZ-node.z)<40;
    let selected:typeof result[number]|undefined;
    for(const setback of [8,12,16,4])for(const side of [1,-1]) {
      const {point,dx,dz}=pointBack(path,setback),offset=roadWidth(road)/2+1.8;
      const plan={position:{x:point.x-dz*offset*side,z:point.z+dx*offset*side},angle:Math.atan2(-dx,-dz),width:2.4,height:2.8,boundary};
      if(!selected&&boardIsClear(plan))selected=plan;
    }
    if(selected)result.push(selected);
  }
  return result;
}
