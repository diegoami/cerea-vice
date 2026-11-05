import {RouteGraph} from '../navigation/RouteGraph';
import {createCar, type Car} from '../driving/Car';
import type {Actions} from '../input/Input';
import type {Mission} from '../mission/Mission';
import type {Parking} from '../navigation/Parking';
import {District, inRect, type Point, type Rect} from '../world/district';
import type {SpatialGrid} from '../world/SpatialGrid';

export const idleActions=():Actions=>({steer:0,throttle:0,brake:0,handbrake:false,glance:0,interact:false,pause:false,reminder:false,atlas:false,back:false,declineOffer:false,requestFares:false,radioNext:false,refreshFares:false,atlasPage:0,atlasMoveX:0,atlasMoveY:0,clearMarker:false,information:false,shiftGear:false,lookX:0,lookY:0,mouseX:0,mouseY:0,resetLook:false,atlasZoom:0,atlasZoomStep:0,atlasPanX:0,atlasPanY:0});
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const angle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));

/** Disposable driver. Only normal pedals, settled gear changes and Mission interactions
 * affect the world. Planning uses directed streets; nothing is drawn on the player's atlas. */
export class DemoDriver {
  activity='Requesting taxi work';
  actionsCompleted=0;
  recoveries=0;
  distanceDriven=0;
  private route:(Point&{radius?:number})[]=[];
  private targetKey='';
  private best=Infinity;
  private stalled=0;
  private recovery=0;
  private recoveryTurn=1;
  private visited=new Map<string,number>();
  private elapsed=0;
  private blocked=new Map<string,number>();
  private previous?:Point;
  private think=0;
  private control=idleActions();
  private readonly probe:Car;
  constructor(private context:District){this.probe=new (createCar(context).Car)();}

  private plan(car:Car,nodeId:string,bay?:Rect){
    const {context}=this;
    const nearest=context.nearestRoad(car);
    if(!nearest){this.route=[];return;}
    for(const [key,expiry] of this.blocked)if(expiry<this.elapsed)this.blocked.delete(key);
    const graph=this.blocked.size?new RouteGraph(context.nodes,context.roads.filter(r=>!this.blocked.has(`${r.a}/${r.b}`))):context.graph;
    const road=nearest.edge;
    const entries=(road.oneWay?[road.b]:[road.a,road.b]).map(id=>({id,...graph.search(id,nodeId)}));
    entries.sort((a,b)=>(a.cost+distance(car,context.nodeById(a.id)))-(b.cost+distance(car,context.nodeById(b.id))));
    this.route=entries[0].path.map(context.nodeById);
    if(bay&&this.route.length)this.route.push({x:bay.x,z:bay.z});
    if(!this.route.length){
      // If an approach is unreachable, retreat to a reachable junction before
      // trying again. Never cancel a booked passenger or move the car by fiat.
      const alternatives=context.nodes.filter(n=>distance(car,n)>20).sort((a,b)=>distance(car,a)-distance(car,b));
      for(const node of alternatives){
        const path=graph.search(road.b,node.id).path;
        if(path.length>1){this.route=path.map(context.nodeById);break;}
      }
    }
    this.best=Infinity;this.stalled=0;
  }

