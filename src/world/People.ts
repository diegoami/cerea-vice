import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {box,material} from './builders';
import type {District} from './district';
import type {Mission} from '../mission/Mission';
import type {LocalFrame} from './LocalFrame';
import type {Point,Rect} from './schema';
import {inRect} from './district';
import {BOARDING_SECONDS,DEPARTURE_SECONDS} from '../mission/Mission';

/** Faceted, clothed people with a face and bent limbs; no external assets. */
export function createPerson(identity:string,seated=false){
  let hash=0;for(const c of identity)hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;
  const shirt=[0x5f8193,0xa26754,0x73815d,0x9c875a][hash%4];
  const skin=[0xd1ab88,0xb78562,0x98694c][hash%3];
  const hair=[0x473b32,0x756148,0x312f2d][hash%3];
  const group=new THREE.Group();group.name=seated?'Seated passenger':'Waiting person';
  const hip=seated?.38:.82,shoulder=hip+.52,headY=shoulder+.29;
  box(group,0,hip+.25,0,.46,.55,.26,shirt);
  box(group,0,hip-.04,0,.43,.18,.29,0x344451);
  box(group,0,shoulder+.08,0,.13,.13,.14,skin);
  const head=new THREE.Mesh(new THREE.IcosahedronGeometry(.205,1),material(skin));head.scale.set(.84,1.12,.85);head.position.y=headY;group.add(head);
  box(group,0,headY+.15,.025,.31,.12,.29,hair);
  box(group,0,headY+.025,-.18,.065,.085,.065,skin);
  for(const side of [-1,1]){
    box(group,side*.073,headY+.07,-.16,.035,.03,.025,0x303538);
    const sleeve=box(group,side*.27,shoulder-.13,0,.17,.31,.24,shirt);sleeve.rotation.z=side*.12;
    const forearm=box(group,side*.29,shoulder-.36,seated?-.13:0,.13,.25,.14,skin);forearm.rotation.x=seated?-1.0:0;
    if(seated){
      box(group,side*.115,hip-.10,-.21,.18,.18,.51,0x344451);
      box(group,side*.115,hip-.30,-.43,.16,.40,.18,0x344451);
      box(group,side*.115,hip-.49,-.48,.19,.12,.30,0x302f2b);
    }else{
      box(group,side*.115,.41,0,.18,.72,.22,0x344451);
      box(group,side*.115,.08,-.065,.21,.15,.35,0x302f2b);
    }
  }
  // One draw call per colour, rather than one per body part.
  group.updateMatrixWorld(true);const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  for(const child of [...group.children])if(child instanceof THREE.Mesh){
    const geometry=child.geometry.clone().applyMatrix4(child.matrixWorld);
    const expanded=geometry.index?geometry.toNonIndexed():geometry;if(expanded!==geometry)geometry.dispose();
    const list=batches.get(child.material)??[];list.push(expanded);batches.set(child.material,list);
    child.geometry.dispose();child.removeFromParent();
  }
  for(const [mat,parts] of batches){group.add(new THREE.Mesh(mergeGeometries(parts,false)!,mat));for(const g of parts)g.dispose();}
  return group;
}

export interface CarPose extends Point {heading:number}
type Solid={at(point:Point,radius?:number):Rect[]}|Rect[];
/** Taxi-relative point: +lx is the passenger side, +lz is rearward. */
export function carPoint(car:CarPose,lx:number,lz:number):Point{
  const c=Math.cos(car.heading),s=Math.sin(car.heading);
  return {x:car.x+c*lx-s*lz,z:car.z+s*lx+c*lz};
}
function carLocal(car:CarPose,p:Point){const c=Math.cos(car.heading),s=Math.sin(car.heading),dx=p.x-car.x,dz=p.z-car.z;return {x:dx*c+dz*s,z:-dx*s+dz*c};}
/** Outside the passenger door, and the point inside it where the passenger sits down. */
export const DOOR={x:1.95,z:.55},SEAT={x:1.05,z:.6};
// Car body plus clearance, in taxi-relative metres.
const BODY={minX:-1.55,maxX:1.95,minZ:-3.4,maxZ:2.8};
const blocked=(solid:Solid,p:Point,margin=.35)=>(Array.isArray(solid)?solid:solid.at(p,margin)).some(r=>inRect(p,r,-margin));
/** True when a walked segment stays clear of buildings and water. */
export function clearPath(solid:Solid,points:Point[]){
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.4));
    for(let j=0;j<=steps;j++)if(blocked(solid,{x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps},.2))return false;
  }
  return true;
}
/**
 * A doorway or other off-street spot beside a stop: walk away from the road
 * until a building face (stand just outside it) or four metres of open ground.
 */
