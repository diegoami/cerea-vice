// Read-only capture poses on normal approach lanes, for the disposable native renderer check.
import {readFileSync,readdirSync} from 'node:fs';
import {District,inRect,roadWidth} from '../src/world/district.ts';
import {roadsideBoards} from '../src/world/roadsideBoards.ts';
import {mappedTowns} from '../src/world/towns.ts';
const read=p=>JSON.parse(readFileSync(p,'utf8')),context=new District(read('public/maps/veronese/manifest.json')),present=roadsideBoards(context),town=mappedTowns(context).find(t=>t.id==='cerea');
const raw=readdirSync('public/maps/lower-verona/tiles').flatMap(f=>read(`public/maps/lower-verona/tiles/${f}`).boards);
function pose(board,local=true){
 if(!board?.junctionId||!board.approachId)return;
 const junction=context.nodeById(board.junctionId),approach=context.nodeById(board.approachId),road=(context.adjacency.get(junction.id)??[]).find(r=>r.a===approach.id||r.b===approach.id);
 if(!road||local&&!inRect(junction,town.area)||roadWidth(road)<6)return;
 const length=Math.hypot(junction.x-approach.x,junction.z-approach.z);if(length<48)return;
 const dx=(junction.x-approach.x)/length,dz=(junction.z-approach.z)/length,lane=roadWidth(road)/4;
 const car={x:junction.x-dx*34-dz*lane,z:junction.z-dz*34+dx*lane,heading:Math.atan2(dx,-dz),speed:0,gear:'D',steering:0};
 if(context.buildings.at(car,2).some(b=>inRect(car,b,1.5)))return;
 return {car,junction:board.junctionId,approach:board.approachId,rows:board.rows};
}
const main=raw.map(present).filter(b=>b?.rows.some(r=>typeof r!=='string'&&r.kind==='town')).map(b=>pose(b,false)).filter(Boolean).sort((a,b)=>new Set(b.rows.map(r=>r.direction)).size-new Set(a.rows.map(r=>r.direction)).size)[0];
const extra=present.additional({minX:town.area.x-town.area.width/2,minZ:town.area.z-town.area.depth/2,maxX:town.area.x+town.area.width/2,maxZ:town.area.z+town.area.depth/2}).map(b=>pose(b)).find(Boolean);
if(!main)throw new Error('No clear destination-board approach capture pose');
console.log(JSON.stringify([{name:'town-and-landmark-junction',...main},...(extra?[{name:'local-landmark-turn',...extra}]:[])]));
