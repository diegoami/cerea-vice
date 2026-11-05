import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DayNight,daylightAt} from '../src/world/DayNight';
test('sun, moon, stars and illumination follow a repeating day and preserve east/west',()=>{
 const canvas=()=>({width:0,height:0,getContext:()=>new Proxy({}, {get:(_t,k)=>k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true})});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:canvas}});
 const scene=new THREE.Scene();scene.fog=new THREE.Fog(0,160,300);const cycle=new DayNight(scene);
 cycle.update(6);assert.ok(cycle.sun.position.x>900);cycle.update(18);assert.ok(cycle.sun.position.x< -900);
 cycle.update(12);assert.ok(cycle.sunDisc.visible);assert.equal(cycle.moonDisc.visible,false);assert.equal((cycle.stars.material as THREE.PointsMaterial).opacity,0);
 cycle.update(0);assert.equal(cycle.sunDisc.visible,false);assert.ok(cycle.moonDisc.visible);assert.ok((cycle.stars.material as THREE.PointsMaterial).opacity>.8);
 assert.equal(daylightAt(12),daylightAt(36));cycle.position({x:400,z:-200},0);assert.equal(cycle.group.position.x,400);cycle.dispose();assert.equal(cycle.group.parent,null);
 const south=new DayNight(scene,-34);south.update(12);assert.ok(south.sun.position.z<0);south.dispose();
});
