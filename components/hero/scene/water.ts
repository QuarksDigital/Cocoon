import * as THREE from "three";
import { DRAIN } from "./geometry";
import { rng } from "./textures";

/**
 * Surface water as a particle system rendered through a metaball height field.
 *
 *  - every particle is a little volume of water; their kernels are summed into a
 *    float texture each frame, so touching blobs visually fuse into one puddle
 *  - droplets that touch are drawn together and coalesce (volume-conserving)
 *  - the pointer is a solid obstacle: water is ploughed aside and piles up
 *  - anything that reaches the grate is pulled to the nearest slot, shrinks and
 *    falls through (beads drop into the channel), then re-forms later at home
 *  - the field is shaded by a transmissive PBR material with normals derived
 *    from the field gradient → refraction, meniscus highlights, env reflections
 */

/** x/z = pointer now, px/pz = pointer last frame (the swept segment is the obstacle). */
export type PointerState = { x: number; z: number; px: number; pz: number; vx: number; vz: number; strength: number };

const T = 0.35; // iso threshold of the metaball field
const KERNEL = 2.2; // kernel radius as multiple of particle radius
const R_MAX = 0.024; // coalescence stops growing beyond this
const MOUSE_R = 0.1;

const ALIVE = 0;
const DRAINING = 1;
const DEAD = 2;

export class WaterSim {
  readonly group = new THREE.Group();

  // grid
  private x0: number;
  private z0: number;
  private sx: number;
  private sz: number;
  private cell: number;
  private nx: number;
  private nz: number;
  private field: Float32Array;
  private upload: Float32Array | Uint16Array;
  private half: boolean;
  private tex: THREE.DataTexture;

  // particles (struct of arrays)
  private cap: number;
  private n = 0;
  private px: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vz: Float32Array;
  private r: Float32Array;
  private amp: Float32Array; // 0..1 grow-in / drain-out
  private state: Uint8Array;
  private timer: Float32Array;
  private hx: Float32Array;
  private hz: Float32Array;
  private hr: Float32Array;

  // drain
  private coverHX = DRAIN.coverL / 2 + DRAIN.gap;
  private coverHZ = DRAIN.coverW / 2 + DRAIN.gap;
  private frameHX = DRAIN.frameL / 2;
  private frameHZ = DRAIN.frameW / 2;
  private slotX: number[] = [];

  // beads falling into the channel
  private beads: THREE.InstancedMesh;
  private beadData: { x: number; y: number; z: number; vy: number; s: number; on: boolean }[] = [];

  private drainUniforms: { uVisible: { value: number } };
  private rand = rng(1234);
  private dummy = new THREE.Object3D();
  private hash = new Map<number, number[]>();

