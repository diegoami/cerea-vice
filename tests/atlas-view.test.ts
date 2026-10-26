import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import cerea from '../public/maps/cerea.json';
import harbor from '../public/maps/harbor.json';
import { createAtlasView } from "../src/navigation/AtlasView";
import { createAtlas } from "../src/ui/Atlas";
import { District } from "../src/world/district";
import contextHarbor from "../public/maps/harbor.json";
let context=new District(contextHarbor);
let {district}=context;
let {AtlasView}=createAtlasView(context);
let {atlasStreetEntries,atlasMarkup}=createAtlas(context);
function useDistrict(data:unknown){context=new District(data);({district}=context);({AtlasView}=createAtlasView(context));({atlasStreetEntries,atlasMarkup}=createAtlas(context));}
afterEach(()=>useDistrict(harbor));
test('atlas zoom preserves the pointer anchor and clamps panning to the printed sheet',()=>{
  useDistrict(cerea);const view=new AtlasView(),initial=view.box;
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
  useDistrict(cerea);const street=atlasStreetEntries().find(street=>street.name==='Via Cordioli');assert.ok(street);
  const view=new AtlasView();view.focus(street,5);const box=view.box;
  assert.equal(view.zoom,5);
  assert.ok(street.x>=box.x&&street.x<=box.x+box.width&&street.z>=box.z&&street.z<=box.z+box.height);
  assert.ok(box.width<300);
  view.ensureVisible({x:box.x+box.width+50,z:box.z+box.height/2});
  assert.equal(view.zoom,5);
});
test('place-index values are escaped even if a later data consumer bypasses validation',()=>{
  useDistrict(structuredClone(cerea));
  district.landmarks[0].name='A & B "place"';
  district.landmarks[0].road='<img src=x onerror=alert(1)>';
  district.areas.forEach(area=>area.name='Centre & district');
  const markup=atlasMarkup('index');
  assert.ok(markup.includes('A &amp; B &quot;place&quot;'));
  assert.ok(markup.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(markup.includes('Centre &amp; district'));
  assert.ok(!markup.includes('<img'));
});
