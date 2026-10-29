/** Town doctor (#24): the checks every listed district must pass, shared by the tests and
 * `npm run town:check -- <id>`. Each check returns its problems; an empty list passes. */
import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import clipping,{type Polygon} from 'polygon-clipping';
import {District,inRect,roadWidth} from '../src/world/district';
import {SpatialGrid,rectBounds,type Box} from '../src/world/SpatialGrid';
import {streamingColliders} from '../src/world/streaming/colliders';
import {createNavigation} from '../src/navigation/Navigation';
import {createStreetPlates} from '../src/world/streetPlates';
import type {Point,Rect} from '../src/world/schema';
import type {TownEntry} from '../src/world/load';

export interface CheckResult {id:string;title:string;problems:string[];notes:string[]}
/** The car's collision margin, as in the driving model and the region builder. */
export const CAR_MARGIN=1.05;
/** One street-name texture: a 1024×192 RGBA canvas with mipmaps. */
export const PLATE_TEXTURE_BYTES=1024*192*4*4/3;

/**
 * Budgets from the region spike (docs/REGION_SPIKE.md): a single-file district handled about
 * 1.5 MB, 3,200 building masses, 1,800 road segments and 130 street names (Legnago). A tiled
 * district keeps all collision resident in its manifest, and its tiles stream; what is resident
 * at once is the manifest plus the tiles and street-name textures within the retain radius.
 */
export const BUDGETS={
 single:{bytes:1_600_000,buildings:3_500,roads:2_000,plateMiB:150},
 tiled:{manifestBytes:6_000_000,buildings:12_000,roads:9_000,tileBytes:250_000,residentPlateMiB:150},
};

const cap=(list:string[],limit=12)=>list.length>limit?[...list.slice(0,limit),`… and ${list.length-limit} more`]:list;
const result=(id:string,title:string,problems:string[],notes:string[]=[]):CheckResult=>({id,title,problems:cap(problems),notes});

/** One connected road network: every node reaches every other, ignoring one-way tags. */
export function checkNetwork(context:District):CheckResult{
 const parent=new Map(context.nodes.map(n=>[n.id,n.id]));
 const find=(id:string):string=>{let root=id;while(parent.get(root)!==root)root=parent.get(root)!;parent.set(id,root);return root;};
 for(const road of context.roads)parent.set(find(road.a),find(road.b));
 const groups=new Map<string,string[]>();
 for(const node of context.nodes){const root=find(node.id);groups.set(root,[...(groups.get(root)??[]),node.id]);}
 const pieces=[...groups.values()].sort((a,b)=>b.length-a.length);
 const problems=pieces.slice(1).map(ids=>{const names=[...new Set(context.roads.filter(r=>ids.includes(r.a)).map(r=>r.name))].slice(0,3);return `${ids.length} node(s) cut off from the network (${names.join(', ')||ids[0]})`;});
 return result('network','One connected road network',problems,[`${context.nodes.length} nodes, ${context.roads.length} road segments`]);
}

/** Every stop has its bay and every directed stop pair is reachable, one-way tags respected. */
export function checkStops(context:District):CheckResult{
 const taxi=context.district.taxi;
 if(!taxi)return result('stops','Stops reachable both ways',[],['no taxi shift']);
 const nav=createNavigation(context),problems:string[]=[];
 for(const stop of taxi.stops){
  if(!context.parkingZones.some(b=>b.id===stop.bayId))problems.push(`${stop.id}: bay ${stop.bayId} is missing`);
  if(!context.nodeMap.has(stop.nodeId))problems.push(`${stop.id}: node ${stop.nodeId} is missing`);
 }
 if(!problems.length)for(const a of taxi.stops)for(const b of taxi.stops)
  if(a!==b&&!Number.isFinite(nav.shortestRoute(a.nodeId,b.nodeId).cost))problems.push(`${a.id} → ${b.id} is unreachable`);
 return result('stops','Stops reachable both ways',problems,[`${taxi.stops.length} stops, ${taxi.stops.length*(taxi.stops.length-1)} directed pairs`]);
}

const colliderGrid=(context:District)=>new SpatialGrid(streamingColliders(context),rectBounds);
const blockedAt=(grid:SpatialGrid<Rect>,p:Point,margin:number)=>grid.at(p,margin).find(r=>inRect(p,r,-margin));
const label=(rect:Rect&{osmId?:number})=>rect.osmId?`building ${rect.osmId}`:'water';

