import * as THREE from 'three';
import {createCar,type Car,type CollisionSource} from '../driving/Car';
import {idleActions} from '../game/DemoDriver';
import {inRect,projectToSegment,roadWidth,type District,type Point,type Rect,type Road} from './district';
import type {LocalFrame} from './LocalFrame';
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const angle=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
export function carFootprint(car:Point&{heading:number},width=1.55,length=3.8):Rect{
 const c=Math.cos(car.heading),s=Math.sin(car.heading),points=[[-width/2,-length/2],[width/2,-length/2],[width/2,length/2],[-width/2,length/2]].map(([x,z])=>({x:car.x+c*x-s*z,z:car.z+s*x+c*z}));
 return {x:car.x,z:car.z,width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),depth:Math.max(...points.map(p=>p.z))-Math.min(...points.map(p=>p.z)),points};
}
interface Agent {car:Car;road:Road;from:string;to:string;model:THREE.Group;best:number;stalled:number;recovery:'none'|'brake'|'reverse'|'settle';age:number;origin:Point;turn:number;recoveries:number;visited:Map<Road,number>;distanceDriven:number;yieldPoint?:Point;nextShoulder:number;steer:number;}
/** A deliberately small local population. Spawns/evictions stay beyond close view and never in service bays. */
export class Traffic {
 readonly agents:Agent[]=[];
 readonly collisionSource:CollisionSource;
 private sequence=0;
 private elapsed=0;
 private readonly materials:THREE.Material[]=[];
 private readonly paints=new Map<number,THREE.Material>();
 private readonly probe:Car;
 private readonly lanes=new WeakMap<Road,Map<string,boolean>>();
 constructor(private context:District,private scene:THREE.Scene,private solid:Exclude<CollisionSource,Rect[]>){
  this.probe=new (createCar(context).Car)();
  this.collisionSource={at:(p:Point,r=0)=>[...this.solid.at(p,r),...this.agents.map(a=>carFootprint(a.car)).filter(b=>inRect(p,b,-r))],moving:()=>this.agents.map(a=>a.car)};
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
 private clearLane(road:Road,from:string,to:string){
  let cached=this.lanes.get(road);if(!cached){cached=new Map();this.lanes.set(road,cached);}if(cached.has(from))return cached.get(from)!;
  const a=this.context.nodeById(from),b=this.context.nodeById(to),steps=Math.max(1,Math.ceil(distance(a,b)/3)),bounds=this.context.district.bounds;
  for(let i=0;i<=steps;i++){
   const p=this.lane(road,from,to,{x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps});
   if(p.x<bounds.minX+2||p.x>bounds.maxX-2||p.z<bounds.minZ+2||p.z>bounds.maxZ-2||this.solid.at(p,1.1).some(b=>inRect(p,b,-1.1))||this.context.parkingZones.some(b=>inRect(p,b,-3))){cached.set(from,false);return false;}
  }
  cached.set(from,true);return true;
 }
 private drivable(road:Road,from:string,to:string,seen=new Set<string>()):boolean{
  if(!this.clearLane(road,from,to))return false;
  if(!road.oneWay||seen.has(to))return true;
  // Do not enter a one-way chain that ends at a map edge or blocked service bay.
  // A directed loop or a road permitting a normal turnaround provides an escape.
  if(seen.size>128)return false;
  const nextSeen=new Set(seen);nextSeen.add(to);
  return (this.context.adjacency.get(to)??[]).some(next=>next!==road&&(!next.oneWay||next.a===to)&&this.drivable(next,to,next.a===to?next.b:next.a,nextSeen));
 }
 private offRoad(p:Point){return this.context.roadGrid.at(p,3).every(r=>distance(p,projectToSegment(p,this.context.nodeById(r.a),this.context.nodeById(r.b)))>roadWidth(r)/2+2.2);}
 private shoulder(a:Agent){
  const start=this.context.nodeById(a.from),end=this.context.nodeById(a.to),length=distance(start,end)||1,dx=(end.x-start.x)/length,dz=(end.z-start.z)/length,side=this.context.district.drivingSide==='left'?-1:1,base=projectToSegment(a.car,start,end);
  for(const ahead of [16,24,10]){
   const offset=roadWidth(a.road)/2+3.2,p={x:base.x+dx*ahead-dz*offset*side,z:base.z+dz*ahead+dx*offset*side};
   const bounds=this.context.district.bounds;if(p.x<bounds.minX+3||p.x>bounds.maxX-3||p.z<bounds.minZ+3||p.z>bounds.maxZ-3||!this.offRoad(p))continue;
   const steps=Math.ceil(distance(a.car,p));let clear=true;
   for(let i=1;i<=steps;i++){
    const q={x:a.car.x+(p.x-a.car.x)*i/steps,z:a.car.z+(p.z-a.car.z)*i/steps};
    if(this.solid.at(q,1.3).some(b=>inRect(q,b,-1.3))||this.context.parkingZones.some(b=>inRect(q,b,-3))||this.agents.some(b=>b!==a&&distance(q,b.car)<5)){clear=false;break;}
   }
   if(clear)return p;
  }
 }
 private spawn(player:Point){
  const roads=this.context.roadGrid.at(player,220).filter(r=>distance(this.context.nodeById(r.a),this.context.nodeById(r.b))>25);
  for(let i=0;i<roads.length;i++){
   const road=roads[(i+this.sequence*31)%roads.length],a=this.context.nodeById(road.a),b=this.context.nodeById(road.b),from=!road.oneWay&&this.sequence%2?road.b:road.a,to=from===road.a?road.b:road.a;
   if(!this.drivable(road,from,to))continue;
   const p=this.lane(road,from,to,{x:(a.x+b.x)/2,z:(a.z+b.z)/2});
   if(distance(p,player)<75||distance(p,player)>220||this.agents.some(a=>distance(a.car,p)<30)||this.solid.at(p,1.05).some(b=>inRect(p,b,-1.05))||this.context.parkingZones.some(b=>inRect(p,b,-6)))continue;
   const start=this.context.nodeById(from),end=this.context.nodeById(to),car=new (createCar(this.context).Car)();car.reset({...p,heading:Math.atan2(end.x-start.x,-(end.z-start.z))});
   this.agents.push({car,road,from,to,model:this.model(),best:Infinity,stalled:0,recovery:'none',age:0,origin:{...p},turn:0,recoveries:0,visited:new Map(),distanceDriven:0,nextShoulder:0,steer:0});this.sequence++;return;
  }
 }
 update(dt:number,player:Point&{heading:number;speed:number}){
  this.elapsed+=dt;
  for(let i=this.agents.length-1;i>=0;i--)if(distance(this.agents[i].car,player)>320){const a=this.agents.splice(i,1)[0];a.model.removeFromParent();a.model.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}
  if(this.agents.length<3)this.spawn(player);
  for(const a of this.agents){
   const node=this.context.nodeById(a.to),aim=this.lane(a.road,a.from,a.to,node);
   const dx=a.car.x-player.x,dz=a.car.z-player.z,playerForward=dx*Math.sin(player.heading)-dz*Math.cos(player.heading),playerSide=Math.abs(dx*Math.cos(player.heading)+dz*Math.sin(player.heading)),headingDifference=Math.abs(angle(a.car.heading-player.heading));
   if(a.yieldPoint&&distance(a.car,player)>55){a.yieldPoint=undefined;a.best=Infinity;a.stalled=0;}
   if(!a.yieldPoint&&a.recovery==='none'&&this.elapsed>=a.nextShoulder&&playerForward>0&&playerForward<60&&playerSide<2.4&&headingDifference>2&&Math.abs(player.speed)>.5){a.yieldPoint=this.shoulder(a);a.nextShoulder=this.elapsed+2;}
   if(!a.yieldPoint&&a.recovery==='none'&&distance(a.car,aim)<5){
    const choices=(this.context.adjacency.get(a.to)??[]).filter(r=>r!==a.road&&(!r.oneWay||r.a===a.to)&&this.drivable(r,a.to,r.a===a.to?r.b:r.a));
    // Prefer a continuing street over tight turns and recently revisited loops.
    const score=(r:Road)=>{const end=this.context.nodeById(r.a===a.to?r.b:r.a);return Math.abs(angle(Math.atan2(end.x-node.x,-(end.z-node.z))-a.car.heading))+(a.visited.get(r)??0)*.4;};
    choices.sort((r,s)=>score(r)-score(s));
    const next=choices[0]??(!a.road.oneWay?a.road:undefined);
    if(next){a.visited.set(a.road,(a.visited.get(a.road)??0)+1);a.from=a.to;a.to=next.a===a.from?next.b:next.a;a.road=next;a.best=Infinity;a.stalled=0;}
   }
   const goal=a.yieldPoint??this.lane(a.road,a.from,a.to,this.context.nodeById(a.to)),wanted=Math.atan2(goal.x-a.car.x,-(goal.z-a.car.z)),error=Math.atan2(Math.sin(wanted-a.car.heading),Math.cos(wanted-a.car.heading));
   const ahead=(p:Point)=>{const dx=p.x-a.car.x,dz=p.z-a.car.z;return {forward:dx*Math.sin(a.car.heading)-dz*Math.cos(a.car.heading),side:Math.abs(dx*Math.cos(a.car.heading)+dz*Math.sin(a.car.heading))};};
   // Yield before a moving taxi reaches the junction, including cross traffic.
   const pulledOver=Boolean(a.yieldPoint&&distance(a.car,a.yieldPoint)<2&&this.offRoad(a.car));
   const approaching=ahead(player),yielding=pulledOver||!a.yieldPoint&&distance(a.car,player)<25&&approaching.forward>0&&approaching.side<12&&headingDifference>.7&&Math.abs(player.speed)>.5;
   const blocked=this.agents.some(b=>{const p=ahead(b.car);return b!==a&&p.forward>0&&p.forward<9&&p.side<2;});
   const remaining=distance(a.car,goal);if(remaining<a.best-.5){a.best=remaining;a.stalled=0;}else if(!yielding)a.stalled+=dt;
   if(!yielding&&a.recovery==='none'&&(a.stalled>4||Math.abs(error)>2&&Math.abs(a.car.speed)<.2)){
    a.recovery='brake';a.age=0;a.recoveries++;
    if(a.recoveries%3===0&&!a.road.oneWay&&this.clearLane(a.road,a.to,a.from)){const from=a.from;a.from=a.to;a.to=from;a.best=Infinity;}
   }
   const continuations=(this.context.adjacency.get(a.to)??[]).filter(r=>r!==a.road&&(!r.oneWay||r.a===a.to));
   const bend=Math.min(Math.PI,...continuations.map(r=>{const p=this.context.nodeById(r.a===a.to?r.b:r.a);return Math.abs(angle(Math.atan2(p.x-node.x,-(p.z-node.z))-Math.atan2(node.x-this.context.nodeById(a.from).x,-(node.z-this.context.nodeById(a.from).z))));}));
   let speed=/^(trunk|primary|secondary)$/.test(a.road.roadClass??'')?8:6;
   if(bend>.4)speed=Math.min(speed,Math.sqrt(9+5*Math.max(0,remaining-5)));
   if(Math.abs(error)>.6)speed=Math.min(speed,3);
   if(a.yieldPoint)speed=Math.min(4,Math.sqrt(Math.max(1,remaining)*3));
   const steer=Math.max(-1,Math.min(1,2*Math.sin(error)/Math.max(4,Math.min(12,distance(a.car,goal)))*2.8/.6*(1+Math.abs(a.car.speed)*.07)));
   let action={...idleActions(),steer,throttle:yielding||blocked?0:Math.max(0,Math.min(1,(speed-a.car.speed)*.5+speed*(a.yieldPoint?2.4:.45)/9)),brake:yielding||blocked?1:Math.max(0,(a.car.speed-speed)*.3)};
   const reserve=carFootprint(player,3.3,8),range=distance(a.car,player),insideReserve=inRect(a.car,reserve,-1.05);
   const others:Rect[]=[...this.agents.filter(b=>b!==a).map(b=>carFootprint(b.car)),...this.context.parkingZones.map(b=>({...b,width:b.width+3,depth:b.depth+3}))];
   // A taxi can approach an already stopped car. Its enlarged safety reservation
   // must still let that car drive OUT; otherwise both drivers are boxed in.
   // The physical body check below continues to forbid contact with the taxi.
   const collisions={at:(p:Point,r=0)=>[...this.solid.at(p,r),...others.filter(b=>inRect(p,b,-r)),...(!insideReserve||distance(p,player)<range-1e-6?[reserve]:[])]};
   if(a.recovery!=='none'&&!yielding){
    a.age+=dt;action={...idleActions(),brake:1};
    if(a.recovery==='brake'&&a.car.speed===0&&a.age>.3){
     // Test ordinary reversing manoeuvres against the same collision source.
     // No parking-in-place fallback, pose reset or visible despawn is used.
     let best=-Infinity;
     for(const turn of [-1,0,1]){
      this.probe.reset({x:a.car.x,z:a.car.z,heading:a.car.heading});this.probe.shiftGear();
      for(let i=0;i<45;i++)this.probe.update(1/30,{...idleActions(),throttle:.65,steer:turn},collisions);
      const score=distance(a.car,this.probe)*2-Math.abs(angle(wanted-this.probe.heading))*2;
      if(score>best){best=score;a.turn=turn;}
     }
     if(a.car.gear==='D')a.car.shiftGear();a.origin={x:a.car.x,z:a.car.z};a.recovery='reverse';a.age=0;
    }else if(a.recovery==='reverse'){
     action={...idleActions(),steer:a.turn,throttle:Math.abs(a.car.speed)<2?.65:0};
     if(distance(a.car,a.origin)>4||a.age>3){a.recovery='settle';a.age=0;action={...idleActions(),brake:1};}
    }else if(a.recovery==='settle'&&a.car.speed===0&&a.age>.3){
     if(a.car.gear==='R')a.car.shiftGear();a.recovery='none';a.best=Infinity;a.stalled=0;
    }
   }
   const before={x:a.car.x,z:a.car.z,heading:a.car.heading};
   a.steer+=Math.max(-1.8*dt,Math.min(1.8*dt,action.steer-a.steer));action.steer=a.steer;
   a.car.update(dt,action,collisions);
   const body=carFootprint(a.car);
   if(inRect(player,body,-1.1)){
    const previous=carFootprint(before),gap=(r:Rect)=>Math.min(...r.points!.map((p,i)=>distance(player,projectToSegment(player,p,r.points![(i+1)%r.points!.length]))));
    if(!inRect(player,previous,-1.1)||gap(body)<=gap(previous)+1e-7)Object.assign(a.car,{...before,speed:0});
   }
   a.distanceDriven+=distance(before,a.car);
  }
 }
 render(frame:LocalFrame){for(const a of this.agents){const p=frame.toLocal(a.car);a.model.position.set(p.x,0,p.z);a.model.rotation.y=-a.car.heading;}}
 clear(){for(const a of this.agents){a.model.removeFromParent();a.model.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}this.agents.length=0;}
 dispose(){for(const a of this.agents){a.model.removeFromParent();a.model.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}this.agents.length=0;for(const m of this.materials)m.dispose();this.materials.length=0;this.paints.clear();}
}
