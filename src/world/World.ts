import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { district, nodes, roads, nodeById, parkingZones, landmarks, isPaved, projectToSegment, pointInPolygon, type Point, type Rect } from "./district";
import { HarborWorld } from "./HarborWorld";
import { box, sign, signpost, material } from "./builders";
import { junctionDirections } from "./directions";

function strip(parent: THREE.Object3D, a: Point, b: Point, width: number, y: number, height: number, color: number) {
  const mesh=box(parent,(a.x+b.x)/2,y,(a.z+b.z)/2,Math.hypot(b.x-a.x,b.z-a.z),height,width,color);
  mesh.rotation.y=Math.atan2(-(b.z-a.z),b.x-a.x);return mesh;
}
function footprint(parent:THREE.Object3D, points:Point[], height:number,color:number) {
  const shape=new THREE.Shape(points.map((p)=>new THREE.Vector2(p.x,-p.z)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1});
  geometry.rotateX(-Math.PI/2);
  const mesh=new THREE.Mesh(geometry,material(color));parent.add(mesh);
}

export class World {
  readonly scene: THREE.Scene;
  readonly colliders: Rect[];
  constructor() {
    if(district.id==="harbor") { const legacy=new HarborWorld();this.scene=legacy.scene;this.colliders=legacy.colliders;return; }
    this.scene=new THREE.Scene();this.colliders=[];
    const scene=this.scene,bounds=district.bounds;
    const width=bounds.maxX-bounds.minX,depth=bounds.maxZ-bounds.minZ;
    scene.background=new THREE.Color(0xa3b6b4);scene.fog=new THREE.Fog(0xa3b6b4,160,1100);
    scene.add(new THREE.HemisphereLight(0xffe3bf,0x62776d,2.3));
    const sun=new THREE.DirectionalLight(0xffdfae,2);sun.position.set(-200,300,100);scene.add(sun);
    box(scene,(bounds.minX+bounds.maxX)/2,-0.4,(bounds.minZ+bounds.maxZ)/2,width+100,0.7,depth+100,0x7d876b);
    for(const feature of district.features) {
      for(let i=0;i<feature.points.length-1;i++) {
        const a=feature.points[i],b=feature.points[i+1];
        if(feature.kind==="water") {
          strip(scene,a,b,feature.width+2,-0.06,0.1,0xadb09a);
          strip(scene,a,b,feature.width,0,0.05,0x668e94);
          const length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/6);
          const nx=-(b.z-a.z)/(length||1)*feature.width/2,nz=(b.x-a.x)/(length||1)*feature.width/2;
          for(let j=0;j<steps;j++) {
            const p={x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps};
            const q={x:a.x+(b.x-a.x)*(j+1)/steps,z:a.z+(b.z-a.z)*(j+1)/steps};
            if(isPaved({x:(p.x+q.x)/2,z:(p.z+q.z)/2}))continue;
            this.colliders.push({x:(p.x+q.x)/2,z:(p.z+q.z)/2,width:Math.abs(q.x-p.x)+feature.width,depth:Math.abs(q.z-p.z)+feature.width,points:[{x:p.x+nx,z:p.z+nz},{x:q.x+nx,z:q.z+nz},{x:q.x-nx,z:q.z-nz},{x:p.x-nx,z:p.z-nz}]});
          }
        } else {
          strip(scene,a,b,4,0.01,0.05,0x8d8a77);
          const length=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/(length||1)*0.8,nz=(b.x-a.x)/(length||1)*0.8;
          for(const side of [-1,1])strip(scene,{x:a.x+nx*side,z:a.z+nz*side},{x:b.x+nx*side,z:b.z+nz*side},0.12,0.09,0.1,0xaab4b1);
        }
      }
    }
    for(const road of roads) {
      const a=nodeById(road.a),b=nodeById(road.b),w=road.width??8;
      strip(scene,a,b,w+2.5,0.01,0.08,0xb3ae98);
    }
    for(const road of roads) {
      const a=nodeById(road.a),b=nodeById(road.b),w=road.width??8;
      strip(scene,a,b,w,0.075,0.06,0x4d5655);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(w/2,w/2,0.06,12),material(0x4d5655));cap.position.set(a.x,0.075,a.z);scene.add(cap);
      const length=Math.hypot(b.x-a.x,b.z-a.z);
      for(let t=10;t<length-8;t+=12) {
        const p={x:a.x+(b.x-a.x)*t/length,z:a.z+(b.z-a.z)*t/length};
        const q={x:a.x+(b.x-a.x)*(t+3)/length,z:a.z+(b.z-a.z)*(t+3)/length};
        strip(scene,p,q,0.15,0.12,0.025,0xe3dbc1);
      }
      if(road.bridge) {
        const nx=-(b.z-a.z)/length*(w/2+0.5),nz=(b.x-a.x)/length*(w/2+0.5);
        for(const side of [-1,1])strip(scene,{x:a.x+nx*side,z:a.z+nz*side},{x:b.x+nx*side,z:b.z+nz*side},0.2,1,0.2,0x696f65);
      }
    }
    for(const building of district.buildings) {
      if(building.points)footprint(scene,building.points,building.height,building.color);
      else box(scene,building.x,building.height/2,building.z,building.width,building.height,building.depth,building.color);
      this.colliders.push(building);
      if(building.points) {
        const walls=building.points.map((a,i)=>({a,b:building.points![(i+1)%building.points!.length]})).sort((a,b)=>Math.hypot(b.b.x-b.a.x,b.b.z-b.a.z)-Math.hypot(a.b.x-a.a.x,a.b.z-a.a.z)).slice(0,2);
        for(const wall of walls) {
          const length=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z);if(length<5)continue;
          let nx=-(wall.b.z-wall.a.z)/length,nz=(wall.b.x-wall.a.x)/length;
          const mid={x:(wall.a.x+wall.b.x)/2,z:(wall.a.z+wall.b.z)/2};
          if(pointInPolygon({x:mid.x+nx*0.1,z:mid.z+nz*0.1},building.points)){nx=-nx;nz=-nz;}
          for(const t of [0.25,0.5,0.75]) {
            const window=box(scene,wall.a.x+(wall.b.x-wall.a.x)*t+nx*0.04,Math.min(3.5,building.height-1),wall.a.z+(wall.b.z-wall.a.z)*t+nz*0.04,1.4,1.5,0.06,0x586d68);
            window.rotation.y=Math.atan2(-(wall.b.z-wall.a.z),wall.b.x-wall.a.x);
          }
        }
      }
    }
    for(const place of landmarks) {
      if(place.kind==="church") {
        // A brick campanile and tiled church roof distinguish San Zeno from civic buildings.
        box(scene,place.x-place.width/2+3,15,place.z-place.depth/2+3,5,30,5,0xb58c6e);
        const roof=new THREE.Mesh(new THREE.ConeGeometry(4,6,4),material(0x8f6351));roof.position.set(place.x-place.width/2+3,33,place.z-place.depth/2+3);scene.add(roof);
      }
      const h=Math.min((place.height??9)*0.55,7);
      const facade=(place.points??[{x:place.x-place.width/2,z:place.z-place.depth/2},{x:place.x+place.width/2,z:place.z-place.depth/2},{x:place.x+place.width/2,z:place.z+place.depth/2},{x:place.x-place.width/2,z:place.z+place.depth/2}]);
      const walls=facade.map((a,i)=>{
        const b=facade[(i+1)%facade.length],mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
        const nearest=roads.filter((road)=>road.name===place.road).map((road)=>projectToSegment(mid,nodeById(road.a),nodeById(road.b))).sort((a,b)=>Math.hypot(a.x-mid.x,a.z-mid.z)-Math.hypot(b.x-mid.x,b.z-mid.z))[0];
        return {a,b,mid,nearest,length:Math.hypot(b.x-a.x,b.z-a.z)};
      }).filter((wall)=>wall.length>7&&wall.nearest).sort((a,b)=>Math.hypot(a.nearest.x-a.mid.x,a.nearest.z-a.mid.z)-Math.hypot(b.nearest.x-b.mid.x,b.nearest.z-b.mid.z));
      const wall=walls[0];
      if(wall) {
        const dx=wall.nearest.x-wall.mid.x,dz=wall.nearest.z-wall.mid.z,length=Math.hypot(dx,dz)||1;
        const text=place.kind==="church"?["SAN ZENO"]:place.kind==="civic"?["MUNICIPIO"]:place.kind==="library"?["BIBLIOTECA","DI CEREA"]:["SCUOLA","OLGA VISENTINI"];
        sign(scene,wall.mid.x+dx/length*0.1,h,wall.mid.z+dz/length*0.1,text,Math.min(14,wall.length-1),Math.atan2(-(wall.b.z-wall.a.z),wall.b.x-wall.a.x),place.kind==="church"?"#774e3c":"#31594e");
      }
    }
    for(const zone of parkingZones) {
      box(scene,zone.x,0.14,zone.z,zone.width,0.08,zone.depth,0x647d6f);
      for(const side of [-1,1]) {
        box(scene,zone.x+side*zone.width/2,0.2,zone.z,0.2,0.03,zone.depth,0xf0d7a0);
        box(scene,zone.x,0.2,zone.z+side*zone.depth/2,zone.width,0.03,0.2,0xf0d7a0);
      }
      signpost(scene,zone.x,zone.z+zone.depth/2+1,["P",zone.name.toUpperCase()],0,"#31594e",5);
      signpost(scene,zone.x+zone.width/2+1,zone.z,["P",zone.name.toUpperCase()],-Math.PI/2,"#31594e",5);
    }
    for(const node of nodes) {
      const links=roads.filter((road)=>road.a===node.id||road.b===node.id);
      if(links.length<3)continue;
      for(const incoming of links) {
        if(incoming.oneWay&&incoming.b!==node.id)continue;
        const from=nodeById(incoming.a===node.id?incoming.b:incoming.a);
        const length=Math.hypot(node.x-from.x,node.z-from.z);if(length<8)continue;
        const dx=(node.x-from.x)/length,dz=(node.z-from.z)/length;
        const rows=junctionDirections(node.id,from.id).slice(0,3);
        if(!rows.length)continue;
        const setback=Math.min(18,length*0.6),offset=(incoming.width??8)/2+2.5;
        signpost(scene,node.x-dx*setback-dz*offset,node.z-dz*setback+dx*offset,rows,Math.atan2(-dx,-dz),"#31594e",7);
      }
    }
    // Visible edge markers communicate the intentionally bounded neighbourhood.
    for(const node of nodes.filter((node)=>roads.filter((r)=>r.a===node.id||r.b===node.id).length===1)) {
      signpost(scene,node.x,node.z,["FINE ZONA", "TURN BACK"],0,"#755e46",6);
    }
    scene.updateMatrixWorld(true);
    const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
    const originals:THREE.Mesh[]=[];
    scene.traverse((object)=>{
      if(!(object instanceof THREE.Mesh)||!(object.material instanceof THREE.MeshLambertMaterial))return;
      const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
      if(geometry.index) { const expanded=geometry.toNonIndexed();geometry.dispose();
        const group=batches.get(object.material)??[];group.push(expanded);batches.set(object.material,group);
      } else {const group=batches.get(object.material)??[];group.push(geometry);batches.set(object.material,group);}
      originals.push(object);
    });
    for(const [mat,geometries] of batches) {
      const merged=mergeGeometries(geometries,false);
      if(merged)scene.add(new THREE.Mesh(merged,mat));
      for(const geometry of geometries)geometry.dispose();
    }
    for(const mesh of originals){mesh.removeFromParent();mesh.geometry.dispose();}
  }
}
