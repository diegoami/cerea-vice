import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import cerea from '../public/maps/cerea.json';
import harbor from '../public/maps/harbor.json';
import { createAtlasView } from "../src/navigation/AtlasView";
import { createAtlas, pinnedGridLabels, roadTier, roadTiersVisible } from "../src/ui/Atlas";
import { District } from "../src/world/district";
import contextHarbor from "../public/maps/harbor.json";
import region from '../public/maps/lower-verona/manifest.json';
import verona from '../public/maps/verona/manifest.json';
import {createAtlasSheets} from '../src/navigation/AtlasSheets';
import {createAtlasNotes} from '../src/navigation/AtlasNotes';
let context=new District(contextHarbor);
let {district}=context;
let {AtlasView}=createAtlasView(context);
let {atlasFrame,atlasReference,atlasStreetEntries,atlasMarkup}=createAtlas(context);
function useDistrict(data:unknown){context=new District(data);({district}=context);({AtlasView}=createAtlasView(context));({atlasFrame,atlasReference,atlasStreetEntries,atlasMarkup}=createAtlas(context));}
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

test('compact dense Verona receives adaptive detail pages while Cerea keeps its single sheet',()=>{
  const context=new District(verona),{sheets,sheetAt,neighbour}=createAtlasSheets(context);
  assert.ok(sheets.length>1,'A dense town needs detail pages despite its modest extent');
  const extent=Math.max(context.district.bounds.maxX-context.district.bounds.minX,context.district.bounds.maxZ-context.district.bounds.minZ);
  for(const point of [...context.nodes,...context.district.areas]){
    const sheet=sheetAt(point)!;
    assert.ok(point.x>=sheet.minX&&point.x<=sheet.minX+sheet.span&&point.z>=sheet.minZ&&point.z<=sheet.minZ+sheet.span);
  }
  assert.ok(Math.max(...sheets.map(sheet=>sheet.span))<extent,'Verona pages are smaller than one whole-district sheet');
  const page=sheetAt(context.spawn)!;
  const east=neighbour(page,1,0)!;
  assert.equal(neighbour(east,-1,0),page);
  assert.ok(east.minX<page.minX+page.span,'Neighbouring pages overlap');
  // No printed page carries more distinct street labels than the busiest accepted regional page.
  const atlas=createAtlas(context),perPage=new Map<string,number>();
  for(const street of atlas.atlasStreetEntries())perPage.set(street.sheet!,(perPage.get(street.sheet!)??0)+1);
  assert.ok(Math.max(...perPage.values())<=90,'Every page stays within the readable label budget');
  assert.equal(createAtlasSheets(new District(cerea)).sheets.length,0,'Cerea stays one readable sheet');
});

test('a Verona street lookup opens its own detail page and shows the name',()=>{
  const context=new District(verona),atlas=createAtlas(context),view=new (createAtlasView(context).AtlasView)();
  const street=atlas.atlasStreetEntries().find(entry=>entry.name==='Via Roma');
  assert.ok(street,'Verona indexes Via Roma');
  const sheet=atlas.sheets.find(entry=>entry.id===street!.sheet)!;
  atlas.setAtlasSheet(sheet.id);view.setSheet(sheet);view.focus(street!,5);
  assert.match(atlas.atlasMarkup('map'),/VIA ROMA/);
  assert.match(atlas.atlasMarkup('map'),/(North|South|East|West) ·/,'Verona detail pages link to their neighbours');
});

test('grid references stay readable while zoomed into the paper (#86)',()=>{
  useDistrict(cerea);
  const frame=atlasFrame(),cell=frame.span/4,inset=8;
  // Deep zoom inside one cell: only that column and row remain, pinned inside the view.
  const box={x:frame.minX+cell*1.2,z:frame.minZ+cell*1.2,width:cell*0.4,height:cell*0.4};
  const {letters,numbers}=pinnedGridLabels(frame,box,inset);
  assert.deepEqual(letters.map(entry=>entry.index),[1]);
  assert.deepEqual(numbers.map(entry=>entry.index),[1]);
  for(const entry of [...letters,...numbers])
    assert.ok(entry.x>=box.x&&entry.x<=box.x+box.width&&entry.y>=box.z&&entry.y<=box.z+box.height,'Pinned labels stay inside the visible box');
  // The whole paper in view: all references at their natural printed positions.
  const full=pinnedGridLabels(frame,{x:frame.minX,z:frame.minZ,width:frame.span,height:frame.span},inset);
  assert.deepEqual(full.letters.map(entry=>entry.index),[0,1,2,3]);
  assert.deepEqual(full.numbers.map(entry=>entry.index),[0,1,2,3]);
  full.letters.forEach((entry,i)=>assert.equal(entry.x,frame.minX+(i+0.5)*cell));
  full.numbers.forEach((entry,i)=>assert.equal(entry.y,frame.minZ+(i+0.5)*cell));
  assert.equal(atlasReference({x:frame.minX+cell*1.5,z:frame.minZ+cell*0.5}),'B1');
  assert.match(atlasMarkup('map'),/data-grid-letter="1"/);
  assert.match(atlasMarkup('map'),/id="atlas-view-reference"/);
});

