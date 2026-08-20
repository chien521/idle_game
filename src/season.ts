import { DAY_LENGTH_SECONDS, hourOfGameDay, skyColorsForHour } from "./render/environment";

/**
 * 季節與天氣：純粹是 sim.time 的函式，不需要任何存檔欄位或持久化狀態——
 * 重新整理、載入舊存檔都能直接算出當下季節/天氣，跟 sim.time 本身一致（跟雲朵飄移、
 * 水池氾濫用的手法一樣：時間快轉/離線結算時自然跟著算出正確結果，不用另外補邏輯）。
 */
export type Season = "spring" | "summer" | "autumn" | "winter";

const SEASON_ORDER: Season[] = ["spring", "summer", "autumn", "winter"];
export const SEASON_LENGTH_SECONDS = DAY_LENGTH_SECONDS * 3; // 一季約 3 個遊戲日，一年（四季）約 12 個遊戲日
const YEAR_LENGTH_SECONDS = SEASON_LENGTH_SECONDS * SEASON_ORDER.length;
const SEASON_BLEND_FRACTION = 0.15; // 季節交界前這個比例的時間，草地顏色會平滑過渡到下一季，不是硬切換

export const SEASON_LABELS: Record<Season, string> = {
  spring: "🌱 春",
  summer: "☀️ 夏",
  autumn: "🍂 秋",
  winter: "❄️ 冬",
};

/** 草地顏色的季節色調（乘在原本的草地貼圖顏色上，跟晝夜亮暗的 setScalar 是疊乘關係）。 */
const SEASON_GRASS_TINT: Record<Season, readonly [number, number, number]> = {
  spring: [0.88, 1.04, 0.86],
  summer: [0.98, 1.0, 0.78],
  autumn: [1.12, 0.86, 0.56],
  winter: [0.9, 0.95, 1.02],
};

function wrap(time: number, length: number): number {
  return ((time % length) + length) % length;
}

export function seasonForTime(time: number): Season {
  const t = wrap(time, YEAR_LENGTH_SECONDS);
  return SEASON_ORDER[Math.floor(t / SEASON_LENGTH_SECONDS)];
}

/** 目前是「這個季節第幾次出現」的絕對編號（不會重複，每過一季就 +1）。用來當地面裝飾（花朵/落葉）
 *  灑點位置的種子——同一次季節內位置固定，下次輪到同季節時（隔年）才會換一批新位置，
 *  不用另外存檔記錄擺放結果，重新整理直接從 sim.time 重算就對得上。 */
export function seasonInstanceIndex(time: number): number {
  return Math.floor(time / SEASON_LENGTH_SECONDS);
}

interface SeasonBlend {
  season: Season;
  next: Season;
  blendT: number; // 0..1，只有季節快結束前 SEASON_BLEND_FRACTION 這段 >0，代表要往 next 過渡多少
}