/** Search, on a half-metre grid around the bay, for a path the car's margin fits through from
 * the centreline of the stop's road to the bay's centre. Off-road ground is drivable. */
export function reachesBay(context:District,grid:SpatialGrid<Rect>,bay:Rect,roadName:string,reach=40,cell=.5):boolean{
 const minX=bay.x-reach,minZ=bay.z-reach,size=Math.ceil(2*reach/cell)+1,at=(i:number,j:number)=>({x:minX+i*cell,z:minZ+j*cell});
 const free=new Map<number,boolean>(),open=(i:number,j:number)=>{const key=i*size+j;let value=free.get(key);if(value===undefined){value=!blockedAt(grid,at(i,j),CAR_MARGIN);free.set(key,value);}return value;};
 const queue:number[]=[],seen=new Set<number>();
 for(const road of context.roads.filter(r=>r.name===roadName)){
  const a=context.nodeById(road.a),b=context.nodeById(road.b),steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/cell);
  for(let k=0;k<=steps;k++){const i=Math.round((a.x+(b.x-a.x)*k/steps-minX)/cell),j=Math.round((a.z+(b.z-a.z)*k/steps-minZ)/cell);
   if(i>=0&&j>=0&&i<size&&j<size&&!seen.has(i*size+j)&&open(i,j)){seen.add(i*size+j);queue.push(i*size+j);}}
 }
 const goal=Math.round(reach/cell)*size+Math.round(reach/cell);
 while(queue.length){
  const key=queue.shift()!;if(key===goal)return true;
  const i=Math.floor(key/size),j=key%size;
  for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){const ni=i+di,nj=j+dj,next=ni*size+nj;
   if(ni>=0&&nj>=0&&ni<size&&nj<size&&!seen.has(next)&&open(ni,nj)){seen.add(next);queue.push(next);}}
 }
 return false;
}

/** Every stop's bay is free of buildings and water, and the car can reach it from its road. */
export function checkBays(context:District):CheckResult{
 const stops=context.district.taxi?.stops??[];
 if(!stops.length)return result('bays','An accessible bay per stop',[],['no stops']);
 const grid=colliderGrid(context),problems:string[]=[];
 for(const stop of stops){
  const bay=context.parkingZones.find(b=>b.id===stop.bayId);if(!bay)continue;
  const samples=[-.5,0,.5].flatMap(u=>[-.5,0,.5].map(v=>({x:bay.x+u*bay.width,z:bay.z+v*bay.depth})));
  const covered=samples.map(p=>blockedAt(grid,p,0)).find(Boolean);
  if(covered){problems.push(`${stop.id}: bay ${bay.id} is covered by ${label(covered)}`);continue;}
  if(!context.roads.some(r=>r.name===stop.road)){problems.push(`${stop.id}: no road named ${stop.road}`);continue;}
  if(!reachesBay(context,grid,bay,stop.road))problems.push(`${stop.id}: the car cannot get from ${stop.road} into bay ${bay.id}`);
 }
 return result('bays','An accessible bay per stop',problems,[`${stops.length} bays`]);
}