export function kerbOrigin(context:District,solid:Solid,stopId:string,car:CarPose):Point{
  const stop=context.district.taxi!.stops.find(s=>s.id===stopId)!,bay=context.parkingZones.find(b=>b.id===stop.bayId)!;
  const road=context.nearestRoad(bay).point;
  let dx=bay.x-road.x,dz=bay.z-road.z,length=Math.hypot(dx,dz);
  if(length<.5){const side=carPoint(car,1,0);dx=side.x-car.x;dz=side.z-car.z;length=1;}
  dx/=length;dz/=length;
  const start=Math.max(bay.width,bay.depth)/2,fallbacks:Point[]=[];
  // The whole walk counts, including any detour round the bonnet or boot.
  const walkable=(p:Point)=>{const route=walkToDoor(car,p,solid);return !crossesTaxi(car,route)&&clearPath(solid,route);};
  for(const turn of [0,.45,-.45,.9,-.9,1.5,-1.5]){
    const ux=dx*Math.cos(turn)-dz*Math.sin(turn),uz=dx*Math.sin(turn)+dz*Math.cos(turn);
    let last:Point|undefined;
    for(let t=start;t<=start+12;t+=.5){
      const p={x:bay.x+ux*t,z:bay.z+uz*t};
      if(blocked(solid,p)){if(last&&walkable(last))return last;break;}
      // Stop at open ground rather than crossing onto another street.
      if(t>start+1&&context.isPaved(p))break;
      if(!context.isPaved(p))last=p;
      if(last&&t>=start+4){if(walkable(last))return last;break;}
    }
    if(last){if(walkable(last))return last;fallbacks.push(last);}
  }
  // Otherwise stand just beside the passenger door, and failing that take the best earlier spot.
  for(const reach of [2.5,1.8,3.5]){const p=carPoint(car,DOOR.x+reach,DOOR.z);if(!blocked(solid,p)&&walkable(p))return p;}
  return fallbacks[0]??carPoint(car,DOOR.x+2.5,DOOR.z);
}
/** The taxi body itself, in taxi-relative metres: no walk may enter it. */
const HULL={minX:-1,maxX:1.6,minZ:-2.85,maxZ:2.2};
/** True when a walk passes through the taxi body. */
export function crossesTaxi(car:CarPose,points:Point[]){
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1));
    for(let j=0;j<=steps;j++){
      const l=carLocal(car,{x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps});
      if(l.x>HULL.minX&&l.x<HULL.maxX&&l.z>HULL.minZ&&l.z<HULL.maxZ)return true;
    }
  }
  return false;
}
const length=(points:Point[])=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.z-points[i].z),0);
/**
 * Kerb → round the bonnet or boot when needed → passenger door. Routes that
 * enter the taxi are never chosen; with `solid`, the shortest route that also
 * keeps clear of buildings and water wins.
 */
