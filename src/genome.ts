// 元素傾向基因：向陽 / 喜濕 / 耐風 / 向陰，各 0..1 強度（非互斥類別，允許混合傾向）
export interface ElementTraits {
  sun: number;
  moisture: number;
  wind: number;
  shade: number;
}

export interface VisualTraits {
  hue: number; // 0..360
  size: number; // 0.6..1.4 縮放
  speed: number; // 0.5..1.5 移動速度倍率
  shapeSeed: number; // 決定莖高等細節的種子
}

/**
 * 外形基因：superformula 極座標公式參數，決定主體剪影輪廓。
 * r(θ) = (|cos(mθ/4)|^n2 + |sin(mθ/4)|^n3)^(-1/n1)，m=0 時恆為圓。
 * 手法參考 tsunu-terrarium（github.com/Tsun-u/tsunu-terrarium, MIT）的 genetics.js。
 */
export interface ShapeGenes {
  m: number;
  n1: number;
  n2: number;
  n3: number;
}

export interface Genome {
  elements: ElementTraits;
  shape: ShapeGenes;
  visual: VisualTraits;
  rare: boolean; // 是否帶有稀有變異（供 UI 顯示光暈等）
  generation: number;
}

// 四種外形原型錨點：圓 / 三角 / 方潤 / 菱角（方與菱同為 4 折對稱，靠 n 值區分圓潤/尖銳）
export const SHAPE_ANCHORS: ShapeGenes[] = [
  { m: 0, n1: 1, n2: 1, n3: 1 },
  { m: 3, n1: 4.5, n2: 10, n3: 10 },
  { m: 4, n1: 12, n2: 15, n3: 15 },
  { m: 4, n1: 1, n2: 1, n3: 1 },
];
const RARE_SHAPE_M_POOL = [5, 6, 7, 8, 12];

// 圖鑑分類：4 種外形原型 + 稀有變異獨立一類（稀有一律歸這類，不論它抽到哪種外形）
export type ShapeCategory = "circle" | "triangle" | "square" | "diamond" | "rare";
export const SHAPE_CATEGORY_ORDER: ShapeCategory[] = ["circle", "triangle", "square", "diamond", "rare"];
export const SHAPE_CATEGORY_LABELS: Record<ShapeCategory, string> = {
  circle: "圓形",
  triangle: "三角",
  square: "方形",
  diamond: "菱形",
  rare: "稀有變異",
};
const SHAPE_ANCHOR_CATEGORIES: ShapeCategory[] = ["circle", "triangle", "square", "diamond"];

/** 依外形基因跟 4 個原型錨點的距離，判斷這個個體的外形最接近圖鑑裡哪一類；稀有變異不看外形，直接歸類為 rare。 */
export function classifyShapeCategory(genome: Genome): ShapeCategory {
  if (genome.rare) return "rare";
  let bestIndex = 0;
  let bestDist = Infinity;
  SHAPE_ANCHORS.forEach((anchor, i) => {
    // m（摺數對稱）是外觀主要特徵，權重加倍；n1/n2/n3 值域較大（0.3..20），除以範圍後再比較
    const dm = (genome.shape.m - anchor.m) * 2;
    const dn1 = (genome.shape.n1 - anchor.n1) / 20;
    const dn2 = (genome.shape.n2 - anchor.n2) / 20;
    const dn3 = (genome.shape.n3 - anchor.n3) / 20;
    const dist = dm * dm + dn1 * dn1 + dn2 * dn2 + dn3 * dn3;
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  });
  return SHAPE_ANCHOR_CATEGORIES[bestIndex];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampRange = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function randomElementTraits(): ElementTraits {
  return {
    sun: Math.random(),
    moisture: Math.random(),
    wind: Math.random(),
    shade: Math.random(),
  };
}

function randomVisualTraits(): VisualTraits {
  return {
    hue: Math.random() * 360,
    size: 0.6 + Math.random() * 0.8,
    speed: 0.5 + Math.random(),
    shapeSeed: Math.floor(Math.random() * 1_000_000),
  };
}

/** 依 superformula 算出某個角度 θ 的邊界半徑（未正規化，需搭配 maxSuperformulaRadius 使用）。 */
export function superformulaRadius(shape: ShapeGenes, theta: number): number {
  if (shape.m === 0) return 1;
  const t = (shape.m * theta) / 4;
  const p = Math.pow(Math.abs(Math.cos(t)), shape.n2) + Math.pow(Math.abs(Math.sin(t)), shape.n3);
  return Math.pow(p, -1 / shape.n1);
}

/** 取樣一圈找最大半徑，用來把 superformulaRadius 的輸出正規化到 0..1。 */
export function maxSuperformulaRadius(shape: ShapeGenes, samples = 720): number {
  if (shape.m === 0) return 1;
  let max = 0;
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    const r = superformulaRadius(shape, theta);
    if (Number.isFinite(r) && r > max) max = r;
  }
  return max || 1;
}

