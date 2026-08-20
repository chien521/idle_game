import * as THREE from "three";
import type { DecorShape } from "../unlocks";

const GRID = 16;

/** 逐像素邊界測試畫實心橢圓，避免 ctx.ellipse().fill() 那種平滑抗鋸齒邊緣——跟生物剪影同一套像素風畫法。 */
function fillPixelEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  const minX = Math.floor(cx - rx);
  const maxX = Math.ceil(cx + rx);
  const minY = Math.floor(cy - ry);
  const maxY = Math.ceil(cy + ry);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawMossStone(ctx: CanvasRenderingContext2D): void {
  fillPixelEllipse(ctx, 8, 11, 6, 4, "#6b6f66");
  fillPixelEllipse(ctx, 6, 12, 2.5, 1.6, "#565a52");

  ctx.fillStyle = "#7fae5f";
  for (const [dx, dy, r] of [
    [3, 8, 2.4],
    [8, 6.5, 3],
    [12, 8.5, 2],
  ] as const) {
    fillPixelEllipse(ctx, dx, dy, r, r * 0.7, "#7fae5f");
  }
}

function drawColoredSand(ctx: CanvasRenderingContext2D): void {
  const bands = ["#e8b25d", "#e88f5d", "#d15d6e", "#8f6bd1", "#5d9fe8"];
  const baseY = 13;
  bands.forEach((color, i) => {
    fillPixelEllipse(ctx, 8, baseY - i * 1.3, 7 - i * 0.6, 2.2, color);
  });
}

/** 逐點取樣畫像素直線（供輻條這種細線用），避免 ctx.lineTo().stroke() 的抗鋸齒。 */
function drawPixelLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string): void {
  ctx.fillStyle = color;
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1);
  }
}

function drawWaterWheel(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#6b5636";
  ctx.fillRect(7, 9, 2, 6); // 支柱

  const cx = 8;
  const cy = 6;
  const r = 4;
  ctx.fillStyle = "#5db8e8";
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const dist = Math.hypot(x, y);
      if (dist >= r - 1 && dist <= r) ctx.fillRect(cx + x, cy + y, 1, 1); // 圓環外框
    }
  }

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    drawPixelLine(ctx, cx, cy, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, "#5db8e8");
  }

  fillPixelEllipse(ctx, cx, cy, 1.2, 1.2, "#8ac7ff");
}

function drawCampfire(ctx: CanvasRenderingContext2D): void {
  // 交叉的木柴
  ctx.fillStyle = "#6b4a2f";
  drawPixelLine(ctx, 3, 13, 12, 10, "#6b4a2f");
  drawPixelLine(ctx, 4, 10, 13, 13, "#6b4a2f");
  ctx.fillStyle = "#8a6440";
  drawPixelLine(ctx, 4, 12, 11, 10, "#8a6440");

  // 火焰：由下到上顏色漸淺（紅→橙→黃），每層用不規則的橢圓堆疊出跳動感
  fillPixelEllipse(ctx, 8, 10, 3, 3.4, "#c94a2b");
  fillPixelEllipse(ctx, 8, 8, 2.3, 2.6, "#e8823a");
  fillPixelEllipse(ctx, 8, 6.2, 1.4, 1.8, "#f5c542");
}

function drawPond(ctx: CanvasRenderingContext2D): void {
  fillPixelEllipse(ctx, 8, 11, 7, 3.4, "#3f7fae");
  fillPixelEllipse(ctx, 8, 10.4, 6, 2.7, "#5aa0cf");
  fillPixelEllipse(ctx, 6, 9.8, 1.8, 0.9, "#8fc7e8"); // 水面反光

  ctx.fillStyle = "#5f9e4a";
  for (const [dx, dy] of [
    [2, 9],
    [3, 8],
    [13, 9],
    [12, 8],
  ] as const) {
    drawPixelLine(ctx, dx, dy, dx, dy - 3, "#5f9e4a"); // 岸邊蘆葦
  }
}

function drawCoconutTree(ctx: CanvasRenderingContext2D): void {
  // 微彎的樹幹
  ctx.fillStyle = "#8a6440";
  for (let i = 0; i < 9; i++) {
    const x = 7 + Math.round(Math.sin(i / 3) * 1.2);
    ctx.fillRect(x, 14 - i, 2, 1);
  }

  const crownX = 8;
  const crownY = 5;
  ctx.fillStyle = "#4f9a4a";
  for (const angle of [200, 250, 300, 350, 40, 90]) {
    const rad = (angle * Math.PI) / 180;
    drawPixelLine(ctx, crownX, crownY, crownX + Math.cos(rad) * 5, crownY + Math.sin(rad) * 3.2, "#4f9a4a");
    drawPixelLine(ctx, crownX, crownY, crownX + Math.cos(rad) * 3.2, crownY + Math.sin(rad) * 2, "#6bb85f");
  }

  ctx.fillStyle = "#6b4a2f";
  fillPixelEllipse(ctx, crownX - 1, crownY + 1.5, 0.8, 0.8, "#6b4a2f");
  fillPixelEllipse(ctx, crownX + 1, crownY + 2, 0.8, 0.8, "#6b4a2f");
}

const DRAWERS: Record<DecorShape, (ctx: CanvasRenderingContext2D) => void> = {
  "moss-stone": drawMossStone,
  "colored-sand": drawColoredSand,
  "water-wheel": drawWaterWheel,
  campfire: drawCampfire,
  pond: drawPond,
  "coconut-tree": drawCoconutTree,
};

export function renderDecorCanvas(shape: DecorShape): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  DRAWERS[shape](ctx);
  return canvas;
}

export function createDecorTexture(shape: DecorShape): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(renderDecorCanvas(shape));
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
