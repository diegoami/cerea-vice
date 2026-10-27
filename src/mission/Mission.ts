import { inRect, type Point, type Road } from "../world/district";
import type {NavigationTarget,TaxiStop,TaxiFare} from '../world/schema';
import { createNavigation } from "../navigation/Navigation";
import { District } from "../world/district";
export type MissionState = "active" | "overdue" | "success" | "late" | "shift-complete";
export interface FareReceipt {passenger:string;pickup:string;destination:string;distanceMetres:number;seconds:number;baseCents:number;bonusCents:number;totalCents:number}
export interface MissionSnapshot {
 elapsed:number;totalElapsed:number;state:MissionState;taxiStage:'pickup'|'dropoff';fareIndex:number;
 earningsCents:number;bonusEarnedCents:number;receipts:FareReceipt[];directionRequests:{legal:number;unsafe:number};
 offerPending:boolean;offerQuoted:boolean;approachDistance:number;currentFare:TaxiFare|null;randomState:number;notice:string;
}
/** Long journeys retain worthwhile guaranteed pay even after the speed bonus expires. */
export function guaranteedFare(base:number,perKm:number,distance:number){
 return base+Math.round(distance/1000*perKm+Math.max(0,distance-1000)*2.5);
}
export function createMission(context:District){
const {district,hotelBay,parkingZones}=context;
const {shortestRoute,nearestRoad}=createNavigation(context);
class Mission {
  private readonly taxi=district.taxi;
  directionRequests = { legal: 0, unsafe: 0 };
  elapsed=0;
  totalElapsed=0;
  state:MissionState='active';
  taxiStage:'pickup'|'dropoff'='pickup';
  fareIndex=0;
  earningsCents=0;
  bonusEarnedCents=0;
  receipts:FareReceipt[]=[];
  revision=0;
  notice='';
  private rideDistance=0;
  private rideBudget=180;
  offerPending=false;
  private offerQuoted=false;
  private approachDistance=0;
  private currentFare:TaxiFare|null=null;
  private randomState=1;
  private readonly options:{seed?:number;authored?:boolean};

  constructor(options:{seed?:number;authored?:boolean}={}){this.options=options;this.reset();}
  get taxiMode(){return Boolean(this.taxi);}
  get shiftSeconds(){return this.taxi?(this.taxi.endHour-this.taxi.startHour)*3600/this.taxi.clockRate:district.mission.duration;}
  get duration(){return this.taxi?this.shiftSeconds:district.mission.duration;}
  get remaining(){return Math.max(0,this.duration-(this.taxi?this.totalElapsed:this.elapsed));}
  get finished(){return this.state==='success'||this.state==='late'||this.state==='shift-complete';}
  get directionRequestCount(){return this.directionRequests.legal+this.directionRequests.unsafe;}
  get completedFares(){return this.receipts.length;}
  get passenger(){return this.currentFare?.passenger??'';}
  private get fare(){return this.currentFare!;}
  get pickupStop(){return this.taxi?this.stop(this.fare.pickupId):undefined;}
  get destinationStop(){return this.taxi?this.stop(this.fare.destinationId):undefined;}
  get offerText(){
    if(!this.taxi)return '';
    const journey=`${this.passenger}: ${this.pickupStop!.name}, ${this.pickupStop!.road} → ${this.destinationStop!.name}, ${this.destinationStop!.road}.`;
    return this.offerQuoted?`${journey} Guaranteed €${(this.baseFareCents/100).toFixed(2)} + up to €${(this.taxi.maxBonusCents/100).toFixed(2)} speed bonus.`:`${journey} Stop to receive a fare quote.`;
  }
  private random(){this.randomState=(Math.imul(this.randomState,1664525)+1013904223)>>>0;return this.randomState/4294967296;}
  private dispatch(){
    if(!this.taxi)return;
    const previous=this.currentFare;
    if(this.options.authored)this.currentFare={...this.taxi.fares[this.fareIndex%this.taxi.fares.length]};
    else {
      const pairs:TaxiFare[]=[];
      for(const a of this.taxi.stops)for(const b of this.taxi.stops){
        if(a.id===b.id)continue;
        if(Number.isFinite(shortestRoute(a.nodeId,b.nodeId).cost))pairs.push({pickupId:a.id,destinationId:b.id,passenger:''});
      }
      const different=pairs.filter(p=>p.pickupId!==previous?.pickupId||p.destinationId!==previous?.destinationId);
      const choices=different.length?different:pairs;
      this.currentFare={...choices[Math.floor(this.random()*choices.length)],passenger:this.taxi.fares[Math.floor(this.random()*this.taxi.fares.length)].passenger};
    }
    this.rideDistance=shortestRoute(this.pickupStop!.nodeId,this.destinationStop!.nodeId).cost;
    this.rideBudget=Math.max(100,90+this.rideDistance/4.5);
    this.offerPending=!this.options.authored;
    this.offerQuoted=false;this.approachDistance=0;
  }
  quoteOffer(position:Point){
    if(!this.offerPending||this.offerQuoted)return;
    const stop=this.pickupStop!,bay=parkingZones.find(b=>b.id===stop.bayId)!;
    if(inRect(position,bay))this.approachDistance=0;
    else {
      const near=nearestRoad(position),road=near.edge as Road,starts=road.oneWay?[road.b]:[road.a,road.b];
      this.approachDistance=Math.min(...starts.map(id=>shortestRoute(id,stop.nodeId).cost+Math.hypot(near.point.x-context.nodeById(id).x,near.point.z-context.nodeById(id).z)+near.distance));
      if(!Number.isFinite(this.approachDistance))this.approachDistance=0;
    }
    this.offerQuoted=true;this.notice=this.dispatchNotice();this.revision++;
  }
  private receiptNotice(receipt:FareReceipt){return `${receipt.passenger}: “Thank you!” Fare €${(receipt.totalCents/100).toFixed(2)} (base €${(receipt.baseCents/100).toFixed(2)} + speed bonus €${(receipt.bonusCents/100).toFixed(2)}).`;}
  private dispatchNotice(){const receipt=this.receipts.at(-1);return `${receipt?this.receiptNotice(receipt)+' ':''}${this.clockText} · Taxi dispatch: ${this.objective}`;}
  acceptOffer(){if(!this.offerPending||this.finished)return false;this.offerPending=false;this.notice=`Fare accepted. ${this.objective}`;this.revision++;return true;}
  declineOffer(){if(!this.offerPending||this.finished)return false;this.fareIndex++;this.dispatch();this.notice=this.dispatchNotice();this.revision++;return true;}
  private stop(id:string):TaxiStop {return this.taxi!.stops.find(stop=>stop.id===id)!;}
  get target():NavigationTarget {
    if(!this.taxi)return {name:district.mission.name,nodeId:district.mission.nodeId,bay:hotelBay};
    const stop=this.stop(this.taxiStage==='pickup'?this.fare.pickupId:this.fare.destinationId);
    return {name:stop.name,road:stop.road,nodeId:stop.nodeId,bay:parkingZones.find(bay=>bay.id===stop.bayId)!};
  }
  get objective(){
    if(!this.taxi)return district.mission.objective;
    if(this.offerPending)return `Dispatch offer: ${this.offerText} Stop to accept or decline.`;
    return `${this.taxiStage==='pickup'?`Collect ${this.passenger} at`:`Take ${this.passenger} to`} ${this.target.name}, ${this.target.road}. Stop in ${this.target.bay.name} and confirm passenger service.`;
  }
  get clockHours(){return this.taxi?Math.min(this.taxi.endHour,this.taxi.startHour+this.totalElapsed*this.taxi.clockRate/3600):7;}
  private clockAt(hour:number){const minutes=Math.min(24*60-1,Math.floor(hour*60+1e-6));return `${Math.floor(minutes/60).toString().padStart(2,'0')}:${(minutes%60).toString().padStart(2,'0')}`;}
  get clockText(){return this.clockAt(this.clockHours);}
  get shiftLabel(){return this.taxi?`${this.clockAt(this.taxi.startHour)}–${this.clockAt(this.taxi.endHour)}`:'';}
  get baseFareCents(){return this.taxi?guaranteedFare(this.taxi.baseCents,this.taxi.perKmCents,this.rideDistance)+Math.round(Math.max(0,this.approachDistance-1000)*2.5):0;}
  get potentialBonusCents(){return this.taxi&&this.taxiStage==='dropoff'?Math.round(this.taxi.maxBonusCents*Math.max(0,1-this.elapsed/this.rideBudget)):0;}
  get unfinishedPassenger(){return Boolean(this.taxi&&this.taxiStage==='dropoff');}
  get routeDistance(){return this.rideDistance;}

  reset(){
    this.elapsed=0;this.totalElapsed=0;this.state='active';this.directionRequests={legal:0,unsafe:0};
    this.taxiStage='pickup';this.fareIndex=0;this.earningsCents=0;this.bonusEarnedCents=0;this.receipts=[];
    this.rideDistance=0;this.rideBudget=180;this.currentFare=null;
    this.randomState=(this.options.seed??Math.floor(Math.random()*4294967296))>>>0;
    this.dispatch();
    this.notice=this.taxi?this.dispatchNotice():district.mission.hint;
    this.revision++;
  }
  recordDirectionRequest(stopped:boolean,legallyParked:boolean):boolean {
    if(!stopped||this.finished)return false;
    this.directionRequests[legallyParked?'legal':'unsafe']++;return true;
  }
  canServe(position:Point,stopped:boolean){return this.taxiMode&&!this.offerPending&&!this.finished&&stopped&&inRect(position,this.target.bay,1.1);}
  serveAtStop(position:Point,stopped:boolean):boolean {
    if(!this.canServe(position,stopped))return false;
    if(this.taxiStage==='pickup') {
      const pickup=this.stop(this.fare.pickupId),destination=this.stop(this.fare.destinationId);
      const route=shortestRoute(pickup.nodeId,destination.nodeId);
      if(!Number.isFinite(route.cost))return false;
      this.rideDistance=route.cost;this.rideBudget=Math.max(100,90+route.cost/4.5);
      this.taxiStage='dropoff';this.elapsed=0;
      this.notice=`${this.passenger} boarded: “Please take me to ${destination.name}, ${destination.road}.” A guaranteed fare plus up to €${(this.taxi!.maxBonusCents/100).toFixed(2)} speed bonus is available. Stop there and confirm passenger service.`;
    } else {
      const fare=this.fare,pickup=this.stop(fare.pickupId),destination=this.stop(fare.destinationId);
      const baseCents=this.baseFareCents,bonusCents=this.potentialBonusCents;
      const totalCents=baseCents+bonusCents;
      this.receipts.push({passenger:fare.passenger,pickup:pickup.name,destination:destination.name,distanceMetres:this.rideDistance,seconds:this.elapsed,baseCents,bonusCents,totalCents});
      this.earningsCents+=totalCents;this.bonusEarnedCents+=bonusCents;
      this.fareIndex++;this.taxiStage='pickup';this.elapsed=0;this.dispatch();
      this.notice=this.dispatchNotice();
    }
    this.revision++;return true;
  }
  snapshot():MissionSnapshot {
    return structuredClone({elapsed:this.elapsed,totalElapsed:this.totalElapsed,state:this.state,taxiStage:this.taxiStage,fareIndex:this.fareIndex,
      earningsCents:this.earningsCents,bonusEarnedCents:this.bonusEarnedCents,receipts:this.receipts,directionRequests:this.directionRequests,
      offerPending:this.offerPending,offerQuoted:this.offerQuoted,approachDistance:this.approachDistance,currentFare:this.currentFare,randomState:this.randomState,notice:this.notice});
  }
  restore(value:MissionSnapshot){
    const nonnegative=(n:number)=>Number.isFinite(n)&&n>=0;
    const integer=(n:number)=>Number.isSafeInteger(n)&&n>=0;
    if(!value||!nonnegative(value.elapsed)||!nonnegative(value.totalElapsed)||value.totalElapsed>this.duration||value.elapsed>value.totalElapsed||
      !['active','overdue','success','late','shift-complete'].includes(value.state)||!['pickup','dropoff'].includes(value.taxiStage)||
      !integer(value.fareIndex)||!integer(value.earningsCents)||!integer(value.bonusEarnedCents)||!integer(value.randomState)||value.randomState>0xffffffff||
      !integer(value.directionRequests?.legal)||!integer(value.directionRequests?.unsafe)||typeof value.offerPending!=='boolean'||
      typeof value.offerQuoted!=='boolean'||!nonnegative(value.approachDistance)||value.approachDistance>1000000||
      typeof value.notice!=='string'||value.notice.length>5000||!Array.isArray(value.receipts)||value.receipts.length>10000)throw new Error('Invalid saved shift');
    let distance=0;
    if(this.taxi){
      const fare=value.currentFare;
      if(!fare||typeof fare.passenger!=='string'||!fare.passenger.trim()||fare.passenger.length>100||fare.pickupId===fare.destinationId||
        !this.taxi.stops.some(s=>s.id===fare.pickupId)||!this.taxi.stops.some(s=>s.id===fare.destinationId)||
        (value.offerPending&&value.taxiStage!=='pickup')||!['active','shift-complete'].includes(value.state)||
        (value.state==='shift-complete')!==(value.totalElapsed===this.duration))throw new Error('Invalid saved fare');
      distance=shortestRoute(this.stop(fare.pickupId).nodeId,this.stop(fare.destinationId).nodeId).cost;
      if(!Number.isFinite(distance))throw new Error('Unreachable saved fare');

    }else if(value.currentFare!==null||value.offerPending||value.receipts.length)throw new Error('Invalid saved journey');
    for(const r of value.receipts)if(!r||![r.passenger,r.pickup,r.destination].every(s=>typeof s==='string'&&s.length<=200)||
      ![r.distanceMetres,r.seconds].every(nonnegative)||![r.baseCents,r.bonusCents,r.totalCents].every(integer)||r.totalCents!==r.baseCents+r.bonusCents)throw new Error('Invalid saved receipt');
    if(value.earningsCents!==value.receipts.reduce((n,r)=>n+r.totalCents,0)||value.bonusEarnedCents!==value.receipts.reduce((n,r)=>n+r.bonusCents,0))throw new Error('Invalid saved earnings');
    const {elapsed,totalElapsed,state,taxiStage,fareIndex,earningsCents,bonusEarnedCents,receipts,directionRequests,offerPending,offerQuoted,approachDistance,currentFare,randomState,notice}=value;
    Object.assign(this,structuredClone({elapsed,totalElapsed,state,taxiStage,fareIndex,earningsCents,bonusEarnedCents,receipts,directionRequests,offerPending,offerQuoted,approachDistance,currentFare,randomState,notice}));
    this.rideDistance=distance;this.rideBudget=Math.max(100,90+distance/4.5);
    if(this.offerPending)this.notice=this.dispatchNotice();
    this.revision++;
  }
  update(dt:number,position:Point,stopped:boolean){
    if(this.finished)return;
    const active=this.taxi?Math.min(dt,this.remaining):dt;
    this.elapsed+=active;this.totalElapsed+=active;
    if(this.taxi){
      if(this.remaining<=1e-7){this.totalElapsed=this.shiftSeconds;this.state='shift-complete';this.notice=`${this.clockText} · Taxi shift complete.`;this.revision++;}
      return;
    }
    if(this.elapsed>this.duration)this.state='overdue';
    if(stopped&&inRect(position,hotelBay,1.1))this.state=this.elapsed<=this.duration?'success':'late';
  }
}
return {Mission};
}
export type Mission=InstanceType<ReturnType<typeof createMission>["Mission"]>;
