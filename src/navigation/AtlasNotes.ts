import { type Point } from "../world/district";
import { District } from "../world/district";
export interface AtlasSnapshot {cursor:Point;marker:Point|null;source:'start'|'confirmed'|'estimate';label:string}
export function createAtlasNotes(context:District){
const {district,spawn}=context;
const paperBounds = () => {
  const b=district.bounds,span=Math.max(b.maxX-b.minX,b.maxZ-b.minZ);
  return {minX:(b.minX+b.maxX-span)/2,maxX:(b.minX+b.maxX+span)/2,minZ:(b.minZ+b.maxZ-span)/2,maxZ:(b.minZ+b.maxZ+span)/2,span};
};
const boundedX = (value: number) => Math.max(paperBounds().minX,Math.min(paperBounds().maxX,value));
const boundedZ = (value: number) => Math.max(paperBounds().minZ,Math.min(paperBounds().maxZ,value));
class AtlasNotes {
  cursor: Point = { x: spawn.x, z: spawn.z };
  marker: Point | undefined = { x: spawn.x, z: spawn.z };
  source: "start" | "confirmed" | "estimate" = "start";
  label = spawn.name;

  snapshot():AtlasSnapshot{return {cursor:{...this.cursor},marker:this.marker?{...this.marker}:null,source:this.source,label:this.label};}
  restore(value:AtlasSnapshot){
    const valid=(p:Point)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x===boundedX(p.x)&&p.z===boundedZ(p.z);
    if(!value||!valid(value.cursor)||(value.marker!==null&&!valid(value.marker))||!['start','confirmed','estimate'].includes(value.source)||typeof value.label!=='string'||value.label.length>500)throw new Error('Invalid saved atlas');
    this.cursor={...value.cursor};this.marker=value.marker?{...value.marker}:undefined;this.source=value.source;this.label=value.label;
  }

  reset() {
    this.cursor = { x: spawn.x, z: spawn.z };
    this.marker = { ...this.cursor };
    this.source = "start";
    this.label = spawn.name;
  }

  confirm(position: Point, label: string) {
    this.marker = { x: position.x, z: position.z };
    this.cursor = { ...this.marker };
    this.source = "confirmed";
    this.label = label;
  }

  move(dt: number, x: number, z: number): boolean {
    const length = Math.max(1, Math.hypot(x, z));
    const next = {
      x: boundedX(this.cursor.x + (x / length) * (paperBounds().span/240*70) * dt),
      z: boundedZ(this.cursor.z + (z / length) * (paperBounds().span/240*70) * dt),
    };
    const changed = next.x !== this.cursor.x || next.z !== this.cursor.z;
    this.cursor = next;
    return changed;
  }

  pointAt(point: Point) {
    this.cursor = { x: boundedX(point.x), z: boundedZ(point.z) };
  }

  place() {
    this.marker = { ...this.cursor };
    this.source = "estimate";
  }

  remove() {
    this.marker = undefined;
  }
}
return {AtlasNotes};
}
export type AtlasNotes=InstanceType<ReturnType<typeof createAtlasNotes>["AtlasNotes"]>;
