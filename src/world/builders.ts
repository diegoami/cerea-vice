import * as THREE from "three";
import type { Rect } from "./district";
import type { DirectionRow } from "./directions";
import { props } from "./palette";

const materials = new Map<number, THREE.MeshLambertMaterial>();
export function material(color: number) {
  if (!materials.has(color))
    materials.set(
      color,
      new THREE.MeshLambertMaterial({ color, flatShading: true }),
    );
  const result=materials.get(color)!;result.userData.shared=true;return result;
}

export function box(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  color: number,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Text is generated locally; no fonts, textures or remote assets are fetched. */
export function sign(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  lines: (string | DirectionRow)[],
  width: number,
  angle = 0,
  color = "#163b3d",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = lines.length * 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#dbe9d2";
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = "#f6f0d3";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 48px monospace";
  lines.forEach((line, i) => {
    const y = i * 128 + 64;
    if (typeof line === "string") {
      ctx.textAlign = "center";
      ctx.font = "bold 48px monospace";
      ctx.fillText(line, 384, y, 716);
      return;
    }
    // Draw arrows as geometry so their shape does not depend on installed fonts.
    ctx.save();
    ctx.translate(76, y);
    ctx.rotate(line.direction === "left" ? -Math.PI / 2 : line.direction === "right" ? Math.PI / 2 : 0);
    ctx.beginPath();
    ctx.moveTo(-9, 36);
    ctx.lineTo(9, 36);
    ctx.lineTo(9, -4);
    ctx.lineTo(30, -4);
    ctx.lineTo(0, -36);
    ctx.lineTo(-30, -4);
    ctx.lineTo(-9, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.textAlign = "left";
    ctx.font = "bold 52px Arial";
    ctx.fillText(line.text, 142, y - 18, 590);
    ctx.font = "32px Arial";
    ctx.fillText(line.detail, 142, y + 30, 590);
    if (i > 0) {
      ctx.fillRect(24, i * 128, 720, 2);
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(
    width,
    (width * canvas.height) / canvas.width,
  );
  const face = new THREE.MeshBasicMaterial({ map: texture });
  const directional = lines.some((line) => typeof line !== "string");
  for (const side of [0, 1]) {
    const mesh = new THREE.Mesh(geometry, side === 1 && directional
      ? new THREE.MeshBasicMaterial({ color })
      : face);
    mesh.position.z = side === 0 ? 0.03 : -0.03;
    mesh.rotation.y = side * Math.PI;
    group.add(mesh);
  }
  group.position.set(x, y, z);
  group.rotation.y = angle;
  parent.add(group);
  return group;
}

export function signpost(
  parent: THREE.Object3D,
  x: number,
  z: number,
  lines: (string | DirectionRow)[],
  angle = 0,
  color?: string,
  width = lines.length > 1 ? 11 : 8,
  height = 4.2,
) {
  const postHeight = height - (width * lines.length) / 12;
  box(parent, x, postHeight / 2, z, 0.22, postHeight, 0.22, props.post);
  sign(parent, x, height, z, lines, width, angle, color);
}

export function building(
  parent: THREE.Object3D,
  colliders: Rect[],
  r: Rect,
  height: number,
  color: number,
) {
  colliders.push(r);
  box(parent, r.x, height / 2, r.z, r.width, height, r.depth, color);
  box(parent, r.x, height + 0.35, r.z, r.width + 1, 0.7, r.depth + 1, 0x344250);
  // Windows on every face make blocks readable from every approach.
  for (let y = 3; y < height - 1; y += 4) {
    for (let x = -r.width / 2 + 2.5; x < r.width / 2 - 1; x += 4.5) {
      for (const side of [-1, 1])
        box(
          parent,
          r.x + x,
          y,
          r.z + side * (r.depth / 2 + 0.03),
          1.5,
          1.8,
          0.08,
          0xe0ca8a,
        );
    }
    for (let z = -r.depth / 2 + 2.5; z < r.depth / 2 - 1; z += 4.5) {
      for (const side of [-1, 1])
        box(
          parent,
          r.x + side * (r.width / 2 + 0.03),
          y,
          r.z + z,
          0.08,
          1.8,
          1.5,
          0xe0ca8a,
        );
    }
  }
}

/** One face per street name, shared by its plates and freed when none uses it (#51). */
const streetFaces = new Map<string, {face:THREE.MeshBasicMaterial;users:number}>();

/** Small, arrow-free street identification plate, mounted on a façade or its own post. */
export function streetNamePlate(
  parent: THREE.Object3D,
  plan: {name:string;position:{x:number;z:number};angle:number;width:number;height:number;mount:'wall'|'post'},
) {
  let face=streetFaces.get(plan.name)?.face;
  if(!face) {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=192;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#eeeadd';ctx.fillRect(0,0,1024,192);
    ctx.strokeStyle='#344b56';ctx.lineWidth=10;ctx.strokeRect(10,10,1004,172);
    ctx.fillStyle='#233e4a';ctx.font='bold 140px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(plan.name.toUpperCase(),512,101,956);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.magFilter=THREE.LinearFilter;texture.anisotropy=4;
    face=new THREE.MeshBasicMaterial({map:texture});
    face.userData.shared=true;
    streetFaces.set(plan.name,{face,users:0});
  }
  streetFaces.get(plan.name)!.users++;
  const geometry=new THREE.PlaneGeometry(plan.width,plan.width*192/1024);
  const group=new THREE.Group();group.name=`street-name:${plan.name}`;
  for(const side of plan.mount==='post'?[0,1]:[0]){
    const mesh=new THREE.Mesh(geometry,face);mesh.position.set(0,plan.height,side===0?.02:-.02);mesh.rotation.y=side*Math.PI;group.add(mesh);
  }
  if(plan.mount==='post'){
    const poleHeight=plan.height-plan.width*192/1024/2;
    box(group,0,poleHeight/2,0,.09,poleHeight,.09,props.platePole);
  }
  group.position.set(plan.position.x,0,plan.position.z);group.rotation.y=plan.angle;parent.add(group);
  return group;
}

/** A streamed tile releases its plates when it unloads; the last plate of a name frees its texture
 * and returns the face so per-world material copies can be dropped too. */
export function releaseStreetNamePlate(name:string):THREE.MeshBasicMaterial|undefined {
  const entry=streetFaces.get(name);
  if(!entry||--entry.users>0)return;
  streetFaces.delete(name);entry.face.map?.dispose();entry.face.dispose();
  return entry.face;
}
/** Street-name textures currently held. */
export const streetNameTextures=()=>streetFaces.size;
