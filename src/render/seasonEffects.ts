import * as THREE from "three";
import { seasonForTime, seasonInstanceIndex } from "../season";

const FLOWER_COUNT = 26;
const LEAF_PATCH_COUNT = 14;
const WIND_STREAK_COUNT = 3;
const WIND_CYCLE_SECONDS = 40; // 每個週期一次陣風掃過畫面
const WIND_CROSS_FRACTION = 0.35; // 週期裡真正在跑的比例，其餘時間是空的、等下一次

/** 32-bit 雜湊，把任意整數轉成看起來隨機、但每次算出來都一樣的 0..1 小數（跟 pond flood 同一手法）。 */
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

/** 春天灑在地上的小花，幾種花色輪流用，中心一律黃色蕊心。 */
function createFlowerTexture(petalColor: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (const [dx, dy] of [
    [4, 1.5],
    [1.5, 4],
    [6.5, 4],
    [4, 6.5],
  ] as const) {
    fillPixelEllipse(ctx, dx, dy, 1.6, 1.6, petalColor);
  }
  fillPixelEllipse(ctx, 4, 4, 1.3, 1.3, "#f5d54a");
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** 秋天鋪在地上的楓紅落葉堆，跟天空飄落的單片落葉（weather.ts）不同貼圖，這個是好幾片疊在一起的地面色塊。 */
function createLeafPatchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 10;
  canvas.height = 8;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  fillPixelEllipse(ctx, 3, 4, 3, 2.2, "#c94a2b");
  fillPixelEllipse(ctx, 6.5, 3.5, 2.6, 2, "#e0672f");
  fillPixelEllipse(ctx, 5, 5.5, 2.2, 1.6, "#f0a33d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** 夏天陣風掃過的風痕：橫向拉長的半透明淺色條紋，暗示草被風吹過的波紋，不是實體物件。 */
function createWindGustTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 6;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  fillPixelEllipse(ctx, 12, 3, 11, 1.2, "rgba(255,255,255,0.55)");
  fillPixelEllipse(ctx, 6, 2, 5, 0.8, "rgba(255,255,255,0.35)");
  fillPixelEllipse(ctx, 18, 4, 5, 0.8, "rgba(255,255,255,0.35)");
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

interface Rect {
  left: number;
  right: number;
}

/**
 * 季節限定的環境效果層，兩種各自獨立的東西共用一個類別方便 scene.ts 只掛一個物件：
 * 1. 地面裝飾（春天的花、秋天的楓葉堆）：固定灑在地上不會動，同一次季節內位置不變，
 *    位置用 seasonInstanceIndex 當種子算出來，不用存檔；換季就整批清掉重灑。
 * 2. 夏天的陣風：半透明風痕定期從左掃到右，純粹裝飾、不影響任何遊戲邏輯。
 * 跟 weather.ts 的落下雨雪不同——這裡都是「貼在地面上」或「橫向掃過」，不是垂直落下的粒子雨。
 */
export class SeasonEffectsLayer {
  private groundGroup = new THREE.Group();
  private windGroup = new THREE.Group();
  private flowerTextures: THREE.CanvasTexture[];
  private leafTexture: THREE.CanvasTexture;
  private windTexture: THREE.CanvasTexture;
  private groundSprites: THREE.Sprite[] = [];
  private windSprites: THREE.Sprite[] = [];
  private currentGroundKey: string | null = null;

  constructor(scene: THREE.Scene) {
    this.flowerTextures = [createFlowerTexture("#f27fa8"), createFlowerTexture("#ffffff"), createFlowerTexture("#f2a33d")];
    this.leafTexture = createLeafPatchTexture();
    this.windTexture = createWindGustTexture();

    for (let i = 0; i < WIND_STREAK_COUNT; i++) {
      const material = new THREE.SpriteMaterial({ map: this.windTexture, transparent: true, opacity: 0 });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(4, 1, 1);
      sprite.visible = false;
      this.windGroup.add(sprite);
      this.windSprites.push(sprite);
    }

    scene.add(this.groundGroup);
    scene.add(this.windGroup);
  }

  /** groundRect 是草地區域（不含天空），rect 是整個可視範圍（風痕橫跨整個畫面比較有「吹過來」的感覺）。 */
  update(time: number, rect: Rect, groundRect: { left: number; right: number; bottom: number; top: number }): void {
    this.updateGroundDecor(time, groundRect);
    this.updateWind(time, rect, groundRect);
  }

  private updateGroundDecor(time: number, groundRect: { left: number; right: number; bottom: number; top: number }): void {
    const season = seasonForTime(time);
    const instance = seasonInstanceIndex(time);
    const key = `${season}:${instance}`;
    if (key === this.currentGroundKey) return;
    this.currentGroundKey = key;

    for (const sprite of this.groundSprites) {
      this.groundGroup.remove(sprite);
      sprite.material.dispose();
    }
    this.groundSprites = [];

    if (season !== "spring" && season !== "autumn") return;

    const count = season === "spring" ? FLOWER_COUNT : LEAF_PATCH_COUNT;
    const width = groundRect.right - groundRect.left;
    const height = groundRect.top - groundRect.bottom;
    for (let i = 0; i < count; i++) {
      const seed = instance * 1000 + i;
      const x = groundRect.left + hashInt(seed) * width;
      const y = groundRect.bottom + hashInt(seed + 500) * height * 0.85; // *0.85 避免貼到地平線邊緣被天空蓋住視覺上怪怪的
      const texture =
        season === "spring" ? this.flowerTextures[Math.floor(hashInt(seed + 900) * this.flowerTextures.length)] : this.leafTexture;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      const scale = season === "spring" ? 0.85 : 0.65;
      sprite.scale.set(scale, scale * (season === "spring" ? 1 : 0.8), 1);
      sprite.position.set(x, y, -0.5);
      this.groundGroup.add(sprite);
      this.groundSprites.push(sprite);
    }
  }

  private updateWind(time: number, rect: Rect, groundRect: { bottom: number; top: number }): void {
    const isSummer = seasonForTime(time) === "summer";
    if (!isSummer) {
      for (const sprite of this.windSprites) sprite.visible = false;
      return;
    }

    const width = rect.right - rect.left;
    this.windSprites.forEach((sprite, i) => {
      const phase = (time / WIND_CYCLE_SECONDS + i * 0.08) % 1;
      if (phase > WIND_CROSS_FRACTION) {
        sprite.visible = false;
        return;
      }
      const progress = phase / WIND_CROSS_FRACTION;
      sprite.visible = true;
      const x = rect.left - 3 + progress * (width + 6);
      const y = groundRect.bottom + (groundRect.top - groundRect.bottom) * (0.25 + i * 0.22);
      sprite.position.set(x, y, -0.4);
      (sprite.material as THREE.SpriteMaterial).opacity = Math.sin(progress * Math.PI) * 0.7;
    });
  }
}
