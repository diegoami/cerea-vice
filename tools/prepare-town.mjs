import fs from 'node:fs';
import path from 'node:path';
import clipping from 'polygon-clipping';

// The district written by tools/import-town.py, prepared in place.
if(!process.argv[2]){console.error('usage: node tools/prepare-town.mjs <district.json>');process.exit(2);}
const filename=path.resolve(process.argv[2]);
const data=JSON.parse(fs.readFileSync(filename,'utf8'));
const nodes=new Map(data.nodes.map(node=>[node.id,node]));
const discs=(p,r)=>Array.from({length:16},(_,i)=>[p.x+Math.cos(i*Math.PI/8)*r,p.z+Math.sin(i*Math.PI/8)*r]);
const corridors=[];
for(const road of data.roads) {
  const a=nodes.get(road.a),b=nodes.get(road.b),length=Math.hypot(b.x-a.x,b.z-a.z);
  // Clear the complete pavement, its 1.25m sidewalk and a small façade gap.
  const r=(road.width??8)/2+1.6,nx=-(b.z-a.z)/length*r,nz=(b.x-a.x)/length*r;
  corridors.push([[[a.x+nx,a.z+nz],[b.x+nx,b.z+nz],[b.x-nx,b.z-nz],[a.x-nx,a.z-nz]]]);
  corridors.push([discs(a,r)],[discs(b,r)]);
}
for(const bay of data.parkingZones) corridors.push([[[bay.x-bay.width/2-.5,bay.z-bay.depth/2-.5],[bay.x+bay.width/2+.5,bay.z-bay.depth/2-.5],[bay.x+bay.width/2+.5,bay.z+bay.depth/2+.5],[bay.x-bay.width/2-.5,bay.z+bay.depth/2+.5]]]);
const snapped=corridors.map(polygon=>polygon.map(ring=>ring.map(point=>point.map(value=>Math.round(value*1e6)/1e6))));
// Clip locally, one convex road piece at a time. A global union of thousands of
// touching caps is unnecessarily prone to floating-point sweep-line degeneracy.
const pieces=[...new Map(snapped.map(polygon=>[JSON.stringify(polygon),polygon])).values()].map(polygon=>({polygon,minX:Math.min(...polygon[0].map(p=>p[0])),maxX:Math.max(...polygon[0].map(p=>p[0])),minZ:Math.min(...polygon[0].map(p=>p[1])),maxZ:Math.max(...polygon[0].map(p=>p[1]))}));
const snap=geometry=>geometry.map(polygon=>polygon.map(ring=>ring.map(point=>point.map(value=>Math.round(value*1e6)/1e6))));
const area=ring=>Math.abs(ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2);
const bounds=ring=>{const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);return {x:(Math.min(...xs)+Math.max(...xs))/2,z:(Math.min(...zs)+Math.max(...zs))/2,width:Math.max(...xs)-Math.min(...xs),depth:Math.max(...zs)-Math.min(...zs)};};
const buildings=[],changed=[],removed=[];
for(const building of data.buildings) {
  const original=[building.points.map(p=>[p.x,p.z])];
  let difference=[original];
  for(const piece of pieces) {
    if(building.x+building.width/2<piece.minX||building.x-building.width/2>piece.maxX||building.z+building.depth/2<piece.minZ||building.z-building.depth/2>piece.maxZ)continue;
    if(!difference.length)break;
    difference=snap(clipping.difference(difference,piece.polygon));
  }
  const useful=difference.filter(polygon=>area(polygon[0])>4);
  if(!useful.length){removed.push(building.osmId);continue;}
  if(Math.abs(useful.reduce((sum,p)=>sum+area(p[0])-p.slice(1).reduce((s,h)=>s+area(h),0),0)-area(original[0]))>.01)changed.push(building.osmId);
  for(const polygon of useful) {
    const ring=polygon[0].slice(0,-1);
    buildings.push({...building,...bounds(ring),points:ring.map(([x,z])=>({x,z})),...(polygon.length>1?{holes:polygon.slice(1).map(ring=>ring.slice(0,-1).map(([x,z])=>({x,z})))}:{})});
  }
}
data.buildings=buildings;
for(const landmark of data.landmarks) {
  const masses=buildings.filter(building=>building.osmId===landmark.osmId).sort((a,b)=>b.width*b.depth-a.width*a.depth);
  if(!masses.length)throw new Error(`Clearance removed named landmark ${landmark.name}`);
  const {x,z,width,depth,points,holes}=masses[0];
  Object.assign(landmark,{x,z,width,depth,points,...(holes?{holes}:{})});
}
data.provenance.omittedConflictingFootprints=removed;
data.provenance.trimmedFootprints=changed;
data.provenance.roadClearance='Full road width plus 1.6m verge; includes junction caps and game parking bays. Trimmed polygons are used for scenery, collisions and atlas.';
fs.writeFileSync(filename,JSON.stringify(data)+'\n');
console.log(`Road clearance: ${changed.length} footprints trimmed, ${removed.length} removed, ${buildings.length} masses retained.`);
