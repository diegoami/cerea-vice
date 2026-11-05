import type {DistrictDefinition,Point} from './schema';
import type {TileRef} from './streaming/schema';

/** Combine the two existing shared-frame regions. Source maps and save signatures stay intact. */
export function combineRegions(parts:DistrictDefinition[]):DistrictDefinition{
 if(parts.length!==2||parts.some(p=>!p.streaming||!p.taxi))throw new Error('The unified world requires both streamed taxi regions');
 const [south,north]=parts,gate=south.gateways?.find(g=>g.to===north.id),other=north.gateways?.find(g=>g.to===south.id);
 if(!gate||gate.nodeId!==other?.nodeId)throw new Error('Missing shared regional gateway');
 const points=new Map<string,Point>(),nodes:DistrictDefinition['nodes']=[];
 for(const part of parts)for(const node of part.nodes){const prior=points.get(node.id);if(prior){if(Math.hypot(prior.x-node.x,prior.z-node.z)>.01||node.id!==gate.nodeId)throw new Error('Regions do not share the same coordinate frame');}else{points.set(node.id,node);nodes.push(node);}}
 const roads:DistrictDefinition['roads']=[],features:DistrictDefinition['features']=[],landmarks:DistrictDefinition['landmarks']=[],parkingZones:DistrictDefinition['parkingZones']=[];
 const byTile=new Map<string,NonNullable<TileRef['sources']>>();
 const bounds={minX:Math.min(...parts.map(p=>p.bounds.minX)),maxX:Math.max(...parts.map(p=>p.bounds.maxX)),minZ:Math.min(...parts.map(p=>p.bounds.minZ)),maxZ:Math.max(...parts.map(p=>p.bounds.maxZ))};
 for(const part of parts){
  const offsets={roads:roads.length,features:features.length,landmarks:landmarks.length,bays:parkingZones.length};
  roads.push(...part.roads.map(r=>({...r,region:part.id})));features.push(...part.features);landmarks.push(...part.landmarks);parkingZones.push(...part.parkingZones);
  for(const tile of part.streaming!.tiles){const sources=byTile.get(tile.id)??[];sources.push({map:part.id,offsets,bytes:tile.bytes});byTile.set(tile.id,sources);}
 }
 const size=250,tiles:TileRef[]=[];
 for(let x=Math.floor(bounds.minX/size);x<=Math.floor(bounds.maxX/size);x++)for(let z=Math.floor(bounds.minZ/size);z<=Math.floor(bounds.maxZ/size);z++){
  const id=`${x}_${z}`,sources=byTile.get(id)??[];
  tiles.push({id,file:`tiles/${id}.json`,sources,bytes:Math.max(1,sources.reduce((n,s)=>n+s.bytes,0)),bounds:{minX:x*size,maxX:(x+1)*size,minZ:z*size,maxZ:(z+1)*size}});
 }
 const townLabels=new Map<string,string>();
 for(const part of parts)for(const stop of part.taxi!.stops){const label=stop.name.match(/\(([^)]+)\)$/)?.[1];if(label)townLabels.set(stop.id.split(':')[0],label);}
 const stops=parts.flatMap(p=>p.taxi!.stops.map(stop=>{
  const townId=stop.id.split(':')[0],name=townLabels.get(townId)??townId.replace(/-/g,' ').replace(/\b[a-z]/g,c=>c.toUpperCase());
  return {...stop,townId,town:name};
 }));
 return {version:1,id:'veronese',dataVersion:1,name:'Veronese world',subtitle:'ONE WORLD / NINE TOWNS',
  description:'Verona, San Giovanni Lupatoto, Oppeano, Bovolone, Cerea, Legnago, Casaleone, Sanguinetto and Nogara, joined by the existing real roads in one continuous world.',
  attribution:south.attribution,sourceUrl:south.sourceUrl,stoppingPolicy:'anywhere',bounds,nodes,roads,features,landmarks,parkingZones,
  buildings:parts.flatMap(p=>p.buildings),areas:parts.flatMap(p=>p.areas),waterAreas:parts.flatMap(p=>p.waterAreas??[]),pavedAreas:parts.flatMap(p=>p.pavedAreas??[]),
  spawn:{...south.spawn},mission:{...south.mission,name:'Veronese taxi shift',objective:'Serve local and inter-town passengers across the Veronese towns.'},
  taxi:{...south.taxi!,stops,fares:parts.flatMap(p=>p.taxi!.fares),mixedTownFares:true,interTownPremiumCents:1200},
  streaming:{...south.streaming!,loadRadius:Math.max(...parts.map(p=>p.streaming!.loadRadius)),retainRadius:Math.max(...parts.map(p=>p.streaming!.retainRadius)),tiles,regions:parts.map(p=>({id:p.id,name:p.name,nodeIds:p.nodes.map(n=>n.id)})),portals:[{from:south.id,to:north.id,nodeId:gate.nodeId}],joinedGateways:[points.get(gate.nodeId)!],
   provenance:{...south.streaming!.provenance,synthetic:'Union of the existing Lower Veronese plain and Verona–Oppeano maps at their shared Via Quaiotto gateway. Real streets and towns retained; inter-town roads remain shortened. Bays, signs and props are game placements.'}},
 };
}
