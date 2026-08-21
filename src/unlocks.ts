import type { Simulation } from "./simulation";
import { seasonForTime, type Season } from "./season";
import { VISITOR_KINDS } from "./easterEgg";

export type UnlockType = "decor" | "codex";
export type DecorShape =
  | "moss-stone"
  | "colored-sand"
  | "water-wheel"
  | "campfire"
  | "pond"
  | "coconut-tree"
  | "stone-lantern"
  | "garden-gazebo"
  | "wishing-fountain"
  | "ancient-tree"
  | "cherry-blossom"
  | "beach-umbrella"
  | "pumpkin-lantern"
  | "snowman";

export interface UnlockDef {
  id: string;
  label: string;
  type: UnlockType;
  description: string;
  /** 非競爭性指標：陪伴天數 / 收集完整度，不用分數或戰力判斷。 */
  isMet: (sim: Simulation) => boolean;
  /** 給商店面板顯示進度用的文字，例如「3.2 / 7 天」。沒有意義的（如收集類）就不提供。 */
  progressLabel?: (sim: Simulation) => string;
  /** 有值代表這是可以實際放進生態瓶的裝飾物；決定場景要畫哪種簡易造型。 */
  decorShape?: DecorShape;
}

function daysProgressLabel(target: number): (sim: Simulation) => string {
  return (sim) => `${Math.min(companionDays(sim), target).toFixed(1)} / ${target} 天`;
}

const SEASON_UNLOCK_LABELS: Record<Season, string> = { spring: "春天", summer: "夏天", autumn: "秋天", winter: "冬天" };

/** 季節限定裝飾的進度文字：陪伴天數之外，另外標出「現在正是/需等到」該季節——
 *  真正卡進度的通常是季節有沒有輪到，不是陪伴天數（門檻本來就設得很低）。 */
function seasonalProgressLabel(target: number, season: Season): (sim: Simulation) => string {
  return (sim) => {
    const dayPart = `${Math.min(companionDays(sim), target).toFixed(1)} / ${target} 天`;
    const seasonLabel = SEASON_UNLOCK_LABELS[season];
    const seasonPart = seasonForTime(sim.time) === season ? `現在正是${seasonLabel}` : `需等到${seasonLabel}`;
    return `${dayPart}　·　${seasonPart}`;
  };
}

/** 陪伴天數＝真實流逝的遊戲時間 + 摸摸/餵食累積的額外「陪伴天數」秒數（見 simulation.ts 的 interactionBonusSeconds）。 */
function companionDays(sim: Simulation): number {
  return (sim.time + sim.interactionBonusSeconds) / (60 * 60 * 24);
}

// 圖鑑條件讀 sim.seenRareCreature / sim.seenSpectrum（累積紀錄），而不是掃目前存活的 sim.creatures——
// 因為族群滿了之後會有元老退場機制，掃「目前族群」會讓已達成的收藏條件因退場而又消失。
function hasRareCreature(sim: Simulation): boolean {
  return sim.seenRareCreature;
}

function hasFullElementSpectrum(sim: Simulation): boolean {
  const seen = sim.seenSpectrum;
  return seen.sun && seen.moisture && seen.wind && seen.shade;
}

