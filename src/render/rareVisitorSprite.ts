import * as THREE from "three";
import type { VisitorKind } from "../easterEgg";

const GRID = 16;

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

/** 星靈：四角星身體（十字形疊菱形），淡紫底、亮黃星芒點綴、一對圓滾滾的大眼睛。 */
function drawStarSpirit(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#c9a2f0";
  ctx.fillRect(6, 2, 4, 12);
  ctx.fillRect(2, 6, 12, 4);
  fillPixelEllipse(ctx, 8, 8, 4, 4, "#c9a2f0");

  ctx.fillStyle = "#e8d4ff";
  ctx.fillRect(7, 2, 2, 3);
  ctx.fillRect(7, 11, 2, 3);
  ctx.fillRect(2, 7, 3, 2);
  ctx.fillRect(11, 7, 3, 2);

  ctx.fillStyle = "#2a1f3a";
  ctx.fillRect(6, 7, 2, 3);
  ctx.fillRect(9, 7, 2, 3);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(6, 7, 1, 1);
  ctx.fillRect(9, 7, 1, 1);
}

/** 雲朵精：一團蓬鬆白雲疊出來的身體，瞇瞇眼跟腮紅，感覺懶洋洋的。 */
function drawCloudPuff(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#eaf3fb";
  fillPixelEllipse(ctx, 8, 9, 6, 3.6, "#eaf3fb");
  fillPixelEllipse(ctx, 5, 7, 3, 2.6, "#eaf3fb");
  fillPixelEllipse(ctx, 10.5, 7, 3, 2.6, "#eaf3fb");
  fillPixelEllipse(ctx, 8, 6, 3.4, 2.8, "#eaf3fb");

  ctx.fillStyle = "#9fc2e0";
  fillPixelEllipse(ctx, 8, 10.5, 5, 1.6, "#9fc2e0");

  ctx.fillStyle = "#2a3a4a";
  ctx.fillRect(6, 8, 1, 1);
  ctx.fillRect(10, 8, 1, 1);
  ctx.fillStyle = "#f2a8c4";
  fillPixelEllipse(ctx, 5, 9.5, 1, 0.6, "#f2a8c4");
  fillPixelEllipse(ctx, 11, 9.5, 1, 0.6, "#f2a8c4");
}

/** 螢光魚：半透明青綠色的魚形，尾鰭飄逸、身上點著幾點發光斑點，像在空中游泳。 */
function drawGlowFish(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#3fd6c4";
  fillPixelEllipse(ctx, 7, 8, 4.5, 2.6, "#3fd6c4");

  ctx.fillStyle = "#2ab8a6";
  ctx.fillRect(11, 5, 1, 2); // 尾鰭上
  ctx.fillRect(11, 9, 1, 2); // 尾鰭下
  ctx.fillRect(12, 6.5, 2, 3);

  ctx.fillStyle = "#8ff0e2";
  ctx.fillRect(4, 5, 1, 2); // 背鰭
  ctx.fillRect(4, 10, 2, 1); // 腹鰭

  ctx.fillStyle = "#eafffb";
  ctx.fillRect(4, 7, 1, 1); // 眼睛
  ctx.fillRect(6, 6, 1, 1); // 發光斑點
  ctx.fillRect(8, 9, 1, 1);
}

/** 流光蝶：對稱的一對翅膀，用深淺交錯的桃紫色帶畫出鱗粉的漸層感，觸角纖細上翹。 */
function drawShimmerMoth(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#6b4a2f";
  ctx.fillRect(7, 5, 2, 7); // 身體

  const wingColors = ["#e88fc4", "#c96bd6", "#f5b8e0"];
  for (const side of [-1, 1]) {
    wingColors.forEach((color, i) => {
      fillPixelEllipse(ctx, 8 + side * (3 - i * 0.6), 5.5 + i * 1.6, 3.2 - i * 0.6, 2.2 - i * 0.3, color);
    });
  }

  ctx.fillStyle = "#3a2a1f";
  ctx.fillRect(6, 4, 1, 2); // 左觸角
  ctx.fillRect(9, 4, 1, 2); // 右觸角
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(7, 6, 1, 1);
  ctx.fillRect(8, 6, 1, 1);
}

const DRAWERS: Record<VisitorKind, (ctx: CanvasRenderingContext2D) => void> = {
  "star-spirit": drawStarSpirit,
  "cloud-puff": drawCloudPuff,
  "glow-fish": drawGlowFish,
  "shimmer-moth": drawShimmerMoth,
};

export function renderVisitorCanvas(kind: VisitorKind): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  DRAWERS[kind](ctx);
  return canvas;
}

export function createVisitorTexture(kind: VisitorKind): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(renderVisitorCanvas(kind));
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