/** No building covers a road's paved width, its junction caps or a stopping bay. */
export function checkClearance(context:District):CheckResult{
 const pieces:{polygon:Polygon;box:Box;what:string}[]=[];
 const add=(ring:[number,number][],what:string)=>{
  const snapped=ring.map(([x,z])=>[Math.round(x*1e6)/1e6,Math.round(z*1e6)/1e6] as [number,number]);
  pieces.push({polygon:[snapped],what,box:{minX:Math.min(...snapped.map(p=>p[0])),maxX:Math.max(...snapped.map(p=>p[0])),minZ:Math.min(...snapped.map(p=>p[1])),maxZ:Math.max(...snapped.map(p=>p[1]))}});
 };
 for(const road of context.roads){
  const a=context.nodeById(road.a),b=context.nodeById(road.b),length=Math.hypot(b.x-a.x,b.z-a.z),r=roadWidth(road)/2;
  if(!length)continue;
  const nx=-(b.z-a.z)/length*r,nz=(b.x-a.x)/length*r;
  add([[a.x+nx,a.z+nz],[b.x+nx,b.z+nz],[b.x-nx,b.z-nz],[a.x-nx,a.z-nz]],road.name);
  for(const p of [a,b])add(Array.from({length:12},(_,i)=>[p.x+Math.cos(i*Math.PI/6)*r,p.z+Math.sin(i*Math.PI/6)*r] as [number,number]),road.name);
 }
 for(const bay of context.parkingZones)add([[bay.x-bay.width/2,bay.z-bay.depth/2],[bay.x+bay.width/2,bay.z-bay.depth/2],[bay.x+bay.width/2,bay.z+bay.depth/2],[bay.x-bay.width/2,bay.z+bay.depth/2]],`bay ${bay.id}`);
 const grid=new SpatialGrid(pieces,p=>p.box,50),problems:string[]=[];
 const area=(ring:number[][])=>Math.abs(ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2);
 for(const building of context.district.buildings){
  const geometry:Polygon=building.points?[building.points,...(building.holes??[])].map(ring=>ring.map(p=>[p.x,p.z] as [number,number])):[[[building.x-building.width/2,building.z-building.depth/2],[building.x+building.width/2,building.z-building.depth/2],[building.x+building.width/2,building.z+building.depth/2],[building.x-building.width/2,building.z+building.depth/2]]];
  for(const piece of grid.query(rectBounds(building))){
   const overlap=clipping.intersection(geometry,piece.polygon).reduce((sum,polygon)=>sum+area(polygon[0]),0);
   if(overlap>=1e-4){problems.push(`building ${building.osmId??`at ${building.x},${building.z}`} covers ${overlap.toFixed(2)} m² of ${piece.what}`);break;}
  }
 }
 return result('clearance','Buildings clear roads and bays',problems,[`${context.district.buildings.length} buildings`]);
}

/** The car can follow every road centreline without touching a building or water (#70: a shortened
 * corridor once ran into a village building while still on paved road). */