export function walkToDoor(car:CarPose,origin:Point,solid?:Solid):Point[]{
  const door=carPoint(car,DOOR.x,DOOR.z),corner=(x:number,z:number)=>carPoint(car,x,z);
  const FL=corner(BODY.minX,BODY.minZ),FR=corner(BODY.maxX,BODY.minZ),BL=corner(BODY.minX,BODY.maxZ),BR=corner(BODY.maxX,BODY.maxZ);
  const routes=[[],[FR],[BR],[FL,FR],[BL,BR]].map(via=>[origin,...via,door]).filter(route=>!crossesTaxi(car,route)).sort((a,b)=>length(a)-length(b));
  const clear=solid&&routes.find(route=>clearPath(solid,route));
  return clear||routes[0]||[origin,BR,door];
}
function along(points:Point[],fraction:number){
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.z-points[i].z)),total=lengths.reduce((a,b)=>a+b,0);
  let left=Math.max(0,Math.min(1,fraction))*total;
  for(let i=0;i<lengths.length;i++){
    if(left<=lengths[i]||i===lengths.length-1){const t=lengths[i]?Math.min(1,left/lengths[i]):1,a=points[i],b=points[i+1];return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,heading:Math.atan2(b.x-a.x,-(b.z-a.z))};}
    left-=lengths[i];
  }
  return {...points[0],heading:0};
}
/** Where a walking/boarding passenger stands, or undefined when they are not outside. */
export function passengerPose(path:Point[],car:CarPose,fraction:number,leaving=false){
  const walk=.8,f=leaving?1-fraction:fraction;
  if(f<=walk){const p=along(path,f/walk);return {x:p.x,z:p.z,heading:leaving?p.heading+Math.PI:p.heading,sink:0,step:f/walk};}
  // Turn toward the seat and lower into it; the body hides the rest.
  const t=(f-walk)/(1-walk),door=carPoint(car,DOOR.x,DOOR.z),seat=carPoint(car,SEAT.x,SEAT.z);
  return {x:door.x+(seat.x-door.x)*t,z:door.z+(seat.z-door.z)*t,heading:car.heading-Math.PI/2,sink:t*.75,step:0};
}

/**
 * Only the active passenger exists outside the car: walking from a doorway to
 * an accepted, stopped taxi, or away after dropoff. Mission state and timers
 * drive it, so tile reloads, rebasing and saves cannot duplicate or strand it.
 */
export class PassengerPresence {
  private boarder?:{identity:string;figure:THREE.Group};
  private leaver?:{departure:object;figure:THREE.Group;path:Point[];car:CarPose};
  constructor(private context:District,private scene:THREE.Scene,private solid:Solid=context.buildings){}
  private figure(identity:string){const figure=createPerson(identity);figure.name=`Passenger ${identity}`;this.scene.add(figure);return figure;}
  private dispose(figure:THREE.Group){figure.removeFromParent();figure.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}
  private place(figure:THREE.Group,frame:LocalFrame,pose:ReturnType<typeof passengerPose>){
    const q=frame.toLocal(pose);
    figure.position.set(q.x,(this.context.isPaved(pose)?.02:.12)-pose.sink+Math.abs(Math.sin(pose.step*Math.PI*9))*.05,q.z);
    figure.rotation.set(0,-pose.heading,Math.sin(pose.step*Math.PI*9)*.04);
  }
  /** Names of passengers currently drawn outside the taxi (for checks). */
  get outside(){return [this.boarder?.figure,this.leaver?.figure].filter(f=>f?.visible).map(f=>f!.name);}
  update(mission:Mission,frame:LocalFrame,car:CarPose){
    const identity=mission.boarding>0?mission.passengerIdentity:'';
    if(this.boarder&&this.boarder.identity!==identity){this.dispose(this.boarder.figure);this.boarder=undefined;}
    if(identity){
      this.boarder??={identity,figure:this.figure(identity)};
      const path=walkToDoor(car,kerbOrigin(this.context,this.solid,mission.pickupStop!.id,car),this.solid);
      this.place(this.boarder.figure,frame,passengerPose(path,car,1-mission.boarding/BOARDING_SECONDS));
    }
    const departure=mission.departure;
    if(this.leaver&&this.leaver.departure!==departure){this.dispose(this.leaver.figure);this.leaver=undefined;}
    if(departure){
      if(!this.leaver){const pose={x:car.x,z:car.z,heading:car.heading};this.leaver={departure,figure:this.figure(departure.identity),car:pose,path:walkToDoor(pose,kerbOrigin(this.context,this.solid,departure.stopId,pose),this.solid)};}
      this.place(this.leaver.figure,frame,passengerPose(this.leaver.path,this.leaver.car,1-departure.remaining/DEPARTURE_SECONDS,true));
    }
  }
}
