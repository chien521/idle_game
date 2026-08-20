import * as THREE from "three";

const GRASS_TILE = 16;

/** 畫一小叢草——3 片葉子微微展開，經典 GBA 時代 RPG 那種草地小草叢畫法。 */
function drawTuft(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y + 1, 1, 2);
  ctx.fillRect(x + 1, y, 1, 3);
  ctx.fillRect(x + 2, y + 1, 1, 2);
}

/**
 * 可重複貼合（RepeatWrapping）的像素風草地紋理：實色底 + 幾叢深色小草，
 * 不是隨機像素抖動雜訊——參考老牌 GBA 時代 RPG（如寶可夢）那種底色平整、
 * 只在少數幾處點綴清楚草叢輪廓的畫法，而不是滿版細碎雜訊。
 */
export function createGrassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = GRASS_TILE;
  canvas.height = GRASS_TILE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const base = "#5cae4a";
  const dark = "#3f8f38";
  const light = "#79c468";

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, GRASS_TILE, GRASS_TILE);

  // 位置手動排開、不對稱擺放，重複貼圖時才不會一眼看出方格感
  drawTuft(ctx, 2, 3, dark);
  drawTuft(ctx, 10, 9, dark);
  drawTuft(ctx, 6, 12, dark);
  drawTuft(ctx, 12, 2, light);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RgbColor {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function lerpRgb(a: RgbColor, b: RgbColor, t: number): RgbColor {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function lerpColor(a: RgbColor, b: RgbColor, t: number): string {
  const c = lerpRgb(a, b, t);
  return `rgb(${c.r},${c.g},${c.b})`;
}

/** 一個完整晝夜循環對應多少「遊戲秒」（真實時間，1x 速度下）。跟著 sim.time 走，玩家快轉時晝夜也會一起變快。 */
export const DAY_LENGTH_SECONDS = 360; // 6 分鐘一天

/** 把 Simulation.time（遊戲秒，從 0 起算）換算成 0..24 的「一天中的小時」，供 skyColorsForHour / celestialPositionForHour 使用。 */
export function hourOfGameDay(gameTimeSeconds: number): number {
  const dayFraction = (gameTimeSeconds % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;
  return dayFraction * 24;
}

interface SkyStop {
  hour: number;
  top: string;
  bottom: string;
}

// 一天的關鍵時刻天色：午夜深藍 → 日出暖橘 → 正午天藍 → 黃昏橘粉 → 回到午夜
const SKY_STOPS: SkyStop[] = [
  { hour: 0, top: "#0a1128", bottom: "#16223f" },
  { hour: 5, top: "#0a1128", bottom: "#16223f" },
  { hour: 7, top: "#f2b26b", bottom: "#ffd9a0" },
  { hour: 9, top: "#7fc1ea", bottom: "#cdeaff" },
  { hour: 17, top: "#7fc1ea", bottom: "#cdeaff" },
  { hour: 19, top: "#e8825d", bottom: "#ffb199" },
  { hour: 21, top: "#0a1128", bottom: "#16223f" },
  { hour: 24, top: "#0a1128", bottom: "#16223f" },
];

export interface SkyColors {
  top: string;
  bottom: string;
  isDay: boolean;
}

/** 依 0..24 的小時（可含小數）算出天空漸層色，在關鍵時刻之間線性內插。 */
export function skyColorsForHour(hour: number): SkyColors {
  const h = ((hour % 24) + 24) % 24;
  let a = SKY_STOPS[0];
  let b = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    if (h >= SKY_STOPS[i].hour && h <= SKY_STOPS[i + 1].hour) {
      a = SKY_STOPS[i];
      b = SKY_STOPS[i + 1];
      break;
    }
  }
  const span = b.hour - a.hour || 1;
  const t = (h - a.hour) / span;
  return {
    top: lerpColor(hexToRgb(a.top), hexToRgb(b.top), t),
    bottom: lerpColor(hexToRgb(a.bottom), hexToRgb(b.bottom), t),
    isDay: h >= 6.5 && h <= 18.5,
  };
}

const SKY_BANDS = 10; // 天空量化成幾個離散色階；數字越小色階越粗、像素感越明顯
const SKY_TEX_W = 8;
const SKY_TEX_H = 32; // 高度決定網點過渡的顆粒細緻度，跟色階數（SKY_BANDS）是分開的兩件事

// 4x4 有序網點（Bayer matrix）：8-bit 遊戲常見的撞色網點過渡手法，
// 兩個色階之間不是一刀切的硬邊，也不是平滑漸層，而是用固定圖案的網點疏密來過渡。
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

/** 建立天空用的直向貼圖；顏色變動時呼叫 updateSkyTexture 重畫，不用重建新貼圖。 */
export function createSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = SKY_TEX_W;
  canvas.height = SKY_TEX_H;
  const texture = new THREE.CanvasTexture(canvas);
  // 一定要用 NearestFilter，不然即使畫布本身是離散色階，貼圖放大時還是會被線性內插成平滑漸層，
  // 跟遊戲其他部分的像素風格（草地、生物、裝飾）不一致。
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** colors.top/bottom 是 skyColorsForHour 用 lerpColor 算出的 "rgb(r,g,b)" 字串，不是 hex，parseColorString 兩種格式都吃。 */
function parseColorString(s: string): RgbColor {
  const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  return hexToRgb(s);
}

/**
 * 把連續的 top→bottom 漸層量化成 SKY_BANDS 個離散色階，
 * 色階交界處用 Bayer 網點過渡（撞色網點），而不是一刀切的硬邊或平滑內插。
 */
export function updateSkyTexture(texture: THREE.CanvasTexture, colors: SkyColors): void {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const top = parseColorString(colors.top);
  const bottom = parseColorString(colors.bottom);

  const steps: RgbColor[] = [];
  for (let i = 0; i < SKY_BANDS; i++) {
    const t = SKY_BANDS <= 1 ? 0 : i / (SKY_BANDS - 1);
    steps.push(lerpRgb(top, bottom, t));
  }

  for (let y = 0; y < SKY_TEX_H; y++) {
    const bandF = (y / Math.max(1, SKY_TEX_H - 1)) * (SKY_BANDS - 1);
    const lower = Math.floor(bandF);
    const upper = Math.min(SKY_BANDS - 1, lower + 1);
    const frac = bandF - lower;
    for (let x = 0; x < SKY_TEX_W; x++) {
      const threshold = BAYER4[y % 4][x % 4];
      const c = frac > threshold ? steps[upper] : steps[lower];
      ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  texture.needsUpdate = true;
}

/**
 * 太陽／月亮的像素風貼圖：實心圓盤 + 兩圈遞減透明度的光暈像素環，逐格素描而非畫平滑圓形，
 * 跟生物剪影的畫法（逐像素邊界測試）同一套邏輯。白色底圖，實際顏色由呼叫端用 material.color 染色
 * （太陽暖黃、月亮淡藍白），這樣白天/夜晚切換不用重畫貼圖，只要換色。
 */
export function createCelestialTexture(): THREE.CanvasTexture {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      let alpha = 0;
      if (dist <= 3.5) alpha = 1;
      else if (dist <= 5) alpha = 0.4;
      else if (dist <= 6.5) alpha = 0.15;
      if (alpha > 0) {
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** 像素風雲朵：幾塊疊起來的白色矩形拼出蓬鬆輪廓，老牌 RPG 天空常見的畫法。白底供染色/調不透明度。 */
export function createCloudTexture(): THREE.CanvasTexture {
  const w = 20;
  const h = 10;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(3, 5, 14, 3);
  ctx.fillRect(5, 3, 8, 2);
  ctx.fillRect(1, 6, 4, 2);
  ctx.fillRect(14, 4, 5, 3);
  ctx.fillRect(7, 6, 3, 3);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** 單顆像素星星：4 方向十字小亮點，供夜空多顆重複使用同一張貼圖。 */
export function createStarTexture(): THREE.CanvasTexture {
  const size = 4;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(1, 0, 2, size);
  ctx.fillRect(0, 1, size, 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** 玩家丟在場上的食物：像素風小蘋果（紅身 + 綠葉 + 梗），在生物吃到之前一直顯示在地上。 */
export function createFoodTexture(): THREE.CanvasTexture {
  const size = 10;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = "#6b4a2c";
  ctx.fillRect(5, 0, 1, 2);

  ctx.fillStyle = "#e05252";
  ctx.fillRect(2, 3, 5, 1);
  ctx.fillRect(1, 4, 7, 4);
  ctx.fillRect(2, 8, 5, 1);

  ctx.fillStyle = "#f2a3a3";
  ctx.fillRect(2, 4, 2, 1);

  ctx.fillStyle = "#6ba644";
  ctx.fillRect(6, 1, 2, 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

export interface CelestialPosition {
  x: number; // -1..1，供呼叫端乘上天空寬度
  y: number; // 0..1，0 為地平線、1 為最高點
  isSun: boolean;
  visible: boolean;
}

/** 太陽／月亮沿弧線移動的位置：白天走太陽的半圈弧、晚上走月亮的半圈弧。 */
export function celestialPositionForHour(hour: number): CelestialPosition {
  const h = ((hour % 24) + 24) % 24;
  const isDay = h >= 6 && h < 18;
  const phase = isDay ? (h - 6) / 12 : h < 6 ? (h + 6) / 12 : (h - 18) / 12;
  return {
    x: phase * 2 - 1,
    y: Math.sin(Math.PI * phase),
    isSun: isDay,
    visible: true,
  };
}
