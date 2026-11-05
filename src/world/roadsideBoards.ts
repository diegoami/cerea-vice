import {RouteGraph} from '../navigation/RouteGraph';
import {inRect,type District,type Road} from './district';
import type {DirectionRow} from './directions';
import {townSignName} from './placeNames';
import {createSigns} from './signs';
import type {RoadsideBoard} from './streaming/schema';

const major=(road:Road)=>['trunk','primary','secondary','tertiary'].includes(road.roadClass??'');
const through=(road:Road)=>['trunk','primary','secondary'].includes(road.roadClass??'');
const cache=new WeakMap<District,ReturnType<typeof createBoardPresentation>>();
/** Presentation only: reuse surveyed clear sign positions without rewriting signed maps or tiles. */
export function roadsideBoards(context:District){
 let value=cache.get(context);if(!value){value=createBoardPresentation(context);cache.set(context,value);}return value;
}
function createBoardPresentation(context:District){
 const towns=context.district.areas.filter(a=>Math.min(a.width,a.depth)>=600);
 // Areas can also be neighbourhoods or prototype countryside, not towns.
 const townIds=new Set(context.district.taxi?.stops.map(s=>s.townId).filter(Boolean));
 const regional=towns.length>1&&(townIds.size>1||Boolean(context.district.gateways?.length));
 const {boardIsClear}=createSigns(context);
 let destinations:{name:string;area:typeof towns[number];costs:Map<string,number>}[]|undefined;
 const results=new Map<string,DirectionRow[]>();
 function townRows(junctionId:string,approachId:string){
  const key=`${junctionId}:${approachId}`,cached=results.get(key);if(cached)return cached;
  if(!destinations){
   const graph=new RouteGraph(context.nodes,context.roads);
   destinations=towns.map(area=>{
    const centre=context.nodes.reduce((best,n)=>Math.hypot(n.x-area.x,n.z-area.z)<Math.hypot(best.x-area.x,best.z-area.z)?n:best);
    return {name:townSignName(area).toUpperCase(),area,costs:graph.costsTo(centre.id)};
   });
  }
  const node=context.nodeById(junctionId),approach=context.nodeById(approachId),heading=Math.atan2(node.x-approach.x,-(node.z-approach.z));
  const exits=(context.adjacency.get(junctionId)??[]).filter(r=>!r.oneWay||r.a===junctionId).map(road=>({road,node:context.nodeById(road.a===junctionId?road.b:road.a)}));
  const candidates: {row:DirectionRow;cost:number;exit:string}[]=[];
  for(const place of destinations){
   if(inRect(node,place.area))continue;
   const cost=place.costs.get(junctionId);if(cost===undefined)continue;
   // Only an actual shortest-path exit may carry this town. An exit whose route
   // immediately doubles back through this junction is never a valid direction.
   const exit=exits.find(e=>Math.abs(Math.hypot(e.node.x-node.x,e.node.z-node.z)+(place.costs.get(e.node.id)??Infinity)-cost)<.001);
   if(!exit||exit.node.id===approachId||!major(exit.road))continue;
   const turn=Math.atan2(Math.sin(Math.atan2(exit.node.x-node.x,-(exit.node.z-node.z))-heading),Math.cos(Math.atan2(exit.node.x-node.x,-(exit.node.z-node.z))-heading));
   candidates.push({row:{text:place.name,detail:'',direction:Math.abs(turn)<.2?'straight':turn<0?'left':'right'},cost,exit:exit.node.id});
  }
  candidates.sort((a,b)=>a.cost-b.cost||a.row.text.localeCompare(b.row.text));
  // Give each signed exit a row before adding a second town along the same road.
  const selected=candidates.filter((c,i)=>candidates.findIndex(o=>o.exit===c.exit)===i);
  for(const c of candidates)if(selected.length<3&&!selected.includes(c))selected.push(c);
  const rows=selected.slice(0,3).map(c=>c.row).sort((a,b)=>['left','straight','right'].indexOf(a.direction)-['left','straight','right'].indexOf(b.direction));
  results.set(key,rows);return rows;
 }
 return (board:RoadsideBoard):RoadsideBoard|undefined=>{
  if(context.district.id==='harbor'||!board.junctionId||!board.approachId)return board;
  if(regional){
   const rows=townRows(board.junctionId,board.approachId);if(!rows.length)return;
   const width=[5.6,5,4.2,3.6,board.width].find(width=>width<=board.width||boardIsClear({...board,width}))!;
   return {...board,rows,width,height:3.4,color:'#234b72'};
  }
  // A single-city map cannot honestly sign towns beyond its mapped road network.
  // Retain compact local boards only at junctions between main through roads.
  const links=context.adjacency.get(board.junctionId)??[],incoming=links.find(r=>r.a===board.approachId||r.b===board.approachId);
  if(!incoming||!through(incoming)||new Set(links.filter(through).map(r=>r.name)).size<2)return;
  const generic=new Set(['CENTRO','CENTRE','SENSO UNICO','ONE WAY']);
  const rows=board.rows.flatMap(row=>typeof row!=='string'&&row.detail&&!generic.has(row.detail)&&links.some(r=>through(r)&&r.name.toUpperCase()===row.text)
   ?[{...row,text:row.detail,detail:row.text}]:[]);
  if(!rows.length)return;
  return {...board,rows,width:Math.min(board.width,2.2),height:2.4};
 };
}
