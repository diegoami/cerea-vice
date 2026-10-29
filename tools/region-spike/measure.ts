import {readFileSync,statSync} from 'node:fs';
import {District,inRect} from '../../src/world/district';
import {createNavigation} from '../../src/navigation/Navigation';
for(const [id,file] of process.argv.slice(2).map(a=>a.split('='))){
 const data=JSON.parse(readFileSync(file,'utf8'));let t=performance.now();const context=new District(data);const build=performance.now()-t;
 const nav=createNavigation(context),stops=data.taxi.stops;let pairs=0,unreachable:string[]=[];t=performance.now();
 for(const a of stops)for(const b of stops)if(a!==b){pairs++;if(!Number.isFinite(nav.shortestRoute(a.nodeId,b.nodeId).cost))unreachable.push(`${a.id}->${b.id}`);}
 const routeMs=performance.now()-t;
 const classes:Record<string,number>={};for(const r of data.roads)classes[r.roadClass]=(classes[r.roadClass]??0)+1;
 const nonCar=[...new Set(data.roads.filter((r:any)=>['pedestrian','footway','cycleway','path','steps','track','service','living_street'].includes(r.roadClass)).map((r:any)=>`${r.name} (${r.roadClass})`))];
 // Façade gap per segment: rays from the midpoint to the nearest original footprint, both sides.
 const nodes=new Map(data.nodes.map((n:any)=>[n.id,n]));const gaps:number[]=[];
 for(const r of data.roads){const a:any=nodes.get(r.a),b:any=nodes.get(r.b),len=Math.hypot(b.x-a.x,b.z-a.z);if(len<4)continue;
  const nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;let gap=0;
  for(const f of [0.25,0.5,0.75]){const p={x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f};let g=0;
   for(const side of [-1,1]){let d=0.25;for(;d<20;d+=0.25){const q={x:p.x+nx*side*d,z:p.z+nz*side*d};if(context.buildings.at(q,0).some(rc=>inRect(q,rc,0)))break;}g+=d;}gaps.push(g);}
 }
 gaps.sort((x,y)=>x-y);const share=(f:(g:number)=>boolean)=>(100*gaps.filter(f).length/gaps.length).toFixed(1)+'%';
 const names=new Set(data.roads.map((r:any)=>r.name)).size;
 console.log(`== ${id}: ${(statSync(file).size/1024).toFixed(0)} KB, District built in ${build.toFixed(0)} ms, ${names} street names (plates up to ~${names} MiB), ${data.buildings.length} building masses`);
 console.log(`   road classes: ${JSON.stringify(classes)}`);
 console.log(`   stops: ${stops.length}; directed pairs reachable: ${pairs-unreachable.length}/${pairs} in ${routeMs.toFixed(0)} ms${unreachable.length?' — unreachable: '+unreachable.join(', '):''}`);
 console.log(`   named non-car ways made drivable (${nonCar.length}): ${nonCar.join(', ')}`);
 console.log(`   façade-to-façade gap (after today's clipping, 3 samples per segment, capped 40 m): median ${gaps[gaps.length>>1].toFixed(1)} m; under 11.2 m (fixed 8 m road + verges would cut): ${share(g=>g<11.2)}; under 2.8 m: ${share(g=>g<2.8)}; under 2.1 m: ${share(g=>g<2.1)}`);
}
