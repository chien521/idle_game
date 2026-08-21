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

/** 畫一片下垂的羽狀葉：沿著離開樹冠中心的方向前進，同時逐漸往下垂（droop），
 *  半徑從葉根到葉尖遞減，用一串疊起來的橢圓堆出「有寬度、會變窄」的葉片剪影，
 *  不是只有 1px 寬的細線——這樣在 16x16 這麼小的畫布上才看得出是葉子而不是輻條。 */
function drawFrond(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  angleDeg: number,
  length: number,
  droop: number,
  baseColor: string,
  tipColor: string
): void {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const steps = Math.ceil(length * 2.5);
  for (let s = steps; s >= 0; s--) {
    const t = s / steps;
    const x = originX + dx * length * t;
    const y = originY + dy * length * t + droop * t * t; // 離樹冠越遠垂得越低，形成弧線
    const r = 0.35 + 0.95 * (1 - t); // 葉根寬、葉尖窄
    fillPixelEllipse(ctx, x, y, r, r * 0.75, t > 0.65 ? tipColor : baseColor);
  }
}

function drawCoconutTree(ctx: CanvasRenderingContext2D): void {
  // 樹幹：直立不彎，全程固定寬度、左右邊緣都是直線，不做粗細漸變——
  // 之前底粗頂細的漸縮是只縮右邊（左邊固定），中心線會跟著偏移，看起來像上端歪一邊。
  ctx.fillStyle = "#8a6440";
  ctx.fillRect(7, 6, 2, 9);

  ctx.fillStyle = "#6b4a2f";
  ctx.fillRect(7, 8, 2, 1);
  ctx.fillRect(7, 11, 2, 1);
  ctx.fillRect(7, 13, 2, 1);

  const crownX = 8; // 樹幹寬度是 x=7..9，中心線在 8，樹冠要對齊這個中心才不會偏一邊
  const crownY = 6;

  // 樹冠：7 片葉子呈放射狀展開並自然下垂，涵蓋上半圈到左右兩側，中間留出頂端縫隙，
  // 整體看起來像一叢從樹幹頂端炸開的羽狀葉，而不是對稱的十字。
  const fronds: { angle: number; length: number; droop: number }[] = [
    { angle: 175, length: 6.2, droop: 2.6 },
    { angle: 205, length: 5.6, droop: 1.6 },
    { angle: 235, length: 4.8, droop: 0.6 },
    { angle: 268, length: 4.2, droop: -0.4 },
    { angle: 300, length: 4.8, droop: -0.2 },
    { angle: 330, length: 5.6, droop: 0.8 },
    { angle: 5, length: 6, droop: 2.2 },
  ];
  for (const { angle, length, droop } of fronds) {
    drawFrond(ctx, crownX, crownY, angle, length, droop, "#2e6b32", "#4f9a4a");
  }

  // 椰子：三顆聚在樹冠正下方，深淺兩色區分明暗面
  fillPixelEllipse(ctx, crownX - 1.2, crownY + 1.6, 0.9, 0.8, "#6b4a2f");
  fillPixelEllipse(ctx, crownX + 0.6, crownY + 2.1, 0.9, 0.8, "#5a3b25");
  fillPixelEllipse(ctx, crownX - 0.4, crownY + 2.6, 0.9, 0.8, "#6b4a2f");
}

function drawStoneLantern(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#8a8a86";
  ctx.fillRect(7, 12, 2, 3); // 基座
  ctx.fillRect(6, 9, 4, 1); // 燈身底
  ctx.fillRect(7, 6, 2, 3); // 燈身
  ctx.fillRect(5, 5, 6, 1); // 燈簷
  fillPixelEllipse(ctx, 8, 3.5, 1.6, 1, "#8a8a86"); // 頂蓋

  ctx.fillStyle = "#f5c542";
  ctx.fillRect(7, 7, 2, 2); // 燈火
}

function drawGardenGazebo(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#8a6440";
  for (const x of [3, 6, 9, 12]) ctx.fillRect(x, 6, 1, 8); // 四根柱子

  ctx.fillStyle = "#c94a2b";
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(2 + i, 5 - Math.abs(i - 2.5) * 0.6, 12 - i * 2, 1); // 三角屋頂堆疊
  }
  ctx.fillStyle = "#e8823a";
  ctx.fillRect(2, 3, 12, 1);

  ctx.fillStyle = "#6bb85f";
  fillPixelEllipse(ctx, 4, 13, 1.6, 0.9, "#6bb85f");
  fillPixelEllipse(ctx, 12, 13, 1.6, 0.9, "#6bb85f");
}

function drawWishingFountain(ctx: CanvasRenderingContext2D): void {
  fillPixelEllipse(ctx, 8, 13, 6.5, 2.6, "#8a8a86"); // 底座外圈
  fillPixelEllipse(ctx, 8, 12.6, 5.2, 2.1, "#5aa0cf"); // 水面

  ctx.fillStyle = "#8a8a86";
  ctx.fillRect(7, 6, 2, 6); // 中央柱

  ctx.fillStyle = "#8fc7e8";
  drawPixelLine(ctx, 8, 6, 5, 10, "#8fc7e8");
  drawPixelLine(ctx, 8, 6, 11, 10, "#8fc7e8");
  drawPixelLine(ctx, 8, 5, 8, 9, "#c7e6f7");
}

