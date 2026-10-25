import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import cerea from '../public/maps/cerea.json';
import harbor from '../public/maps/harbor.json';
import {activateDistrict,district,nodes,roads,nodeById,projectToSegment} from '../src/world/district';
import {planStreetPlates,plateIsClear,plateIsVisible,plateStreetRoad} from '../src/world/streetPlates';
afterEach(()=>activateDistrict(harbor));

test('crossing plates name and face their own street frontage, not an approaching side street',()=>{
  activateDistrict(cerea);
  const {plates,missing}=planStreetPlates();assert.deepEqual(missing,[]);
  for(const node of nodes){
    const links=roads.filter(road=>road.a===node.id||road.b===node.id);
    if(new Set(links.map(road=>road.name)).size<2)continue;
    for(const road of links){
      const arm=road.a===node.id?road.b:road.a;
      assert.ok(plates.some(plate=>plate.name===road.name&&plate.coverage.some(c=>c.junctionId===node.id&&c.armId===arm)),`${node.id}: missing ${road.name}`);
    }
  }
  assert.ok(plates.some(plate=>plate.mount==='wall'));
  assert.ok(plates.some(plate=>plate.mount==='post'));
  assert.ok(plates.filter(plate=>plate.kind==='repeater').length>=10);
  for(const plate of plates){
    assert.ok(plate.width<=2.4);assert.ok(plateIsClear(plate));assert.ok(plateIsVisible(plate));
    assert.equal(plateStreetRoad(plate)?.name,plate.name);
    const a=nodeById(plate.roadA),b=nodeById(plate.roadB),length=Math.hypot(b.x-a.x,b.z-a.z);
    const parallel=Math.abs((Math.cos(plate.angle)*(b.x-a.x)-Math.sin(plate.angle)*(b.z-a.z))/length);
    assert.ok(parallel>.94,`${plate.name} plate must run along its own road`);
    const centre=projectToSegment(plate.position,a,b),dx=centre.x-plate.position.x,dz=centre.z-plate.position.z;
    assert.ok((Math.sin(plate.angle)*dx+Math.cos(plate.angle)*dz)/Math.hypot(dx,dz)>.65,`${plate.name} must face into its own street`);
    if(plate.mount==='wall')assert.ok(plate.height+plate.width*192/1024/2<district.buildings[plate.buildingIndex!].height);
  }
  const firstJunction=nodes.find(node=>{
    const names=roads.filter(road=>road.a===node.id||road.b===node.id).map(road=>road.name);
    return names.includes('Via Dante')&&names.includes('Via Venticinque Aprile');
  });assert.ok(firstJunction);
  for(const name of ['Via Dante','Via Venticinque Aprile']){
    const local=plates.filter(plate=>plate.name===name&&plate.coverage.some(c=>c.junctionId===firstJunction.id));
    assert.ok(local.length>0);for(const plate of local)assert.equal(plateStreetRoad(plate)?.name,name);
  }
});
