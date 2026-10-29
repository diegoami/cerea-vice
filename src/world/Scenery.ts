import {createPerson} from './People';
import * as THREE from 'three';
import { roadWidth, inRect, pointInPolygon, projectToSegment, type Point } from "./district";
import { box, material } from './builders';
import { District } from "./district";
import { facades, shutters, facadeTrim as trim, props } from './palette';
export interface PropPlan extends Point {kind:'tree'|'lamp'|'car'|'person';angle:number;}
export interface Sightline {position:Point;viewpoint?:Point}
export function createScenery(context:District){
const {district,roads,nodeById,isPaved}=context;
// Façades vary by 65 m block; a "full" district varies them building by building (#24).
function facadeVariant(x:number,z:number){return district.preset==='full'?Math.abs(Math.round(x*7+z*13))%4:Math.abs(Math.floor(x/65)*13+Math.floor(z/65)*7)%4;}
const palette=facades;
function facadeColor(x:number,z:number){return palette[facadeVariant(x,z)];}
function paintedFacade(variant:number,ground=false){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const c=canvas.getContext('2d')!;
  c.fillStyle='#'+palette[variant].toString(16);c.fillRect(0,0,128,128);
  c.fillStyle=trim.plinth;c.fillRect(0,120,128,8);c.fillRect(0,1,128,3);
  for(const x of [20,82]){
    c.fillStyle=trim.frame;c.fillRect(x-3,22,35,64);
    c.fillStyle=trim.glass;c.fillRect(x,25,29,56);
    c.fillStyle=shutters[variant];
    for(const side of [-1,1]){const sx=x+(side<0?-13:29);c.fillRect(sx,23,12,61);c.strokeStyle=trim.slat;for(let y=28;y<80;y+=6){c.beginPath();c.moveTo(sx,y);c.lineTo(sx+12,y);c.stroke();}}
    c.fillStyle=trim.mullion;c.fillRect(x+13,25,2,56);c.fillRect(x,50,29,2);
  }
  // Every fourth frontage includes a little glazed shop door; never goal-dependent.
  if(ground&&variant===2){c.fillStyle='#463d35';c.fillRect(42,62,37,66);c.fillStyle=trim.doorGlass;c.fillRect(47,68,27,37);c.fillStyle='#e3c584';c.fillRect(68,110,3,3);c.fillStyle='#775a48';c.fillRect(34,54,53,9);}
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.NearestFilter;
  return new THREE.MeshLambertMaterial({map:texture});
}
function roofGeometry(points:Point[],holes:Point[][],height:number){
  const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p.x,-p.z)));
  shape.holes=holes.map(r=>new THREE.Path(r.map(p=>new THREE.Vector2(p.x,-p.z))));
  const flat=new THREE.ShapeGeometry(shape).toNonIndexed();
  const p=flat.getAttribute('position');const vertices:number[]=[];const uv:number[]=[];
  for(let i=0;i<p.count;i+=3){
    const a=new THREE.Vector3(p.getX(i),height,-p.getY(i));
    const b=new THREE.Vector3(p.getX(i+1),height,-p.getY(i+1));
    const c=new THREE.Vector3(p.getX(i+2),height,-p.getY(i+2));
    const center=a.clone().add(b).add(c).multiplyScalar(1/3);
    const area=b.clone().sub(a).cross(c.clone().sub(a)).length()/2;
    center.y+=Math.min(1.8,area/(a.distanceTo(b)+b.distanceTo(c)+c.distanceTo(a)));
    for(const pair of [[a,b],[b,c],[c,a]])for(const v of [pair[0],center,pair[1]]){vertices.push(v.x,v.y,v.z);uv.push(v.x/2,v.z/2);}
  }
  flat.dispose();const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();return geometry;
}
function createFacadeMaterials(){
  const mats=[0,1,2,3].map(v=>paintedFacade(v));
  const groundMats=[0,1,2,3].map(v=>paintedFacade(v,true));
  const tile=document.createElement('canvas');tile.width=32;tile.height=32;const c=tile.getContext('2d')!;
  c.fillStyle='#915b47';c.fillRect(0,0,32,32);c.strokeStyle='#bd8058';c.lineWidth=2;
  for(let x=0;x<=32;x+=8){c.beginPath();c.moveTo(x,0);c.lineTo(x,32);c.stroke();}
  for(let y=0;y<=32;y+=8){c.beginPath();c.moveTo(0,y);c.lineTo(32,y);c.stroke();}
  const map=new THREE.CanvasTexture(tile);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.colorSpace=THREE.SRGBColorSpace;map.magFilter=THREE.NearestFilter;
  const roof=new THREE.MeshLambertMaterial({map,side:THREE.DoubleSide});
  for(const m of [...mats,...groundMats,roof])m.userData.shared=true;
  return {mats,groundMats,roof};
}
function decorateBuildings(parent:THREE.Group,buildings=district.buildings,surfaces=createFacadeMaterials(),paletteOrigin:Point={x:0,z:0}){
  const {mats,groundMats,roof}=surfaces;
  for(const building of buildings){
    const points=building.points??[{x:building.x-building.width/2,z:building.z-building.depth/2},{x:building.x+building.width/2,z:building.z-building.depth/2},{x:building.x+building.width/2,z:building.z+building.depth/2},{x:building.x-building.width/2,z:building.z+building.depth/2}];
    parent.add(new THREE.Mesh(roofGeometry(points,building.holes??[],building.height+.02),roof));
    for(const ring of [points,...(building.holes??[])])for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];const length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.00001)continue;
      let nx=-(b.z-a.z)/length,nz=(b.x-a.x)/length;
      const mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};const probe={x:mid.x+nx*.1,z:mid.z+nz*.1};if(pointInPolygon(probe,points)&&!(building.holes??[]).some(hole=>pointInPolygon(probe,hole))){nx=-nx;nz=-nz;}
      const groundHeight=Math.min(3.2,building.height);
      for(const [bottom,h,mat] of [[0,groundHeight,groundMats[facadeVariant(building.x+paletteOrigin.x,building.z+paletteOrigin.z)]],[groundHeight,building.height-groundHeight,mats[facadeVariant(building.x+paletteOrigin.x,building.z+paletteOrigin.z)]]] as const){
        if(h<=0)continue;
        const geometry=new THREE.PlaneGeometry(length,h);
        const uv=geometry.getAttribute('uv');for(let j=0;j<uv.count;j++)uv.setXY(j,uv.getX(j)*length/4,uv.getY(j)*h/3.2);
        const mesh=new THREE.Mesh(geometry,mat);
        mesh.position.set(mid.x, bottom+h/2,mid.z);mesh.rotation.y=Math.atan2(nx,nz);parent.add(mesh);
      }
    }
  }
}
function planProps(signs:Sightline[]=[]):PropPlan[]{
 const result:PropPlan[]=[];
 if(district.preset==='sketch')return result; // A sketch has no trees, lamps, parked cars or bystanders.
 for(let i=0;i<roads.length;i+=3){const road=roads[i],a=nodeById(road.a),b=nodeById(road.b),length=Math.hypot(b.x-a.x,b.z-a.z);if(length<14)continue;
  const kind=(['tree','lamp','car','person'] as const)[i%4];
  const radius=kind==='tree'?2.3:kind==='car'?2.3:kind==='lamp'?1:.5;
  const offset=roadWidth(road)/2+radius+1.8;
  const p={x:(a.x+b.x)/2-(b.z-a.z)/length*offset,z:(a.z+b.z)/2+(b.x-a.x)/length*offset};
  const bounds=district.bounds;if(p.x<bounds.minX+4||p.x>bounds.maxX-4||p.z<bounds.minZ+4||p.z>bounds.maxZ-4)continue;
  if([-radius,0,radius].some(dx=>[-radius,0,radius].some(dz=>isPaved({x:p.x+dx,z:p.z+dz})||context.buildings.at({x:p.x+dx,z:p.z+dz},.5).some(r=>inRect({x:p.x+dx,z:p.z+dz},r,-.5))||district.parkingZones.some(r=>inRect({x:p.x+dx,z:p.z+dz},r,-2)))))continue;
  if(signs.some(sign=>Math.hypot(sign.position.x-p.x,sign.position.z-p.z)<5||(sign.viewpoint&&Math.hypot(projectToSegment(p,sign.position,sign.viewpoint).x-p.x,projectToSegment(p,sign.position,sign.viewpoint).z-p.z)<3)))continue;
  if(result.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<15))continue;
  result.push({...p,kind,angle:Math.atan2(-(b.z-a.z),b.x-a.x)});
 }
 return result;
}
function dressStreets(parent:THREE.Group,signs:Sightline[]=[],planned=planProps(signs)){
 for(const p of planned){
  const group=new THREE.Group();group.position.set(p.x,0,p.z);group.rotation.y=p.angle;parent.add(group);
  if(p.kind==='tree'){box(group,0,1.5,0,.35,3,.35,props.trunk);const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(2,0),material(props.crown));crown.position.y=3.4;group.add(crown);}
  if(p.kind==='lamp'){box(group,0,2.7,0,.16,5.4,.16,props.post);box(group,.4,5.4,0,1.2,.15,.4,props.lampHead);}
  if(p.kind==='car'){box(group,0,.65,0,3.8,.8,1.65,props.carBody);box(group,0,1.25,0,2,.6,1.5,props.carGlass);for(const x of [-1.2,1.2])for(const z of [-.8,.8])box(group,x,.35,z,.6,.6,.2,props.tyre);}
  if(p.kind==='person')group.add(createPerson(`${p.x}/${p.z}`));
 }
}
return {facadeVariant,facadeColor,roofGeometry,createFacadeMaterials,decorateBuildings,planProps,dressStreets};
}
