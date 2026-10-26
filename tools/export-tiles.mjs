// Original, deterministic prototype fixtures. OSM-derived Cerea geometry stays unchanged.
import fs from 'node:fs';
import path from 'node:path';
import {District,projectToSegment} from '../src/world/district.ts';
import {createSigns} from '../src/world/signs.ts';
import {createStreetPlates} from '../src/world/streetPlates.ts';
import {createScenery} from '../src/world/Scenery.ts';
const root=path.resolve(import.meta.dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'public/maps/cerea.json'),'utf8'));
data.id='cerea-outskirts';data.name='Cerea outskirts · prototype';
data.description='Real Cerea plus a FICTIONAL country test link and test hamlet. The added countryside is not a map of real roads.';
const cityIds=data.nodes.map(n=>n.id),entry=data.nodes.find(n=>n.id==='1399692873');
for(const road of data.roads)road.region='cerea';
const linkIds=[entry.id];let previous=entry;
for(let i=0;i<10;i++){
 const p={id:`test-link-${i}`,x:Math.round(entry.x+(180-entry.x)*i/9),z:-520-i*130,label:'Test Link (fictional)'};
 data.nodes.push(p);linkIds.push(p.id);data.roads.push({a:previous.id,b:p.id,name:'Test Link (fictional)',width:7,roadClass:'tertiary',region:'countryside'});previous=p;
}
const hamletIds=[previous.id];
for(const [id,x,z,label] of [['test-square',180,-1800,'Test Hamlet square'],['test-east',280,-1800,'Orchard Row east'],['test-west',80,-1800,'Orchard Row west']]){
 data.nodes.push({id,x,z,label});hamletIds.push(id);
}
for(const [a,b] of [[previous.id,'test-square'],['test-square','test-east'],['test-square','test-west']])data.roads.push({a,b,name:a==='test-square'?'Orchard Row (fictional)':'Test Lane (fictional)',width:7,roadClass:'residential',region:'test-hamlet'});
for(let i=0;i<16;i++){
 const x=100+(i%4)*50,z=-1850-Math.floor(i/4)*25;
 data.buildings.push({x,z,width:14,depth:12,height:5+(i%3),color:0xc8b08a,points:[{x:x-7,z:z-6},{x:x+7,z:z-6},{x:x+7,z:z+6},{x:x-7,z:z+6}]});
}
const bay={id:'test-hamlet',name:'Test Hamlet stop',x:198,z:-1775,width:12,depth:12};data.parkingZones.push(bay);
data.landmarks.push({id:'test-hamlet',name:'Test Hamlet (fictional)',road:'Test Lane (fictional)',kind:'prototype',...data.buildings.find(b=>b.x===200&&b.z===-1850)});
data.taxi.stops.push({id:bay.id,name:'Test Hamlet (fictional)',road:'Test Lane (fictional)',bayId:bay.id,nodeId:'test-square',description:'Stop at the fictional test terminus.'});
data.taxi.fares=[{passenger:'Test traveller',pickupId:'municipio',destinationId:bay.id},{passenger:'Return traveller',pickupId:bay.id,destinationId:'municipio'},...data.taxi.fares];
data.mission.hint='Prototype journey: collect the test traveller at Sosta Municipio, then follow signs north via Via Oberdan and the fictional Test Link to Test Hamlet. Added countryside is fictional.';
data.bounds.minZ=-1980;
data.areas.push({name:'Fictional test countryside',x:0,z:-1100,width:1000,depth:1100},{name:'Test Hamlet (fictional)',x:180,z:-1820,width:400,depth:340});
data.provenance.notes.push('The C prototype adds an explicitly fictional Test Link and Test Hamlet outside the real Cerea subset; this extension is not sourced from OSM.');
const provenance={source:'OpenStreetMap Cerea subset plus original fictional prototype extension',licence:'OSM-derived database content: ODbL-1.0; no separate licence assigned to original game content',osmTimestamp:data.provenance.osmTimestamp,synthetic:'All Test Link/Test Hamlet geometry, buildings and stops north of the source subset are fictional. No claim about real countryside roads.'};
const context=new District(structuredClone(data)),plates=createStreetPlates(context).planStreetPlates();
if(plates.missing.length)throw new Error(`Missing prototype street plates: ${JSON.stringify(plates.missing)}`);
const signs=createSigns(context);
const boards=[...signs.planJunctionSigns().signs.map(p=>({...p,color:'#31594e'})),...signs.planParkingSigns().map(p=>({...p,rows:['P',p.label],color:'#31594e'})),...signs.planEdgeSigns().map(p=>({...p,rows:[context.nearestRoad(p.position).edge.region==='cerea'?'END OF MAPPED ROAD':'DEAD END','TURN BACK'],color:'#755e46'}))];
const noEntry=signs.planVittoriaNoEntrySign();if(noEntry)boards.push({...noEntry,rows:['SENSO VIETATO','V.LE VITTORIA'],color:'#943f37'});
boards.push({position:{x:entry.x+10,z:entry.z-25},angle:0,rows:['TEST HAMLET','FICTIONAL LINK · NORTH'],width:4,height:3,color:'#755e46'}, {position:{x:previous.x+12,z:previous.z+12},angle:0,rows:['TEST HAMLET','FICTIONAL PROTOTYPE'],width:4,height:3,color:'#755e46'}, {position:{x:entry.x-10,z:entry.z-25},angle:Math.PI,rows:['CEREA CENTRO','REAL MAP SUBSET'],width:4,height:3,color:'#31594e'});
// Facade plaques retain the same frontage selection as the unstreamed renderer.
for(const place of data.landmarks){
 const outline=place.points??[{x:place.x-place.width/2,z:place.z-place.depth/2},{x:place.x+place.width/2,z:place.z-place.depth/2},{x:place.x+place.width/2,z:place.z+place.depth/2},{x:place.x-place.width/2,z:place.z+place.depth/2}];
 const walls=outline.map((a,i)=>{const b=outline[(i+1)%outline.length],mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};const nearest=data.roads.filter(r=>r.name===place.road).map(r=>projectToSegment(mid,context.nodeById(r.a),context.nodeById(r.b))).sort((a,b)=>Math.hypot(a.x-mid.x,a.z-mid.z)-Math.hypot(b.x-mid.x,b.z-mid.z))[0];return {a,b,mid,nearest,length:Math.hypot(b.x-a.x,b.z-a.z)};}).filter(w=>w.length>7&&w.nearest).sort((a,b)=>Math.hypot(a.nearest.x-a.mid.x,a.nearest.z-a.mid.z)-Math.hypot(b.nearest.x-b.mid.x,b.nearest.z-b.mid.z));
 const wall=walls[0];if(!wall)continue;let nx=-(wall.b.z-wall.a.z)/wall.length,nz=(wall.b.x-wall.a.x)/wall.length;if(nx*(wall.nearest.x-wall.mid.x)+nz*(wall.nearest.z-wall.mid.z)<0){nx=-nx;nz=-nz;}
 boards.push({position:{x:wall.mid.x+nx*.12,z:wall.mid.z+nz*.12},angle:Math.atan2(-(wall.b.z-wall.a.z),wall.b.x-wall.a.x),rows:place.id==='test-hamlet'?['TEST HAMLET','FICTIONAL PROTOTYPE']:place.kind==='church'?['SAN ZENO']:place.kind==='civic'?['MUNICIPIO']:place.kind==='library'?['BIBLIOTECA','DI CEREA']:place.kind==='school'?['SCUOLA','OLGA VISENTINI']:place.kind==='post'?['POSTE']:place.kind==='oratory'?['ORATORIO','DELLO SPASIMO']:[place.name.toUpperCase()],width:Math.min(6.5,wall.length-1),height:Math.min((place.height??9)*.5,4.5),color:'#31594e',mounted:true});
}
const props=createScenery(context).planProps([...plates.plates,...boards]);
const size=250,tiles=new Map();
const tile=(p)=>{const x=Math.floor(p.x/size),z=Math.floor(p.z/size),id=`${x}_${z}`;if(!tiles.has(id))tiles.set(id,{version:1,id,provenance,buildings:[],roads:[],features:[],landmarks:[],bays:[],plates:[],boards:[],props:[]});return tiles.get(id);};
// Ground-only cells are included, making coverage/readiness independent of content.
for(let x=Math.floor(data.bounds.minX/size);x<=Math.floor(data.bounds.maxX/size);x++)for(let z=Math.floor(data.bounds.minZ/size);z<=Math.floor(data.bounds.maxZ/size);z++)tile({x:x*size,z:z*size});
let maxRadius=0;const nodeMap=new Map(data.nodes.map(n=>[n.id,n]));
for(const b of data.buildings){tile(b).buildings.push(b);maxRadius=Math.max(maxRadius,Math.hypot(b.width,b.depth)/2);}
data.roads.forEach((r,i)=>{const a=nodeMap.get(r.a),b=nodeMap.get(r.b);tile({x:(a.x+b.x)/2,z:(a.z+b.z)/2}).roads.push(i);maxRadius=Math.max(maxRadius,Math.hypot(a.x-b.x,a.z-b.z)/2+8);});
// Split source feature polylines into short pieces before assigning owner tiles.
data.features=data.features.flatMap(f=>f.points.slice(1).flatMap((b,i)=>{const a=f.points[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/100));return Array.from({length:n},(_,j)=>({...f,points:[{x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n},{x:a.x+(b.x-a.x)*(j+1)/n,z:a.z+(b.z-a.z)*(j+1)/n}]}));}));
data.features.forEach((f,i)=>tile({x:(f.points[0].x+f.points[1].x)/2,z:(f.points[0].z+f.points[1].z)/2}).features.push(i));
data.landmarks.forEach((p,i)=>tile(p).landmarks.push(i));data.parkingZones.forEach((p,i)=>tile(p).bays.push(i));
for(const p of plates.plates)tile(p.position).plates.push(p);for(const p of boards)tile(p.position).boards.push(p);for(const p of props)tile(p).props.push(p);
const output=path.join(root,'public/maps/cerea-outskirts');fs.mkdirSync(path.join(output,'tiles'),{recursive:true});
const refs=[];
for(const payload of [...tiles.values()].sort((a,b)=>a.id.localeCompare(b.id))){
 const [x,z]=payload.id.split('_').map(Number),text=JSON.stringify(payload)+'\n';const file=`tiles/${payload.id}.json`;fs.writeFileSync(path.join(output,file),text);refs.push({id:payload.id,file,bytes:Buffer.byteLength(text),bounds:{minX:x*size,maxX:(x+1)*size,minZ:z*size,maxZ:(z+1)*size}});
}
data.streaming={version:1,tileSize:size,fogDistance:300,loadRadius:Math.ceil(350+maxRadius),retainRadius:Math.ceil(500+maxRadius),tiles:refs,regions:[{id:'cerea',name:'Cerea Centro',nodeIds:cityIds},{id:'countryside',name:'Test Link (fictional)',nodeIds:linkIds},{id:'test-hamlet',name:'Test Hamlet (fictional)',nodeIds:hamletIds}],portals:[{from:'cerea',to:'countryside',nodeId:entry.id},{from:'countryside',to:'test-hamlet',nodeId:previous.id}],provenance};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(data)+'\n');
console.log(JSON.stringify({tiles:refs.length,bytes:refs.reduce((s,r)=>s+r.bytes,0),loadRadius:data.streaming.loadRadius,nodes:data.nodes.length,roads:data.roads.length}));
