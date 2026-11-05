import type {District} from '../district';
import type {TilePayload,TileRef} from './schema';
/** Composite cells reuse the shipped payloads; coincident ground is drawn once and indices are rebased. */
export async function loadTile(context:District,ref:TileRef,read:(url:URL)=>Promise<TilePayload>=async url=>{
 const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10_000)});
 if(!response.ok)throw new Error('Missing local tile');return response.json();
}):Promise<TilePayload>{
 if(!ref.sources)return read(new URL(ref.file,context.assetBase));
 const parts=await Promise.all(ref.sources.map(async source=>{
  const payload=await read(new URL(`../${source.map}/tiles/${ref.id}.json`,context.assetBase));
  if(payload.version!==1||payload.id!==ref.id)throw new Error('Source tile identity mismatch');
  return {...payload,roads:payload.roads.map(i=>i+source.offsets.roads),features:payload.features.map(i=>i+source.offsets.features),landmarks:payload.landmarks.map(i=>i+source.offsets.landmarks),bays:payload.bays.map(i=>i+source.offsets.bays)};
 }));
 const joined=context.district.streaming!.joinedGateways??[];
 return {version:1,id:ref.id,provenance:context.district.streaming!.provenance,ground:parts.some(p=>p.ground==='town')?'town':'rural',
  buildings:parts.flatMap(p=>p.buildings),roads:parts.flatMap(p=>p.roads),features:parts.flatMap(p=>p.features),landmarks:parts.flatMap(p=>p.landmarks),bays:parts.flatMap(p=>p.bays),plates:parts.flatMap(p=>p.plates),props:parts.flatMap(p=>p.props),water:parts.flatMap(p=>p.water??[]),paved:parts.flatMap(p=>p.paved??[]),
  boards:parts.flatMap(p=>p.boards).filter(b=>!(b.rows.includes('END OF MAPPED ROAD')&&joined.some(g=>Math.hypot(g.x-b.position.x,g.z-b.position.z)<40))),
 };
}
