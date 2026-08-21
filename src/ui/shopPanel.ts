import type { Simulation } from "../simulation";
import { UNLOCKS } from "../unlocks";
import { renderDecorCanvas } from "../render/decorSprite";
import { t } from "../i18n";

// 圖鑑類的解鎖（稀有變異、四維基因）跟裝飾類分開陳列——那些是「收集成就」，
// 沒有可以放進場景的東西，混在裝飾清單裡點了也沒反應，容易讓人誤會壞掉；
// 圖鑑類的進度改在 codexPanel 自己的面板裡顯示（見 codexPanel.ts）。
const DECOR_UNLOCKS = UNLOCKS.filter((u) => u.type === "decor");

export interface ShopPanel {
  toggle: () => void;
  update: () => void;
  isOpen: () => boolean;
}

export interface ShopPanelDeps {
  sim: Simulation;
  unlockedIds: ReadonlySet<string>;
  /** 解鎖後的裝飾物沒有次數限制——這裡是「開始放置」，不是「放置一次就沒了」，
   * 呼叫端會關掉面板、進入放置模式，讓玩家自己點草地選位置，可以重複呼叫想放幾個放幾個。 */
  onStartPlacing: (unlockId: string) => void;
}

/**
 * 裝飾收藏面板：只列出 UNLOCKS 裡 type === "decor" 的項目（圖鑑類收集成就另外顯示在
 * codexPanel 裡，兩者分開陳列，避免混在一起讓人誤以為圖鑑項目也能點來放置）。
 * 裝飾類解鎖後沒有「用掉」的概念，可以無限次點「放置」重新進入放置模式，一直擺到玩家自己
 * 滿意為止（參考使用者提供的截圖，解鎖一次就能無限量選取擺放，不用每放一個就再花一次代價）。
 */
