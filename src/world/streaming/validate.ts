import type {DistrictDefinition} from '../schema';
/** All file names are relative local assets; no user-provided URL can escape this set. */
export function validateStreaming(data:DistrictDefinition){
 const m=data.streaming;if(!m)return;
 if(m.version!==1||m.tileSize!==250||!Array.isArray(m.tiles)||!m.tiles.length||!Array.isArray(m.regions)||!m.regions.length||!Array.isArray(m.portals))throw new Error('Invalid streaming manifest');
 if(![m.fogDistance,m.loadRadius,m.retainRadius].every(n=>Number.isFinite(n)&&n>0)||m.loadRadius<m.fogDistance+100||m.retainRadius<m.loadRadius)throw new Error('Invalid streaming distances');
 const minX=Math.floor(data.bounds.minX/m.tileSize),maxX=Math.floor(data.bounds.maxX/m.tileSize),minZ=Math.floor(data.bounds.minZ/m.tileSize),maxZ=Math.floor(data.bounds.maxZ/m.tileSize);
 const tileIds=new Set<string>();
 for(const t of m.tiles){
  if(!/^-?\d+_-?\d+$/.test(t.id)||t.file!==`tiles/${t.id}.json`||tileIds.has(t.id)||!Number.isSafeInteger(t.bytes)||t.bytes<=0||!t.bounds||!Object.values(t.bounds).every(Number.isFinite))throw new Error('Invalid local tile reference');
  const [x,z]=t.id.split('_').map(Number);
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(z)||t.id!==`${x}_${z}`||![x*m.tileSize,(x+1)*m.tileSize,z*m.tileSize,(z+1)*m.tileSize].every(Number.isSafeInteger)||t.bounds.minX!==x*m.tileSize||t.bounds.maxX!==(x+1)*m.tileSize||t.bounds.minZ!==z*m.tileSize||t.bounds.maxZ!==(z+1)*m.tileSize)throw new Error('Tile id and bounds must match the canonical grid');
  if(x<minX||x>maxX||z<minZ||z>maxZ)throw new Error('Tile lies outside the prototype grid');
  tileIds.add(t.id);
 }
 const cells=(maxX-minX+1)*(maxZ-minZ+1);
 if(!Number.isSafeInteger(cells)||tileIds.size!==cells)throw new Error('Incomplete prototype tile coverage');

 const nodes=new Set(data.nodes.map(n=>n.id)),regions=new Map(m.regions.map(r=>[r.id,r]));
 if(regions.size!==m.regions.length)throw new Error('Duplicate routing region');
 for(const r of m.regions)if(!r.id||!r.name||/[<>]/.test(r.name)||!Array.isArray(r.nodeIds)||r.nodeIds.some(id=>!nodes.has(id)))throw new Error('Invalid routing region');
 for(const p of m.portals)if(!regions.has(p.from)||!regions.has(p.to)||p.from===p.to||![p.from,p.to].every(id=>regions.get(id)!.nodeIds.includes(p.nodeId)))throw new Error('Invalid routing portal');
 for(const road of data.roads)if(!road.region||!regions.has(road.region)||![road.a,road.b].every(id=>regions.get(road.region!)!.nodeIds.includes(id)))throw new Error('Road is missing its routing region');
 const neighbours=new Map(m.regions.map(r=>[r.id,[] as string[]]));
 if(m.portals.length!==m.regions.length-1)throw new Error('Prototype coarse graph must be a tree');
 for(const p of m.portals){neighbours.get(p.from)!.push(p.to);neighbours.get(p.to)!.push(p.from);}
 const reached=new Set([m.regions[0].id]),queue=[m.regions[0].id];for(let i=0;i<queue.length;i++)for(const next of neighbours.get(queue[i])!)if(!reached.has(next)){reached.add(next);queue.push(next);}
 if(reached.size!==m.regions.length)throw new Error('Disconnected coarse graph');
 for(const n of data.nodes){const owners=m.regions.filter(r=>r.nodeIds.includes(n.id));if(!owners.length||owners.length>2||(owners.length===2&&!m.portals.some(p=>p.nodeId===n.id&&[p.from,p.to].includes(owners[0].id)&&[p.from,p.to].includes(owners[1].id))))throw new Error('Invalid shared routing node');}
 if(!m.provenance?.osmTimestamp||!m.provenance?.licence||!m.provenance?.synthetic)throw new Error('Missing tile provenance');
}
