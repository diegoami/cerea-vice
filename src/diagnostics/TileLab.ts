import * as THREE from 'three';
import type {District} from '../world/district';
import {StreamingWorld} from '../world/streaming/StreamingWorld';
import {Cockpit} from '../driving/Cockpit';
interface LabSample {stage:number;waitMs:number;medianFrameMs:number;p95FrameMs:number;heapBytes:number;geometryBufferBytes:number;geometries:number;textures:number;resident:number;loads:number;unloads:number}
export interface LabResult {done:boolean;error?:string;samples:LabSample[];manifestBytes:number;fetchMs:number;buildMs:number;afterDispose?:{geometries:number;textures:number;resident:number}}
declare global {interface Window {tileLabResult?:LabResult}}
/** Explicit diagnostic entry only: a scripted station tour, not a drive or navigation aid. */
export function runTileLab(root:HTMLElement,context:District){
 const m=context.district.streaming;if(!m)throw new Error('Tile lab requires the prototype district');
 const world=new StreamingWorld(context),renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(Math.round(innerWidth*540/innerHeight),540,false);renderer.domElement.id='viewport';renderer.domElement.classList.add('pixel-picture');root.append(renderer.domElement);
 const panel=document.createElement('pre');panel.id='tile-lab-status';panel.style.cssText='position:absolute;z-index:30;left:12px;top:12px;padding:12px;background:#172b2eee;color:#eee1bd;font:13px monospace;max-width:85vw;white-space:pre-wrap';root.append(panel);
 const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.1,1500),interior=new Cockpit(world.scene);
 const gateway=context.nodeById('1399692873'),hamlet=context.nodeById('test-square');
 const stations=[context.spawn,{x:gateway.x,z:gateway.z+100},{x:40,z:-1150},{x:hamlet.x,z:hamlet.z+100},context.spawn];
 const result:LabResult={done:false,samples:[],manifestBytes:new TextEncoder().encode(JSON.stringify(context.district)).length,fetchMs:0,buildMs:0};window.tileLabResult=result;
 let stage=0,begin=performance.now(),warm=0,last=0,frames:number[]=[],readyTime=0;
 const snapshot=()=>{const geometries=new Set<THREE.BufferGeometry>();world.scene.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});let geometryBufferBytes=0;for(const g of geometries){for(const a of Object.values(g.attributes))geometryBufferBytes+=a.array.byteLength;geometryBufferBytes+=g.index?.array.byteLength??0;}return {geometryBufferBytes,heapBytes:(performance as Performance&{memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize??0,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,resident:world.stream.resident.size,loads:world.stream.stats.loads,unloads:world.stream.stats.unloads};};
 const stop=()=>{renderer.setAnimationLoop(null);result.fetchMs=world.stream.stats.fetchMs;result.buildMs=world.stream.stats.buildMs;world.dispose();result.afterDispose={geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,resident:world.stream.resident.size};result.done=true;panel.textContent='TILE LAB COMPLETE · scripted jumps, not gameplay\n'+JSON.stringify(result,null,2);};
 renderer.setAnimationLoop(time=>{
  const point=stations[stage],heading=stage===0||stage===4?context.spawn.heading:0;
  world.updateFrame(point);world.updateDaylight(8);
  const local=world.frame.toLocal(point);camera.position.set(local.x,2.05,local.z);camera.lookAt(local.x+Math.sin(heading)*30,2.05-2.6,local.z-Math.cos(heading)*30);
  interior.update({...local,heading,speed:0,steering:0,gear:'D'});interior.renderMirrors(renderer,world.scene,last?Math.min(.1,(time-last)/1000):0);renderer.render(world.scene,camera);
  panel.textContent=`TILE LAB · scripted station ${stage+1}/${stations.length} (no gameplay)\n${world.stream.resident.size} resident · ${world.stream.stats.loads} loads / ${world.stream.stats.unloads} unloads\nWaiting/load time and delivered frame samples are collected separately.`;
  if(world.stream.stats.failures){result.error='Local tile load/build failed';stop();return;}
  if(world.readyAt(point)&&world.stream.loading===0){
   if(!readyTime)readyTime=performance.now();
   warm++;if(warm>12&&last)frames.push(time-last);
   if(frames.length>=40){frames.sort((a,b)=>a-b);result.samples.push({stage,waitMs:readyTime-begin,medianFrameMs:frames[20],p95FrameMs:frames[38],...snapshot()});stage++;
    if(stage===stations.length){stop();return;}begin=performance.now();readyTime=0;warm=0;frames=[];last=0;return;
   }
  }
  last=time;
 });
 window.addEventListener('pagehide',()=>{world.dispose();renderer.dispose();},{once:true});
}
