import type { Genome } from "./genome";
import { generateCreatureName } from "./names";
import { favoriteDecorShape } from "./personality";
import type { DecorShape } from "./unlocks";

export type CreatureState = "wander" | "cooldown-glow";

export type CreatureActivity = "wander" | "sleep" | "decor" | "food";

export interface Creature {
  id: string;
  name: string; // 玩家可改名（見 simulation.ts 的 renameCreature），預設是程序生成的暱稱
  genome: Genome;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bornAt: number; // ms epoch (game time)
  lastBredAt: number; // ms epoch (game time), -Infinity if never
  wanderDirX: number; // 目前漫遊方向的單位向量，見 simulation.ts stepCreatures
  wanderDirY: number;
  activity: CreatureActivity;
  activityUntil: number; // game-seconds，到期才會重新擲骰換活動
  activityTargetId: string | null; // decor 時是裝飾物 unlockId，food 時是食物 id，renderer/simulation 依此找目標
  lastPettedAt: number; // game-seconds，-Infinity 代表還沒被摸過
  parentIds: [string, string] | null; // 始祖是 null，供圖鑑顯示家庭關係（見 unlocks/codexPanel）
  partnerId: string | null; // 一夫一妻：配對後只跟這個 id 繁殖，見 simulation.ts 的 resolvePairing
  favoriteDecor: DecorShape; // 「個性」：由 genome 元素傾向推出，純衍生值，見 personality.ts
}

let nextId = 0;
export function makeCreatureId(): string {
  nextId += 1;
  return `c${Date.now().toString(36)}${nextId}`;
}

export function createCreature(
  genome: Genome,
  x: number,
  y: number,
  now: number,
  parentIds: [string, string] | null = null
): Creature {
  const angle = Math.random() * Math.PI * 2;
  const id = makeCreatureId();
  return {
    id,
    name: generateCreatureName(id),
    genome,
    x,
    y,
    vx: 0,
    vy: 0,
    bornAt: now,
    lastBredAt: -Infinity,
    wanderDirX: Math.cos(angle),
    wanderDirY: Math.sin(angle),
    activity: "wander",
    activityUntil: now,
    activityTargetId: null,
    lastPettedAt: -Infinity,
    parentIds,
    partnerId: null,
    favoriteDecor: favoriteDecorShape(genome),
  };
}