test('road prominence rises with atlas zoom (#88)',()=>{
  assert.equal(roadTier('primary'),1);assert.equal(roadTier('tertiary'),1);assert.equal(roadTier('unclassified'),1);
  assert.equal(roadTier(undefined),1,'Authored districts without a class always print');
  assert.equal(roadTier('residential'),2);assert.equal(roadTier('pedestrian'),2);
  assert.equal(roadTier('service'),3);assert.equal(roadTier('steps'),3);assert.equal(roadTier('footway'),3);assert.equal(roadTier('mystery'),3,'Unknown classes stay hidden deepest');
  assert.equal(roadTiersVisible(1),1);assert.equal(roadTiersVisible(2),2);assert.equal(roadTiersVisible(3.9),2);assert.equal(roadTiersVisible(4),3);assert.equal(roadTiersVisible(8),3);
  useDistrict(verona);
  const markup=atlasMarkup('map');
  assert.ok(markup.includes('data-road-tier="1"')&&markup.includes('data-road-tier="3"'),'Roads print in three prominence groups');
  assert.ok(markup.indexOf('data-road-tier="3"')<markup.indexOf('data-road-tier="1"'),'The major network prints on top of smaller streets');
  useDistrict(cerea);
  assert.match(atlasMarkup('map'),/data-street="[^"]+" data-road-tier="1"/);
  assert.match(atlasMarkup('map'),/data-street="[^"]+" data-road-tier="2"/,'Street labels carry their prominence');
});

test('turning to another detail page keeps the reader\'s zoom and continues from the same ground (#104)',()=>{
  const context=new District(verona),{sheetAt,neighbour,sheets}=createAtlasSheets(context),view=new (createAtlasView(context).AtlasView)();
  const page=sheetAt(context.spawn)!,east=neighbour(page,1,0)!;
  view.setSheet(page);view.zoomAt(2.25);view.pan(10000,0);
  const edge=view.centre.x;
  view.turnSheet(east);
  assert.equal(view.zoom,2.25,'A page turn keeps the zoom');
  assert.ok(view.box.x>=view.base.x-1e-6&&view.box.x+view.box.width<=view.base.x+view.base.width+1e-6,'The view stays on the new page');
  assert.ok(view.centre.x-edge<view.box.width,'An eastward turn continues next to the ground just read');
  const far=sheets.reduce((a,b)=>Math.hypot(b.minX-page.minX,b.minZ-page.minZ)>Math.hypot(a.minX-page.minX,a.minZ-page.minZ)?b:a);
  view.setSheet(page);view.zoomAt(2);view.pan(-10000,-10000);
  view.turnSheet(far);
  assert.equal(view.zoom,2);
  assert.ok(Math.abs(view.box.x-view.base.x)<1e-6&&Math.abs(view.box.z-view.base.z)<1e-6,'A distant page opens at the same place on the page, here its north-west corner');
  view.turnSheet(page);view.zoom=1;view.turnSheet(east);
  assert.deepEqual(view.box,{...view.base},'At 100% a turn shows the whole new page, as before');
});

test('the place index names the current destination and marks its place and bay, never the map (#87)',()=>{
  const context=new District(verona),atlas=createAtlas(context),stop=context.district.taxi!.stops[0];
  const bay=context.parkingZones.find(zone=>zone.id===stop.bayId)!;
  assert.doesNotMatch(atlas.atlasMarkup('index'),/atlas-destination/,'Free driving names no destination');
  atlas.setAtlasJourney({objective:`Take Elena to ${stop.name}, ${stop.road}. Stop in ${bay.name}.`,bay});
  const index=atlas.atlasMarkup('index');
  assert.match(index,new RegExp(`CURRENT DESTINATION</strong><p>Take Elena to ${stop.name}`));
  assert.ok(index.includes(`<span class="atlas-ref">${atlas.atlasReference(bay)}</span>`),'The destination carries its page and grid reference');
  assert.equal(index.match(/aria-current="location"/g)?.length,2,'The stop\'s landmark and its bay are both marked in the list');
  const map=atlas.atlasMarkup('map');
  assert.doesNotMatch(map,/atlas-destination|Current destination/,'Nothing is drawn on the map');
  atlas.setAtlasJourney();assert.doesNotMatch(atlas.atlasMarkup('index'),/atlas-destination/,'Clearing the journey clears the mark');
});
