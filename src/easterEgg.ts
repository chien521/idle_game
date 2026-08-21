import { DAY_LENGTH_SECONDS } from "./render/environment";

const CYCLE_SECONDS = DAY_LENGTH_SECONDS * 7; // 大約每 7 個遊戲日一次機會
const CHANCE = 0.5; // 符合條件的那個週期裡，這個機率真的會出現
const VISIT_SECONDS = 90; // 出現後大約停留這麼久（遊戲秒），之後就飄走了，錯過這次要等下一輪

// 稀有訪客的種類：外觀（見 render/rareVisitorSprite.ts）跟名稱各自獨立，圖鑑（codexPanel）
// 會依這份清單畫出子圖鑑格子。新增種類只要在這裡加一筆、在 rareVisitorSprite.ts 補畫法即可。
export type VisitorKind = "star-spirit" | "cloud-puff" | "glow-fish" | "shimmer-moth";
export const VISITOR_KINDS: VisitorKind[] = ["star-spirit", "cloud-puff", "glow-fish", "shimmer-moth"];
export const VISITOR_LABELS: Record<VisitorKind, string> = {
  "star-spirit": "星靈",
  "cloud-puff": "雲朵精",
  "glow-fish": "螢光魚",
  "shimmer-moth": "流光蝶",
};

function hashInt(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 0xffffffff;
}

export interface EasterEggState {
  visible: boolean;
  progress: number; // 0..1，這次拜訪已經過去多少，供畫面算牠現在飄到哪個位置
  kind: VisitorKind;
}

/**
 * 彩蛋訪客：跟一般寵物完全無關的稀有裝飾性小訪客，不參與基因/繁殖，純粹是 sim.time 的函式
 * （跟 season.ts 的稀有天氣同一手法），不用存檔記錄牠的位置/狀態。玩家要點到牠才會被記錄
 * 進圖鑑（見 simulation.ts 的 seenVisitorKinds，需要玩家主動互動才算「找到」，跟被動看到的
 * 彩虹/流星雨不同，比較有「彩蛋」被發現的感覺）。每次出現是哪一種（見 VisitorKind）由同一個
 * cycleIndex 另外擲一次骰決定，跟「這次會不會出現/出現在哪個時段」互相獨立。
 */
export function easterEggStateForTime(time: number): EasterEggState {
  const cycleIndex = Math.floor(time / CYCLE_SECONDS);
  const kind = VISITOR_KINDS[Math.floor(hashInt(cycleIndex * 999_331 + 55) * VISITOR_KINDS.length)];
  if (hashInt(cycleIndex * 999_331 + 7) >= CHANCE) return { visible: false, progress: 0, kind };

  const maxStart = CYCLE_SECONDS - VISIT_SECONDS;
  const windowStart = hashInt(cycleIndex * 999_331 + 909) * maxStart;
  const localT = time - cycleIndex * CYCLE_SECONDS - windowStart;
  if (localT < 0 || localT > VISIT_SECONDS) return { visible: false, progress: 0, kind };
  return { visible: true, progress: localT / VISIT_SECONDS, kind };
}