function drawAncientTree(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#6b4a2f";
  ctx.fillRect(6, 8, 4, 7); // 粗壯樹幹
  ctx.fillRect(4, 13, 2, 2); // 板根
  ctx.fillRect(10, 13, 2, 2);

  ctx.fillStyle = "#3f6b3a";
  fillPixelEllipse(ctx, 8, 4, 7, 4.5, "#3f6b3a");
  ctx.fillStyle = "#5f9e4a";
  fillPixelEllipse(ctx, 6, 3, 4, 2.6, "#5f9e4a");
  fillPixelEllipse(ctx, 11, 4.5, 3.2, 2.2, "#5f9e4a");
}

function drawCherryBlossom(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#8a6440";
  fillPixelEllipse(ctx, 8, 13, 3.2, 1.6, "#8a6440"); // 花盆
  ctx.fillRect(7, 8, 2, 6); // 枝幹

  ctx.fillStyle = "#f2a8c4";
  for (const [dx, dy, r] of [
    [5, 6, 2.4],
    [8, 4.5, 2.8],
    [11, 6.5, 2.2],
  ] as const) {
    fillPixelEllipse(ctx, dx, dy, r, r * 0.8, "#f2a8c4");
  }
  ctx.fillStyle = "#fce0ec";
  fillPixelEllipse(ctx, 8, 5, 1.4, 1, "#fce0ec");
}

function drawBeachUmbrella(ctx: CanvasRenderingContext2D): void {
  // 傘面：實心圓頂帳篷剪影（頂端窄、底邊寬），直條紋交錯紅白配色模擬傘骨分色，
  // 取代原本用細線輻射狀畫出來、看起來像一面旗子的版本。
  const cx = 8;
  const domeTopY = 2;
  const domeBottomY = 7;
  const rx = 6.5;
  const ry = domeBottomY - domeTopY;
  const stripeWidth = 1.6;
  const stripeColors = ["#e8556e", "#f5f0e6"];

  for (let y = domeTopY; y <= domeBottomY; y++) {
    const t = (y - domeTopY) / ry;
    const halfWidth = rx * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
    const minX = Math.round(cx - halfWidth);
    const maxX = Math.round(cx + halfWidth);
    for (let x = minX; x <= maxX; x++) {
      const segment = Math.floor((x - (cx - rx)) / stripeWidth);
      ctx.fillStyle = stripeColors[Math.abs(segment) % 2];
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // 傘緣一圈小鋸齒飄邊，呼應傘布常見的扇形滾邊
  for (let x = Math.round(cx - rx); x <= Math.round(cx + rx); x += 2) {
    const segment = Math.floor((x - (cx - rx)) / stripeWidth);
    ctx.fillStyle = stripeColors[Math.abs(segment) % 2];
    ctx.fillRect(x, domeBottomY + 1, 1, 1);
  }

  // 傘尖與傘柱
  ctx.fillStyle = "#e8b25d";
  ctx.fillRect(cx, domeTopY - 1, 1, 1);
  ctx.fillRect(cx - 1, domeBottomY, 2, 15 - domeBottomY);
}

function drawPumpkinLantern(ctx: CanvasRenderingContext2D): void {
  fillPixelEllipse(ctx, 8, 11, 4.6, 3.6, "#e8823a"); // 統一橘色，不在眼睛/嘴巴中間畫分隔線
  ctx.fillStyle = "#5f9e4a";
  ctx.fillRect(7, 6.5, 2, 2); // 蒂頭

  ctx.fillStyle = "#f5c542";
  ctx.fillRect(6, 10, 1, 1); // 左眼
  ctx.fillRect(9, 10, 1, 1); // 右眼
  ctx.fillRect(6, 12, 4, 1); // 嘴
}

function drawSnowman(ctx: CanvasRenderingContext2D): void {
  fillPixelEllipse(ctx, 8, 12.5, 3.4, 2.8, "#f2f6fa"); // 下身
  fillPixelEllipse(ctx, 8, 7.5, 2.4, 2, "#f2f6fa"); // 上身

  ctx.fillStyle = "#e8823a";
  ctx.fillRect(8, 7, 2, 1); // 紅蘿蔔鼻子

  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(6, 6, 1, 1); // 左眼
  ctx.fillRect(9, 6, 1, 1); // 右眼
  ctx.fillRect(6, 9, 1, 1); // 鈕扣
  ctx.fillRect(9, 9, 1, 1);

  ctx.fillStyle = "#6b4a2f";
  ctx.fillRect(4, 5, 8, 1); // 帽緣
  ctx.fillRect(6, 2, 4, 3); // 帽身
}

const DRAWERS: Record<DecorShape, (ctx: CanvasRenderingContext2D) => void> = {
  "moss-stone": drawMossStone,
  "colored-sand": drawColoredSand,
  "water-wheel": drawWaterWheel,
  campfire: drawCampfire,
  pond: drawPond,
  "coconut-tree": drawCoconutTree,
  "stone-lantern": drawStoneLantern,
  "garden-gazebo": drawGardenGazebo,
  "wishing-fountain": drawWishingFountain,
  "ancient-tree": drawAncientTree,
  "cherry-blossom": drawCherryBlossom,
  "beach-umbrella": drawBeachUmbrella,
  "pumpkin-lantern": drawPumpkinLantern,
  snowman: drawSnowman,
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
