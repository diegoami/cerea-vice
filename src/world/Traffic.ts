import * as THREE from 'three';
import {createCar,type Car,type CollisionSource} from '../driving/Car';
import {idleActions} from '../game/DemoDriver';
import {inRect,roadWidth,type District,type Point,type Rect,type Road} from './district';
import type {LocalFrame} from './LocalFrame';
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
export function carFootprint(car:Point&{heading:number},width=1.55,length=3.8):Rect{
 const c=Math.cos(car.heading),s=Math.sin(car.heading),points=[[-width/2,-length/2],[width/2,-length/2],[width/2,length/2],[-width/2,length/2]].map(([x,z])=>({x:car.x+c*x-s*z,z:car.z+s*x+c*z}));
 return {x:car.x,z:car.z,width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),depth:Math.max(...points.map(p=>p.z))-Math.min(...points.map(p=>p.z)),points};
}
interface Agent {car:Car;road:Road;from:string;to:string;model:THREE.Group;parked:boolean;best:number;stalled:number;}
/** A deliberately small local population. Spawns/evictions stay beyond close view and never in service bays. */
export class Traffic {
 readonly agents:Agent[]=[];
 readonly collisionSource:CollisionSource;
 private sequence=0;
 private readonly materials:THREE.Material[]=[];
 private readonly paints=new Map<number,THREE.Material>();
 constructor(private context:District,private scene:THREE.Scene,private solid:Exclude<CollisionSource,Rect[]>){
  this.collisionSource={at:(p:Point,r=0)=>[...this.solid.at(p,r),...this.agents.map(a=>carFootprint(a.car)).filter(b=>inRect(p,b,-r))]};
 }
 private model(){
  const group=new THREE.Group();group.name='Local traffic';
  const paint=(colour:number,basic=false)=>{let m=this.paints.get(colour);if(!m){m=basic?new THREE.MeshBasicMaterial({color:colour}):new THREE.MeshLambertMaterial({color:colour});this.paints.set(colour,m);this.materials.push(m);}return m;};
  const body=paint([0x957866,0x7897a9,0x8d9d73][this.sequence%3]),glass=paint(0x4c6675),tyre=paint(0x26292a),lamp=paint(0xe3cd9a,true);
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,mat:THREE.Material)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);group.add(mesh);};
  box(0,.6,0,1.55,.65,3.8,body);box(0,1.12,.1,1.35,.55,1.9,glass);box(0,1.42,.1,1.4,.1,1.95,body);
  for(const x of [-.77,.77])for(const z of [-1.2,1.2])box(x,.3,z,.18,.6,.55,tyre);
  for(const x of [-.5,.5])box(x,.65,-1.93,.3,.2,.05,lamp);
  this.scene.add(group);return group;
 }
 private lane(road:Road,from:string,to:string,at:Point){const a=this.context.nodeById(from),b=this.context.nodeById(to),length=distance(a,b)||1,offset=Math.min(1.9,roadWidth(road)/2-1.2)*(this.context.district.drivingSide==='left'?-1:1);return {x:at.x-(b.z-a.z)/length*offset,z:at.z+(b.x-a.x)/length*offset};}
 private spawn(player:Point){
  const roads=this.context.roadGrid.at(player,220).filter(r=>distance(this.context.nodeById(r.a),this.context.nodeById(r.b))>25);
  for(let i=0;i<roads.length;i++){
   const road=roads[(i+this.sequence*31)%roads.length],a=this.context.nodeById(road.a),b=this.context.nodeById(road.b),from=!road.oneWay&&this.sequence%2?road.b:road.a,to=from===road.a?road.b:road.a;
   const p=this.lane(road,from,to,{x:(a.x+b.x)/2,z:(a.z+b.z)/2});
   if(distance(p,player)<75||distance(p,player)>220||this.agents.some(a=>distance(a.car,p)<30)||this.solid.at(p,1.05).some(b=>inRect(p,b,-1.05))||this.context.parkingZones.some(b=>inRect(p,b,-6)))continue;
   const start=this.context.nodeById(from),end=this.context.nodeById(to),car=new (createCar(this.context).Car)();car.reset({...p,heading:Math.atan2(end.x-start.x,-(end.z-start.z))});
   this.agents.push({car,road,from,to,model:this.model(),parked:false,best:Infinity,stalled:0});this.sequence++;return;
  }
 }
 update(dt:number,player:Point&{heading:number;speed:number}){
  for(let i=this.agents.length-1;i>=0;i--)if(distance(this.agents[i].car,player)>320){const a=this.agents.splice(i,1)[0];a.model.removeFromParent();a.model.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}
  if(this.agents.length<3)this.spawn(player);
  for(const a of this.agents){
   const node=this.context.nodeById(a.to),aim=this.lane(a.road,a.from,a.to,node);
   if(!a.parked&&distance(a.car,aim)<7){
    const choices=(this.context.adjacency.get(a.to)??[]).filter(r=>r!==a.road&&(!r.oneWay||r.a===a.to));
    if(!choices.length)a.parked=true;
    else{const next=choices[(this.sequence+a.to.length)%choices.length];a.from=a.to;a.to=next.a===a.from?next.b:next.a;a.road=next;a.best=Infinity;a.stalled=0;}
   }
   const goal=this.lane(a.road,a.from,a.to,this.context.nodeById(a.to)),wanted=Math.atan2(goal.x-a.car.x,-(goal.z-a.car.z)),error=Math.atan2(Math.sin(wanted-a.car.heading),Math.cos(wanted-a.car.heading));
   const ahead=(p:Point)=>{const dx=p.x-a.car.x,dz=p.z-a.car.z;return {forward:dx*Math.sin(a.car.heading)-dz*Math.cos(a.car.heading),side:Math.abs(dx*Math.cos(a.car.heading)+dz*Math.sin(a.car.heading))};};
   const p=ahead(player),yielding=p.forward>0&&p.forward<14&&p.side<2.8&&Math.abs(player.speed)>.5;
   const blocked=this.agents.some(b=>{const p=ahead(b.car);return b!==a&&p.forward>0&&p.forward<9&&p.side<2;});
   const remaining=distance(a.car,goal);if(remaining<a.best-.5){a.best=remaining;a.stalled=0;}else a.stalled+=dt;if(a.stalled>10)a.parked=true;
   const speed=Math.abs(error)>.6?3:6,steer=Math.max(-1,Math.min(1,2*Math.sin(error)/Math.max(6,Math.min(12,distance(a.car,goal)))*2.8/.6*(1+Math.abs(a.car.speed)*.07)));
   const action={...idleActions(),steer,throttle:a.parked||yielding||blocked?0:Math.max(0,Math.min(1,(speed-a.car.speed)*.5+speed*.45/9)),brake:a.parked||yielding||blocked?1:Math.max(0,(a.car.speed-speed)*.3)};
   const others:Rect[]=[{x:player.x,z:player.z,width:8,depth:8},...this.agents.filter(b=>b!==a).map(b=>carFootprint(b.car)),...this.context.parkingZones.map(b=>({...b,width:b.width+3,depth:b.depth+3}))];
   const before={x:a.car.x,z:a.car.z,heading:a.car.heading};
   a.car.update(dt,action,{at:(p:Point,r=0)=>[...this.solid.at(p,r),...others.filter(b=>inRect(p,b,-r))]});
   if(inRect(player,carFootprint(a.car),-1.1))Object.assign(a.car,{...before,speed:0});
  }
 }
 render(frame:LocalFrame){for(const a of this.agents){const p=frame.toLocal(a.car);a.model.position.set(p.x,0,p.z);a.model.rotation.y=-a.car.heading;}}
 clear(){for(const a of this.agents){a.model.removeFromParent();a.model.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}this.agents.length=0;}
 dispose(){for(const a of this.agents){a.model.removeFromParent();a.model.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}this.agents.length=0;for(const m of this.materials)m.dispose();this.materials.length=0;this.paints.clear();}
}
