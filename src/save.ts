import { classifyShapeCategory, SHAPE_ANCHORS, type Genome } from "./genome";
import type { Creature } from "./creature";
import { Simulation, DEFAULT_CONFIG, type DiscoveredCreature } from "./simulation";
import { generateCreatureName } from "./names";
import { makeDecorPlacementId, LEGACY_PLANTED_AT, type DecorPlacement } from "./decor";
import { favoriteDecorShape } from "./personality";
import { VISITOR_KINDS, type VisitorKind } from "./easterEgg";

const STORAGE_KEY = "pixel-terrarium-save-v1";
const MAX_OFFLINE_GAME_SECONDS = 8 * 60 * 60; // 離線最多結算 8 小時，避免無上限運算
const OFFLINE_STEP_SECONDS = 8; // 離線結算的步進顆粒度
const MAX_OFFLINE_STEPS = 4000; // 保護：避免極端情況下卡住載入

interface SerializedCreature {
  id: string;
  name?: string; // 舊存檔（改名功能推出前）沒有這欄，載入時補一個程序生成的名字
  genome: Genome;
  x: number;
  y: number;
  bornAt: number;
  lastBredAt: number;
  parentIds?: [string, string] | null; // 舊存檔（家庭關係功能推出前）沒有這欄，載入時當成始祖處理
  partnerId?: string | null; // 舊存檔（一夫一妻功能推出前）沒有這欄，載入時當成單身處理
}

export interface SaveData {
  version: 1;
  savedAtRealMs: number;
  gameTime: number;
  creatures: SerializedCreature[];
  unlockedIds: string[];
  placements: DecorPlacement[];
  totalBirths?: number;
  seenRareCreature?: boolean;
  seenSpectrum?: { sun: boolean; moisture: boolean; wind: boolean; shade: boolean };
  seenRainbow?: boolean;
  seenMeteorShower?: boolean;
  seenEasterEgg?: boolean; // 舊存檔（訪客只有一種造型時）的旗標，見 deserializeIntoSimulation 的遷移邏輯
  seenVisitorKinds?: string[];
  discoveredCreatures?: DiscoveredCreature[];
  interactionBonusSeconds?: number;
  lastBirthAt?: number;
}

export function serialize(
  sim: Simulation,
  unlockedIds: ReadonlySet<string>,
  placements: readonly DecorPlacement[]
): SaveData {
  return {
    version: 1,
    savedAtRealMs: Date.now(),
    gameTime: sim.time,
    creatures: sim.creatures.map((c) => ({
      id: c.id,
      name: c.name,
      genome: c.genome,
      x: c.x,
      y: c.y,
      bornAt: c.bornAt,
      lastBredAt: c.lastBredAt,
      parentIds: c.parentIds,
      partnerId: c.partnerId,
    })),
    unlockedIds: [...unlockedIds],
    placements: [...placements],
    totalBirths: sim.totalBirths,
    seenRareCreature: sim.seenRareCreature,
    seenSpectrum: { ...sim.seenSpectrum },
    seenRainbow: sim.seenRainbow,
    seenMeteorShower: sim.seenMeteorShower,
    seenVisitorKinds: [...sim.seenVisitorKinds],
    discoveredCreatures: sim.discoveredCreatures.map((d) => ({ ...d })),
    interactionBonusSeconds: sim.interactionBonusSeconds,
    lastBirthAt: sim.lastBirthAt,
  };
}

export function saveGame(sim: Simulation, unlockedIds: ReadonlySet<string>, placements: readonly DecorPlacement[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(sim, unlockedIds, placements)));
  } catch (err) {
    console.warn("存檔失敗", err);
  }
}

/** 清掉存檔，供「重新開始」按鈕用；呼叫端自己負責重新整理頁面讓遊戲重新跑一次初始化。 */
export function clearSaveData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn("清除存檔失敗", err);
  }
}

/** 粗略檢查 JSON 內容長得像一份存檔（版本號＋幾個必要陣列欄位），擋掉使用者選錯檔案的情況；
 *  細部缺欄位（例如很舊版本沒有的功能）交給 deserializeIntoSimulation 既有的相容遷移邏輯處理，
 *  這裡不用重複做，只要形狀對了就放行。 */
function isValidSaveData(data: unknown): data is SaveData {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<SaveData>;
  return d.version === 1 && typeof d.gameTime === "number" && Array.isArray(d.creatures) && Array.isArray(d.unlockedIds) && Array.isArray(d.placements);
}

/** 把匯出過的存檔 JSON 文字寫回 localStorage，供「匯入存檔」按鈕用。呼叫端拿到 true 之後
 *  自行重新整理頁面，讓 bootstrapSimulation 用這份剛寫入的存檔重新初始化（跟 clearSaveData()
 *  之後靠重新整理生效的手法一致，不用另外提供「即時套用」的路徑）。 */
export function importSaveFromJson(text: string): boolean {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.warn("匯入存檔失敗：JSON 格式錯誤", err);
    return false;
  }
  if (!isValidSaveData(data)) {
    console.warn("匯入存檔失敗：檔案內容不像有效的存檔");
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch (err) {
    console.warn("匯入存檔失敗", err);
    return false;
  }
  return true;
}

export function readSaveData(): SaveData | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveData;
  } catch (err) {
    console.warn("讀取存檔失敗", err);
    return null;
  }
}

export function readUnlockedIds(data: SaveData): Set<string> {
  return new Set(data.unlockedIds ?? []);
}

