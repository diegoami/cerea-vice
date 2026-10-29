// Stream a large district: split a merged district into 250 m owner tiles plus a manifest that keeps the
// logical geometry (collision, routing, atlas). Used for regions built by tools/build-region.py.
//   node --import tsx tools/tile-district.mjs <district.json> <output dir> [<tiling sidecar.json>]
// The sidecar (written by build-region.py) gives town zones, for town or countryside ground, and the
// direction boards between towns. tools/export-tiles.mjs remains the outskirts prototype's own exporter.
import fs from 'node:fs';
import path from 'node:path';
import clipping from 'polygon-clipping';
import {District,projectToSegment} from '../src/world/district.ts';
import {createSigns} from '../src/world/signs.ts';
import {createStreetPlates} from '../src/world/streetPlates.ts';
import {createScenery} from '../src/world/Scenery.ts';

const [input,outputDir,sidecarFile]=process.argv.slice(2);
if(!input||!outputDir){console.error('usage: node --import tsx tools/tile-district.mjs <district.json> <output dir> [<sidecar.json>]');process.exit(2);}
const data=JSON.parse(fs.readFileSync(input,'utf8'));
// Without a sidecar the district is one town: town ground everywhere and no boards between towns.
const sidecar=sidecarFile?JSON.parse(fs.readFileSync(sidecarFile,'utf8')):{zones:[{minX:data.bounds.minX-250,maxX:data.bounds.maxX+250,minZ:data.bounds.minZ-250,maxZ:data.bounds.maxZ+250}],boards:[],synthetic:'Real streets and squares at real scale. Stopping bays, signs and props are game placements.'};
const size=250;
// One routing region: the whole district is a single graph (no portals), which validation accepts as a tree.
for(const road of data.roads)road.region='region';
const provenance={source:data.provenance?.source??'OpenStreetMap',licence:'OSM-derived database content: ODbL-1.0; no separate licence assigned to original game content',osmTimestamp:data.provenance?.osmTimestamp??'',synthetic:sidecar.synthetic??'Towns are real at real scale; the real main roads between them are shortened (corridor compression). Stopping bays, signs and props are game placements.'};
const regionStub={version:1,tileSize:size,fogDistance:300,loadRadius:1000,retainRadius:1200,tiles:[],regions:[{id:'region',name:data.name,nodeIds:data.nodes.map(n=>n.id)}],portals:[],provenance};
// Plans need a District; validate without the tiles first.
const plain=structuredClone(data);delete plain.streaming;
const context=new District(plain),plates=createStreetPlates(context).planStreetPlates();
if(plates.missing.length)console.warn(`Street plates without a place: ${plates.missing.length} (first: ${JSON.stringify(plates.missing[0])})`);
const signs=createSigns(context);
const boards=[...signs.planJunctionSigns().signs.map(p=>({...p,color:'#31594e'})),...signs.planParkingSigns().map(p=>({...p,rows:['P',p.label],color:'#31594e'})),
 ...signs.planEdgeSigns().map(p=>({...p,rows:['END OF MAPPED ROAD','TURN BACK'],color:'#755e46'})),...(sidecar.boards??[])];
