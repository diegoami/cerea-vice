import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {TileMaterials} from './TileMaterials';
import type {District} from '../district';
import {roadWidth} from '../district';
import {box,sign,signpost,streetNamePlate,material} from '../builders';
import {createScenery} from '../Scenery';
import type {Point,Rect,Bounds} from '../schema';
import type {TileRef,TilePayload} from './schema';
export type Surfaces=ReturnType<ReturnType<typeof createScenery>['createFacadeMaterials']>;
export interface RenderedTile {group:THREE.Group;anchor:Point;bounds:Bounds;setDetail(enabled:boolean):void;dispose():void}
/** Tile data is local and owner-assigned; all GPU vertices are relative to its centre. */
export function renderTile(context:District,payload:TilePayload,ref:TileRef,surfaces:Surfaces,materials:TileMaterials):RenderedTile{
 const anchor={x:(ref.bounds.minX+ref.bounds.maxX)/2,z:(ref.bounds.minZ+ref.bounds.maxZ)/2};
 const local=(p:Point)=>({x:p.x-anchor.x,z:p.z-anchor.z});
 const localRect=<T extends Rect>(r:T):T=>({...r,...local(r),points:r.points?.map(local),holes:r.holes?.map(h=>h.map(local))});
 const owns=(p:Point)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=ref.bounds.minX&&p.x<ref.bounds.maxX&&p.z>=ref.bounds.minZ&&p.z<ref.bounds.maxZ;
 for(const list of [payload.buildings,payload.props])if(!Array.isArray(list)||list.some(p=>!owns(p)))throw new Error('Invalid tile owner');
 for(const list of [payload.plates,payload.boards])if(!Array.isArray(list)||list.some(p=>!owns(p.position)))throw new Error('Invalid sign owner');
 for(const [indices,items] of [[payload.roads,context.roads],[payload.features,context.district.features],[payload.landmarks,context.landmarks],[payload.bays,context.parkingZones]] as const)if(!Array.isArray(indices)||indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=items.length))throw new Error('Invalid tile reference');
 const midpoint=(a:Point,b:Point)=>({x:(a.x+b.x)/2,z:(a.z+b.z)/2});
 for(const i of payload.roads){const r=context.roads[i];if(!owns(midpoint(context.nodeById(r.a),context.nodeById(r.b))))throw new Error('Invalid road owner');}
 for(const i of payload.features){const f=context.district.features[i];if(!owns(midpoint(f.points[0],f.points.at(-1)!)))throw new Error('Invalid feature owner');}
 for(const i of payload.landmarks)if(!owns(context.landmarks[i]))throw new Error('Invalid landmark owner');
 for(const i of payload.bays)if(!owns(context.parkingZones[i]))throw new Error('Invalid bay owner');
 const group=new THREE.Group(),detail=new THREE.Group(),simple=new THREE.Group(),scenery=createScenery(context);group.add(detail,simple);
 const strip=(parent:THREE.Object3D,a:Point,b:Point,width:number,y:number,h:number,color:number)=>{const m=box(parent,(a.x+b.x)/2,y,(a.z+b.z)/2,Math.hypot(b.x-a.x,b.z-a.z),h,width,color);m.rotation.y=Math.atan2(-(b.z-a.z),b.x-a.x);};
 const rural=anchor.z<-500;box(group,0,-.4,0,250,.7,250,rural?0x84905b:0x7d876b);
 if(rural){box(group,-64,-.035,0,115,.02,235,0x999365);box(group,64,-.035,0,115,.02,235,0x71855a);}
 for(const index of payload.features){const f=context.district.features[index];for(let i=0;i<f.points.length-1;i++){const a=local(f.points[i]),b=local(f.points[i+1]);strip(group,a,b,f.width,0,.05,f.kind==='water'?0x668e94:0x8d8a77);if(f.kind==='rail'){const length=Math.hypot(b.x-a.x,b.z-a.z)||1,nx=-(b.z-a.z)/length*.8,nz=(b.x-a.x)/length*.8;for(const side of [-1,1])strip(group,{x:a.x+side*nx,z:a.z+side*nz},{x:b.x+side*nx,z:b.z+side*nz},.12,.09,.1,0xaab4b1);}}}
 for(const index of payload.roads){const r=context.roads[index],a=local(context.nodeById(r.a)),b=local(context.nodeById(r.b)),w=roadWidth(r);strip(group,a,b,w+2.5,.01,.08,0xb3ae98);strip(group,a,b,w,.075,.06,0x4d5655);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(w/2,w/2,.06,12),material(0x4d5655));cap.position.set(a.x,.075,a.z);group.add(cap);
  const length=Math.hypot(b.x-a.x,b.z-a.z);for(let t=10;t<length-8;t+=12)strip(group,{x:a.x+(b.x-a.x)*t/length,z:a.z+(b.z-a.z)*t/length},{x:a.x+(b.x-a.x)*(t+3)/length,z:a.z+(b.z-a.z)*(t+3)/length},.15,.12,.025,0xe3dbc1);
  if(r.bridge){const nx=-(b.z-a.z)/length*(w/2+.5),nz=(b.x-a.x)/length*(w/2+.5);for(const s of [-1,1])strip(group,{x:a.x+nx*s,z:a.z+nz*s},{x:b.x+nx*s,z:b.z+nz*s},.2,1,.2,0x696f65);}
 }
 const buildings=payload.buildings.map(localRect);
 scenery.decorateBuildings(detail,buildings,surfaces,anchor);
 for(const b of buildings){
  if(b.points){const shape=new THREE.Shape(b.points.map(p=>new THREE.Vector2(p.x,-p.z)));shape.holes=(b.holes??[]).map(h=>new THREE.Path(h.map(p=>new THREE.Vector2(p.x,-p.z))));const geometry=new THREE.ExtrudeGeometry(shape,{depth:b.height,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);simple.add(new THREE.Mesh(geometry,material(scenery.facadeColor(b.x+anchor.x,b.z+anchor.z))));}
  else box(simple,b.x,b.height/2,b.z,b.width,b.height,b.depth,scenery.facadeColor(b.x+anchor.x,b.z+anchor.z));
 }
 for(const index of payload.landmarks){const p=context.landmarks[index],q=local(p);if(p.kind==='church'){box(group,q.x,15,q.z,5,30,5,0xb58c6e);const roof=new THREE.Mesh(new THREE.ConeGeometry(3,6,4),material(0x8f6351));roof.position.set(q.x,33,q.z);group.add(roof);}

 }
 for(const index of payload.bays){const b=localRect(context.parkingZones[index]);box(group,b.x,.14,b.z,b.width,.08,b.depth,0x647d6f);
  for(const s of [-1,1]){box(group,b.x+s*b.width/2,.2,b.z,.2,.03,b.depth,0xf0d7a0);box(group,b.x,.2,b.z+s*b.depth/2,b.width,.03,.2,0xf0d7a0);}

 }
 for(const p of payload.plates)streetNamePlate(group,{...p,position:local(p.position)});
 for(const p of payload.boards){const q=local(p.position);if(p.mounted)sign(group,q.x,p.height,q.z,p.rows,p.width,p.angle,p.color);else signpost(group,q.x,q.z,p.rows,p.angle,p.color,p.width,p.height);}
 scenery.dressStreets(detail,[],payload.props.map(p=>({...p,...local(p)})));
 group.traverse(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material))o.material=materials.use(o.material);});
 const batch=(parent:THREE.Group,exclude?:THREE.Object3D[])=>{
  parent.updateMatrixWorld(true);const groups=new Map<THREE.Material,THREE.BufferGeometry[]>(),originals:THREE.Mesh[]=[];
  parent.traverse(o=>{if(!(o instanceof THREE.Mesh)||Array.isArray(o.material)||exclude?.some(e=>{let p:THREE.Object3D|null=o;while(p){if(p===e)return true;p=p.parent;}return false;}))return;const g=o.geometry.clone().applyMatrix4(o.matrixWorld),expanded=g.index?g.toNonIndexed():g;if(expanded!==g)g.dispose();const list=groups.get(o.material)??[];list.push(expanded);groups.set(o.material,list);originals.push(o);});
  for(const [mat,geometries] of groups){const merged=mergeGeometries(geometries,false);if(!merged)throw new Error('Tile batch mismatch');parent.add(new THREE.Mesh(merged,mat));for(const g of geometries)g.dispose();}
  for(const m of originals){m.removeFromParent();m.geometry.dispose();}
 };
 batch(group,[detail,simple]);batch(detail);batch(simple);
 let disposed=false;
 return {group,anchor,bounds:ref.bounds,setDetail(enabled){detail.visible=enabled;simple.visible=!enabled;},dispose(){if(disposed)return;disposed=true;group.removeFromParent();const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();group.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(!m.userData.shared){materials.add(m);const map=(m as THREE.MeshBasicMaterial).map;if(map)textures.add(map);}}});for(const g of geometries)g.dispose();for(const t of textures)t.dispose();for(const m of materials)m.dispose();group.clear();}};
}