export function checkDrivable(context:District,step=1):CheckResult{
 const grid=colliderGrid(context),problems:string[]=[];let samples=0;
 for(const road of context.roads){
  const a=context.nodeById(road.a),b=context.nodeById(road.b),steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/step));
  for(let i=0;i<=steps;i++){const p={x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps};samples++;
   const hit=blockedAt(grid,p,CAR_MARGIN);if(hit){problems.push(`${road.name} ${road.a}–${road.b} is blocked by ${label(hit)} near ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);break;}}
 }
 return result('drivable','Every road drivable by the car\'s margin',problems,[`${samples} centreline samples every ${step} m`]);
}

/** Every street-name plate names, faces and stands clear of its own street. Unplaced arms are listed, not failed. */
export function checkPlates(context:District,plan?:ReturnType<ReturnType<typeof createStreetPlates>['planStreetPlates']>):CheckResult{
 const {planStreetPlates,plateIsClear,plateIsVisible,plateStreetRoad}=createStreetPlates(context);
 const {plates,missing}=plan??planStreetPlates(),problems:string[]=[];
 for(const plate of plates){
  const owner=plateStreetRoad(plate)?.name;
  if(owner!==plate.name)problems.push(`a ${plate.name} plate near ${plate.position.x.toFixed(1)}, ${plate.position.z.toFixed(1)} stands on ${owner??'no street'}`);
  else if(!plateIsClear(plate)||!plateIsVisible(plate))problems.push(`a ${plate.name} plate near ${plate.position.x.toFixed(1)}, ${plate.position.z.toFixed(1)} is blocked or hidden`);
 }
 return result('plates','Street plates name their own street',problems,[`${plates.length} plates, ${new Set(plates.map(p=>p.name)).size} street names`,...(missing.length?[`${missing.length} junction arm(s) without a plate: ${cap(missing.map(m=>`${m.streetName} at ${m.junctionId}`),5).join('; ')}`]:[])]);
}

export interface SizeReport {
 delivery:'single'|'tiled';bytes:number;buildings:number;roads:number;streetNames:number;
 tiles?:number;largestTile?:{id:string;bytes:number};plateNames?:number;residentPlateNames?:number;plateMiB:number;
}

/** Measure a listed map's files: one district file, or a manifest and its tiles. */
export function measureSize(mapFile:string,context:District):SizeReport{
 const base={bytes:statSync(mapFile).size,buildings:context.district.buildings.length,roads:context.roads.length,streetNames:new Set(context.roads.map(r=>r.name)).size};
 const streaming=context.district.streaming;
 // A single file shows all its plates at once: one texture per street name that has a plate.
 if(!streaming){const plated=new Set(createStreetPlates(context).planStreetPlates().plates.map(p=>p.name)).size;return {delivery:'single',...base,plateNames:plated,plateMiB:plated*PLATE_TEXTURE_BYTES/2**20};}
 // Street-name textures are freed when no resident tile uses them, so the peak is the most
 // distinct names among the tiles kept around any one place (sampled at every tile centre).
 const dir=path.dirname(mapFile),names=new Map<string,Set<string>>();let largest={id:'',bytes:0};
 for(const tile of streaming.tiles){
  if(tile.bytes>largest.bytes)largest={id:tile.id,bytes:tile.bytes};
  const payload=JSON.parse(readFileSync(path.join(dir,tile.file),'utf8')) as {plates:{name:string}[]};
  names.set(tile.id,new Set(payload.plates.map(p=>p.name)));
 }
 const centre=(b:{minX:number;maxX:number;minZ:number;maxZ:number})=>({x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2});
 const tileGrid=new SpatialGrid(streaming.tiles,t=>t.bounds,streaming.tileSize);let resident=0;
 for(const tile of streaming.tiles){
  const c=centre(tile.bounds),seen=new Set<string>();
  for(const other of tileGrid.at(c,streaming.retainRadius))if(Math.hypot(Math.max(other.bounds.minX-c.x,0,c.x-other.bounds.maxX),Math.max(other.bounds.minZ-c.z,0,c.z-other.bounds.maxZ))<=streaming.retainRadius)for(const name of names.get(other.id)!)seen.add(name);
  resident=Math.max(resident,seen.size);
 }
 return {delivery:'tiled',...base,tiles:streaming.tiles.length,largestTile:largest,residentPlateNames:resident,plateMiB:resident*PLATE_TEXTURE_BYTES/2**20};
}

export function checkSize(size:SizeReport):CheckResult{
 const problems:string[]=[],over=(what:string,value:number,limit:number,unit='')=>{if(value>limit)problems.push(`${what} ${Math.round(value).toLocaleString('en')}${unit} is over the budget of ${limit.toLocaleString('en')}${unit}`);};
 if(size.delivery==='single'){
  const b=BUDGETS.single;
  over('the district file',size.bytes,b.bytes,' bytes');over('buildings',size.buildings,b.buildings);over('road segments',size.roads,b.roads);over('street-name textures',size.plateMiB,b.plateMiB,' MiB');
 }else{
  const b=BUDGETS.tiled;
  over('the manifest',size.bytes,b.manifestBytes,' bytes');over('buildings',size.buildings,b.buildings);over('road segments',size.roads,b.roads);
  over(`the largest tile (${size.largestTile!.id})`,size.largestTile!.bytes,b.tileBytes,' bytes');over('resident street-name textures',size.plateMiB,b.residentPlateMiB,' MiB');
 }
 const notes=[`${size.delivery}: ${(size.bytes/1e6).toFixed(2)} MB, ${size.buildings} buildings, ${size.roads} road segments, ${size.streetNames} street names`];
 if(size.delivery==='tiled')notes.push(`${size.tiles} tiles, largest ${size.largestTile!.id} at ${(size.largestTile!.bytes/1e3).toFixed(0)} kB; at most ${size.residentPlateNames} street names resident`);
 notes.push(`street-name textures about ${size.plateMiB.toFixed(0)} MiB at most`);
 return result('size','Size within budget',problems,notes);
}

export const CHECKS=[checkNetwork,checkStops,checkBays,checkClearance,checkDrivable,checkPlates] as const;

/** Run every check on one listed district. */
export function checkTown(entry:Pick<TownEntry,'id'|'map'>,mapsDir='public/maps'):CheckResult[]{
 const file=path.join(mapsDir,entry.map),data=JSON.parse(readFileSync(file,'utf8'));
 const context=new District(data);
 return [...CHECKS.map(check=>check(context)),checkSize(measureSize(file,context))];
}