  /** Bounded local detour around an unexpected obstruction, then resume the street route. */
  private detour(car:Car,aim:Point,colliders:Rect[]|SpatialGrid<Rect>){
    const clear=(p:Point)=>{
      const b=this.context.district.bounds;
      return p.x>b.minX+1.3&&p.x<b.maxX-1.3&&p.z>b.minZ+1.3&&p.z<b.maxZ-1.3&&
        !(Array.isArray(colliders)?colliders:colliders.at(p,1.3)).some(r=>inRect(p,r,-1.3));
    };
    const line=(a:Point,b:Point)=>{const n=Math.ceil(distance(a,b)/.7);for(let i=1;i<=n;i++)if(!clear({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n}))return false;return true;};
    const length=distance(car,aim),scale=Math.min(1,28/length);
    const gx=Math.round((aim.x-car.x)*scale/2),gz=Math.round((aim.z-car.z)*scale/2);
    const point=(x:number,z:number)=>({x:car.x+x*2,z:car.z+z*2});
    const key=(x:number,z:number)=>`${x},${z}`;
    const open=[{x:0,z:0,cost:0,score:0}],costs=new Map([[key(0,0),0]]),previous=new Map<string,{x:number;z:number}>();
    let end:{x:number;z:number}|undefined;
    for(let count=0;open.length&&count<1400;count++){
      open.sort((a,b)=>b.score-a.score);const at=open.pop()!;
      if(at.cost!==costs.get(key(at.x,at.z)))continue;
      if(at.x===gx&&at.z===gz){end=at;break;}
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const x=at.x+dx,z=at.z+dz;if(Math.abs(x)>18||Math.abs(z)>18)continue;
        const cost=at.cost+Math.hypot(dx,dz),id=key(x,z);
        if(cost>=(costs.get(id)??Infinity)||!line(point(at.x,at.z),point(x,z)))continue;
        costs.set(id,cost);previous.set(id,at);open.push({x,z,cost,score:cost+Math.hypot(x-gx,z-gz)});
      }
    }
    if(!end)return [];
    const path:Point[]=[];for(let at=end;at.x!==0||at.z!==0;at=previous.get(key(at.x,at.z))!)path.unshift(point(at.x,at.z));
    // Remove grid zigzags, retaining only clear segments and generous aiming points.
    const result:(Point&{radius:number})[]=[];let at:Point=car;
    while(path.length){let index=path.length-1;while(index>0&&!line(at,path[index]))index--;at=path[index];result.push({...at,radius:1.4});path.splice(0,index+1);}
    return result;
  }

  update(dt:number,car:Car,parking:Parking,mission:Mission,colliders:Rect[]|SpatialGrid<Rect>):Actions{
    this.elapsed+=dt;
    if(this.previous)this.distanceDriven+=distance(car,this.previous);
    this.previous={x:car.x,z:car.z};
    const stop=()=>({...idleActions(),brake:1});
    // Boarding is progress, even though the taxi deliberately stays still.
    if(mission.boarding>0){this.activity='Waiting for the passenger to sit down';this.stalled=0;return stop();}
    if(mission.taxiMode&&!mission.finished&&!mission.hasRide){
      this.activity='Stopping to request and compare fares';
      if(!parking.stopped||car.speed!==0)return stop();
      if(mission.requestFares(car)){
        // Prefer short, reachable collection journeys; the dispatch list remains real.
        const offers=[...mission.fareBoard].sort((a,b)=>a.approachDistance-b.approachDistance);
        if(offers[0]&&mission.acceptFare(offers[0].id)){this.actionsCompleted+=2;this.targetKey='';}
      }
      return stop();
    }
    const target=!mission.finished?mission.target:undefined;
    if(target&&inRect(car,target.bay,1.5)){
      this.activity=`Stopping at ${target.name}`;
      this.stalled=0;
      if(car.speed===0&&parking.stopped&&mission.taxiMode&&mission.serveAtStop(car,true)){
        this.actionsCompleted++;this.targetKey='';
      }
      return stop();
    }
    let nodeId=target?.nodeId;
    // Harbor's legacy hotel is a bay rather than a road-graph node.
    if(nodeId&&!this.context.nodeMap.has(nodeId)){
      const edge=this.context.nearestRoad(target!.bay)?.edge;
      if(edge)nodeId=[edge.a,edge.b].sort((a,b)=>distance(target!.bay,this.context.nodeById(a))-distance(target!.bay,this.context.nodeById(b)))[0];
    }
    if(!nodeId){
      // Continue exploring after the working day, retaining all earnings and receipts.
      if(!this.route.length){
        const here=this.context.nearestRoad(car)?.edge.b??this.context.nodes[0].id;
        const candidates=this.context.nodes.filter(n=>distance(car,n)>25);
        candidates.sort((a,b)=>(this.visited.get(a.id)??-1)-(this.visited.get(b.id)??-1)||distance(car,a)-distance(car,b));
        const next=candidates.find(n=>Number.isFinite(this.context.graph.search(here,n.id).cost));if(next){this.visited.set(next.id,this.elapsed);nodeId=next.id;this.targetKey='';}
      }
      this.activity='Exploring streets and landmarks after the journey';
    }else this.activity=`${mission.taxiStage==='dropoff'?'Delivering to':'Driving to'} ${target!.name}`;
    if(nodeId&&this.targetKey!==nodeId){this.targetKey=nodeId;this.plan(car,nodeId,target?.bay);}
    while(this.route.length&&distance(car,this.route[0])<(this.route[0].radius??(this.route.length===1?1.5:3.5))){
      this.route.shift();this.best=Infinity;this.stalled=0;
      if(!this.route.length)this.actionsCompleted++;
    }
    if(!this.route.length&&target){
      this.activity='Finding another approach to the destination';
      this.stalled+=dt;
      if(this.stalled>3){this.targetKey='';this.stalled=0;}
    }
    const aim=this.route[0];if(!aim)return stop();
    const remaining=distance(car,aim);
    // Distance to the next waypoint, rather than wheel motion, catches loops and oscillation.
    if(remaining<this.best-.6){this.best=remaining;this.stalled=0;}else this.stalled+=dt;
    if(this.stalled>7&&this.recovery<=0){
      const road=this.context.nearestRoad(car)?.edge;
      if(road)this.blocked.set(`${road.a}/${road.b}`,this.elapsed+90);
      this.recoveries++;this.recovery=3.5;this.recoveryTurn=this.recoveries%2?1:-1;
      this.stalled=0;this.best=Infinity;
    }
    if(this.recovery>0){
      this.activity='Reversing clear of an obstruction and replanning';
      this.recovery-=dt;
      if(car.gear!=='R'){if(car.speed===0&&parking.stopped)car.shiftGear();return stop();}
      if(this.recovery<=0){
        const detour=this.detour(car,aim,colliders);
        if(detour.length)this.route.unshift(...detour);
        else {this.route=[];this.targetKey='';}
        this.best=Infinity;this.think=0;return stop();
      }
      return {...idleActions(),throttle:Math.abs(car.speed)<2?.55:0,steer:this.recoveryTurn};
    }
    if(car.gear!=='D'){if(car.speed===0&&parking.stopped)car.shiftGear();return stop();}
    this.think-=dt;
    if(this.think<=0){
      this.think=.12;
      // Receding-horizon steering: simulate the same car against the actual collision
      // index. This also handles sharp junctions and the approach into service bays.
      let bestScore=Infinity;let chosen=stop();
      const wanted=Math.atan2(aim.x-car.x,-(aim.z-car.z));
      const error=angle(wanted-car.heading);
      const speed=Math.min(7,Math.max(1.8,remaining*.7),Math.abs(error)>.6?2.5:7);
      for(const steer of [-1,-.65,-.3,0,.3,.65,1]){
        const action={...idleActions(),steer,throttle:car.speed<speed?.65:0,brake:car.speed>speed+.3?.6:0};
        this.probe.reset();
        Object.assign(this.probe,{x:car.x,z:car.z,heading:car.heading,speed:car.speed,gear:car.gear,steering:car.steering,collisions:0,unlimited:false});
        for(let i=0;i<36;i++)this.probe.update(1/30,action,colliders);
        const heading=Math.atan2(aim.x-this.probe.x,-(aim.z-this.probe.z));
        const score=distance(this.probe,aim)+Math.abs(angle(heading-this.probe.heading))*3+this.probe.collisions*40;
        if(score<bestScore){bestScore=score;chosen=action;}
      }
      this.control=chosen;
    }
    return this.control;
  }
}
