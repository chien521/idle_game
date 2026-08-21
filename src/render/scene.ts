import * as THREE from "three";
import type { Simulation } from "../simulation";
import type { Creature } from "../creature";
import { createCreatureTexture } from "./creatureSprite";
import { createDecorTexture } from "./decorSprite";
import { decorShapeForUnlockId, type DecorShape } from "../unlocks";
import type { DecorPlacement } from "../decor";
import {
  createGrassTexture,
  createSkyTexture,
  updateSkyTexture,
  skyColorsForHour,
  celestialPositionForHour,
  createCelestialTexture,
  createCloudTexture,
  createStarTexture,
  createFoodTexture,
  hourOfGameDay,
  DAY_LENGTH_SECONDS,
} from "./environment";
import { WeatherLayer } from "./weather";
import { SeasonEffectsLayer } from "./seasonEffects";
import { RareWeatherLayer } from "./rareWeather";
import { EasterEggLayer } from "./easterEggSprite";
import {
  weatherForTime,
  grassTintForTime,
  lightningFlashIntensity,
  rainbowIntensityForTime,
  meteorShowerIntensityForTime,
  seasonForTime,
} from "../season";

const TREE_GROWTH_SECONDS = DAY_LENGTH_SECONDS * 3; // 椰子樹／櫻花樹種下後約 3 個遊戲日長到全高
const TREE_GROWTH_SHAPES: ReadonlySet<DecorShape> = new Set(["coconut-tree", "cherry-blossom"]);
const POND_FLOOD_CYCLE_SECONDS = DAY_LENGTH_SECONDS * 3; // 每個水池自己約 3 個遊戲日一個週期，錯開的相位讓不同水池不會同時氾濫
const POND_FLOOD_WINDOW_FRACTION = 0.12; // 週期裡氾濫窗口佔的比例，其餘時間都是平靜水面
const SPLASH_CHANCE_PER_FRAME = 0.012; // 每個在池塘邊的生物、每一影格冒出水花的機率，約每 1~2 秒一次
const MIST_CHANCE_PER_FRAME = 0.01; // 每個在營火邊的生物、每一影格冒出白霧的機率，約每 1.5~2 秒一次
const CAMPFIRE_AMBIENT_MIST_CHANCE_PER_FRAME = 0.006; // 營火本身持續飄的白煙，不需要寵物在旁邊也會冒，頻率比寵物取暖時稍低一點
const CAMPFIRE_GLOW_CYCLE_SECONDS = 2.6; // 每隔約這麼久亮一次，不是持續平滑的忽明忽暗
const CAMPFIRE_GLOW_WINDOW_FRACTION = 0.4; // 一次發光佔週期的比例，其餘時間維持平常亮度
const FAVORITE_HEART_CHANCE_PER_FRAME = 0.008; // 生物逗留在「最愛」的裝飾物旁時，偶爾冒愛心，讓個性偏好行為看得出來

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** 依裝飾自己的 id 錯開相位，回傳 0..1 的氾濫強度：大部分時間是 0（平靜），偶爾短暫升到 1 再退回 0（一次氾濫）。 */
function pondFloodFactor(placementId: string, time: number): number {
  const phaseOffset = hashString(placementId) % POND_FLOOD_CYCLE_SECONDS;
  const phase = ((time + phaseOffset) % POND_FLOOD_CYCLE_SECONDS) / POND_FLOOD_CYCLE_SECONDS;
  const windowStart = 1 - POND_FLOOD_WINDOW_FRACTION;
  if (phase < windowStart) return 0;
  const local = (phase - windowStart) / POND_FLOOD_WINDOW_FRACTION;
  return Math.sin(local * Math.PI); // 0 -> 1 -> 0 的平滑脈衝，不是硬切換
}

const SKY_BAND_FRACTION = 0.4; // 地面高度以上額外留給天空的比例
// 相機一律「以高度為準」：地面＋天空的完整高度永遠 100% 顯示，上下都不裁——天空、寵物永遠都在。
// 寬度依螢幕比例算：比世界窄的螢幕（多數手機直向）裁左右（世界對稱，置中裁沒問題，
// 寵物依然貼齊邊界）；比世界寬的螢幕（多數桌機／橫向）則會比世界本身寬，超出草地/天空範圍的
// 部分直接露出畫布背景色（黑邊），不刻意延伸草地去填滿——比起讓草地看起來比寵物走得到的
// 範圍還寬（那樣才是真正的「隱形邊界」），黑邊在視覺上是清楚可辨的「這裡不是世界」。

const CREATURE_SPRITE_SCALE = 7.5; // 純視覺放大倍率，跟 genome.visual.size（影響繁殖判定等邏輯無關）分開，只影響畫面看起來多大
const DECOR_SPRITE_SCALE = 3.2; // 裝飾物視覺大小的基準值，實際大小是這個乘上 DECOR_SCALE_MULTIPLIER（見下方）
// 寵物放大成兩倍（CREATURE_SPRITE_SCALE 5→10）之後，原本沒被使用者特別點名調整過的裝飾物
// 相對比例全部變小了一半，這裡統一補回去：預設倍率從 1→2（見 decorScaleFor 的 fallback），
// 水池/水車/里程碑地標裝飾（噴泉/涼亭/古樹）的倍率也同步乘 2，維持跟寵物、跟彼此之間原本的相對大小關係。
// 椰子樹、營火是使用者已經直接指定過最終大小的，這裡不跟著調整，維持原樣。
const DECOR_SCALE_MULTIPLIER: Partial<Record<DecorShape, number>> = {
  pond: 7.5, // 使用者要求放大 1.25 倍（原本 6）
  "water-wheel": 3, // 使用者要求縮小一半（原本跟水池同為 6）
  "wishing-fountain": 5.2,
  "garden-gazebo": 4.8,
  "ancient-tree": 5.6,
  "coconut-tree": 6.2, // 使用者要求縮小成「略比陽傘大就好」（原本 10，陽傘是 5.625）
  campfire: 2.5,
  "beach-umbrella": 5.625, // 使用者要求再縮小 0.75 倍（原本是椰子樹 10 倍的 0.75 倍＝7.5）
  snowman: 3.5, // 使用者反應太小，調大於預設值 2
  "cherry-blossom": 6.2, // 使用者要求跟椰子樹一樣大
  "pumpkin-lantern": 3, // 使用者要求再放大 0.5 倍（原本預設值 2 的 1.5 倍）
};
function decorScaleFor(shape: DecorShape | undefined): number {
  // 沒特別列在 DECOR_SCALE_MULTIPLIER 裡的種類（苔石、彩色底沙、石燈籠、四季限定裝飾……）預設倍率是 2，
  // 不是 1——原本的 1 倍是對應寵物還沒放大時的比例，寵物放大兩倍後改用 2 倍才維持得住原本的相對大小。
  return DECOR_SPRITE_SCALE * (shape ? (DECOR_SCALE_MULTIPLIER[shape] ?? 2) : 1);
}
// 草地紋理一塊貼圖對應幾個世界單位：場地現在有 96×56 那麼大，如果 1 貼圖 = 1 世界單位，
// 換算到螢幕上一塊草地磚常常不到 1px，草叢圖案（見 environment.ts 的 drawTuft）會糊成看不出形狀。
// 拉大這個值讓每塊磚在螢幕上有足夠像素，草叢輪廓才看得清楚。
const GRASS_WORLD_UNITS_PER_TILE = 4;
// 天色跟著遊戲時間走（見 environment.ts 的 DAY_LENGTH_SECONDS），玩家快轉時晝夜也會變快，
// 所以節流間隔要用「真實時間」抓得比較緊，不然 20x 快轉時天色會跳格而不是平滑過渡。
const ENVIRONMENT_UPDATE_INTERVAL_MS = 500;