function seasonBlendForTime(time: number): SeasonBlend {
  const t = wrap(time, YEAR_LENGTH_SECONDS);
  const index = Math.floor(t / SEASON_LENGTH_SECONDS);
  const within = (t % SEASON_LENGTH_SECONDS) / SEASON_LENGTH_SECONDS;
  const blendStart = 1 - SEASON_BLEND_FRACTION;
  const blendT = within > blendStart ? (within - blendStart) / SEASON_BLEND_FRACTION : 0;
  return { season: SEASON_ORDER[index], next: SEASON_ORDER[(index + 1) % SEASON_ORDER.length], blendT };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 草地顏色的乘法色調，季節交界處會平滑混色，不會一格切換就整片變色。 */
export function grassTintForTime(time: number): readonly [number, number, number] {
  const { season, next, blendT } = seasonBlendForTime(time);
  const a = SEASON_GRASS_TINT[season];
  const b = SEASON_GRASS_TINT[next];
  return [lerp(a[0], b[0], blendT), lerp(a[1], b[1], blendT), lerp(a[2], b[2], blendT)];
}

export type WeatherKind = "clear" | "rain" | "snow" | "leaves";

const WEATHER_CYCLE_SECONDS = DAY_LENGTH_SECONDS; // 每個遊戲日重新擲一次骰，決定今天有沒有天氣事件
const WEATHER_WINDOW_FRACTION = 0.4; // 天氣事件如果發生，大約佔當天 40% 的時間（平滑起伏，不是整天下）
// 春夏偶爾下雨、冬天更常飄雪；秋天不用陣雨式天氣，改用 seasonForTime 判斷持續飄落葉（見下方 weatherForTime）
const WEATHER_CHANCE: Record<Season, number> = { spring: 0.35, summer: 0.25, autumn: 0, winter: 0.45 };

/** 32-bit 雜湊，只用來把「第幾天」這個整數轉成看起來隨機、但每次算出來都一樣的 0..1 小數，不用另外存狀態。 */
function hashInt(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 0xffffffff;
}

export interface WeatherState {
  kind: WeatherKind;
  intensity: number; // 0..1，粒子密度/強度；0 就是沒有天氣效果
}

interface RainRoll {
  dayIndex: number;
  windowStart: number; // 0..1，當天的哪個時間點開始
  windowEnd: number;
}

/** 春/夏/冬每天擲一次骰決定今天有沒有雨/雪；秋天不用這套（固定飄葉）。抽出來讓彩虹可以共用
 *  同一組「今天有沒有下雨、下在哪個時段」的判定，不用另外重複一套邏輯導致兩邊對不上。 */
function rollRainWindow(time: number, season: Season): RainRoll | null {
  if (season === "autumn") return null;
  const dayIndex = Math.floor(time / WEATHER_CYCLE_SECONDS);
  const happensRoll = hashInt(dayIndex);
  if (happensRoll >= WEATHER_CHANCE[season]) return null;
  const windowStart = hashInt(dayIndex + 10_000) * (1 - WEATHER_WINDOW_FRACTION);
  return { dayIndex, windowStart, windowEnd: windowStart + WEATHER_WINDOW_FRACTION };
}

/** 依 sim.time 決定當下天氣：秋天固定飄落葉；春/夏/冬則是每天擲骰決定今天要不要來一場雨/雪，
 *  發生的話會落在當天某個隨機時段、以平滑的 0→1→0 曲線起伏，不是說下就下、說停就停的硬切換。 */
export function weatherForTime(time: number): WeatherState {
  const season = seasonForTime(time);
  if (season === "autumn") return { kind: "leaves", intensity: 0.35 };

  const roll = rollRainWindow(time, season);
  if (!roll) return { kind: "clear", intensity: 0 };

  const dayPhase = (time % WEATHER_CYCLE_SECONDS) / WEATHER_CYCLE_SECONDS;
  if (dayPhase < roll.windowStart || dayPhase > roll.windowEnd) return { kind: "clear", intensity: 0 };

  const local = (dayPhase - roll.windowStart) / WEATHER_WINDOW_FRACTION;
  const intensity = Math.sin(local * Math.PI);
  return { kind: season === "winter" ? "snow" : "rain", intensity };
}

function isDaytime(time: number): boolean {
  return skyColorsForHour(hourOfGameDay(time)).isDay;
}

const RAINBOW_CHANCE_GIVEN_RAIN = 0.22; // 春夏下雨的日子裡，這個機率雨停後會出現彩虹（不是每次下雨都有）
const RAINBOW_TAIL_FRACTION = 0.1; // 彩虹從雨勢窗口快結束前一點點開始若隱若現，一路持續到窗口結束後這段時間

/** 稀有天氣之一：雨停後偶爾出現的彩虹。只在春/夏白天、而且那天本來就有下雨才可能出現——
 *  沒有雨的背景直接冒彩虹會很奇怪。回傳 0..1 的顯示強度，平滑淡入淡出。 */
export function rainbowIntensityForTime(time: number): number {
  const season = seasonForTime(time);
  if (season !== "spring" && season !== "summer") return 0;
  if (!isDaytime(time)) return 0;

  const roll = rollRainWindow(time, season);
  if (!roll) return 0;
  if (hashInt(roll.dayIndex * 104_729 + 17) >= RAINBOW_CHANCE_GIVEN_RAIN) return 0;

  const rainbowStart = roll.windowEnd - RAINBOW_TAIL_FRACTION * 0.3;
  const rainbowEnd = roll.windowEnd + RAINBOW_TAIL_FRACTION;
  const dayPhase = (time % WEATHER_CYCLE_SECONDS) / WEATHER_CYCLE_SECONDS;
  if (dayPhase < rainbowStart || dayPhase > rainbowEnd) return 0;

  const local = (dayPhase - rainbowStart) / (rainbowEnd - rainbowStart);
  return Math.sin(local * Math.PI);
}

const METEOR_CYCLE_SECONDS = DAY_LENGTH_SECONDS * 5; // 每 5 個遊戲日一次機會
const METEOR_CHANCE = 0.25; // 符合條件（晴朗夜晚）的那個週期裡，這個機率會出現流星雨
const METEOR_WINDOW_FRACTION = 0.2;

/** 稀有天氣之二：夜晚偶爾出現的流星雨。只在晴朗（沒有雨/雪/落葉）的夜晚才可能出現。
 *  回傳 0..1 的強度，供畫面決定要冒出幾顆流星、多亮。 */
export function meteorShowerIntensityForTime(time: number): number {
  if (isDaytime(time)) return 0;
  if (weatherForTime(time).kind !== "clear") return 0;

  const cycleIndex = Math.floor(time / METEOR_CYCLE_SECONDS);
  if (hashInt(cycleIndex * 65_537 + 5) >= METEOR_CHANCE) return 0;

  const windowStart = hashInt(cycleIndex * 65_537 + 909) * (1 - METEOR_WINDOW_FRACTION);
  const cyclePhase = (time % METEOR_CYCLE_SECONDS) / METEOR_CYCLE_SECONDS;
  if (cyclePhase < windowStart || cyclePhase > windowStart + METEOR_WINDOW_FRACTION) return 0;

  const local = (cyclePhase - windowStart) / METEOR_WINDOW_FRACTION;
  return Math.sin(local * Math.PI);
}

const LIGHTNING_CHECK_SECONDS = 5; // 每 5 秒一個區間，決定這段時間內要不要打一次雷
const LIGHTNING_CHANCE = 0.3; // 符合條件的區間裡，有這個機率打雷
const LIGHTNING_FLASH_SECONDS = 0.4; // 一次閃光持續多久（sim time；快轉時會跟著壓縮，符合預期）
const LIGHTNING_MIN_RAIN_INTENSITY = 0.3; // 雨勢要夠大才打雷，毛毛雨不打雷

/**
 * 夏天雷雨限定的間歇閃電：只在夏天＋正在下夠大的雨時才可能出現（沒有雷雨背景就打雷會很突兀），
 * 每 5 秒一個區間各自擲骰決定要不要打一次，回傳 0..1 的閃光強度給畫面疊一層白色閃光用。
 * 快速亮起、慢一點暗下去，比對稱三角波更接近真實閃電的觀感。
 */
export function lightningFlashIntensity(time: number, weather: WeatherState, season: Season): number {
  if (season !== "summer" || weather.kind !== "rain" || weather.intensity < LIGHTNING_MIN_RAIN_INTENSITY) return 0;

  const bucketIndex = Math.floor(time / LIGHTNING_CHECK_SECONDS);
  const strikeRoll = hashInt(bucketIndex * 7919 + 31);
  if (strikeRoll >= LIGHTNING_CHANCE) return 0;

  const strikeOffset = hashInt(bucketIndex * 7919 + 999) * (LIGHTNING_CHECK_SECONDS - LIGHTNING_FLASH_SECONDS);
  const strikeStart = bucketIndex * LIGHTNING_CHECK_SECONDS + strikeOffset;
  const localT = time - strikeStart;
  if (localT < 0 || localT > LIGHTNING_FLASH_SECONDS) return 0;

  const p = localT / LIGHTNING_FLASH_SECONDS;
  return p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
}
