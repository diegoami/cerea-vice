import { district, hotelBay, parkingZones, inRect, type Point } from "../world/district";
import type {NavigationTarget,TaxiStop} from '../world/schema';
import {shortestRoute} from '../navigation/Navigation';

export type MissionState = "active" | "overdue" | "success" | "late" | "shift-complete";
export interface FareReceipt {passenger:string;pickup:string;destination:string;distanceMetres:number;seconds:number;baseCents:number;bonusCents:number;totalCents:number}
export class Mission {
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

  constructor(){this.reset();}
  get taxiMode(){return Boolean(this.taxi);}
  get shiftSeconds(){return this.taxi?(this.taxi.endHour-this.taxi.startHour)*3600/this.taxi.clockRate:district.mission.duration;}
  get duration(){return this.taxi?this.shiftSeconds:district.mission.duration;}
  get remaining(){return Math.max(0,this.duration-(this.taxi?this.totalElapsed:this.elapsed));}
  get finished(){return this.state==='success'||this.state==='late'||this.state==='shift-complete';}
  get directionRequestCount(){return this.directionRequests.legal+this.directionRequests.unsafe;}
  get completedFares(){return this.receipts.length;}
  get passenger(){return this.taxi?.fares[this.fareIndex%this.taxi.fares.length].passenger??'';}
  private get fare(){return this.taxi!.fares[this.fareIndex%this.taxi!.fares.length];}
  private stop(id:string):TaxiStop {return this.taxi!.stops.find(stop=>stop.id===id)!;}
  get target():NavigationTarget {
    if(!this.taxi)return {name:district.mission.name,nodeId:district.mission.nodeId,bay:hotelBay};
    const stop=this.stop(this.taxiStage==='pickup'?this.fare.pickupId:this.fare.destinationId);
    return {name:stop.name,road:stop.road,nodeId:stop.nodeId,bay:parkingZones.find(bay=>bay.id===stop.bayId)!};
  }
  get objective(){
    if(!this.taxi)return district.mission.objective;
    return `${this.taxiStage==='pickup'?`Collect ${this.passenger} at`:`Take ${this.passenger} to`} ${this.target.name}, ${this.target.road}. Stop in ${this.target.bay.name} and press A / Enter.`;
  }
  get clockHours(){return this.taxi?Math.min(this.taxi.endHour,this.taxi.startHour+this.totalElapsed*this.taxi.clockRate/3600):7;}
  private clockAt(hour:number){const minutes=Math.min(24*60-1,Math.floor(hour*60+1e-6));return `${Math.floor(minutes/60).toString().padStart(2,'0')}:${(minutes%60).toString().padStart(2,'0')}`;}
  get clockText(){return this.clockAt(this.clockHours);}
  get shiftLabel(){return this.taxi?`${this.clockAt(this.taxi.startHour)}–${this.clockAt(this.taxi.endHour)}`:'';}
  get baseFareCents(){return this.taxi?this.taxi.baseCents+Math.round(this.rideDistance/1000*this.taxi.perKmCents):0;}
  get potentialBonusCents(){return this.taxi&&this.taxiStage==='dropoff'?Math.round(this.taxi.maxBonusCents*Math.max(0,1-this.elapsed/this.rideBudget)):0;}
  get unfinishedPassenger(){return Boolean(this.taxi&&this.taxiStage==='dropoff');}
  get routeDistance(){return this.rideDistance;}

  reset(){
    this.elapsed=0;this.totalElapsed=0;this.state='active';this.directionRequests={legal:0,unsafe:0};
    this.taxiStage='pickup';this.fareIndex=0;this.earningsCents=0;this.bonusEarnedCents=0;this.receipts=[];
    this.rideDistance=0;this.rideBudget=180;
    this.notice=this.taxi?`${this.clockText} · Taxi dispatch: ${this.objective}`:district.mission.hint;
    this.revision++;
  }
  recordDirectionRequest(stopped:boolean,legallyParked:boolean):boolean {
    if(!stopped||this.finished)return false;
    this.directionRequests[legallyParked?'legal':'unsafe']++;return true;
  }
  canServe(position:Point,stopped:boolean){return this.taxiMode&&!this.finished&&stopped&&inRect(position,this.target.bay,1.1);}
  serveAtStop(position:Point,stopped:boolean):boolean {
    if(!this.canServe(position,stopped))return false;
    if(this.taxiStage==='pickup') {
      const pickup=this.stop(this.fare.pickupId),destination=this.stop(this.fare.destinationId);
      const route=shortestRoute(pickup.nodeId,destination.nodeId);
      if(!Number.isFinite(route.cost))return false;
      this.rideDistance=route.cost;this.rideBudget=Math.max(100,90+route.cost/4.5);
      this.taxiStage='dropoff';this.elapsed=0;
      this.notice=`${this.passenger} boarded: “Please take me to ${destination.name}, ${destination.road}.” A base fare plus up to €${(this.taxi!.maxBonusCents/100).toFixed(2)} speed bonus is available. Stop there and press A / Enter.`;
    } else {
      const fare=this.fare,pickup=this.stop(fare.pickupId),destination=this.stop(fare.destinationId);
      const baseCents=this.baseFareCents,bonusCents=this.potentialBonusCents;
      const totalCents=baseCents+bonusCents;
      this.receipts.push({passenger:fare.passenger,pickup:pickup.name,destination:destination.name,distanceMetres:this.rideDistance,seconds:this.elapsed,baseCents,bonusCents,totalCents});
      this.earningsCents+=totalCents;this.bonusEarnedCents+=bonusCents;
      this.fareIndex++;this.taxiStage='pickup';this.elapsed=0;this.rideDistance=0;
      this.notice=`${fare.passenger}: “Thank you!” Fare €${(totalCents/100).toFixed(2)} (base €${(baseCents/100).toFixed(2)} + speed bonus €${(bonusCents/100).toFixed(2)}). Dispatch: ${this.objective}`;
    }
    this.revision++;return true;
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
