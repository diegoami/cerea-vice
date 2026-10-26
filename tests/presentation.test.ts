import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSettings, defaults } from '../src/presentation/Settings';
import { BodyMotion } from '../src/presentation/Motion';
import { createScenery } from "../src/world/Scenery";
import { inRect, pointInPolygon } from "../src/world/district";
import { readFileSync } from 'node:fs';
import type { DistrictDefinition } from '../src/world/schema';
import { District } from "../src/world/district";
import contextHarbor from "../public/maps/harbor.json";
let context=new District(contextHarbor);
let {isPaved,district}=context;
let {facadeVariant,planProps,roofGeometry}=createScenery(context);
function useDistrict(data:unknown){context=new District(data);({isPaved,district}=context);({facadeVariant,planProps,roofGeometry}=createScenery(context));}
test('presentation settings reject malformed storage and bound volume',()=>{
 assert.deepEqual(readSettings({getItem:()=>'{'}),defaults);
 assert.deepEqual(readSettings({getItem:()=> 'null'}),defaults);
 assert.equal(readSettings({getItem:()=>JSON.stringify({volume:20,resolution:'gps',motion:false})}).volume,1);
 assert.equal(readSettings({getItem:()=>JSON.stringify({resolution:'gps'})}).resolution,'retro-fine');
 assert.equal(readSettings({getItem:()=>JSON.stringify({motion:false})}).motion,false);
});
test('cockpit motion stays subtle and off is exactly still, including after an impact',()=>{
 const motion=new BodyMotion();
 for(let i=0;i<300;i++){
  motion.update(1/60,i<150?21:0,1,true);
  assert.ok(Math.abs(motion.roll)<=.013);assert.ok(Math.abs(motion.pitch)<=.008);assert.ok(Math.abs(motion.wobble)<=.0053);
 }
 motion.update(1/60,20,1,false);assert.equal(motion.roll,0);assert.equal(motion.pitch,0);assert.equal(motion.wobble,0);
 motion.reset();assert.equal(motion.pitch,0);
});
test('roof facets preserve concave outlines and courtyard holes',()=>{
 const points=[{x:0,z:0},{x:12,z:0},{x:12,z:6},{x:7,z:6},{x:7,z:12},{x:0,z:12}];
 const hole=[{x:2,z:2},{x:4,z:2},{x:4,z:4},{x:2,z:4}];
 const geometry=roofGeometry(points,[hole],8);const p=geometry.getAttribute('position');
 for(let i=0;i<p.count;i+=3){
  const center={x:(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z:(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3};
  assert.ok(pointInPolygon(center,points));assert.ok(!pointInPolygon(center,hole));
  for(let j=i;j<i+3;j++)assert.ok(p.getY(j)>=8&&p.getY(j)<=9.8);
 }
 geometry.dispose();
});
test('Cerea dressing is deterministic, distributed and clear of carriageways, buildings and bays',()=>{
 const map=JSON.parse(readFileSync('public/maps/cerea.json','utf8')) as DistrictDefinition;useDistrict(map);
 const props=planProps();assert.deepEqual(props,planProps());assert.ok(props.length>=8,`${props.length} props`);
 for(const kind of ['tree','lamp','car','person'])assert.ok(props.some(p=>p.kind===kind));
 for(const p of props){assert.ok(!isPaved(p));assert.ok(!district.buildings.some(b=>inRect(p,b,-.5)));assert.ok(!district.parkingZones.some(b=>inRect(p,b,-2)));}
 assert.equal(facadeVariant(20,20),facadeVariant(20,20));
});
test('scenery reserves sign positions and street-plate sightlines',()=>{
 const candidates=planProps();const candidate=candidates[0];assert.ok(candidate);
 assert.ok(!planProps([{position:candidate}]).some(p=>p.x===candidate.x&&p.z===candidate.z));
 const position={x:candidate.x-8,z:candidate.z},viewpoint={x:candidate.x+8,z:candidate.z};
 assert.ok(!planProps([{position,viewpoint}]).some(p=>p.x===candidate.x&&p.z===candidate.z));
});
test('internal resolution respects aspect ratio and Sharp retains display legibility',async()=>{
 const {renderSize}=await import('../src/presentation/Settings');
 assert.deepEqual(renderSize(1920,1080,'retro'),{width:480,height:270});
 assert.deepEqual(renderSize(1280,900,'retro-fine'),{width:768,height:540});
 assert.deepEqual(renderSize(1280,900,'sharp'),{width:1280,height:900});
 assert.deepEqual(renderSize(3840,2160,'sharp',2),{width:1920,height:1080});
});
test('settings tolerate a throwing storage getter as well as blocked reads',()=>{
 assert.deepEqual(readSettings(()=>{throw new DOMException('Storage disabled','SecurityError');}),defaults);
 assert.deepEqual(readSettings({getItem:()=>{throw new DOMException('Storage disabled','SecurityError');}}),defaults);
});
