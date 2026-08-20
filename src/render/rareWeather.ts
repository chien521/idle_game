import * as THREE from "three";

const METEOR_COUNT = 5;
const METEOR_CYCLE_SECONDS = 2.6; // 流星雨活躍時，每顆流星自己重複出現的週期
const METEOR_FLIGHT_FRACTION = 0.3; // 一次飛行只佔週期的這個比例，其餘時間是空的、等下一次

/** 32-bit 雜湊，把整數轉成看起來隨機、但每次算出來都一樣的 0..1 小數。 */
function hashInt(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 0xffffffff;
}

function fillPixelEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** 像素風彩虹：一圈一圈的同心弧，只畫上半部（弧形），七彩由外而內排列。 */
function createRainbowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const cx = size / 2;
  const cy = size / 2; // 圓心在畫布底部中央，只畫上半圓弧
  const bands = ["#e0524a", "#e8923d", "#eaca4a", "#6fbf5f", "#5aa0e0", "#7d6fd6"];
  const outerR = size / 2;
  const bandWidth = outerR / bands.length;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > outerR || dy > 0) continue;
      const bandIndex = Math.min(bands.length - 1, Math.floor((outerR - dist) / bandWidth));
      ctx.fillStyle = bands[bandIndex];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** 像素風流星：一段由亮轉暗的尾巴，貼圖本身是水平方向，實際飛行角度靠 sprite.material.rotation 轉。 */
function createMeteorTexture(): THREE.CanvasTexture {
  const w = 20;
  const h = 4;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let x = 0; x < w; x++) {
    const t = x / (w - 1); // 0=尾巴末端(暗)，1=頭部(亮)
    const alpha = Math.pow(t, 1.6);
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    ctx.fillRect(x, 1, 1, 2);
  }
  fillPixelEllipse(ctx, w - 2, 2, 2, 2, "#ffffff");
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

interface Rect {
  left: number;
  right: number;
  top: number;
}

interface GroundRect {
  left: number;
  right: number;
  top: number; // 地平線 y
}

/**
 * 稀有天氣的畫面效果：彩虹（雨停後偶爾出現，掛在天空不動）跟流星雨（夜晚偶爾出現，
 * 一批流星陸續劃過夜空）。兩者都是各自獨立、極低機率的裝飾效果，見 season.ts 的
 * rainbowIntensityForTime / meteorShowerIntensityForTime，純粹是時間的函式。
 */
export class RareWeatherLayer {
  private rainbowSprite: THREE.Sprite;
  private meteorSprites: THREE.Sprite[] = [];

  constructor(scene: THREE.Scene) {
    const rainbowMaterial = new THREE.SpriteMaterial({ map: createRainbowTexture(), transparent: true, opacity: 0 });
    this.rainbowSprite = new THREE.Sprite(rainbowMaterial);
    this.rainbowSprite.visible = false;
    scene.add(this.rainbowSprite);

    const meteorTexture = createMeteorTexture();
    for (let i = 0; i < METEOR_COUNT; i++) {
      const material = new THREE.SpriteMaterial({ map: meteorTexture, transparent: true, opacity: 0 });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      scene.add(sprite);
      this.meteorSprites.push(sprite);
    }
  }

  update(time: number, rainbowIntensity: number, meteorIntensity: number, rect: Rect, groundRect: GroundRect): void {
    this.updateRainbow(rainbowIntensity, rect, groundRect);
    this.updateMeteors(time, meteorIntensity, rect, groundRect);
  }

  private updateRainbow(intensity: number, rect: Rect, groundRect: GroundRect): void {
    if (intensity <= 0.01) {
      this.rainbowSprite.visible = false;
      return;
    }
    this.rainbowSprite.visible = true;
    const width = (rect.right - rect.left) * 0.75;
    this.rainbowSprite.scale.set(width, width / 2, 1);
    this.rainbowSprite.position.set((rect.left + rect.right) / 2, groundRect.top, -2.5);
    (this.rainbowSprite.material as THREE.SpriteMaterial).opacity = intensity * 0.85;
  }

  private updateMeteors(time: number, intensity: number, rect: Rect, groundRect: GroundRect): void {
    if (intensity <= 0.01) {
      for (const sprite of this.meteorSprites) sprite.visible = false;
      return;
    }

    const skyWidth = rect.right - rect.left;
    const skyHeight = rect.top - groundRect.top;

    this.meteorSprites.forEach((sprite, i) => {
      const phase = (time / METEOR_CYCLE_SECONDS + i * 0.37) % 1;
      if (phase > METEOR_FLIGHT_FRACTION) {
        sprite.visible = false;
        return;
      }
      const progress = phase / METEOR_FLIGHT_FRACTION;

      const seed = i * 991 + Math.floor(time / METEOR_CYCLE_SECONDS) * 13; // 每次重新開始飛行時換一條新路徑
      const startX = rect.left + hashInt(seed) * skyWidth * 0.7 + skyWidth * 0.15;
      const startY = groundRect.top + skyHeight * (0.65 + hashInt(seed + 1) * 0.3);
      const travelX = -skyWidth * (0.25 + hashInt(seed + 2) * 0.15);
      const travelY = -skyHeight * (0.35 + hashInt(seed + 3) * 0.2);

      const x = startX + travelX * progress;
      const y = startY + travelY * progress;
      sprite.visible = true;
      sprite.position.set(x, y, -2.6);
      sprite.scale.set(2.2, 0.5, 1);
      const material = sprite.material as THREE.SpriteMaterial;
      material.rotation = Math.atan2(travelY, travelX);
      material.opacity = Math.sin(progress * Math.PI) * intensity;
    });
  }
}
