// 小型可重現亂數產生器，同一個 seed（用生物 id 算出）永遠產生同樣的名字
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

import { locale } from "./i18n";

// 兩個音節庫隨機組合，模擬可愛、無意義的寵物暱稱（風格參考使用者提供的圖鑑截圖：拉噗、可禮、丹波、豆奇⋯）。
// 名字本身沒有實際字義、不是「可翻譯」的文字，所以不是逐字翻譯，而是依語言各自換一套疊字風格的音節庫，
// 讓每個語言的玩家看到的名字都唸起來像自己語言裡可愛寵物名的調調。
const SYLLABLE_POOLS: Record<string, { a: string[]; b: string[] }> = {
  zh: {
    a: ["拉", "可", "球", "丹", "豆", "短", "糖", "果", "毛", "塔", "喉", "柚", "羅", "波", "桃", "咪", "嘎", "米", "禮", "喵"],
    b: ["噗", "禮", "果", "波", "奇", "嗎", "米", "羽", "糖", "毛", "皮", "柚", "泡", "咪", "囧", "豆", "喵", "呦", "啦", "嘟"],
  },
  "zh-cn": {
    a: ["拉", "可", "球", "丹", "豆", "短", "糖", "果", "毛", "塔", "喉", "柚", "罗", "波", "桃", "咪", "嘎", "米", "礼", "喵"],
    b: ["噗", "礼", "果", "波", "奇", "吗", "米", "羽", "糖", "毛", "皮", "柚", "泡", "咪", "囧", "豆", "喵", "呦", "啦", "嘟"],
  },
  en: {
    a: ["Bo", "Mo", "La", "Pip", "Tu", "Ko", "Nu", "Fi", "Wo", "Bu", "Da", "Pu", "Ru", "Su", "Zo", "Mi", "Ka", "Lu", "No", "Ti"],
    b: ["po", "chi", "lo", "kin", "fu", "ny", "ru", "mo", "za", "bee", "ko", "lu", "sy", "ta", "bo", "ni", "gu", "sa", "wo", "ri"],
  },
  ja: {
    a: ["ぽ", "も", "く", "ぷ", "た", "こ", "ふ", "み", "ぽ", "ぴ", "ろ", "ぽ", "め", "ぬ", "り", "ぴ", "ゆ", "な", "ぽ", "ち"],
    b: ["ぷりん", "もち", "ぽん", "くる", "たん", "こち", "ふわ", "みー", "ぽこ", "ぴょん", "ろん", "ぽぽ", "めろ", "ぬん", "りお", "ぴこ", "ゆず", "なも", "ぽち", "ちゃ"],
  },
  ko: {
    a: ["뽀", "몽", "꾸", "뿌", "다", "코", "푸", "미", "뽀", "삐", "로", "뽀", "메", "누", "리", "삐", "유", "나", "뽀", "치"],
    b: ["뽀리", "몽치", "뽕", "꾸리", "다미", "코치", "푸딩", "미뇽", "뽀꼬", "삐용", "로미", "뽀뽀", "메로", "누니", "리오", "삐꼬", "유주", "나모", "뽀치", "치야"],
  },
  es: {
    a: ["Bo", "Mo", "La", "Pi", "Tu", "Ko", "Nu", "Fi", "Wo", "Bu", "Da", "Pu", "Ru", "Su", "Zo", "Mi", "Ka", "Lu", "No", "Ti"],
    b: ["pín", "chi", "lo", "kín", "fú", "ny", "rú", "mo", "za", "bí", "ko", "lú", "sy", "ta", "bo", "ni", "gu", "sa", "wo", "rí"],
  },
};
SYLLABLE_POOLS["zh-Hant"] = SYLLABLE_POOLS.zh; // 保底別名，避免之後 locale 命名微調時查不到

/** 依生物 id 決定性產生一個暱稱；同一隻生物永遠是同一個名字。 */
export function generateCreatureName(creatureId: string): string {
  const pool = SYLLABLE_POOLS[locale] ?? SYLLABLE_POOLS.en;
  const rand = mulberry32(hashString(creatureId));
  const a = pool.a[Math.floor(rand() * pool.a.length)];
  const b = pool.b[Math.floor(rand() * pool.b.length)];
  return a + b;
}
