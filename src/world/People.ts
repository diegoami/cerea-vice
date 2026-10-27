import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {box,material} from './builders';
import type {District} from './district';
import type {Mission} from '../mission/Mission';
import type {LocalFrame} from './LocalFrame';
import type {Point} from './schema';

/** Faceted, clothed people with a face and bent limbs; no external assets. */
export function createPerson(identity:string,seated=false){
  let hash=0;for(const c of identity)hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;
  const shirt=[0x5f8193,0xa26754,0x73815d,0x9c875a][hash%4];
  const skin=[0xd1ab88,0xb78562,0x98694c][hash%3];
  const hair=[0x473b32,0x756148,0x312f2d][hash%3];
  const group=new THREE.Group();group.name=seated?'Seated passenger':'Waiting person';
  const hip=seated?.38:.82,shoulder=hip+.52,headY=shoulder+.29;
  box(group,0,hip+.25,0,.46,.55,.26,shirt);
  box(group,0,hip-.04,0,.43,.18,.29,0x344451);
  box(group,0,shoulder+.08,0,.13,.13,.14,skin);
  const head=new THREE.Mesh(new THREE.IcosahedronGeometry(.205,1),material(skin));head.scale.set(.84,1.12,.85);head.position.y=headY;group.add(head);
  box(group,0,headY+.15,.025,.31,.12,.29,hair);
  box(group,0,headY+.025,-.18,.065,.085,.065,skin);
  for(const side of [-1,1]){
    box(group,side*.073,headY+.07,-.16,.035,.03,.025,0x303538);
    const sleeve=box(group,side*.27,shoulder-.13,0,.17,.31,.24,shirt);sleeve.rotation.z=side*.12;
    const forearm=box(group,side*.29,shoulder-.36,seated?-.13:0,.13,.25,.14,skin);forearm.rotation.x=seated?-1.0:0;
    if(seated){
      box(group,side*.115,hip-.10,-.21,.18,.18,.51,0x344451);
      box(group,side*.115,hip-.30,-.43,.16,.40,.18,0x344451);
      box(group,side*.115,hip-.49,-.48,.19,.12,.30,0x302f2b);
    }else{
      box(group,side*.115,.41,0,.18,.72,.22,0x344451);
      box(group,side*.115,.08,-.065,.21,.15,.35,0x302f2b);
    }
  }
  // One draw call per colour, rather than one per body part.
  group.updateMatrixWorld(true);const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  for(const child of [...group.children])if(child instanceof THREE.Mesh){
    const geometry=child.geometry.clone().applyMatrix4(child.matrixWorld);
    const expanded=geometry.index?geometry.toNonIndexed():geometry;if(expanded!==geometry)geometry.dispose();
    const list=batches.get(child.material)??[];list.push(expanded);batches.set(child.material,list);
    child.geometry.dispose();child.removeFromParent();
  }
  for(const [mat,parts] of batches){group.add(new THREE.Mesh(mergeGeometries(parts,false)!,mat));for(const g of parts)g.dispose();}
  return group;
}

/** Mission-dependent people live outside disposable visual tiles. */
export class PassengerPresence {
  private figures=new Map<string,THREE.Group>();
  constructor(private context:District,scene:THREE.Scene){
    for(const stop of context.district.taxi?.stops??[]){const figure=createPerson(stop.id);figure.name=`Waiting at ${stop.id}`;this.figures.set(stop.id,figure);scene.add(figure);}
  }
  update(mission:Mission,frame:LocalFrame,near:Point){
    for(const stop of this.context.district.taxi?.stops??[]){
      const figure=this.figures.get(stop.id)!,bay=this.context.parkingZones.find(b=>b.id===stop.bayId)!;
      const p={x:bay.x+bay.width/2-1,z:bay.z+bay.depth/2-1},q=frame.toLocal(p);
      figure.position.set(q.x,.12,q.z);
      figure.visible=!(mission.taxiStage==='dropoff'&&mission.pickupStop?.id===stop.id)&&Math.hypot(p.x-near.x,p.z-near.z)<(this.context.district.streaming?.loadRadius??1100)-45;
    }
  }
}
