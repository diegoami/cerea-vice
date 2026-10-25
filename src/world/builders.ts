import * as THREE from "three";
import type { Rect } from "./district";
import type { DirectionRow } from "./directions";

const materials = new Map<number, THREE.MeshLambertMaterial>();
export function material(color: number) {
  if (!materials.has(color))
    materials.set(
      color,
      new THREE.MeshLambertMaterial({ color, flatShading: true }),
    );
  return materials.get(color)!;
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
  box(parent, x, postHeight / 2, z, 0.22, postHeight, 0.22, 0x43575a);
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