/** 舊存檔補齊後來才加入的欄位：id（每種裝飾只能擺一個的版本沒有）、plantedAt（成長類裝飾推出前沒有，見 LEGACY_PLANTED_AT）。 */
export function readPlacements(data: SaveData): DecorPlacement[] {
  return (data.placements ?? []).map((p) => ({
    ...p,
    id: p.id ?? makeDecorPlacementId(),
    plantedAt: p.plantedAt ?? LEGACY_PLANTED_AT,
  }));
}

/** 補齊舊存檔缺少的 Genome 欄位（外形基因是後來才加入的），避免載入舊存檔時 renderer 存取 undefined 炸掉。 */
function migrateGenome(genome: Genome): Genome {
  if (genome.shape) return genome;
  return { ...genome, shape: { ...SHAPE_ANCHORS[0] } };
}

export function deserializeIntoSimulation(data: SaveData): Simulation {
  const sim = new Simulation(DEFAULT_CONFIG);
  sim.time = data.gameTime;
  sim.interactionBonusSeconds = data.interactionBonusSeconds ?? 0;
  sim.lastBirthAt = data.lastBirthAt ?? -Infinity;
  sim.creatures = data.creatures.map((c): Creature => {
    const genome = migrateGenome(c.genome);
    return {
      id: c.id,
      name: c.name ?? generateCreatureName(c.id),
      genome,
      x: c.x,
      y: c.y,
      vx: 0,
      vy: 0,
      bornAt: c.bornAt,
      lastBredAt: c.lastBredAt,
      wanderDirX: 0,
      wanderDirY: 0,
      activity: "wander",
      activityUntil: data.gameTime,
      activityTargetId: null,
      lastPettedAt: -Infinity,
      parentIds: c.parentIds ?? null,
      partnerId: c.partnerId ?? null,
      favoriteDecor: favoriteDecorShape(genome), // 純衍生值，不用存檔欄位，載入時直接重算（見 personality.ts）
    };
  });

  // 保底：伴侶關係必須是「雙方互指對方」才有效，否則當成單身處理——避免存檔損毀或
  // 手動改檔造成兩隻互不承認彼此是伴侶、卻誰也配不到新對象的卡死狀態。
  const byId = new Map(sim.creatures.map((c) => [c.id, c]));
  for (const c of sim.creatures) {
    if (!c.partnerId) continue;
    const partner = byId.get(c.partnerId);
    if (!partner || partner.partnerId !== c.id) c.partnerId = null;
  }

  // 舊存檔（在「元老退場」機制推出前）沒有這些累積紀錄欄位；totalBirths 只影響離線結算摘要文字，
  // 缺欄位就從 0 起算即可（下次離線結算的「新生命」數字會正確，只有這次載入前的歷史數字沒補上，無傷大雅）。
  sim.totalBirths = data.totalBirths ?? 0;
  sim.seenRainbow = data.seenRainbow ?? false;
  sim.seenMeteorShower = data.seenMeteorShower ?? false;
  if (data.seenVisitorKinds) {
    sim.seenVisitorKinds = new Set(data.seenVisitorKinds.filter((k): k is VisitorKind => VISITOR_KINDS.includes(k as VisitorKind)));
  } else if (data.seenEasterEgg) {
    // 舊存檔（多種訪客造型推出前）只有單一布林值，那時候訪客只有「星靈」一種造型，直接算它已被找到過。
    sim.seenVisitorKinds = new Set(["star-spirit"]);
  }
  if (data.seenRareCreature !== undefined && data.seenSpectrum) {
    sim.seenRareCreature = data.seenRareCreature;
    sim.seenSpectrum = { ...data.seenSpectrum };
  } else {
    for (const c of sim.creatures) {
      if (c.genome.rare) sim.seenRareCreature = true;
      const e = c.genome.elements;
      if (e.sun >= 0.8) sim.seenSpectrum.sun = true;
      if (e.moisture >= 0.8) sim.seenSpectrum.moisture = true;
      if (e.wind >= 0.8) sim.seenSpectrum.wind = true;
      if (e.shade >= 0.8) sim.seenSpectrum.shade = true;
    }
  }

  if (data.discoveredCreatures) {
    sim.discoveredCreatures = data.discoveredCreatures.map((d) => ({
      ...d,
      genome: migrateGenome(d.genome),
      parentIds: d.parentIds ?? null, // 舊存檔（家庭關係功能推出前）沒有這欄
    }));
  } else {
    // 舊存檔（在「歷來出現過的都放進圖鑑」這個功能推出前）沒有這份歷史紀錄，
    // 只能用目前還存活的族群回推一次（退場、消失的個體補不回來，無傷大雅）。
    sim.discoveredCreatures = sim.creatures.map((c) => ({
      id: c.id,
      name: c.name,
      genome: c.genome,
      tier: classifyShapeCategory(c.genome),
      bornAt: c.bornAt,
      parentIds: c.parentIds,
    }));
  }

  return sim;
}

/** 依真實經過時間，以較粗顆粒度分段推進模擬，模擬離線結算。回傳實際結算的遊戲秒數。 */
export function applyOfflineProgress(sim: Simulation, elapsedRealMs: number): number {
  const elapsedSeconds = Math.max(0, elapsedRealMs / 1000);
  const cappedSeconds = Math.min(elapsedSeconds, MAX_OFFLINE_GAME_SECONDS);
  const steps = Math.min(Math.ceil(cappedSeconds / OFFLINE_STEP_SECONDS), MAX_OFFLINE_STEPS);

  let remaining = cappedSeconds;
  for (let i = 0; i < steps && remaining > 0; i++) {
    const dt = Math.min(OFFLINE_STEP_SECONDS, remaining);
    sim.update(dt);
    remaining -= dt;
  }
  return cappedSeconds;
}
