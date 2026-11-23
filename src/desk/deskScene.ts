import { homeScreenUrl, type HomeDevice } from "./deviceAppearance";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * 书桌场景：全部用代码建模（几何体 + Canvas 贴图），不依赖外部模型文件。
 * React 只通过返回的 DeskScene 接口和它交互：悬停/点击回调、取物体屏幕位置、开关灯等。
 */

export type DeskHotspot = "laptop" | "tablet" | "phone" | "notebook" | "lamp" | "mug" | "speaker" | "socket" | "keyboard" | "mouse" | "plant" | "bookshelf" | "scissors" | "poster";

export type DeskSceneOptions = {
  canvas: HTMLCanvasElement;
  onHover(hotspot: DeskHotspot | null, x: number, y: number): void;
  onSelect(hotspot: DeskHotspot): void;
  onFocusReady?(hotspot: DeskHotspot): void;
  onLampChange?(on: boolean): void;
  onBookSelect?(index: number): void;
  onContext?(value:{id:string;plugKind?:'lamp'|'speaker'|'laptop';x:number;y:number}):void;
  onReady?(): void;
};

export type DeskScene = {
  screenTransform(hotspot: DeskHotspot, width: number, height: number): string | null;
  screenRect(hotspot: DeskHotspot, part?: THREE.Object3D): DOMRect | null;
  /** 书架上第 index 本书在屏幕上的位置。 */
  bookRect(index: number): DOMRect | null;
  focus(hotspot: DeskHotspot | null): void;
  setLamp(on: boolean): void;
  setLayoutEditing(editing: boolean): void;
  editObject(id:string,mode:'move'|'rotate'):void;
  saveLayout(): boolean;
  setPower(on: boolean): void;
  setPlugConnected(kind: "lamp" | "speaker" | "laptop", connected: boolean): void;
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
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e7e2);
  scene.fog = new THREE.Fog(0xe9e7e2, 4.5, 10);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.5;

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

  /* 木纹、墙面、地板、绿植和环境光来自 Poly Haven（CC0），放在 public/desk。全部加载完（或超时）再显示画面。
     贴图到货后才挂到材质上：没到货时用接近的纯色，超时先显示也不会出现黑色表面。 */
  let disposed = false;
  let assetsReady = false;
  const manager = new THREE.LoadingManager();
  manager.onLoad = () => { assetsReady = true; };
  const readyTimer = window.setTimeout(() => { assetsReady = true; }, 8000);
  const gltfLoader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  const textureLoader = new THREE.TextureLoader(manager);
  const trackMaterial = (material: THREE.Material) => {
    disposables.push(material);
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) disposables.push(value);
  };
  const loadModel = (id: string, onLoad: (model: THREE.Group) => void) => {
    gltfLoader.load(`/desk/models/${id}.glb`, gltf => {
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
  type MapSlot = "map" | "normalMap" | "roughnessMap" | "aoMap";
  const lateTexture = (url: string, setup: (texture: THREE.Texture) => void, apply: (texture: THREE.Texture) => void) => {
    textureLoader.load(url, texture => {
      if (disposed) { texture.dispose(); return; }
      setup(texture);
      track(texture);
      apply(texture);
    }, undefined, () => { /* 贴图缺失时保留纯色 */ });
  };
  /** 先用 tint 纯色显示，贴图到货后换成 color × 贴图。 */
  const pbrMaterial = (name: string, repeatX: number, repeatY: number, color: number, tint: number, params: THREE.MeshStandardMaterialParameters = {}) => {
    const material = std({ color: tint, roughness: 0.8, ...params });
    const load = (suffix: string, slots: MapSlot[], srgb = false) => lateTexture(`/desk/textures/${name}_${suffix}.webp`, texture => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = 8;
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    }, texture => {
      for (const slot of slots) material[slot] = texture;
      if (srgb) material.color.setHex(color);
      else if (slots.includes("roughnessMap")) material.roughness = params.roughness ?? 1;
      material.needsUpdate = true;
    });
    load("diff", ["map"], true);
    load("nor", ["normalMap"]);
    load("arm", ["roughnessMap", "aoMap"]);
    return material;
  };
  new HDRLoader(manager).load("/desk/hdri/art_studio.hdr", hdr => {
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
  const floor = mesh(track(new THREE.PlaneGeometry(10, 10)), pbrMaterial("laminate_floor_02", 5, 5, 0xddd3c6, 0xb6a48f), false);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const wallMat = std({ color: 0xf3f1ec, roughness: 0.95, normalScale: new THREE.Vector2(0.25, 0.25) });
  lateTexture("/desk/textures/white_plaster_02_nor.webp", texture => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 1.7);
  }, texture => { wallMat.normalMap = texture; wallMat.needsUpdate = true; });
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

  // 桌面左后方的小型透明书架，底板直接落在桌面上。
  const bookshelf = new THREE.Group();
  bookshelf.position.set(-0.69, DESK_Y, -0.39);
  scene.add(bookshelf);
  const acrylic = phys({ color: 0xf4fcff, transmission: 0.94, thickness: 0.006,
    roughness: 0.09, ior: 1.49, transparent: true, opacity: 0.72,
    clearcoat: 1, depthWrite: false });
  const shelfPanel = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const panel = mesh(rbox(w, h, d, 0.0015), acrylic, false);
    panel.position.set(x, y, z);
    bookshelf.add(panel);
  };
  shelfPanel(0.20, 0.006, 0.18, 0, 0.003, 0);
  shelfPanel(0.004, 0.22, 0.18, -0.098, 0.116, 0);
  shelfPanel(0.004, 0.15, 0.18, 0.098, 0.081, 0);
  shelfPanel(0.20, 0.06, 0.004, 0, 0.036, -0.088);
  const pageMat = std({ color: 0xf5f2eb, roughness: 0.94 });
  const whiteCover = "#d9d4c8";
  const shelfBooks: THREE.Object3D[] = [];
  ["大学一年", "大学二年", "大学三年", "大学四年"].forEach((title, index) => {
    const book = new THREE.Group();
    // 书向左倾靠侧板，底角接触底板，相邻封面互相支撑。
    const lean = 0.07;
    const halfThickness = 0.018 * 0.89 / 2;
    const bookHeight = 0.23 * 0.913;
    book.position.set(-0.096 + halfThickness * Math.cos(lean) + bookHeight * Math.sin(lean)
      + index * (halfThickness * 2 / Math.cos(lean)), 0.006 + halfThickness * Math.sin(lean), 0.005);
    book.rotation.z = lean;
    book.scale.set(0.89, 0.913, 0.862);
    bookshelf.add(book);
    shelfBooks.push(book);
    const coverMat = std({ color: whiteCover, roughness: 0.85 });
    const pages = mesh(rbox(0.014, 0.218, 0.155, 0.001), pageMat);
    pages.position.set(0, 0.115, -0.003);
    book.add(pages);
    for (const x of [-0.008, 0.008]) {
      const cover = mesh(rbox(0.002, 0.23, 0.174, 0.001), coverMat);
      cover.position.set(x, 0.115, 0);
      book.add(cover);
    }
    const spine = mesh(rbox(0.018, 0.23, 0.009, 0.002), coverMat);
    spine.position.set(0, 0.115, 0.084);
    book.add(spine);
    const label = track(canvasTexture(128, 1800, (ctx, w, h) => {
      ctx.fillStyle = whiteCover;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#4f4c46";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `500 88px ${FONT}`;
      [...title].forEach((character, i) => ctx.fillText(character, w / 2, 480 + i * 200));
      ctx.globalAlpha = 0.55;
      ctx.fillRect(42, 110, w - 84, 3);
      ctx.fillRect(42, h - 110, w - 84, 3);
    }));
    const titleFace = mesh(track(new THREE.PlaneGeometry(0.016, 0.226)), std({ map: label, roughness: 0.8 }), false);
    titleFace.position.set(0, 0.115, 0.0886);
    book.add(titleFace);
  });

  addHotspot("bookshelf", bookshelf, bookshelf, 0);

  // Blender 木质相框；照片单独显示，保留清晰度和聚焦平面。
  const poster = new THREE.Group();
  poster.position.set(0.53, DESK_Y + 0.2125 * Math.cos(0.11) + 0.011 * Math.sin(0.11), -0.45);
  poster.rotation.x = -0.11;
  const posterArt = new THREE.Mesh(track(new THREE.PlaneGeometry(0.28875, 0.385)), track(new THREE.MeshBasicMaterial({ color: 0xcfcdc8, toneMapped: false })));
  lateTexture("/desk/admission-notice.webp", texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }, texture => {
    const material = posterArt.material as THREE.MeshBasicMaterial;
    material.map = texture;
    material.color.setHex(0xd2d2d2);
    material.needsUpdate = true;
  });
  posterArt.position.z = 0.003;
  poster.add(posterArt);
  scene.add(poster);
  addHotspot("poster", poster, posterArt, 0);

  /* ---------------- 书桌 ---------------- */
  const deskMat = pbrMaterial("oak_veneer_01", 2, 1, 0xe9dccb, 0xd0b48f, { roughness: 1 });
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
  const screens: {device:HomeDevice;texture:THREE.CanvasTexture}[]=[];
  const paintScreen=(device:HomeDevice,texture:THREE.CanvasTexture)=>{
    const img=new Image();img.onload=()=>{if(disposed)return;const c=texture.image as HTMLCanvasElement;c.getContext('2d')!.drawImage(img,0,0,c.width,c.height);texture.needsUpdate=true;};img.src=homeScreenUrl(device);
  };
  const bindScreen=(device:HomeDevice,texture:THREE.CanvasTexture)=>{screens.push({device,texture});paintScreen(device,texture);};
  bindScreen('laptop',laptopTex);
  let screenMinute='';
  const screenTimer=window.setInterval(()=>{const minute=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});if(minute!==screenMinute){screenMinute=minute;screens.forEach(s=>paintScreen(s.device,s.texture));}},1000);

  // Rounded outline is independent of the device thickness.
  const roundedPanel = (w: number, h: number, radius: number, depth = 0) => {
    const shape = new THREE.Shape();
    const x = -w / 2, y = -h / 2, r = radius;
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
    if (depth) {
      const geo = track(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 }));
      geo.translate(0, 0, -depth / 2);
      return geo;
    }
    const geo = track(new THREE.ShapeGeometry(shape, 12));
    const positions = geo.getAttribute("position"), uv = geo.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setXY(i, positions.getX(i) / w + 0.5, positions.getY(i) / h + 0.5);
    return geo;
  };

  const laptop = new THREE.Group();
  laptop.position.set(-0.02, DESK_Y, -0.16);
  const lid = new THREE.Group();
  lid.position.set(0, 0.012, -0.1165);
  lid.rotation.x = -0.26;
  const laptopScreen = new THREE.Mesh(track(new THREE.PlaneGeometry(0.320, 0.203)), screenMaterial(laptopTex, 1.15));
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
  const keyOffsets = new Float32Array(108);
  const animatedKeys: { object: THREE.Object3D; index: number; baseY: number }[] = [];
  const loadDeskModel = (url: string, parent: THREE.Group, onMesh?: (object: THREE.Mesh) => void) => {
    gltfLoader.load(url, gltf => {
      gltf.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (disposed) {
          object.geometry.dispose();
          materials.forEach(material => material.dispose());
          return;
        }
        track(object.geometry);
        materials.forEach(trackMaterial);
        object.castShadow = true;
        object.receiveShadow = true;
        onMesh?.(object);
      });
      if (!disposed) parent.add(gltf.scene);
    }, undefined, error => console.error('Failed to load desk model', url, error));
  };
  loadDeskModel('/desk/models/wooden-photo-frame.glb?v=2', poster, object => {
    if (object.name === 'Protective_glass' || object.name === 'Protective glass') {
      object.castShadow = false;
      object.receiveShadow = false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => { material.depthWrite = false; });
    }
  });
  loadDeskModel('/desk/models/reference-macbook.glb?v=6', laptop);
  const keyboardInk = track(new THREE.MeshBasicMaterial({ color: 0x20252b, side: THREE.DoubleSide, toneMapped: false }));
  loadDeskModel('/desk/models/reference-keyboard.glb?v=5', keyboard, object => {
    if (/^Legend[ _]/.test(object.name)) {
      // Printed legends keep their contrast under bright desk lighting.
      object.material = keyboardInk;
      object.castShadow = false;
      object.receiveShadow = false;
      object.geometry.computeBoundingBox();
      const bounds = object.geometry.boundingBox!;
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const scale = Math.min(1.55, 0.013 / Math.max(size.x, 0.0001));
      object.geometry.translate(-center.x, -center.y, -center.z);
      object.geometry.scale(scale, 1, scale);
      object.geometry.translate(center.x, center.y + 0.0001, center.z);
    }
    const match = /^(?:Key|Legend)[ _](\d+)/.exec(object.name);
    if (match) animatedKeys.push({ object, index: Number(match[1]), baseY: object.position.y });
  });
  const placeKeys = () => {
    for (const key of animatedKeys) key.object.position.y = key.baseY - keyOffsets[key.index];
  };
  scene.add(keyboard);
  addHotspot("keyboard", keyboard, keyboard, 0.004);

  /* ---------------- 鼠标（银色超薄无线鼠标，按实拍图比例建模：112 × 58 × 24 mm） ---------------- */
  const mouse = new THREE.Group();
  mouse.position.set(0.31, DESK_Y, 0.14);
  mouse.rotation.y = -0.12;
  // 前端（滚轮一侧）朝 -z。轮廓是超椭圆，前端略窄；顶面从边缘向中间拱起，最高点在中间偏后。
  const mouseLen = 0.056, mouseWid = 0.029, mouseEdge = 0.006, mouseTop = 0.0178, mouseExp = 3.3;
  const mouseHalfW = (z: number) => mouseWid * (0.95 + 0.05 * THREE.MathUtils.smoothstep((z + mouseLen) / (2 * mouseLen), 0, 0.6));
  const mouseY = (x: number, z: number) => {
    const t = (z + mouseLen) / (2 * mouseLen);
    const d = t < 0.58 ? (0.58 - t) / 0.58 : (t - 0.58) / 0.42;
    const crown = mouseEdge + (mouseTop - mouseEdge) * (1 - (t < 0.58 ? 0.58 : 0.42) * d * d);
    const r = Math.min(1, Math.pow(Math.pow(Math.abs(x) / mouseHalfW(z), mouseExp) + Math.pow(Math.abs(z) / mouseLen, mouseExp), 1 / mouseExp));
    return mouseEdge + (crown - mouseEdge) * Math.pow(1 - Math.pow(r, 9), 0.5);
  };
  const mouseOutline = (angle: number, r: number) => {
    const c = Math.cos(angle), sn = Math.sin(angle);
    const z = mouseLen * r * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / mouseExp);
    const x = mouseHalfW(z) * r * Math.sign(c) * Math.pow(Math.abs(c), 2 / mouseExp);
    return [x, z] as const;
  };
  const mouseLoft = (rows: number, segments: number, vertex: (row: number, angle: number) => [number, number, number]) => {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= rows; i++) for (let j = 0; j < segments; j++) positions.push(...vertex(i, (j / segments) * Math.PI * 2));
    for (let i = 0; i < rows; i++) for (let j = 0; j < segments; j++) {
      const a = i * segments + j, b = (i + 1) * segments + j, c = i * segments + (j + 1) % segments, d = (i + 1) * segments + (j + 1) % segments;
      indices.push(a, c, b, b, c, d);
    }
    const geometry = track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  };
  const mouseShellMat = phys({ color: 0xc3c4c9, metalness: 0.6, roughness: 0.42, clearcoat: 0.15, clearcoatRoughness: 0.5, envMapIntensity: 0.9 });
  const mouseBody = mesh(mouseLoft(34, 96, (row, angle) => {
    const [x, z] = mouseOutline(angle, 1 - Math.pow(1 - row / 34, 1.8));
    return [x, mouseY(x, z), z];
  }), mouseShellMat);
  mouse.add(mouseBody);
  // 上盖下面一圈深色腰线，向下收窄
  mouse.add(mesh(mouseLoft(1, 96, (row, angle) => {
    const [x, z] = mouseOutline(angle, row === 0 ? 0.985 : 0.93);
    return [x, row === 0 ? mouseEdge + 0.0006 : 0, z];
  }), std({ color: 0x8b8d93, metalness: 0.45, roughness: 0.5 })));
  // 贴在顶面上的细节：分缝、滚轮槽、长条按键、指示灯
  const mouseDecal = (z0: number, z1: number, halfWidth: (z: number) => number, material: THREE.Material, lift: number) => {
    const rows = 20, cols = 6;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= rows; i++) {
      const z = THREE.MathUtils.lerp(z0, z1, i / rows);
      const hw = halfWidth(z);
      for (let k = 0; k <= cols; k++) {
        const x = hw * ((k / cols) * 2 - 1);
        positions.push(x, mouseY(x, z) + lift, z);
      }
    }
    for (let i = 0; i < rows; i++) for (let k = 0; k < cols; k++) {
      const a = i * (cols + 1) + k, b = a + cols + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geometry = track(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    mouse.add(mesh(geometry, material, false));
  };
  const mousePill = (center: number, halfLen: number, halfWid: number, radius: number) => (z: number) => {
    const over = Math.abs(z - center) - (halfLen - radius);
    return over <= 0 ? halfWid : halfWid - radius + Math.sqrt(Math.max(0, radius * radius - over * over));
  };
  const mouseInk = std({ color: 0x232427, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mouseKeyMat = std({ color: 0xeceded, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const wheelZ = -mouseLen + 0.19 * 2 * mouseLen, dpiZ = -mouseLen + 0.325 * 2 * mouseLen, ledZ = -mouseLen + 0.455 * 2 * mouseLen;
  const seam = () => 0.00026;
  mouseDecal(-mouseLen * 0.992, wheelZ - 0.0066, seam, mouseInk, 0.0001);
  mouseDecal(wheelZ + 0.0066, dpiZ - 0.0042, seam, mouseInk, 0.0001);
  mouseDecal(dpiZ + 0.0042, ledZ - 0.0008, seam, mouseInk, 0.0001);
  mouseDecal(wheelZ - 0.007, wheelZ + 0.007, mousePill(wheelZ, 0.007, 0.0038, 0.0038), mouseInk, 0.0001);
  mouseDecal(dpiZ - 0.0046, dpiZ + 0.0046, mousePill(dpiZ, 0.0046, 0.0019, 0.0019), mouseInk, 0.0001);
  mouseDecal(dpiZ - 0.0041, dpiZ + 0.0041, mousePill(dpiZ, 0.0041, 0.0014, 0.0014), mouseKeyMat, 0.0004);
  mouseDecal(ledZ - 0.0011, ledZ + 0.0011, mousePill(ledZ, 0.0011, 0.0011, 0.0011), mouseInk, 0.0001);
  mouseDecal(ledZ - 0.0007, ledZ + 0.0007, mousePill(ledZ, 0.0007, 0.0007, 0.0007), mouseKeyMat, 0.0002);
  const wheelTex = track(canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#7b7d83";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#4a4c51";
    ctx.lineWidth = 1;
    for (let i = -h; i < w + h; i += 6) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + h, 0); ctx.lineTo(i, h); ctx.stroke();
    }
  }));
  wheelTex.wrapS = wheelTex.wrapT = THREE.RepeatWrapping;
  wheelTex.repeat.set(3, 14);
  // 滚轮：边缘倒圆的鼓形，大半埋在槽里，只露出顶上一小段
  const wheelR = 0.0072, wheelHalf = 0.0029, wheelBevel = 0.0013;
  const mouseWheel = mesh(track(new THREE.LatheGeometry([
    new THREE.Vector2(0, -wheelHalf), new THREE.Vector2(wheelR - wheelBevel, -wheelHalf), new THREE.Vector2(wheelR - 0.0004, -wheelHalf + 0.0006),
    new THREE.Vector2(wheelR, -wheelHalf + wheelBevel), new THREE.Vector2(wheelR, wheelHalf - wheelBevel), new THREE.Vector2(wheelR - 0.0004, wheelHalf - 0.0006),
    new THREE.Vector2(wheelR - wheelBevel, wheelHalf), new THREE.Vector2(0, wheelHalf),
  ], 48)), std({ map: wheelTex, roughness: 0.85 }));
  mouseWheel.rotation.z = Math.PI / 2;
  mouseWheel.position.set(0, mouseY(0, wheelZ) - wheelR + 0.0015, wheelZ);
  mouse.add(mouseWheel);
  scene.add(mouse);
  addHotspot("mouse", mouse, mouseBody, 0.006);

  /* ---------------- 平板（斜靠在支架上） ---------------- */
  const tabletTex = track(canvasTexture(1024, 720, () => {}));
  bindScreen('tablet',tabletTex);
  const tablet = new THREE.Group();
  tablet.position.set(-0.46, DESK_Y, 0.08);
  tablet.rotation.y = 0.32;
  const tabletTilt = new THREE.Group();
  tabletTilt.rotation.x = -0.32;
  tabletTilt.position.set(0, 0.008, 0.04);
  const caseMaterial = std({ color: 0x242529, roughness: 0.94 });
  const tabletCase = mesh(roundedPanel(0.258, 0.183, 0.014, 0.01), caseMaterial);
  tabletCase.position.set(0, 0.0875, -0.002);
  tabletTilt.add(tabletCase);
  const tabletBody = mesh(roundedPanel(0.25, 0.175, 0.012, 0.007), aluminium);
  tabletBody.position.y = 0.0875;
  tabletTilt.add(tabletBody);
  const tabletBezel = new THREE.Mesh(roundedPanel(0.246, 0.171, 0.011), blackGlass);
  tabletBezel.position.set(0, 0.0875, 0.0036);
  tabletTilt.add(tabletBezel);
  const tabletScreen = new THREE.Mesh(roundedPanel(0.238, 0.163, 0.009), screenMaterial(tabletTex, 1.1));
  tabletScreen.position.set(0, 0.0875, 0.0038);
  tabletTilt.add(tabletScreen);
  tablet.add(tabletTilt);
  // The folio cover and rear kickstand are authored in Blender.
  gltfLoader.load("/desk/models/tablet-folio.glb?v=2", gltf => {
    gltf.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        track(object.geometry);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => track(material));
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    tablet.add(gltf.scene);
  });
  scene.add(tablet);
  addHotspot("tablet", tablet, tabletScreen, 0.006);

  /* ---------------- 手机 ---------------- */
  const phoneTex = track(canvasTexture(400, 860, () => {}));
  bindScreen('phone',phoneTex);
  // 照片中的圆底立柱支架；手机与托架共用倾角，底边落在双托钩上。
  const phoneStand = new THREE.Group();
  phoneStand.position.set(0.53, DESK_Y, 0.15);
  phoneStand.rotation.y = -0.18;
  const phoneCradle = new THREE.Group();
  phoneCradle.position.set(0, 0.045, 0);
  phoneCradle.rotation.x = -0.22;
  phoneStand.add(phoneCradle);
  loadDeskModel('/desk/models/reference-phone-stand.glb?v=2', phoneStand);
  scene.add(phoneStand);
  const phone = new THREE.Group();
  phone.position.copy(phoneStand.position);
  phone.rotation.copy(phoneStand.rotation);
  const phoneTilt = new THREE.Group();
  phoneTilt.position.copy(phoneCradle.position);
  phoneTilt.position.add(new THREE.Vector3(0, 0, 0.0005).applyEuler(phoneCradle.rotation));
  phoneTilt.rotation.copy(phoneCradle.rotation);
  phone.add(phoneTilt);
  let phoneDocked = true;
  const undockPhone = () => {
    if (!phoneDocked) return;
    phoneDocked = false;
    phoneTilt.rotation.x = -Math.PI / 2;
    phoneTilt.position.set(0, 0.005, 0.0845);
  };
  const dockPhone = () => {
    phoneDocked = true;
    phone.position.copy(phoneStand.position);
    phone.quaternion.copy(phoneStand.quaternion);
    phoneTilt.position.copy(phoneCradle.position);
    phoneTilt.position.add(new THREE.Vector3(0, 0, 0.0005).applyEuler(phoneCradle.rotation));
    phoneTilt.rotation.copy(phoneCradle.rotation);
  };
  const phoneFrame = std({ color: 0x101010, metalness: 0.15, roughness: 0.72 });
  const phoneBezel = track(new THREE.MeshBasicMaterial({ color: 0x070707, toneMapped: false }));
  const phoneBody = mesh(roundedPanel(0.074, 0.155, 0.009, 0.008), phoneFrame);
  phoneBody.position.set(0, 0.0845, 0);
  phoneTilt.add(phoneBody);
  const phoneGlass = new THREE.Mesh(roundedPanel(0.07, 0.151, 0.008), phoneBezel);
  phoneGlass.position.set(0, 0.0845, 0.0042);
  phoneTilt.add(phoneGlass);
  const phoneScreen = new THREE.Mesh(roundedPanel(0.068, 0.147, 0.007), screenMaterial(phoneTex, 1.1));
  phoneScreen.position.set(0, 0.0845, 0.0044);
  phoneTilt.add(phoneScreen);
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
  scene.updateMatrixWorld(true);
  scene.attach(pen);
  addHotspot("notebook", notebook, topCover, 0.01);

  /* ---------------- 台灯（照片中的方底鹅颈、双翼 LED） ---------------- */
  const lamp = new THREE.Group();
  lamp.position.set(-0.46, DESK_Y, -0.32);
  // Place the base behind the tablet, with both blades reaching toward the laptop.
  lamp.rotation.y = Math.PI / 2;
  const lampTargetLocal = new THREE.Vector3(0, 0, 0.22);
  const lampTargetWorld = lamp.localToWorld(lampTargetLocal.clone());
  const lampHead = new THREE.Group();
  lampHead.position.set(0, 0.44, 0.075);
  lamp.add(lampHead);
  scene.add(lamp);
  addHotspot("lamp", lamp, lamp, 0);
  const lampControls: THREE.Object3D[] = [];
  const brightnessBars: THREE.Mesh[] = [];
  const lampEmissive: THREE.MeshStandardMaterial[] = [];
  gltfLoader.load("/desk/models/desk-lamp.glb?v=20261122", gltf => {
    gltf.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (/Power_touch|Power touch|Mode_M|Mode M|Brightness_bar|Brightness bar/.test(object.name)) lampControls.push(object);
      if (/Brightness_bar|Brightness bar/.test(object.name)) brightnessBars.push(object);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (disposed) {
        object.geometry.dispose();
        materials.forEach(material => material.dispose());
        return;
      }
      track(object.geometry);
      materials.forEach(material => {
        track(material);
        if (material instanceof THREE.MeshStandardMaterial && /^Lamp diffuser(?:\.\d+)?$/.test(material.name)) lampEmissive.push(material);
      });
      object.castShadow = true;
      object.receiveShadow = true;
    });
    brightnessBars.sort((a, b) => Number(a.name.match(/(\d+)$/)?.[1] ?? 0) - Number(b.name.match(/(\d+)$/)?.[1] ?? 0));
    if (!disposed) lamp.add(gltf.scene);
  });
  lamp.updateMatrixWorld(true);
  const bulbWorld = lampHead.getWorldPosition(new THREE.Vector3());
  const spot = new THREE.SpotLight(0xffefda, 0.65, 2.4, 0.95, 0.85, 1.6);
  spot.position.copy(bulbWorld).add(new THREE.Vector3(0, -0.02, 0));
  spot.target.position.copy(lampTargetWorld);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.015;
  spot.shadow.radius = 5;
  spot.shadow.camera.near = 0.03;
  spot.shadow.camera.far = 2.5;
  scene.add(spot, spot.target);
  const lampGlow = new THREE.PointLight(0xffefda, 0.025, 1.2, 2);
  lampGlow.position.copy(bulbWorld).add(new THREE.Vector3(0, -0.05, 0));
  scene.add(lampGlow);

  /* ---------------- 白天的自然光：窗户一侧的柔和日光 + 天光 ---------------- */
  const hemi = new THREE.HemisphereLight(0xf8f6f1, 0xc9bfb0, 0.65);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e4, 1.75);
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
  loadDeskModel('/desk/models/reference-tumbler.glb?v=3', mug);
  scene.add(mug);
  addHotspot("mug", mug, mug, 0.01);

  const fabricTex = track(noiseTexture("#d6d5d1", "#b9b8b3", 33, 256));
  fabricTex.wrapS = fabricTex.wrapT = THREE.RepeatWrapping;
  fabricTex.repeat.set(4, 2);
  const speaker = new THREE.Group();
  speaker.position.set(0.72, DESK_Y, -0.33);
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
  // 整条插线板留在相框左侧，两者不重叠。
  socket.position.set(0.16, DESK_Y, -0.45);
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
  const plugPins = std({ color: 0xb7a377, metalness: 0.8, roughness: 0.3 });
  const plugObjects = new Map<string, { object: THREE.Group; home: THREE.Vector3; connected: boolean }>();
  const makePlug = (kind: string, cx: number, width: number, height: number, depth: number, z: number, material: THREE.Material) => {
    const group = new THREE.Group();
    group.position.set(cx, 0.036, z);
    const body = mesh(rbox(width, height, depth, 0.005), material);
    body.position.y = height / 2;
    group.add(body);
    for (const x of [-0.0065, 0.0065]) {
      const pin = mesh(rbox(0.0018, 0.014, 0.0065, 0.0003), plugPins);
      pin.position.set(x, -0.007, 0.016 - z);
      group.add(pin);
    }
    socket.add(group);
    group.userData.plugKind = kind;
    plugObjects.set(kind, { object: group, home: group.position.clone(), connected: true });
    return group;
  };
  const lampPlug = makePlug("lamp", outletX[0], 0.026, 0.03, 0.019, 0.016, plugMat);
  const speakerPlug = makePlug("speaker", outletX[2], 0.026, 0.03, 0.019, 0.016, plugMat);
  // 电脑充电器：插头一体的白色适配器，插在中间两孔上。
  const charger = makePlug("laptop", outletX[1], 0.048, 0.034, 0.044, 0.012, whitePlastic);
  scene.add(socket);
  addHotspot("socket", socket, stripBody, 0.004);

  const cableMat = std({ color: 0xd7d6d1, roughness: 0.6 });
  const whiteCableMat = std({ color: 0xf8f7f4, roughness: 0.45 });
  const cableUpdates: (() => void)[] = [];
  const cable = (points: [number, number, number][], material = cableMat, radius = 0.0032) => {
    const index = cableUpdates.length;
    const startObject = [lampPlug, speakerPlug, socket, charger][index];
    const endObject = [lamp, speaker, null, laptop][index];
    const original = points.map(p => new THREE.Vector3(...p));
    const startLocal = index === 2 ? original.slice(0, 2).map(p => socket.worldToLocal(p.clone()))
      : index === 3 ? [new THREE.Vector3(0, 0.017, 0.021), new THREE.Vector3(0, 0.017, 0.035), new THREE.Vector3(0, 0.005, 0.065)]
      : [new THREE.Vector3(0, 0.029, 0), new THREE.Vector3(0, 0.044, 0), new THREE.Vector3(0, 0.012, -0.055)];
    const endLocal = index === 0 ? new THREE.Vector3(0, 0.009, -0.09)
      : index === 1 ? new THREE.Vector3(0, 0.013, -0.045)
      : index === 3 ? new THREE.Vector3(0.19, 0.006, -0.06) : original[original.length - 1].clone();
    const line = mesh(new THREE.BufferGeometry(), material);
    scene.add(line);
    let previous = "";
    cableUpdates.push(() => {
      const start = startLocal.map(p => startObject.localToWorld(p.clone()));
      const end = endObject ? endObject.localToWorld(endLocal.clone()) : endLocal.clone();
      const tail = endObject ? endObject.localToWorld(endLocal.clone().add(new THREE.Vector3(index === 3 ? 0.035 : 0, 0, index === 3 ? 0 : -0.035))) : original[original.length - 2].clone();
      const signature = [...start.flatMap(p => p.toArray()), ...end.toArray(), ...tail.toArray(), ...(index === 1 ? [...poster.position.toArray(), ...poster.quaternion.toArray()] : [])].join(",");
      if (signature === previous) return;
      previous = signature;
      const middle = start[start.length - 1].clone().lerp(tail, 0.5);
      middle.y = DESK_Y + radius;
      middle.z -= 0.03;
      // 音箱线从相框背后的支架下面绕过去，不穿过相框。
      const via = index === 1 ? [-0.2, 0.21].map((x, i) => {
        const point = poster.localToWorld(new THREE.Vector3(x, -0.2125, -0.07));
        point.y = DESK_Y + radius * (i === 0 ? 3 : 1);
        return point;
      }) : [middle];
      // 插线板自己的电源线：贴着桌面走到后沿，从桌子和墙之间的缝垂到地面。
      const drop = (dx: number, y: number, z: number) => new THREE.Vector3(start[1].x + dx, y, z);
      const points = index === 2
        ? [start[0], start[1], drop(0.008, DESK_Y + radius, -0.57), drop(0.01, DESK_Y + radius + 0.0005, -0.598), drop(0.01, DESK_Y - 0.006, -0.6062), drop(0.01, DESK_Y - 0.05, -0.6068), drop(0.012, 0.3, -0.6068), drop(0.02, 0.12, -0.6), drop(0.045, radius, -0.56)]
        : [...start, ...via, tail, end];
      const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
      line.geometry.dispose();
      line.geometry = new THREE.TubeGeometry(curve, 64, radius, 8, false);
    });
    disposables.push({ dispose: () => line.geometry.dispose() });
  };
  const cy = DESK_Y + 0.0032;
  const sx = socket.position.x;
  const sz = socket.position.z;
  const plugTop = DESK_Y + 0.066;
  cable([[sx + outletX[0], plugTop, sz + 0.016], [sx + outletX[0], plugTop + 0.012, sz + 0.004], [sx + outletX[0] - 0.01, DESK_Y + 0.02, sz - 0.055], [sx - 0.25, cy, sz - 0.06], [-0.5, cy, -0.47], [-0.64, cy, -0.4]]);
  cable([[sx + outletX[2], plugTop, sz + 0.016], [sx + outletX[2], plugTop + 0.012, sz + 0.004], [sx + outletX[2] + 0.01, DESK_Y + 0.02, sz - 0.055], [0.42, cy, -0.5], [0.58, cy, -0.42], [0.63, cy + 0.01, -0.37]]);
  cable([[sx + 0.158, DESK_Y + 0.016, sz], [sx + 0.176, cy, sz - 0.022], [sx + 0.19, 0.35, -0.607], [sx + 0.22, 0.004, -0.56]]);
  // USB-C 线：从充电器前面落到桌面，接到电脑右侧的接口。
  const portX = -0.02 + 0.17;
  const portZ = -0.22;
  cable([[sx + outletX[1], DESK_Y + 0.03, sz + 0.035], [sx + outletX[1], DESK_Y + 0.012, sz + 0.06], [sx + outletX[1] - 0.005, cy, sz + 0.1], [0.2, cy, -0.28], [0.19, cy + 0.002, portZ], [portX + 0.02, DESK_Y + 0.006, portZ]], whiteCableMat, 0.0024);
  const usbHead = mesh(rbox(0.02, 0.006, 0.009, 0.002), std({ color: 0xe8e8e6, roughness: 0.4 }));
  usbHead.position.set(portX + 0.01, DESK_Y + 0.006, portZ);
  scene.add(usbHead);
  laptop.attach(usbHead);

  /* ---------------- 绿植（Poly Haven 模型）、笔筒 ---------------- */
  const plant = new THREE.Group();
  plant.position.set(-0.26, 0.92, -0.55);
  scene.add(plant);
  addHotspot("plant", plant, plant, 0);
  loadModel("potted_plant_04", model => {
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = Math.min(0.85, 0.13 / Math.max(size.z, 0.001), 0.22 / Math.max(size.x, 0.001));
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    plant.add(model);
  });

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
    // Rest on the inner floor and lean against the inside edge of the rim.
    const direction = new THREE.Vector3(Math.cos(angle) * Math.sin(lean), Math.cos(lean), Math.sin(angle) * Math.sin(lean));
    pencil.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    const centerY = 0.006 + 0.075 * direction.y + 0.0036 * Math.sin(lean);
    const rimRadius = 0.0295 - 0.0036 / Math.cos(lean);
    const centerRadius = rimRadius - (0.09 - centerY) * Math.tan(lean);
    pencil.position.set(Math.cos(angle) * centerRadius, centerY, Math.sin(angle) * centerRadius);
    penCup.add(pencil);
  }
  // Steel blades point down into the cup; the two handles remain exposed.
  const scissors = new THREE.Group();
  scissors.rotation.set(0.24, -0.12, 0);
  // Reference scissors authored in Blender; the pivot is the model origin.
  // Blade tip rests on the 6 mm floor; the tilted blade rests against the inner rim.
  scissors.position.set(0, 0.09701939, 0.02879688);
  gltfLoader.load("/desk/models/reference-scissors.glb?v=3", gltf => {
    gltf.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (disposed) {
        object.geometry.dispose();
        materials.forEach(material => material.dispose());
        return;
      }
      track(object.geometry);
      materials.forEach(trackMaterial);
      object.castShadow = true;
      object.receiveShadow = true;
    });
    if (!disposed) scissors.add(gltf.scene);
  }, undefined, error => console.error("Failed to load reference scissors", error));
  penCup.add(scissors);
  // The cup and its contents share the entry point; keep the camera aimed at the scissors.
  addHotspot("scissors", penCup, scissors, 0);
  scene.add(penCup);

  /* ---------------- 交互 ---------------- */
  const draggable = [...hotspots.entries()].filter(([kind]) => kind !== "plant" && kind !== "scissors").map(([, object]) => object);
  draggable.push(phoneStand, penCup, poster, pen);
  let layoutEditing = false;
  let editingObject: THREE.Object3D | null=null;
  let editingMode: 'move'|'rotate'='move';
  let held=false;
  let holdTimer=0;
  const clearHold=()=>window.clearTimeout(holdTimer);
  const layoutObjects = new Map<string, THREE.Object3D>([...Array.from(hotspots.entries()).filter(([kind]) => kind !== "scissors"), ["phoneStand", phoneStand], ["penCup", penCup], ["poster", poster], ["pen", pen], ["bookshelf", bookshelf]]);
  // 默认摆放改动后换版本号，避免旧的本地摆放把物品放回重叠的位置。
  const layoutKey = "desk-layout-v2";
  try {
    const saved = JSON.parse(localStorage.getItem(layoutKey) || "null");
    if (saved?.version === 1 && saved.objects) {
      for (const [id, object] of layoutObjects) {
        const item = saved.objects[id];
        if (!item || !Array.isArray(item.position) || item.position.length !== 2 || !item.position.every(Number.isFinite) || !Array.isArray(item.quaternion) || item.quaternion.length !== 4 || !item.quaternion.every(Number.isFinite)) continue;
        object.position.x = item.position[0];
        object.position.z = item.position[1];
        object.quaternion.fromArray(item.quaternion).normalize();
      }
      if (saved.phoneDocked === false) undockPhone();
      else dockPhone();
    }
  } catch { /* Invalid or unavailable browser storage. */ }
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DESK_Y);
  let drag: { object: THREE.Object3D; start: THREE.Vector3; origin: THREE.Vector3; active: boolean; pointerId: number; rotate: boolean; orientation: THREE.Quaternion } | null = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  let hovered: DeskHotspot | null = null;
  let focused: DeskHotspot | null = null;
  let focusNotified = false;
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
  const pickVisibleHotspot = () => {
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...draggable, ...hotspots.values()], true)[0];
    return hit ? hotspotFromObject(hit.object) : null;
  };
  const toPointer = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    pointerClient = { x: event.clientX, y: event.clientY };
  };
  const pickDraggable = () => {
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(draggable, true)[0];
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object && !draggable.includes(object)) object = object.parent;
    return object;
  };
  const onPointerMove = (event: PointerEvent) => {
    if (drag && event.pointerId !== drag.pointerId) return;
    toPointer(event);
    if (focused === "bookshelf") {
      raycaster.setFromCamera(pointer, camera);
      canvas.style.cursor = raycaster.intersectObjects(shelfBooks, true).length ? "pointer" : "default";
      return;
    }
    if(downAt && Math.hypot(event.clientX-downAt.x,event.clientY-downAt.y)>8) clearHold();
    if (drag && downAt) {
      if (Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 8) drag.active = true;
      if (drag.active) {
        if (drag.object === phone) undockPhone();
        raycaster.setFromCamera(pointer, camera);
        const point = raycaster.ray.intersectPlane(dragPlane, new THREE.Vector3());
        if (drag.rotate) {
          // Apply world-up yaw without losing existing tilt (for example, the pen).
          drag.object.quaternion.copy(drag.orientation).premultiply(
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (event.clientX - downAt.x) * 0.01),
          );
          drag.object.position.copy(drag.origin);
        } else if (point) {
          drag.object.position.x = drag.origin.x + point.x - drag.start.x;
          drag.object.position.z = drag.origin.z + point.z - drag.start.z;
        }
        if (drag.rotate || point) {
          drag.object.updateWorldMatrix(true, true);
          const bounds = new THREE.Box3().setFromObject(drag.object);
          drag.object.position.x += Math.max(0, -0.85 - bounds.min.x) - Math.max(0, bounds.max.x - 0.85);
          drag.object.position.z += Math.max(0, -0.6 - bounds.min.z) - Math.max(0, bounds.max.z - 0.26);
        }
        if (drag.object === phoneStand && phoneDocked) dockPhone();
        canvas.style.cursor = drag.rotate ? "ew-resize" : "grabbing";
        options.onHover(null, 0, 0);
      }
      return;
    }
    if (downAt && portrait() && !focused) {
      const width = canvas.clientWidth || window.innerWidth;
      panTarget = Math.max(-0.5, Math.min(0.5, panStart - ((event.clientX - downAt.x) / width) * 1.1));
    }
    needsPick = event.pointerType === "mouse";
  };
  const onPointerDown = (event: PointerEvent) => {
    if (focused && event.isPrimary && event.button === 0) {
      toPointer(event);
      downAt = { x: event.clientX, y: event.clientY, t: performance.now() };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (focused || drag || !event.isPrimary || (event.button !== 0 && event.button !== 2)) return;
    toPointer(event);
    downAt = { x: event.clientX, y: event.clientY, t: performance.now() };
    panStart = panTarget;
    held=false;clearHold();
    if(event.button===0) holdTimer=window.setTimeout(()=>{
      raycaster.setFromCamera(pointer,camera);
      let target:THREE.Object3D|null=raycaster.intersectObjects(scene.children,true).find(h=>{let o:THREE.Object3D|null=h.object;while(o){if(!o.visible)return false;o=o.parent;}return true;})?.object??null;
      let plugKind:'lamp'|'speaker'|'laptop'|undefined;
      let object:THREE.Object3D|null=null;
      while(target){if(target.userData.plugKind)plugKind=target.userData.plugKind;if(draggable.includes(target))object=target;target=target.parent;}
      const id=object?[...layoutObjects].find(([,o])=>o===object)?.[0]:undefined;
      if(!plugKind&&!id)return;
      held=true;drag=null;options.onHover(null,0,0);
      options.onContext?.({id:id||'socket',plugKind,x:event.clientX,y:event.clientY});
    },500);
    const object = pickDraggable();
    const start = raycaster.ray.intersectPlane(dragPlane, new THREE.Vector3());
    if (layoutEditing && object && (!editingObject || editingObject===object) && start) drag = { object, start, origin: object.position.clone(), active: false, pointerId: event.pointerId, rotate: editingMode==='rotate' || event.button === 2 || event.shiftKey, orientation: object.quaternion.clone() };
    canvas.setPointerCapture(event.pointerId);
  };
  const finishPointer = (event: PointerEvent, cancelled = false) => {
    clearHold();
    if (!downAt || (drag && event.pointerId !== drag.pointerId)) return;
    const rotating = drag?.rotate;
    const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y);
    const wasDragging = drag?.active;
    if (!cancelled && drag?.active && !drag.rotate && (drag.object === phone || drag.object === phoneStand)) {
      const distance = Math.hypot(phone.position.x - phoneStand.position.x, phone.position.z - phoneStand.position.z);
      if (distance < 0.11) dockPhone();
    }
    drag = null;
    downAt = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (focused === "bookshelf") {
      if (!cancelled && moved <= 8 && event.button === 0) {
        toPointer(event);
        raycaster.setFromCamera(pointer, camera);
        let book: THREE.Object3D | null = raycaster.intersectObjects(shelfBooks, true)[0]?.object ?? null;
        while (book && !shelfBooks.includes(book)) book = book.parent;
        if (book) options.onBookSelect?.(shelfBooks.indexOf(book));
      }
      return;
    }
    if (focused === "lamp") {
      if (!cancelled && moved <= 8 && event.button === 0 && powerOn && plugObjects.get("lamp")!.connected) {
        toPointer(event); raycaster.setFromCamera(pointer,camera);
        const hits = lampControls.map(object => {
          const bounds = new THREE.Box3().setFromObject(object).expandByScalar(.002);
          const point = raycaster.ray.intersectBox(bounds,new THREE.Vector3());
          return {object,distance:point?point.distanceTo(camera.position):Infinity};
        }).sort((a,b)=>a.distance-b.distance);
        const hit=hits[0];
        if(hit && Number.isFinite(hit.distance)) {
          if(/Power/.test(hit.object.name)) {lampOn=!lampOn;options.onLampChange?.(lampOn);}
          else if(/Mode/.test(hit.object.name)) lampMode=(lampMode+1)%3;
          else lampBrightness=(Number(hit.object.name.match(/(\d+)$/)?.[1]??7)+1)/8;
        }
      }
      return;
    }
    if (focused) {
      if (!cancelled && moved <= 8 && event.button === 0) {
        toPointer(event);
        if (pick() === focused) options.onSelect(focused);
      }
      return;
    }
    needsPick = true;
    if (held || layoutEditing || cancelled || rotating || event.button !== 0 || wasDragging || moved > 8) return;
    toPointer(event);
    // Non-interactive objects still occlude interactive objects behind them.
    const object = pickDraggable();
    const hit = pickVisibleHotspot();
    if (hit) options.onSelect(hit);
  };
  const onPointerUp = (event: PointerEvent) => finishPointer(event);
  const onPointerCancel = (event: PointerEvent) => finishPointer(event, true);
  const onPointerLeave = () => {
    if (downAt) return;
    pointer.set(9, 9);
    needsPick = true;
  };
  const onContextMenu = (event: MouseEvent) => event.preventDefault();
  canvas.style.touchAction = "none";
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
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
  // 进场镜头：画面出现时从稍远稍高的位置推到书桌前。
  const introOffset = new THREE.Vector3(0, 0.34, 0.62);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- 状态 ---------------- */
  let lampOn = true;
  let lampBrightness = 1;
  let lampMode = 0;
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

    if (needsPick && !focused && !drag) {
      needsPick = false;
      const object = pointer.x > 5 ? null : pickDraggable();
      const hit = pointer.x > 5 ? null : pickVisibleHotspot();
      hovered = hit;
      canvas.style.cursor = object ? "grab" : hit ? "pointer" : "default";
      options.onHover(hovered, pointerClient.x, pointerClient.y);
    }
    for (const item of hoverables) {
      item.target = item.group.userData.hotspot === hovered && !focused && !drag ? item.maxLift : 0;
      item.lift = damp(item.lift, item.target, 14, dt);
      item.group.position.y = item.baseY + item.lift;
    }

    pan = damp(pan, portrait() ? panTarget : 0, 6, dt);
    // Move inside the foreground objects for the frame close-up. Widen the
    // lens to retain the entire wooden frame at this short viewing distance.
    const posterDistance = 0.24;
    const targetFov = focused === "poster"
      ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(0.425, 0.32875 / camera.aspect) * 1.14 / (2 * posterDistance)))
      : 41;
    camera.fov = damp(camera.fov, targetFov, 4.2, dt);
    camera.updateProjectionMatrix();
    homePose(wantPos, wantTarget);
    if (focused) {
      const object = measureTargets.get(focused);
      if (object) {
        if (focused === "bookshelf") {
          // 从书架正面看四本书，随书架移动和旋转保持一致。
          object.updateWorldMatrix(true, false);
          if (portrait()) {
            // 竖屏只需要装下四本书：镜头抬高往下看，越过书架前面的笔筒和剪刀。
            wantTarget.copy(object.localToWorld(tmp.set(-0.06, 0.115, 0.04)));
            wantPos.copy(object.localToWorld(tmp.set(-0.06, 0.41, 0.39)));
          } else {
            wantTarget.copy(object.localToWorld(tmp.set(-0.035, 0.115, 0)));
            const distance = Math.max(0.40, 0.30 / camera.aspect);
            wantPos.copy(object.localToWorld(tmp.set(-0.035, 0.17, distance)));
          }
        } else if (focused === "keyboard" || focused === "mouse") {
          // Fit each object's current world bounds, including its saved rotation.
          object.updateWorldMatrix(true, true);
          const bounds = new THREE.Box3().setFromObject(object);
          bounds.getCenter(wantTarget);
          const size = bounds.getSize(new THREE.Vector3());
          const distance = Math.max(size.z, size.x / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (focused === "keyboard" ? 1.12 : 1.3);
          // A tiny forward offset keeps lookAt stable near the vertical axis.
          wantPos.copy(wantTarget).add(new THREE.Vector3(0, distance + size.y / 2, distance * 0.01));
        } else if (focused === "lamp") {
          wantTarget.copy(lamp.localToWorld(tmp.set(0, .023, .045)));
          wantPos.copy(lamp.localToWorld(tmp.set(0, .24, .20)));
        } else if (focused === "scissors") {
          object.updateWorldMatrix(true, true);
          new THREE.Box3().setFromObject(object).getCenter(wantTarget);
          const normal = new THREE.Vector3(0, 0.25, 1).normalize().transformDirection(object.matrixWorld);
          wantPos.copy(wantTarget).addScaledVector(normal, Math.max(0.27, 0.20 / camera.aspect));
        } else if (focused === "notebook") {
object.updateWorldMatrix(true, false);
object.getWorldPosition(wantTarget);
const distance = Math.max(0.21, 0.15 / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.35;
const normal = new THREE.Vector3(0, 1, 0.32).normalize().transformDirection(object.matrixWorld);
wantPos.copy(wantTarget).addScaledVector(normal, distance);
} else if (focused === "poster" || focused === "laptop" || focused === "tablet" || focused === "phone") {
          object.updateWorldMatrix(true, false);
          object.getWorldPosition(wantTarget);
          const geometry = (object as THREE.Mesh).geometry;
          geometry.computeBoundingBox();
          const size = geometry.boundingBox!.getSize(new THREE.Vector3());
          if (focused === "poster") size.set(0.32875, 0.425, 0.022);
          const distance = focused === "poster" ? posterDistance : Math.max(size.y, size.x / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.14;
          const normal = new THREE.Vector3(0, 0, 1).transformDirection(object.matrixWorld);
          wantPos.copy(wantTarget).addScaledVector(normal, distance);
        } else {
          object.getWorldPosition(tmp);
          wantTarget.lerp(tmp, 0.55);
          wantPos.lerp(tmp.clone().add(new THREE.Vector3(0, 0.3, 0.42)), 0.35);
        }
      }
    }
    if (!drag) {
    camPos.x = damp(camPos.x, wantPos.x, 4.2, dt);
    camPos.y = damp(camPos.y, wantPos.y, 4.2, dt);
    camPos.z = damp(camPos.z, wantPos.z, 4.2, dt);
    camTarget.x = damp(camTarget.x, wantTarget.x, 4.2, dt);
    camTarget.y = damp(camTarget.y, wantTarget.y, 4.2, dt);
    camTarget.z = damp(camTarget.z, wantTarget.z, 4.2, dt);
    camera.position.copy(camPos);
    camera.lookAt(camTarget);
    }
    if (focused && !focusNotified && camPos.distanceTo(wantPos) < .002 && camTarget.distanceTo(wantTarget) < .002) {
      focusNotified = true; options.onFocusReady?.(focused);
    }
    cableUpdates.forEach(update => update());
    lampHead.getWorldPosition(tmp);
    spot.position.copy(tmp).add(new THREE.Vector3(0, -0.02, 0));
    lampGlow.position.copy(tmp).add(new THREE.Vector3(0, -0.05, 0));
    spot.target.position.copy(lamp.localToWorld(tmp.copy(lampTargetLocal)));

    const lit = lampOn && powerOn && plugObjects.get("lamp")!.connected ? 1 : 0;
    lampLevel = damp(lampLevel, lit * lampBrightness, 7, dt);
    powerLevel = damp(powerLevel, powerOn ? 1 : 0, 6, dt);
    musicLevel = damp(musicLevel, musicOn && powerOn && plugObjects.get("speaker")!.connected ? 1 : 0, 5, dt);
    const temperature = [0xffefda, 0xffd39a, 0xe6f0ff][lampMode];
    spot.color.setHex(temperature); lampGlow.color.setHex(temperature);
    brightnessBars.forEach((bar,index) => {bar.visible = index < Math.round(lampBrightness*8);});
    spot.intensity = 0.65 * lampLevel;
    lampGlow.intensity = 0.025 * lampLevel;
    lampEmissive.forEach(material => { material.emissiveIntensity = 0.85 * lampLevel; });
    // Keep exposure stable when the desk lamp is switched or dimmed.
    renderer.toneMappingExposure = 0.96;
    switchMat.emissiveIntensity = 0.8 * powerLevel;
    screenGlow.intensity = 0.012 * powerLevel;
    const laptopLevel = 0.04 + 0.96 * powerLevel;
    screenMats.forEach(({ material, base }, index) => {
      const level = index === 0 ? laptopLevel : 1;
      material.color.setRGB(base.r * level, base.g * level, base.b * level);
    });
    ledMat.emissiveIntensity = 2.2 * musicLevel * (0.6 + 0.4 * Math.sin(time * 6));
    const beat = musicLevel * (0.5 + 0.5 * Math.sin(time * Math.PI * 4)) ** 4;
    grille.scale.set(1 + beat * 0.014, 1, 1 + beat * 0.014);

    if (keyPress > 0) {
      keyPress = Math.max(0, keyPress - dt);
      for (let i = 0; i < keyOffsets.length; i += 1) keyOffsets[i] = damp(keyOffsets[i], 0, 18, dt);
      if (Math.random() < 0.5) keyOffsets[Math.floor(Math.random() * keyOffsets.length)] = 0.003;
      placeKeys();
    }

    if (!readySent && assetsReady) {
      readySent = true;
      if (!focused && !reducedMotion) {
        // 画面淡入的同时，镜头从远处推近到书桌。
        camPos.copy(wantPos).add(introOffset);
        camera.position.copy(camPos);
        camera.lookAt(camTarget);
      }
      renderer.render(scene, camera);
      options.onReady?.();
      return;
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  return {
    screenTransform(kind, width, height) {
      const object = measureTargets.get(kind) as THREE.Mesh | undefined;
      if (!object?.geometry) return null;
      object.updateWorldMatrix(true,false); object.geometry.computeBoundingBox();
      const b = object.geometry.boundingBox!;
      const rect = canvas.getBoundingClientRect();
      const pts = [[b.min.x,b.max.y],[b.max.x,b.max.y],[b.max.x,b.min.y],[b.min.x,b.min.y]].map(([x,y]) => {
        const v = object.localToWorld(new THREE.Vector3(x,y,b.max.z)).project(camera);
        return {x:rect.left+(v.x+1)*rect.width/2,y:rect.top+(1-v.y)*rect.height/2};
      });
      const [a,bp,c,d]=pts;
      const dx1=bp.x-c.x,dx2=d.x-c.x,dx3=a.x-bp.x+c.x-d.x;
      const dy1=bp.y-c.y,dy2=d.y-c.y,dy3=a.y-bp.y+c.y-d.y;
      const det=dx1*dy2-dx2*dy1;
      if(Math.abs(det)<1e-9)return null;
      const g=(dx3*dy2-dx2*dy3)/det,h=(dx1*dy3-dx3*dy1)/det;
      return 'matrix3d('+[(bp.x-a.x+g*bp.x)/width,(bp.y-a.y+g*bp.y)/width,0,g/width,(d.x-a.x+h*d.x)/height,(d.y-a.y+h*d.y)/height,0,h/height,0,0,1,0,a.x,a.y,0,1].join(',')+')';
    },
    bookRect(index) { return this.screenRect("bookshelf", shelfBooks[index]); },
    screenRect(kind, part) {
      const object = part ?? measureTargets.get(kind);
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
      focusNotified = false;
      if (kind) {
        hovered = null;
        canvas.style.cursor = "default";
        options.onHover(null, 0, 0);
      }
    },
    setLamp(on) { lampOn = on; },
    setLayoutEditing(editing) { layoutEditing = editing; },
    editObject(id,mode){editingObject=layoutObjects.get(id)??null;editingMode=mode;layoutEditing=!!editingObject;},
    saveLayout() {
      try {
        const objects = Object.fromEntries([...layoutObjects].map(([id, object]) => [id, { position: [object.position.x, object.position.z], quaternion: object.quaternion.toArray() }]));
        localStorage.setItem(layoutKey, JSON.stringify({ version: 1, phoneDocked, objects }));
        layoutEditing = false;
        return true;
      } catch { return false; }
    },
    setPower(on) { powerOn = on; },
    setPlugConnected(kind, connected) {
      const plug = plugObjects.get(kind)!;
      plug.connected = connected;
      plug.object.position.copy(plug.home);
      plug.object.rotation.set(0, 0, 0);
      if (!connected) {
        // Lay the plug in front of its outlet, with exposed pins facing the strip.
        plug.object.position.set(plug.home.x, 0.025, 0.11);
        plug.object.rotation.x = Math.PI / 2;
      }
    },
    setMusic(playing) { musicOn = playing; },
    pressKeys() { keyPress = 0.9; },
    setIdentity() {},
    dispose() {
      clearHold();window.clearInterval(screenTimer);
      disposed = true;
      window.clearTimeout(readyTimer);
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      disposables.forEach(item => item.dispose());
      renderer.dispose();
    },
  };
}
