import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import harbor from '../public/maps/harbor.json';
import {District} from '../src/world/district';
import {roadsideBoards} from '../src/world/roadsideBoards';
import {townSignName} from '../src/world/placeNames';
import {mapSignature} from '../src/game/Save';
import {createSigns} from '../src/world/signs';
import type {RoadsideBoard} from '../src/world/streaming/schema';
const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
const boards=(id:string):RoadsideBoard[]=>readdirSync(`public/maps/${id}/tiles`).flatMap(file=>read(`public/maps/${id}/tiles/${file}`).boards);
test('town arrows follow reachable directed exits, excluding the approach and dead-end detours',()=>{
 const data={...structuredClone(harbor),id:'sign-fixture',mission:{...harbor.mission,nodeId:'j'},gateways:[{id:'gateway',nodeId:'north',to:'neighbour',sign:['Neighbour']}],bounds:{minX:-2000,maxX:2000,minZ:-2000,maxZ:2000},
  nodes:[['j',0,0],['a',0,100],['west',-1000,0],['east',1000,0],['north',0,-1000],['spur',0,-100],['behind',0,1000]].map(([id,x,z])=>({id:String(id),x:Number(x),z:Number(z),label:String(id)})),
  roads:[['a','j'],['j','west'],['j','east'],['north','j'],['j','spur'],['a','behind']].map(([a,b])=>({a,b,name:`Road ${a}-${b}`,roadClass:'primary',...(a==='north'?{oneWay:true}:{})})),
  areas:[['Here',0,0],['West Town',-1000,0],['East Town',1000,0],['Unreachable North',0,-1000],['Behind',0,1000]].map(([name,x,z])=>({name:String(name),x:Number(x),z:Number(z),width:600,depth:600}))};
 const context=new District(data),board:RoadsideBoard={junctionId:'j',approachId:'a',position:{x:12,z:12},width:4.2,height:3.2,angle:0,color:'#31594e',rows:[{text:'OLD STREET',detail:'',direction:'straight'}]};
 const result=roadsideBoards(context)(board)!;
 assert.deepEqual(result.rows,[{text:'WEST TOWN',detail:'',direction:'left'},{text:'EAST TOWN',detail:'',direction:'right'}]);
 assert.equal(result.color,'#234b72');assert.ok(result.width>=board.width);assert.deepEqual(result.position,board.position);
 const noExit=roadsideBoards(context)({...board,junctionId:'spur',approachId:'j'});assert.equal(noExit,undefined);
 const neighbourhoods=new District({...data,gateways:undefined});assert.equal(roadsideBoards(neighbourhoods)(board),undefined,'Several neighbourhood/countryside areas do not invent a regional town board');
});
test('the unified world promotes towns on its existing clear board sites without mutating maps or tiles',()=>{
 const context=new District(read('public/maps/veronese/manifest.json')),signature=mapSignature(context),present=roadsideBoards(context);
 const {boardIsClear}=createSigns(context);
 const source=[...boards('lower-verona'),...boards('verona-plain')],before=JSON.stringify(source);
 const names=new Set(context.district.areas.filter(a=>Math.min(a.width,a.depth)>=600).map(a=>townSignName(a).toUpperCase()));
 const shown=new Set<string>();let count=0,removed=0;
 for(const board of source.filter(b=>b.junctionId)){
  const result=present(board);if(!result){removed++;continue;}count++;
  assert.equal(result.color,'#234b72');assert.ok(result.width<=5.6);assert.equal(result.angle,board.angle);assert.deepEqual(result.position,board.position);
  if(result.width>board.width)assert.ok(boardIsClear(result),'Enlarged boards must still clear streets and buildings');
  for(const row of result.rows){assert.ok(typeof row!=='string');assert.ok(names.has(row.text),row.text);assert.equal(row.detail,'');shown.add(row.text);}
 }
 assert.ok(count>100);assert.ok(removed>0);assert.ok(shown.size>=8);assert.ok(source.some(b=>b.rows.some(row=>typeof row==='string'&&row.includes('OPPEANO'))),'The Oppeano corridor retains its dedicated town boards');assert.equal(JSON.stringify(source),before);assert.equal(mapSignature(context),signature);
 for(const board of source.filter(b=>!b.junctionId))assert.equal(present(board),board,'Place, gateway, parking and facade signs remain intact');
});
test('single-city street boards are compact and limited to through-road junctions; name plates stay in the tiles',()=>{
 const context=new District(read('public/maps/london-westminster/manifest.json')),source=boards('london-westminster').filter(b=>b.junctionId),present=roadsideBoards(context);
 const kept=source.map(present).filter(b=>b!==undefined);assert.ok(kept.length<source.length/2,`${kept.length}/${source.length}`);
 for(const board of kept){assert.ok(board.width<=2.2);assert.equal(board.height,2.4);}
 const tiles=readdirSync('public/maps/london-westminster/tiles').map(file=>read(`public/maps/london-westminster/tiles/${file}`));
 assert.ok(tiles.reduce((n,t)=>n+t.plates.length,0)>100);
});
