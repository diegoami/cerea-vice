import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import registryData from '../public/maps/towns.json';
import {District} from '../src/world/district';
import {createNavigation} from '../src/navigation/Navigation';
import {validateRegistry,requestedDistrict,selectDistrict,type TownRegistry} from '../src/world/load';

const registry=validateRegistry(registryData);
const load=(map:string)=>JSON.parse(readFileSync(`public/maps/${map}`,'utf8'));

test('the district list rejects malformed entries, naming the problem',()=>{
 const variant=(change:(data:any)=>void)=>{const data=structuredClone(registryData) as any;change(data);return ()=>validateRegistry(data);};
 assert.throws(variant(d=>{d.towns.push({...d.towns[0]});}),/"cerea" is listed twice/);
 assert.throws(variant(d=>{d.default='verona';}),/default district is not listed/);
 assert.throws(variant(d=>{d.towns[0].map='../../secret.json';}),/needs a map file inside maps\//);
 assert.throws(variant(d=>{d.towns[0].map='/etc/cerea.json';}),/needs a map file inside maps\//);
 assert.throws(variant(d=>{delete d.towns[1].taxi;}),/"harbor" needs taxi and provenance flags/);
 assert.throws(variant(d=>{d.towns[0].frame='global';}),/unknown frame/);
 assert.throws(variant(d=>{d.towns[0].id='Cerea Centro';}),/invalid id/);
 assert.throws(variant(d=>{d.towns=[];}),/no districts are listed/);
 assert.throws(variant(d=>{d.version=2;}),/version must be 1/);
});

test('every listed district loads and matches its entry, map file and spec',()=>{
 const ids=new Set(registry.towns.map(t=>t.id));
 for(const town of registry.towns){
  assert.ok(existsSync(`public/maps/${town.map}`),`${town.id}: maps/${town.map} exists`);
  const data=load(town.map),context=new District(data);
  assert.equal(context.district.id,town.id,`${town.id}: the map's id matches`);
  assert.equal(data.attribution,town.attribution,`${town.id}: attribution matches`);
  assert.equal(Boolean(data.taxi),town.taxi,`${town.id}: taxi flag matches`);
  assert.equal(Boolean(data.provenance),town.provenance,`${town.id}: provenance flag matches`);
  assert.equal(town.frame==='authored',!town.provenance,`${town.id}: only authored districts lack provenance`);
  if(town.derivedFrom)assert.ok(ids.has(town.derivedFrom),`${town.id}: derived from a listed district`);
  if(town.spec){
   const spec=JSON.parse(readFileSync(town.spec,'utf8'));
   assert.deepEqual([spec.id,spec.name,spec.dataVersion,spec.attribution,spec.output],[town.id,town.name,town.dataVersion,town.attribution,`public/maps/${town.map}`],`${town.id}: the registry entry is the spec's`);
  }
  for(const view of town.views??[])if(view.bay)assert.ok(context.parkingZones.some(b=>b.id===view.bay),`${town.id}: view ${view.name} names a bay`);
 }
});

test('in every taxi district, every stop has a bay and every directed stop pair is reachable',()=>{
 for(const town of registry.towns.filter(t=>t.taxi)){
  const context=new District(load(town.map)),nav=createNavigation(context),stops=context.district.taxi!.stops;
  for(const stop of stops)assert.ok(context.parkingZones.some(b=>b.id===stop.bayId),`${town.id}: ${stop.id} has its bay`);
  for(const a of stops)for(const b of stops)if(a!==b)
   assert.ok(Number.isFinite(nav.shortestRoute(a.nodeId,b.nodeId).cost),`${town.id}: ${a.id} → ${b.id} is reachable`);
 }
});

test('an unlisted or removed district falls back to the default without deleting anything',()=>{
 const storage=new Map<string,string>();let removed=0,reloads=0;
 const location={hash:'',href:'cerea://game/'};
 Object.defineProperty(globalThis,'localStorage',{value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:()=>removed++},configurable:true});
 Object.defineProperty(globalThis,'window',{value:{location:{...location,get hash(){return location.hash;},reload:()=>reloads++}},configurable:true});
 Object.defineProperty(globalThis,'history',{value:{replaceState:(_s:unknown,_t:string,url:string)=>{location.hash=url;}},configurable:true});
 const list:TownRegistry={...registry};
 assert.equal(requestedDistrict(list),'cerea','Nothing chosen: the default');
 location.hash='#district=harbor';assert.equal(requestedDistrict(list),'harbor','The URL choice wins');
 location.hash='#district=verona';storage.set('cerea-district','atlantis');
 assert.equal(requestedDistrict(list),'cerea','Unlisted choices fall back to the default');
 assert.equal(storage.get('cerea-district'),'atlantis','The remembered choice is not overwritten');assert.equal(removed,0);
 storage.set('cerea-district','cerea-outskirts');location.hash='';assert.equal(requestedDistrict(list),'cerea-outskirts','A listed remembered choice is used');
 selectDistrict(list.towns,'atlantis');assert.equal(reloads,0,'An unlisted district is never selected');
 selectDistrict(list.towns,'harbor');assert.equal(reloads,1);assert.equal(storage.get('cerea-district'),'harbor');assert.equal(location.hash,'#district=harbor');
});
