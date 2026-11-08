import {inRect,type District,type Point} from '../world/district';
import {mappedTowns} from '../world/towns';
import type {AtlasSheet} from './AtlasSheets';
import {townSignName} from '../world/placeNames';

/** Continuous-service maps use one rectangular detail drawing per real town. */
export function createTownSheets(context:District){
 const bounds=context.district.bounds;
 const sheets:AtlasSheet[]=mappedTowns(context).map((town,index)=>{
  const points=town.stops.map(s=>context.nodeById(s.nodeId));
  const minX=Math.max(bounds.minX,Math.min(town.area.x-town.area.width/2,...points.map(p=>p.x))-100),minZ=Math.max(bounds.minZ,Math.min(town.area.z-town.area.depth/2,...points.map(p=>p.z))-100);
  const width=Math.min(bounds.maxX,Math.max(town.area.x+town.area.width/2,...points.map(p=>p.x))+100)-minX,depth=Math.min(bounds.maxZ,Math.max(town.area.z+town.area.depth/2,...points.map(p=>p.z))+100)-minZ;
  const signed=townSignName(town.area),regionalName=town.name===signed||town.name.toLowerCase().startsWith(signed.toLowerCase()+' ')?signed:town.name;
  return {id:town.id,name:town.name,regionalName,column:index,row:0,minX,minZ,width,depth,span:Math.max(width,depth),overlap:0,town:true};
 });
 const sheetAt=(point:Point)=>sheets.find(s=>inRect(point,{x:s.minX+s.width!/2,z:s.minZ+s.depth!/2,width:s.width!,depth:s.depth!}));
 const neighbour=(sheet:AtlasSheet,dx:number,dz:number)=>{
  const x=sheet.minX+sheet.width!/2,z=sheet.minZ+sheet.depth!/2;
  return sheets.filter(other=>other!==sheet).map(other=>({sheet:other,x:other.minX+other.width!/2-x,z:other.minZ+other.depth!/2-z}))
   .filter(other=>(other.x*dx+other.z*dz)>0).sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0]?.sheet;
 };
 return {sheets,sheetAt,neighbour,stride:0};
}
