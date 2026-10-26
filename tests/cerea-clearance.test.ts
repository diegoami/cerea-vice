import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import clipping, {type Polygon} from 'polygon-clipping';
import cerea from '../public/maps/cerea.json';
import harbor from '../public/maps/harbor.json';
import {activateDistrict,district,roads,nodeById,inRect,spawn} from '../src/world/district';
import {planJunctionSigns,planParkingSigns,planVittoriaNoEntrySign,planEdgeSigns,boardIsClear,isMajorRoad} from '../src/world/signs';
import {Parking} from '../src/navigation/Parking';
import {Mission} from '../src/mission/Mission';

afterEach(()=>activateDistrict(harbor));
const ringArea=(ring:number[][])=>Math.abs(ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2);
test('Cerea building polygons clear the full rendered road width and junction caps',()=>{
  activateDistrict(cerea);
  const corridors:Polygon[]=[];
  for(const road of roads){
    const a=nodeById(road.a),b=nodeById(road.b),length=Math.hypot(b.x-a.x,b.z-a.z),r=(road.width??8)/2;
    const nx=-(b.z-a.z)/length*r,nz=(b.x-a.x)/length*r;
    corridors.push([[[a.x+nx,a.z+nz],[b.x+nx,b.z+nz],[b.x-nx,b.z-nz],[a.x-nx,a.z-nz]]]);
    for(const p of[a,b])corridors.push([Array.from({length:12},(_,i)=>[p.x+Math.cos(i*Math.PI/6)*r,p.z+Math.sin(i*Math.PI/6)*r])]);
  }
  const snapped=corridors.map(polygon=>polygon.map(ring=>ring.map(point=>point.map(value=>Math.round(value*1e6)/1e6) as [number,number])));
  const envelopes=snapped.map(polygon=>({polygon,minX:Math.min(...polygon[0].map(p=>p[0])),maxX:Math.max(...polygon[0].map(p=>p[0])),minZ:Math.min(...polygon[0].map(p=>p[1])),maxZ:Math.max(...polygon[0].map(p=>p[1]))}));
  for(const building of district.buildings){
    const geometry:Polygon=[building.points!,...(building.holes??[])].map(ring=>ring.map(p=>[p.x,p.z] as [number,number]));
    for(const envelope of envelopes) {
      if(building.x+building.width/2<envelope.minX||building.x-building.width/2>envelope.maxX||building.z+building.depth/2<envelope.minZ||building.z-building.depth/2>envelope.maxZ)continue;
      const overlap=clipping.intersection(geometry,envelope.polygon);
      assert.ok(overlap.reduce((sum,polygon)=>sum+ringArea(polygon[0]),0)<.0001,`Building ${building.osmId} must not cover pavement`);
    }
  }
});

test('large arrow boards are reserved for junctions between major thoroughfares',()=>{
  activateDistrict(cerea);
  const {signs,missing}=planJunctionSigns();
  assert.deepEqual(missing,[]);
  assert.ok(signs.length>0&&signs.length<30);
  for(const plan of signs){
    const links=roads.filter(road=>road.a===plan.junctionId||road.b===plan.junctionId);
    assert.ok(new Set(links.filter(isMajorRoad).map(road=>road.name)).size>=2);
    const incoming=links.find(road=>road.a===plan.approachId||road.b===plan.approachId)!;
    assert.ok(isMajorRoad(incoming));
    assert.ok(boardIsClear(plan));
    for(const row of plan.rows)assert.ok(links.some(road=>isMajorRoad(road)&&road.name.toUpperCase()===row.text));
  }
  for(const sign of planEdgeSigns())assert.ok(boardIsClear(sign));
  for(const sign of planParkingSigns())assert.ok(boardIsClear(sign));
  const noEntry=planVittoriaNoEntrySign();assert.ok(noEntry&&boardIsClear(noEntry));
});

test('Cerea allows stopped information requests anywhere without unsafe-stop counts',()=>{
  activateDistrict(cerea);
  const parking=new Parking(),mission=new Mission();
  parking.update(1,spawn,5);parking.update(1,{x:0,z:0},0);
  assert.equal(parking.zone,undefined);assert.equal(parking.stopped,true);
  assert.equal(parking.legal,true);assert.equal(parking.unsafeStops,0);
  assert.equal(mission.recordDirectionRequest(parking.stopped,parking.legal),true);
  assert.deepEqual(mission.directionRequests,{legal:1,unsafe:0});
});

test('building courtyards remain empty while their walls retain collision clearance',()=>{
  const shape={x:0,z:0,width:20,depth:20,points:[{x:-10,z:-10},{x:10,z:-10},{x:10,z:10},{x:-10,z:10}],holes:[[{x:-4,z:-4},{x:4,z:-4},{x:4,z:4},{x:-4,z:4}]]};
  assert.equal(inRect({x:0,z:0},shape),false);
  assert.equal(inRect({x:8,z:0},shape),true);
  assert.equal(inRect({x:3.5,z:0},shape,-1),true);
});
