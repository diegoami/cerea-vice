import {roadWidth,type District,type Point} from '../world/district';

/** Offset a directed road-centre route into the local driving lane. Nothing is drawn on the atlas. */
export function laneRoute(context:District,ids:string[]):Point[]{
 const nodes=ids.map(context.nodeById),side=context.district.drivingSide==='left'?-1:1;
 const normals=nodes.slice(1).map((b,i)=>{
  const a=nodes[i],road=(context.adjacency.get(a.id)??[]).find(r=>(r.a===a.id&&r.b===b.id)||(!r.oneWay&&r.b===a.id&&r.a===b.id)),length=Math.hypot(b.x-a.x,b.z-a.z)||1;
  const offset=Math.max(0,Math.min(1.8,roadWidth(road??{a:a.id,b:b.id,name:''})/2-1.3));
  return {x:-(b.z-a.z)/length*offset*side,z:(b.x-a.x)/length*offset*side};
 });
 return nodes.map((n,i)=>{
  const before=normals[i-1]??normals[i],after=normals[i]??before;if(!before||!after)return {x:n.x,z:n.z};
  const scale=Math.hypot(before.x,before.z)*Math.hypot(after.x,after.z),dot=scale?(before.x*after.x+before.z*after.z)/scale:1;
  let x=(before.x+after.x)/Math.max(.2,1+dot),z=(before.z+after.z)/Math.max(.2,1+dot);
  const length=Math.hypot(x,z);if(length>2.7){x*=2.7/length;z*=2.7/length;}
  return {x:n.x+x,z:n.z+z};
 });
}
