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

function woodTexture(base: string, dark: string, seed: number, planks = 1) {
  return canvasTexture(1024, 512, (ctx, w, h) => {
    const rand = seeded(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const plankH = h / planks;
    for (let p = 0; p < planks; p += 1) {
      const tint = (rand() - 0.5) * 0.18;
      ctx.fillStyle = tint > 0 ? `rgba(255,220,180,${tint})` : `rgba(40,20,10,${-tint})`;
      ctx.fillRect(0, p * plankH, w, plankH);
      for (let i = 0; i < 70; i += 1) {
        const y0 = p * plankH + rand() * plankH;
        const amp = 2 + rand() * 6;
        const freq = 0.004 + rand() * 0.01;
        const phase = rand() * Math.PI * 2;
        ctx.strokeStyle = dark;
        ctx.globalAlpha = 0.05 + rand() * 0.16;
        ctx.lineWidth = 0.6 + rand() * 2.2;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.3;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (planks > 1) {
        ctx.fillStyle = "rgba(20,10,5,.55)";
        ctx.fillRect(0, p * plankH, w, 2);
        const joint = rand() * w;
        ctx.fillRect(joint, p * plankH, 2, plankH);
      }
    }
    for (let i = 0; i < 4; i += 1) {
      const x = rand() * w;
      const y = rand() * h;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 8 + rand() * 14);
      g.addColorStop(0, "rgba(40,20,8,.55)");
      g.addColorStop(1, "rgba(40,20,8,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, 30, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
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
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15100c);
  scene.fog = new THREE.Fog(0x15100c, 3.2, 7);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.24;

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

  /* 真实素材来自 Poly Haven（CC0），放在 public/desk。全部加载完（或超时）再显示画面。 */
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
  new HDRLoader(manager).load("/desk/hdri/comfy_cafe_1k.hdr", hdr => {
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
  const floor = mesh(track(new THREE.PlaneGeometry(10, 10)), std({ ...pbrMaps("wooden_floor_02", 5, 5), color: 0xb08868 }), false);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const wallMat = std({ ...pbrMaps("white_plaster_02", 5, 1.7), color: 0xe6d3b8 });
  const backWall = mesh(track(new THREE.PlaneGeometry(10, 3.4)), wallMat, false);
  backWall.position.set(0, 1.7, -0.62);
  scene.add(backWall);
  const sideWall = mesh(track(new THREE.PlaneGeometry(6, 3.4)), wallMat, false);
  sideWall.rotation.y = Math.PI / 2;
  sideWall.position.set(-1.9, 1.7, 1.5);
  scene.add(sideWall);
  const skirting = mesh(rbox(10, 0.09, 0.02, 0.004), std({ color: 0x3d2a1e, roughness: 0.5 }), false);
  skirting.position.set(0, 0.045, -0.61);
  scene.add(skirting);

  // 窗：玻璃是一张夜景贴图，外加窗框、窗台和一侧窗帘。
  const nightTex = track(canvasTexture(1024, 768, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#0d1530");
    sky.addColorStop(0.55, "#2b3157");
    sky.addColorStop(0.82, "#7a5a68");
    sky.addColorStop(1, "#c98a62");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(7);
    for (let i = 0; i < 90; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.6})`;
      ctx.fillRect(rand() * w, rand() * h * 0.45, 1.5, 1.5);
    }
    const moon = ctx.createRadialGradient(w * 0.74, h * 0.2, 0, w * 0.74, h * 0.2, 70);
    moon.addColorStop(0, "rgba(255,246,220,1)");
    moon.addColorStop(0.35, "rgba(255,240,210,.9)");
    moon.addColorStop(0.4, "rgba(255,230,200,.25)");
    moon.addColorStop(1, "rgba(255,230,200,0)");
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i += 1) {
      const bw = 30 + rand() * 70;
      const bh = 80 + rand() * 260;
      const bx = rand() * w;
      ctx.fillStyle = `rgb(${18 + rand() * 12},${18 + rand() * 12},${32 + rand() * 16})`;
      ctx.fillRect(bx, h - bh, bw, bh);
      for (let y = h - bh + 10; y < h - 8; y += 14) {
        for (let x = bx + 6; x < bx + bw - 6; x += 11) {
          if (rand() < 0.32) {
            ctx.fillStyle = rand() < 0.7 ? "rgba(255,196,120,.85)" : "rgba(180,220,255,.7)";
            ctx.fillRect(x, y, 5, 7);
          }
        }
      }
    }
  }));
  const windowGroup = new THREE.Group();
  windowGroup.position.set(-0.78, 1.62, -0.61);
  const glass = new THREE.Mesh(track(new THREE.PlaneGeometry(1.1, 0.84)), track(new THREE.MeshBasicMaterial({ map: nightTex, color: 0xb8b8c8 })));
  glass.position.z = 0.001;
  windowGroup.add(glass);
  const frameMat = std({ color: 0xece4d6, roughness: 0.55 });
  const frameParts: [number, number, number, number][] = [
    [1.18, 0.05, 0, 0.445], [1.18, 0.05, 0, -0.445], [0.05, 0.94, -0.565, 0], [0.05, 0.94, 0.565, 0], [0.03, 0.84, 0, 0], [1.1, 0.025, 0, 0.12],
  ];
  for (const [w, h, x, y] of frameParts) {
    const part = mesh(rbox(w, h, 0.05, 0.008), frameMat, false);
    part.position.set(x, y, 0.025);
    windowGroup.add(part);
  }
  const sill = mesh(rbox(1.28, 0.03, 0.14, 0.008), frameMat);
  sill.position.set(0, -0.48, 0.06);
  windowGroup.add(sill);
  scene.add(windowGroup);

  const curtainGeo = track(new THREE.PlaneGeometry(0.42, 1.4, 48, 1));
  const cp = curtainGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cp.count; i += 1) cp.setZ(i, Math.sin(cp.getX(i) * 46) * 0.018);
  curtainGeo.computeVertexNormals();
  const curtainTex = track(noiseTexture("#d9c7a6", "#8a7350", 21, 256));
  const curtain = mesh(curtainGeo, std({ map: curtainTex, roughness: 0.95, side: THREE.DoubleSide }), false);
  curtain.position.set(-0.08, 1.55, -0.53);
  scene.add(curtain);

  // 墙上的装裱海报：字随访客名字重绘。
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
    ctx.fillStyle = "#efe6d4";
    ctx.fillRect(0, 0, w, h);
    const sun = ctx.createRadialGradient(w * 0.5, h * 0.42, 10, w * 0.5, h * 0.42, 190);
    sun.addColorStop(0, "#e2673f");
    sun.addColorStop(1, "#c94f2c");
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.4, 150, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2d3a33";
    ctx.beginPath();
    ctx.moveTo(0, h * 0.58);
    for (let x = 0; x <= w; x += 20) ctx.lineTo(x, h * 0.55 - Math.sin(x / 70) * 40 - Math.sin(x / 23) * 10);
    ctx.lineTo(w, h * 0.66);
    ctx.lineTo(0, h * 0.66);
    ctx.fill();
    ctx.fillStyle = "#26201a";
    ctx.font = `600 54px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("KEEP CREATING", w / 2, h * 0.77);
    ctx.font = `30px ${FONT}`;
    ctx.fillStyle = "#5b4a3a";
    ctx.fillText(posterName || "My Space", w / 2, h * 0.84);
    ctx.font = `22px ${FONT}`;
    ctx.fillText((posterTagline || "把想法做成作品").slice(0, 22), w / 2, h * 0.89);
    posterTex.needsUpdate = true;
  };
  drawPoster();
  const poster = new THREE.Group();
  poster.position.set(0.62, 1.5, -0.6);
  const posterFrame = mesh(rbox(0.46, 0.6, 0.025, 0.004), std({ color: 0x2a1d14, roughness: 0.4 }), false);
  poster.add(posterFrame);
  const posterArt = new THREE.Mesh(track(new THREE.PlaneGeometry(0.4, 0.533)), std({ map: posterTex, roughness: 0.8 }));
  posterArt.position.z = 0.0131;
  poster.add(posterArt);
  scene.add(poster);

  /* ---------------- 书桌 ---------------- */
  const deskTex = track(woodTexture("#6e4a30", "#2a160b", 5, 1));
  const deskMat = std({ ...pbrMaps("wood_table_001", 1.4, 0.7), color: 0xb89a80, roughness: 1 });
  const deskTop = mesh(rbox(1.7, 0.04, 0.86, 0.012), deskMat);
  deskTop.position.set(0, DESK_Y - 0.02, -0.17);
  scene.add(deskTop);
  const legMat = std({ color: 0x1d1d1f, metalness: 0.7, roughness: 0.4 });
  for (const [x, z] of [[-0.8, 0.2], [0.8, 0.2], [-0.8, -0.54], [0.8, -0.54]]) {
    const leg = mesh(rbox(0.045, DESK_Y - 0.04, 0.045, 0.008), legMat);
    leg.position.set(x, (DESK_Y - 0.04) / 2, z);
    scene.add(leg);
  }
  const apron = mesh(rbox(1.56, 0.06, 0.02, 0.004), legMat);
  apron.position.set(0, DESK_Y - 0.07, 0.2);
  scene.add(apron);

  /* ---------------- 共用材质 ---------------- */
  const aluminium = std({ color: 0xc4c6cb, metalness: 0.85, roughness: 0.32 });
  const spaceGray = std({ color: 0x3c3e44, metalness: 0.7, roughness: 0.35 });
  const blackGlass = phys({ color: 0x050506, roughness: 0.08, metalness: 0, clearcoat: 1 });
  const whitePlastic = std({ color: 0xeeece6, roughness: 0.42 });
  const darkMetal = std({ color: 0x24272b, metalness: 0.65, roughness: 0.38 });
  const screenMats: { material: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  const screenMaterial = (map: THREE.Texture, strength = 1) => {
    const material = track(new THREE.MeshBasicMaterial({ map, color: new THREE.Color(strength, strength, strength) }));
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
    bg.addColorStop(0, "#f2b27a");
    bg.addColorStop(0.5, "#c76f5b");
    bg.addColorStop(1, "#4a3a63");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,.18)";
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
    ctx.fillStyle = "#2a211c";
    ctx.textAlign = "center";
    ctx.font = `600 54px ${FONT}`;
    ctx.fillText(posterName || "你好", w / 2, 270);
    ctx.font = `24px ${FONT}`;
    ctx.fillStyle = "#6a5a50";
    ctx.fillText((posterTagline || "个人作品集").slice(0, 26), w / 2, 318);
    ctx.fillStyle = "#c2502f";
    roundRect(ctx, w / 2 - 110, 360, 220, 54, 27);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText("点击打开 ›", w / 2, 396);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,.28)";
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
    ctx.fillStyle = "#b8bac0";
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
        ctx.fillStyle = "#1c1d20";
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
  const keys = new THREE.Mesh(track(new THREE.PlaneGeometry(0.29, 0.1)), std({ map: keyboardTex, roughness: 0.6 }));
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, 0.0122, -0.035);
  keys.receiveShadow = true;
  laptop.add(keys);
  const trackpad = new THREE.Mesh(track(new THREE.PlaneGeometry(0.12, 0.068)), std({ color: 0xb4b6bb, metalness: 0.6, roughness: 0.25 }));
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

  const screenGlow = new THREE.PointLight(0xffc7a8, 0.18, 0.9, 2);
  screenGlow.position.set(-0.02, DESK_Y + 0.14, -0.08);
  scene.add(screenGlow);

  /* ---------------- 外接键盘 ---------------- */
  const keyboard = new THREE.Group();
  keyboard.position.set(-0.02, DESK_Y, 0.13);
  const kbBase = mesh(rbox(0.37, 0.012, 0.125, 0.006), std({ color: 0x2c2d31, roughness: 0.5, metalness: 0.3 }));
  kbBase.position.y = 0.006;
  keyboard.add(kbBase);
  const keyGeo = rbox(0.0165, 0.008, 0.0165, 0.003);
  const keyMat = std({ color: 0xe6e3dc, roughness: 0.5 });
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
      keyDummy.position.set(key.x, 0.016 - keyOffsets[i], key.z);
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

  /* ---------------- 鼠标与鼠标垫 ---------------- */
  const pad = mesh(rbox(0.25, 0.003, 0.21, 0.012), std({ color: 0x3a3430, roughness: 0.95 }));
  pad.position.set(0.33, DESK_Y + 0.0015, 0.13);
  scene.add(pad);
  const mouse = new THREE.Group();
  mouse.position.set(0.33, DESK_Y + 0.003, 0.14);
  mouse.rotation.y = -0.12;
  const mouseBody = mesh(track(new THREE.SphereGeometry(1, 32, 20)), whitePlastic);
  mouseBody.scale.set(0.032, 0.019, 0.056);
  mouseBody.position.y = 0.004;
  mouse.add(mouseBody);
  const wheel = mesh(track(new THREE.CylinderGeometry(0.005, 0.005, 0.004, 16)), darkMetal);
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(0, 0.0225, -0.024);
  mouse.add(wheel);
  scene.add(mouse);
  addHotspot("mouse", mouse, mouseBody, 0.006);

  /* ---------------- 平板（斜靠在支架上） ---------------- */
  const tabletTex = track(canvasTexture(1024, 720, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#1f4e5f");
    bg.addColorStop(0.6, "#3f7a75");
    bg.addColorStop(1, "#e3a86b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.font = `600 84px ${FONT}`;
    ctx.fillText("21:30", 60, 140);
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
  const tabletBody = mesh(rbox(0.25, 0.175, 0.007, 0.012), spaceGray);
  tabletBody.position.y = 0.0875;
  tabletTilt.add(tabletBody);
  const tabletBezel = new THREE.Mesh(track(new THREE.PlaneGeometry(0.242, 0.167)), blackGlass);
  tabletBezel.position.set(0, 0.0875, 0.0036);
  tabletTilt.add(tabletBezel);
  const tabletScreen = new THREE.Mesh(track(new THREE.PlaneGeometry(0.228, 0.16)), screenMaterial(tabletTex, 1.1));
  tabletScreen.position.set(0, 0.0875, 0.0038);
  tabletTilt.add(tabletScreen);
  tablet.add(tabletTilt);
  const stand = mesh(rbox(0.12, 0.012, 0.14, 0.004), darkMetal);
  stand.position.set(0, 0.006, 0.02);
  tablet.add(stand);
  scene.add(tablet);
  addHotspot("tablet", tablet, tabletScreen, 0.006);

  /* ---------------- 手机 ---------------- */
  const phoneTex = track(canvasTexture(400, 860, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#1a2340");
    bg.addColorStop(1, "#6b4a6e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = `200 110px ${FONT}`;
    ctx.fillText("21:30", w / 2, 200);
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
  const phoneBody = mesh(rbox(0.074, 0.008, 0.155, 0.01), std({ color: 0x1e2a33, metalness: 0.75, roughness: 0.3 }));
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
    ctx.fillStyle = "#6b3d26";
    ctx.fillRect(0, 0, w, h);
    const rand = seeded(9);
    for (let i = 0; i < 6000; i += 1) {
      ctx.fillStyle = rand() > 0.5 ? "rgba(0,0,0,.08)" : "rgba(255,220,180,.05)";
      ctx.fillRect(rand() * w, rand() * h, 2, 2);
    }
    ctx.strokeStyle = "rgba(230,200,160,.55)";
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    roundRect(ctx, 22, 22, w - 44, h - 44, 18);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(240,215,170,.85)";
    ctx.textAlign = "center";
    ctx.font = `600 64px ${FONT}`;
    ctx.fillText("诗 与 随 笔", w / 2, h * 0.42);
    ctx.font = `26px ${FONT}`;
    ctx.fillText("NOTES", w / 2, h * 0.5);
  }));
  const notebook = new THREE.Group();
  notebook.position.set(-0.52, DESK_Y, -0.22);
  notebook.rotation.y = 0.18;
  const paper = mesh(rbox(0.146, 0.012, 0.206, 0.002), std({ color: 0xf1e8d6, roughness: 0.9 }));
  paper.position.set(0.002, 0.0075, 0);
  notebook.add(paper);
  const leather = std({ color: 0x6b3d26, roughness: 0.7 });
  const bottomCover = mesh(rbox(0.15, 0.003, 0.21, 0.003), leather);
  bottomCover.position.y = 0.0015;
  notebook.add(bottomCover);
  const topCover = mesh(rbox(0.15, 0.003, 0.21, 0.003), [leather, leather, std({ map: coverTex, roughness: 0.7 }), leather, leather, leather]);
  topCover.position.y = 0.0145;
  notebook.add(topCover);
  const band = mesh(rbox(0.006, 0.0172, 0.213, 0.002), std({ color: 0x1d1a18, roughness: 0.6 }));
  band.position.set(0.058, 0.0082, 0);
  notebook.add(band);
  const pen = new THREE.Group();
  pen.position.set(0.105, 0.005, 0.0);
  pen.rotation.y = -0.1;
  const penBody = mesh(track(new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 20)), std({ color: 0x14161a, metalness: 0.4, roughness: 0.3 }));
  penBody.rotation.x = Math.PI / 2;
  pen.add(penBody);
  const penTip = mesh(track(new THREE.ConeGeometry(0.0045, 0.014, 20)), std({ color: 0xc9a45c, metalness: 1, roughness: 0.25 }));
  penTip.rotation.x = Math.PI / 2;
  penTip.position.z = 0.077;
  pen.add(penTip);
  notebook.add(pen);
  scene.add(notebook);
  addHotspot("notebook", notebook, topCover, 0.01);

  /* ---------------- 台灯（Poly Haven 模型） ---------------- */
  const lamp = new THREE.Group();
  lamp.position.set(-0.64, DESK_Y, -0.36);
  scene.add(lamp);
  addHotspot("lamp", lamp, lamp, 0);
  const lampTargetWorld = new THREE.Vector3(-0.18, DESK_Y, -0.02);
  const lampEmissive: THREE.MeshStandardMaterial[] = [];
  const spot = new THREE.SpotLight(0xffc68a, 6, 3.2, 0.8, 0.75, 1.6);
  spot.position.set(-0.55, DESK_Y + 0.42, -0.26);
  spot.target.position.copy(lampTargetWorld);
  spot.castShadow = true;
  spot.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.015;
  spot.shadow.radius = 4;
  spot.shadow.camera.near = 0.03;
  spot.shadow.camera.far = 2.5;
  scene.add(spot, spot.target);
  const lampGlow = new THREE.PointLight(0xffb36b, 0.8, 2.2, 2);
  lampGlow.position.copy(spot.position);
  scene.add(lampGlow);
  loadModel("desk_lamp_arm_01", model => {
    model.scale.setScalar(0.62);
    // 模型的灯罩朝本地 -z，转过来对准桌面中间。
    model.rotation.y = Math.atan2(-(lampTargetWorld.x - lamp.position.x), -(lampTargetWorld.z - lamp.position.z));
    lamp.add(model);
    lamp.updateMatrixWorld(true);
    model.traverse(child => {
      const item = child as THREE.Mesh;
      if (!item.isMesh) return;
      const material = item.material as THREE.MeshStandardMaterial;
      if (!material.name.includes("light")) return;
      item.castShadow = false;
      material.emissive = new THREE.Color(0xffd6a0);
      material.emissiveIntensity = 2.5;
      lampEmissive.push(material);
      const bulb = new THREE.Box3().setFromObject(item).getCenter(new THREE.Vector3());
      spot.position.copy(bulb).add(new THREE.Vector3(0, -0.025, 0));
      lampGlow.position.copy(bulb).add(new THREE.Vector3(0, 0.04, -0.03));
    });
  });

  const hemi = new THREE.HemisphereLight(0xffe2c4, 0x2a1a10, 0.42);
  scene.add(hemi);
  const moonLight = new THREE.DirectionalLight(0x8fa6ff, 0.55);
  moonLight.position.set(-1.2, 2.4, -1.6);
  scene.add(moonLight);
  const warmFill = new THREE.PointLight(0xff9a5c, 0.6, 4, 2);
  warmFill.position.set(1.2, 1.6, 1.2);
  scene.add(warmFill);

  /* ---------------- 杯子和热气 ---------------- */
  const mug = new THREE.Group();
  mug.position.set(0.4, DESK_Y, -0.15);
  const mugProfile = [
    new THREE.Vector2(0, 0), new THREE.Vector2(0.036, 0), new THREE.Vector2(0.039, 0.004), new THREE.Vector2(0.04, 0.094),
    new THREE.Vector2(0.0365, 0.095), new THREE.Vector2(0.036, 0.01), new THREE.Vector2(0, 0.01),
  ];
  const ceramic = phys({ color: 0xc8714f, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.15 });
  const mugBody = mesh(track(new THREE.LatheGeometry(mugProfile, 48)), ceramic);
  mug.add(mugBody);
  const handle = mesh(track(new THREE.TorusGeometry(0.024, 0.0065, 14, 28, Math.PI)), ceramic);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(0.039, 0.05, 0);
  mug.add(handle);
  const coffee = new THREE.Mesh(track(new THREE.CircleGeometry(0.0362, 40)), phys({ color: 0x2a160b, roughness: 0.12, clearcoat: 1 }));
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

  /* ---------------- 小音箱 ---------------- */
  const fabricTex = track(canvasTexture(256, 320, (ctx, w, h) => {
    ctx.fillStyle = "#2f3033";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1b1c1e";
    for (let y = 4; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 8; x < w; x += 8) {
      ctx.beginPath();
      ctx.arc(x, y, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }));
  const speaker = new THREE.Group();
  speaker.position.set(0.66, DESK_Y, -0.33);
  speaker.rotation.y = -0.45;
  const brass = std({ color: 0xc9a45c, metalness: 1, roughness: 0.28 });
  const speakerWood = std({ map: deskTex, color: 0xa88a74, roughness: 0.5 });
  const speakerBody = mesh(rbox(0.12, 0.165, 0.1, 0.014), speakerWood);
  speakerBody.position.y = 0.0825;
  speaker.add(speakerBody);
  const grille = new THREE.Mesh(track(new THREE.PlaneGeometry(0.104, 0.14)), std({ map: fabricTex, roughness: 0.95 }));
  grille.position.set(0, 0.0825, 0.0503);
  speaker.add(grille);
  const knob = mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 24)), brass);
  knob.position.set(0.03, 0.17, 0.02);
  speaker.add(knob);
  const ledMat = std({ color: 0x111111, emissive: new THREE.Color(0x40ff9a), emissiveIntensity: 0 });
  const speakerLed = new THREE.Mesh(track(new THREE.SphereGeometry(0.0025, 10, 8)), ledMat);
  speakerLed.position.set(0, 0.008, 0.0505);
  speaker.add(speakerLed);
  scene.add(speaker);
  addHotspot("speaker", speaker, speakerBody, 0.006);

  /* ---------------- 插线板（国标五孔）、插头、充电器和电线 ---------------- */
  const socket = new THREE.Group();
  socket.position.set(0.2, DESK_Y, -0.45);
  const stripBody = mesh(rbox(0.32, 0.034, 0.068, 0.012), whitePlastic);
  stripBody.position.y = 0.017;
  socket.add(stripBody);
  const plateMat = std({ color: 0xf6f5f1, roughness: 0.32 });
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
  const switchMat = std({ color: 0xc23a2b, emissive: new THREE.Color(0xff3b2b), emissiveIntensity: 1.4, roughness: 0.4 });
  const rocker = mesh(rbox(0.022, 0.008, 0.03, 0.004), switchMat, false);
  rocker.position.set(0.128, 0.037, 0);
  socket.add(rocker);
  const plugMat = std({ color: 0x1c1c1e, roughness: 0.45 });
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

  const cableMat = std({ color: 0x18181a, roughness: 0.6 });
  const whiteCableMat = std({ color: 0xf0efeb, roughness: 0.45 });
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

  /* ---------------- 绿植、笔筒、相框、闹钟（Poly Haven 模型） ---------------- */
  const plant = new THREE.Group();
  plant.position.set(-0.3, DESK_Y, -0.42);
  scene.add(plant);
  addHotspot("plant", plant, plant, 0.006);
  loadModel("potted_plant_04", model => { model.scale.setScalar(0.85); plant.add(model); });

  loadModel("stationery_supplies", model => {
    const cup = model.getObjectByName("stationery_supplies_pencilcup");
    if (!cup) return;
    const holder = new THREE.Group();
    holder.position.set(-0.7, DESK_Y, -0.12);
    cup.position.set(0, 0.037, 0);
    holder.add(cup);
    ["stationery_supplies_pen_blue", "stationery_supplies_pencil_new_a", "stationery_supplies_pen_fancy", "stationery_supplies_pencil_used"].forEach((name, i) => {
      const item = model.getObjectByName(name);
      if (!item) return;
      const angle = (i / 4) * Math.PI * 2 + 0.4;
      item.position.set(Math.cos(angle) * 0.014, 0.088, Math.sin(angle) * 0.014);
      item.rotation.set(0, angle, Math.PI / 2 - 0.13);
      holder.add(item);
    });
    const eraser = model.getObjectByName("stationery_supplies_eraser");
    if (eraser) { eraser.position.set(0.055, 0.005, 0.03); eraser.rotation.set(0, 0.6, 0); holder.add(eraser); }
    scene.add(holder);
  });

  let artwork: THREE.MeshStandardMaterial | null = null;
  let pendingAvatar = "";
  const applyAvatar = () => {
    if (!artwork || !pendingAvatar) return;
    const url = pendingAvatar;
    const target = artwork;
    textureLoader.load(url, texture => {
      if (disposed) { texture.dispose(); return; }
      texture.flipY = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      disposables.push(texture);
      target.map = texture;
      target.needsUpdate = true;
    });
  };
  const frame = new THREE.Group();
  frame.position.set(0.44, DESK_Y, -0.47);
  frame.rotation.y = -Math.PI / 2 + 0.45;
  scene.add(frame);
  loadModel("standing_picture_frame_01", model => {
    frame.add(model);
    model.traverse(child => {
      const item = child as THREE.Mesh;
      if (item.isMesh && (item.material as THREE.Material).name.includes("artwork")) artwork = item.material as THREE.MeshStandardMaterial;
    });
    applyAvatar();
  });

  const clockGroup = new THREE.Group();
  clockGroup.position.set(0.6, DESK_Y, -0.13);
  clockGroup.rotation.y = -Math.PI / 2 + 0.7;
  scene.add(clockGroup);
  loadModel("alarm_clock_01", model => clockGroup.add(model));

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
    spot.intensity = 6 * lampLevel;
    lampGlow.intensity = 0.8 * lampLevel;
    lampEmissive.forEach(material => { material.emissiveIntensity = 2.5 * lampLevel; });
    hemi.intensity = 0.06 + 0.26 * lampLevel;
    warmFill.intensity = 0.04 + 0.5 * lampLevel;
    scene.environmentIntensity = 0.08 + 0.16 * lampLevel;
    renderer.toneMappingExposure = 0.8 + 0.25 * lampLevel;
    switchMat.emissiveIntensity = 1.4 * powerLevel;
    screenGlow.intensity = 0.18 * powerLevel;
    const laptopLevel = 0.04 + 0.96 * powerLevel;
    screenMats.forEach(({ material, base }, index) => {
      const level = index === 0 ? laptopLevel : 1;
      material.color.setRGB(base.r * level, base.g * level, base.b * level);
    });
    ledMat.emissiveIntensity = 2.2 * musicLevel * (0.6 + 0.4 * Math.sin(time * 6));
    const beat = musicLevel * (0.5 + 0.5 * Math.sin(time * Math.PI * 4)) ** 4;
    grille.scale.set(1 + beat * 0.012, 1 + beat * 0.012, 1);
    grille.position.z = 0.0503 + beat * 0.0015;

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
    setIdentity(name, tagline, avatar) {
      // 相框里放头像；只接受站内地址，跨域图片没有 CORS 头时会污染 WebGL 贴图。
      const sameOrigin = avatar && (avatar.startsWith("/") || avatar.startsWith(location.origin));
      if (sameOrigin && avatar !== pendingAvatar) { pendingAvatar = avatar; applyAvatar(); }
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
