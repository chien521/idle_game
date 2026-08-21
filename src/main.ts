import { Simulation, DEFAULT_CONFIG } from "./simulation";
import { TerrariumScene } from "./render/scene";
import {
  readSaveData,
  deserializeIntoSimulation,
  applyOfflineProgress,
  saveGame,
  serialize,
  importSaveFromJson,
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
import { easterEggStateForTime } from "./easterEgg";
import { t, locale } from "./i18n";
import { initViverseAuth, loginToViverse, logoutFromViverse, type ViverseProfile } from "./viverse/auth";
import { saveToCloud, loadFromCloud, saveBeacon } from "./viverse/storage";
import { mountProfileChip } from "./ui/profileChip";
import { showConfirm, showAlert, showDownloadableImage, showDownloadableText } from "./ui/dialog";
import type { SaveData } from "./save";

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
  hadLocalSave: boolean;
} {
  const existing = readSaveData();
  if (!existing) {
    const sim = new Simulation(DEFAULT_CONFIG);
    sim.seedFounders(FOUNDER_COUNT);
    return { sim, unlockedIds: new Set(), placements: [], hadLocalSave: false };
  }

  const sim = deserializeIntoSimulation(existing);
  const unlockedIds = readUnlockedIds(existing);
  const placements = readPlacements(existing);
  applyUnlockEffects(sim, unlockedIds);

  const elapsedRealMs = Date.now() - existing.savedAtRealMs;
  applyOfflineProgress(sim, elapsedRealMs);

  return { sim, unlockedIds, placements, hadLocalSave: true };
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
  const placementControls = document.createElement("div");
  placementControls.style.cssText = "display: flex; align-items: center; gap: 6px;";
  top.appendChild(placementControls);

  const placementHint = document.createElement("div");
  placementHint.style.cssText = `
    font-size: 12px; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.6);
    background: rgba(127,216,176,0.85); color: #0e1b16; padding: 6px 10px; border-radius: 8px;
    display: none;
  `;
  placementControls.appendChild(placementHint);

  // 拿起裝飾物（移動模式）才會顯示：讓玩家可以直接刪掉拿在手上的這一個實例，
  // 不用透過商店/圖鑑，跟「拿起來→點草地放下」共用同一套拿起狀態，只是多一個出口。
  const deleteDecorButton = document.createElement("button");
  deleteDecorButton.textContent = t("ui.btn.delete");
  deleteDecorButton.style.cssText = `
    pointer-events: auto; border: none; border-radius: 8px; padding: 6px 10px;
    font-size: 12px; font-weight: 600; color: #eaf3ee;
    background: rgba(214,80,80,0.9); box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    display: none;
  `;
  placementControls.appendChild(deleteDecorButton);

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

  const feedButton = makeButton(t("ui.btn.feed"), true);
  const shopButton = makeButton(t("ui.btn.shop"));
  const codexButton = makeButton(t("ui.btn.codex"));
  const exportButton = makeButton(t("ui.btn.export"));
  const importButton = makeButton(t("ui.btn.import"));
  const screenshotButton = makeButton(t("ui.btn.screenshot"));
  const resetButton = makeButton(t("ui.btn.reset"));

  // 匯入用的檔案選擇器本身不需要顯示，按 importButton 時用程式觸發它跳出系統選檔視窗即可。
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.style.display = "none";

  bottom.appendChild(speedRow);
  bottom.appendChild(feedButton);
  bottom.appendChild(shopButton);
  bottom.appendChild(codexButton);
  bottom.appendChild(exportButton);
  bottom.appendChild(importButton);
  bottom.appendChild(screenshotButton);
  bottom.appendChild(resetButton);
  overlay.appendChild(bottom);
  overlay.appendChild(importInput);

  root.appendChild(overlay);

  return {
    stats,
    placementHint,
    deleteDecorButton,
    speedButtons,
    feedButton,
    shopButton,
    codexButton,
    exportButton,
    importButton,
    importInput,
    screenshotButton,
    resetButton,
  };
}

/** 把 canvas 截圖用卡片顯示出來（同時嘗試觸發下載）：VIVERSE 的 iframe 若擋掉下載，
 *  至少畫面上還看得到、能長按/右鍵手動存，不會像直接觸發 <a download> 那樣完全沒反應。 */
function downloadScreenshot(dataUrl: string): void {
  showDownloadableImage(t("ui.btn.screenshot"), dataUrl, `pixel-terrarium-${new Date().toISOString().slice(0, 10)}.png`);
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
  if (days < 1) return t("ui.companion.minutes", { n: Math.max(1, Math.round(gameSeconds / 60)) });
  return t("ui.companion.days", { n: days.toFixed(1) });
}

const HTML_LANG_BY_LOCALE: Record<string, string> = { zh: "zh-Hant", "zh-cn": "zh-Hans", en: "en", ja: "ja", ko: "ko", es: "es" };

