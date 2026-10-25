import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import cerea from '../public/maps/cerea.json';
import harbor from '../public/maps/harbor.json';
import {activateDistrict,district,nodes,roads,nodeById,projectToSegment} from '../src/world/district';
import {planStreetPlates,plateIsClear,plateIsVisible} from '../src/world/streetPlates';
afterEach(()=>activateDistrict(harbor));

test('every legal crossing approach identifies each turnable lateral street with a readable name plate',()=>{
  activateDistrict(cerea);
  const {plates,missing}=planStreetPlates();assert.deepEqual(missing,[]);
  for(const node of nodes){
    const links=roads.filter(road=>road.a===node.id||road.b===node.id);
    if(new Set(links.map(road=>road.name)).size<2)continue;
    for(const incoming of links){
      if(incoming.oneWay&&incoming.b!==node.id)continue;
      const approach=incoming.a===node.id?incoming.b:incoming.a;
      for(const exit of links.filter(road=>road!==incoming&&(!road.oneWay||road.a===node.id))){
        assert.ok(plates.some(plate=>plate.name===exit.name&&plate.coverage.some(c=>c.junctionId===node.id&&c.approachId===approach&&c.streetName===exit.name)),`${node.id} from ${approach}: missing ${exit.name}`);
      }
    }
  }
  assert.ok(plates.some(plate=>plate.mount==='wall'));
  assert.ok(plates.some(plate=>plate.mount==='post'));
  assert.ok(plates.filter(plate=>plate.kind==='repeater').length>=10);
  for(const plate of plates){assert.ok(plate.width<=2.4);assert.ok(plateIsClear(plate));assert.ok(plateIsVisible(plate));if(plate.mount==='wall')assert.ok(plate.height+plate.width*192/1024/2<district.buildings[plate.buildingIndex!].height);}
  const vittoria=plates.find(plate=>plate.name==='Viale della Vittoria'&&plate.coverage.some(c=>c.junctionId==='1412153146'&&c.approachId==='1027997680'));
  assert.ok(vittoria);assert.ok(plateIsVisible(vittoria));
  for(const plate of plates.filter(plate=>plate.kind==='repeater')){
    const near=roads.filter(road=>road.name===plate.name).map(road=>projectToSegment(plate.position,nodeById(road.a),nodeById(road.b)));
    assert.ok(near.some(point=>Math.hypot(point.x-plate.position.x,point.z-plate.position.z)<20));
  }
});
