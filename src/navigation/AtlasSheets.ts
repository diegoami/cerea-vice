import { type Point, District } from '../world/district';

export interface AtlasSheet { id:string; column:number; row:number; minX:number; minZ:number; span:number; name:string }
/** Printed, overlapping kilometre quadrants. Selection depends on the reader, never the car. */
export function createAtlasSheets(context:District) {
  const {bounds,areas,spawn}=context.district;
  const regional=Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)>4000;
  const stride=1000,span=1200;
  // Align the fixed book with its starting town, so the original Cerea map fits one page.
  const anchor=areas.find(area=>Math.abs(spawn.x-area.x)<=area.width/2&&Math.abs(spawn.z-area.z)<=area.depth/2)??spawn;
  const startX=anchor.x-stride/2+Math.floor((bounds.minX-anchor.x+stride/2)/stride)*stride;
  const startZ=anchor.z-stride/2+Math.floor((bounds.minZ-anchor.z+stride/2)/stride)*stride;
  const columns=Math.ceil((bounds.maxX-startX)/stride),rows=Math.ceil((bounds.maxZ-startZ)/stride);
  const letters=(column:number):string=>column<26?String.fromCharCode(65+column):letters(Math.floor(column/26)-1)+letters(column%26);
  const sheets:AtlasSheet[]=regional?Array.from({length:columns*rows},(_,index)=>{
    const column=index%columns,row=Math.floor(index/columns);
    const minX=startX+column*stride-100,minZ=startZ+row*stride-100;
    const names=areas.filter(area=>area.x+area.width/2>minX&&area.x-area.width/2<minX+span&&area.z+area.depth/2>minZ&&area.z-area.depth/2<minZ+span).map(area=>area.name);
    return {id:`${letters(column)}${row+1}`,column,row,minX,minZ,span,name:names.join(' / ')||'Countryside'};
  }):[];
  function sheetAt(point:Point){
    const column=Math.max(0,Math.min(columns-1,Math.floor((point.x-startX)/stride)));
    const row=Math.max(0,Math.min(rows-1,Math.floor((point.z-startZ)/stride)));
    return sheets[row*columns+column];
  }
  const neighbour=(sheet:AtlasSheet,dx:number,dz:number)=>sheets.find(other=>other.column===sheet.column+dx&&other.row===sheet.row+dz);
  return {sheets,sheetAt,neighbour,stride};
}
