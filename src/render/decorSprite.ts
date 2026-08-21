import * as THREE from "three";
import type { DecorShape } from "../unlocks";

const GRID = 16;
// 陽傘、椰子樹使用者反應太粗糙/bulky——這兩種改用 2 倍解析度畫布，線條、條紋、葉片都能畫得更細，
// 縮放到場景裡的最終大小不變（decorScaleFor 的倍率沒變），純粹是畫布本身的取樣密度變高。
const GRID_OVERRIDE: Partial<Record<DecorShape, number>> = {
  "beach-umbrella": 32,
  "coconut-tree": 32,
};

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

/**
 * 在連續座標中心 cx 上，逐行畫出左右對稱的實心色塊（傘面剪影、樹幹漸縮這種形狀都適用）。
 * halfWidthAt(y) 回傳該列的半寬，用「取樣點 x+0.5 對 cx 的距離」判斷要不要填色，
 * 保證不管半寬是奇數還偶數、有沒有卡在 .5 邊界，畫出來的範圍一定以 cx 為軸完全對稱。
 * 之前踩過的坑：改成左右各自 Math.round(cx±halfWidth) 分開取整，JS 的 Math.round 對 .5
 * 一律進位，兩邊會進位到同一個方向，變成一邊多一格、一邊少一格，剪影就歪了。
 */
