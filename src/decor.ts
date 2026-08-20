export interface DecorPlacement {
  id: string; // 這次擺放的唯一 id；同一種 unlockId 可以擺很多個實例，靠這個 id 分開管理/顯示
  unlockId: string;
  x: number;
  y: number;
  plantedAt: number; // 擺放當下的 sim.time；用來算「長多大了」（例如椰子樹隨時間長高），移動位置不會重置這個值
}

/** 舊存檔（這個成長功能推出前）沒有 plantedAt 欄位；補一個非常久以前的時間，讓長高類裝飾載入時直接顯示成熟形態，
 * 而不是突然變回剛種下的幼苗嚇到玩家。 */
export const LEGACY_PLANTED_AT = -1e9;

let nextPlacementId = 0;
export function makeDecorPlacementId(): string {
  nextPlacementId += 1;
  return `decor${Date.now().toString(36)}${nextPlacementId}`;
}
