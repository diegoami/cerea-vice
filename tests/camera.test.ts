import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {CockpitCamera} from '../src/driving/CockpitCamera';
import {Car} from '../src/driving/Car';
const idle={lookX:0,lookY:0,mouseX:0,mouseY:0,resetLook:false};

test('right-stick look can pass the rear and complete a full circle without turning the car',()=>{
  const camera=new CockpitCamera(),car=new Car();car.heading=0;
  const original={x:car.x,z:car.z,heading:car.heading};
  camera.update(Math.PI/2.4,car,0,{...idle,lookX:1});
  assert.ok(camera.camera.getWorldDirection(new Vector3()).z>.99);
  camera.update(Math.PI/2.4,car,0,{...idle,lookX:1});
  assert.ok(camera.camera.getWorldDirection(new Vector3()).z<-.99);
  assert.deepEqual({x:car.x,z:car.z,heading:car.heading},original);
});
test('mouse look can rotate through 360, pitch stays upright, and recenter returns to the car heading',()=>{
  const camera=new CockpitCamera(),car=new Car();car.heading=Math.PI/2;
  camera.update(0,car,0,{...idle,mouseX:Math.PI/.0025,mouseY:-10000});
  assert.ok(Math.abs(camera.yawOffset)>3.1);assert.equal(camera.pitch,Math.PI/3);
  camera.update(0,car,0,{...idle,mouseX:Math.PI/.0025,mouseY:20000});
  assert.ok(Math.abs(camera.yawOffset)<.0001);assert.equal(camera.pitch,-Math.PI/3);
  camera.update(1/60,car,0,{...idle,resetLook:true});
  const forward=camera.camera.getWorldDirection(new Vector3());assert.ok(forward.x>.99);assert.ok(Math.abs(forward.z)<.001);
});
