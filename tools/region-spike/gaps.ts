import {readFileSync} from 'node:fs';
type P={x:number;z:number};
const area=(r:P[])=>Math.abs(r.reduce((s,a,i)=>{const b=r[(i+1)%r.length];return s+a.x*b.z-b.x*a.z;},0)/2);
const inside=(p:P,poly:P[])=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)c=!c;}return c;};
for(const [id,specFile,districtFile] of process.argv.slice(2).map(a=>a.split('='))){
 const spec=JSON.parse(readFileSync(specFile,'utf8')),d=JSON.parse(readFileSync(districtFile,'utf8'));
 const extract=JSON.parse(readFileSync(spec.source.extract.startsWith('/')?spec.source.extract:spec.source.extract,'utf8'));
 const {lat:lat0,lon:lon0}=spec.area.origin,k=111320*Math.cos(lat0*Math.PI/180);
 const pt=(g:any):P=>({x:Math.round((g.lon-lon0)*k*100)/100,z:Math.round(-(g.lat-lat0)*111320*100)/100});
 const b=d.bounds,within=(p:P)=>b.minX+3<=p.x&&p.x<=b.maxX-3&&b.minZ+3<=p.z&&p.z<=b.maxZ-3;
 const original=new Map<number,P[]>();
 for(const e of extract.elements){if(!e.tags?.building||!e.geometry||e.geometry.length<4)continue;const pts=e.geometry.slice(0,-1).map(pt);if(pts.every(within))original.set(e.id,pts);}
 // Grid of original footprints for the gap rays.
 const cell=20,grid=new Map<string,P[][]>();
 for(const poly of original.values()){const xs=poly.map(p=>p.x),zs=poly.map(p=>p.z);for(let gx=Math.floor(Math.min(...xs)/cell);gx<=Math.floor(Math.max(...xs)/cell);gx++)for(let gz=Math.floor(Math.min(...zs)/cell);gz<=Math.floor(Math.max(...zs)/cell);gz++){const key=gx+','+gz;(grid.get(key)??grid.set(key,[]).get(key)!).push(poly);}}
 const solid=(p:P)=>(grid.get(Math.floor(p.x/cell)+','+Math.floor(p.z/cell))??[]).some(poly=>inside(p,poly));
 const nodes=new Map(d.nodes.map((n:any)=>[n.id,n]));const gaps:{g:number;name:string}[]=[];
 for(const r of d.roads){const a:any=nodes.get(r.a),c:any=nodes.get(r.b),len=Math.hypot(c.x-a.x,c.z-a.z);if(len<6)continue;const nx=-(c.z-a.z)/len,nz=(c.x-a.x)/len;
  for(const f of [0.3,0.5,0.7]){const p={x:a.x+(c.x-a.x)*f,z:a.z+(c.z-a.z)*f};if(solid(p))continue;let g=0;
   for(const side of [-1,1]){let s=0.2;for(;s<20;s+=0.2)if(solid({x:p.x+nx*side*s,z:p.z+nz*side*s}))break;g+=s;}gaps.push({g,name:r.name});}}
 gaps.sort((x,y)=>x.g-y.g);const share=(t:number)=>(100*gaps.filter(x=>x.g<t).length/gaps.length).toFixed(1)+'%';
 const narrow=[...new Set(gaps.filter(x=>x.g<4.5).map(x=>x.name))];
 let before=0,after=0;const kept=new Map<number,number>();for(const m of d.buildings)kept.set(m.osmId,(kept.get(m.osmId)??0)+area(m.points)-(m.holes??[]).reduce((s:number,h:P[])=>s+area(h),0));
 for(const [osm,poly] of original){before+=area(poly);after+=kept.get(osm)??0;}
 console.log(`== ${id}: ${original.size} original footprints; clearance removed ${(100*(1-after/before)).toFixed(1)}% of footprint area (${((before-after)/1000).toFixed(1)} thousand m²)`);
 console.log(`   façade-to-façade gap on original footprints (${gaps.length} samples): 10th percentile ${gaps[Math.floor(gaps.length*0.1)].g.toFixed(1)} m, median ${gaps[gaps.length>>1].g.toFixed(1)} m`);
 console.log(`   under 11.2 m (today's fixed road trims façades): ${share(11.2)}; under 6 m: ${share(6)}; under 2.8 m (fitting cannot avoid trimming): ${share(2.8)}; under 2.1 m (car cannot pass): ${share(2.1)}`);
 console.log(`   streets with a gap under 4.5 m somewhere (${narrow.length}): ${narrow.slice(0,14).join(', ')}`);
}
