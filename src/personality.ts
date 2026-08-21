import type { ElementTraits, Genome } from "./genome";
import type { DecorShape } from "./unlocks";

type ElementKey = keyof ElementTraits;

// 「個性」直接重用既有的元素傾向基因（向陽/喜濕/耐風/向陰），不額外加新的基因欄位——
// 每隻生物最強的那個元素傾向，自然對應成牠最愛逗留的裝飾物種類。只對應這 4 種跟元素氣質
// 本來就相符的「原始」裝飾，里程碑/季節限定裝飾不硬湊元素歸屬。
const ELEMENT_FAVORITE_DECOR: Record<ElementKey, DecorShape> = {
  sun: "campfire",
  moisture: "pond",
  wind: "water-wheel",
  shade: "moss-stone",
};

// 同分時的決定順序，確保同一個 genome 每次算出來的結果都一樣。
const ELEMENT_PRIORITY: ElementKey[] = ["sun", "moisture", "wind", "shade"];

/** 依基因最主要的元素傾向，推出這隻生物「最愛」逗留的裝飾物種類。純函式、不用額外存檔欄位——
 *  只要 genome 沒變就永遠算出同一個結果，載入舊存檔時直接重算即可。 */
export function favoriteDecorShape(genome: Genome): DecorShape {
  const e = genome.elements;
  let best: ElementKey = "sun";
  for (const key of ELEMENT_PRIORITY) {
    if (e[key] > e[best]) best = key;
  }
  return ELEMENT_FAVORITE_DECOR[best];
}