function randomShapeGenes(): ShapeGenes {
  return { ...SHAPE_ANCHORS[Math.floor(Math.random() * SHAPE_ANCHORS.length)] };
}

export function createFounderGenome(anchorIndex?: number): Genome {
  const shape = anchorIndex === undefined ? randomShapeGenes() : { ...SHAPE_ANCHORS[anchorIndex % SHAPE_ANCHORS.length] };
  return {
    elements: randomElementTraits(),
    shape,
    visual: randomVisualTraits(),
    rare: false,
    generation: 0,
  };
}

/**
 * 相容度模式：屬性互補（差異越大，相容度越高）。
 * 回傳 0..1，供 simulation 換算成繁殖機率。
 */
export function compatibility(a: Genome, b: Genome): number {
  const ea = a.elements;
  const eb = b.elements;
  const diff =
    Math.abs(ea.sun - eb.sun) +
    Math.abs(ea.moisture - eb.moisture) +
    Math.abs(ea.wind - eb.wind) +
    Math.abs(ea.shade - eb.shade);
  return clamp01(diff / 4);
}

const MUTATION_JITTER_CHANCE = 0.08; // 單一基因值有機率小幅漂移
const MUTATION_JITTER_AMOUNT = 0.15;
const RARE_MUTATION_CHANCE = 0.02; // 全新變異機率

/** 不夾在 0..1 的版本，供外形基因（m/n1/n2/n3 各有自己的合理範圍）使用，呼叫端自行 clampRange。 */
function inheritRawValue(a: number, b: number, noise: number): number {
  const t = Math.random();
  const blended = a + (b - a) * t;
  return blended + (Math.random() * 2 - 1) * noise;
}

function inheritValue(a: number, b: number): number {
  // 隨機取一方偏移插值，模擬顯性/隱性混合而非單純平均
  const t = Math.random();
  const blended = a + (b - a) * t;
  if (Math.random() < MUTATION_JITTER_CHANCE) {
    return clamp01(blended + (Math.random() * 2 - 1) * MUTATION_JITTER_AMOUNT);
  }
  return clamp01(blended);
}

/** 外形基因遺傳：m 用四捨五入的偏親插值，n1/n2/n3 各自獨立插值＋噪聲，clamp 在合理範圍避免退化。 */
function inheritShapeGenes(a: ShapeGenes, b: ShapeGenes): ShapeGenes {
  const m = clampRange(Math.round(inheritRawValue(a.m, b.m, 0.3)), 0, 12);
  const n1 = clampRange(inheritRawValue(a.n1, b.n1, 0.5), 0.3, 20);
  const n2 = clampRange(inheritRawValue(a.n2, b.n2, 0.8), 0.3, 20);
  const n3 = clampRange(inheritRawValue(a.n3, b.n3, 0.8), 0.3, 20);
  const jumped = Math.random() < MUTATION_JITTER_CHANCE ? RARE_SHAPE_M_POOL[Math.floor(Math.random() * RARE_SHAPE_M_POOL.length)] : m;
  return { m: clampRange(jumped, 0, 12), n1, n2, n3 };
}

export function breed(parentA: Genome, parentB: Genome): Genome {
  const isRare = Math.random() < RARE_MUTATION_CHANCE;

  if (isRare) {
    return {
      elements: randomElementTraits(),
      shape: randomShapeGenes(),
      visual: {
        ...randomVisualTraits(),
        hue: Math.random() * 360,
      },
      rare: true,
      generation: Math.max(parentA.generation, parentB.generation) + 1,
    };
  }

  const elements: ElementTraits = {
    sun: inheritValue(parentA.elements.sun, parentB.elements.sun),
    moisture: inheritValue(parentA.elements.moisture, parentB.elements.moisture),
    wind: inheritValue(parentA.elements.wind, parentB.elements.wind),
    shade: inheritValue(parentA.elements.shade, parentB.elements.shade),
  };

  const shape = inheritShapeGenes(parentA.shape, parentB.shape);

  // 顏色不繼承父母：族群不大，「繼承單一親代 hue」會讓顏色隨世代遺傳漂變、
  // 越來越集中到少數色系（見使用者反饋：曾經一半以上變成同一色系）。
  // 每隻小孩獨立均勻隨機 0-360，長期下來顏色分布自然平均，不會被單一色系佔滿。
  const visual: VisualTraits = {
    hue: Math.random() * 360,
    size: clampRange((parentA.visual.size + parentB.visual.size) / 2, 0.6, 1.4),
    speed: (parentA.visual.speed + parentB.visual.speed) / 2,
    shapeSeed: Math.random() < 0.5 ? parentA.visual.shapeSeed : parentB.visual.shapeSeed,
  };

  return {
    elements,
    shape,
    visual,
    rare: false,
    generation: Math.max(parentA.generation, parentB.generation) + 1,
  };
}
