import * as THREE from "three";

/** Deterministic PRNG so procedural textures look identical on every load. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  return [c, g] as const;
}

function toTexture(c: HTMLCanvasElement, srgb: boolean, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/**
 * Large-format porcelain tile: colour, bump and roughness maps.
 * One texture covers `tiles × tiles` tiles.
 */
export function makeTileTextures(opts: {
  size?: number;
  tiles?: number;
  base: [number, number, number];
  seed?: number;
  grout?: number;
}) {
  const size = opts.size ?? 1024;
  const tiles = opts.tiles ?? 2;
  const rand = rng(opts.seed ?? 7);
  const [c, g] = makeCanvas(size, size);
  const [bc, bg] = makeCanvas(size, size);
  const [rc, rg] = makeCanvas(size, size);
  const ts = size / tiles;
  const [r0, g0, b0] = opts.base;

  // per-tile tone shift
  for (let i = 0; i < tiles; i++)
    for (let j = 0; j < tiles; j++) {
      const v = (rand() - 0.5) * 5;
      g.fillStyle = `rgb(${r0 + v},${g0 + v},${b0 + v})`;
      g.fillRect(i * ts, j * ts, ts, ts);
    }

  // low-frequency clouding (stone body)
  for (let k = 0; k < 140; k++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 30 + rand() * 160;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const l = rand() > 0.5 ? 255 : 0;
    grd.addColorStop(0, `rgba(${l},${l},${l},${0.025 + rand() * 0.03})`);
    grd.addColorStop(1, `rgba(${l},${l},${l},0)`);
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const img = g.getImageData(0, 0, size, size);
  const bimg = bg.createImageData(size, size);
  const rimg = rg.createImageData(size, size);
  for (let p = 0; p < img.data.length; p += 4) {
    let n = (rand() - 0.5) * 10;
    if (rand() < 0.006) n += (rand() - 0.5) * 50; // speckle
    img.data[p] += n;
    img.data[p + 1] += n;
    img.data[p + 2] += n;
    const b = 128 + n * 2.2;
    bimg.data[p] = bimg.data[p + 1] = bimg.data[p + 2] = b;
    bimg.data[p + 3] = 255;
    const r = 150 + n * 1.6;
    rimg.data[p] = rimg.data[p + 1] = rimg.data[p + 2] = r;
    rimg.data[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  bg.putImageData(bimg, 0, 0);
  rg.putImageData(rimg, 0, 0);

  // grout lines (wrap-safe: half width on each edge)
  const gw = opts.grout ?? 3;
  const drawLines = (ctx: CanvasRenderingContext2D, style: string) => {
    ctx.fillStyle = style;
    for (let k = 0; k <= tiles; k++) {
      const p = k * ts - gw / 2;
      ctx.fillRect(p, 0, gw, size);
      ctx.fillRect(0, p, size, gw);
    }
  };
  drawLines(g, `rgb(${r0 - 22},${g0 - 22},${b0 - 21})`);
  drawLines(bg, "rgb(40,40,40)");
  drawLines(rg, "rgb(235,235,235)");

  return {
    map: toTexture(c, true),
    bump: toTexture(bc, false),
    rough: toTexture(rc, false),
  };
}

/** Brushed-steel streaks for roughness / bump. */
export function makeBrushedTexture(seed = 3) {
  const rand = rng(seed);
  const [c, g] = makeCanvas(1024, 512);
  g.fillStyle = "rgb(128,128,128)";
  g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 6000; i++) {
    const y = rand() * 512;
    const x = rand() * 1024;
    const l = 60 + rand() * 500;
    const v = rand() > 0.5 ? 175 : 85;
    g.strokeStyle = `rgba(${v},${v},${v},${0.05 + rand() * 0.12})`;
    g.lineWidth = 0.4 + rand() * 1.1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + l, y + (rand() - 0.5) * 0.6);
    g.stroke();
  }
  return toTexture(c, false);
}

/** Soft vertical light falloff, bright at the bottom edge. */
export function makeGlowTexture() {
  const [c, g] = makeCanvas(64, 512);
  const grd = g.createLinearGradient(0, 512, 0, 0);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.03, "rgba(255,255,255,0.8)");
  grd.addColorStop(0.12, "rgba(255,255,255,0.38)");
  grd.addColorStop(0.32, "rgba(255,255,255,0.12)");
  grd.addColorStop(0.62, "rgba(255,255,255,0.03)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Honed grey marble for the dispenser and tray. */
export function makeStoneTexture(seed = 11) {
  const rand = rng(seed);
  const s = 512;
  const [c, g] = makeCanvas(s, s);
  g.fillStyle = "#86878a";
  g.fillRect(0, 0, s, s);
  for (let k = 0; k < 260; k++) {
    const x = rand() * s;
    const y = rand() * s;
    const r = 4 + rand() * 40;
    const l = rand() > 0.5 ? 200 : 60;
    g.fillStyle = `rgba(${l},${l},${l + 4},${0.03 + rand() * 0.05})`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.4 + rand()), rand() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  for (let v = 0; v < 18; v++) {
    g.strokeStyle = `rgba(215,215,220,${0.08 + rand() * 0.15})`;
    g.lineWidth = 0.5 + rand() * 1.4;
    g.beginPath();
    let x = rand() * s;
    let y = rand() * s;
    g.moveTo(x, y);
    for (let i = 0; i < 12; i++) {
      x += (rand() - 0.3) * 50;
      y += (rand() - 0.5) * 50;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return toTexture(c, true);
}

/** Terry-cloth towel. */
export function makeFabricTexture(seed = 5) {
  const rand = rng(seed);
  const s = 256;
  const [c, g] = makeCanvas(s, s);
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const p = (y * s + x) * 4;
      const loop = Math.sin(x * 1.3) * Math.sin(y * 1.3) * 22;
      const v = 120 + loop + (rand() - 0.5) * 90;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
      img.data[p + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return toTexture(c, false);
}
