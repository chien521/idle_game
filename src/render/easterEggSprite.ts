import * as THREE from "three";
import { easterEggStateForTime } from "../easterEgg";

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

/**
 * 彩蛋訪客的外觀：刻意跟一般靠基因長出來的 superformula 生物完全不同——四角星形的小精靈，
 * 淡紫底、亮黃星芒點綴、一對圓滾滾的大眼睛，一眼就能看出「這不是普通寵物」。
 */
function createSpiritTexture(): THREE.CanvasTexture {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  // 四角星身體（十字形疊菱形）
  ctx.fillStyle = "#c9a2f0";
  ctx.fillRect(6, 2, 4, 12);
  ctx.fillRect(2, 6, 12, 4);
  fillPixelEllipse(ctx, 8, 8, 4, 4, "#c9a2f0");

  // 星芒尖角提亮
  ctx.fillStyle = "#e8d4ff";
  ctx.fillRect(7, 2, 2, 3);
  ctx.fillRect(7, 11, 2, 3);
  ctx.fillRect(2, 7, 3, 2);
  ctx.fillRect(11, 7, 3, 2);

  // 大眼睛
  ctx.fillStyle = "#2a1f3a";
  ctx.fillRect(6, 7, 2, 3);
  ctx.fillRect(9, 7, 2, 3);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(6, 7, 1, 1);
  ctx.fillRect(9, 7, 1, 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** 訪客身後柔和的光暈，暗示牠是會發光的神奇小東西，不是普通生物。 */
function createHaloTexture(): THREE.CanvasTexture {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / (size / 2);
      if (d > 1) continue;
      const alpha = (1 - d) * 0.5;
      ctx.fillStyle = `rgba(230,210,255,${alpha.toFixed(3)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

interface GroundRect {
  left: number;
  right: number;
  bottom: number;
  top: number; // 地平線 y
}

/**
 * 彩蛋訪客的畫面呈現：位置是 easterEggStateForTime 的 progress 配合幾個 sine 波算出的巡遊路徑
 * （純粹是時間的函式，不用另外存座標），停留期間會在草地上方飄來飄去，離開後自動隱藏。
 */
export class EasterEggLayer {
  private sprite: THREE.Sprite;
  private halo: THREE.Sprite;
  private visible = false;
  private worldX = 0;
  private worldY = 0;

  constructor(scene: THREE.Scene) {
    const haloMaterial = new THREE.SpriteMaterial({ map: createHaloTexture(), transparent: true, opacity: 0 });
    this.halo = new THREE.Sprite(haloMaterial);
    this.halo.visible = false;
    scene.add(this.halo);

    const spiritMaterial = new THREE.SpriteMaterial({ map: createSpiritTexture(), transparent: true });
    this.sprite = new THREE.Sprite(spiritMaterial);
    this.sprite.visible = false;
    scene.add(this.sprite);
  }

  update(time: number, groundRect: GroundRect): void {
    const state = easterEggStateForTime(time);
    this.visible = state.visible;
    this.sprite.visible = state.visible;
    this.halo.visible = state.visible;
    if (!state.visible) return;

    const t = state.progress * Math.PI * 2 * 2.5; // 停留期間繞著晃個幾圈，不是走直線穿場
    const nx = 0.5 + 0.32 * Math.sin(t * 1.3);
    const ny = 0.4 + 0.28 * Math.sin(t * 0.8 + 1.1);
    const groundWidth = groundRect.right - groundRect.left;
    const groundHeight = groundRect.top - groundRect.bottom;
    const bob = Math.sin(time * 4) * 0.15;

    this.worldX = groundRect.left + nx * groundWidth;
    this.worldY = groundRect.bottom + ny * groundHeight + bob;

    this.sprite.position.set(this.worldX, this.worldY, 0.2);
    this.sprite.scale.set(1.6, 1.6, 1);
    (this.sprite.material as THREE.SpriteMaterial).rotation = Math.sin(time * 2) * 0.25;

    this.halo.position.set(this.worldX, this.worldY, 0.15);
    this.halo.scale.set(2.8, 2.8, 1);
    (this.halo.material as THREE.SpriteMaterial).opacity = 0.7 + Math.sin(time * 3) * 0.2;
  }

  /** 場景座標是否點到彩蛋訪客本體，供點擊互動判斷用。 */
  pickAt(worldX: number, worldY: number): boolean {
    if (!this.visible) return false;
    const dx = this.worldX - worldX;
    const dy = this.worldY - worldY;
    const hitRadius = 1.6 * 0.6;
    return dx * dx + dy * dy < hitRadius * hitRadius;
  }
}
