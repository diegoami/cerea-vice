import {RouteGraph} from '../navigation/RouteGraph';
import {laneRoute} from '../driving/LaneRoute';
import {planOvertake} from '../driving/Overtake';
import {vehicleClearance} from '../driving/VehicleClearance';
import {createCar, type Car, type CollisionSource} from '../driving/Car';
import type {Actions} from '../input/Input';
import type {Mission} from '../mission/Mission';
import type {Parking} from '../navigation/Parking';
import {District, inRect, projectToSegment, type Point, type Rect} from '../world/district';

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
  private route:(Point&{radius?:number;passing?:boolean})[]=[];
  overtakesStarted=0;
  overtakesCompleted=0;
  private overtakeCooldown=0;
  private targetKey='';
  private best=Infinity;
  private stalled=0;
  private recoveryPhase:'none'|'brake'|'reverse'|'settle'='none';
  private recoveryAge=0;
  private reverseOrigin:Point={x:0,z:0};
  private segmentStart?:Point;
  localFaresChosen=0;
  interTownFaresChosen=0;
  private recoveryTurn=1;
  private visited=new Map<string,number>();
  private elapsed=0;
  private blocked=new Map<string,number>();
  private previous?:Point;
  private steering=0;
  private turnCooldown=0;
  private detourCooldown=0;
  private sawFinished=false;
  private readonly probe:Car;
  constructor(private context:District){this.probe=new (createCar(context).Car)();}

  relocated(){this.blocked.clear();this.route=[];this.targetKey='';this.segmentStart=undefined;this.previous=undefined;this.best=Infinity;this.stalled=0;this.recoveryPhase='none';this.steering=0;this.turnCooldown=0;this.detourCooldown=0;this.overtakeCooldown=0;}

  private advanceWaypoint(){
    const passing=this.route[0]?.passing;this.segmentStart=this.route.shift();this.best=Infinity;this.stalled=0;
    if(passing&&!this.route[0]?.passing){this.overtakesCompleted++;this.actionsCompleted++;this.overtakeCooldown=5;}
  }

  private avoidImpact(car:Car,action:Actions,colliders:CollisionSource){
    this.probe.reset();Object.assign(this.probe,{x:car.x,z:car.z,heading:car.heading,speed:car.speed,gear:car.gear,steering:car.steering,unlimited:car.unlimited});
    const initial=vehicleClearance(car,colliders,this.context.district.bounds);let bodyBlocked=false;
    for(let i=0;i<12;i++){
      this.probe.update(1/20,action,colliders);
      // Permit backing out if already too close, but never increase penetration.
      if(vehicleClearance(this.probe,colliders,this.context.district.bounds)<Math.min(0,initial)-.005){bodyBlocked=true;break;}
    }
    // Low-speed contact also stops the probe, even below the impact-count threshold.
    if(bodyBlocked||this.probe.collisions>0||this.probe.speed===0&&action.throttle>.2){action.throttle=0;action.brake=1;}
    return action;
  }

  private plan(car:Car,nodeId:string,bay?:Rect){
    const {context}=this;
    const nearest=context.nearestRoad(car);
    if(!nearest){this.route=[];return;}
    for(const [key,expiry] of this.blocked)if(expiry<this.elapsed)this.blocked.delete(key);
    const graph=this.blocked.size?new RouteGraph(context.nodes,context.roads.filter(r=>!this.blocked.has(`${r.a}/${r.b}`))):context.graph;
    const road=nearest.edge;
    const entries=(road.oneWay?[road.b]:[road.a,road.b]).map(id=>({id,...graph.search(id,nodeId)}));
    entries.sort((a,b)=>(a.cost+distance(car,context.nodeById(a.id)))-(b.cost+distance(car,context.nodeById(b.id))));
    const path=[...entries[0].path];
    // Include the occupied segment even when its far endpoint is the best graph
    // entry. Otherwise a one-node path would aim back at the road centre.
    let approach=false;
    if(path[0]===road.b&&path[1]!==road.a){path.unshift(road.a);approach=true;}
    else if(path[0]===road.a&&!road.oneWay&&path[1]!==road.b){path.unshift(road.b);approach=true;}
    this.route=laneRoute(context,path);
    // The added point defines the occupied lane's orientation; it is not a new
    // destination behind the car. In particular, do not drive back to a one-way
    // segment's start when already near its far end or a little off its verge.
    const approachStart=approach?this.route.shift():undefined;
    if(bay&&this.route.length)this.route.push({x:bay.x,z:bay.z});
    if(!this.route.length){
      // If an approach is unreachable, retreat to a reachable junction before
      // trying again. Never cancel a booked passenger or move the car by fiat.
      const alternatives=context.nodes.filter(n=>distance(car,n)>20).sort((a,b)=>distance(car,a)-distance(car,b));
      for(const node of alternatives){
        const path=graph.search(road.b,node.id).path;
        if(path.length>1){this.route=laneRoute(context,path);break;}
      }
    }
    this.segmentStart=approachStart&&this.route[0]?projectToSegment(car,approachStart,this.route[0]):{x:car.x,z:car.z};
    // A car already part-way down a road need not drive back to the entry node.
    if(this.route.length>1){const first=this.route[0],next=this.route[1],projection=projectToSegment(car,first,next);
      if(distance(car,projection)<4&&distance(projection,first)>1&&distance(projection,next)>1){this.segmentStart=projection;this.route.shift();}}
    this.best=Infinity;this.stalled=0;
  }

  /** Bounded local detour around an unexpected obstruction, then resume the street route. */
  private detour(car:Car,aim:Point,colliders:CollisionSource){
    const clear=(p:Point)=>{
      const b=this.context.district.bounds;
      return p.x>b.minX+1.3&&p.x<b.maxX-1.3&&p.z>b.minZ+1.3&&p.z<b.maxZ-1.3&&
        !(Array.isArray(colliders)?colliders:colliders.at(p,1.3)).some(r=>inRect(p,r,-1.3));
    };
    const line=(a:Point,b:Point)=>{const n=Math.ceil(distance(a,b)/.7);for(let i=1;i<=n;i++)if(!clear({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n}))return false;return true;};
    const length=distance(car,aim);
    let reach=Math.min(28,length),goal={x:car.x+(aim.x-car.x)*reach/(length||1),z:car.z+(aim.z-car.z)*reach/(length||1)};
    // A short ray can end inside the very building we must go around. If the
    // real nearby waypoint is clear, search far enough to reconnect to it.
    if(!clear(goal)&&length<=72&&clear(aim)){reach=length;goal=aim;}
    const scale=reach/(length||1),range=Math.max(18,Math.ceil((reach+12)/2));
    const gx=Math.round((aim.x-car.x)*scale/2),gz=Math.round((aim.z-car.z)*scale/2);
    const point=(x:number,z:number)=>({x:car.x+x*2,z:car.z+z*2});
    const key=(x:number,z:number)=>`${x},${z}`;
    const open=[{x:0,z:0,cost:0,score:0}],costs=new Map([[key(0,0),0]]),previous=new Map<string,{x:number;z:number}>();
    let end:{x:number;z:number}|undefined;
    for(let count=0;open.length&&count<(reach>28?6000:1400);count++){
      open.sort((a,b)=>b.score-a.score);const at=open.pop()!;
      if(at.cost!==costs.get(key(at.x,at.z)))continue;
      if(at.x===gx&&at.z===gz){end=at;break;}
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const x=at.x+dx,z=at.z+dz;if(Math.abs(x)>range||Math.abs(z)>range)continue;
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

  update(dt:number,car:Car,parking:Parking,mission:Mission,colliders:CollisionSource):Actions{
    if(mission.finished&&!this.sawFinished){this.relocated();this.blocked.clear();}
    this.sawFinished=mission.finished;
    this.elapsed+=dt;this.turnCooldown=Math.max(0,this.turnCooldown-dt);this.detourCooldown=Math.max(0,this.detourCooldown-dt);this.overtakeCooldown=Math.max(0,this.overtakeCooldown-dt);
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
        const desiredInterTown=mission.completedFares%2===1;
        const matching=mission.fareBoard.filter(f=>mission.isInterTown(f)===desiredInterTown);
        const offers=(matching.length?matching:[...mission.fareBoard]).sort((a,b)=>(a.approachDistance+(desiredInterTown?mission.offerRouteDistance(a):0))-(b.approachDistance+(desiredInterTown?mission.offerRouteDistance(b):0)));
        if(offers[0]&&mission.acceptFare(offers[0].id)){this.actionsCompleted+=2;this.targetKey='';if(mission.isInterTown(offers[0]))this.interTownFaresChosen++;else this.localFaresChosen++;}
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
      this.advanceWaypoint();
      if(!this.route.length)this.actionsCompleted++;
    }
    if(!this.route.length&&target){
      this.activity='Finding another approach to the destination';
      this.stalled+=dt;
      if(this.stalled>3){this.targetKey='';this.stalled=0;}
    }
    if(this.route[0]&&!this.route[0].radius&&this.recoveryPhase==='none'&&this.overtakeCooldown===0){
      this.overtakeCooldown=2;const pass=planOvertake(this.context,car,this.route,colliders);
      if(pass){
        while(this.route.length>1&&(this.route[0].x-car.x)*pass.forward.x+(this.route[0].z-car.z)*pass.forward.z<pass.length)this.route.shift();
        this.route.unshift(...pass.points.map(p=>({...p,radius:2,passing:true})));this.overtakesStarted++;this.segmentStart={x:car.x,z:car.z};this.best=Infinity;this.stalled=0;
      }
    }
    if(this.route[0]?.passing)this.activity='Overtaking slower traffic and returning to the driving lane';
    const aim=this.route[0];if(!aim)return stop();
    const remaining=distance(car,aim);
    // Distance to the next waypoint, rather than wheel motion, catches loops and oscillation.
    if(remaining<this.best-.6){this.best=remaining;this.stalled=0;}else this.stalled+=dt;
    if(this.stalled>2.5&&this.recoveryPhase==='none'&&this.detourCooldown===0){
      this.detourCooldown=8;
      const bypass=this.detour(car,aim,colliders);
      if(bypass.length){this.route.unshift(...bypass);this.segmentStart={x:car.x,z:car.z};this.best=Infinity;this.stalled=0;this.activity='Passing an obstruction using a clear road edge or verge';return stop();}
    }
    const behind=Math.abs(angle(Math.atan2(aim.x-car.x,-(aim.z-car.z))-car.heading))>2;
    if((this.stalled>7||(behind&&Math.abs(car.speed)<.6&&remaining<60&&this.turnCooldown===0))&&this.recoveryPhase==='none'){
      const road=this.context.nearestRoad(car)?.edge;
      if(road)this.blocked.set(`${road.a}/${road.b}`,this.elapsed+90);
      this.recoveries++;this.recoveryPhase='brake';this.recoveryAge=0;
      const wanted=Math.atan2(aim.x-car.x,-(aim.z-car.z));
      this.recoveryTurn=-Math.sign(angle(wanted-car.heading))||(this.recoveries%2?1:-1);
      this.stalled=0;this.best=Infinity;
    }
    if(this.recoveryPhase!=='none'){
      this.activity='Reversing clear of an obstruction and replanning';
      if(this.recoveryPhase==='brake'){
        if(car.speed===0&&parking.stopped){if(car.gear==='D')car.shiftGear();this.recoveryPhase='reverse';this.reverseOrigin={x:car.x,z:car.z};this.recoveryAge=0;}
        return stop();
      }
      if(this.recoveryPhase==='reverse'){
        this.recoveryAge+=dt;
        if(distance(car,this.reverseOrigin)>=5||this.recoveryAge>4){this.recoveryPhase='settle';return stop();}
        for(const steer of [this.recoveryTurn,0,-this.recoveryTurn]){
          const action=this.avoidImpact(car,{...idleActions(),throttle:Math.abs(car.speed)<2.5?.75:0,steer},colliders);
          if(!action.brake)return action;
        }
        return stop();
      }
      if(car.speed!==0||!parking.stopped)return stop();
      if(car.gear==='R')car.shiftGear();
      const detour=this.detour(car,aim,colliders);
      if(detour.length)this.route.unshift(...detour);else {this.route=[];this.targetKey='';}
      this.segmentStart={x:car.x,z:car.z};this.recoveryPhase='none';this.stalled=0;this.best=Infinity;this.steering=0;this.turnCooldown=10;
      return stop();
    }
    if(car.gear!=='D'){if(car.speed===0&&parking.stopped)car.shiftGear();return stop();}
    const start=this.segmentStart??car,projected=projectToSegment(car,start,aim);
    const beyond=(car.x-aim.x)*(aim.x-start.x)+(car.z-aim.z)*(aim.z-start.z)>0;
    if(this.route.length>1&&(distance(car,aim)<2.5||beyond&&distance(car,projected)<5)){
      this.advanceWaypoint();return {...idleActions(),steer:this.steering};
    }
    // Continuous pure pursuit follows the road polyline, looking ahead along it rather
    // than chasing isolated junctions with a seven-position steering switch.
    const lookahead=Math.max(5,Math.min(16,4+Math.abs(car.speed)*.65));
    const roadClass=this.context.nearestRoad(car)?.edge.roadClass??'';
    let seek=lookahead,from=projected,look=aim,total=distance(car,projected),limit=/^(primary|secondary)/.test(roadClass)?17:/^(pedestrian|service|footway|steps)/.test(roadClass)?8:13;
    for(let i=0;i<this.route.length;i++){
      const to=this.route[i],length=distance(from,to);
      if(seek>0){if(length>=seek){look={x:from.x+(to.x-from.x)*seek/(length||1),z:from.z+(to.z-from.z)*seek/(length||1)};seek=0;}else{seek-=length;look=to;}}
      total+=length;
      const next=this.route[i+1];
      if(next){const turn=Math.abs(angle(Math.atan2(next.x-to.x,-(next.z-to.z))-Math.atan2(to.x-from.x,-(to.z-from.z))));
        if(length>.1&&turn>.22){const corner=Math.max(3.5,10*(1-turn/Math.PI));limit=Math.min(limit,Math.sqrt(corner*corner+2*3.5*Math.max(0,total-lookahead*.65)));}}
      else limit=Math.min(limit,Math.sqrt(2*3*Math.max(0,total-1)));
      if(total>120&&seek<=0)break;
      from=to;
    }
    const error=angle(Math.atan2(look.x-car.x,-(look.z-car.z))-car.heading);
    const curvature=2*Math.sin(error)/Math.max(3,distance(car,look));
    const wantedSteer=Math.max(-1,Math.min(1,curvature*2.8/.6*(1+Math.abs(car.speed)*.07)));
    this.steering+=Math.max(-dt*2.5,Math.min(dt*2.5,wantedSteer-this.steering));
    if(Math.abs(error)>1)limit=Math.min(limit,3.5);
    // Follow slower traffic in our lane instead of repeatedly arriving at its bumper.
    if(!this.route[0]?.passing&&this.route[0]?.radius!==1.4&&!Array.isArray(colliders))for(const other of colliders.moving?.()??[]){
      const dx=other.x-car.x,dz=other.z-car.z,forward=dx*Math.sin(car.heading)-dz*Math.cos(car.heading),side=Math.abs(dx*Math.cos(car.heading)+dz*Math.sin(car.heading));
      if(forward>0&&forward<35&&side<2.2&&Math.abs(angle(other.heading-car.heading))<.7)limit=Math.min(limit,Math.max(0,other.speed+(forward-11)*.55));
    }
    const throttle=Math.max(0,Math.min(1,(limit-car.speed)*.6+limit*.45/9));
    const action={...idleActions(),steer:this.steering,throttle:car.speed>limit+.5?0:throttle,brake:Math.max(0,Math.min(1,(car.speed-limit)*.3))};
    // Short collision prediction brakes for unexpected obstacles; the recovery planner
    // finds a clear path instead of making last-second steering oscillations.
    return this.avoidImpact(car,action,colliders);
  }
}