/** 睡覺時頭頂冒的小 Zzz 泡泡，純像素風、跟其他貼圖一樣不做平滑處理。 */
function createZzzTexture(): THREE.CanvasTexture {
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(1, 1, 6, 1);
  ctx.fillRect(4, 2, 2, 1);
  ctx.fillRect(3, 3, 2, 1);
  ctx.fillRect(2, 4, 2, 1);
  ctx.fillRect(1, 5, 2, 1);
  ctx.fillRect(1, 6, 6, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** 所有生物共用同一種影子形狀（橢圓像素塊，中心較深、外圈較淡），畫在生物腳下地面上。 */
function createShadowTexture(): THREE.CanvasTexture {
  const w = 16;
  const h = 8;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / (w / 2);
      const ny = (y - cy) / (h / 2);
      const d = nx * nx + ny * ny;
      if (d <= 0.55) ctx.fillStyle = "rgba(10,20,15,0.38)";
      else if (d <= 1) ctx.fillStyle = "rgba(10,20,15,0.2)";
      else continue;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** 從 id 決定性算出一個 0..2π 的相位，讓每隻生物走路搖擺的節奏各自錯開，不會全部同步看起來很假。 */
function creaturePhase(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
}

/** 摸摸互動的小愛心特效，浮起淡出用。 */
function createHeartTexture(): THREE.CanvasTexture {
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ff7fa8";
  ctx.fillRect(1, 1, 2, 1);
  ctx.fillRect(5, 1, 2, 1);
  ctx.fillRect(0, 2, 8, 2);
  ctx.fillRect(1, 4, 6, 1);
  ctx.fillRect(2, 5, 4, 1);
  ctx.fillRect(3, 6, 2, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

interface TapEffect {
  sprite: THREE.Sprite;
  bornMs: number;
  durationMs: number;
  driftX: number; // 每影格位移量（世界單位），不是每秒——跟愛心特效原本的寫法一致，畫面上夠平順
  driftY: number;
  baseScale: number;
  scaleFrom: number; // 出生時的縮放倍率（相對 baseScale）
  scaleTo: number; // 淡出結束時的縮放倍率，可以是「越變越小」（水花）或「越變越大」（白霧擴散）
}

/** 戲水濺起的水花：比愛心小、隨機朝側邊噴一點再往上飄，同時逐漸縮小消失。 */
function createSplashTexture(): THREE.CanvasTexture {
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#8fd8f0";
  ctx.fillRect(3, 0, 2, 2);
  ctx.fillRect(0, 3, 2, 2);
  ctx.fillRect(6, 3, 2, 2);
  ctx.fillRect(3, 5, 2, 2);
  ctx.fillStyle = "#dff5fb";
  ctx.fillRect(3, 3, 2, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** 營火取暖冒出的白霧：柔和的圓形色塊，會一邊上飄一邊放大淡出，感覺像暖意/幸福感飄散出來。 */
function createMistTexture(): THREE.CanvasTexture {
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const cx = 3.5;
  const cy = 3.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= 2) ctx.fillStyle = "rgba(255,255,255,0.85)";
      else if (d <= 3.4) ctx.fillStyle = "rgba(255,255,255,0.45)";
      else continue;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** 找到彩蛋訪客時的星星閃光特效，跟白霧/水花是同一批粒子系統，只是換一顆四角星貼圖。 */
function createSparkleTexture(): THREE.CanvasTexture {
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#fff3b0";
  ctx.fillRect(3, 0, 2, 8);
  ctx.fillRect(0, 3, 8, 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(3, 3, 2, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

interface CloudInstance {
  sprite: THREE.Sprite;
  baseX: number;
  driftSpeed: number; // 世界單位／遊戲秒
}

interface StarInstance {
  sprite: THREE.Sprite;
  phase: number;
}

interface ViewRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export class TerrariumScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private sprites = new Map<string, THREE.Sprite>();
  private decorSprites = new Map<string, THREE.Sprite>();
  private decorPlacements: readonly DecorPlacement[] = [];
  private draggingDecorId: string | null = null;
  private zzzSprites = new Map<string, THREE.Sprite>();
  private shadowSprites = new Map<string, THREE.Sprite>();
  private shadowTexture: THREE.CanvasTexture;
  private foodSprites = new Map<string, THREE.Sprite>();
  private foodTexture: THREE.CanvasTexture;
  private container: HTMLElement;
  private viewRect: ViewRect;

  private skyTexture: THREE.CanvasTexture;
  private groundMesh: THREE.Mesh;
  private celestialTexture: THREE.CanvasTexture;
  private celestialSprite: THREE.Sprite;
  private lastEnvironmentUpdate = -Infinity;

  private zzzTexture: THREE.CanvasTexture;
  private heartTexture: THREE.CanvasTexture;
  private splashTexture: THREE.CanvasTexture;
  private mistTexture: THREE.CanvasTexture;
  private sparkleTexture: THREE.CanvasTexture;
  private tapEffects: TapEffect[] = [];

  private clouds: CloudInstance[] = [];
  private stars: StarInstance[] = [];
  private isDay = true;
  private weatherLayer: WeatherLayer;
  private seasonEffectsLayer: SeasonEffectsLayer;
  private rareWeatherLayer: RareWeatherLayer;
  private easterEggLayer: EasterEggLayer;
  private lightningOverlay: THREE.Mesh;

  constructor(container: HTMLElement, private sim: Simulation) {
    this.container = container;

    // preserveDrawingBuffer：截圖功能（見 screenshotDataUrl）需要在畫完之後任何時間點都還能讀到畫面內容，
    // 不然瀏覽器合成畫面後可能已經清空/交換掉繪圖緩衝區，直接 toDataURL() 會抓到空白或不穩定的結果。
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // VIVERSE World 的 iframe 裡，canvas 沒有 tabindex 就完全接收不到滑鼠/觸控事件——
    // 所有互動（摸摸、餵食、裝飾放置）都是掛在這顆 canvas 上的監聽器，這個沒補上會整個點不動。
    // 點擊當下再 focus 一次是因為 iframe 外層可能在點擊瞬間搶走 focus，單靠啟動時 focus 不夠。
    const canvas = this.renderer.domElement;
    canvas.setAttribute("tabindex", "0");
    canvas.style.outline = "none";
    setTimeout(() => canvas.focus(), 100);
    canvas.addEventListener("pointerdown", () => canvas.focus());

    this.viewRect = this.computeViewRect();
    this.camera = new THREE.OrthographicCamera(
      this.viewRect.left,
      this.viewRect.right,
      this.viewRect.top,
      this.viewRect.bottom,
      0.1,
      100
    );
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    this.skyTexture = createSkyTexture();
    this.celestialTexture = createCelestialTexture();
    this.celestialSprite = this.buildSky();
    this.buildClouds();
    this.buildStars();
    this.groundMesh = this.buildGround();
    this.updateEnvironment(true);

    this.zzzTexture = createZzzTexture();
    this.heartTexture = createHeartTexture();
    this.splashTexture = createSplashTexture();
    this.mistTexture = createMistTexture();
    this.sparkleTexture = createSparkleTexture();
    this.foodTexture = createFoodTexture();
    this.shadowTexture = createShadowTexture();
    this.weatherLayer = new WeatherLayer(this.scene);
    this.seasonEffectsLayer = new SeasonEffectsLayer(this.scene);
    this.rareWeatherLayer = new RareWeatherLayer(this.scene);
    this.easterEggLayer = new EasterEggLayer(this.scene);

    // 打雷閃光：一片鋪滿畫面的白色半透明覆蓋層，固定用很大的尺寸（遠超世界範圍）蓋住整個相機視野，
    // 不用跟著 resize/viewRect 重新計算大小；z=1 在相機（z=10）跟其他場景物件（都 <= 0.5）之間，
    // 蓋在最上層但仍在畫面 UI（HTML）底下。
    const flashGeometry = new THREE.PlaneGeometry(400, 400);
    const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    this.lightningOverlay = new THREE.Mesh(flashGeometry, flashMaterial);
    this.lightningOverlay.position.set(0, 0, 1);
    this.lightningOverlay.visible = false;
    this.scene.add(this.lightningOverlay);

    this.resize();
  }

  private computeViewRect(): ViewRect {
    const { width, height } = this.sim.config.bounds;
    const halfW = width / 2;
    const halfH = height / 2;
    return {
      left: -halfW,
      right: halfW,
      bottom: -halfH,
      top: halfH + height * SKY_BAND_FRACTION,
    };
  }

  private buildSky(): THREE.Sprite {
    const rect = this.viewRect;
    const { height } = this.sim.config.bounds;
    const horizonY = height / 2;
    const skyWidth = rect.right - rect.left;
    const skyHeight = rect.top - horizonY;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(skyWidth, skyHeight),
      new THREE.MeshBasicMaterial({ map: this.skyTexture })
    );
    mesh.position.set(0, horizonY + skyHeight / 2, -3);
    this.scene.add(mesh);

    // 太陽/月亮：單一像素貼圖（實心圓盤＋像素光暈環，見 environment.ts 的 createCelestialTexture），
    // 用 sprite 材質的 color 染色切換日夜配色，不用分開的平滑 CircleGeometry 光暈 mesh。
    const celestial = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.celestialTexture, transparent: true }));
    celestial.scale.set(2.4, 2.4, 1);
    celestial.position.set(0, horizonY + skyHeight * 0.6, -2.4);
    this.scene.add(celestial);

    return celestial;
  }

  /** 幾朵像素雲，隨機起始位置、各自不同飄移速度，位置在 sky/celestial 之間避免遮住太陽月亮的光暈環。 */
  private buildClouds(): void {
    const rect = this.viewRect;
    const { height } = this.sim.config.bounds;
    const horizonY = height / 2;
    const skyWidth = rect.right - rect.left;
    const skyHeight = rect.top - horizonY;
    const texture = createCloudTexture();

    const CLOUD_COUNT = 5;
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.85 });
      const sprite = new THREE.Sprite(material);
      const scale = 3 + Math.random() * 2.5;
      sprite.scale.set(scale, scale * 0.5, 1);
      const baseX = (Math.random() - 0.5) * skyWidth;
      const y = horizonY + skyHeight * (0.45 + Math.random() * 0.4);
      sprite.position.set(baseX, y, -2.8);
      this.scene.add(sprite);
      this.clouds.push({ sprite, baseX, driftSpeed: 0.15 + Math.random() * 0.2 });
    }
  }

  /** 夜空的固定星點，各自隨機相位讓閃爍不同步。白天由 updateStars 隱藏，不用另外拆日夜兩套物件。 */
  private buildStars(): void {
    const rect = this.viewRect;
    const { height } = this.sim.config.bounds;
    const horizonY = height / 2;
    const skyWidth = rect.right - rect.left;
    const skyHeight = rect.top - horizonY;
    const texture = createStarTexture();

    const STAR_COUNT = 18;
    for (let i = 0; i < STAR_COUNT; i++) {
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0 });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(0.5, 0.5, 1);
      const x = (Math.random() - 0.5) * skyWidth;
      const y = horizonY + skyHeight * (0.3 + Math.random() * 0.65);
      sprite.position.set(x, y, -2.9);
      this.scene.add(sprite);
      this.stars.push({ sprite, phase: Math.random() * Math.PI * 2 });
    }
  }

  /** 雲朵水平飄移，跟著 sim.time 走（跟晝夜循環一樣，快轉時也會一起變快），超出天空寬度就從另一側繞回來。 */
  private updateClouds(): void {
    const rect = this.viewRect;
    const skyWidth = rect.right - rect.left;
    const halfSkyWidth = skyWidth / 2;
    const tint = this.isDay ? 1 : 0.5;
    for (const cloud of this.clouds) {
      let x = cloud.baseX + this.sim.time * cloud.driftSpeed;
      x = ((((x + halfSkyWidth) % skyWidth) + skyWidth) % skyWidth) - halfSkyWidth;
      cloud.sprite.position.x = x;
      (cloud.sprite.material as THREE.SpriteMaterial).color.setScalar(tint);
    }
  }

  /** 星星只在夜晚出現，各自用不同相位的 sine 波製造不同步的閃爍。 */
  private updateStars(): void {
    for (const star of this.stars) {
      const material = star.sprite.material as THREE.SpriteMaterial;
      if (!this.isDay) {
        const twinkle = 0.5 + 0.5 * Math.sin(this.sim.time * 2 + star.phase);
        material.opacity = 0.4 + twinkle * 0.6;
      } else {
        material.opacity = 0;
      }
    }
  }

  private buildGround(): THREE.Mesh {
    const rect = this.viewRect;
    const { height } = this.sim.config.bounds;
    const horizonY = height / 2;
    const groundWidth = rect.right - rect.left;
    const groundHeight = horizonY - rect.bottom;

    const texture = createGrassTexture();
    texture.repeat.set(groundWidth / GRASS_WORLD_UNITS_PER_TILE, groundHeight / GRASS_WORLD_UNITS_PER_TILE);

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(groundWidth, groundHeight), new THREE.MeshBasicMaterial({ map: texture }));
    mesh.position.set(0, rect.bottom + groundHeight / 2, -1);
    this.scene.add(mesh);
    return mesh;
  }

  private spriteFor(creature: Creature): THREE.Sprite {
    let sprite = this.sprites.get(creature.id);
    if (sprite) return sprite;

    const texture = createCreatureTexture(creature.genome);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    sprite = new THREE.Sprite(material);
    this.scene.add(sprite);
    this.sprites.set(creature.id, sprite);
    return sprite;
  }

  /**
   * 依 creature.activity 疊加專屬小動畫（在 spriteFor 給的基礎大小上做調整）：
   * decor 逗留時依裝飾種類做出不同姿態（苔石=蹲坐、彩沙=扭動、水車=跳動），
   * 其餘狀態維持原本大小、無旋轉。這一層純視覺，不影響 simulation 的位置權威資料。
   */
  private applyActivityVisuals(creature: Creature, sprite: THREE.Sprite): void {
    const baseScale = creature.genome.visual.size * CREATURE_SPRITE_SCALE;
    const material = sprite.material as THREE.SpriteMaterial;
    material.rotation = 0;
    sprite.scale.set(baseScale, baseScale, 1);

    if (creature.activity !== "decor" || !creature.activityTargetId) return;
    const shape = decorShapeForUnlockId(creature.activityTargetId);
    const t = this.sim.time;

    // 個性偏好（見 personality.ts）：逗留在自己最愛的裝飾物旁時，偶爾冒愛心，讓偏好行為在畫面上看得出來。
    if (shape === creature.favoriteDecor && Math.random() < FAVORITE_HEART_CHANCE_PER_FRAME) {
      this.spawnHeartEffect(sprite.position.x, sprite.position.y + baseScale * 0.3);
    }

    if (shape === "moss-stone") {
      sprite.scale.set(baseScale, baseScale * 0.88, 1);
      sprite.position.y -= baseScale * 0.06;
    } else if (shape === "colored-sand") {
      material.rotation = Math.sin(t * 6) * 0.35;
    } else if (shape === "water-wheel") {
      sprite.position.y += Math.abs(Math.sin(t * 5)) * baseScale * 0.18;
    } else if (shape === "campfire") {
      const pulse = Math.sin(t * 8 + creaturePhase(creature.id)) * 0.03;
      sprite.scale.set(baseScale * (1 + pulse), baseScale * (1 + pulse), 1);
      if (Math.random() < MIST_CHANCE_PER_FRAME) {
        this.spawnMistEffect(sprite.position.x, sprite.position.y + baseScale * 0.32);
      }
    } else if (shape === "pond") {
      sprite.position.y += Math.sin(t * 3 + creaturePhase(creature.id)) * baseScale * 0.05;
      if (Math.random() < SPLASH_CHANCE_PER_FRAME) {
        this.spawnSplashEffect(sprite.position.x, sprite.position.y - baseScale * 0.25);
      }
    } else if (shape === "coconut-tree" || shape === "ancient-tree") {
      material.rotation = Math.sin(t * 1.5) * 0.06;
    } else if (shape === "wishing-fountain") {
      sprite.position.y += Math.sin(t * 4 + creaturePhase(creature.id)) * baseScale * 0.04;
      if (Math.random() < SPLASH_CHANCE_PER_FRAME) {
        this.spawnSplashEffect(sprite.position.x, sprite.position.y - baseScale * 0.2);
      }
    } else if (shape === "garden-gazebo") {
      material.rotation = Math.sin(t * 2 + creaturePhase(creature.id)) * 0.03;
    }
  }

  /** 所有生物共用同一種影子貼圖，畫在腳下、隨體型縮放，讓生物看起來有貼在地面上而不是飄浮。 */
  private syncShadow(creature: Creature, sprite: THREE.Sprite, baseScale: number): void {
    let shadow = this.shadowSprites.get(creature.id);
    if (!shadow) {
      const material = new THREE.SpriteMaterial({ map: this.shadowTexture, transparent: true });
      shadow = new THREE.Sprite(material);
      this.scene.add(shadow);
      this.shadowSprites.set(creature.id, shadow);
    }
    shadow.scale.set(baseScale * 0.8, baseScale * 0.4, 1);
    shadow.position.set(sprite.position.x, sprite.position.y - baseScale * 0.4, -0.02);
  }

  /** 睡覺時在頭頂顯示會輕輕浮動的 Zzz，其餘狀態就把泡泡收掉。 */
  private syncZzz(creature: Creature, sprite: THREE.Sprite): void {
    const existing = this.zzzSprites.get(creature.id);
    if (creature.activity !== "sleep") {
      if (existing) {
        this.scene.remove(existing);
        existing.material.dispose();
        this.zzzSprites.delete(creature.id);
      }
      return;
    }

    let zzz = existing;
    if (!zzz) {
      const material = new THREE.SpriteMaterial({ map: this.zzzTexture, transparent: true });
      zzz = new THREE.Sprite(material);
      this.scene.add(zzz);
      this.zzzSprites.set(creature.id, zzz);
    }
    const baseScale = creature.genome.visual.size * CREATURE_SPRITE_SCALE;
    zzz.scale.set(baseScale * 0.225, baseScale * 0.225, 1); // 使用者要求縮小成原本的 0.5 倍（原本是 0.45）
    const bob = Math.sin(this.sim.time * 2) * baseScale * 0.06;
    zzz.position.set(sprite.position.x + baseScale * 0.35, sprite.position.y + baseScale * 0.45 + bob, 0.1);
  }

  /**
   * 依已擺放的裝飾物清單同步場景（新增/移除/位置更新）。用 placement.id（每次擺放的
   * 唯一 id）當 key，不是 unlockId（裝飾種類）——同一種裝飾解鎖後可以無限次擺放很多個實例，
   * 用 unlockId 當 key 會讓同種類的第二個以後都被當成「已經畫過」而擋掉。
   * 位置會持續同步，因為玩家可以點一個已放置的裝飾物再點草地把它移到新位置。
   */
  setDecor(placements: readonly DecorPlacement[]): void {
    this.decorPlacements = placements;
    const liveIds = new Set(placements.map((p) => p.id));

    for (const [id, sprite] of this.decorSprites) {
      if (!liveIds.has(id)) {
        this.scene.remove(sprite);
        sprite.material.map?.dispose();
        sprite.material.dispose();
        this.decorSprites.delete(id);
      }
    }

    for (const placement of placements) {
      let sprite = this.decorSprites.get(placement.id);
      if (!sprite) {
        const shape = decorShapeForUnlockId(placement.unlockId);
        if (!shape) continue;

        const texture = createDecorTexture(shape);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        sprite = new THREE.Sprite(material);
        const initialScale = decorScaleFor(shape);
        sprite.scale.set(initialScale, initialScale, 1);
        this.scene.add(sprite);
        this.decorSprites.set(placement.id, sprite);
      }
      sprite.position.set(placement.x, placement.y, -0.2);
    }
  }

  /**
   * 裝飾物不只是靜態擺著，隨時間本身也會變化：椰子樹種下後慢慢長高、水池偶爾會氾濫一下。
   * 每一影格都跑，跟寵物拜訪裝飾物時的姿態動畫（applyActivityVisuals）是各自獨立的兩層效果，
   * 這裡影響的是裝飾物本身的基礎大小/顏色，不受有沒有寵物在旁邊拜訪影響。
   */
  private updateDecorEvolution(): void {
    for (const placement of this.decorPlacements) {
      const sprite = this.decorSprites.get(placement.id);
      if (!sprite) continue;
      const shape = decorShapeForUnlockId(placement.unlockId);
      const material = sprite.material as THREE.SpriteMaterial;

      if (shape && TREE_GROWTH_SHAPES.has(shape)) {
        const age = this.sim.time - placement.plantedAt;
        const growth = Math.max(0, Math.min(1, age / TREE_GROWTH_SECONDS));
        const fullScale = decorScaleFor(shape);
        const scale = fullScale * (0.55 + growth * 0.65); // 幼苗約 55% 大小，長到全高後是原本的 1.2 倍
        sprite.scale.set(scale, scale, 1);
        // 正在被拿起來拖曳移動的這一株，y 交給 dragDecorTo 即時跟著游標走，這裡不要每影格蓋回舊位置。
        if (this.draggingDecorId !== placement.id) {
          sprite.position.y = placement.y - fullScale * 0.5 * (1 - growth); // 幼苗矮，錨點跟著往下修正，看起來像從地面長出來而不是懸空縮小
        }
      } else if (shape === "pond") {
        const flood = pondFloodFactor(placement.id, this.sim.time);
        const scale = decorScaleFor(shape) * (1 + flood * 0.18); // 「略為擴大」：氾濫時範圍最多多出 18%，不是誇張暴漲
        sprite.scale.set(scale, scale, 1);
        material.color.setRGB(1, 1 + flood * 0.15, 1 + flood * 0.3); // 氾濫時水面偏亮偏藍，暗示水量變多
      } else if (shape === "campfire") {
        // 營火持續有動畫：不像 applyActivityVisuals 那層姿態動畫要靠寵物逗留才會播，這裡每一影格都跑，
        // 不管旁邊有沒有寵物，營火本身看起來永遠是活的。大小/角度都維持固定，只用「間歇性發光」表現——
        // 大部分時間是平常的火光，每隔一段時間才短暫亮一下再暗回去，不是持續平滑的忽明忽暗。
        // 用 placement id 錯開相位跟週期起點，多個營火不會同步發光。
        const scale = decorScaleFor("campfire");
        sprite.scale.set(scale, scale, 1);
        const phase = hashString(placement.id);
        const cycle = ((this.sim.time + phase) % CAMPFIRE_GLOW_CYCLE_SECONDS) / CAMPFIRE_GLOW_CYCLE_SECONDS;
        const glow = cycle < CAMPFIRE_GLOW_WINDOW_FRACTION ? Math.sin((cycle / CAMPFIRE_GLOW_WINDOW_FRACTION) * Math.PI) : 0;
        const warmth = 0.85 + glow * 0.2;
        material.color.setRGB(1, warmth, warmth * 0.7);
        if (Math.random() < CAMPFIRE_AMBIENT_MIST_CHANCE_PER_FRAME) {
          this.spawnMistEffect(placement.x, placement.y + scale * 0.3);
        }
      } else if (shape === "snowman") {
        // 原地融化/結凍，但不會真的消失：冬天以外的季節縮小、偏灰濕，冬天恢復雪白全尺寸。
        // 跟樹木長大用同一招「錨點往下修正」讓縮小時看起來像矮下去，不是懸空縮小。
        const isWinter = seasonForTime(this.sim.time) === "winter";
        const fullScale = decorScaleFor("snowman");
        const sizeFactor = isWinter ? 1 : 0.82;
        const scale = fullScale * sizeFactor;
        sprite.scale.set(scale, scale, 1);
        material.opacity = isWinter ? 1 : 0.7;
        material.color.setRGB(isWinter ? 1 : 0.85, isWinter ? 1 : 0.88, isWinter ? 1 : 0.85); // 融化時偏灰濕，不是純白
        if (this.draggingDecorId !== placement.id) {
          sprite.position.y = placement.y - fullScale * 0.5 * (1 - sizeFactor);
        }
      }
    }
  }

  /** 場景座標找最近的已放置裝飾物（供點擊撿起、移動位置用），回傳它的 placement id；沒點到就回傳 null。
   *  命中半徑依裝飾種類的實際視覺大小算（見 decorScaleFor），不然放大 3 倍的水池/水車周圍會有一圈
   *  點不到的空隙、或反過來小裝飾旁邊誤觸到隔壁放大版裝飾。 */
  pickDecorAt(worldX: number, worldY: number): string | null {
    let nearestId: string | null = null;
    let nearestDistSq = Infinity;
    for (const placement of this.decorPlacements) {
      const sprite = this.decorSprites.get(placement.id);
      if (!sprite) continue;
      const shape = decorShapeForUnlockId(placement.unlockId);
      const hitRadius = decorScaleFor(shape) * 0.55;
      const dx = sprite.position.x - worldX;
      const dy = sprite.position.y - worldY;
      const distSq = dx * dx + dy * dy;
      if (distSq < hitRadius * hitRadius && distSq < nearestDistSq) {
        nearestId = placement.id;
        nearestDistSq = distSq;
      }
    }
    return nearestId;
  }

  /** 依目前 simulation.foodItems 同步場上的食物 sprite（新增/被吃掉後移除，位置固定不會變動）。 */
  private syncFood(): void {
    const liveIds = new Set(this.sim.foodItems.map((f) => f.id));

    for (const [id, sprite] of this.foodSprites) {
      if (!liveIds.has(id)) {
        this.scene.remove(sprite);
        sprite.material.dispose();
        this.foodSprites.delete(id);
      }
    }

    for (const food of this.sim.foodItems) {
      if (this.foodSprites.has(food.id)) continue;
      const material = new THREE.SpriteMaterial({ map: this.foodTexture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(1.1, 1.1, 1);
      sprite.position.set(food.x, food.y, -0.15);
      this.scene.add(sprite);
      this.foodSprites.set(food.id, sprite);
    }
  }

  /** 依目前 simulation.creatures 同步場景中的 sprite（新增/移除/更新位置）。 */
  sync(): void {
    const liveIds = new Set(this.sim.creatures.map((c) => c.id));

    for (const [id, sprite] of this.sprites) {
      if (!liveIds.has(id)) {
        this.scene.remove(sprite);
        sprite.material.map?.dispose();
        sprite.material.dispose();
        this.sprites.delete(id);
        const zzz = this.zzzSprites.get(id);
        if (zzz) {
          this.scene.remove(zzz);
          zzz.material.dispose();
          this.zzzSprites.delete(id);
        }
        const shadow = this.shadowSprites.get(id);
        if (shadow) {
          this.scene.remove(shadow);
          shadow.material.dispose();
          this.shadowSprites.delete(id);
        }
      }
    }

    const { width, height } = this.sim.config.bounds;
    const halfW = width / 2;
    const halfH = height / 2;

    for (const creature of this.sim.creatures) {
      const sprite = this.spriteFor(creature);
      // sprite 是以中心點定位，creature.x/y 只保證「中心點」在場地範圍內，
      // 放大到 CREATURE_SPRITE_SCALE 之後身體會比中心點多出半個貼圖大小，
      // 沒特別處理的話身體下緣會视覺上超出場地邊界（尤其是遊戲邊界＝視窗最下方時特別明顯）。
      // 這裡只調整「畫在哪」，不改 creature.x/y 本身（那是 simulation 的權威資料)。
      const baseScale = creature.genome.visual.size * CREATURE_SPRITE_SCALE;
      const halfSprite = baseScale / 2;
      let drawX = Math.max(-halfW + halfSprite, Math.min(halfW - halfSprite, creature.x));
      let drawY = Math.max(-halfH + halfSprite, Math.min(halfH - halfSprite, creature.y));

      // 走路搖擺：往移動方向的垂直軸做小幅正弦偏移，讓前進看起來左右晃、不是死板地走直線。
      // 只在真的有在移動（vx/vy 不是 0）時套用，純視覺偏移，不影響 creature.x/y 本身。
      const speed = Math.hypot(creature.vx, creature.vy);
      if (speed > 0.001) {
        const perpX = -creature.vy / speed;
        const perpY = creature.vx / speed;
        const wobble = Math.sin(this.sim.time * 7 + creaturePhase(creature.id)) * baseScale * 0.05;
        drawX += perpX * wobble;
        drawY += perpY * wobble;
      }

      sprite.position.set(drawX, drawY, 0);
      this.applyActivityVisuals(creature, sprite);
      this.syncZzz(creature, sprite);
      this.syncShadow(creature, sprite, baseScale);
    }
  }

  /** 場景座標找最近的生物（供點擊摸摸互動用），回傳它的 id；沒點到任何生物就回傳 null。 */
  pickCreatureAt(worldX: number, worldY: number): string | null {
    let nearestId: string | null = null;
    let nearestDistSq = Infinity;
    for (const c of this.sim.creatures) {
      const hitRadius = c.genome.visual.size * CREATURE_SPRITE_SCALE * 0.55;
      const dx = c.x - worldX;
      const dy = c.y - worldY;
      const distSq = dx * dx + dy * dy;
      if (distSq < hitRadius * hitRadius && distSq < nearestDistSq) {
        nearestId = c.id;
        nearestDistSq = distSq;
      }
    }
    return nearestId;
  }

  /** 點擊場景（canvas）時觸發，座標已換算成世界座標。 */
  onTap(handler: (world: { x: number; y: number }) => void): void {
    this.renderer.domElement.addEventListener("click", (e) => {
      handler(this.screenToWorld(e.clientX, e.clientY));
    });
  }

  /** 游標/手指在場景上移動時觸發（供拿起裝飾物拖曳預覽用），座標已換算成世界座標。 */
  onPointerMove(handler: (world: { x: number; y: number }) => void): void {
    this.renderer.domElement.addEventListener("pointermove", (e) => {
      handler(this.screenToWorld(e.clientX, e.clientY));
    });
  }

  /**
   * 拿起/放下已放置的裝飾物：拿起時變半透明，讓玩家清楚知道現在正在移動哪一個；
   * 放下（傳 null）時恢復原本不透明度。呼叫端（main.ts 的 setMovingDecor）負責同步狀態，
   * 不需要另外檢查「拿起的跟放下的是不是同一個」，這裡的邏輯本身就處理得了。
   */
  setDraggingDecor(placementId: string | null): void {
    if (this.draggingDecorId) {
      const prevSprite = this.decorSprites.get(this.draggingDecorId);
      if (prevSprite) (prevSprite.material as THREE.SpriteMaterial).opacity = 1;
    }
    this.draggingDecorId = placementId;
    if (placementId) {
      const sprite = this.decorSprites.get(placementId);
      if (sprite) (sprite.material as THREE.SpriteMaterial).opacity = 0.6;
    }
  }

  /** 拖曳中的裝飾物即時跟著游標/手指走；真正寫回 placement.x/y 是放開（下一次點擊）才做的事，
   *  這裡純粹是移動預覽的視覺效果，不影響存檔或 simulation 的權威資料。 */
  dragDecorTo(worldX: number, worldY: number): void {
    if (!this.draggingDecorId) return;
    const sprite = this.decorSprites.get(this.draggingDecorId);
    if (!sprite) return;
    sprite.position.x = worldX;
    sprite.position.y = worldY;
  }

  /** 摸摸互動的小愛心特效：浮起、淡出、自動清除。 */
  spawnHeartEffect(x: number, y: number): void {
    this.spawnTapEffect(this.heartTexture, x, y + 0.5, {
      durationMs: 900,
      driftX: 0,
      driftY: 0.012,
      baseScale: 1,
      scaleFrom: 1,
      scaleTo: 1,
    });
  }

  /** 池塘邊戲水濺起的水花：隨機朝側邊噴一點再往上飄，同時逐漸縮小消失。 */
  spawnSplashEffect(x: number, y: number): void {
    const angle = Math.random() * Math.PI * 2;
    this.spawnTapEffect(this.splashTexture, x + Math.cos(angle) * 0.15, y + Math.sin(angle) * 0.1, {
      durationMs: 480,
      driftX: Math.cos(angle) * 0.012,
      driftY: 0.02,
      baseScale: 0.6,
      scaleFrom: 1,
      scaleTo: 0.5,
    });
  }

  /** 營火邊取暖冒出的白霧：慢慢上飄、一邊放大一邊淡出，感覺像暖意飄散出來。 */
  spawnMistEffect(x: number, y: number): void {
    this.spawnTapEffect(this.mistTexture, x + (Math.random() - 0.5) * 0.3, y, {
      durationMs: 1400,
      driftX: (Math.random() - 0.5) * 0.008,
      driftY: 0.011,
      baseScale: 0.7,
      scaleFrom: 0.6,
      scaleTo: 1.5,
    });
  }

  /** 找到彩蛋訪客時的慶祝特效：一次噴出好幾顆星星閃光，比單一水花/白霧更熱鬧一點，呼應「找到稀有東西」的驚喜感。 */
  spawnSparkleEffect(x: number, y: number): void {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      this.spawnTapEffect(this.sparkleTexture, x + Math.cos(angle) * 0.2, y + Math.sin(angle) * 0.2, {
        durationMs: 700,
        driftX: Math.cos(angle) * 0.02,
        driftY: Math.sin(angle) * 0.02 + 0.01,
        baseScale: 0.7,
        scaleFrom: 1,
        scaleTo: 0.3,
      });
    }
  }

  private spawnTapEffect(
    texture: THREE.CanvasTexture,
    x: number,
    y: number,
    opts: Omit<TapEffect, "sprite" | "bornMs">
  ): void {
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(opts.baseScale * opts.scaleFrom, opts.baseScale * opts.scaleFrom, 1);
    sprite.position.set(x, y, 0.3);
    this.scene.add(sprite);
    this.tapEffects.push({ sprite, bornMs: performance.now(), ...opts });
  }

  private updateTapEffects(): void {
    const now = performance.now();
    for (let i = this.tapEffects.length - 1; i >= 0; i--) {
      const effect = this.tapEffects[i];
      const p = (now - effect.bornMs) / effect.durationMs;
      if (p >= 1) {
        this.scene.remove(effect.sprite);
        effect.sprite.material.dispose(); // 貼圖是共用的（愛心/水花/白霧其中一種），不能一起 dispose，只清材質
        this.tapEffects.splice(i, 1);
        continue;
      }
      effect.sprite.position.x += effect.driftX;
      effect.sprite.position.y += effect.driftY;
      const scale = effect.baseScale * (effect.scaleFrom + (effect.scaleTo - effect.scaleFrom) * p);
      effect.sprite.scale.set(scale, scale, 1);
      (effect.sprite.material as THREE.SpriteMaterial).opacity = 1 - p;
    }
  }

  /** 依遊戲時間（見 environment.ts 的 hourOfGameDay）更新天色與日月位置；節流到每 500ms 才重算一次（force 可略過節流，開場第一次要立即畫出來）。 */
  private updateEnvironment(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastEnvironmentUpdate < ENVIRONMENT_UPDATE_INTERVAL_MS) return;
    this.lastEnvironmentUpdate = now;

    const hour = hourOfGameDay(this.sim.time);

    const colors = skyColorsForHour(hour);
    updateSkyTexture(this.skyTexture, colors);

    const { height } = this.sim.config.bounds;
    const horizonY = height / 2;
    const skyHeight = this.viewRect.top - horizonY;
    const celestial = celestialPositionForHour(hour);

    const arcWidth = (this.viewRect.right - this.viewRect.left) * 0.42;
    const cx = celestial.x * arcWidth;
    const cy = horizonY + Math.max(0.1, celestial.y) * skyHeight * 0.85 + skyHeight * 0.08;

    this.celestialSprite.position.set(cx, cy, -2.4);
    const bodyColor = celestial.isSun ? 0xffe17a : 0xdfe6f0;
    (this.celestialSprite.material as THREE.SpriteMaterial).color.setHex(bodyColor);

    // 夜晚地面稍微壓暗，呼應天空變暗；再疊乘上當下季節的草地色調（春綠、夏濃綠、秋黃、冬偏白），
    // 兩者是相乘關係，不會互相蓋掉。季節色調變化很慢（以「日」為單位），跟著這裡的節流間隔算就夠平滑。
    const dayFactor = colors.isDay ? 1 : 0.55;
    const [tr, tg, tb] = grassTintForTime(this.sim.time);
    const groundMat = this.groundMesh.material as THREE.MeshBasicMaterial;
    groundMat.color.setRGB(tr * dayFactor, tg * dayFactor, tb * dayFactor);

    this.isDay = colors.isDay;
  }

  /** 依當下季節/天氣同步飄落的雨滴/雪花/落葉粒子（見 season.ts 的 weatherForTime，純粹是時間的函式），
   *  以及貼在地面上的季節裝飾（春天的花、秋天的楓紅）跟夏天橫掃過畫面的陣風。 */
  private updateWeather(): void {
    const time = this.sim.time;
    const weather = weatherForTime(time);
    this.weatherLayer.update(weather.kind, weather.intensity, time, this.viewRect);

    const rect = this.viewRect;
    const { height } = this.sim.config.bounds;
    const horizonY = height / 2;
    const groundRect = { left: rect.left, right: rect.right, bottom: rect.bottom, top: horizonY };
    this.seasonEffectsLayer.update(time, rect, groundRect);

    // 夏天雷雨限定的間歇閃電：只在有背景雷雨（夏天+夠大的雨）時才可能出現，見 season.ts 的說明。
    const flash = lightningFlashIntensity(time, weather, seasonForTime(time));
    const flashMaterial = this.lightningOverlay.material as THREE.MeshBasicMaterial;
    flashMaterial.opacity = flash * 0.55;
    this.lightningOverlay.visible = flash > 0.001;

    // 稀有天氣：雨停後偶爾出現的彩虹、晴朗夜晚偶爾出現的流星雨，見 season.ts 的機率設計。
    const rainbow = rainbowIntensityForTime(time);
    const meteorShower = meteorShowerIntensityForTime(time);
    this.rareWeatherLayer.update(time, rainbow, meteorShower, rect, groundRect);

    // 彩蛋訪客：跟寵物基因無關的稀有裝飾性小訪客，見 easterEgg.ts 的機率設計。
    this.easterEggLayer.update(time, groundRect);
  }

  /** 場景座標是否點到彩蛋訪客本體，供 main.ts 的點擊互動判斷用。 */
  pickEasterEggAt(worldX: number, worldY: number): boolean {
    return this.easterEggLayer.pickAt(worldX, worldY);
  }

  render(): void {
    this.updateEnvironment();
    this.updateClouds();
    this.updateStars();
    this.updateWeather();
    this.sync();
    this.syncFood();
    this.updateDecorEvolution();
    this.updateTapEffects();
    this.renderer.render(this.scene, this.camera);
  }

  /** 把目前這一影格的畫面轉成 PNG data URL，供 main.ts 觸發下載用（見 renderer 的 preserveDrawingBuffer 設定）。 */
  screenshotDataUrl(): string {
    return this.renderer.domElement.toDataURL("image/png");
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);

    const rect = this.viewRect;
    const rectCenterX = (rect.left + rect.right) / 2;
    const worldWidth = rect.right - rect.left;
    const rectHeight = rect.top - rect.bottom;
    const viewAspect = w / h;

    // 高度優先完整顯示（原本的邏輯），寬度依螢幕比例算：寬螢幕（多數桌機／橫向）算出來的
    // 可視寬度本來就會超過世界寬度，兩側自然露出黑邊，不用特別處理。
    // 但手機直向螢幕極端窄長，這樣純粹「crop 寬度」會只剩世界寬度不到 4 成，寵物大部分時間
    // 都晃到可視範圍外，變成在看空地。所以加一個下限：可視寬度最少要有世界寬度的
    // MIN_VISIBLE_WIDTH_FRACTION，不夠的話改成「撐高可視高度」而不是「裁得更窄」——
    // 犧牲一點畫面上緣多出來的天空留白，換取寵物大多數時間都在畫面範圍內晃動。
    const MIN_VISIBLE_WIDTH_FRACTION = 0.6;
    const visibleWidth = Math.max(rectHeight * viewAspect, worldWidth * MIN_VISIBLE_WIDTH_FRACTION);
    const visibleHeight = visibleWidth / viewAspect;

    const left = rectCenterX - visibleWidth / 2;
    const right = rectCenterX + visibleWidth / 2;
    const bottom = rect.bottom;
    const top = rect.bottom + visibleHeight; // 地面基準線固定在畫面底部，多出來的高度全部加給天空

    this.camera.left = left;
    this.camera.right = right;
    this.camera.top = top;
    this.camera.bottom = bottom;
    this.camera.updateProjectionMatrix();
  }

  /** 世界座標轉換：把螢幕像素座標（例如 tap 位置）換算成場景內座標，供未來互動使用。 */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const x = THREE.MathUtils.lerp(this.camera.left, this.camera.right, (ndcX + 1) / 2);
    const y = THREE.MathUtils.lerp(this.camera.bottom, this.camera.top, (ndcY + 1) / 2);
    return { x, y };
  }
}