function fillSymmetricRows(
  ctx: CanvasRenderingContext2D,
  cx: number,
  minY: number,
  maxY: number,
  halfWidthAt: (y: number) => number,
  colorAt: (x: number, y: number) => string
): void {
  for (let y = minY; y <= maxY; y++) {
    const halfWidth = halfWidthAt(y);
    if (halfWidth <= 0) continue;
    const minX = Math.floor(cx - halfWidth);
    const maxX = Math.ceil(cx + halfWidth);
    for (let x = minX; x <= maxX; x++) {
      if (Math.abs(x + 0.5 - cx) > halfWidth) continue;
      ctx.fillStyle = colorAt(x, y);
      ctx.fillRect(x, y, 1, 1);
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
  // 重新設計：拿掉兩側像柵欄的蘆葦直線，水面本身加大填滿畫布，
  // 改用一片睡蓮葉＋幾圈漣漪讓水面有東西可看，不會太單調。
  fillPixelEllipse(ctx, 8, 10.5, 7.6, 4.3, "#3f7fae");
  fillPixelEllipse(ctx, 8, 10, 6.6, 3.5, "#5aa0cf");
  fillPixelEllipse(ctx, 5.5, 8.8, 2, 1, "#8fc7e8"); // 水面反光

  // 睡蓮葉：圓餅咬一角的經典剪影，浮在水面右側
  ctx.fillStyle = "#4f9a4a";
  fillPixelEllipse(ctx, 11.5, 11.5, 1.7, 1.1, "#4f9a4a");
  ctx.fillStyle = "#3f7fae";
  ctx.fillRect(12, 11, 1, 1);
  ctx.fillStyle = "#6bb85f";
  fillPixelEllipse(ctx, 11.2, 11.2, 0.6, 0.4, "#6bb85f"); // 葉片上的一點高光

  // 左側幾圈淡淡的漣漪
  ctx.fillStyle = "#8fc7e8";
  ctx.fillRect(3, 12, 2, 1);
  ctx.fillRect(2, 11, 1, 1);
  ctx.fillRect(4, 13, 1, 1);
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
  // 使用者反應原本太粗糙／bulky，這個造型用 2 倍解析度畫布（見 GRID_OVERRIDE）重畫，
  // 之後又陸續調過細度、葉片數量。這次再加幾個椰子樹題材常見的通用畫法慣例：
  // 樹幹改成帶弧度（不是筆直的）、疊更多道分節紋理、葉子分區塊用不同深淺的綠、
  // 底部加一叢草——這些都是這類題材普遍會用的元素，不是複製特定某張參考圖。
  const baseX = 16; // 樹幹底部固定在這裡，弧度只往上彎
  const trunkTopY = 12;
  const trunkBottomY = 30;
  const trunkBaseHalfWidth = 2.1;
  const trunkTopHalfWidth = 1.1;
  const trunkColor = "#b98a5e";
  const trunkShadeColor = "#96714a";
  const curveMax = 4; // 樹幹頂端往右偏移的最大量，底部維持不動

  // 樹幹彎度：用 t^1.5 讓靠近底部的地方幾乎筆直、越往上彎度越明顯，比線性彎曲更自然。
  const curveAt = (y: number): number => {
    const t = (trunkBottomY - y) / (trunkBottomY - trunkTopY);
    return curveMax * Math.pow(Math.max(0, Math.min(1, t)), 1.5);
  };

  // 逐行畫，每一行的中心點都跟著 curveAt(y) 偏移——fillSymmetricRows 本身仍保證
  // 「這一行」左右對稱，只是整段疊起來的中心線會彎，不是整棵樹歪一邊。
  for (let y = trunkTopY; y <= trunkBottomY; y++) {
    const t = (y - trunkTopY) / (trunkBottomY - trunkTopY);
    const halfWidth = trunkBaseHalfWidth - (trunkBaseHalfWidth - trunkTopHalfWidth) * t;
    fillSymmetricRows(ctx, baseX + curveAt(y), y, y, () => halfWidth, () => trunkColor);
  }
  // 分節紋理加密到 5 道（原本 3 道），一樣跟著彎度走
  for (const y of [14, 17.5, 21, 24.5, 28]) {
    const t = (y - trunkTopY) / (trunkBottomY - trunkTopY);
    const halfWidth = trunkBaseHalfWidth - (trunkBaseHalfWidth - trunkTopHalfWidth) * t;
    const ry = Math.round(y);
    fillSymmetricRows(ctx, baseX + curveAt(ry), ry, ry, () => halfWidth, () => trunkShadeColor);
  }

  const crownX = baseX + curveAt(trunkTopY);
  const crownY = trunkTopY;

  // 樹冠：左右鏡射對稱展開。葉子分成「內圈」跟「外圈」用不同深淺的綠色組合，
  // 不是每片都同一組配色，看起來比較有層次，也是這類題材常見的畫法。
  const innerGreens: [string, string] = ["#2e6b32", "#4f9a4a"];
  const outerGreens: [string, string] = ["#245a29", "#3f8a3f"];
  const frondPairs: { deltaDeg: number; length: number; droop: number; colors: [string, string] }[] = [
    { deltaDeg: 12, length: 9, droop: 0.8, colors: innerGreens },
    { deltaDeg: 35, length: 11.5, droop: 2.2, colors: innerGreens },
    { deltaDeg: 75, length: 10.2, droop: 3.4, colors: outerGreens },
    { deltaDeg: 115, length: 11.8, droop: 5, colors: outerGreens },
  ];
  for (const { deltaDeg, length, droop, colors } of frondPairs) {
    drawFrond(ctx, crownX, crownY, 270 - deltaDeg, length, droop, colors[0], colors[1]);
    drawFrond(ctx, crownX, crownY, 270 + deltaDeg, length, droop, colors[0], colors[1]);
  }
  drawFrond(ctx, crownX, crownY, 270, 9, 0.5, ...innerGreens); // 正上方中央短葉，本身即左右對稱

  // 底部草叢：幾撮短草圍在樹幹底部，讓椰子樹有「種在地上」的感覺，不是懸空立在草地上。
  const grassColors = ["#5f9e4a", "#7fbf5f"];
  const tuftOffsets = [-5, -3, 3, 5.5, 0.5];
  tuftOffsets.forEach((dx, i) => {
    const gx = baseX + dx;
    const gy = trunkBottomY + 1.5;
    drawPixelLine(ctx, gx, gy, gx - 0.8, gy - 2.4, grassColors[i % 2]);
    drawPixelLine(ctx, gx, gy, gx + 0.8, gy - 2.2, grassColors[(i + 1) % 2]);
  });

  // 椰子：兩顆對稱掛在樹冠正下方左右兩側，同色維持左右完全對稱
  fillPixelEllipse(ctx, crownX - 2, crownY + 4, 1.7, 1.5, "#96714a");
  fillPixelEllipse(ctx, crownX + 2, crownY + 4, 1.7, 1.5, "#96714a");
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
  // 使用者反應原本太粗糙／bulky、傘柱又對不準傘面中心，這裡用 2 倍解析度畫布
  // （見 GRID_OVERRIDE）加上 fillSymmetricRows 重畫：傘面剪影跟傘柱都用同一個連續座標
  // 中心 cx，傘柱寬度取偶數（2px）確保 x0=cx-1 一定是整數、精確置中，不會再有 0.5px 偏移。
  const cx = 16;
  const domeTopY = 5;
  const domeBottomY = 15;
  const rx = 13;
  const ry = domeBottomY - domeTopY;
  const stripeWidth = 2.6; // 條紋加密（原本 1.6，畫布放大 2 倍後用 2.6 維持相近的視覺密度、線條更細）
  const stripeColors = ["#e8556e", "#f5f0e6"];
  const stripeColorAt = (x: number) => stripeColors[Math.floor(Math.abs(x + 0.5 - cx) / stripeWidth) % 2];

  fillSymmetricRows(
    ctx,
    cx,
    domeTopY,
    domeBottomY,
    (y) => {
      const t = (y - domeTopY) / ry;
      return rx * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
    },
    stripeColorAt
  );

  // 傘緣一圈扇形滾邊，改用小橢圓堆疊（跟其他裝飾的圓潤細節同一種手法），比純方形像素點更細緻；
  // 用 fillPixelEllipse 本身的連續座標判斷，左右偏移量相同、顏色也對稱交錯，一定鏡射對稱。
  const toothSpacing = rx / 4;
  for (let k = 0; k <= 4; k++) {
    const offset = k * toothSpacing;
    const color = stripeColors[k % 2];
    fillPixelEllipse(ctx, cx + offset, domeBottomY + 1, 1.3, 1, color);
    if (k > 0) fillPixelEllipse(ctx, cx - offset, domeBottomY + 1, 1.3, 1, color);
  }

  // 傘尖與傘柱：兩者都用偶數寬度（2px）搭配整數起點 cx-1，連續座標中心精確落在 cx，
  // 保證跟傘面剪影（同一個 cx）完全對齊，不會再有 0.5px 偏移。
  const umbrellaGrid = GRID_OVERRIDE["beach-umbrella"] ?? 32;
  ctx.fillStyle = "#e8b25d";
  ctx.fillRect(cx - 1, domeTopY - 2, 2, 2); // 傘尖
  ctx.fillRect(cx - 1, domeBottomY, 2, umbrellaGrid - 2 - domeBottomY); // 傘柱
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
  const grid = GRID_OVERRIDE[shape] ?? GRID;
  const canvas = document.createElement("canvas");
  canvas.width = grid;
  canvas.height = grid;
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