export const UNLOCKS: UnlockDef[] = [
  {
    id: "decor-moss-stone",
    label: "苔石裝飾",
    type: "decor",
    description: "陪伴 1 天",
    isMet: (sim) => companionDays(sim) >= 1,
    progressLabel: daysProgressLabel(1),
    decorShape: "moss-stone",
  },
  {
    id: "decor-campfire",
    label: "營火",
    type: "decor",
    description: "陪伴 2 天",
    isMet: (sim) => companionDays(sim) >= 2,
    progressLabel: daysProgressLabel(2),
    decorShape: "campfire",
  },
  {
    id: "decor-colored-sand",
    label: "彩色底沙",
    type: "decor",
    description: "陪伴 3 天",
    isMet: (sim) => companionDays(sim) >= 3,
    progressLabel: daysProgressLabel(3),
    decorShape: "colored-sand",
  },
  {
    id: "decor-pond",
    label: "水池",
    type: "decor",
    description: "陪伴 5 天",
    isMet: (sim) => companionDays(sim) >= 5,
    progressLabel: daysProgressLabel(5),
    decorShape: "pond",
  },
  {
    id: "decor-water-wheel",
    label: "小水車",
    type: "decor",
    description: "陪伴 7 天",
    isMet: (sim) => companionDays(sim) >= 7,
    progressLabel: daysProgressLabel(7),
    decorShape: "water-wheel",
  },
  {
    id: "decor-coconut-tree",
    label: "椰子樹",
    type: "decor",
    description: "陪伴 10 天",
    isMet: (sim) => companionDays(sim) >= 10,
    progressLabel: daysProgressLabel(10),
    decorShape: "coconut-tree",
  },
  {
    id: "codex-rare-variant",
    label: "稀有變異圖鑑頁",
    type: "codex",
    description: "收集 1 隻稀有變異個體",
    isMet: (sim) => hasRareCreature(sim),
    progressLabel: (sim) => (hasRareCreature(sim) ? "已出現" : "尚未出現"),
  },
  {
    id: "codex-full-spectrum",
    label: "四維基因圖鑑",
    type: "codex",
    description: "向陽/喜濕/耐風/向陰皆出現過強烈傾向個體",
    isMet: (sim) => hasFullElementSpectrum(sim),
    progressLabel: (sim) => {
      const seen = sim.seenSpectrum;
      const count = Number(seen.sun) + Number(seen.moisture) + Number(seen.wind) + Number(seen.shade);
      return `${count} / 4 種傾向已出現`;
    },
  },
  {
    id: "codex-rainbow",
    label: "雨後彩虹",
    type: "codex",
    description: "春夏雨停後遇到一次彩虹",
    isMet: (sim) => sim.seenRainbow,
    progressLabel: (sim) => (sim.seenRainbow ? "已出現" : "尚未出現"),
  },
  {
    id: "codex-meteor-shower",
    label: "夜空流星雨",
    type: "codex",
    description: "晴朗夜晚遇到一次流星雨",
    isMet: (sim) => sim.seenMeteorShower,
    progressLabel: (sim) => (sim.seenMeteorShower ? "已出現" : "尚未出現"),
  },
  {
    id: "codex-easter-egg",
    label: "神秘小訪客",
    type: "codex",
    description: "點到偶爾飄進生態瓶裡的神秘訪客",
    isMet: (sim) => sim.seenVisitorKinds.size > 0,
    progressLabel: (sim) => `${sim.seenVisitorKinds.size} / ${VISITOR_KINDS.length} 種已發現`,
  },
  {
    id: "mechanic-greenhouse-expansion",
    label: "迷你溫室擴建",
    type: "decor",
    description: "陪伴 14 天（容納上限 +5）",
    isMet: (sim) => companionDays(sim) >= 14,
    progressLabel: daysProgressLabel(14),
  },
  {
    id: "decor-stone-lantern",
    label: "石燈籠",
    type: "decor",
    description: "陪伴 30 天",
    isMet: (sim) => companionDays(sim) >= 30,
    progressLabel: daysProgressLabel(30),
    decorShape: "stone-lantern",
  },
  {
    id: "decor-garden-gazebo",
    label: "小涼亭",
    type: "decor",
    description: "陪伴 60 天",
    isMet: (sim) => companionDays(sim) >= 60,
    progressLabel: daysProgressLabel(60),
    decorShape: "garden-gazebo",
  },
  {
    id: "decor-wishing-fountain",
    label: "許願噴泉",
    type: "decor",
    description: "陪伴 120 天",
    isMet: (sim) => companionDays(sim) >= 120,
    progressLabel: daysProgressLabel(120),
    decorShape: "wishing-fountain",
  },
  {
    id: "decor-ancient-tree",
    label: "巨型古樹",
    type: "decor",
    description: "陪伴 240 天",
    isMet: (sim) => companionDays(sim) >= 240,
    progressLabel: daysProgressLabel(240),
    decorShape: "ancient-tree",
  },
  {
    id: "decor-cherry-blossom",
    label: "櫻花盆栽",
    type: "decor",
    description: "陪伴 2 天，且逢春天",
    isMet: (sim) => companionDays(sim) >= 2 && seasonForTime(sim.time) === "spring",
    progressLabel: seasonalProgressLabel(2, "spring"),
    decorShape: "cherry-blossom",
  },
  {
    id: "decor-beach-umbrella",
    label: "遮陽傘",
    type: "decor",
    description: "陪伴 2 天，且逢夏天",
    isMet: (sim) => companionDays(sim) >= 2 && seasonForTime(sim.time) === "summer",
    progressLabel: seasonalProgressLabel(2, "summer"),
    decorShape: "beach-umbrella",
  },
  {
    id: "decor-pumpkin-lantern",
    label: "南瓜燈",
    type: "decor",
    description: "陪伴 2 天，且逢秋天",
    isMet: (sim) => companionDays(sim) >= 2 && seasonForTime(sim.time) === "autumn",
    progressLabel: seasonalProgressLabel(2, "autumn"),
    decorShape: "pumpkin-lantern",
  },
  {
    id: "decor-snowman",
    label: "雪人",
    type: "decor",
    description: "陪伴 2 天，且逢冬天",
    isMet: (sim) => companionDays(sim) >= 2 && seasonForTime(sim.time) === "winter",
    progressLabel: seasonalProgressLabel(2, "winter"),
    decorShape: "snowman",
  },
];

const DECOR_SHAPE_BY_UNLOCK_ID = new Map(UNLOCKS.filter((u) => u.decorShape).map((u) => [u.id, u.decorShape!]));

/** 依裝飾放置紀錄的 unlockId 查回它的 DecorShape（供 scene.ts 畫圖、personality 判斷偏好用），
 *  單一來源避免各處各自重複建立同一份 map。 */
export function decorShapeForUnlockId(unlockId: string): DecorShape | undefined {
  return DECOR_SHAPE_BY_UNLOCK_ID.get(unlockId);
}

/** 依目前 simulation 狀態，回傳新達成、尚未記錄過的解鎖 id。呼叫端負責把回傳的 id 併入已存的 unlockedIds。 */
export function computeNewlyUnlocked(sim: Simulation, alreadyUnlocked: ReadonlySet<string>): UnlockDef[] {
  return UNLOCKS.filter((u) => !alreadyUnlocked.has(u.id) && u.isMet(sim));
}
