import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import cerea from '../public/maps/cerea.json';
import harbor from '../public/maps/harbor.json';
import { createAtlasView } from "../src/navigation/AtlasView";
import { createAtlas } from "../src/ui/Atlas";
import { District } from "../src/world/district";
import contextHarbor from "../public/maps/harbor.json";
import region from '../public/maps/lower-verona/manifest.json';
import {createAtlasSheets} from '../src/navigation/AtlasSheets';
import {createAtlasNotes} from '../src/navigation/AtlasNotes';
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

test('regional quadrants cover every town and road endpoint with overlapping geographical neighbours',()=>{
  const context=new District(region),{sheets,sheetAt,neighbour}=createAtlasSheets(context);
  assert.ok(sheets.length>1);
  for(const point of [...context.nodes,...context.district.areas]){
    const sheet=sheetAt(point)!;
    assert.ok(point.x>=sheet.minX&&point.x<=sheet.minX+sheet.span&&point.z>=sheet.minZ&&point.z<=sheet.minZ+sheet.span);
  }
  const cerea=sheetAt(context.spawn)!;
  const town=context.district.areas.find(area=>area.name==='Centro di Cerea')!;
  assert.ok(town.x-town.width/2>=cerea.minX&&town.x+town.width/2<=cerea.minX+cerea.span&&town.z-town.depth/2>=cerea.minZ&&town.z+town.depth/2<=cerea.minZ+cerea.span,'The original Cerea town fits a single detail page');
  const east=neighbour(cerea,1,0)!;
  assert.equal(neighbour(east,-1,0),cerea);
  assert.equal(cerea.minX+cerea.span-east.minX,200);
  assert.equal(east.minZ,cerea.minZ);
  assert.equal(createAtlasSheets(new District(harbor)).sheets.length,0);
});

test('regional overview omits street clutter and each indexed street opens a Cerea-sized sheet',()=>{
  const context=new District(region),atlas=createAtlas(context),view=new (createAtlasView(context).AtlasView)();
  assert.doesNotMatch(atlas.atlasMarkup('map'),/data-street=/);
  assert.match(atlas.atlasMarkup('map'),/Bovolone/);
  const entries=atlas.atlasStreetEntries();
  const romas=entries.filter(street=>street.name==='Via Roma');
  assert.ok(new Set(romas.map(street=>street.sheet)).size>1,'Same street names retain distinct page references');
  for(const street of entries){
    const sheet=atlas.sheets.find(sheet=>sheet.id===street.sheet)!;
    assert.ok(street.x>=sheet.minX&&street.x<=sheet.minX+sheet.span&&street.z>=sheet.minZ&&street.z<=sheet.minZ+sheet.span,'Labels lie on the page even on continuing roads');
  }
  const street=entries.find(street=>street.name==='Via Cordioli')!;
  const sheet=atlas.sheets.find(sheet=>sheet.id===street.sheet)!;
  atlas.setAtlasSheet(sheet.id);view.setSheet(sheet);view.focus(street,5);
  assert.ok(view.box.width<300,'Local zoom reaches street detail regardless of region size');
  assert.match(atlas.atlasMarkup('map'),/VIA CORDIOLI/);
  assert.match(atlas.atlasMarkup('map'),/North ·|South ·/,'Detail pages link to their neighbours');
});

test('turning regional sheets, zooming and looking up a street preserve atlas knowledge',()=>{
  const context=new District(region),notes=new (createAtlasNotes(context).AtlasNotes)(),atlas=createAtlas(context),view=new (createAtlasView(context).AtlasView)();
  notes.pointAt({x:123,z:456});notes.place();const before=notes.snapshot(),reference=atlas.atlasReference(notes.marker!);
  const street=atlas.atlasStreetEntries().find(street=>street.name==='Via Cordioli')!;
  const sheet=atlas.sheets.find(sheet=>sheet.id===street.sheet)!;
  view.setSheet(sheet);atlas.setAtlasSheet(sheet.id);view.zoomAt(8);view.pan(100,100);
  assert.equal(atlas.atlasReference(before.marker!),reference,'References do not depend on the sheet being read');
  notes.pointAt(street);view.focus(street,5);view.setSheet();atlas.setAtlasSheet();
  assert.deepEqual(notes.marker,before.marker);assert.equal(notes.source,before.source);
  assert.equal(atlas.atlasReference(before.marker!),reference);
});
