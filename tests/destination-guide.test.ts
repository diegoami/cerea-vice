import {test} from 'node:test';
import assert from 'node:assert/strict';
import harbor from '../public/maps/harbor.json';
import cerea from '../public/maps/cerea.json';
import {District} from '../src/world/district';
import {createDestinationGuide} from '../src/world/destinationBoards';
import {RouteGraph} from '../src/navigation/RouteGraph';
function fixture(){
 const nodes=[['j',0,0],['a',0,120],['west',-100,0],['west-town',-900,0],['northwest',-100,-1000],['east-entry',900,0],['east',1000,0],['north',0,-1500],['spur',0,-50]].map(([id,x,z])=>({id:String(id),x:Number(x),z:Number(z),label:String(id)}));
 const roads=[['a','j'],['j','west'],['west','west-town'],['west','northwest'],['northwest','east-entry'],['east-entry','east'],['east','j'],['north','j'],['j','spur']].map(([a,b])=>({a,b,name:`Road ${a}-${b}`,roadClass:'primary',...(['east','north'].includes(a)&&b==='j'?{oneWay:true}:{})}));
 const areas=[['Here',0,0],['West Town',-1000,0],['East Town',1000,0],['Unreachable North',0,-1500]].map(([name,x,z])=>({name:String(name),x:Number(x),z:Number(z),width:600,depth:600}));
 const stops=[['here','j','here','Here'],['museum','west','here','Here'],['west','west-town','west','West Town'],['east','east','east','East Town'],['north','north','north','Unreachable North']].map(([id,nodeId,townId,town])=>({id,nodeId,townId,town,name:id==='museum'?'Town Museum':town,road:'Fixture road',description:'Fixture stop',bayId:harbor.mission.bayId}));
 return {...structuredClone(harbor),id:'destination-fixture',bounds:{minX:-2000,maxX:2000,minZ:-2000,maxZ:2000},nodes,roads,areas,landmarks:[{id:'museum',name:'Town Museum',road:'Fixture road',x:-100,z:0,width:12,depth:12,color:0xeeeecc}],mission:{...harbor.mission,nodeId:'j'},taxi:{...structuredClone(cerea.taxi),endless:true,mixedTownFares:true,stops,fares:[{passenger:'Test',pickupId:'here',destinationId:'museum'}]}};
}

test('destination boards route to legal town entrances, not compass bearings or an unreachable centre',()=>{
 const rows=createDestinationGuide(new District(fixture()))('j','a');
 const east=rows.find(r=>r.text==='EAST TOWN');assert.ok(east);assert.equal(east.direction,'left','East town requires taking the western detour because its eastern approach is one-way');
 assert.ok(Math.abs(east.turnAngle!+Math.PI/2)<1e-9);
 assert.ok(!rows.some(r=>r.text==='UNREACHABLE NORTH'));
 const museum=rows.find(r=>r.kind==='landmark');assert.equal(museum?.text,'TOWN MUSEUM');assert.equal(museum?.direction,'left');
 assert.ok(rows.every(r=>!r.text.startsWith('ROAD ')&&!r.detail.startsWith('ROAD ')));
 assert.deepEqual(createDestinationGuide(new District(fixture()))('spur','j'),[],'A dead end never invents an onward direction');
});

test('destination arrows preserve a diagonal exit angle instead of drawing every turn as ninety degrees',()=>{
 const data=fixture();Object.assign(data.nodes.find(n=>n.id==='west')!,{x:-100,z:-100});
 const row=createDestinationGuide(new District(data))('j','a').find(r=>r.text==='WEST TOWN');assert.ok(row);
 assert.ok(Math.abs(row.turnAngle!+Math.PI/4)<1e-9);
});

test('bounded multi-source reverse routes choose any legal entrance without changing directed route searches',()=>{
 const nodes=[{id:'a',x:0,z:0,label:'A'},{id:'b',x:10,z:0,label:'B'},{id:'c',x:20,z:0,label:'C'}];
 const graph=new RouteGraph(nodes,[{a:'a',b:'b',name:'AB',oneWay:true},{a:'b',b:'c',name:'BC',oneWay:true}]);
 assert.deepEqual([...graph.costsTo(['b','c'])],[['b',0],['c',0],['a',10]]);
 assert.equal(graph.costsTo(['b','c'],5).has('a'),false);
 assert.equal(graph.search('a','c').cost,20);assert.equal(graph.search('c','a').cost,Infinity);
});

test('local landmark signs use clear verges at real turns and belong to exactly one visual tile',async()=>{
 const {roadsideBoards}=await import('../src/world/roadsideBoards');const {createSigns}=await import('../src/world/signs');
 const data=fixture();data.roads.forEach(r=>r.roadClass='residential');const context=new District(data),present=roadsideBoards(context),before=JSON.stringify(data);
 const plans=present.additional(data.bounds);assert.ok(plans.length>0&&plans.length<=2);
 for(const plan of plans){assert.ok(createSigns(context).boardIsClear(plan));assert.equal(plan.color,'#6b5739');assert.ok(plan.rows.every(r=>typeof r!=='string'&&r.kind==='landmark'&&r.destinationId==='museum'&&Math.abs(r.turnAngle!)>.45));}
 const left=present.additional({...data.bounds,maxX:0}),right=present.additional({...data.bounds,minX:0});
 const key=(p:typeof plans[number])=>`${p.junctionId}:${p.approachId}`;
 assert.deepEqual([...left,...right].map(key).sort(),plans.map(key).sort(),'No duplicate or missing sign at a tile boundary');
 assert.equal(JSON.stringify(data),before,'Additional guidance never edits signed map content');
});

test('co-located landmarks share a readable destination row instead of permanently hiding the civic names',()=>{
 const data=fixture(),museum=data.landmarks[0];data.landmarks.push({...museum,id:'townhall',name:'Municipio Test'});
 data.taxi.stops.push({...data.taxi.stops[1],id:'townhall',name:'Municipio Test'});
 const before=JSON.stringify(data),rows=createDestinationGuide(new District(data))('j','a','townhall'),shared=rows.find(r=>r.kind==='landmark');
 assert.equal(shared?.text,'TOWN MUSEUM');assert.equal(shared?.detail,'MUNICIPIO');assert.deepEqual(shared?.destinationIds,['museum','townhall']);
 assert.equal(JSON.stringify(data),before);
});