export function mountShopPanel(root: HTMLElement, { sim, unlockedIds, onStartPlacing }: ShopPanelDeps): ShopPanel {
  const backdrop = document.createElement("div");
  backdrop.style.cssText = `
    position: absolute; inset: 0; z-index: 900; display: none;
    background: rgba(6, 14, 11, 0.65); pointer-events: auto;
    align-items: center; justify-content: center; padding: 20px;
  `;

  const card = document.createElement("div");
  card.style.cssText = `
    width: min(340px, 100%); max-height: min(70vh, 520px); overflow-y: auto;
    background: #142520; border: 1px solid rgba(234,243,238,0.15); border-radius: 14px;
    padding: 16px; color: #eaf3ee;
    font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif;
  `;
  backdrop.appendChild(card);

  const header = document.createElement("div");
  header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;";
  const title = document.createElement("div");
  title.textContent = t("shop.title");
  title.style.cssText = "font-size: 15px; font-weight: 700;";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `
    pointer-events: auto; border: none; border-radius: 8px; width: 28px; height: 28px;
    background: rgba(234,243,238,0.12); color: #eaf3ee; font-size: 13px;
  `;
  header.appendChild(title);
  header.appendChild(closeBtn);
  card.appendChild(header);

  const list = document.createElement("div");
  list.style.cssText = "display: flex; flex-direction: column; gap: 8px;";
  card.appendChild(list);

  let open = false;

  const setOpen = (next: boolean) => {
    open = next;
    backdrop.style.display = open ? "flex" : "none";
    if (open) update();
  };

  closeBtn.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) setOpen(false);
  });

  interface RowRefs {
    row: HTMLElement;
    label: HTMLSpanElement;
    desc: HTMLDivElement;
    mechanic: HTMLDivElement;
    placeBtn: HTMLButtonElement | null;
  }

  // 每個 unlock 的 DOM 節點只建立一次、快取起來，之後每次 update() 只改文字/樣式，
  // 不整批 replaceChildren 重建——面板開著時 main.ts 的畫面迴圈每一影格都會呼叫 update()，
  // 若每次都重建按鈕元素，使用者按下去（mousedown）到放開（mouseup/click）之間按鈕節點
  // 可能已經被換掉，瀏覽器就不會觸發 click 事件，變成「點了完全沒反應」。
  const rowRefs = new Map<string, RowRefs>();

  function buildRow(unlock: (typeof DECOR_UNLOCKS)[number]): RowRefs {
    const row = document.createElement("div");
    row.style.cssText = "display: flex; gap: 10px; align-items: flex-start;";

    if (unlock.decorShape) {
      const iconWrap = document.createElement("div");
      iconWrap.style.cssText = `
        width: 40px; height: 40px; flex: none; border-radius: 8px;
        background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center;
      `;
      const icon = renderDecorCanvas(unlock.decorShape);
      icon.style.cssText = "width: 30px; height: 30px; image-rendering: pixelated;";
      iconWrap.appendChild(icon);
      row.appendChild(iconWrap);
    }

    const body = document.createElement("div");
    body.style.cssText = "flex: 1; min-width: 0;";
    row.appendChild(body);

    const label = document.createElement("div");
    label.style.cssText = "font-size: 13px; font-weight: 600;";
    body.appendChild(label);

    const desc = document.createElement("div");
    desc.style.cssText = "font-size: 11px; opacity: 0.7; margin-top: 3px;";
    body.appendChild(desc);

    // 這個裝飾物特有的動態機制（例如會長大、會偶爾氾濫），未解鎖前也顯示——讓玩家先知道
    // 解鎖之後這個東西「會做什麼」，不用等真的放進場景才發現它其實不是靜態的擺設。
    const mechanic = document.createElement("div");
    mechanic.style.cssText = "font-size: 11px; opacity: 0.6; margin-top: 2px; font-style: italic; display: none;";
    body.appendChild(mechanic);

    let placeBtn: HTMLButtonElement | null = null;
    if (unlock.decorShape) {
      placeBtn = document.createElement("button");
      placeBtn.textContent = t("shop.placeOne");
      placeBtn.style.cssText = `
        margin-top: 6px; pointer-events: auto; border: none; border-radius: 8px;
        padding: 6px 10px; font-size: 11px; font-weight: 600; color: #0e1b16;
        background: #7fd8b0; display: none;
      `;
      placeBtn.addEventListener("click", () => {
        setOpen(false); // 關掉面板露出草地，玩家才點得到場景
        onStartPlacing(unlock.id);
      });
      body.appendChild(placeBtn);
    }

    list.appendChild(row);
    return { row, label, desc, mechanic, placeBtn };
  }

  function updateRow(unlock: (typeof DECOR_UNLOCKS)[number]): void {
    let refs = rowRefs.get(unlock.id);
    if (!refs) {
      refs = buildRow(unlock);
      rowRefs.set(unlock.id, refs);
    }
    const met = unlockedIds.has(unlock.id);
    refs.row.style.cssText = `
      display: flex; gap: 10px; align-items: flex-start;
      border-radius: 10px; padding: 10px 12px;
      background: ${met ? "rgba(127,216,176,0.12)" : "rgba(255,255,255,0.04)"};
      border: 1px solid ${met ? "rgba(127,216,176,0.35)" : "rgba(255,255,255,0.08)"};
      opacity: ${met ? "1" : "0.75"};
    `;
    refs.label.textContent = `${met ? "✅" : "🔒"} ${unlock.label}`;
    refs.desc.textContent = met ? t("shop.unlockedDesc") : unlock.progressLabel?.(sim) ?? unlock.description;
    refs.mechanic.style.display = unlock.mechanic ? "block" : "none";
    if (unlock.mechanic) refs.mechanic.textContent = unlock.mechanic;
    if (refs.placeBtn) refs.placeBtn.style.display = met ? "inline-block" : "none";
  }

  function update(): void {
    for (const unlock of DECOR_UNLOCKS) updateRow(unlock);
  }

  root.appendChild(backdrop);
  update();

  return {
    toggle: () => setOpen(!open),
    update,
    isOpen: () => open,
  };
}
