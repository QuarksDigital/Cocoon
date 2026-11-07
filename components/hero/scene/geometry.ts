import * as THREE from "three";
import { rng } from "./textures";

/** Drain dimensions in metres. Cover = removable grate, frame = flange ring. */
export const DRAIN = {
  coverL: 1.12,
  coverW: 0.25,
  frameL: 1.2,
  frameW: 0.33,
  gap: 0.005,
  depth: 0.085,
  outletR: 0.036,
};

function rectPath(path: THREE.Path, w: number, h: number, cx = 0, cy = 0) {
  path.moveTo(cx - w / 2, cy - h / 2);
  path.lineTo(cx + w / 2, cy - h / 2);
  path.lineTo(cx + w / 2, cy + h / 2);
  path.lineTo(cx - w / 2, cy + h / 2);
  path.closePath();
  return path;
}

/** Rounded rectangle outline. */
function roundRect(path: THREE.Path, w: number, h: number, r: number) {
  const x = -w / 2;
  const y = -h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

/** One S-curved slot (the "wave" cut), as a closed outline. */
function waveSlot(cx: number, halfH: number, amp: number, halfW: number) {
  const N = 28;
  const centre: THREE.Vector2[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = -halfH + 2 * halfH * t;
    const x = cx + amp * Math.sin(Math.PI * (2 * t - 1)) + amp * 0.35 * (t - 0.5);
    centre.push(new THREE.Vector2(x, y));
  }
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  for (let i = 0; i <= N; i++) {
    const a = centre[Math.max(0, i - 1)];
    const b = centre[Math.min(N, i + 1)];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const l = Math.hypot(tx, ty);
    const nx = -ty / l;
    const ny = tx / l;
    left.push(new THREE.Vector2(centre[i].x + nx * halfW, centre[i].y + ny * halfW));
    right.push(new THREE.Vector2(centre[i].x - nx * halfW, centre[i].y - ny * halfW));
  }
  const pts: THREE.Vector2[] = [...left];
  // end cap
  const capSegs = 8;
  const end = centre[N];
  const endAng = Math.atan2(left[N].y - end.y, left[N].x - end.x);
  for (let k = 1; k < capSegs; k++) {
    const a = endAng - (Math.PI * k) / capSegs;
    pts.push(new THREE.Vector2(end.x + Math.cos(a) * halfW, end.y + Math.sin(a) * halfW));
  }
  for (let i = N; i >= 0; i--) pts.push(right[i]);
  const start = centre[0];
  const startAng = Math.atan2(right[0].y - start.y, right[0].x - start.x);
  for (let k = 1; k < capSegs; k++) {
    const a = startAng - (Math.PI * k) / capSegs;
    pts.push(new THREE.Vector2(start.x + Math.cos(a) * halfW, start.y + Math.sin(a) * halfW));
  }
  return new THREE.Path(pts);
}

/** Extruded shape lying flat (top face +Y, top surface at y = thickness). */
function flatExtrude(shape: THREE.Shape, thickness: number, bevel: number) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 10,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  geo.computeVertexNormals();
  return geo;
}

export function makeWaveCover() {
  const { coverL: L, coverW: W } = DRAIN;
  const shape = new THREE.Shape();
  roundRect(shape, L, W, 0.004);
  const count = 15;
  const span = L - 0.19;
  for (let i = 0; i < count; i++) {
    const cx = -span / 2 + (i * span) / (count - 1);
    shape.holes.push(waveSlot(cx, W / 2 - 0.038, 0.017, 0.0088));
  }
  // lifting notches in opposite corners
  shape.holes.push(rectPath(new THREE.Path(), 0.034, 0.018, -L / 2 + 0.034, W / 2 - 0.024));
  shape.holes.push(rectPath(new THREE.Path(), 0.034, 0.018, L / 2 - 0.034, -W / 2 + 0.024));
  return flatExtrude(shape, 0.005, 0.0016);
}

export function makeFrame() {
  const { frameL, frameW, coverL, coverW, gap } = DRAIN;
  const shape = new THREE.Shape();
  roundRect(shape, frameL, frameW, 0.003);
  shape.holes.push(rectPath(new THREE.Path(), coverL + gap * 2, coverW + gap * 2));
  return flatExtrude(shape, 0.006, 0.0018);
}

/** Channel bottom plate with the outlet hole. */
export function makeChannelBottom() {
  const { coverL, coverW, gap, outletR } = DRAIN;
  const shape = new THREE.Shape();
  rectPath(shape, coverL + gap * 2, coverW + gap * 2);
  const hole = new THREE.Path();
  hole.absarc(0, 0, outletR, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ShapeGeometry(shape, 32);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Floor plane with a rectangular cut-out where the drain sits. */
export function makeFloor(size: number, holeL: number, holeW: number) {
  const shape = new THREE.Shape();
  rectPath(shape, size, size);
  shape.holes.push(rectPath(new THREE.Path(), holeL, holeW));
  const geo = new THREE.ShapeGeometry(shape, 1);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/**
 * Irregular puddle: a polar blob whose height profile is flat with
 * steep meniscus edges. Built as rings so it can be deformed in the shader.
 */
export function makePuddle(radius: number, stretch: number, seed: number, height = 0.0035) {
  const rand = rng(seed);
  const segs = 72;
  const rings = 9;
  const a1 = rand() * 6.28;
  const a2 = rand() * 6.28;
  const a3 = rand() * 6.28;
  const k1 = 0.18 + rand() * 0.14;
  const k2 = 0.1 + rand() * 0.08;
  const k3 = 0.05 + rand() * 0.04;
  const rot = rand() * Math.PI;
  const outline = (th: number) =>
    radius * (1 + k1 * Math.sin(2 * th + a1) + k2 * Math.sin(3 * th + a2) + k3 * Math.sin(5 * th + a3));

  const pos: number[] = [0, height, 0];
  for (let r = 1; r <= rings; r++) {
    const s = r / rings;
    const y = height * (1 - Math.pow(s, 7));
    for (let i = 0; i < segs; i++) {
      const th = (i / segs) * Math.PI * 2;
      const rr = outline(th) * s;
      let x = Math.cos(th) * rr * stretch;
      let z = Math.sin(th) * rr;
      const xr = x * Math.cos(rot) - z * Math.sin(rot);
      z = x * Math.sin(rot) + z * Math.cos(rot);
      x = xr;
      pos.push(x, Math.max(y, 0.0002), z);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
  for (let r = 1; r < rings; r++) {
    const a = 1 + (r - 1) * segs;
    const b = 1 + r * segs;
    for (let i = 0; i < segs; i++) {
      const i2 = (i + 1) % segs;
      idx.push(a + i, a + i2, b + i);
      idx.push(a + i2, b + i2, b + i);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Heart-shaped pothos leaf with a gentle curl. */
export function makeLeaf() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.012);
  s.bezierCurveTo(-0.07, -0.035, -0.115, 0.07, 0, 0.18);
  s.bezierCurveTo(0.115, 0.07, 0.07, -0.035, 0, 0.012);
  const geo = new THREE.ShapeGeometry(s, 18);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, -Math.pow(x, 2) * 5 - Math.pow(y - 0.07, 2) * 1.6);
  }
  geo.computeVertexNormals();
  return geo;
}
