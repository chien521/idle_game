import type { Simulation, DiscoveredCreature } from "../simulation";
import { renderCreatureCanvas } from "../render/creatureSprite";
import { renderVisitorCanvas } from "../render/rareVisitorSprite";
import { UNLOCKS } from "../unlocks";
import { VISITOR_KINDS, VISITOR_LABELS, type VisitorKind } from "../easterEgg";

const SVG_NS = "http://www.w3.org/2000/svg";

// 圖鑑類的收集成就（稀有變異、四維基因）跟裝飾類分開陳列——那些是「放進場景」的東西，
// 混在一起容易讓人誤以為圖鑑項目也能點來放置。裝飾類進度留在 shopPanel，圖鑑類進度顯示在這裡。
const CODEX_UNLOCKS = UNLOCKS.filter((u) => u.type === "codex");

type FamilyRole = "self" | "ancestor" | "descendant";
const ROLE_BORDER_COLOR: Record<FamilyRole, string> = {
  self: "#ffd76a",
  ancestor: "#5db8e8",
  descendant: "#ff7fa8",
};

export interface CodexPanel {
  toggle: () => void;
  update: () => void;
  isOpen: () => boolean;
}

/** 從選中的個體往上找祖先、往下找子孫，回傳整個連通的家族子圖（節點 id 集合 + 父→子邊）。 */
function collectFamily(sim: Simulation, rootId: string): { nodes: Map<string, FamilyRole>; edges: [string, string][] } {
  const byId = new Map(sim.discoveredCreatures.map((d) => [d.id, d]));
  const childrenOf = new Map<string, DiscoveredCreature[]>();
  for (const d of sim.discoveredCreatures) {
    if (!d.parentIds) continue;
    for (const pid of d.parentIds) {
      const list = childrenOf.get(pid) ?? [];
      list.push(d);
      childrenOf.set(pid, list);
    }
  }

  const nodes = new Map<string, FamilyRole>([[rootId, "self"]]);
  const edges: [string, string][] = [];

  let frontier = [rootId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      const entry = byId.get(id);
      for (const pid of entry?.parentIds ?? []) {
        if (!byId.has(pid)) continue;
        edges.push([pid, id]);
        if (!nodes.has(pid)) {
          nodes.set(pid, "ancestor");
          next.push(pid);
        }
      }
    }
    frontier = next;
  }

  frontier = [rootId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const child of childrenOf.get(id) ?? []) {
        edges.push([id, child.id]);
        if (!nodes.has(child.id)) {
          nodes.set(child.id, "descendant");
          next.push(child.id);
        }
      }
    }
    frontier = next;
  }

  return { nodes, edges };
}

function thumbBox(entry: DiscoveredCreature, size: number): HTMLElement {
  const box = document.createElement("div");
  const hue = entry.genome.visual.hue;
  box.style.cssText = `
    width: ${size}px; height: ${size}px; border-radius: ${Math.round(size * 0.22)}px;
    display: flex; align-items: center; justify-content: center; flex: none;
    background: hsla(${hue}, 45%, 32%, 0.9);
    border: 2px solid hsla(${hue}, 60%, 60%, 0.5);
    box-sizing: border-box; transition: border-color 0.15s;
  `;
  const canvas = renderCreatureCanvas(entry.genome);
  canvas.style.cssText = `width: ${Math.round(size * 0.65)}px; height: ${Math.round(size * 0.65)}px; image-rendering: pixelated;`;
  box.appendChild(canvas);
  return box;
}

/**
 * 圖鑑面板：把歷來出生過的每一隻個體都放進來（見 sim.discoveredCreatures，累積歷史紀錄，
 * 不受族群滿員後「元老退場」影響），依外形分類分排顯示成格狀小卡。
 * 點一隻的頭像會直接在這張總覽上高亮牠的祖先/子孫並用虛線連接（不切頁），
 * 用 DiscoveredCreature.parentIds 往上/往下追出整條家族線，樣式參考使用者提供的截圖。
 */
