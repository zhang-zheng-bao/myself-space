import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";

/**
 * 书桌场景：全部用代码建模（几何体 + Canvas 贴图），不依赖外部模型文件。
 * React 只通过返回的 DeskScene 接口和它交互：悬停/点击回调、取物体屏幕位置、开关灯等。
 */

export type DeskHotspot = "laptop" | "tablet" | "phone" | "notebook" | "lamp" | "mug" | "speaker" | "socket" | "keyboard" | "mouse" | "plant";

export type DeskSceneOptions = {
  canvas: HTMLCanvasElement;
  onHover(hotspot: DeskHotspot | null, x: number, y: number): void;
  onSelect(hotspot: DeskHotspot): void;
  onReady?(): void;
};

export type DeskScene = {
  screenRect(hotspot: DeskHotspot): DOMRect | null;
  focus(hotspot: DeskHotspot | null): void;
  setLamp(on: boolean): void;
  setPower(on: boolean): void;
  setMusic(playing: boolean): void;
  pressKeys(): void;
  setIdentity(name: string, tagline: string, avatar?: string): void;
  dispose(): void;
};

const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Noto Serif CJK SC",sans-serif';
const DESK_Y = 0.75;

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function noiseTexture(base: string, spots: string, seed: number, size = 512) {
  return canvasTexture(size, size, (ctx, w, h) => {
    const rand = seeded(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i += 1) {
      ctx.fillStyle = spots;
      ctx.globalAlpha = rand() * 0.05;
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3);
    }
    ctx.globalAlpha = 1;
  });
}

type Hoverable = { group: THREE.Object3D; baseY: number; lift: number; target: number; maxLift: number };

