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

// 兩個音節庫隨機組合，模擬可愛、無意義的寵物暱稱（風格參考使用者提供的圖鑑截圖：拉噗、可禮、丹波、豆奇⋯）
const SYLLABLES_A = ["拉", "可", "球", "丹", "豆", "短", "糖", "果", "毛", "塔", "喉", "柚", "羅", "波", "桃", "咪", "嘎", "米", "禮", "喵"];
const SYLLABLES_B = ["噗", "禮", "果", "波", "奇", "嗎", "米", "羽", "糖", "毛", "皮", "柚", "泡", "咪", "囧", "豆", "喵", "呦", "啦", "嘟"];

/** 依生物 id 決定性產生一個暱稱；同一隻生物永遠是同一個名字。 */
export function generateCreatureName(creatureId: string): string {
  const rand = mulberry32(hashString(creatureId));
  const a = SYLLABLES_A[Math.floor(rand() * SYLLABLES_A.length)];
  const b = SYLLABLES_B[Math.floor(rand() * SYLLABLES_B.length)];
  return a + b;
}