// Facade plaques: the same frontage selection as the outskirts exporter, with the place name.
for(const place of data.landmarks){
 const outline=place.points??[{x:place.x-place.width/2,z:place.z-place.depth/2},{x:place.x+place.width/2,z:place.z-place.depth/2},{x:place.x+place.width/2,z:place.z+place.depth/2},{x:place.x-place.width/2,z:place.z+place.depth/2}];
 const walls=outline.map((a,i)=>{const b=outline[(i+1)%outline.length],mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};const nearest=data.roads.filter(r=>r.name===place.road).map(r=>projectToSegment(mid,context.nodeById(r.a),context.nodeById(r.b))).sort((p,q)=>Math.hypot(p.x-mid.x,p.z-mid.z)-Math.hypot(q.x-mid.x,q.z-mid.z))[0];return {a,b,mid,nearest,length:Math.hypot(b.x-a.x,b.z-a.z)};}).filter(w=>w.length>7&&w.nearest).sort((p,q)=>Math.hypot(p.nearest.x-p.mid.x,p.nearest.z-p.mid.z)-Math.hypot(q.nearest.x-q.mid.x,q.nearest.z-q.mid.z));
 const wall=walls[0];if(!wall)continue;let nx=-(wall.b.z-wall.a.z)/wall.length,nz=(wall.b.x-wall.a.x)/wall.length;if(nx*(wall.nearest.x-wall.mid.x)+nz*(wall.nearest.z-wall.mid.z)<0){nx=-nx;nz=-nz;}
 const words=place.name.toUpperCase().split(' '),rows=[];for(const w of words){if(rows.length&&(rows.at(-1)+' '+w).length<=18)rows[rows.length-1]+=' '+w;else rows.push(w);}
 boards.push({position:{x:wall.mid.x+nx*.12,z:wall.mid.z+nz*.12},angle:Math.atan2(-(wall.b.z-wall.a.z),wall.b.x-wall.a.x),rows:rows.slice(0,3),width:3.4,height:1.4,color:'#755e46',mounted:true});
}
const props=createScenery(context).planProps([...plates.plates,...boards]);
const tiles=new Map();
const inTown=(x,z)=>(sidecar.zones??[]).some(zone=>x>=zone.minX&&x<=zone.maxX&&z>=zone.minZ&&z<=zone.maxZ);
const tile=(p)=>{const x=Math.floor(p.x/size),z=Math.floor(p.z/size),id=`${x}_${z}`;if(!tiles.has(id))tiles.set(id,{version:1,id,provenance,ground:inTown((x+.5)*size,(z+.5)*size)?'town':'rural',buildings:[],roads:[],features:[],landmarks:[],bays:[],plates:[],boards:[],props:[],water:[]});return tiles.get(id);};
for(let x=Math.floor(data.bounds.minX/size);x<=Math.floor(data.bounds.maxX/size);x++)for(let z=Math.floor(data.bounds.minZ/size);z<=Math.floor(data.bounds.maxZ/size);z++)tile({x:x*size,z:z*size});
let maxRadius=0;const nodeMap=new Map(data.nodes.map(n=>[n.id,n]));
for(const b of data.buildings){tile(b).buildings.push(b);maxRadius=Math.max(maxRadius,Math.hypot(b.width,b.depth)/2);}
data.roads.forEach((r,i)=>{const a=nodeMap.get(r.a),b=nodeMap.get(r.b);tile({x:(a.x+b.x)/2,z:(a.z+b.z)/2}).roads.push(i);maxRadius=Math.max(maxRadius,Math.hypot(a.x-b.x,a.z-b.z)/2+8);});
data.features=data.features.flatMap(f=>f.points.slice(1).flatMap((b,i)=>{const a=f.points[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/100));return Array.from({length:n},(_,j)=>({...f,points:[{x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n},{x:a.x+(b.x-a.x)*(j+1)/n,z:a.z+(b.z-a.z)*(j+1)/n}]}));}));
data.features.forEach((f,i)=>tile({x:(f.points[0].x+f.points[1].x)/2,z:(f.points[0].z+f.points[1].z)/2}).features.push(i));
data.landmarks.forEach((p,i)=>tile(p).landmarks.push(i));data.parkingZones.forEach((p,i)=>tile(p).bays.push(i));
for(const p of plates.plates)tile(p.position).plates.push(p);for(const p of boards)tile(p.position).boards.push(p);for(const p of props)tile(p).props.push(p);
// Water and squares: each tile draws its own clipped piece; collision keeps the resident whole-area water shapes.
const ring=points=>[...points.map(p=>[p.x,p.z]),[points[0].x,points[0].z]],back=r=>r.slice(0,-1).map(([x,z])=>({x,z}));
for(const [list,key] of [[data.waterAreas??[],'water'],[data.pavedAreas??[],'paved']])for(const area of list){
 const xs=area.points.map(p=>p.x),zs=area.points.map(p=>p.z);
 for(let x=Math.floor(Math.min(...xs)/size);x<=Math.floor(Math.max(...xs)/size);x++)for(let z=Math.floor(Math.min(...zs)/size);z<=Math.floor(Math.max(...zs)/size);z++){
  const id=`${x}_${z}`;if(!tiles.has(id))continue;
  const cell=[[[x*size,z*size],[(x+1)*size,z*size],[(x+1)*size,(z+1)*size],[x*size,(z+1)*size],[x*size,z*size]]];
  for(const polygon of clipping.intersection([[ring(area.points),...(area.holes??[]).map(ring)]],cell))(tiles.get(id)[key]??=[]).push({points:back(polygon[0]),...(polygon.length>1?{holes:polygon.slice(1).map(back)}:{})});
 }
}
// Replace only this tool's own output (the tiles folder; manifest.json is overwritten below), never
// anything else in the folder (#81).
fs.rmSync(path.join(outputDir,'tiles'),{recursive:true,force:true});fs.mkdirSync(path.join(outputDir,'tiles'),{recursive:true});
const refs=[];
for(const payload of [...tiles.values()].sort((a,b)=>a.id.localeCompare(b.id))){
 if(!payload.water.length)delete payload.water;
 if(payload.paved&&!payload.paved.length)delete payload.paved;
 const [x,z]=payload.id.split('_').map(Number),text=JSON.stringify(payload)+'\n';const file=`tiles/${payload.id}.json`;fs.writeFileSync(path.join(outputDir,file),text);
 refs.push({id:payload.id,file,bytes:Buffer.byteLength(text),bounds:{minX:x*size,maxX:(x+1)*size,minZ:z*size,maxZ:(z+1)*size}});
}
data.streaming={...regionStub,loadRadius:Math.ceil(350+maxRadius),retainRadius:Math.ceil(500+maxRadius),tiles:refs};
new District(data);// The manifest itself must validate.
fs.writeFileSync(path.join(outputDir,'manifest.json'),JSON.stringify(data)+'\n');
console.log(JSON.stringify({tiles:refs.length,bytes:refs.reduce((s,r)=>s+r.bytes,0),manifestBytes:fs.statSync(path.join(outputDir,'manifest.json')).size,loadRadius:data.streaming.loadRadius,nodes:data.nodes.length,roads:data.roads.length,plates:plates.plates.length,boards:boards.length,props:props.length,townTiles:[...tiles.values()].filter(t=>t.ground==='town').length}));