export function createDeskScene(options: DeskSceneOptions): DeskScene {
  const { canvas } = options;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e7e2);
  scene.fog = new THREE.Fog(0xe9e7e2, 4.5, 10);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.6;

  const camera = new THREE.PerspectiveCamera(41, 1, 0.02, 20);
  const homeTarget = new THREE.Vector3(0, 0.77, -0.07);
  const homeOffset = new THREE.Vector3(0, 0.62, 1.24);

  const disposables: { dispose(): void }[] = [envTexture, pmrem];
  const track = <T extends { dispose(): void }>(item: T) => { disposables.push(item); return item; };
  const rbox = (w: number, h: number, d: number, r: number) => track(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2, h / 2, d / 2)));
  const std = (params: THREE.MeshStandardMaterialParameters) => track(new THREE.MeshStandardMaterial(params));
  const phys = (params: THREE.MeshPhysicalMaterialParameters) => track(new THREE.MeshPhysicalMaterial(params));
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], shadow = true) => {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  };

  /* 木纹、墙面、地板、绿植和环境光来自 Poly Haven（CC0），放在 public/desk。全部加载完（或超时）再显示画面。 */
  let disposed = false;
  let assetsReady = false;
  const manager = new THREE.LoadingManager();
  manager.onLoad = () => { assetsReady = true; };
  const readyTimer = window.setTimeout(() => { assetsReady = true; }, 12000);
  const gltfLoader = new GLTFLoader(manager);
  const textureLoader = new THREE.TextureLoader(manager);
  const trackMaterial = (material: THREE.Material) => {
    disposables.push(material);
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) disposables.push(value);
  };
  const loadModel = (id: string, onLoad: (model: THREE.Group) => void) => {
    gltfLoader.load(`/desk/models/${id}/${id}.gltf`, gltf => {
      if (disposed) return;
      gltf.scene.traverse(child => {
        const item = child as THREE.Mesh;
        if (!item.isMesh) return;
        item.castShadow = true;
        item.receiveShadow = true;
        disposables.push(item.geometry);
        (Array.isArray(item.material) ? item.material : [item.material]).forEach(trackMaterial);
      });
      onLoad(gltf.scene);
    }, undefined, () => { /* 素材缺失时保留其余场景 */ });
  };
  const pbrMaps = (name: string, repeatX: number, repeatY: number) => {
    const load = (suffix: string, srgb = false) => {
      const texture = textureLoader.load(`/desk/textures/${name}_${suffix}_1k.jpg`);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = 8;
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      return track(texture);
    };
    const arm = load("arm");
    return { map: load("Diffuse", true), normalMap: load("nor_gl"), roughnessMap: arm, aoMap: arm };
  };
  new HDRLoader(manager).load("/desk/hdri/art_studio_1k.hdr", hdr => {
    if (disposed) { hdr.dispose(); return; }
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const env = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    disposables.push(env);
    scene.environment = env;
  });

  const hotspots = new Map<DeskHotspot, THREE.Object3D>();
  const measureTargets = new Map<DeskHotspot, THREE.Object3D>();
  const hoverables: Hoverable[] = [];
  const addHotspot = (kind: DeskHotspot, group: THREE.Object3D, measure: THREE.Object3D = group, maxLift = 0.008) => {
    group.userData.hotspot = kind;
    hotspots.set(kind, group);
    measureTargets.set(kind, measure);
    hoverables.push({ group, baseY: group.position.y, lift: 0, target: 0, maxLift });
  };

  /* ---------------- 房间 ---------------- */
  const floor = mesh(track(new THREE.PlaneGeometry(10, 10)), std({ ...pbrMaps("laminate_floor_02", 5, 5), color: 0xddd3c6 }), false);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const wallNormal = track(textureLoader.load("/desk/textures/white_plaster_02_nor_gl_1k.jpg"));
  wallNormal.wrapS = wallNormal.wrapT = THREE.RepeatWrapping;
  wallNormal.repeat.set(5, 1.7);
  const wallMat = std({ color: 0xf3f1ec, roughness: 0.95, normalMap: wallNormal, normalScale: new THREE.Vector2(0.25, 0.25) });
  const backWall = mesh(track(new THREE.PlaneGeometry(10, 3.4)), wallMat, false);
  backWall.position.set(0, 1.7, -0.62);
  scene.add(backWall);
  const sideWall = mesh(track(new THREE.PlaneGeometry(6, 3.4)), wallMat, false);
  sideWall.rotation.y = Math.PI / 2;
  sideWall.position.set(-1.9, 1.7, 1.5);
  scene.add(sideWall);
  const skirting = mesh(rbox(10, 0.09, 0.02, 0.004), std({ color: 0xf4f3f0, roughness: 0.5 }), false);
  skirting.position.set(0, 0.045, -0.61);
  scene.add(skirting);

  // 窗：玻璃是一张白天的天光贴图（天空加窗外虚化的树影），外加白色窗框、窗台和一侧纱帘。
  const dayTex = track(canvasTexture(1024, 768, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#eaf2f8");
    sky.addColorStop(0.6, "#f6f8f8");
    sky.addColorStop(1, "#eef1ea");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(7);
    for (let i = 0; i < 16; i += 1) {
      const x = rand() * w;
      const y = h * (0.72 + rand() * 0.3);
      const r = 90 + rand() * 130;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${150 + rand() * 30},${176 + rand() * 24},${140 + rand() * 24},.5)`);
      g.addColorStop(1, "rgba(170,190,160,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }));
  const windowGroup = new THREE.Group();
  windowGroup.position.set(-0.78, 1.38, -0.61);
  const glass = new THREE.Mesh(track(new THREE.PlaneGeometry(1.1, 0.84)), track(new THREE.MeshBasicMaterial({ map: dayTex, toneMapped: false })));
  glass.position.z = 0.001;
  windowGroup.add(glass);
  const frameMat = std({ color: 0xf7f6f3, roughness: 0.5 });
  const frameParts: [number, number, number, number][] = [
    [1.18, 0.04, 0, 0.44], [1.18, 0.04, 0, -0.44], [0.04, 0.92, -0.57, 0], [0.04, 0.92, 0.57, 0], [0.022, 0.84, 0, 0],
  ];
  for (const [w, h, x, y] of frameParts) {
    const part = mesh(rbox(w, h, 0.05, 0.006), frameMat, false);
    part.position.set(x, y, 0.025);
    windowGroup.add(part);
  }
  const sill = mesh(rbox(1.28, 0.03, 0.14, 0.008), frameMat);
  sill.position.set(0, -0.475, 0.06);
  windowGroup.add(sill);
  scene.add(windowGroup);

  // 靠墙立在桌上的装饰画：浅木细框，字随访客名字重绘。
  let posterName = "";
  let posterTagline = "";
  const posterCanvas = document.createElement("canvas");
  posterCanvas.width = 600;
  posterCanvas.height = 800;
  const posterTex = track(new THREE.CanvasTexture(posterCanvas));
  posterTex.colorSpace = THREE.SRGBColorSpace;
  const drawPoster = () => {
    const ctx = posterCanvas.getContext("2d")!;
    const w = posterCanvas.width;
    const h = posterCanvas.height;
    ctx.fillStyle = "#f6f4f0";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#dcae96";
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.36, 112, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#93a390";
    ctx.beginPath();
    ctx.moveTo(w * 0.14, h * 0.6);
    for (let x = w * 0.14; x <= w * 0.86; x += 12) ctx.lineTo(x, h * 0.5 - Math.sin((x - w * 0.14) / (w * 0.72) * Math.PI) * 70);
    ctx.lineTo(w * 0.86, h * 0.6);
    ctx.fill();
    ctx.fillStyle = "#35363a";
    ctx.textAlign = "center";
    ctx.font = `300 34px ${FONT}`;
    ctx.fillText("K E E P   C R E A T I N G", w / 2, h * 0.74);
    ctx.fillStyle = "#35363a";
    ctx.fillRect(w / 2 - 22, h * 0.775, 44, 2);
    ctx.font = `26px ${FONT}`;
    ctx.fillStyle = "#6f6d68";
    ctx.fillText(posterName || "My Space", w / 2, h * 0.84);
    ctx.font = `20px ${FONT}`;
    ctx.fillStyle = "#9a978f";
    ctx.fillText((posterTagline || "把想法做成作品").slice(0, 22), w / 2, h * 0.885);
    posterTex.needsUpdate = true;
  };
  drawPoster();
  const poster = new THREE.Group();
  poster.position.set(0.5, DESK_Y + 0.2, -0.572);
  poster.rotation.x = -0.11;
  const posterFrame = mesh(rbox(0.31, 0.405, 0.014, 0.002), std({ color: 0xd9c7ab, roughness: 0.6 }));
  poster.add(posterFrame);
  const posterArt = new THREE.Mesh(track(new THREE.PlaneGeometry(0.29, 0.385)), std({ map: posterTex, roughness: 0.85 }));
  posterArt.position.z = 0.0075;
  poster.add(posterArt);
  scene.add(poster);

  /* ---------------- 书桌 ---------------- */
  const deskMat = std({ ...pbrMaps("oak_veneer_01", 2, 1), color: 0xe9dccb, roughness: 1 });
  const deskTop = mesh(rbox(1.7, 0.03, 0.86, 0.005), deskMat);
  deskTop.position.set(0, DESK_Y - 0.015, -0.17);
  scene.add(deskTop);
  const legMat = std({ color: 0xf3f2ef, roughness: 0.45, metalness: 0.1 });
  for (const [x, z] of [[-0.8, 0.2], [0.8, 0.2], [-0.8, -0.54], [0.8, -0.54]]) {
    const leg = mesh(rbox(0.035, DESK_Y - 0.03, 0.035, 0.006), legMat);
    leg.position.set(x, (DESK_Y - 0.03) / 2, z);
    scene.add(leg);
  }
  const apron = mesh(rbox(1.56, 0.04, 0.018, 0.004), legMat);
  apron.position.set(0, DESK_Y - 0.05, 0.2);
  scene.add(apron);

  /* ---------------- 共用材质 ---------------- */
  const aluminium = std({ color: 0xb6b8bc, metalness: 0.78, roughness: 0.5, envMapIntensity: 0.8 });
  const blackGlass = phys({ color: 0x050506, roughness: 0.08, metalness: 0, clearcoat: 1 });
  const whitePlastic = std({ color: 0xf6f5f2, roughness: 0.5 });
  const screenMats: { material: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  const screenMaterial = (map: THREE.Texture, strength = 1) => {
    const material = track(new THREE.MeshBasicMaterial({ map, color: new THREE.Color(strength, strength, strength), toneMapped: false }));
    screenMats.push({ material, base: material.color.clone() });
    return material;
  };

  /* ---------------- 笔记本电脑 ---------------- */
  const laptopCanvas = document.createElement("canvas");
  laptopCanvas.width = 1024;
  laptopCanvas.height = 640;
  const laptopTex = track(new THREE.CanvasTexture(laptopCanvas));
  laptopTex.colorSpace = THREE.SRGBColorSpace;
  laptopTex.anisotropy = 8;
  const drawLaptop = () => {
    const ctx = laptopCanvas.getContext("2d")!;
    const w = laptopCanvas.width;
    const h = laptopCanvas.height;
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#bcd6ee");
    bg.addColorStop(0.5, "#e9e3ee");
    bg.addColorStop(1, "#f3d9c8");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,.45)";
    ctx.fillRect(0, 0, w, 26);
    ctx.fillStyle = "rgba(30,20,20,.8)";
    ctx.font = `16px ${FONT}`;
    ctx.fillText("  个人主页    访达    文件    编辑", 10, 18);
    ctx.fillStyle = "rgba(255,250,244,.92)";
    roundRect(ctx, 220, 130, 584, 330, 22);
    ctx.fill();
    ctx.fillStyle = "#ff5f57"; ctx.beginPath(); ctx.arc(248, 156, 7, 0, 7); ctx.fill();
    ctx.fillStyle = "#febc2e"; ctx.beginPath(); ctx.arc(270, 156, 7, 0, 7); ctx.fill();
    ctx.fillStyle = "#28c840"; ctx.beginPath(); ctx.arc(292, 156, 7, 0, 7); ctx.fill();
    ctx.fillStyle = "#1f2023";
    ctx.textAlign = "center";
    ctx.font = `600 54px ${FONT}`;
    ctx.fillText(posterName || "你好", w / 2, 270);
    ctx.font = `24px ${FONT}`;
    ctx.fillStyle = "#6b6d73";
    ctx.fillText((posterTagline || "个人作品集").slice(0, 26), w / 2, 318);
    ctx.fillStyle = "#1f2023";
    roundRect(ctx, w / 2 - 110, 360, 220, 54, 27);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText("点击打开 ›", w / 2, 396);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,.5)";
    roundRect(ctx, 300, 560, 424, 60, 18);
    ctx.fill();
    const dock = ["#4d8dff", "#34c759", "#ff9f0a", "#ff375f", "#bf5af2", "#64d2ff"];
    dock.forEach((color, i) => {
      ctx.fillStyle = color;
      roundRect(ctx, 316 + i * 68, 568, 46, 46, 11);
      ctx.fill();
    });
    laptopTex.needsUpdate = true;
  };
  drawLaptop();

  const keyboardTex = track(canvasTexture(1024, 360, (ctx, w, h) => {
    ctx.fillStyle = "#c9cacd";
    ctx.fillRect(0, 0, w, h);
    const rows = 6;
    const keyH = h / rows;
    for (let r = 0; r < rows; r += 1) {
      const count = r === 5 ? 9 : 14;
      const keyW = w / count;
      for (let c = 0; c < count; c += 1) {
        let kw = keyW;
        let x = c * keyW;
        if (r === 5) {
          const widths = [1, 1, 1, 1.3, 5, 1.3, 1, 1, 1];
          const total = widths.reduce((a, b) => a + b, 0);
          x = widths.slice(0, c).reduce((a, b) => a + b, 0) * (w / total);
          kw = widths[c] * (w / total);
        }
        ctx.fillStyle = "#222326";
        roundRect(ctx, x + 4, r * keyH + 4, kw - 8, keyH - 8, 6);
        ctx.fill();
      }
    }
  }));

  const laptop = new THREE.Group();
  laptop.position.set(-0.02, DESK_Y, -0.16);
  const laptopBase = mesh(rbox(0.34, 0.012, 0.235, 0.006), aluminium);
  laptopBase.position.y = 0.006;
  laptop.add(laptopBase);
  const keys = new THREE.Mesh(track(new THREE.PlaneGeometry(0.29, 0.1)), std({ map: keyboardTex, roughness: 0.9 }));
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, 0.0122, -0.035);
  keys.receiveShadow = true;
  laptop.add(keys);
  const trackpad = new THREE.Mesh(track(new THREE.PlaneGeometry(0.12, 0.068)), std({ color: 0xc6c7ca, metalness: 0.7, roughness: 0.28 }));
  trackpad.rotation.x = -Math.PI / 2;
  trackpad.position.set(0, 0.0122, 0.068);
  laptop.add(trackpad);
  const lid = new THREE.Group();
  lid.position.set(0, 0.012, -0.1165);
  lid.rotation.x = -0.26;
  const lidShell = mesh(rbox(0.34, 0.228, 0.007, 0.006), aluminium);
  lidShell.position.set(0, 0.114, -0.0035);
  lid.add(lidShell);
  const bezel = new THREE.Mesh(track(new THREE.PlaneGeometry(0.33, 0.218)), blackGlass);
  bezel.position.set(0, 0.114, 0.0002);
  lid.add(bezel);
  const laptopScreen = new THREE.Mesh(track(new THREE.PlaneGeometry(0.312, 0.195)), screenMaterial(laptopTex, 1.15));
  laptopScreen.position.set(0, 0.116, 0.0005);
  lid.add(laptopScreen);
  laptop.add(lid);
  scene.add(laptop);
  addHotspot("laptop", laptop, laptopScreen, 0.004);

  const screenGlow = new THREE.PointLight(0xe6eeff, 0.1, 0.9, 2);
  screenGlow.position.set(-0.02, DESK_Y + 0.14, -0.08);
  scene.add(screenGlow);

  /* ---------------- 外接键盘 ---------------- */
  const keyboard = new THREE.Group();
  keyboard.position.set(-0.02, DESK_Y, 0.13);
  const kbBase = mesh(rbox(0.37, 0.008, 0.125, 0.004), aluminium);
  kbBase.position.y = 0.004;
  keyboard.add(kbBase);
  const keyGeo = rbox(0.0165, 0.005, 0.0165, 0.002);
  const keyMat = std({ color: 0xf8f8f6, roughness: 0.55 });
  const keyLayout: { x: number; z: number; w: number }[] = [];
  const pitch = 0.0188;
  for (let r = 0; r < 5; r += 1) {
    const count = r === 4 ? 0 : 18;
    for (let c = 0; c < count; c += 1) keyLayout.push({ x: -0.17 + c * pitch + (r % 2) * 0.004, z: -0.045 + r * pitch, w: 1 });
  }
  const bottomRow = [1, 1, 1.4, 6.4, 1.4, 1, 1, 1];
  let bx = -0.17;
  for (const units of bottomRow) {
    keyLayout.push({ x: bx + ((units - 1) * pitch) / 2, z: -0.045 + 4 * pitch, w: units });
    bx += units * pitch;
  }
  const keyMesh = new THREE.InstancedMesh(keyGeo, keyMat, keyLayout.length);
  keyMesh.castShadow = true;
  keyMesh.receiveShadow = true;
  const keyOffsets = new Float32Array(keyLayout.length);
  const keyDummy = new THREE.Object3D();
  const placeKeys = () => {
    keyLayout.forEach((key, i) => {
      keyDummy.position.set(key.x, 0.0098 - keyOffsets[i], key.z);
      keyDummy.scale.set(key.w * (pitch / 0.0165) - (pitch - 0.0165) / 0.0165, 1, 1);
      keyDummy.updateMatrix();
      keyMesh.setMatrixAt(i, keyDummy.matrix);
    });
    keyMesh.instanceMatrix.needsUpdate = true;
  };
  placeKeys();
  keyboard.add(keyMesh);
  scene.add(keyboard);
  addHotspot("keyboard", keyboard, keyboard, 0.004);

  /* ---------------- 鼠标（白色妙控鼠标样式） ---------------- */
  const mouse = new THREE.Group();
  mouse.position.set(0.31, DESK_Y, 0.14);
  mouse.rotation.y = -0.12;
  const mouseBody = mesh(track(new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2)), phys({ color: 0xfbfbfa, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08 }));
  mouseBody.scale.set(0.0285, 0.0185, 0.0565);
  mouseBody.position.y = 0.0025;
  mouse.add(mouseBody);
  const mouseFoot = mesh(track(new THREE.CylinderGeometry(1, 1, 1, 40)), aluminium);
  mouseFoot.scale.set(0.0285, 0.003, 0.0565);
  mouseFoot.position.y = 0.0015;
  mouse.add(mouseFoot);
  scene.add(mouse);
  addHotspot("mouse", mouse, mouseBody, 0.006);

  /* ---------------- 平板（斜靠在支架上） ---------------- */
  const tabletTex = track(canvasTexture(1024, 720, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#5e8fb3");
    bg.addColorStop(0.6, "#8fb5b0");
    bg.addColorStop(1, "#ecc9a2");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.font = `600 84px ${FONT}`;
    ctx.fillText("10:30", 60, 140);
    ctx.font = `28px ${FONT}`;
    ctx.fillText("我的相册 · 视频 · 作品", 64, 190);
    const apps: [string, string][] = [["相册", "#ff9f0a"], ["视频", "#ff375f"], ["作品", "#0a84ff"], ["图文", "#30d158"], ["演示", "#bf5af2"]];
    apps.forEach(([label, color], i) => {
      const x = 80 + i * 180;
      const y = 300;
      ctx.fillStyle = color;
      roundRect(ctx, x, y, 120, 120, 30);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.95)";
      ctx.font = `26px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(label, x + 60, y + 165);
      ctx.textAlign = "left";
    });
    ctx.fillStyle = "rgba(255,255,255,.25)";
    roundRect(ctx, 200, 600, 624, 90, 30);
    ctx.fill();
  }));
  const tablet = new THREE.Group();
  tablet.position.set(-0.46, DESK_Y, 0.08);
  tablet.rotation.y = 0.32;
  const tabletTilt = new THREE.Group();
  tabletTilt.rotation.x = -1.0;
  tabletTilt.position.set(0, 0.012, 0.06);
  const tabletBody = mesh(rbox(0.25, 0.175, 0.007, 0.012), aluminium);
  tabletBody.position.y = 0.0875;
  tabletTilt.add(tabletBody);
  const tabletBezel = new THREE.Mesh(track(new THREE.PlaneGeometry(0.242, 0.167)), blackGlass);
  tabletBezel.position.set(0, 0.0875, 0.0036);
  tabletTilt.add(tabletBezel);
  const tabletScreen = new THREE.Mesh(track(new THREE.PlaneGeometry(0.228, 0.16)), screenMaterial(tabletTex, 1.1));
  tabletScreen.position.set(0, 0.0875, 0.0038);
  tabletTilt.add(tabletScreen);
  tablet.add(tabletTilt);
  const stand = mesh(rbox(0.12, 0.012, 0.14, 0.004), aluminium);
  stand.position.set(0, 0.006, 0.02);
  tablet.add(stand);
  scene.add(tablet);
  addHotspot("tablet", tablet, tabletScreen, 0.006);

  /* ---------------- 手机 ---------------- */
  const phoneTex = track(canvasTexture(400, 860, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#4f7396");
    bg.addColorStop(1, "#c9a79a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = `200 110px ${FONT}`;
    ctx.fillText("10:30", w / 2, 200);
    ctx.font = `22px ${FONT}`;
    ctx.fillText("轻点打开", w / 2, 240);
    ctx.fillStyle = "rgba(255,255,255,.88)";
    roundRect(ctx, 24, 300, w - 48, 120, 26);
    ctx.fill();
    ctx.fillStyle = "#07c160";
    roundRect(ctx, 44, 322, 44, 44, 10);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "#222";
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText("微信", 102, 344);
    ctx.font = `22px ${FONT}`;
    ctx.fillStyle = "#333";
    ctx.fillText("小柴：来聊聊吧～", 102, 380);
    ctx.fillStyle = "rgba(255,255,255,.6)";
    roundRect(ctx, w / 2 - 70, h - 30, 140, 8, 4);
    ctx.fill();
  }));
  const phone = new THREE.Group();
  phone.position.set(0.53, DESK_Y, 0.15);
  phone.rotation.y = -0.42;
  const phoneBody = mesh(rbox(0.074, 0.008, 0.155, 0.01), aluminium);
  phoneBody.position.y = 0.004;
  phone.add(phoneBody);
  const phoneGlass = new THREE.Mesh(track(new THREE.PlaneGeometry(0.07, 0.151)), blackGlass);
  phoneGlass.rotation.x = -Math.PI / 2;
  phoneGlass.position.y = 0.0082;
  phone.add(phoneGlass);
  const phoneScreen = new THREE.Mesh(track(new THREE.PlaneGeometry(0.066, 0.143)), screenMaterial(phoneTex, 1.1));
  phoneScreen.rotation.x = -Math.PI / 2;
  phoneScreen.position.y = 0.0084;
  phone.add(phoneScreen);
  scene.add(phone);
  addHotspot("phone", phone, phoneScreen, 0.01);

  /* ---------------- 纸质笔记本和笔 ---------------- */
  const coverTex = track(canvasTexture(512, 720, (ctx, w, h) => {
    ctx.fillStyle = "#d9d4c8";
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(9);
    for (let i = 0; i < 6000; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? "rgba(0,0,0,.035)" : "rgba(255,255,255,.08)";
      ctx.fillRect(rand() * w, rand() * h, 2, 2);
    }
    ctx.fillStyle = "#3b3a37";
    ctx.textAlign = "center";
    ctx.font = `500 46px ${FONT}`;
    ctx.fillText("诗 与 随 笔", w / 2, h * 0.42);
    ctx.fillRect(w / 2 - 20, h * 0.455, 40, 2);
    ctx.font = `22px ${FONT}`;
    ctx.fillStyle = "#8a877f";
    ctx.fillText("N O T E S", w / 2, h * 0.51);
  }));
  const notebook = new THREE.Group();
  notebook.position.set(0.66, DESK_Y, -0.05);
  notebook.rotation.y = -0.16;
  const paper = mesh(rbox(0.146, 0.012, 0.206, 0.002), std({ color: 0xfaf8f2, roughness: 0.9 }));
  paper.position.set(0.002, 0.0075, 0);
  notebook.add(paper);
  const leather = std({ color: 0xd9d4c8, roughness: 0.85 });
  const bottomCover = mesh(rbox(0.15, 0.003, 0.21, 0.003), leather);
  bottomCover.position.y = 0.0015;
  notebook.add(bottomCover);
  const topCover = mesh(rbox(0.15, 0.003, 0.21, 0.003), [leather, leather, std({ map: coverTex, roughness: 0.85 }), leather, leather, leather]);
  topCover.position.y = 0.0145;
  notebook.add(topCover);
  const band = mesh(rbox(0.006, 0.0172, 0.213, 0.002), std({ color: 0x8b8983, roughness: 0.8 }));
  band.position.set(0.058, 0.0082, 0);
  notebook.add(band);
  const pen = new THREE.Group();
  pen.position.set(0.105, 0.005, 0.0);
  pen.rotation.y = -0.1;
  const penBody = mesh(track(new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 20)), std({ color: 0xf2f2f0, metalness: 0.2, roughness: 0.35 }));
  penBody.rotation.x = Math.PI / 2;
  pen.add(penBody);
  const penTip = mesh(track(new THREE.ConeGeometry(0.0045, 0.014, 20)), aluminium);
  penTip.rotation.x = Math.PI / 2;
  penTip.position.z = 0.077;
  pen.add(penTip);
  notebook.add(pen);
  scene.add(notebook);
  addHotspot("notebook", notebook, topCover, 0.01);

  /* ---------------- 台灯（白色细杆极简款） ---------------- */
  const lamp = new THREE.Group();
  lamp.position.set(-0.64, DESK_Y, -0.36);
  const lampTargetWorld = new THREE.Vector3(-0.3, DESK_Y, -0.1);
  // 灯臂沿本地 +x 伸出，整体转向桌面中间。
  lamp.rotation.y = -Math.atan2(lampTargetWorld.z - lamp.position.z, lampTargetWorld.x - lamp.position.x);
  const lampWhite = std({ color: 0xf7f6f3, roughness: 0.42 });
  const lampBase = mesh(track(new THREE.CylinderGeometry(0.06, 0.062, 0.012, 48)), lampWhite);
  lampBase.position.y = 0.006;
  lamp.add(lampBase);
  const lampSwitch = mesh(track(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 24)), aluminium);
  lampSwitch.position.set(0.03, 0.014, 0.012);
  lamp.add(lampSwitch);
  const lampStem = mesh(track(new THREE.CylinderGeometry(0.0055, 0.0055, 0.3, 20)), lampWhite);
  lampStem.position.set(-0.034, 0.012 + 0.15, 0);
  lamp.add(lampStem);
  const lampElbow = mesh(track(new THREE.SphereGeometry(0.0085, 20, 14)), aluminium);
  lampElbow.position.set(-0.034, 0.312, 0);
  lamp.add(lampElbow);
  const lampArm = mesh(track(new THREE.CylinderGeometry(0.0048, 0.0048, 0.21, 20)), lampWhite);
  lampArm.rotation.z = Math.PI / 2;
  lampArm.position.set(0.071, 0.312, 0);
  lamp.add(lampArm);
  const lampHead = new THREE.Group();
  lampHead.position.set(0.176, 0.312, 0);
  lampHead.rotation.z = -0.22;
  const shadeProfile = [
    new THREE.Vector2(0.012, 0.03), new THREE.Vector2(0.02, 0.028), new THREE.Vector2(0.05, -0.02), new THREE.Vector2(0.052, -0.026),
    new THREE.Vector2(0.049, -0.026), new THREE.Vector2(0.018, 0.024), new THREE.Vector2(0, 0.024),
  ];
  const lampShade = mesh(track(new THREE.LatheGeometry(shadeProfile, 48)), std({ color: 0xf7f6f3, roughness: 0.42, side: THREE.DoubleSide }));
  lampHead.add(lampShade);
  const bulbMat = std({ color: 0xfff6e6, emissive: new THREE.Color(0xffd9a6), emissiveIntensity: 2.5, roughness: 0.6 });
  const bulb = new THREE.Mesh(track(new THREE.SphereGeometry(0.019, 24, 16)), bulbMat);
  bulb.position.y = -0.004;
  lampHead.add(bulb);
  lamp.add(lampHead);
  scene.add(lamp);
  addHotspot("lamp", lamp, lamp, 0);
  const lampEmissive: THREE.MeshStandardMaterial[] = [bulbMat];
  lamp.updateMatrixWorld(true);
  const bulbWorld = bulb.getWorldPosition(new THREE.Vector3());
  const spot = new THREE.SpotLight(0xffc98f, 3, 2.4, 0.72, 0.8, 1.6);
  spot.position.copy(bulbWorld).add(new THREE.Vector3(0, -0.03, 0));
  spot.target.position.copy(lampTargetWorld);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.015;
  spot.shadow.radius = 5;
  spot.shadow.camera.near = 0.03;
  spot.shadow.camera.far = 2.5;
  scene.add(spot, spot.target);
  const lampGlow = new THREE.PointLight(0xffc98f, 0.3, 1.2, 2);
  lampGlow.position.copy(bulbWorld).add(new THREE.Vector3(0, -0.05, 0));
  scene.add(lampGlow);

  /* ---------------- 白天的自然光：窗户一侧的柔和日光 + 天光 ---------------- */
  const hemi = new THREE.HemisphereLight(0xf8f6f1, 0xc9bfb0, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e4, 2.3);
  sun.position.set(-1.5, 2.3, 0.7);
  sun.target.position.set(0, DESK_Y, -0.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  sun.shadow.camera.left = -1.3;
  sun.shadow.camera.right = 1.3;
  sun.shadow.camera.top = 1.3;
  sun.shadow.camera.bottom = -1.3;
  sun.shadow.camera.near = 0.2;
  sun.shadow.camera.far = 6;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.012;
  sun.shadow.radius = 7;
  scene.add(sun, sun.target);

  /* ---------------- 杯子和热气 ---------------- */
  const mug = new THREE.Group();
  mug.position.set(0.4, DESK_Y, -0.15);
  const mugProfile = [
    new THREE.Vector2(0, 0), new THREE.Vector2(0.036, 0), new THREE.Vector2(0.039, 0.004), new THREE.Vector2(0.04, 0.094),
    new THREE.Vector2(0.0365, 0.095), new THREE.Vector2(0.036, 0.01), new THREE.Vector2(0, 0.01),
  ];
  const ceramic = phys({ color: 0xf6f4f0, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4 });
  const mugBody = mesh(track(new THREE.LatheGeometry(mugProfile, 48)), ceramic);
  mug.add(mugBody);
  const handle = mesh(track(new THREE.TorusGeometry(0.024, 0.0065, 14, 28, Math.PI)), ceramic);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.039, 0.05, 0);
  mug.add(handle);
  const coffee = new THREE.Mesh(track(new THREE.CircleGeometry(0.0362, 40)), phys({ color: 0xb08860, roughness: 0.3, clearcoat: 0.6 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 0.078;
  mug.add(coffee);
  scene.add(mug);
  addHotspot("mug", mug, mugBody, 0.01);

  const steamTex = track(canvasTexture(128, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.scale(1, 2);
    ctx.fillRect(0, 0, w, h);
  }));
  const steam: { sprite: THREE.Sprite; phase: number }[] = [];
  for (let i = 0; i < 4; i += 1) {
    const material = track(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 }));
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.035, 0.07, 1);
    mug.add(sprite);
    steam.push({ sprite, phase: i / 4 });
  }

  /* ---------------- 小音箱（浅灰织物圆柱款） ---------------- */
  const fabricTex = track(noiseTexture("#d6d5d1", "#b9b8b3", 33, 256));
  fabricTex.wrapS = fabricTex.wrapT = THREE.RepeatWrapping;
  fabricTex.repeat.set(4, 2);
  const speaker = new THREE.Group();
  speaker.position.set(0.66, DESK_Y, -0.33);
  speaker.rotation.y = -0.45;
  const speakerProfile: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i += 1) { const a = (i / 8) * Math.PI / 2; speakerProfile.push(new THREE.Vector2(0.037 + Math.sin(a) * 0.013, 0.013 - Math.cos(a) * 0.013)); }
  for (let i = 0; i <= 8; i += 1) { const a = (i / 8) * Math.PI / 2; speakerProfile.push(new THREE.Vector2(0.037 + Math.cos(a) * 0.013, 0.095 + Math.sin(a) * 0.013)); }
  const speakerBody = mesh(track(new THREE.LatheGeometry(speakerProfile, 56)), std({ map: fabricTex, roughness: 0.95 }));
  speaker.add(speakerBody);
  const grille = speakerBody;
  const speakerFoot = mesh(track(new THREE.CylinderGeometry(0.037, 0.037, 0.003, 40)), whitePlastic);
  speakerFoot.position.y = 0.0015;
  speaker.add(speakerFoot);
  const speakerTop = mesh(track(new THREE.CylinderGeometry(0.037, 0.037, 0.002, 48)), phys({ color: 0xfafaf8, roughness: 0.12, clearcoat: 1 }));
  speakerTop.position.y = 0.1085;
  speaker.add(speakerTop);
  const ledMat = std({ color: 0xe9e9e6, emissive: new THREE.Color(0x7fd6ff), emissiveIntensity: 0, roughness: 0.4 });
  const speakerLed = new THREE.Mesh(track(new THREE.TorusGeometry(0.014, 0.0012, 10, 40)), ledMat);
  speakerLed.rotation.x = Math.PI / 2;
  speakerLed.position.y = 0.1098;
  speaker.add(speakerLed);
  scene.add(speaker);
  addHotspot("speaker", speaker, speakerBody, 0.006);

  /* ---------------- 插线板（国标五孔）、插头、充电器和电线 ---------------- */
  const socket = new THREE.Group();
  socket.position.set(0.2, DESK_Y, -0.45);
  const stripBody = mesh(rbox(0.32, 0.034, 0.068, 0.012), whitePlastic);
  stripBody.position.y = 0.017;
  socket.add(stripBody);
  const plateMat = std({ color: 0xfdfdfb, roughness: 0.4 });
  const holeMat = std({ color: 0x0b0b0b, roughness: 0.9 });
  const slotGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const slot = (x: number, z: number, length: number, angle: number) => {
    const hole = new THREE.Mesh(slotGeo, holeMat);
    hole.scale.set(0.0019, 0.0016, length);
    hole.position.set(x, 0.0358, z);
    hole.rotation.y = angle;
    socket.add(hole);
  };
  const outletX = [-0.105, -0.025, 0.055];
  for (const cx of outletX) {
    const plate = mesh(rbox(0.068, 0.003, 0.058, 0.006), plateMat, false);
    plate.position.set(cx, 0.0345, 0);
    socket.add(plate);
    slot(cx - 0.0065, 0.016, 0.0068, 0);
    slot(cx + 0.0065, 0.016, 0.0068, 0);
    slot(cx, -0.018, 0.0078, 0);
    slot(cx - 0.009, -0.004, 0.0078, -0.52);
    slot(cx + 0.009, -0.004, 0.0078, 0.52);
  }
  const switchMat = std({ color: 0xd9574a, emissive: new THREE.Color(0xff4a3a), emissiveIntensity: 0.8, roughness: 0.4 });
  const rocker = mesh(rbox(0.022, 0.008, 0.03, 0.004), switchMat, false);
  rocker.position.set(0.128, 0.037, 0);
  socket.add(rocker);
  const plugMat = std({ color: 0xe9e8e4, roughness: 0.5 });
  const plug = (cx: number) => {
    const body = mesh(rbox(0.026, 0.03, 0.019, 0.005), plugMat);
    body.position.set(cx, 0.036 + 0.015, 0.016);
    socket.add(body);
  };
  plug(outletX[0]);
  plug(outletX[2]);
  // 电脑充电器：插头一体的白色适配器，插在中间两孔上。
  const charger = mesh(rbox(0.048, 0.034, 0.044, 0.008), whitePlastic);
  charger.position.set(outletX[1], 0.036 + 0.017, 0.012);
  socket.add(charger);
  scene.add(socket);
  addHotspot("socket", socket, stripBody, 0.004);

  const cableMat = std({ color: 0xd7d6d1, roughness: 0.6 });
  const whiteCableMat = std({ color: 0xf8f7f4, roughness: 0.45 });
  const cable = (points: [number, number, number][], material = cableMat, radius = 0.0032) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    scene.add(mesh(track(new THREE.TubeGeometry(curve, 96, radius, 8, false)), material));
  };
  const cy = DESK_Y + 0.0032;
  const sx = socket.position.x;
  const sz = socket.position.z;
  const plugTop = DESK_Y + 0.066;
  cable([[sx + outletX[0], plugTop, sz + 0.016], [sx + outletX[0], plugTop + 0.012, sz + 0.004], [sx + outletX[0] - 0.01, DESK_Y + 0.02, sz - 0.055], [sx - 0.25, cy, sz - 0.06], [-0.5, cy, -0.47], [-0.64, cy, -0.4]]);
  cable([[sx + outletX[2], plugTop, sz + 0.016], [sx + outletX[2], plugTop + 0.012, sz + 0.004], [sx + outletX[2] + 0.01, DESK_Y + 0.02, sz - 0.055], [0.42, cy, -0.5], [0.58, cy, -0.42], [0.63, cy + 0.01, -0.37]]);
  cable([[sx + 0.16, DESK_Y + 0.017, sz], [sx + 0.2, cy, sz - 0.04], [sx + 0.24, DESK_Y - 0.01, -0.6], [sx + 0.26, 0.35, -0.61], [sx + 0.3, 0.02, -0.57]]);
  // USB-C 线：从充电器前面落到桌面，接到电脑右侧的接口。
  const portX = -0.02 + 0.17;
  const portZ = -0.22;
  cable([[sx + outletX[1], DESK_Y + 0.03, sz + 0.035], [sx + outletX[1], DESK_Y + 0.012, sz + 0.06], [sx + outletX[1] - 0.005, cy, sz + 0.1], [0.2, cy, -0.28], [0.19, cy + 0.002, portZ], [portX + 0.02, DESK_Y + 0.006, portZ]], whiteCableMat, 0.0024);
  const usbHead = mesh(rbox(0.02, 0.006, 0.009, 0.002), std({ color: 0xe8e8e6, roughness: 0.4 }));
  usbHead.position.set(portX + 0.01, DESK_Y + 0.006, portZ);
  scene.add(usbHead);

  /* ---------------- 绿植（Poly Haven 模型）、笔筒 ---------------- */
  const plant = new THREE.Group();
  plant.position.set(-0.3, DESK_Y, -0.42);
  scene.add(plant);
  addHotspot("plant", plant, plant, 0.006);
  loadModel("potted_plant_04", model => { model.scale.setScalar(0.85); plant.add(model); });

  const penCup = new THREE.Group();
  penCup.position.set(-0.71, DESK_Y, -0.1);
  const cupProfile = [
    new THREE.Vector2(0, 0), new THREE.Vector2(0.03, 0), new THREE.Vector2(0.032, 0.003), new THREE.Vector2(0.032, 0.09),
    new THREE.Vector2(0.0295, 0.09), new THREE.Vector2(0.0295, 0.006), new THREE.Vector2(0, 0.006),
  ];
  penCup.add(mesh(track(new THREE.LatheGeometry(cupProfile, 40)), std({ color: 0xf5f4f1, roughness: 0.55, side: THREE.DoubleSide })));
  const pencilGeo = track(new THREE.CylinderGeometry(0.0036, 0.0036, 0.15, 12));
  const pencils: [number, number, number][] = [[0x2f3033, 0.3, 0.14], [0xe2ded6, 2.4, 0.17], [0xc7a77c, 4.4, 0.12]];
  for (const [color, angle, lean] of pencils) {
    const pencil = mesh(pencilGeo, std({ color, roughness: 0.5 }));
    pencil.position.set(Math.cos(angle) * 0.012, 0.082, Math.sin(angle) * 0.012);
    pencil.rotation.set(Math.sin(angle) * lean, 0, -Math.cos(angle) * lean);
    penCup.add(pencil);
  }
  scene.add(penCup);

  /* ---------------- 交互 ---------------- */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  const parallax = new THREE.Vector2(0, 0);
  const parallaxTarget = new THREE.Vector2(0, 0);
  let hovered: DeskHotspot | null = null;
  let focused: DeskHotspot | null = null;
  let downAt: { x: number; y: number; t: number } | null = null;
  let needsPick = false;
  let pointerClient = { x: 0, y: 0 };
  let pan = 0;
  let panTarget = 0;
  let panStart = 0;
  const portrait = () => (camera.aspect || 1.6) < 1;

  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3().copy(homeTarget);
  const wantPos = new THREE.Vector3();
  const wantTarget = new THREE.Vector3();

  const hotspotFromObject = (object: THREE.Object3D | null) => {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current.userData.hotspot) return current.userData.hotspot as DeskHotspot;
      current = current.parent;
    }
    return null;
  };
  const pick = () => {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...hotspots.values()], true);
    return hits.length ? hotspotFromObject(hits[0].object) : null;
  };
  const toPointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    pointerClient = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent) => {
    toPointer(event);
    if (downAt && portrait() && !focused) {
      const width = canvas.clientWidth || window.innerWidth;
      panTarget = Math.max(-0.5, Math.min(0.5, panStart - ((event.clientX - downAt.x) / width) * 1.1));
    }
    if (event.pointerType === "mouse") parallaxTarget.set(pointer.x, pointer.y);
    needsPick = event.pointerType === "mouse";
  };
  const onPointerDown = (event: PointerEvent) => {
    toPointer(event);
    downAt = { x: event.clientX, y: event.clientY, t: performance.now() };
    panStart = panTarget;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!downAt) return;
    const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
    downAt = null;
    if (moved > 8 || focused) return;
    toPointer(event);
    const hit = pick();
    if (hit) options.onSelect(hit);
  };
  const onPointerLeave = () => {
    pointer.set(9, 9);
    parallaxTarget.set(0, 0);
    needsPick = true;
  };
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);

  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  const homePose = (pos: THREE.Vector3, target: THREE.Vector3) => {
    const aspect = camera.aspect || 1.6;
    const k = aspect < 1.45 ? Math.min(2.5, 1.45 / aspect) : 1;
    target.copy(homeTarget);
    if (aspect < 1) {
      // 竖屏装不下整张桌子：镜头抬高往下看，左右拖动查看两边。
      target.x += pan;
      target.z += 0.02;
      pos.set(target.x, target.y + 1.38, target.z + 0.86);
      return;
    }
    pos.copy(homeTarget).addScaledVector(homeOffset, k);
  };
  homePose(camPos, camTarget);

  /* ---------------- 状态 ---------------- */
  let lampOn = true;
  let powerOn = true;
  let musicOn = false;
  let lampLevel = 1;
  let powerLevel = 1;
  let musicLevel = 0;
  let keyPress = 0;

  const damp = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));

  let raf = 0;
  let last = performance.now();
  let readySent = false;
  const tmp = new THREE.Vector3();
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = now / 1000;

    if (needsPick && !focused) {
      needsPick = false;
      const hit = pointer.x > 5 ? null : pick();
      if (hit !== hovered) {
        hovered = hit;
        canvas.style.cursor = hit ? "pointer" : "default";
      }
      options.onHover(hovered, pointerClient.x, pointerClient.y);
    }
    for (const item of hoverables) {
      item.target = item.group.userData.hotspot === hovered && !focused ? item.maxLift : 0;
      item.lift = damp(item.lift, item.target, 14, dt);
      item.group.position.y = item.baseY + item.lift;
    }

    pan = damp(pan, portrait() ? panTarget : 0, 6, dt);
    parallax.x = damp(parallax.x, focused ? 0 : parallaxTarget.x, 3, dt);
    parallax.y = damp(parallax.y, focused ? 0 : parallaxTarget.y, 3, dt);
    homePose(wantPos, wantTarget);
    if (focused) {
      const object = measureTargets.get(focused);
      if (object) {
        object.getWorldPosition(tmp);
        wantTarget.lerp(tmp, 0.55);
        wantPos.lerp(tmp.clone().add(new THREE.Vector3(0, 0.3, 0.42)), 0.35);
      }
    } else {
      wantPos.x += parallax.x * 0.07;
      wantPos.y += parallax.y * 0.035;
      wantTarget.x += parallax.x * 0.02;
    }
    camPos.x = damp(camPos.x, wantPos.x, 4.2, dt);
    camPos.y = damp(camPos.y, wantPos.y, 4.2, dt);
    camPos.z = damp(camPos.z, wantPos.z, 4.2, dt);
    camTarget.x = damp(camTarget.x, wantTarget.x, 4.2, dt);
    camTarget.y = damp(camTarget.y, wantTarget.y, 4.2, dt);
    camTarget.z = damp(camTarget.z, wantTarget.z, 4.2, dt);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);

    const lit = lampOn && powerOn ? 1 : 0;
    lampLevel = damp(lampLevel, lit, 7, dt);
    powerLevel = damp(powerLevel, powerOn ? 1 : 0, 6, dt);
    musicLevel = damp(musicLevel, musicOn && powerOn ? 1 : 0, 5, dt);
    spot.intensity = 3 * lampLevel;
    lampGlow.intensity = 0.3 * lampLevel;
    lampEmissive.forEach(material => { material.emissiveIntensity = 2.5 * lampLevel; });
    renderer.toneMappingExposure = 0.97 + 0.05 * lampLevel;
    switchMat.emissiveIntensity = 0.8 * powerLevel;
    screenGlow.intensity = 0.18 * powerLevel;
    const laptopLevel = 0.04 + 0.96 * powerLevel;
    screenMats.forEach(({ material, base }, index) => {
      const level = index === 0 ? laptopLevel : 1;
      material.color.setRGB(base.r * level, base.g * level, base.b * level);
    });
    ledMat.emissiveIntensity = 2.2 * musicLevel * (0.6 + 0.4 * Math.sin(time * 6));
    const beat = musicLevel * (0.5 + 0.5 * Math.sin(time * Math.PI * 4)) ** 4;
    grille.scale.set(1 + beat * 0.014, 1, 1 + beat * 0.014);

    for (const puff of steam) {
      const t = (time * 0.18 + puff.phase) % 1;
      puff.sprite.position.set(Math.sin((t + puff.phase) * 6) * 0.008, 0.09 + t * 0.12, Math.cos(t * 5 + puff.phase * 3) * 0.006);
      puff.sprite.scale.set(0.03 + t * 0.03, 0.06 + t * 0.06, 1);
      (puff.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(t * Math.PI) * 0.22;
    }

    if (keyPress > 0) {
      keyPress = Math.max(0, keyPress - dt);
      for (let i = 0; i < keyOffsets.length; i += 1) keyOffsets[i] = damp(keyOffsets[i], 0, 18, dt);
      if (Math.random() < 0.5) keyOffsets[Math.floor(Math.random() * keyOffsets.length)] = 0.003;
      placeKeys();
    }

    renderer.render(scene, camera);
    if (!readySent && assetsReady) {
      readySent = true;
      options.onReady?.();
    }
  };
  raf = requestAnimationFrame(loop);

  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  return {
    screenRect(kind) {
      const object = measureTargets.get(kind);
      if (!object) return null;
      object.updateWorldMatrix(true, true);
      box.setFromObject(object);
      const rect = canvas.getBoundingClientRect();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < 8; i += 1) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
        const x = rect.left + ((corner.x + 1) / 2) * rect.width;
        const y = rect.top + ((1 - corner.y) / 2) * rect.height;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      return new DOMRect(minX, minY, Math.max(4, maxX - minX), Math.max(4, maxY - minY));
    },
    focus(kind) {
      focused = kind;
      if (kind) {
        hovered = null;
        canvas.style.cursor = "default";
        options.onHover(null, 0, 0);
      }
    },
    setLamp(on) { lampOn = on; },
    setPower(on) { powerOn = on; },
    setMusic(playing) { musicOn = playing; },
    pressKeys() { keyPress = 0.9; },
    setIdentity(name, tagline) {
      posterName = name;
      posterTagline = tagline;
      drawPoster();
      drawLaptop();
    },
    dispose() {
      disposed = true;
      window.clearTimeout(readyTimer);
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      keyMesh.dispose();
      disposables.forEach(item => item.dispose());
      renderer.dispose();
    },
  };
}
