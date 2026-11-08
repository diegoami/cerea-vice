import { roadWidth, projectToSegment, inRect, type Point, type Road } from "./district";
import { createDirections, type DirectionRow } from "./directions";
import { District } from "./district";
import { townSignName } from "./placeNames";
export interface RoadSignPlan {
  junctionId: string;
  approachId: string;
  position: Point;
  angle: number;
  width: number;
  height: number;
  rows: DirectionRow[];
}
export function createSigns(context:District,options:{signPlaces?:boolean}={}){
const {district,nodes,roads,nodeById}=context;
const {junctionDirections}=createDirections(context,options);
const isMajorRoad=(road:Road)=>["primary","secondary","tertiary"].includes(road.roadClass??"");
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
function approachPoints(junctionId:string,incoming:Road):Point[] {
  const result:Point[]=[nodeById(junctionId)];
  let previous=junctionId,current=incoming.a===junctionId?incoming.b:incoming.a;
  const seen=new Set([junctionId]);
  let length=0;
  while(!seen.has(current)) {
    seen.add(current);const point=nodeById(current);length+=distance(result[result.length-1],point);result.push(point);
    if(length>=45)break;
    const links=(context.adjacency.get(current)??[]);
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
function boardPoints(plan: Pick<RoadSignPlan,"position"|"width"|"angle">): Point[] {
  const steps=Math.ceil(plan.width/.2);
  return Array.from({length:steps+1},(_,i)=>{const t=-plan.width/2+plan.width*i/steps;return {x:plan.position.x+Math.cos(plan.angle)*t,z:plan.position.z-Math.sin(plan.angle)*t};});
}
function boardIsClear(plan: Pick<RoadSignPlan,"position"|"width"|"angle">):boolean {
  return boardPoints(plan).every(point=>{
    if(point.x<district.bounds.minX+.2||point.x>district.bounds.maxX-.2||point.z<district.bounds.minZ+.2||point.z>district.bounds.maxZ-.2)return false;
    if(context.buildings.at(point,.3).some(building=>inRect(point,building,-.3)))return false;
    return context.roadGrid.at(point,.2).every(road=>{const nearest=projectToSegment(point,nodeById(road.a),nodeById(road.b));return distance(point,nearest)>roadWidth(road)/2+.2;});
  });
}
function planJunctionSigns():{signs:RoadSignPlan[];missing:string[]} {
  const signs:RoadSignPlan[]=[],missing:string[]=[];
  for(const node of nodes) {
    const links=(context.adjacency.get(node.id)??[]);
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
/** A compact local destination board at a real approach, without rewriting tile/map data. */
function planApproachBoard(junctionId:string,approachId:string,rows:DirectionRow[]):RoadSignPlan|undefined{
  const incoming=(context.adjacency.get(junctionId)??[]).find(r=>r.a===approachId||r.b===approachId);if(!incoming)return;
  const path=approachPoints(junctionId,incoming),available=path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);
  for(const width of [4.2,3.6,3])for(const side of [1,-1])for(const setback of [10,14,18,6,22,4]){
    if(setback>available-1)continue;const {point,dx,dz}=pointBack(path,setback);
    for(const extra of [.5,1.5,3,5]){
      const offset=roadWidth(incoming)/2+width/2+extra,plan={junctionId,approachId,position:{x:point.x-dz*offset*side,z:point.z+dx*offset*side},angle:Math.atan2(-dx,-dz),width,height:2.8,rows};
      if(boardIsClear(plan))return plan;
    }
  }
}
/** One P sign per bay where one fits; a bay with no clear spot (in a dense centre) keeps only its markings. */
function planParkingSigns():{zoneId:string;position:Point;angle:number;width:number;height:number;label:string}[] {
  return district.parkingZones.flatMap(zone=>{
    // Further rings only when the near ones are blocked (a bay in a dense centre, #25).
    for(const extra of [1,2,4,6,9,12])for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2,Math.PI/4,-Math.PI/4,Math.PI*3/4,-Math.PI*3/4]) {
      const radius=Math.max(zone.width,zone.depth)/2+extra;
      const position={x:zone.x-Math.sin(angle)*radius,z:zone.z-Math.cos(angle)*radius};
      const plan={zoneId:zone.id,position,angle,width:1.8,height:2.6,label:zone.name};
      if(boardIsClear(plan))return [plan];
    }
    return [];
  });
}
function planVittoriaNoEntrySign():{position:Point;angle:number;width:number;height:number}|undefined {
  const road=roads.find(road=>road.name==="Viale della Vittoria"&&road.oneWay&&(context.adjacency.get(road.b)??[]).some(other=>other.name!==road.name));
  if(!road)return;
  const path=approachPoints(road.b,road);
  for(const setback of [5,8,12,16])for(const side of [1,-1])for(const extra of [.5,2,4]) {
    const {point,dx,dz}=pointBack(path,setback);
    const offset=roadWidth(road)/2+.9+extra;
    const plan={position:{x:point.x-dz*offset*side,z:point.z+dx*offset*side},angle:Math.atan2(dx,dz),width:1.8,height:2.8};
    if(boardIsClear(plan))return plan;
  }
}
function planEdgeSigns():{position:Point;angle:number;width:number;height:number;boundary:boolean}[] {
  const result:{position:Point;angle:number;width:number;height:number;boundary:boolean}[]=[];
  for(const node of nodes) {
    const links=(context.adjacency.get(node.id)??[]);
    if(links.length!==1||district.gateways?.some(gateway=>gateway.nodeId===node.id))continue;
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
/**
 * Town and village name signs where a major road crosses a place's boundary (#84): the name for traffic
 * coming in, "FINE" and the name for traffic going out, on the right verge, respecting one-way streets.
 * Only regions get them (see createDirections); a single town's edge is the edge of the map.
 */
function planPlaceSigns():{position:Point;angle:number;width:number;height:number;rows:string[]}[] {
  const places=options.signPlaces&&district.areas.length>1?district.areas:[];
  const result:{position:Point;angle:number;width:number;height:number;rows:string[]}[]=[];
  for(const area of places) {
    const placed:{point:Point;dx:number;dz:number}[]=[];
    for(const road of roads) {
      if(!isMajorRoad(road))continue;
      const a=nodeById(road.a),b=nodeById(road.b);
      if(inRect(a,area)===inRect(b,area))continue;
      for(const [from,to] of road.oneWay?[[a,b]]:[[a,b],[b,a]]) {
        const length=distance(from,to),dx=(to.x-from.x)/length,dz=(to.z-from.z)/length,entering=!inRect(from,area);
        // Where the segment meets the boundary: the last point outside on the way in, the first outside on the way out.
        let low=0,high=1;for(let i=0;i<24;i++){const mid=(low+high)/2,p={x:from.x+(to.x-from.x)*mid,z:from.z+(to.z-from.z)*mid};if(inRect(p,area)===inRect(from,area))low=mid;else high=mid;}
        const crossing={x:from.x+(to.x-from.x)*low,z:from.z+(to.z-from.z)*low};
        // One sign per direction for a road that clips the boundary more than once.
        if(placed.some(other=>distance(other.point,crossing)<80&&other.dx*dx+other.dz*dz>.5))continue;
        const name=townSignName(area).toUpperCase(),rows=entering?[name]:["FINE",name];
        // Large enough to read at driving speed, like a real place-name sign seen from the carriageway.
        const width=Math.max(3.2,Math.min(4.6,.26*Math.max(...rows.map(row=>row.length))+1)),height=rows.length*1.3;
        let selected:typeof result[number]|undefined;
        for(const along of [0,-6,6,-12,12]) {
          const t=Math.max(0,Math.min(length,low*length+along)),point={x:from.x+dx*t,z:from.z+dz*t};
          for(const extra of [.5,1.5,3,5]) {
            const offset=roadWidth(road)/2+width/2+extra;
            const plan={position:{x:point.x-dz*offset,z:point.z+dx*offset},angle:Math.atan2(-dx,-dz),width,height,rows};
            if(boardIsClear(plan)){selected=plan;break;}
          }
          if(selected)break;
        }
        if(selected){result.push(selected);placed.push({point:crossing,dx,dz});}
      }
    }
  }
  return result;
}
/** At a region's gateway (#112), where its road ends at the neighbouring region: the places that road leads on to. */
function planGatewaySigns():{position:Point;angle:number;width:number;height:number;rows:string[];nodeId:string}[] {
  const result:{position:Point;angle:number;width:number;height:number;rows:string[];nodeId:string}[]=[];
  for(const gateway of district.gateways??[]) {
    const road=(context.adjacency.get(gateway.nodeId)??[])[0];if(!road)continue;
    const path=approachPoints(gateway.nodeId,road),width=Math.max(3.2,Math.min(4.6,.26*Math.max(...gateway.sign.map(row=>row.length))+1));
    let selected:typeof result[number]|undefined;
    for(const setback of [10,14,18,6,24])for(const extra of [.5,1.5,3,5]) {
      if(selected)break;
      const {point,dx,dz}=pointBack(path,setback),offset=roadWidth(road)/2+width/2+extra;
      const plan={position:{x:point.x-dz*offset,z:point.z+dx*offset},angle:Math.atan2(-dx,-dz),width,height:gateway.sign.length*1.3,rows:gateway.sign,nodeId:gateway.nodeId};
      if(boardIsClear(plan))selected=plan;
    }
    if(selected)result.push(selected);
  }
  return result;
}
return {isMajorRoad,boardPoints,boardIsClear,planJunctionSigns,planApproachBoard,planParkingSigns,planVittoriaNoEntrySign,planEdgeSigns,planPlaceSigns,planGatewaySigns};
}
