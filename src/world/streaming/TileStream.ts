import type {Point,Bounds} from '../schema';
import type {TileManifest,TileRef,TilePayload} from './schema';
export const distanceToBounds=(p:Point,b:Bounds)=>Math.hypot(Math.max(b.minX-p.x,0,p.x-b.maxX),Math.max(b.minZ-p.z,0,p.z-b.maxZ));
export interface TileResource {dispose():void}
/** Street-name plates are readable only up close, so a tile builds them within `show` metres of the car
 * and frees them beyond `hide`: their textures then depend on what is near, not on the load radius (#51). */
export const PLATE_RADIUS={show:300,hide:400};
/** Bounded asynchronous loading; stale completions are disposed rather than installed. */
export class TileStream<T extends TileResource> {
 readonly resident=new Map<string,T>();
 readonly stats={loads:0,unloads:0,failures:0,bytes:0,peakResident:0,fetchMs:0,buildMs:0};
 private wanted=new Set<string>();private keep=new Set<string>();private pending=new Set<string>();private failed=new Map<string,{attempts:number;retryAt:number}>();private queue:TileRef[]=[];private closed=false;
 constructor(readonly manifest:TileManifest,private load:(ref:TileRef)=>Promise<TilePayload>,private build:(payload:TilePayload,ref:TileRef)=>T,private concurrency=2,private readonly clock:()=>number=()=>performance.now()){}
 update(point:Point){
  if(this.closed)return;
  this.wanted=new Set(this.manifest.tiles.filter(t=>distanceToBounds(point,t.bounds)<=this.manifest.loadRadius).map(t=>t.id));
  this.keep=new Set(this.manifest.tiles.filter(t=>distanceToBounds(point,t.bounds)<=this.manifest.retainRadius).map(t=>t.id));
  for(const [id,resource] of this.resident)if(!this.keep.has(id)){resource.dispose();this.resident.delete(id);this.stats.unloads++;}
  const now=this.clock();
  this.queue=this.manifest.tiles.filter(t=>this.wanted.has(t.id)&&!this.resident.has(t.id)&&!this.pending.has(t.id)&&(!this.failed.has(t.id)||this.failed.get(t.id)!.retryAt<=now)).sort((a,b)=>distanceToBounds(point,a.bounds)-distanceToBounds(point,b.bounds));
  this.pump();
 }
 private pump(){
  while(!this.closed&&this.pending.size<this.concurrency&&this.queue.length){
   const ref=this.queue.shift()!;if(!this.wanted.has(ref.id))continue;this.pending.add(ref.id);
   const start=performance.now();
   void this.load(ref).then(payload=>{
    this.stats.fetchMs+=performance.now()-start;
    if(this.closed||!this.keep.has(ref.id))return;
    if(payload.version!==1||payload.id!==ref.id)throw new Error('Tile identity mismatch');
    const begin=performance.now(),resource=this.build(payload,ref);this.stats.buildMs+=performance.now()-begin;
    this.failed.delete(ref.id);this.resident.set(ref.id,resource);this.stats.loads++;this.stats.bytes+=ref.bytes;this.stats.peakResident=Math.max(this.stats.peakResident,this.resident.size);
   }).catch(()=>{if(!this.closed){const attempts=(this.failed.get(ref.id)?.attempts??0)+1;this.failed.set(ref.id,{attempts,retryAt:this.clock()+Math.min(8000,500*2**Math.min(attempts-1,4))});this.stats.failures++;}}).finally(()=>{this.pending.delete(ref.id);this.pump();});
  }
 }
 readyAt(point:Point){if(!this.manifest.tiles.some(t=>distanceToBounds(point,t.bounds)===0))return false;return this.manifest.tiles.filter(t=>distanceToBounds(point,t.bounds)<=this.manifest.loadRadius-50).every(t=>this.resident.has(t.id));}
 get recovering(){return !this.closed&&[...this.failed.keys()].some(id=>this.wanted.has(id));}
 get loading(){return this.pending.size+this.queue.length;}
 dispose(){this.closed=true;this.queue=[];for(const r of this.resident.values())r.dispose();this.resident.clear();}
}
