import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { WaterSim } from "./water";
import {
  DRAIN,
  makeChannelBottom,
  makeFloor,
  makeFrame,
  makeLeaf,
  makeWaveCover,
} from "./geometry";
import {
  makeBrushedTexture,
  makeFabricTexture,
  makeGlowTexture,
  makeStoneTexture,
  makeTileTextures,
  rng,
} from "./textures";

export type DrainSceneCallbacks = {
  onDiveRequest: () => void;
  onHoverChange: (hovering: boolean) => void;
  onReady: () => void;
};

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Damped spring used for the "alive" feel of the hovered drain. */
class Spring {
  x = 0;
  v = 0;
  constructor(
    public k = 140,
    public c = 13,
  ) {}
  step(target: number, dt: number) {
    const a = this.k * (target - this.x) - this.c * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

const WALL_Z = -0.86; // front face of the floating false wall
const GAP = 0.09; // lit shadow-gap under the false wall
const BACK_Z = WALL_Z - 0.17; // structural wall behind it
const GLASS_X = -1.02;
const GLASS_LEN = 1.45;
const LED_COLOR = new THREE.Color("#ffad5e");

export class DrainScene {
  private container: HTMLElement;
  private cb: DrainSceneCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private clock = new THREE.Timer();
  private raf = 0;
  private active = true;
  private disposed = false;
  private lowPower: boolean;

  // drain
  private unit = new THREE.Group();
  private lidPivot = new THREE.Group();
  private lid!: THREE.Mesh;
  private frame!: THREE.Mesh;
  private hoverTargets: THREE.Object3D[] = [];
  private hovering = false;
  private hoverAmt = 0;
  private sY = new Spring(150, 12);
  private sRX = new Spring(120, 10);
  private sRZ = new Spring(120, 10);
  private sX = new Spring(110, 12);
  private sZ = new Spring(110, 12);

  // LED / false wall
  private glowLight!: THREE.RectAreaLight;
  private gapGlow: THREE.Mesh[] = [];
  private floorWash!: THREE.Mesh;

  // water
  private water!: WaterSim;
  private glassDrops!: THREE.InstancedMesh;

  // pointer
  private ndc = new THREE.Vector2(0, 0);
  private ndcSmooth = new THREE.Vector2(0, 0);
  private pointerInside = false;
  private mouseWorld = new THREE.Vector3(99, 0, 99);
  private prevMouseWorld = new THREE.Vector3(99, 0, 99);
  private mouseVel = new THREE.Vector2();
  private mouseStrength = 0;
  private lastTouch = 0;
  private downAt: { x: number; y: number; t: number } | null = null;
  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // scroll
  private targetProgress = 0;
  private progress = 0;

  // camera rig
  private camPath!: THREE.CatmullRomCurve3;
  private lookPath!: THREE.CatmullRomCurve3;
  private baseCam = new THREE.Vector3();
  private baseLook = new THREE.Vector3();
  private baseFov = 34;
  private tmpV = new THREE.Vector3();
  private tmpL = new THREE.Vector3();
  private dummy = new THREE.Object3D();
  private resizeObs: ResizeObserver;

  constructor(container: HTMLElement, cb: DrainSceneCallbacks) {
    this.container = container;
    this.cb = cb;
    this.lowPower =
      window.matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.lowPower ? 1.3 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.domElement.className = "hero-canvas";
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(this.baseFov, 1, 0.01, 40);
    this.scene.background = new THREE.Color("#0b0b0c");

    this.buildEnvironment();
    this.buildRoom();
    this.buildLed();
    this.buildDrain();
    this.buildProps();
    this.buildWater();
    this.buildCameraRig();

    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    const rt = new THREE.WebGLRenderTarget(size.x || 1, size.y || 1, {
      type: THREE.HalfFloatType,
      samples: this.lowPower ? 0 : 4,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.32, 0.35, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);

    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    window.addEventListener("pointerup", this.onPointerUp, { passive: true });
    window.addEventListener("touchstart", this.onTouch, { passive: true });
    window.addEventListener("touchmove", this.onTouch, { passive: true });
    window.addEventListener("touchend", this.onTouchEnd, { passive: true });
    document.addEventListener("pointerleave", this.onLeave);

    // Compile everything up-front so the first interaction doesn't hitch.
    this.renderer.compile(this.scene, this.camera);
    this.loop();
    requestAnimationFrame(() => requestAnimationFrame(() => !this.disposed && this.cb.onReady()));
  }

  /* ------------------------------------------------------------------ */
  /* Build                                                               */
  /* ------------------------------------------------------------------ */

  private buildEnvironment() {
    // A tiny "studio" for reflections: dim room, warm strip, two softboxes.
    const env = new THREE.Scene();
    const room = new THREE.Mesh(
      new THREE.BoxGeometry(12, 6, 12),
      new THREE.MeshBasicMaterial({ color: "#4a4b50", side: THREE.BackSide }),
    );
    room.position.y = 2.5;
    env.add(room);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.MeshBasicMaterial({ color: "#0c0c0d" }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.4;
    env.add(floor);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(11, 0.12, 0.1),
      new THREE.MeshBasicMaterial({ color: LED_COLOR.clone().multiplyScalar(4) }),
    );
    strip.position.set(0, 0.1, -5.8);
    env.add(strip);
    const soft = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 2.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(4), side: THREE.DoubleSide }),
    );
    soft.position.set(-2.5, 5.2, 1.5);
    soft.lookAt(0, 0, 0);
    env.add(soft);
    const soft2 = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.95, 1).multiplyScalar(2.2), side: THREE.DoubleSide }),
    );
    soft2.position.set(5.8, 2.4, 2);
    soft2.lookAt(0, 1, 0);
    env.add(soft2);

    // broad overhead diffuser - what a flat satin grate mostly reflects
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(1.5), side: THREE.DoubleSide }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(-0.5, 5.4, -0.5);
    env.add(ceiling);
    // bright back wall panel: the angle the camera sees the grate at reflects this
    const backPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 3.2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.99, 0.97).multiplyScalar(1.6) }),
    );
    backPanel.position.set(-0.6, 3.6, -5.9);
    env.add(backPanel);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const rt = pmrem.fromScene(env, 0.035);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.7;
    pmrem.dispose();
  }

  private buildRoom() {
    const holeL = DRAIN.frameL + 0.006;
    const holeW = DRAIN.frameW + 0.006;

    const tile = makeTileTextures({ base: [72, 73, 76], tiles: 2, seed: 4, grout: 3 });
    const tileRepeat = 1 / 1.2; // texture spans 1.2 m (two 600 mm tiles)
    for (const t of [tile.map, tile.bump, tile.rough]) {
      t.repeat.set(tileRepeat, tileRepeat);
      t.offset.set(0, 0.25); // grout lines land at the drain's ends, like a real install
    }
    const floorMat = new THREE.MeshStandardMaterial({
      map: tile.map,
      roughnessMap: tile.rough,
      roughness: 0.62,
      bumpMap: tile.bump,
      bumpScale: 0.6,
      metalness: 0,
      envMapIntensity: 0.5,
    });
    const floor = new THREE.Mesh(makeFloor(14, holeL, holeW), floorMat);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // dark pit beneath the drain opening
    const pit = new THREE.Mesh(
      new THREE.BoxGeometry(holeL + 0.2, 0.7, holeW + 0.2),
      new THREE.MeshBasicMaterial({ color: "#030303", side: THREE.BackSide }),
    );
    pit.position.y = -0.35;
    this.scene.add(pit);

    // Floating false wall: large-format tiles on a panel that stops short of
    // the floor, with the LED hidden in the gap underneath.
    const wallTile = makeTileTextures({ base: [80, 81, 84], tiles: 1, seed: 9, grout: 2 });
    for (const t of [wallTile.map, wallTile.bump, wallTile.rough]) t.repeat.set(1 / 1.2, 1 / 2.4);
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTile.map,
      roughnessMap: wallTile.rough,
      roughness: 0.75,
      bumpMap: wallTile.bump,
      bumpScale: 0.4,
      envMapIntensity: 0.6,
    });
    const panelD = WALL_Z - BACK_Z - 0.03;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(14, 3.4, panelD), [
      wallMat,
      wallMat,
      wallMat,
      new THREE.MeshStandardMaterial({ color: "#141415", roughness: 0.8 }), // underside
      wallMat,
      wallMat,
    ]);
    panel.position.set(0, GAP + 1.7, WALL_Z - panelD / 2);
    panel.receiveShadow = true;
    panel.castShadow = true;
    this.scene.add(panel);
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 0.6),
      new THREE.MeshStandardMaterial({ color: "#2a2a2c", roughness: 0.9 }),
    );
    back.position.set(0, 0.3, BACK_Z);
    this.scene.add(back);

    // Key light: soft, slightly cool, casts the drain's shadow as it rises.
    const key = new THREE.DirectionalLight("#f2f4ff", 1.6);
    key.position.set(-1.6, 3.4, 1.8);
    key.target.position.set(0, 0, -0.1);
    key.castShadow = true;
    key.shadow.mapSize.set(this.lowPower ? 1024 : 2048, this.lowPower ? 1024 : 2048);
    key.shadow.camera.left = -1.8;
    key.shadow.camera.right = 1.8;
    key.shadow.camera.top = 1.6;
    key.shadow.camera.bottom = -1.6;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 8;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.01;
    key.shadow.radius = 6;
    this.scene.add(key, key.target);

    const fill = new THREE.HemisphereLight("#b4bccb", "#1a1a1c", 0.55);
    this.scene.add(fill);
  }

  private buildLed() {
    RectAreaLightUniformsLib.init();
    const glowTex = makeGlowTexture();

    // inside the gap: lit back wall + lit floor strip (both bloom)
    const gapBack = new THREE.Mesh(
      new THREE.PlaneGeometry(14, GAP),
      new THREE.MeshBasicMaterial({ color: LED_COLOR.clone().multiplyScalar(1.15), map: glowTex }),
    );
    gapBack.position.set(0, GAP / 2, BACK_Z + 0.002);
    const gapFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, WALL_Z - BACK_Z + 0.01),
      new THREE.MeshBasicMaterial({ color: LED_COLOR.clone().multiplyScalar(1.4), map: glowTex }),
    );
    gapFloor.rotation.x = -Math.PI / 2;
    gapFloor.position.set(0, 0.0012, (WALL_Z + BACK_Z) / 2 + 0.005);
    // the LED tape itself, tucked under the panel's front lip
    const tape = new THREE.Mesh(
      new THREE.BoxGeometry(14, 0.006, 0.012),
      new THREE.MeshBasicMaterial({ color: LED_COLOR.clone().multiplyScalar(3) }),
    );
    tape.position.set(0, GAP - 0.004, WALL_Z - 0.035);
    this.gapGlow = [gapBack, gapFloor, tape];
    this.scene.add(gapBack, gapFloor, tape);

    // real area light so floor, water and steel pick up the warm spill
    this.glowLight = new THREE.RectAreaLight(LED_COLOR, 2.6, 14, 0.06);
    this.glowLight.position.set(0, GAP - 0.006, WALL_Z - 0.03);
    this.glowLight.lookAt(0, -1, WALL_Z + 0.45);
    this.scene.add(this.glowLight);

    // soft haze of light pooling on the floor in front of the wall
    const washMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: LED_COLOR,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.28,
    });
    this.floorWash = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.75), washMat);
    this.floorWash.rotation.x = -Math.PI / 2;
    this.floorWash.rotation.z = Math.PI; // bright edge against the wall
    this.floorWash.position.set(0, 0.0016, WALL_Z + 0.375);
    this.scene.add(this.floorWash);
  }

  private buildDrain() {
    const brushed = makeBrushedTexture();
    brushed.repeat.set(1.6, 1.6);
    const steel = new THREE.MeshPhysicalMaterial({
      color: "#e6e8eb",
      metalness: 1,
      roughness: 0.44,
      roughnessMap: brushed,
      anisotropy: 0.5,
      envMapIntensity: 2.4,
    });
    const steelInner = steel.clone();
    steelInner.color.set("#8d9094");
    steelInner.roughness = 0.6;
    steelInner.side = THREE.DoubleSide;

    const { coverL, coverW, gap, depth, outletR } = DRAIN;
    const innerL = coverL + gap * 2;
    const innerW = coverW + gap * 2;

    this.frame = new THREE.Mesh(makeFrame(), steel);
    this.frame.position.y = -0.0045;
    this.frame.castShadow = true;
    this.frame.receiveShadow = true;
    this.unit.add(this.frame);

    // channel body
    const wallT = 0.003;
    const mkWall = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, depth, d), steelInner);
      m.position.set(x, -depth / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.unit.add(m);
    };
    mkWall(innerL + wallT * 2, wallT, 0, innerW / 2 + wallT / 2);
    mkWall(innerL + wallT * 2, wallT, 0, -innerW / 2 - wallT / 2);
    mkWall(wallT, innerW, innerL / 2 + wallT / 2, 0);
    mkWall(wallT, innerW, -innerL / 2 - wallT / 2, 0);
    const bottom = new THREE.Mesh(makeChannelBottom(), steelInner);
    bottom.position.y = -depth;
    bottom.receiveShadow = true;
    this.unit.add(bottom);
    const bottomUnder = bottom.clone();
    bottomUnder.rotation.x = Math.PI;
    bottomUnder.position.y = -depth - 0.002;
    this.unit.add(bottomUnder);

    // outlet pipe - fades to black so the camera can plunge into it
    const pipeMat = new THREE.MeshStandardMaterial({
      color: "#3a3c3f",
      metalness: 0.9,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(outletR, outletR, 0.5, 40, 1, true), pipeMat);
    pipe.position.y = -depth - 0.25;
    this.unit.add(pipe);
    const pipeEnd = new THREE.Mesh(
      new THREE.CircleGeometry(outletR, 32),
      new THREE.MeshBasicMaterial({ color: "#000" }),
    );
    pipeEnd.rotation.x = -Math.PI / 2;
    pipeEnd.position.y = -depth - 0.48;
    this.unit.add(pipeEnd);

    // grate (lid) hinged on its back edge
    this.lid = new THREE.Mesh(makeWaveCover(), steel);
    this.lid.position.set(0, 0, coverW / 2);
    this.lid.castShadow = true;
    this.lid.receiveShadow = true;
    this.lidPivot.position.set(0, -0.0035, -coverW / 2);
    this.lidPivot.add(this.lid);
    this.unit.add(this.lidPivot);

    this.hoverTargets = [this.lid, this.frame];
    this.scene.add(this.unit);
  }

  private buildProps() {
    const stoneTex = makeStoneTexture();
    const stone = new THREE.MeshPhysicalMaterial({
      map: stoneTex,
      roughness: 0.38,
      clearcoat: 0.35,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.8,
    });
    const chrome = new THREE.MeshStandardMaterial({
      color: "#e4e6e8",
      metalness: 1,
      roughness: 0.12,
      envMapIntensity: 1.6,
    });

    // soap dispenser
    const disp = new THREE.Group();
    const prof: THREE.Vector2[] = [];
    const R = 0.058;
    const H = 0.25;
    prof.push(new THREE.Vector2(0, 0));
    prof.push(new THREE.Vector2(R - 0.006, 0));
    prof.push(new THREE.Vector2(R, 0.006));
    prof.push(new THREE.Vector2(R, H - 0.008));
    prof.push(new THREE.Vector2(R - 0.008, H));
    prof.push(new THREE.Vector2(0, H));
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), stone);
    body.castShadow = true;
    body.receiveShadow = true;
    disp.add(body);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.03, 32), chrome);
    collar.position.y = H + 0.015;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 20), chrome);
    stem.position.y = H + 0.06;
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.03, 0.03, 3, 0.006), chrome);
    head.position.y = H + 0.1;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 16), chrome);
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(-0.04, H + 0.105, 0);
    for (const m of [collar, stem, head, nozzle]) {
      m.castShadow = true;
      disp.add(m);
    }
    disp.position.set(1.08, 0, -0.66);
    disp.rotation.y = -0.4;
    this.scene.add(disp);

    // stone tray with a folded towel
    const tray = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.045, 0.26, 4, 0.02), stone);
    tray.position.set(1.42, 0.0225, -0.44);
    tray.rotation.y = 0.12;
    tray.castShadow = true;
    tray.receiveShadow = true;
    this.scene.add(tray);
    const fab = makeFabricTexture();
    fab.repeat.set(4, 4);
    const towel = new THREE.Mesh(
      new RoundedBoxGeometry(0.42, 0.075, 0.2, 5, 0.03),
      new THREE.MeshStandardMaterial({
        color: "#2a2c30",
        roughness: 1,
        bumpMap: fab,
        bumpScale: 2.2,
        envMapIntensity: 0.3,
      }),
    );
    towel.position.set(1.42, 0.045 + 0.037, -0.45);
    towel.rotation.y = 0.12;
    towel.castShadow = true;
    this.scene.add(towel);

    // frameless glass shower screen: low-iron glass with a green edge,
    // matte-black floor channel and wall post
    const glassMat = this.lowPower
      ? new THREE.MeshPhysicalMaterial({
          color: "#b9cfcf",
          transparent: true,
          opacity: 0.22,
          roughness: 0.03,
          metalness: 0,
          envMapIntensity: 2.4,
        })
      : new THREE.MeshPhysicalMaterial({
          color: "#eef6f5",
          transmission: 1,
          thickness: 0.012,
          roughness: 0.02,
          ior: 1.52,
          attenuationColor: new THREE.Color("#7fb3a6"),
          attenuationDistance: 0.25,
          specularIntensity: 1,
          envMapIntensity: 2.6,
          metalness: 0,
        });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.012, 2.1, GLASS_LEN), glassMat);
    glass.position.set(GLASS_X, 0.045 + 1.05, WALL_Z + GLASS_LEN / 2);
    this.scene.add(glass);
    // polished edges catch the light; this is what makes glass readable
    const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#cfe9e1").multiplyScalar(0.9) });
    const edgeV = new THREE.Mesh(new THREE.BoxGeometry(0.013, 2.1, 0.0025), edgeMat);
    edgeV.position.set(GLASS_X, 1.095, WALL_Z + GLASS_LEN);
    const edgeT = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.0025, GLASS_LEN), edgeMat);
    edgeT.position.set(GLASS_X, 2.146, WALL_Z + GLASS_LEN / 2);
    this.scene.add(edgeV, edgeT);
    const black = new THREE.MeshStandardMaterial({ color: "#111112", roughness: 0.32, metalness: 0.7 });
    const profile = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, GLASS_LEN + 0.02), black);
    profile.position.set(GLASS_X, 0.0225, WALL_Z + GLASS_LEN / 2);
    profile.castShadow = true;
    profile.receiveShadow = true;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.3, 0.03), black);
    post.position.set(GLASS_X, 1.15 + GAP, WALL_Z + 0.015);
    this.scene.add(profile, post);

    // trailing pothos in the top-right corner
    const leafGeo = makeLeaf();
    const leafMat = new THREE.MeshStandardMaterial({
      color: "#4e8f2c",
      roughness: 0.42,
      side: THREE.DoubleSide,
      envMapIntensity: 0.9,
    });
    const stemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.85, 1.35, -0.75),
      new THREE.Vector3(1.55, 1.05, -0.7),
      new THREE.Vector3(1.38, 0.72, -0.62),
      new THREE.Vector3(1.32, 0.42, -0.58),
    ]);
    const stemMesh = new THREE.Mesh(
      new THREE.TubeGeometry(stemCurve, 40, 0.004, 6),
      new THREE.MeshStandardMaterial({ color: "#3d6b22", roughness: 0.6 }),
    );
    this.scene.add(stemMesh);
    const rand = rng(21);
    for (let i = 0; i < 9; i++) {
      const t = 0.08 + i * 0.105;
      const p = stemCurve.getPoint(Math.min(t, 1));
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.copy(p);
      const s = 0.75 + rand() * 0.45;
      leaf.scale.setScalar(s);
      leaf.lookAt(p.x - 0.6 - rand() * 0.6, p.y + 0.4 + rand() * 0.5, p.z + 1.6);
      leaf.rotateZ((rand() - 0.5) * 2.4 + (i % 2 ? 1.2 : -1.2));
      leaf.rotateX(-0.3 - rand() * 0.5);
      leaf.castShadow = true;
      this.scene.add(leaf);
    }
  }

  private buildWater() {
    this.water = new WaterSim(this.renderer, { wallZ: WALL_Z, lowPower: this.lowPower });
    this.scene.add(this.water.group);

    // droplets and run-marks clinging to the glass screen
    const dropMat = new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      roughness: 0.03,
      transmission: this.lowPower ? 0 : 1,
      transparent: this.lowPower,
      opacity: this.lowPower ? 0.5 : 1,
      thickness: 0.004,
      ior: 1.333,
      envMapIntensity: 2.6,
    });
    const gRand = rng(31);
    const gCount = this.lowPower ? 120 : 320;
    this.glassDrops = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      dropMat,
      gCount,
    );
    for (let i = 0; i < gCount; i++) {
      const streak = gRand() < 0.12;
      const r = streak ? 0.0025 : 0.0018 + Math.pow(gRand(), 3) * 0.008;
      const y = 0.06 + Math.pow(gRand(), 0.8) * 1.5;
      this.dummy.position.set(GLASS_X + 0.0062, y, WALL_Z + 0.06 + gRand() * (GLASS_LEN - 0.12));
      this.dummy.rotation.set(0, 0, -Math.PI / 2);
      this.dummy.scale.set(streak ? 0.02 + gRand() * 0.06 : r * (1 + gRand() * 0.4), r * 0.5, r);
      this.dummy.updateMatrix();
      this.glassDrops.setMatrixAt(i, this.dummy.matrix);
    }
    this.scene.add(this.glassDrops);
  }

  private buildCameraRig() {
    // Path: hero framing → hovering above the open channel → down the outlet.
    this.camPath = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0, 0, 0), // replaced by base framing each frame
        new THREE.Vector3(0.12, 0.62, 0.42),
        new THREE.Vector3(0.0, 0.28, 0.08),
        new THREE.Vector3(0.0, -0.02, 0.005),
        new THREE.Vector3(0.0, -0.42, 0.0),
      ],
      false,
      "centripetal",
    );
    this.lookPath = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.0, -0.05, -0.02),
        new THREE.Vector3(0.0, -0.2, -0.02),
        new THREE.Vector3(0.0, -0.5, -0.01),
        new THREE.Vector3(0.0, -1.0, -0.005),
      ],
      false,
      "centripetal",
    );
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  setProgress(p: number) {
    this.targetProgress = clamp(p);
  }

  setActive(active: boolean) {
    if (active === this.active) return;
    this.active = active;
    if (active) {
      this.clock.reset();
      this.loop();
    } else cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("touchstart", this.onTouch);
    window.removeEventListener("touchmove", this.onTouch);
    window.removeEventListener("touchend", this.onTouchEnd);
    document.removeEventListener("pointerleave", this.onLeave);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.water.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* ------------------------------------------------------------------ */
  /* Input                                                               */
  /* ------------------------------------------------------------------ */

  private setPointer(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    this.pointerInside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    this.ndc.set(x * 2 - 1, -(y * 2 - 1));
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return; // handled by touch events
    if (performance.now() - this.lastTouch < 600) return;
    this.setPointer(e.clientX, e.clientY);
  };

  private onTouch = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    this.lastTouch = performance.now();
    this.setPointer(t.clientX, t.clientY);
  };

  private onTouchEnd = () => {
    this.lastTouch = performance.now();
    // let the water settle back after the finger lifts
    window.setTimeout(() => {
      if (performance.now() - this.lastTouch > 450) this.pointerInside = false;
    }, 500);
  };

  private onLeave = () => {
    this.pointerInside = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.target !== this.renderer.domElement) return;
    this.setPointer(e.clientX, e.clientY);
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    this.updateHover();
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.downAt;
    this.downAt = null;
    if (!d || e.target !== this.renderer.domElement) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved < 10 && performance.now() - d.t < 700 && this.hitDrain()) this.cb.onDiveRequest();
  };

  private hitDrain() {
    if (this.progress > 0.45) return false;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.intersectObjects(this.hoverTargets, false).length > 0;
  }

  private updateHover() {
    const h = this.pointerInside && this.hitDrain();
    if (h !== this.hovering) {
      this.hovering = h;
      this.cb.onHoverChange(h);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Frame                                                               */
  /* ------------------------------------------------------------------ */

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const aspect = w / h;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.bloom?.resolution.set(w / 2, h / 2);
    this.camera.aspect = aspect;

    // Keep the drain composed on any screen: widen + pull back on portrait.
    const portrait = clamp((1.7 - aspect) / 1.2);
    this.baseFov = 30 + portrait * 22;
    this.baseCam.set(0.42 - portrait * 0.3, 1.42 + portrait * 0.8, 1.32 + portrait * 0.4);
    this.baseLook.set(-0.05 + portrait * 0.04, 0.0, -0.1 + portrait * 0.08);
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (!this.active || this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.clock.update();
    const dt = Math.min(this.clock.getDelta(), 1 / 30);
    this.update(dt);
    this.composer.render(dt);
  };

  private update(dt: number) {
    // scroll progress, eased so trackpads and wheels both feel buttery
    this.progress += (this.targetProgress - this.progress) * (1 - Math.exp(-dt * 7));
    const p = this.progress;
    const rise = easeOut(smooth(0.0, 0.32, p));
    const open = easeInOut(smooth(0.3, 0.52, p));
    const dive = easeInOut(smooth(0.48, 0.86, p));
    const interactive = p < 0.4;

    // pointer smoothing + parallax
    this.ndcSmooth.lerp(this.ndc, 1 - Math.exp(-dt * 5));
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.floorPlane, this.tmpV);
    this.prevMouseWorld.copy(this.mouseWorld);
    if (hit) this.mouseWorld.copy(hit);
    const vx = (this.mouseWorld.x - this.prevMouseWorld.x) / Math.max(dt, 1e-3);
    const vz = (this.mouseWorld.z - this.prevMouseWorld.z) / Math.max(dt, 1e-3);
    this.mouseVel.set(clamp(vx, -6, 6), clamp(vz, -6, 6));
    const wantStrength = this.pointerInside && interactive && hit ? 1 : 0;
    this.mouseStrength += (wantStrength - this.mouseStrength) * (1 - Math.exp(-dt * 6));

    this.updateHover();
    this.hoverAmt += ((this.hovering && interactive ? 1 : 0) - this.hoverAmt) * (1 - Math.exp(-dt * 8));

    this.updateDrain(dt, rise, open);
    this.updateWater(dt);
    this.updateCamera(dive, open);
  }

  private updateDrain(dt: number, rise: number, open: number) {
    // pointer in drain-local space (drain sits at origin, unrotated)
    const lx = clamp(this.mouseWorld.x / (DRAIN.frameL / 2), -1.4, 1.4);
    const lz = clamp(this.mouseWorld.z / (DRAIN.frameW / 2), -2, 2);
    const h = this.hoverAmt;

    const y = this.sY.step(rise * 0.17 + h * 0.035, dt);
    const rx = this.sRX.step(h * lz * 0.05 + rise * 0.02, dt);
    const rz = this.sRZ.step(-h * lx * 0.035, dt);
    const px = this.sX.step(h * lx * 0.012, dt);
    const pz = this.sZ.step(h * lz * 0.006, dt);

    this.unit.position.set(px, y, pz);
    this.unit.rotation.set(rx, rise * -0.04, rz);
    // the grate swings open toward the wall like a hatch
    this.lidPivot.rotation.x = -open * 1.85;
    this.lid.position.y = open * 0.004;
  }

  private updateWater(dt: number) {
    this.water.update(
      dt,
      {
        x: this.mouseWorld.x,
        z: this.mouseWorld.z,
        px: this.prevMouseWorld.x,
        pz: this.prevMouseWorld.z,
        vx: this.mouseVel.x,
        vz: this.mouseVel.y,
        strength: this.mouseStrength,
      },
      this.unit.position.y,
    );
  }

  private updateCamera(dive: number, open: number) {
    const par = 1 - dive;
    const base = this.tmpV.copy(this.baseCam);
    base.x += this.ndcSmooth.x * 0.05 * par;
    base.y += this.ndcSmooth.y * 0.03 * par;
    const look = this.tmpL.copy(this.baseLook);

    if (dive <= 0.0001) {
      this.camera.position.copy(base);
      this.camera.lookAt(look);
      this.camera.fov = this.baseFov;
    } else {
      this.camPath.points[0].copy(base);
      this.lookPath.points[0].copy(look);
      const pos = this.camPath.getPoint(dive);
      const tgt = this.lookPath.getPoint(dive);
      // follow the drain as it rises
      pos.y += this.unit.position.y * (dive > 0 ? 1 : 0) * Math.min(1, dive * 3);
      tgt.y += this.unit.position.y * Math.min(1, dive * 3);
      this.camera.position.copy(pos);
      this.camera.lookAt(tgt);
      // a slight barrel-roll as we drop in, and the lens widens for speed
      this.camera.rotateZ(dive * dive * 0.6);
      this.camera.fov = this.baseFov + Math.pow(dive, 2) * 34;
    }
    this.camera.updateProjectionMatrix();

    // fade the image to black in the last part of the plunge
    const dark = smooth(0.62, 0.97, dive);
    this.renderer.toneMappingExposure = 1.0 - dark * 0.98 + open * 0.05;
  }
}
