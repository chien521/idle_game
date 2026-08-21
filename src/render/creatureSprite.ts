import * as THREE from "three";
import { maxSuperformulaRadius, superformulaRadius, type Genome } from "../genome";
import type { VisitorKind } from "../easterEgg";

const GRID = 16;

// 訪客血脈的標記色，四個角落點幾個像素當標記，跟 rare 的外框光暈共存不互相遮蔽（見下方 genome.visitorLineage）。
// 顏色比照 render/rareVisitorSprite.ts 各訪客的主色調，讓玩家能靠顏色聯想到是哪一種訪客的血脈。
const VISITOR_LINEAGE_COLOR: Record<VisitorKind, string> = {
  "star-spirit": "#c9a2f0",
  "cloud-puff": "#eaf3fb",
  "glow-fish": "#3fd6c4",
  "shimmer-moth": "#e88fc4",
};

/**
 * 依基因程序化畫出一個像素風小生物：莖 + superformula 剪影主體 + 簡單雙眼。
 * 剪影輪廓改用 superformula 極座標公式（手法參考 tsunu-terrarium，
 * github.com/Tsun-u/tsunu-terrarium, MIT License 的 genetics.js），
 * 比舊版「隨機像素簇葉冠」平滑許多；雙眼讓它更有生物感，即使本質仍是植物。
 *
 * 這是 Phase 1 的可運作占位美術；Phase 2 依設計文件 §5 改為
 * 組合固定部件庫（疊圖 + 調色，規劃見開發計畫「四、部件庫美術規劃」：
 * 莖 4 × 葉冠 8 × 花苞 4 × 發光 3 種，固定 32×32 畫布與光源角度），
 * 此函式的輸出介面（回傳 CanvasTexture）保持不變即可平滑替換。
 *
 * 已知缺口：設計文件提到的「稀有變異即時生成、全服共享新資產」與目前
 * no-backend 純本機存檔架構互相矛盾——沒有伺服器就沒有「全服」可共享。
 * 這裡先只做「本機稀有」（見 Genome.rare），全服共享機制待使用者決定
 * 要放棄「全服共享」還是之後補一個輕量後端/靜態資產庫再實作。
 */
export function renderCreatureCanvas(genome: Genome): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  const hue = genome.visual.hue;
  const { sun, moisture, shade } = genome.elements;

  const lightness = 40 + sun * 15 - shade * 10;
  const saturation = 55 + moisture * 25;
  const bodyColor = `hsl(${(hue + 20) % 360}, ${saturation}%, ${Math.max(25, lightness)}%)`;
  const shadeColor = `hsl(${(hue + 20) % 360}, ${saturation}%, ${Math.max(15, lightness * 0.8)}%)`;

  // 主體：只留 superformula 剪影本體（不畫莖/腳），四周留 margin 給輪廓框用，避免畫出畫布外
  const margin = 2;
  const bodyTop = margin;
  const bodyBottom = GRID - margin;
  const regionHeight = bodyBottom - bodyTop;
  const cx = (GRID - 1) / 2;
  const cy = bodyTop + regionHeight / 2;
  const pixelRadius = Math.max(2, Math.min(regionHeight, GRID - margin * 2) / 2 - 0.5);
  const maxR = maxSuperformulaRadius(genome.shape);

  const filled = new Uint8Array(GRID * GRID);
  const boxMin = Math.max(0, Math.floor(cx - pixelRadius - 1));
  const boxMax = Math.min(GRID - 1, Math.ceil(cx + pixelRadius + 1));
  const boxTop = Math.max(0, Math.floor(cy - pixelRadius - 1));
  const boxBottom = Math.min(GRID - 1, Math.ceil(cy + pixelRadius + 1));

  for (let y = boxTop; y <= boxBottom; y++) {
    for (let x = boxMin; x <= boxMax; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const theta = Math.atan2(dy, dx);
      const boundary = (superformulaRadius(genome.shape, theta) / maxR) * pixelRadius;
      if (dist > boundary) continue;

      filled[y * GRID + x] = 1;
      const shaded = dy > pixelRadius * 0.3;
      ctx.fillStyle = shaded ? shadeColor : bodyColor;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // 輪廓框：黑或白，依身體亮度擇一（身體偏亮用黑框、偏暗用白框），確保每隻個體的外框都跟身體有清楚對比
  const isFilled = (x: number, y: number) => x >= 0 && x < GRID && y >= 0 && y < GRID && filled[y * GRID + x] === 1;
  const outlineColor = lightness > 50 ? "#141414" : "#f5f5f5";
  ctx.fillStyle = outlineColor;
  const outlinePixels = new Set<number>();
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!isFilled(x, y)) continue;
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID || isFilled(nx, ny)) continue;
        outlinePixels.add(ny * GRID + nx);
      }
    }
  }
  for (const idx of outlinePixels) {
    ctx.fillRect(idx % GRID, Math.floor(idx / GRID), 1, 1);
  }

  // 雙眼：中上位置對稱黑點；固定偏移量若落在剪影外（扁形狀），逐步內縮直到落在已填色像素上
  const eyeY = Math.round(cy - pixelRadius * 0.3);
  const baseDx = Math.max(1, Math.round(pixelRadius * 0.45));
  for (const sign of [-1, 1] as const) {
    let dx = baseDx;
    while (dx > 0 && !isFilled(Math.round(cx + sign * dx), eyeY)) dx--;
    const ex = Math.round(cx + sign * dx);
    ctx.fillStyle = "#0c0c0c";
    ctx.fillRect(ex, eyeY, 1, 1);
  }

  // 稀有變異：外圍加一圈淡光暈標記
  if (genome.rare) {
    ctx.strokeStyle = `hsla(${(hue + 180) % 360}, 90%, 70%, 0.9)`;
    ctx.lineWidth = 0.6;
    ctx.strokeRect(1, 1, GRID - 2, GRID - 2);
  }

  // 訪客血脈：四個角落各點一顆訪客專屬色的小光點，跟 rare 的外框光暈是兩種獨立標記、可以同時出現。
  if (genome.visitorLineage) {
    ctx.fillStyle = VISITOR_LINEAGE_COLOR[genome.visitorLineage];
    for (const [cx2, cy2] of [
      [0, 0],
      [GRID - 1, 0],
      [0, GRID - 1],
      [GRID - 1, GRID - 1],
    ] as const) {
      ctx.fillRect(cx2, cy2, 1, 1);
    }
  }

  return canvas;
}

export function createCreatureTexture(genome: Genome): THREE.CanvasTexture {
  const canvas = renderCreatureCanvas(genome);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
