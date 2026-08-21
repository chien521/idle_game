import type { Simulation } from "./simulation";
import { seasonForTime, type Season } from "./season";
import { VISITOR_KINDS } from "./easterEgg";
import { t } from "./i18n";

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
  return (sim) => t("progress.days", { value: Math.min(companionDays(sim), target).toFixed(1), n: target });
}

const SEASON_NAME_KEY: Record<Season, string> = {
  spring: "seasonName.spring",
  summer: "seasonName.summer",
  autumn: "seasonName.autumn",
  winter: "seasonName.winter",
};

/** 季節限定裝飾的進度文字：陪伴天數之外，另外標出「現在正是/需等到」該季節——
 *  真正卡進度的通常是季節有沒有輪到，不是陪伴天數（門檻本來就設得很低）。 */
function seasonalProgressLabel(target: number, season: Season): (sim: Simulation) => string {
  return (sim) => {
    const dayPart = t("progress.days", { value: Math.min(companionDays(sim), target).toFixed(1), n: target });
    const seasonLabel = t(SEASON_NAME_KEY[season]);
    const seasonPart = t(seasonForTime(sim.time) === season ? "progress.seasonNow" : "progress.seasonWait", { season: seasonLabel });
    return t("progress.seasonal", { dayPart, seasonPart });
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
    label: t("label.moss-stone"),
    type: "decor",
    description: t("unlockDesc.days", { n: 1 }),
    isMet: (sim) => companionDays(sim) >= 1,
    progressLabel: daysProgressLabel(1),
    decorShape: "moss-stone",
  },
  {
    id: "decor-campfire",
    label: t("label.campfire"),
    type: "decor",
    description: t("unlockDesc.days", { n: 2 }),
    isMet: (sim) => companionDays(sim) >= 2,
    progressLabel: daysProgressLabel(2),
    decorShape: "campfire",
  },
  {
    id: "decor-colored-sand",
    label: t("label.colored-sand"),
    type: "decor",
    description: t("unlockDesc.days", { n: 3 }),
    isMet: (sim) => companionDays(sim) >= 3,
    progressLabel: daysProgressLabel(3),
    decorShape: "colored-sand",
  },
  {
    id: "decor-pond",
    label: t("label.pond"),
    type: "decor",
    description: t("unlockDesc.days", { n: 5 }),
    isMet: (sim) => companionDays(sim) >= 5,
    progressLabel: daysProgressLabel(5),
    decorShape: "pond",
  },
  {
    id: "decor-water-wheel",
    label: t("label.water-wheel"),
    type: "decor",
    description: t("unlockDesc.days", { n: 7 }),
    isMet: (sim) => companionDays(sim) >= 7,
    progressLabel: daysProgressLabel(7),
    decorShape: "water-wheel",
  },
  {
    id: "decor-coconut-tree",
    label: t("label.coconut-tree"),
    type: "decor",
    description: t("unlockDesc.days", { n: 10 }),
    isMet: (sim) => companionDays(sim) >= 10,
    progressLabel: daysProgressLabel(10),
    decorShape: "coconut-tree",
  },
  {
    id: "codex-rare-variant",
    label: t("label.codex-rare-variant"),
    type: "codex",
    description: t("desc.codex-rare-variant"),
    isMet: (sim) => hasRareCreature(sim),
    progressLabel: (sim) => t(hasRareCreature(sim) ? "progress.seen" : "progress.notSeen"),
  },
  {
    id: "codex-full-spectrum",
    label: t("label.codex-full-spectrum"),
    type: "codex",
    description: t("desc.codex-full-spectrum"),
    isMet: (sim) => hasFullElementSpectrum(sim),
    progressLabel: (sim) => {
      const seen = sim.seenSpectrum;
      const count = Number(seen.sun) + Number(seen.moisture) + Number(seen.wind) + Number(seen.shade);
      return t("progress.spectrum", { count });
    },
  },
  {
    id: "codex-rainbow",
    label: t("label.codex-rainbow"),
    type: "codex",
    description: t("desc.codex-rainbow"),
    isMet: (sim) => sim.seenRainbow,
    progressLabel: (sim) => t(sim.seenRainbow ? "progress.seen" : "progress.notSeen"),
  },
  {
    id: "codex-meteor-shower",
    label: t("label.codex-meteor-shower"),
    type: "codex",
    description: t("desc.codex-meteor-shower"),
    isMet: (sim) => sim.seenMeteorShower,
    progressLabel: (sim) => t(sim.seenMeteorShower ? "progress.seen" : "progress.notSeen"),
  },
  {
    id: "codex-easter-egg",
    label: t("label.codex-easter-egg"),
    type: "codex",
    description: t("desc.codex-easter-egg"),
    isMet: (sim) => sim.seenVisitorKinds.size > 0,
    progressLabel: (sim) => t("progress.visitors", { count: sim.seenVisitorKinds.size, total: VISITOR_KINDS.length }),
  },
  {
    id: "mechanic-greenhouse-expansion",
    label: t("label.greenhouse"),
    type: "decor",
    description: t("unlockDesc.greenhouse", { n: 14 }),
    isMet: (sim) => companionDays(sim) >= 14,
    progressLabel: daysProgressLabel(14),
  },
  {
    id: "decor-stone-lantern",
    label: t("label.stone-lantern"),
    type: "decor",
    description: t("unlockDesc.days", { n: 30 }),
    isMet: (sim) => companionDays(sim) >= 30,
    progressLabel: daysProgressLabel(30),
    decorShape: "stone-lantern",
  },
  {
    id: "decor-garden-gazebo",
    label: t("label.garden-gazebo"),
    type: "decor",
    description: t("unlockDesc.days", { n: 60 }),
    isMet: (sim) => companionDays(sim) >= 60,
    progressLabel: daysProgressLabel(60),
    decorShape: "garden-gazebo",
  },
  {
    id: "decor-wishing-fountain",
    label: t("label.wishing-fountain"),
    type: "decor",
    description: t("unlockDesc.days", { n: 120 }),
    isMet: (sim) => companionDays(sim) >= 120,
    progressLabel: daysProgressLabel(120),
    decorShape: "wishing-fountain",
  },
  {
    id: "decor-ancient-tree",
    label: t("label.ancient-tree"),
    type: "decor",
    description: t("unlockDesc.days", { n: 240 }),
    isMet: (sim) => companionDays(sim) >= 240,
    progressLabel: daysProgressLabel(240),
    decorShape: "ancient-tree",
  },
  {
    id: "decor-cherry-blossom",
    label: t("label.cherry-blossom"),
    type: "decor",
    description: t("unlockDesc.seasonal", { n: 2, season: t(SEASON_NAME_KEY.spring) }),
    isMet: (sim) => companionDays(sim) >= 2 && seasonForTime(sim.time) === "spring",
    progressLabel: seasonalProgressLabel(2, "spring"),
    decorShape: "cherry-blossom",
  },
  {
    id: "decor-beach-umbrella",
    label: t("label.beach-umbrella"),
    type: "decor",
    description: t("unlockDesc.seasonal", { n: 2, season: t(SEASON_NAME_KEY.summer) }),
    isMet: (sim) => companionDays(sim) >= 2 && seasonForTime(sim.time) === "summer",
    progressLabel: seasonalProgressLabel(2, "summer"),
    decorShape: "beach-umbrella",
  },
  {
    id: "decor-pumpkin-lantern",
    label: t("label.pumpkin-lantern"),
    type: "decor",
    description: t("unlockDesc.seasonal", { n: 2, season: t(SEASON_NAME_KEY.autumn) }),
    isMet: (sim) => companionDays(sim) >= 2 && seasonForTime(sim.time) === "autumn",
    progressLabel: seasonalProgressLabel(2, "autumn"),
    decorShape: "pumpkin-lantern",
  },
  {
    id: "decor-snowman",
    label: t("label.snowman"),
    type: "decor",
    description: t("unlockDesc.seasonal", { n: 2, season: t(SEASON_NAME_KEY.winter) }),
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
