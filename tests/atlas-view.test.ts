import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import cerea from '../public/maps/cerea.json';
import harbor from '../public/maps/harbor.json';
import {activateDistrict} from '../src/world/district';
import {AtlasView} from '../src/navigation/AtlasView';
import {atlasStreetEntries} from '../src/ui/Atlas';
afterEach(()=>activateDistrict(harbor));

test('atlas zoom preserves the pointer anchor and clamps panning to the printed sheet',()=>{
  activateDistrict(cerea);const view=new AtlasView(),initial=view.box;
  const anchor={x:initial.x+initial.width*.7,z:initial.z+initial.height*.6};
  view.zoomAt(2,anchor);const zoomed=view.box;
  assert.ok(Math.abs((anchor.x-zoomed.x)/zoomed.width-.7)<1e-8);
  assert.ok(Math.abs((anchor.z-zoomed.z)/zoomed.height-.6)<1e-8);
  view.zoomAt(100);assert.equal(view.zoom,8);
  view.pan(1e9,-1e9);const edge=view.box;
  assert.ok(edge.x+edge.width<=view.base.x+view.base.width+1e-8);assert.ok(edge.z>=view.base.z-1e-8);
  view.reset();assert.deepEqual(view.box,initial);
});
test('Via Cordioli is indexed and can be focused in a detailed atlas view',()=>{
  activateDistrict(cerea);const street=atlasStreetEntries().find(street=>street.name==='Via Cordioli');assert.ok(street);
  const view=new AtlasView();view.focus(street,5);const box=view.box;
  assert.equal(view.zoom,5);
  assert.ok(street.x>=box.x&&street.x<=box.x+box.width&&street.z>=box.z&&street.z<=box.z+box.height);
  assert.ok(box.width<300);
  view.ensureVisible({x:box.x+box.width+50,z:box.z+box.height/2});
  assert.equal(view.zoom,5);
});
