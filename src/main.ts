import { Simulation, DEFAULT_CONFIG } from "./simulation";
import { TerrariumScene } from "./render/scene";
import {
  readSaveData,
  deserializeIntoSimulation,
  applyOfflineProgress,
  saveGame,
  exportSaveToFile,
  readUnlockedIds,
  readPlacements,
  clearSaveData,
} from "./save";
import { computeNewlyUnlocked } from "./unlocks";
import { mountShopPanel } from "./ui/shopPanel";
import { mountCodexPanel } from "./ui/codexPanel";
import { mountCreaturePanel } from "./ui/creaturePanel";
import { makeDecorPlacementId, type DecorPlacement } from "./decor";
import { seasonForTime, SEASON_LABELS } from "./season";

const FOUNDER_COUNT = 8;
const AUTOSAVE_INTERVAL_SECONDS = 20;
const SPEED_OPTIONS = [1, 4, 20] as const;
const GREENHOUSE_UNLOCK_ID = "mechanic-greenhouse-expansion";
const GREENHOUSE_CAP_BONUS = 5;

function applyUnlockEffects(sim: Simulation, unlockedIds: ReadonlySet<string>): void {
  const bonus = unlockedIds.has(GREENHOUSE_UNLOCK_ID) ? GREENHOUSE_CAP_BONUS : 0;
  sim.config.populationCap = DEFAULT_CONFIG.populationCap + bonus;
}

function bootstrapSimulation(): {
  sim: Simulation;
  unlockedIds: Set<string>;
  placements: DecorPlacement[];
} {
  const existing = readSaveData();
  if (!existing) {
    const sim = new Simulation(DEFAULT_CONFIG);
    sim.seedFounders(FOUNDER_COUNT);
    return { sim, unlockedIds: new Set(), placements: [] };
  }

  const sim = deserializeIntoSimulation(existing);
  const unlockedIds = readUnlockedIds(existing);
  const placements = readPlacements(existing);
  applyUnlockEffects(sim, unlockedIds);

  const elapsedRealMs = Date.now() - existing.savedAtRealMs;
  applyOfflineProgress(sim, elapsedRealMs);

  return { sim, unlockedIds, placements };
}

