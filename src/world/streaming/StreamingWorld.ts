import * as THREE from 'three';
import type {District} from '../district';
import type {Point} from '../schema';
import {SpatialGrid,rectBounds} from '../SpatialGrid';
import {LocalFrame} from '../LocalFrame';
import {createScenery} from '../Scenery';
import {TileMaterials} from './TileMaterials';
import {TileStream,distanceToBounds} from './TileStream';
import {renderTile,type RenderedTile} from './renderTile';
import {streamingColliders} from './colliders';
export class StreamingWorld {
 readonly scene=new THREE.Scene();readonly frame:LocalFrame;readonly colliders;readonly collisionIndex;
 readonly stream:TileStream<RenderedTile>;
 private readonly materials=new TileMaterials();
 private near:Point;
 private surfaces;private detail=true;private sun=new THREE.DirectionalLight(0xffdfae,2);private ambient=new THREE.HemisphereLight(0xffe3bf,0x62776d,1.5);
 private sky:THREE.CanvasTexture;private skyHour=-1;
 constructor(readonly context:District){
  const m=context.district.streaming;if(!context.assetBase)throw new Error('Missing local tile asset directory');if(!m)throw new Error('Streaming world needs a manifest');
  this.near={...context.spawn};this.frame=new LocalFrame(context.spawn);this.colliders=streamingColliders(context);this.collisionIndex=new SpatialGrid(this.colliders,rectBounds);
  this.surfaces=createScenery(context).createFacadeMaterials();this.scene.fog=new THREE.Fog(0xa3b6b4,160,m.fogDistance);this.scene.add(this.sun,this.ambient);
  const canvas=document.createElement('canvas');canvas.width=16;canvas.height=128;this.sky=new THREE.CanvasTexture(canvas);this.sky.colorSpace=THREE.SRGBColorSpace;this.scene.background=this.sky;
  this.stream=new TileStream(m,async ref=>{const response=await fetch(new URL(ref.file,context.assetBase),{cache:"no-store"});if(!response.ok)throw new Error('Missing local tile');return response.json();},(payload,ref)=>{
   const resource=renderTile(context,payload,ref,this.surfaces,this.materials);resource.setDetail(this.detail);this.scene.add(resource.group);this.position(resource);return resource;
  });
  this.updateDaylight(7);this.updateFrame(context.spawn);
 }
 private position(tile:RenderedTile){tile.group.position.set(tile.anchor.x-this.frame.origin.x,0,tile.anchor.z-this.frame.origin.z);tile.group.visible=distanceToBounds(this.near,tile.bounds)<=this.context.district.streaming!.loadRadius-45;}
 updateFrame(point:Point){this.near={x:point.x,z:point.z};this.frame.rebase(point);for(const tile of this.stream.resident.values())this.position(tile);this.stream.update(point);}
 readyAt(point:Point){return this.stream.readyAt(point);}
 setDetail(enabled:boolean){this.detail=enabled;for(const tile of this.stream.resident.values())tile.setDetail(enabled);}
 updateDaylight(hour:number){
  const daylight=Math.max(0,Math.sin((hour-6)/12*Math.PI)),sky=new THREE.Color(0xc6ad94).lerp(new THREE.Color(0x9fb6bf),daylight);
  this.scene.fog!.color.copy(sky);this.sun.intensity=1.8+daylight*1.4;this.ambient.intensity=1.05+daylight*.45;
  const angle=(hour-6)/12*Math.PI;this.sun.position.set(Math.cos(angle)*350,Math.max(70,Math.sin(angle)*350),100);
  if(this.skyHour!==Math.floor(hour*60)){this.skyHour=Math.floor(hour*60);const canvas=this.sky.image as HTMLCanvasElement,c=canvas.getContext('2d')!,g=c.createLinearGradient(0,0,0,128);g.addColorStop(0,'#557e9b');g.addColorStop(.48,'#'+sky.getHexString());g.addColorStop(.58,'#e5c69d');g.addColorStop(1,'#8d8b70');c.fillStyle=g;c.fillRect(0,0,16,128);this.sky.needsUpdate=true;}
 }
 dispose(){this.stream.dispose();this.materials.dispose();this.sky.dispose();for(const m of [...this.surfaces.mats,...this.surfaces.groundMats,this.surfaces.roof]){m.map?.dispose();m.dispose();}}
}