export function mountCodexPanel(root: HTMLElement, sim: Simulation): CodexPanel {
  const backdrop = document.createElement("div");
  backdrop.style.cssText = `
    position: absolute; inset: 0; z-index: 900; display: none;
    background: rgba(6, 14, 11, 0.65); pointer-events: auto;
    align-items: center; justify-content: center; padding: 16px;
  `;

  const card = document.createElement("div");
  card.style.cssText = `
    width: min(720px, 96vw); max-height: min(88vh, 780px); overflow-y: auto;
    background: #142520; border: 1px solid rgba(234,243,238,0.15); border-radius: 16px;
    padding: 18px; color: #eaf3ee;
    font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif;
  `;
  backdrop.appendChild(card);

  const header = document.createElement("div");
  header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;";

  const statsRow = document.createElement("div");
  statsRow.style.cssText = "display: flex; gap: 10px; align-items: center;";
  const populationStat = document.createElement("span");
  populationStat.style.cssText = "font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 3px;";
  const discoveredStat = document.createElement("span");
  discoveredStat.style.cssText = "font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 3px;";
  statsRow.appendChild(populationStat);
  statsRow.appendChild(discoveredStat);

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `
    pointer-events: auto; border: none; border-radius: 8px; width: 28px; height: 28px;
    background: rgba(234,243,238,0.12); color: #eaf3ee; font-size: 13px;
  `;
  header.appendChild(statsRow);
  header.appendChild(closeBtn);
  card.appendChild(header);

  // 圖鑑類收集成就（稀有變異、四維基因），跟下面「歷來出現過的個體」格狀圖分開，
  // 純顯示進度、不用點擊互動——不像裝飾類還有「放置」按鈕可以按。
  const unlockSection = document.createElement("div");
  unlockSection.style.cssText = "display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px;";
  card.appendChild(unlockSection);

  interface UnlockRowRefs {
    row: HTMLElement;
    label: HTMLDivElement;
    desc: HTMLDivElement;
  }
  const unlockRowRefs = new Map<string, UnlockRowRefs>();

  function buildUnlockRow(): UnlockRowRefs {
    const row = document.createElement("div");
    row.style.cssText = "border-radius: 10px; padding: 8px 12px;";
    const label = document.createElement("div");
    label.style.cssText = "font-size: 13px; font-weight: 600;";
    row.appendChild(label);
    const desc = document.createElement("div");
    desc.style.cssText = "font-size: 11px; opacity: 0.7; margin-top: 2px;";
    row.appendChild(desc);
    unlockSection.appendChild(row);
    return { row, label, desc };
  }

  function updateUnlocks(): void {
    for (const unlock of CODEX_UNLOCKS) {
      let refs = unlockRowRefs.get(unlock.id);
      if (!refs) {
        refs = buildUnlockRow();
        unlockRowRefs.set(unlock.id, refs);
      }
      // 圖鑑類條件都讀 sim.seenRareCreature / sim.seenSpectrum 這種一旦達成就不會變回沒達成的
      // 累積旗標（見 unlocks.ts），直接即時算 isMet(sim) 就準確，不用額外傳 unlockedIds 進來核對。
      const met = unlock.isMet(sim);
      refs.row.style.cssText = `
        border-radius: 10px; padding: 8px 12px;
        background: ${met ? "rgba(127,216,176,0.12)" : "rgba(255,255,255,0.04)"};
        border: 1px solid ${met ? "rgba(127,216,176,0.35)" : "rgba(255,255,255,0.08)"};
      `;
      refs.label.textContent = `${met ? "✅" : "🔒"} ${unlock.label}`;
      refs.desc.textContent = met ? "已解鎖" : unlock.progressLabel?.(sim) ?? unlock.description;
    }
  }

  // 稀有訪客子圖鑑：跟上面的收集成就（unlockSection）分開陳列——這裡是「有圖有名字」的收藏格子，
  // 不是純文字進度。已找到的種類顯示牠的造型跟名字，還沒找到的維持「？」神秘格，不提前爆雷長相/名字，
  // 保留「點到才算找到」的驚喜感（呼應 sim.markVisitorFound 需要玩家主動互動才記錄的設計）。
  const visitorSection = document.createElement("div");
  visitorSection.style.cssText = "margin-bottom: 16px;";
  const visitorTitle = document.createElement("div");
  visitorTitle.textContent = "🌟 稀有訪客";
  visitorTitle.style.cssText = "font-size: 13px; font-weight: 700; margin-bottom: 8px; opacity: 0.85;";
  visitorSection.appendChild(visitorTitle);
  const visitorGrid = document.createElement("div");
  visitorGrid.style.cssText = "display: flex; flex-wrap: wrap; gap: 10px;";
  visitorSection.appendChild(visitorGrid);
  card.appendChild(visitorSection);

  function visitorTile(kind: VisitorKind, discovered: boolean): HTMLElement {
    const tile = document.createElement("div");
    tile.style.cssText = "width: 60px; display: flex; flex-direction: column; align-items: center; gap: 4px;";

    const box = document.createElement("div");
    box.style.cssText = `
      width: 52px; height: 52px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      background: ${discovered ? "rgba(201,162,240,0.18)" : "rgba(255,255,255,0.04)"};
      border: 2px solid ${discovered ? "rgba(201,162,240,0.5)" : "rgba(255,255,255,0.08)"};
      box-sizing: border-box;
    `;
    if (discovered) {
      const canvas = renderVisitorCanvas(kind);
      canvas.style.cssText = "width: 34px; height: 34px; image-rendering: pixelated;";
      box.appendChild(canvas);
    } else {
      box.textContent = "❓";
      box.style.fontSize = "20px";
      box.style.opacity = "0.5";
    }
    tile.appendChild(box);

    const label = document.createElement("span");
    label.textContent = discovered ? VISITOR_LABELS[kind] : "？？？";
    label.style.cssText = "font-size: 10px; opacity: 0.9; text-align: center; line-height: 1.2;";
    tile.appendChild(label);

    return tile;
  }

  function updateVisitorGallery(): void {
    visitorGrid.replaceChildren(...VISITOR_KINDS.map((kind) => visitorTile(kind, sim.seenVisitorKinds.has(kind))));
  }

  // canvasWrap 包住格狀本體，同時是虛線 SVG 的定位基準；SVG 蓋在同一個 relative 容器裡，
  // 會跟著 card 的原生捲動一起動，不用另外監聽 scroll 事件重算座標。
  const canvasWrap = document.createElement("div");
  canvasWrap.style.cssText = "position: relative;";
  card.appendChild(canvasWrap);

  const body = document.createElement("div");
  body.style.cssText = "display: flex; flex-direction: column; gap: 14px;";
  canvasWrap.appendChild(body);

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.style.cssText = "position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible;";
  canvasWrap.appendChild(svg);

  let open = false;
  let selectedId: string | null = null;
  let lastRenderedCount = -1;
  const tileBoxEls = new Map<string, HTMLElement>();

  const setOpen = (next: boolean) => {
    open = next;
    selectedId = null;
    backdrop.style.display = open ? "flex" : "none";
    if (open) update();
  };

  closeBtn.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) setOpen(false);
  });

  function toggleSelection(id: string): void {
    selectedId = selectedId === id ? null : id;
    updateOverlay();
  }

  function renderTile(entry: DiscoveredCreature): HTMLElement {
    const tile = document.createElement("div");
    tile.style.cssText = "width: 60px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer;";

    const box = thumbBox(entry, 52);
    tile.appendChild(box);
    tileBoxEls.set(entry.id, box);

    const label = document.createElement("span");
    label.textContent = entry.name;
    label.style.cssText = "font-size: 10px; opacity: 0.9; text-align: center; line-height: 1.2;";
    tile.appendChild(label);

    tile.addEventListener("click", () => toggleSelection(entry.id));
    return tile;
  }

  function renderGenerationRow(generation: number, entries: DiscoveredCreature[]): HTMLElement | null {
    if (entries.length === 0) return null;
    const row = document.createElement("div");
    row.style.cssText = "display: flex; gap: 10px; align-items: flex-start;";

    const badgeEl = document.createElement("div");
    badgeEl.textContent = generation === 0 ? "👑" : String(generation);
    badgeEl.style.cssText = `
      width: 22px; height: 22px; flex: none; border-radius: 6px;
      background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center;
      font-size: 12px; opacity: 0.6; margin-top: 15px;
    `;
    row.appendChild(badgeEl);

    const grid = document.createElement("div");
    grid.style.cssText = "display: flex; flex-wrap: wrap; gap: 10px;";
    grid.append(...entries.map(renderTile));
    row.appendChild(grid);

    return row;
  }

  /** 依輩分（genome.generation）由上至下分排：始祖（第 0 代）在最上面，同一輩分放同一橫列。 */
  function renderGrid(): void {
    tileBoxEls.clear();
    const byGeneration = new Map<number, DiscoveredCreature[]>();
    for (const d of sim.discoveredCreatures) {
      const list = byGeneration.get(d.genome.generation) ?? [];
      list.push(d);
      byGeneration.set(d.genome.generation, list);
    }

    const generations = [...byGeneration.keys()].sort((a, b) => a - b);
    const rows = generations
      .map((generation) => renderGenerationRow(generation, byGeneration.get(generation)!))
      .filter((r): r is HTMLElement => r !== null);
    body.replaceChildren(...rows);
  }

  /** 依 selectedId 高亮相關格子的邊框，並在 SVG 畫出祖先/子孫之間的虛線連接。每次 update 都會重算，成本很低（族群數量小）。 */
  function updateOverlay(): void {
    svg.replaceChildren();

    if (!selectedId || !tileBoxEls.has(selectedId)) {
      for (const box of tileBoxEls.values()) box.style.borderColor = "";
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      return;
    }

    const { nodes, edges } = collectFamily(sim, selectedId);
    for (const [id, box] of tileBoxEls) {
      const role = nodes.get(id);
      box.style.borderColor = role ? ROLE_BORDER_COLOR[role] : "";
    }

    const wrapRect = canvasWrap.getBoundingClientRect();
    svg.setAttribute("width", String(canvasWrap.scrollWidth));
    svg.setAttribute("height", String(canvasWrap.scrollHeight));

    for (const [fromId, toId] of edges) {
      const fromEl = tileBoxEls.get(fromId);
      const toEl = tileBoxEls.get(toId);
      if (!fromEl || !toEl) continue;
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();

      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(fr.left + fr.width / 2 - wrapRect.left));
      line.setAttribute("y1", String(fr.top + fr.height - wrapRect.top));
      line.setAttribute("x2", String(tr.left + tr.width / 2 - wrapRect.left));
      line.setAttribute("y2", String(tr.top - wrapRect.top));
      line.setAttribute("stroke", "rgba(234,243,238,0.6)");
      line.setAttribute("stroke-width", "1.5");
      line.setAttribute("stroke-dasharray", "4 3");
      svg.appendChild(line);
    }
  }

  function update(): void {
    populationStat.textContent = `🌿 ${sim.creatures.length}`;
    discoveredStat.textContent = `⭐ ${sim.discoveredCreatures.length}`;
    updateUnlocks();
    updateVisitorGallery();

    // 個體數沒變就不重畫格子（避免每 frame 重建 DOM），但高亮/連線每次都重算，
    // 因為選取狀態或畫面位置（例如捲動）隨時可能變。
    const countChanged = sim.discoveredCreatures.length !== lastRenderedCount;
    if (!open || countChanged) {
      lastRenderedCount = sim.discoveredCreatures.length;
      renderGrid();
    }
    updateOverlay();
  }

  root.appendChild(backdrop);
  update();

  return {
    toggle: () => setOpen(!open),
    update,
    isOpen: () => open,
  };
}
