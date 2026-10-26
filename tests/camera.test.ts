import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {MIRROR_MOUNTS} from '../src/driving/Cockpit';
import {CockpitCamera} from '../src/driving/CockpitCamera';
import { createCar } from "../src/driving/Car";
import { District } from "../src/world/district";
import contextHarbor from "../public/maps/harbor.json";
let context=new District(contextHarbor);
let {Car}=createCar(context);
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
test('releasing the stick smoothly recenters yaw and pitch without steering',()=>{
  const camera=new CockpitCamera(),car=new Car();car.heading=.7;
  camera.update(.6,car,0,{...idle,lookX:1,lookY:1});
  const yaw=camera.yawOffset,pitch=camera.pitch;
  camera.update(.05,car,0,idle);
  assert.equal(camera.yawOffset,yaw,'Short grace period avoids snapping');
  camera.update(.2,car,0,idle);
  assert.ok(camera.yawOffset>0&&camera.yawOffset<yaw);
  assert.ok(camera.pitch>pitch);
  for(let i=0;i<120;i++)camera.update(1/60,car,0,idle);
  assert.ok(Math.abs(camera.yawOffset)<.0001);
  assert.ok(Math.abs(camera.pitch+Math.atan2(2.6,30))<.0001);
  assert.equal(car.heading,.7);
});
test('mouse inactivity returns to front, continuous input holds the view, and return is frame independent',()=>{
  const car=new Car(),a=new CockpitCamera(),b=new CockpitCamera();
  for(const camera of [a,b])camera.update(0,car,0,{...idle,mouseX:600,mouseY:-80});
  a.update(.3,car,0,idle);assert.equal(a.yawOffset,1.5);
  a.update(.7,car,0,idle);
  for(let i=0;i<100;i++)b.update(.01,car,0,idle);
  assert.ok(Math.abs(a.yawOffset-b.yawOffset)<1e-10);
  assert.ok(Math.abs(a.pitch-b.pitch)<1e-10);
  a.update(.1,car,0,{...idle,lookX:.1});
  const held=a.yawOffset;a.update(.1,car,0,{...idle,lookX:.1});
  assert.ok(a.yawOffset>held,'Held stick input must never be pulled back');
  car.heading=0;a.reset();a.update(1,car,1,idle);
  assert.ok(a.camera.getWorldDirection(new Vector3()).x>.8,'Held bumper glances still work');
});
test('both mirror housings fit the forward view at 4:3, default and widescreen aspects',()=>{
  const cockpit=new CockpitCamera(),car=new Car();car.x=0;car.z=0;car.heading=0;
  for(const aspect of [4/3,1280/900,1440/900,16/9]) {
    cockpit.camera.aspect=aspect;cockpit.camera.updateProjectionMatrix();cockpit.update(0,car,0,idle);
    cockpit.camera.updateMatrixWorld(true);
    for(const [x,z,angle,,width] of MIRROR_MOUNTS)for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]) {
      const corner=new Vector3(sx*width/2,sy*.105,sz*.035).applyAxisAngle(new Vector3(0,1,0),angle).add(new Vector3(x,1.88,z)).project(cockpit.camera);
      assert.ok(Math.abs(corner.x)<1&&Math.abs(corner.y)<1&&Math.abs(corner.z)<1,`Mirror ${x} clipped at aspect ${aspect}`);
    }
  }
});