function buildUI(root: HTMLElement) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: absolute; inset: 0; pointer-events: none;
    display: flex; flex-direction: column; justify-content: space-between;
    font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif;
    color: #eaf3ee;
  `;

  const top = document.createElement("div");
  top.style.cssText = `
    display: flex; justify-content: space-between; align-items: flex-start;
    padding: max(10px, env(safe-area-inset-top)) 14px 0 14px;
  `;

  const stats = document.createElement("div");
  stats.style.cssText = "font-size: 13px; line-height: 1.6; text-shadow: 0 1px 3px rgba(0,0,0,0.6);";
  top.appendChild(stats);

  // 放置模式提示：靠右顯示，不擋中央視野，也避免使用者移除的置中提示樣式。
  const placementHint = document.createElement("div");
  placementHint.style.cssText = `
    font-size: 12px; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.6);
    background: rgba(127,216,176,0.85); color: #0e1b16; padding: 6px 10px; border-radius: 8px;
    display: none;
  `;
  top.appendChild(placementHint);

  overlay.appendChild(top);

  const bottom = document.createElement("div");
  bottom.style.cssText = `
    display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px;
    padding: 0 14px max(12px, env(safe-area-inset-bottom)) 14px; pointer-events: auto;
  `;

  const speedRow = document.createElement("div");
  speedRow.style.cssText = "display: flex; gap: 6px;";
  const speedButtons = SPEED_OPTIONS.map((s) => makeButton(`${s}x`));
  speedButtons.forEach((b) => speedRow.appendChild(b));

  const feedButton = makeButton("🍎 餵食", true);
  const shopButton = makeButton("🎁 收藏");
  const codexButton = makeButton("📖 圖鑑");
  const exportButton = makeButton("匯出存檔");
  const resetButton = makeButton("🔄 重新開始");

  bottom.appendChild(speedRow);
  bottom.appendChild(feedButton);
  bottom.appendChild(shopButton);
  bottom.appendChild(codexButton);
  bottom.appendChild(exportButton);
  bottom.appendChild(resetButton);
  overlay.appendChild(bottom);

  root.appendChild(overlay);

  return { stats, placementHint, speedButtons, feedButton, shopButton, codexButton, exportButton, resetButton };
}

function makeButton(label: string, primary = false): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.cssText = `
    pointer-events: auto; border: none; border-radius: 10px; padding: 10px 14px;
    font-size: 13px; font-weight: 600; color: #0e1b16;
    background: ${primary ? "#7fd8b0" : "rgba(234,243,238,0.85)"};
    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  `;
  return btn;
}

function formatCompanionship(gameSeconds: number): string {
  const days = gameSeconds / (60 * 60 * 24);
  if (days < 1) return `陪伴 ${Math.max(1, Math.round(gameSeconds / 60))} 分鐘`;
  return `陪伴 ${days.toFixed(1)} 天`;
}

function main() {
  const root = document.getElementById("app")!;
  const { sim, unlockedIds, placements } = bootstrapSimulation();
  const scene = new TerrariumScene(root, sim);
  scene.setDecor(placements);
  sim.setDecorPlacements(placements);
  const ui = buildUI(root);

  const shopPanel = mountShopPanel(root, { sim, unlockedIds, onStartPlacing: (unlockId) => startPlacingDecor(unlockId) });
  const codexPanel = mountCodexPanel(root, sim);
  const creaturePanel = mountCreaturePanel(root, sim);

  let speedMultiplier: number = SPEED_OPTIONS[0];
  const setSpeed = (s: number) => {
    speedMultiplier = s;
    ui.speedButtons.forEach((b, i) => {
      b.style.outline = SPEED_OPTIONS[i] === s ? "2px solid #eaf3ee" : "none";
    });
  };
  ui.speedButtons.forEach((b, i) => b.addEventListener("click", () => setSpeed(SPEED_OPTIONS[i])));
  setSpeed(1);

  ui.exportButton.addEventListener("click", () => exportSaveToFile(sim, unlockedIds, placements));
  ui.shopButton.addEventListener("click", () => shopPanel.toggle());
  ui.codexButton.addEventListener("click", () => codexPanel.toggle());

  // 餵食：按一下進入「放置模式」（按鈕亮起），之後每次點場景都會在該處丟一份食物，
  // 可以連續點好幾個地方，直到再按一次餵食按鈕才離開放置模式；
  // 附近的寵物之後閒晃擲骰時有機會注意到並走過去吃掉（見 simulation.ts 的 rollActivity）。
  let feedMode = false;
  const setFeedMode = (on: boolean) => {
    feedMode = on;
    if (on) {
      // 三種放置/移動模式互斥，開一個要關掉其他的
      setPlacingDecor(null);
      setMovingDecor(null);
    }
    ui.feedButton.style.outline = on ? "2px solid #eaf3ee" : "none";
  };
  ui.feedButton.addEventListener("click", () => setFeedMode(!feedMode));

  // 裝飾物放置：解鎖後沒有次數限制，商店面板點「放置一個」會關掉面板、進入放置模式，
  // 下一次點草地就在該處新增一個實例（用獨立的 placement id，不會擋掉同種類的下一個）；
  // 放一個之後自動退出放置模式（對應按鈕文字「放置一個」），想再放同一種再開一次商店點一次。
  // 移動已放置的裝飾物則是另一組獨立狀態：點場上既有的裝飾物先「拿起來」，
  // 再點草地上任一位置放下，跟新增放置共用同一個提示文字，但不能同時處於兩種模式。
  let placingDecorUnlockId: string | null = null;
  let movingDecorId: string | null = null;
  const setPlacementHint = (text: string | null) => {
    ui.placementHint.style.display = text ? "block" : "none";
    ui.placementHint.textContent = text ?? "";
  };
  const setPlacingDecor = (unlockId: string | null) => {
    placingDecorUnlockId = unlockId;
    movingDecorId = null;
    setPlacementHint(unlockId ? "🧭 點草地放置" : null);
  };
  const setMovingDecor = (placementId: string | null) => {
    movingDecorId = placementId;
    placingDecorUnlockId = null;
    setPlacementHint(placementId ? "🧭 點草地移到新位置" : null);
    scene.setDraggingDecor(placementId); // 拿起來時變半透明，放下/取消時恢復
  };
  const startPlacingDecor = (unlockId: string) => {
    setPlacingDecor(unlockId);
    feedMode = false;
    ui.feedButton.style.outline = "none";
  };

  scene.onTap(({ x, y }) => {
    if (placingDecorUnlockId) {
      const placement: DecorPlacement = { id: makeDecorPlacementId(), unlockId: placingDecorUnlockId, x, y, plantedAt: sim.time };
      placements.push(placement);
      scene.setDecor(placements);
      sim.setDecorPlacements(placements);
      saveGame(sim, unlockedIds, placements);
      setPlacingDecor(null);
      return;
    }

    if (movingDecorId) {
      const placement = placements.find((p) => p.id === movingDecorId);
      if (placement) {
        placement.x = x;
        placement.y = y;
        scene.setDecor(placements);
        sim.setDecorPlacements(placements);
        saveGame(sim, unlockedIds, placements);
      }
      setMovingDecor(null);
      return;
    }

    if (feedMode) {
      sim.dropFood(x, y);
      return;
    }

    if (scene.pickEasterEggAt(x, y)) {
      sim.markEasterEggFound();
      scene.spawnSparkleEffect(x, y);
      return;
    }

    const id = scene.pickCreatureAt(x, y);
    if (id) {
      const creature = sim.creatures.find((c) => c.id === id);
      if (!creature) return;
      creaturePanel.show(id);
      if (sim.pet(id)) {
        scene.spawnHeartEffect(creature.x, creature.y);
      }
      return;
    }

    const decorId = scene.pickDecorAt(x, y);
    if (decorId) {
      setMovingDecor(decorId);
      return;
    }
  });

  scene.onPointerMove(({ x, y }) => {
    if (movingDecorId) scene.dragDecorTo(x, y);
  });

  sim.onFeed((event) => {
    scene.spawnHeartEffect(event.x, event.y);
  });

  window.addEventListener("resize", () => scene.resize());

  let lastAutosave = performance.now();
  let lastFrame = performance.now();

  function frame(now: number) {
    const realDt = Math.min((now - lastFrame) / 1000, 0.25); // 保護分頁被背景節流後的巨大 dt
    lastFrame = now;

    sim.update(realDt * speedMultiplier);
    scene.render();

    ui.stats.textContent = `${SEASON_LABELS[seasonForTime(sim.time)]}　·　🌿 ${sim.creatures.length} 株　·　${formatCompanionship(sim.time)}`;

    const newlyUnlocked = computeNewlyUnlocked(sim, unlockedIds);
    for (const unlock of newlyUnlocked) {
      unlockedIds.add(unlock.id);
    }
    if (newlyUnlocked.length > 0) {
      applyUnlockEffects(sim, unlockedIds);
      saveGame(sim, unlockedIds, placements);
      shopPanel.update();
    }

    if ((now - lastAutosave) / 1000 > AUTOSAVE_INTERVAL_SECONDS) {
      saveGame(sim, unlockedIds, placements);
      lastAutosave = now;
    }

    if (shopPanel.isOpen()) shopPanel.update();
    if (codexPanel.isOpen()) codexPanel.update();
    if (creaturePanel.isOpen()) creaturePanel.update();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // resetting 期間要跳過自動存檔：reload() 會觸發 beforeunload，若還是照舊存檔，
  // 剛剛 clearSaveData() 清掉的存檔會被這裡用「重新整理前的最後狀態」原封不動蓋回去，
  // 玩家會看到畫面完全沒變，跟沒按到重新開始一樣。
  let resetting = false;
  const persist = () => {
    if (resetting) return;
    saveGame(sim, unlockedIds, placements);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist();
  });
  window.addEventListener("beforeunload", persist);

  ui.resetButton.addEventListener("click", () => {
    if (!window.confirm("確定要重新開始嗎？目前的生態瓶（所有寵物、圖鑑紀錄、解鎖進度）都會被清空，這個動作無法復原。")) return;
    resetting = true;
    clearSaveData();
    window.location.reload();
  });
}

main();