  constructor(renderer: THREE.WebGLRenderer, opts: { wallZ: number; lowPower: boolean }) {
    // simulation window over the visible floor
    this.x0 = -1.7;
    this.z0 = opts.wallZ;
    this.sx = 3.4;
    this.sz = 1.25 - opts.wallZ;
    this.cell = opts.lowPower ? 0.012 : 0.0085;
    this.nx = Math.ceil(this.sx / this.cell);
    this.nz = Math.ceil(this.sz / this.cell);
    this.field = new Float32Array(this.nx * this.nz);

    this.half = !renderer.extensions.has("OES_texture_float_linear");
    this.upload = this.half ? new Uint16Array(this.nx * this.nz) : this.field;
    this.tex = new THREE.DataTexture(
      this.upload,
      this.nx,
      this.nz,
      THREE.RedFormat,
      this.half ? THREE.HalfFloatType : THREE.FloatType,
    );
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;

    this.cap = opts.lowPower ? 700 : 1100;
    this.px = new Float32Array(this.cap);
    this.pz = new Float32Array(this.cap);
    this.vx = new Float32Array(this.cap);
    this.vz = new Float32Array(this.cap);
    this.r = new Float32Array(this.cap);
    this.amp = new Float32Array(this.cap);
    this.state = new Uint8Array(this.cap);
    this.timer = new Float32Array(this.cap);
    this.hx = new Float32Array(this.cap);
    this.hz = new Float32Array(this.cap);
    this.hr = new Float32Array(this.cap);

    const count = 15;
    const span = DRAIN.coverL - 0.19;
    for (let i = 0; i < count; i++) this.slotX.push(-span / 2 + (i * span) / (count - 1));

    this.seed(opts.wallZ);

    // ---- rendering ----
    const shared = {
      uField: { value: this.tex },
      uOrigin: { value: new THREE.Vector2(this.x0, this.z0) },
      uSize: { value: new THREE.Vector2(this.nx * this.cell, this.nz * this.cell) },
      uTexel: { value: new THREE.Vector2(1 / this.nx, 1 / this.nz) },
      uCell: { value: this.cell },
      uT: { value: T },
      uCap: { value: 0.32 },
      uHScale: { value: 0.045 },
    };
    const floorMat = this.makeMaterial(opts.lowPower, { ...shared, uVisible: { value: 1 } });
    this.drainUniforms = { uVisible: { value: 1 } };
    const drainMat = this.makeMaterial(opts.lowPower, { ...shared, ...this.drainUniforms });

    const floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(this.sx, this.sz), floorMat);
    floorPlane.rotation.x = -Math.PI / 2;
    floorPlane.position.set(this.x0 + this.sx / 2, 0.0007, this.z0 + this.sz / 2);
    floorPlane.renderOrder = 2;
    this.group.add(floorPlane);

    // water sitting on top of the steel sits ~5 mm higher
    const drainPlane = new THREE.Mesh(new THREE.PlaneGeometry(DRAIN.frameL, DRAIN.frameW), drainMat);
    drainPlane.rotation.x = -Math.PI / 2;
    drainPlane.position.y = 0.0062;
    drainPlane.renderOrder = 3;
    this.group.add(drainPlane);

