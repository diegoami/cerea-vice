import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {District} from '../src/world/district';
import {createAtlas} from '../src/ui/Atlas';
import {createAtlasView} from '../src/navigation/AtlasView';
import {createAtlasNotes} from '../src/navigation/AtlasNotes';
import {mapSignature} from '../src/game/Save';
const context=new District(JSON.parse(readFileSync('public/maps/veronese/manifest.json','utf8')));

test('continuous worlds have one town drawing per dispatch town, not hundreds of detail quadrants',()=>{
 const atlas=createAtlas(context);
 assert.equal(atlas.townModes,true);assert.equal(atlas.sheets.length,9);
 for(const stop of context.district.taxi!.stops)assert.equal(atlas.sheetAt(context.nodeById(stop.nodeId))?.id,stop.townId,stop.name);
 const countryside=context.nodes.find(p=>!atlas.sheetAt(p));assert.ok(countryside,'Roads between towns remain regional context');
 const overview=atlas.atlasMarkup('map');
 assert.match(overview,/data-atlas-drawing="regional"/);assert.doesNotMatch(overview,/atlas-scenery-buildings|data-street=/);
 assert.ok((overview.match(/<path/g)??[]).length<200,'Regional roads are batched into a small drawing');
 assert.ok(overview.length<600000,'Regional drawing omits the invisible internal town networks');
 for(const name of ['Oppeano','Casaleone','San Giovanni Lupatoto'])assert.ok(overview.includes(name));
});

test('town detail contains local streets and landmarks, with a rectangular extent and stable knowledge',()=>{
 const atlas=createAtlas(context),view=new (createAtlasView(context).AtlasView)(),notes=new (createAtlasNotes(context).AtlasNotes)();
 const signature=mapSignature(context);notes.pointAt(context.nodeById(context.district.taxi!.stops[0].nodeId));notes.place();const knowledge=notes.snapshot();
 for(const id of ['cerea','oppeano','verona-south']){
  const sheet=atlas.sheets.find(s=>s.id===id)!;atlas.setAtlasSheet(id);view.setSheet(sheet);
  const markup=atlas.atlasMarkup('map'),streets=atlas.atlasStreetEntries();
  assert.match(markup,/data-atlas-drawing="town"/);assert.ok(streets.length>0);
  assert.ok(streets.every(s=>s.sheet===id&&s.x>=sheet.minX&&s.x<=sheet.minX+sheet.width!&&s.z>=sheet.minZ&&s.z<=sheet.minZ+sheet.depth!));
  assert.ok((markup.match(/<path/g)??[]).length<250,'Town geometry is batched instead of one path per global building/road');
  assert.ok((markup.match(/<text/g)??[]).length<1000,'Only the selected town has labels');
  assert.ok(view.base.width<context.district.bounds.maxX-context.district.bounds.minX);
  view.zoomAt(2);view.pan(50,50);assert.deepEqual(notes.snapshot(),knowledge);
 }
 const verona=atlas.sheets.find(s=>s.id==='verona-south')!;
 assert.ok(verona.depth!>verona.width!*1.5,'A long town does not become an oversized square including neighbouring towns');
 assert.equal(mapSignature(context),signature,'Atlas simplification never changes signed map content');
});

test('regional and town references remain tied to the marked place while the reader changes towns',()=>{
 const atlas=createAtlas(context),rural=context.nodes.find(n=>!atlas.sheetAt(n))!,known=context.nodeById(context.district.taxi!.stops[0].nodeId);
 const townReference=atlas.atlasReference(known);assert.equal(atlas.atlasReference(rural),'Regional map');
 for(const sheet of atlas.sheets){atlas.setAtlasSheet(sheet.id);assert.equal(atlas.atlasReference(rural),'Regional map');assert.equal(atlas.atlasReference(known),townReference);}
});

test('a map author can name a town region without sharing its drawing with the regional overview',()=>{
 const original=new District(JSON.parse(readFileSync('public/maps/cerea.json','utf8'))).district;
 const data={...original,taxi:{...original.taxi!,endless:true,stops:original.taxi!.stops.map(s=>({...s,townId:'region',town:'Region Town'}))}};
 const atlas=createAtlas(new District(data));assert.match(atlas.atlasMarkup('map'),/data-atlas-drawing="regional"/);
 atlas.setAtlasSheet('region');assert.match(atlas.atlasMarkup('map'),/data-atlas-drawing="town"/);
});
