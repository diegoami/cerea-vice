import { inRect, type Point, type Road } from "../world/district";
import type {NavigationTarget,TaxiStop,TaxiFare} from '../world/schema';
import { createNavigation } from "../navigation/Navigation";
import { District } from "../world/district";
export type MissionState = "active" | "overdue" | "success" | "late" | "shift-complete";
export interface FareReceipt {passenger:string;pickup:string;destination:string;distanceMetres:number;seconds:number;baseCents:number;bonusCents:number;totalCents:number}
/** One listed fare. Its identity and quote stay fixed until it is accepted or the list is replaced. */
export interface FareOffer extends TaxiFare {id:number;quoted:boolean;approachDistance:number}
export interface MissionSnapshot {
 elapsed:number;totalElapsed:number;state:MissionState;taxiStage:'pickup'|'dropoff';fareIndex:number;
 earningsCents:number;bonusEarnedCents:number;receipts:FareReceipt[];directionRequests:{legal:number;unsafe:number};
 approachDistance:number;currentFare:TaxiFare|null;previousFare:TaxiFare|null;fareBoard:FareOffer[];boardSerial:number;boarding:number;
 randomState:number;notice:string;
}
/** The 0.8 single-offer snapshot, migrated by `migrateSnapshot`. */
export interface LegacyMissionSnapshot extends Omit<MissionSnapshot,'previousFare'|'fareBoard'|'boardSerial'|'boarding'> {offerPending:boolean;offerQuoted:boolean}
/** Fares shown together on one dispatch list. */
export const FARE_BOARD_SIZE=4;
/** Seconds for a passenger to walk from the kerb and sit down, and to walk away after dropoff. */
export const BOARDING_SECONDS=5.5;
export const DEPARTURE_SECONDS=4;
/** Long journeys retain worthwhile guaranteed pay even after the speed bonus expires. */
export function guaranteedFare(base:number,perKm:number,distance:number){
 return base+Math.round(distance/1000*perKm+Math.max(0,distance-1000)*2.5);
}
export const collectionSupplement=(approachDistance:number)=>Math.round(Math.max(0,approachDistance-1000)*2.5);
/** A pending 0.8 offer becomes a one-entry list with the same identity and quote. */
export function migrateSnapshot(value:LegacyMissionSnapshot):MissionSnapshot{
 if(!value||typeof value!=='object')throw new Error('Invalid saved shift');
 const {offerPending,offerQuoted,...rest}=value;
 if(typeof offerPending!=='boolean'||typeof offerQuoted!=='boolean')throw new Error('Invalid saved shift');
 const fare=value.currentFare;
 if(offerPending&&fare)return {...rest,currentFare:null,previousFare:null,boardSerial:1,boarding:0,approachDistance:0,
   fareBoard:[{id:0,passenger:fare.passenger,pickupId:fare.pickupId,destinationId:fare.destinationId,quoted:offerQuoted,approachDistance:offerQuoted?value.approachDistance:0}],notice:''};
 return {...rest,previousFare:null,fareBoard:[],boardSerial:0,boarding:0};
}
export function createMission(context:District){
const {district,hotelBay,parkingZones}=context;
const {shortestRoute,nearestRoad}=createNavigation(context);
let reachablePairs:TaxiFare[]|undefined;
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
  /** Remaining walk-to-the-car time; the ride is committed but the seat is still empty. */
  boarding=0;
  /** Presentation only: the delivered passenger walking away. Never saved. */
  departure:{identity:string;stopId:string;remaining:number}|null=null;
  fareBoard:FareOffer[]=[];
  boardSerial=0;
  private rideDistance=0;
  private rideBudget=180;
  private approachDistance=0;
  private currentFare:TaxiFare|null=null;
  private previousFare:TaxiFare|null=null;
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
  /** Free driving: no accepted ride. The list may or may not be issued. */
  get freeDriving(){return Boolean(this.taxi)&&!this.currentFare;}
  get hasRide(){return Boolean(this.taxi&&this.currentFare);}
  get passenger(){return this.currentFare?.passenger??'';}
  get pickupStop(){return this.taxi&&this.currentFare?this.stop(this.currentFare.pickupId):undefined;}
  get destinationStop(){return this.taxi&&this.currentFare?this.stop(this.currentFare.destinationId):undefined;}
  /** Interior and exterior figures share this appearance. */
  get passengerIdentity(){return this.currentFare?`${this.currentFare.passenger}@${this.currentFare.pickupId}`:'';}
  get seatedIdentity(){return this.unfinishedPassenger&&this.boarding===0?this.passengerIdentity:'';}
  offerGuaranteeCents(offer:FareOffer){
    if(!this.taxi)return 0;
    return guaranteedFare(this.taxi.baseCents,this.taxi.perKmCents,this.pairDistance(offer))+collectionSupplement(offer.approachDistance);
  }
  offerText(offer:FareOffer){
    if(!this.taxi)return '';
    const pickup=this.stop(offer.pickupId),destination=this.stop(offer.destinationId);
    const journey=`${offer.passenger}: ${pickup.name}, ${pickup.road} → ${destination.name}, ${destination.road}.`;
    return offer.quoted?`${journey} Guaranteed €${(this.offerGuaranteeCents(offer)/100).toFixed(2)} + up to €${(this.taxi.maxBonusCents/100).toFixed(2)} speed bonus.`:`${journey} Stop to receive a fare quote.`;
  }
  private pairDistance(fare:TaxiFare){return shortestRoute(this.stop(fare.pickupId).nodeId,this.stop(fare.destinationId).nodeId).cost;}
  private random(){this.randomState=(Math.imul(this.randomState,1664525)+1013904223)>>>0;return this.randomState/4294967296;}
  private get pairs(){
    if(!reachablePairs){
      reachablePairs=[];
      for(const a of this.taxi!.stops)for(const b of this.taxi!.stops){
        if(a.id===b.id)continue;
        if(Number.isFinite(shortestRoute(a.nodeId,b.nodeId).cost))reachablePairs.push({pickupId:a.id,destinationId:b.id,passenger:''});
      }
    }
    return reachablePairs;
  }
  /** Draw distinct reachable fares. The first draw matches the 0.8 single-offer sequence. */
  private issueBoard(position:Point){
    const taxi=this.taxi!,entries:TaxiFare[]=[];
    const same=(a:TaxiFare,b:TaxiFare|null)=>Boolean(b)&&a.pickupId===b!.pickupId&&a.destinationId===b!.destinationId;
    if(this.options.authored){
      for(let k=0;k<Math.min(FARE_BOARD_SIZE,taxi.fares.length);k++)entries.push({...taxi.fares[(this.fareIndex+k)%taxi.fares.length]});
    }else for(let k=0;k<FARE_BOARD_SIZE;k++){
      const open=this.pairs.filter(p=>!entries.some(e=>same(p,e)));
      if(!open.length)break;
      const different=open.filter(p=>!same(p,this.previousFare)),choices=different.length?different:open;
      const names=taxi.fares.filter(f=>!entries.some(e=>e.passenger===f.passenger)),roster=names.length?names:taxi.fares;
      entries.push({...choices[Math.floor(this.random()*choices.length)],passenger:roster[Math.floor(this.random()*roster.length)].passenger});
    }
    this.fareBoard=entries.map(e=>({...e,id:this.boardSerial++,quoted:false,approachDistance:0}));
    this.quoteBoard(position);
  }
  /** Collection supplements are fixed from where the list is first read, at a full stop. */
  private quoteBoard(position:Point){
    for(const offer of this.fareBoard){
      if(offer.quoted)continue;
      offer.approachDistance=this.approachFrom(position,this.stop(offer.pickupId));offer.quoted=true;
    }
  }
  private approachFrom(position:Point,stop:TaxiStop){
    const bay=parkingZones.find(b=>b.id===stop.bayId)!;
    if(inRect(position,bay))return 0;
    const near=nearestRoad(position),road=near.edge as Road,starts=road.oneWay?[road.b]:[road.a,road.b];
    const distance=Math.min(...starts.map(id=>shortestRoute(id,stop.nodeId).cost+Math.hypot(near.point.x-context.nodeById(id).x,near.point.z-context.nodeById(id).z)+near.distance));
    return Number.isFinite(distance)?distance:0;
  }
  /** Deliberate stopped request. Issues a list only when none is waiting; never rerolls one. */
  requestFares(position:Point){
    if(!this.freeDriving||this.finished)return false;
    if(!this.fareBoard.length)this.issueBoard(position);else this.quoteBoard(position);
    this.revision++;return true;
  }
  /** Explicitly replace every listed fare, without a penalty. */
  refreshFares(position:Point){
    if(!this.freeDriving||this.finished)return false;
    this.issueBoard(position);this.revision++;return true;
  }
  acceptFare(id:number){
    const offer=this.fareBoard.find(o=>o.id===id);
    if(!offer||!offer.quoted||!this.freeDriving||this.finished)return false;
    this.currentFare={passenger:offer.passenger,pickupId:offer.pickupId,destinationId:offer.destinationId};
    this.previousFare={...this.currentFare};
    this.approachDistance=offer.approachDistance;this.rideDistance=this.pairDistance(offer);this.rideBudget=Math.max(100,90+this.rideDistance/4.5);
    // Other drivers take the remaining listed fares.
    this.fareBoard=[];this.taxiStage='pickup';this.boarding=0;
    this.notice=`Fare accepted. ${this.objective}`;this.revision++;return true;
  }
  /** Shift-start variety: treat a pair remembered from the last shift's first list as just driven. */
  avoidOpening(fare:TaxiFare|null){
    if(!fare||this.boardSerial||this.receipts.length||!this.taxi||!this.taxi.stops.some(s=>s.id===fare.pickupId)||!this.taxi.stops.some(s=>s.id===fare.destinationId))return;
    this.previousFare={passenger:'',pickupId:fare.pickupId,destinationId:fare.destinationId};
  }
  private receiptNotice(receipt:FareReceipt){return `${receipt.passenger}: fare €${(receipt.totalCents/100).toFixed(2)} (base €${(receipt.baseCents/100).toFixed(2)} + speed bonus €${(receipt.bonusCents/100).toFixed(2)}).`;}
  private freeNotice(){const receipt=this.receipts.at(-1);return `${receipt?this.receiptNotice(receipt)+' ':''}Free driving. Stop and request fares.`;}
  private stop(id:string):TaxiStop {return this.taxi!.stops.find(stop=>stop.id===id)!;}
  /** The current goal; none while free driving. */
  get target():NavigationTarget|undefined {
    if(!this.taxi)return {name:district.mission.name,nodeId:district.mission.nodeId,bay:hotelBay};
    if(!this.currentFare)return undefined;
    const stop=this.stop(this.taxiStage==='pickup'?this.currentFare.pickupId:this.currentFare.destinationId);
    return {name:stop.name,road:stop.road,nodeId:stop.nodeId,bay:parkingZones.find(bay=>bay.id===stop.bayId)!};
  }
  get objective(){
    if(!this.taxi)return district.mission.objective;
    const target=this.target;
    if(!target){const n=this.fareBoard.length;return n?`Free driving. ${n} fare${n===1?' is':'s are'} listed; stop and request fares to read ${n===1?'it':'them'} again.`:'Free driving. Stop and request fares.';}
    if(this.boarding>0)return `${this.passenger} is getting in. Stay stopped.`;
    return `${this.taxiStage==='pickup'?`Collect ${this.passenger} at`:`Take ${this.passenger} to`} ${target.name}, ${target.road}. Stop in ${target.bay.name}.`;
  }
  get clockHours(){return this.taxi?Math.min(this.taxi.endHour,this.taxi.startHour+this.totalElapsed*this.taxi.clockRate/3600):7;}
  private clockAt(hour:number){const minutes=Math.min(24*60-1,Math.floor(hour*60+1e-6));return `${Math.floor(minutes/60).toString().padStart(2,'0')}:${(minutes%60).toString().padStart(2,'0')}`;}
  get clockText(){return this.clockAt(this.clockHours);}
  get shiftLabel(){return this.taxi?`${this.clockAt(this.taxi.startHour)}–${this.clockAt(this.taxi.endHour)}`:'';}
  get baseFareCents(){return this.taxi&&this.currentFare?guaranteedFare(this.taxi.baseCents,this.taxi.perKmCents,this.rideDistance)+collectionSupplement(this.approachDistance):0;}
  get potentialBonusCents(){return this.taxi&&this.currentFare&&this.taxiStage==='dropoff'?Math.round(this.taxi.maxBonusCents*Math.max(0,1-this.elapsed/this.rideBudget)):0;}
  get unfinishedPassenger(){return Boolean(this.taxi&&this.currentFare&&this.taxiStage==='dropoff');}
  get routeDistance(){return this.rideDistance;}

  reset(){
    this.elapsed=0;this.totalElapsed=0;this.state='active';this.directionRequests={legal:0,unsafe:0};
    this.taxiStage='pickup';this.fareIndex=0;this.earningsCents=0;this.bonusEarnedCents=0;this.receipts=[];
    this.rideDistance=0;this.rideBudget=180;this.approachDistance=0;this.currentFare=null;this.previousFare=null;
    this.fareBoard=[];this.boardSerial=0;this.boarding=0;this.departure=null;
    this.randomState=(this.options.seed??Math.floor(Math.random()*4294967296))>>>0;
    this.notice=this.taxi?this.freeNotice():district.mission.hint;
    this.revision++;
  }
  recordDirectionRequest(stopped:boolean,legallyParked:boolean):boolean {
    if(!stopped||this.finished)return false;
    this.directionRequests[legallyParked?'legal':'unsafe']++;return true;
  }
  canServe(position:Point,stopped:boolean){const target=this.target;return this.hasRide&&this.boarding===0&&!this.finished&&stopped&&Boolean(target)&&inRect(position,target!.bay,1.1);}
  serveAtStop(position:Point,stopped:boolean):boolean {
    if(!this.canServe(position,stopped))return false;
    const fare=this.currentFare!,pickup=this.stop(fare.pickupId),destination=this.stop(fare.destinationId);
    if(this.taxiStage==='pickup') {
      const route=shortestRoute(pickup.nodeId,destination.nodeId);
      if(!Number.isFinite(route.cost))return false;
      // Service commits the ride; the bonus clock starts once the passenger is seated.
      this.rideDistance=route.cost;this.rideBudget=Math.max(100,90+route.cost/4.5);
      this.taxiStage='dropoff';this.elapsed=0;this.boarding=BOARDING_SECONDS;
      this.notice=`${this.passenger} is getting in. Stay stopped.`;
    } else {
      const baseCents=this.baseFareCents,bonusCents=this.potentialBonusCents;
      const totalCents=baseCents+bonusCents;
      this.receipts.push({passenger:fare.passenger,pickup:pickup.name,destination:destination.name,distanceMetres:this.rideDistance,seconds:this.elapsed,baseCents,bonusCents,totalCents});
      this.earningsCents+=totalCents;this.bonusEarnedCents+=bonusCents;
      this.departure={identity:this.passengerIdentity,stopId:destination.id,remaining:DEPARTURE_SECONDS};
      this.fareIndex++;this.taxiStage='pickup';this.elapsed=0;this.currentFare=null;this.approachDistance=0;this.rideDistance=0;
      this.notice=this.freeNotice();
    }
    this.revision++;return true;
  }
  private boardedNotice(){const destination=this.destinationStop!;return `${this.passenger} boarded: “Please take me to ${destination.name}, ${destination.road}.”`;}
  snapshot():MissionSnapshot {
    return structuredClone({elapsed:this.elapsed,totalElapsed:this.totalElapsed,state:this.state,taxiStage:this.taxiStage,fareIndex:this.fareIndex,
      earningsCents:this.earningsCents,bonusEarnedCents:this.bonusEarnedCents,receipts:this.receipts,directionRequests:this.directionRequests,
      approachDistance:this.approachDistance,currentFare:this.currentFare,previousFare:this.previousFare,fareBoard:this.fareBoard,boardSerial:this.boardSerial,
      boarding:this.boarding,randomState:this.randomState,notice:this.notice});
  }
  restore(value:MissionSnapshot){
    const nonnegative=(n:number)=>Number.isFinite(n)&&n>=0;
    const integer=(n:number)=>Number.isSafeInteger(n)&&n>=0;
    if(!value||!nonnegative(value.elapsed)||!nonnegative(value.totalElapsed)||value.totalElapsed>this.duration||value.elapsed>value.totalElapsed||
      !['active','overdue','success','late','shift-complete'].includes(value.state)||!['pickup','dropoff'].includes(value.taxiStage)||
      !integer(value.fareIndex)||!integer(value.earningsCents)||!integer(value.bonusEarnedCents)||!integer(value.randomState)||value.randomState>0xffffffff||
      !integer(value.directionRequests?.legal)||!integer(value.directionRequests?.unsafe)||
      !nonnegative(value.approachDistance)||value.approachDistance>1000000||!integer(value.boardSerial)||
      !nonnegative(value.boarding)||value.boarding>BOARDING_SECONDS||!Array.isArray(value.fareBoard)||value.fareBoard.length>FARE_BOARD_SIZE||
      typeof value.notice!=='string'||value.notice.length>5000||!Array.isArray(value.receipts)||value.receipts.length>10000)throw new Error('Invalid saved shift');
    let distance=0;
    if(this.taxi){
      const validFare=(fare:TaxiFare|null,named=true)=>Boolean(fare)&&typeof fare!.passenger==='string'&&(!named||Boolean(fare!.passenger.trim()))&&fare!.passenger.length<=100&&
        fare!.pickupId!==fare!.destinationId&&this.taxi!.stops.some(s=>s.id===fare!.pickupId)&&this.taxi!.stops.some(s=>s.id===fare!.destinationId)&&
        Number.isFinite(this.pairDistance(fare!));
      const fare=value.currentFare,ids=new Set(value.fareBoard.map(o=>o?.id));
      if((fare!==null&&!validFare(fare))||(value.previousFare!==null&&!validFare(value.previousFare,false))||
        value.fareBoard.some(o=>!validFare(o)||!integer(o.id)||o.id>=value.boardSerial||typeof o.quoted!=='boolean'||!nonnegative(o.approachDistance)||o.approachDistance>1000000||(!o.quoted&&o.approachDistance!==0))||
        ids.size!==value.fareBoard.length||(fare!==null&&value.fareBoard.length>0)||
        (fare===null&&(value.taxiStage!=='pickup'||value.approachDistance!==0))||(value.boarding>0&&(fare===null||value.taxiStage!=='dropoff'))||
        !['active','shift-complete'].includes(value.state)||(value.state==='shift-complete')!==(value.totalElapsed===this.duration))throw new Error('Invalid saved fare');
      if(fare)distance=this.pairDistance(fare);
    }else if(value.currentFare!==null||value.previousFare!==null||value.fareBoard.length||value.boardSerial||value.boarding||value.receipts.length)throw new Error('Invalid saved journey');
    for(const r of value.receipts)if(!r||![r.passenger,r.pickup,r.destination].every(s=>typeof s==='string'&&s.length<=200)||
      ![r.distanceMetres,r.seconds].every(nonnegative)||![r.baseCents,r.bonusCents,r.totalCents].every(integer)||r.totalCents!==r.baseCents+r.bonusCents)throw new Error('Invalid saved receipt');
    if(value.earningsCents!==value.receipts.reduce((n,r)=>n+r.totalCents,0)||value.bonusEarnedCents!==value.receipts.reduce((n,r)=>n+r.bonusCents,0))throw new Error('Invalid saved earnings');
    const {elapsed,totalElapsed,state,taxiStage,fareIndex,earningsCents,bonusEarnedCents,receipts,directionRequests,approachDistance,currentFare,previousFare,boardSerial,boarding,randomState,notice}=value;
    const fareBoard=value.fareBoard.map(({id,passenger,pickupId,destinationId,quoted,approachDistance})=>({id,passenger,pickupId,destinationId,quoted,approachDistance}));
    Object.assign(this,structuredClone({elapsed,totalElapsed,state,taxiStage,fareIndex,earningsCents,bonusEarnedCents,receipts,directionRequests,approachDistance,currentFare,previousFare,fareBoard,boardSerial,boarding,randomState,notice}));
    this.rideDistance=distance;this.rideBudget=Math.max(100,90+distance/4.5);this.departure=null;
    // Older notices may predate the free-driving flow; rebuild them from state.
    if(this.taxi&&!this.currentFare&&!notice)this.notice=this.freeNotice();
    this.revision++;
  }
  update(dt:number,position:Point,stopped:boolean){
    if(this.finished)return;
    const active=this.taxi?Math.min(dt,this.remaining):dt;
    this.totalElapsed+=active;
    if(this.departure&&(this.departure.remaining-=active)<=0)this.departure=null;
    // The bonus clock starts once the passenger is seated, part-way through a step if need be.
    const walking=Math.min(this.boarding,active);
    if(this.boarding>0){
      this.boarding-=walking;
      if(this.boarding<=1e-9){this.boarding=0;this.notice=this.boardedNotice();this.revision++;}
    }
    this.elapsed+=active-walking;
    if(this.taxi){
      if(this.remaining<=1e-7){this.totalElapsed=this.shiftSeconds;this.boarding=0;this.departure=null;this.state='shift-complete';this.notice='Taxi shift complete.';this.revision++;}
      return;
    }
    if(this.elapsed>this.duration)this.state='overdue';
    if(stopped&&inRect(position,hotelBay,1.1))this.state=this.elapsed<=this.duration?'success':'late';
  }
}
return {Mission};
}
export type Mission=InstanceType<ReturnType<typeof createMission>["Mission"]>;