    this.beads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshPhysicalMaterial({ color: "#c9d2d8", roughness: 0.05, metalness: 0.1, envMapIntensity: 2.5 }),
      64,
    );
    this.beads.frustumCulled = false;
    for (let i = 0; i < 64; i++) this.beadData.push({ x: 0, y: 0, z: 0, vy: 0, s: 0, on: false });
    this.group.add(this.beads);
  }

  /* ---------------- set-up ---------------- */

  private add(x: number, z: number, r: number, home = true) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.px[i] = x;
    this.pz[i] = z;
    this.vx[i] = this.vz[i] = 0;
    this.r[i] = r;
    this.amp[i] = 1;
    this.state[i] = ALIVE;
    this.timer[i] = 0;
    this.hx[i] = home ? x : NaN;
    this.hz[i] = z;
    this.hr[i] = r;
    return i;
  }

  private nearDrain(x: number, z: number, m: number) {
    return Math.abs(x) < this.frameHX + m && Math.abs(z) < this.frameHZ + m;
  }

  private seed(wallZ: number) {
    const rand = this.rand;
    // puddles: [x, z, semi-axis a, semi-axis b, angle]
    const puddles: [number, number, number, number, number][] = [
      [-0.72, 0.34, 0.2, 0.055, 0.35],
      [-0.5, 0.62, 0.11, 0.06, -0.5],
      [-0.98, 0.58, 0.07, 0.05, 0.9],
      [-0.36, 0.2, 0.06, 0.03, 0.2],
      [0.28, 0.56, 0.13, 0.045, -0.25],
      [0.62, 0.3, 0.05, 0.035, 0.6],
      [-0.15, -0.36, 0.08, 0.035, 0.1],
      [0.68, -0.32, 0.06, 0.03, -0.4],
      [-0.85, -0.25, 0.05, 0.04, 0.3],
    ];
    const pr = 0.012;
    const step = pr * 2 * 0.95;
    for (const [cx, cz, a, b, ang] of puddles) {
      const ph1 = rand() * 6.28;
      const ph2 = rand() * 6.28;
      for (let u = -a; u <= a; u += step)
        for (let v = -b; v <= b; v += step * 0.866) {
          const uu = u + ((Math.round(v / (step * 0.866)) & 1) * step) / 2;
          const th = Math.atan2(v / b, uu / a);
          const edge = 1 + 0.22 * Math.sin(2 * th + ph1) + 0.12 * Math.sin(3 * th + ph2);
          if ((uu / a) ** 2 + (v / b) ** 2 > edge) continue;
          const x = cx + uu * Math.cos(ang) - v * Math.sin(ang);
          const z = cz + uu * Math.sin(ang) + v * Math.cos(ang);
          if (this.nearDrain(x, z, 0.06) || z < wallZ + 0.05) continue;
          this.add(x, z, pr * (0.9 + rand() * 0.2));
        }
    }
    // scattered droplets, denser near the puddles and around the drain
    const clusters: [number, number, number, number][] = [
      [-0.7, 0.4, 0.45, 0.32],
      [0.3, 0.45, 0.35, 0.18],
      [0.1, -0.4, 0.4, 0.16],
      [-0.6, -0.35, 0.3, 0.1],
      [0.85, 0.05, 0.3, 0.12],
      [0, 0.85, 0.5, 0.12],
    ];
    const drops = this.cap * 0.42;
    for (let k = 0; k < drops; k++) {
      let pick = rand();
      let c = clusters[0];
      for (const cl of clusters) {
        if (pick < cl[3]) {
          c = cl;
          break;
        }
        pick -= cl[3];
      }
      const a = rand() * Math.PI * 2;
      const d = Math.pow(rand(), 0.75) * c[2];
      const x = c[0] + Math.cos(a) * d * 1.4;
      const z = c[1] + Math.sin(a) * d;
      if (this.nearDrain(x, z, 0.03) || z < wallZ + 0.05) continue;
      this.add(x, z, 0.0032 + Math.pow(rand(), 2.6) * 0.011);
    }
  }

  /* ---------------- rendering material ---------------- */

  private makeMaterial(lowPower: boolean, uniforms: Record<string, { value: unknown }>) {
    const mat = lowPower
      ? new THREE.MeshPhysicalMaterial({
          color: "#3a3f44",
          roughness: 0.03,
          metalness: 0,
          transparent: true,
          opacity: 0.75,
          envMapIntensity: 2.4,
          specularIntensity: 1,
          depthWrite: false,
        })
      : new THREE.MeshPhysicalMaterial({
          color: "#ffffff",
          roughness: 0.035,
          metalness: 0,
          transmission: 1,
          thickness: 0.006,
          ior: 1.333,
          attenuationColor: new THREE.Color("#a9b0b6"),
          attenuationDistance: 0.02,
          specularIntensity: 1,
          envMapIntensity: 3,
          transparent: true,
          depthWrite: false,
        });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWaterW;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvWaterW = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 vWaterW;
          uniform sampler2D uField;
          uniform vec2 uOrigin, uSize, uTexel;
          uniform float uCell, uT, uCap, uHScale, uVisible;
          float wth(float f) { return uCap * tanh(max(f - uT, 0.0) / uCap); }`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          vec2 wuv = (vWaterW.xz - uOrigin) / uSize;
          float wf = texture2D(uField, wuv).r;
          float ww = max(fwidth(wf), 1e-4) * 0.9;
          float wmask = smoothstep(uT - ww, uT + ww, wf) * uVisible;
          if (wmask < 0.004) discard;
          diffuseColor.a *= wmask;`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          {
            float hL = wth(texture2D(uField, wuv - vec2(uTexel.x, 0.0)).r);
            float hR = wth(texture2D(uField, wuv + vec2(uTexel.x, 0.0)).r);
            float hD = wth(texture2D(uField, wuv - vec2(0.0, uTexel.y)).r);
            float hU = wth(texture2D(uField, wuv + vec2(0.0, uTexel.y)).r);
            vec3 wn = normalize(vec3(-(hR - hL) * uHScale / (2.0 * uCell), 1.0, -(hU - hD) * uHScale / (2.0 * uCell)));
            normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
          }`,
        );
    };
    return mat;
  }

  /* ---------------- simulation ---------------- */

  update(dt: number, ptr: PointerState, lift: number) {
    const n = this.n;
    const { px, pz, vx, vz, r, amp, state, timer } = this;
    const S = ptr.strength;
    const fr = Math.exp(-dt * 5.5); // tile friction
    let segX = ptr.x - ptr.px;
    let segZ = ptr.z - ptr.pz;
    let baseX = ptr.px;
    let baseZ = ptr.pz;
    if (Math.hypot(segX, segZ) > 0.6) {
      // pointer re-entered from elsewhere: no sweep, just the current spot
      segX = segZ = 0;
      baseX = ptr.x;
      baseZ = ptr.z;
    }
    const segLen2 = segX * segX + segZ * segZ;

    // 1) forces + integration
    for (let i = 0; i < n; i++) {
      if (state[i] === DEAD) {
        timer[i] -= dt;
        if (timer[i] <= 0) this.respawn(i, ptr);
        continue;
      }
      if (state[i] === DRAINING) {
        // slide to the nearest slot, shrink, drop through
        const sxp = this.nearestSlot(px[i]);
        px[i] += (sxp - px[i]) * Math.min(1, dt * 14);
        timer[i] += dt;
        amp[i] = Math.max(0, 1 - timer[i] / 0.32);
        if (timer[i] > 0.05 && timer[i] - dt <= 0.05) this.emitBead(sxp, pz[i], r[i]);
        if (amp[i] <= 0) {
          state[i] = DEAD;
          timer[i] = 2.5 + this.rand() * 5;
        }
        continue;
      }
      if (amp[i] < 1) amp[i] = Math.min(1, amp[i] + dt * 1.4);

      let ax = 0;
      let az = 0;
      // pointer = solid obstacle; water is ploughed out of the way
      if (S > 0.01) {
        // closest point on the swept segment, so fast flicks don't skip water
        const qx = px[i] - baseX;
        const qz = pz[i] - baseZ;
        const t = segLen2 > 1e-8 ? Math.min(1, Math.max(0, (qx * segX + qz * segZ) / segLen2)) : 1;
        const dx = px[i] - (baseX + segX * t);
        const dz = pz[i] - (baseZ + segZ * t);
        const d = Math.hypot(dx, dz);
        const reach = MOUSE_R + r[i] * 0.8;
        if (d < reach * 1.6) {
          const nx = d > 1e-5 ? dx / d : 1;
          const nz = d > 1e-5 ? dz / d : 0;
          if (d < reach) {
            const k = Math.min(1, dt * 30) * S;
            px[i] += nx * (reach - d) * k;
            pz[i] += nz * (reach - d) * k;
            ax += nx * (reach - d) * 260 * S;
            az += nz * (reach - d) * 260 * S;
          }
          // drag with a moving finger
          const f = (1 - d / (reach * 1.6)) * S;
          ax += (ptr.vx - vx[i]) * f * 9;
          az += (ptr.vz - vz[i]) * f * 9;
        }
      }
      // wet-room falls toward the drain: water close to the frame creeps in
      const ex = Math.abs(px[i]) - this.frameHX;
      const ez = Math.abs(pz[i]) - this.frameHZ;
      if (ex < 0.07 && ez < 0.07) {
        if (ez > ex) az -= Math.sign(pz[i]) * 0.9;
        else ax -= Math.sign(px[i]) * 0.9;
      }
      vx[i] = (vx[i] + ax * dt) * fr;
      vz[i] = (vz[i] + az * dt) * fr;
      if (Math.abs(vx[i]) + Math.abs(vz[i]) < 0.002) vx[i] = vz[i] = 0; // static friction
      px[i] += vx[i] * dt;
      pz[i] += vz[i] * dt;
      if (pz[i] < this.z0 + 0.03) {
        pz[i] = this.z0 + 0.03;
        vz[i] = Math.abs(vz[i]) * 0.2;
      }
      // over the grate → falls in (drain must be in the floor, not raised)
      if (lift < 0.02 && Math.abs(px[i]) < this.coverHX && Math.abs(pz[i]) < this.coverHZ) {
        state[i] = DRAINING;
        timer[i] = 0;
      } else if (lift >= 0.02 && this.nearDrain(px[i], pz[i], r[i])) {
        // drain raised: the opening is a wall
        this.pushOutOfRect(i);
      }
    }

    // 2) cohesion / separation / coalescence (spatial hash)
    this.interact();

    // 3) splat field
    this.splat();

    // 4) beads
    this.updateBeads(dt);
    this.drainUniforms.uVisible.value = Math.max(0, 1 - lift * 30);
  }

  private pushOutOfRect(i: number) {
    const ox = this.frameHX + this.r[i] - Math.abs(this.px[i]);
    const oz = this.frameHZ + this.r[i] - Math.abs(this.pz[i]);
    if (ox < oz) {
      this.px[i] = Math.sign(this.px[i] || 1) * (this.frameHX + this.r[i]);
      this.vx[i] *= -0.2;
    } else {
      this.pz[i] = Math.sign(this.pz[i] || 1) * (this.frameHZ + this.r[i]);
      this.vz[i] *= -0.2;
    }
  }

  private nearestSlot(x: number) {
    let best = this.slotX[0];
    for (const s of this.slotX) if (Math.abs(s - x) < Math.abs(best - x)) best = s;
    return best;
  }

  private respawn(i: number, ptr: PointerState) {
    // re-form at home (as if dripped from the shower) - or retire merged-away ones
    const x = this.hx[i];
    if (Number.isNaN(x)) {
      this.state[i] = DEAD;
      this.timer[i] = 1e9;
      return;
    }
    if (ptr.strength > 0.1 && Math.hypot(x - ptr.x, this.hz[i] - ptr.z) < MOUSE_R * 2) {
      this.timer[i] = 1;
      return;
    }
    this.px[i] = x;
    this.pz[i] = this.hz[i];
    this.r[i] = this.hr[i];
    this.vx[i] = this.vz[i] = 0;
    this.amp[i] = 0;
    this.state[i] = ALIVE;
  }

  private interact() {
    const { px, pz, r, vx, vz, state, n } = this;
    const H = 0.05;
    const hash = this.hash;
    hash.clear();
    for (let i = 0; i < n; i++) {
      if (state[i] !== ALIVE) continue;
      const key = (Math.floor(px[i] / H) + 512) * 2048 + Math.floor(pz[i] / H) + 512;
      const b = hash.get(key);
      if (b) b.push(i);
      else hash.set(key, [i]);
    }
    for (const [key, list] of hash) {
      const cx = Math.floor(key / 2048);
      const cz = key % 2048;
      for (let ox = 0; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++) {
          if (ox === 0 && oz < 0) continue;
          const other = ox === 0 && oz === 0 ? list : hash.get((cx + ox) * 2048 + cz + oz);
          if (!other) continue;
          for (let a = 0; a < list.length; a++) {
            const i = list[a];
            if (state[i] !== ALIVE) continue;
            for (let b = other === list ? a + 1 : 0; b < other.length; b++) {
              const j = other[b];
              if (state[j] !== ALIVE) continue;
              const dx = px[j] - px[i];
              const dz = pz[j] - pz[i];
              const d = Math.hypot(dx, dz) || 1e-6;
              const sum = r[i] + r[j];
              const rest = sum * 0.95;
              // visible edges touch at ~1.19·sum: surface tension pulls them in
              if (d < sum * 1.35 && d > rest) {
                const pull = (d - rest) * 0.18;
                const wi = r[j] ** 3 / (r[i] ** 3 + r[j] ** 3);
                px[i] += (dx / d) * pull * wi;
                pz[i] += (dz / d) * pull * wi;
                px[j] -= (dx / d) * pull * (1 - wi);
                pz[j] -= (dz / d) * pull * (1 - wi);
              } else if (d <= rest) {
                const merged = Math.cbrt(r[i] ** 3 + r[j] ** 3);
                if (d < sum * 0.8 && merged <= R_MAX) {
                  // coalesce: j is absorbed into i, volume and momentum conserved
                  const mi = r[i] ** 3;
                  const mj = r[j] ** 3;
                  const m = mi + mj;
                  px[i] = (px[i] * mi + px[j] * mj) / m;
                  pz[i] = (pz[i] * mi + pz[j] * mj) / m;
                  vx[i] = (vx[i] * mi + vx[j] * mj) / m;
                  vz[i] = (vz[i] * mi + vz[j] * mj) / m;
                  r[i] = merged;
                  this.amp[i] = Math.max(this.amp[i], this.amp[j]);
                  state[j] = DEAD;
                  this.timer[j] = 10 + this.rand() * 10; // slowly re-forms at its home
                } else {
                  // incompressible: push apart
                  const push = (rest - d) * 0.5;
                  px[i] -= (dx / d) * push;
                  pz[i] -= (dz / d) * push;
                  px[j] += (dx / d) * push;
                  pz[j] += (dz / d) * push;
                }
              }
            }
          }
        }
    }
  }

  private splat() {
    const { field, nx, nz, cell, x0, z0, px, pz, r, amp, state, n } = this;
    field.fill(0);
    for (let i = 0; i < n; i++) {
      if (state[i] === DEAD || amp[i] <= 0) continue;
      const a = amp[i];
      const K = r[i] * KERNEL * (0.35 + 0.65 * a);
      const K2 = K * K;
      const gx = (px[i] - x0) / cell;
      const gz = (pz[i] - z0) / cell;
      const kr = K / cell;
      const i0 = Math.max(0, Math.floor(gx - kr));
      const i1 = Math.min(nx - 1, Math.ceil(gx + kr));
      const j0 = Math.max(0, Math.floor(gz - kr));
      const j1 = Math.min(nz - 1, Math.ceil(gz + kr));
      for (let j = j0; j <= j1; j++) {
        const dz = (j - gz) * cell;
        const row = j * nx;
        for (let k = i0; k <= i1; k++) {
          const dx = (k - gx) * cell;
          const q = 1 - (dx * dx + dz * dz) / K2;
          if (q > 0) field[row + k] += q * q * q * a;
        }
      }
    }
    if (this.half) {
      const up = this.upload as Uint16Array;
      for (let k = 0; k < field.length; k++) up[k] = THREE.DataUtils.toHalfFloat(field[k]);
    }
    this.tex.needsUpdate = true;
  }

  private emitBead(x: number, z: number, r: number) {
    const b = this.beadData.find((d) => !d.on);
    if (!b) return;
    b.on = true;
    b.x = x;
    b.z = z;
    b.y = 0.004;
    b.vy = -0.15;
    b.s = Math.min(0.006, r * 0.6);
  }

  private updateBeads(dt: number) {
    for (let i = 0; i < this.beadData.length; i++) {
      const b = this.beadData[i];
      if (b.on) {
        b.vy -= 9.8 * dt;
        b.y += b.vy * dt;
        if (b.y < -DRAIN.depth) b.on = false;
      }
      this.dummy.position.set(b.x, b.y, b.z);
      const s = b.on ? b.s : 0;
      this.dummy.scale.set(s, s * (1 + Math.min(2, -b.vy * 2)), s);
      this.dummy.updateMatrix();
      this.beads.setMatrixAt(i, this.dummy.matrix);
    }
    this.beads.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.tex.dispose();
  }
}
