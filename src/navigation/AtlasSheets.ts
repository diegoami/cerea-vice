import { type Point, District } from '../world/district';

export interface AtlasSheet { id:string; column:number; row:number; minX:number; minZ:number; span:number; name:string; overlap:number }
/** A page stays readable while it carries no more distinct street labels than the busiest page of the accepted regional atlas. */
const MAX_PAGE_LABELS=90;
/** Detail pages overlap their neighbours so streets near an edge still sit fully on a page. */
const EDGE_OVERLAP=100;
/** Adaptive ladders: 3×3, 4×4 and 5×5 pages bound a dense town's book at 25 sheets. */
const PART_LADDER=[3,4,5];

function clippedStreetCount(context:District,minX:number,minZ:number,span:number){
  const names=new Set<string>();
  for(const road of context.roads){
    const a=context.nodeById(road.a),b=context.nodeById(road.b);
    const dx=b.x-a.x,dz=b.z-a.z;let start=0,end=1;
    for(const [p,q] of [[-dx,a.x-minX],[dx,minX+span-a.x],[-dz,a.z-minZ],[dz,minZ+span-a.z]]){
      if(p===0){if(q<0){end=-1;break;}}else if(p<0)start=Math.max(start,q/p);else end=Math.min(end,q/p);
    }
    if(start<end&&road.name)names.add(road.name);
  }
  return names.size;
}
/** Split [min,max] into parts of similar road-length mass, so dense areas get smaller pages. */
function densityCuts(context:District,axis:'x'|'z',min:number,max:number,parts:number,margin:number){
  const bins=96,width=(max-min)/bins,mass=new Array<number>(bins).fill(0);
  for(const road of context.roads){
    const a=context.nodeById(road.a),b=context.nodeById(road.b);
    const lo=Math.min(a[axis],b[axis]),hi=Math.max(a[axis],b[axis]);
    for(let i=Math.max(0,Math.floor((lo-min)/width));i<=Math.min(bins-1,Math.floor((hi-min)/width));i++)mass[i]+=width;
  }
  const total=mass.reduce((sum,value)=>sum+value,0),cuts=[min-margin];
  let acc=0,next=total/parts;
  for(let i=0;i<bins-1&&cuts.length<parts;i++){
    acc+=mass[i];
    if(acc>=next){cuts.push(min+(i+1)*width);next+=total/parts;}
  }
  cuts.push(max);
  return cuts;
}
/** Verona-style book: unequal pages over a compact district whose single sheet would be overfull. */
function densitySheets(context:District,letters:(column:number)=>string){
  const {bounds,areas}=context.district;
  const extent=Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ);
  // A whole-district paper inside the label budget needs no detail pages (Cerea keeps its single sheet).
  if(clippedStreetCount(context,bounds.minX,bounds.minZ,extent)<=MAX_PAGE_LABELS)return {sheets:[] as AtlasSheet[],locate:null};
  let chosen:{sheets:AtlasSheet[],xs:number[],zs:number[]}|undefined;
  for(const parts of PART_LADDER){
    const xs=densityCuts(context,'x',bounds.minX,bounds.maxX,parts,EDGE_OVERLAP/2);
    const zs=densityCuts(context,'z',bounds.minZ,bounds.maxZ,parts,EDGE_OVERLAP/2);
    const sheets:AtlasSheet[]=[];
    for(let row=0;row<zs.length-1;row++)for(let column=0;column<xs.length-1;column++){
      const minX=xs[column]-EDGE_OVERLAP/2,minZ=zs[row]-EDGE_OVERLAP/2;
      const span=Math.max(xs[column+1]-xs[column],zs[row+1]-zs[row])+EDGE_OVERLAP;
      const names=areas.filter(area=>area.x+area.width/2>minX&&area.x-area.width/2<minX+span&&area.z+area.depth/2>minZ&&area.z-area.depth/2<minZ+span).map(area=>area.name);
      sheets.push({id:`${letters(column)}${row+1}`,column,row,minX,minZ,span,name:names.join(' / ')||'Countryside',overlap:EDGE_OVERLAP});
    }
    chosen={sheets,xs,zs};
    const worst=Math.max(...sheets.map(sheet=>clippedStreetCount(context,sheet.minX,sheet.minZ,sheet.span)));
    if(worst<=MAX_PAGE_LABELS)break;
  }
  const {sheets,xs,zs}=chosen!;
  const locate=(point:Point)=>{
    const find=(cuts:number[],value:number)=>{let index=0;while(index<cuts.length-2&&value>=cuts[index+1])index++;return index;};
    return sheets[find(zs,point.z)*(xs.length-1)+find(xs,point.x)];
  };
  return {sheets,locate};
}
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
    return {id:`${letters(column)}${row+1}`,column,row,minX,minZ,span,name:names.join(' / ')||'Countryside',overlap:200};
  }):[];
  const adaptive=regional?null:densitySheets(context,letters);
  const allSheets=regional?sheets:adaptive!.sheets;
  function sheetAt(point:Point){
    if(!regional)return adaptive!.locate?.(point);
    const column=Math.max(0,Math.min(columns-1,Math.floor((point.x-startX)/stride)));
    const row=Math.max(0,Math.min(rows-1,Math.floor((point.z-startZ)/stride)));
    return sheets[row*columns+column];
  }
  const neighbour=(sheet:AtlasSheet,dx:number,dz:number)=>allSheets.find(other=>other.column===sheet.column+dx&&other.row===sheet.row+dz);
  return {sheets:allSheets,sheetAt,neighbour,stride};
}
