import { DAY_LENGTH_SECONDS } from "./render/environment";

const CYCLE_SECONDS = DAY_LENGTH_SECONDS * 7; // 大約每 7 個遊戲日一次機會
const CHANCE = 0.5; // 符合條件的那個週期裡，這個機率真的會出現
const VISIT_SECONDS = 90; // 出現後大約停留這麼久（遊戲秒），之後就飄走了，錯過這次要等下一輪

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
}

/**
 * 彩蛋訪客：跟一般寵物完全無關的稀有裝飾性小訪客，不參與基因/繁殖，純粹是 sim.time 的函式
 * （跟 season.ts 的稀有天氣同一手法），不用存檔記錄牠的位置/狀態。玩家要點到牠才會被記錄
 * 進圖鑑（見 simulation.ts 的 seenEasterEgg，需要玩家主動互動才算「找到」，跟被動看到的
 * 彩虹/流星雨不同，比較有「彩蛋」被發現的感覺）。
 */
export function easterEggStateForTime(time: number): EasterEggState {
  const cycleIndex = Math.floor(time / CYCLE_SECONDS);
  if (hashInt(cycleIndex * 999_331 + 7) >= CHANCE) return { visible: false, progress: 0 };

  const maxStart = CYCLE_SECONDS - VISIT_SECONDS;
  const windowStart = hashInt(cycleIndex * 999_331 + 909) * maxStart;
  const localT = time - cycleIndex * CYCLE_SECONDS - windowStart;
  if (localT < 0 || localT > VISIT_SECONDS) return { visible: false, progress: 0 };
  return { visible: true, progress: localT / VISIT_SECONDS };
}