function main() {
  document.documentElement.lang = HTML_LANG_BY_LOCALE[locale] ?? "en";
  const root = document.getElementById("app")!;
  const { sim, unlockedIds, placements, hadLocalSave } = bootstrapSimulation();
  const scene = new TerrariumScene(root, sim);
  scene.setDecor(placements);
  sim.setDecorPlacements(placements);
  const ui = buildUI(root);

  // 重新開始／匯入存檔都會用 reload() 讓 bootstrapSimulation 用新的 localStorage 內容重新初始化；
  // 這段期間要跳過自動存檔，不然 reload() 觸發的 beforeunload 會用「重新整理前的最後狀態」把
  // 剛寫入的新內容蓋回去，玩家會看到畫面完全沒變，跟沒按到按鈕一樣。
  let resetting = false;

  // VIVERSE 登入狀態：只影響雲端存檔要不要跑，遊戲本身完全不等這個 resolve（見下方 initViverseAuth 呼叫）。
  let authToken: string | null = null;
  const profileChip = mountProfileChip(root, {
    onLogin: () => loginToViverse(),
    onLogout: async () => {
      await logoutFromViverse();
      authToken = null;
      profileChip.setGuest();
    },
  });

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

  ui.exportButton.addEventListener("click", () => {
    const json = JSON.stringify(serialize(sim, unlockedIds, placements), null, 2);
    showDownloadableText(t("ui.btn.export"), json, `pixel-terrarium-save-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
  });
  ui.screenshotButton.addEventListener("click", () => downloadScreenshot(scene.screenshotDataUrl()));
  ui.shopButton.addEventListener("click", () => shopPanel.toggle());
  ui.codexButton.addEventListener("click", () => codexPanel.toggle());

  ui.importButton.addEventListener("click", () => ui.importInput.click());
  ui.importInput.addEventListener("change", async () => {
    const file = ui.importInput.files?.[0];
    ui.importInput.value = ""; // 清空，不然選同一個檔案兩次不會再觸發 change
    if (!file) return;
    if (!(await showConfirm(t("ui.confirm.import")))) return;

    const text = await file.text();
    if (!importSaveFromJson(text)) {
      await showAlert(t("ui.alert.importFailed"));
      return;
    }
    resetting = true;
    window.location.reload();
  });

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
    setPlacementHint(unlockId ? t("ui.hint.place") : null);
  };
  const setMovingDecor = (placementId: string | null) => {
    movingDecorId = placementId;
    placingDecorUnlockId = null;
    setPlacementHint(placementId ? t("ui.hint.move") : null);
    ui.deleteDecorButton.style.display = placementId ? "inline-block" : "none";
    scene.setDraggingDecor(placementId); // 拿起來時變半透明，放下/取消時恢復
  };

  // 刪除：拿起裝飾物後才看得到這個按鈕，直接把該實例從 placements 移除——
  // scene.setDecor 本來就會把不在清單裡的 sprite 連同貼圖一起清掉（見 scene.ts），
  // 不用額外處理場景這一側。裝飾解鎖後可以無限次重新放置，刪除不影響解鎖進度，風險很低，不用二次確認。
  ui.deleteDecorButton.addEventListener("click", () => {
    if (!movingDecorId) return;
    const idx = placements.findIndex((p) => p.id === movingDecorId);
    if (idx !== -1) {
      placements.splice(idx, 1);
      scene.setDecor(placements);
      sim.setDecorPlacements(placements);
      saveGame(sim, unlockedIds, placements);
    }
    setMovingDecor(null);
  });
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
      sim.markVisitorFound(easterEggStateForTime(sim.time).kind);
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

    ui.stats.textContent = t("ui.stats", {
      season: SEASON_LABELS[seasonForTime(sim.time)],
      count: sim.creatures.length,
      companion: formatCompanionship(sim.time),
    });

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
      // 雲端存檔用同一個 20 秒節流：best-effort，失敗也不影響本地存檔，不用等它。
      if (authToken) saveToCloud(authToken, serialize(sim, unlockedIds, placements));
      lastAutosave = now;
    }

    if (shopPanel.isOpen()) shopPanel.update();
    if (codexPanel.isOpen()) codexPanel.update();
    if (creaturePanel.isOpen()) creaturePanel.update();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const persist = () => {
    if (resetting) return;
    saveGame(sim, unlockedIds, placements);
    if (authToken) saveBeacon(authToken, serialize(sim, unlockedIds, placements));
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist();
  });
  window.addEventListener("beforeunload", persist);

  ui.resetButton.addEventListener("click", async () => {
    if (!(await showConfirm(t("ui.confirm.reset")))) return;
    resetting = true;
    clearSaveData();
    window.location.reload();
  });

  // Auth 完全在背景跑，遊戲已經在上面立刻開始了，這裡不會、也不應該卡住任何東西。
  // resolve 後才決定要不要把本地存檔搬上雲端、或用雲端存檔覆蓋本地（見 mergeAndMaybeReload）。
  initViverseAuth().then((profile) => onAuthResolved(profile));

  async function onAuthResolved(profile: ViverseProfile): Promise<void> {
    profileChip.setProfile(profile);
    if (!profile.isAuthenticated || !profile.accessToken) return;
    authToken = profile.accessToken;
    await mergeAndMaybeReload(authToken);
  }

  /**
   * 首次登入／換裝置的合併規則：
   * - 完全沒有本地存檔（這台裝置是全新的、bootstrapSimulation 剛種出 8 隻始祖）：
   *   本地的 savedAtRealMs 一定是「現在」，用時間比較一定會誤判成本地比較新，
   *   所以只要雲端有存檔就直接採用雲端，不比時間——這才是「換裝置接續昨天進度」真正生效的情況。
   * - 本地本來就有真實進度：才用 savedAtRealMs 比大小決定誰是最新版本（同裝置重複登入、
   *   或兩台裝置都玩過的情況），避免舊的雲端存檔蓋掉裝置上比較新的本地進度。
   * 兩種情況都是沒有雲端存檔時，直接把本地（訪客期間的進度）上傳，完成 first-login 搬遷。
   */
  async function mergeAndMaybeReload(token: string): Promise<void> {
    const local = serialize(sim, unlockedIds, placements);
    const cloud = await loadFromCloud<SaveData>(token);
    if (!cloud) {
      await saveToCloud(token, local);
      return;
    }
    const cloudIsAuthoritative = !hadLocalSave || (cloud.savedAtRealMs ?? 0) > local.savedAtRealMs;
    if (cloudIsAuthoritative && importSaveFromJson(JSON.stringify(cloud))) {
      resetting = true;
      window.location.reload();
    }
  }
}

main();
