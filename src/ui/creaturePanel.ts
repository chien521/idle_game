import type { Simulation } from "../simulation";
import { UNLOCKS } from "../unlocks";
import { VISITOR_LABELS } from "../easterEgg";
import { t } from "../i18n";

export interface CreaturePanel {
  show: (creatureId: string) => void;
  hide: () => void;
  update: () => void;
  isOpen: () => boolean;
}

function formatCompanionship(gameSeconds: number): string {
  const days = gameSeconds / (60 * 60 * 24);
  if (days < 1) return t("ui.companion.minutes", { n: Math.max(1, Math.round(gameSeconds / 60)) });
  return t("ui.companion.days", { n: days.toFixed(1) });
}

/**
 * 點一隻寵物就浮現的小卡片：顯示/可編輯牠的名字，還有陪伴時間。
 * 不是全螢幕 modal（不加 backdrop），只是貼在畫面下方的小卡，不擋住後面的場景。
 */
export function mountCreaturePanel(root: HTMLElement, sim: Simulation): CreaturePanel {
  const card = document.createElement("div");
  card.style.cssText = `
    position: absolute; left: 50%; bottom: 78px; transform: translateX(-50%);
    z-index: 950; display: none; pointer-events: auto;
    background: #142520; border: 1px solid rgba(234,243,238,0.18); border-radius: 14px;
    padding: 10px 14px; color: #eaf3ee; min-width: 200px; max-width: min(320px, 82vw);
    font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif;
    box-shadow: 0 6px 18px rgba(0,0,0,0.4);
  `;

  const row = document.createElement("div");
  row.style.cssText = "display: flex; align-items: center; gap: 8px;";

  const nameInput = document.createElement("input");
  nameInput.maxLength = 12;
  nameInput.style.cssText = `
    flex: 1; min-width: 0; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18);
    border-radius: 8px; padding: 6px 8px; color: #eaf3ee; font-size: 13px; font-weight: 600;
  `;

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = `
    pointer-events: auto; border: none; border-radius: 8px; width: 26px; height: 26px; flex: none;
    background: rgba(234,243,238,0.12); color: #eaf3ee; font-size: 12px;
  `;

  row.appendChild(nameInput);
  row.appendChild(closeBtn);
  card.appendChild(row);

  const info = document.createElement("div");
  info.style.cssText = "font-size: 11px; opacity: 0.7; margin-top: 6px;";
  card.appendChild(info);

  let currentId: string | null = null;

  const commitName = () => {
    if (!currentId) return;
    sim.renameCreature(currentId, nameInput.value);
    update();
  };
  nameInput.addEventListener("change", commitName);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") nameInput.blur();
  });
  // 點輸入框本身不該被畫面上的 tap-to-pet 邏輯吃掉（那是掛在 canvas 上的監聽器，DOM 輸入框天生就不會觸發，
  // 這裡 stopPropagation 純粹避免點卡片時意外冒泡到其他可能的外層監聽器）。
  card.addEventListener("click", (e) => e.stopPropagation());

  function hide(): void {
    currentId = null;
    card.style.display = "none";
  }

  closeBtn.addEventListener("click", hide);

  function update(): void {
    if (!currentId) return;
    const creature = sim.creatures.find((c) => c.id === currentId);
    if (!creature) {
      hide();
      return;
    }
    if (document.activeElement !== nameInput) nameInput.value = creature.name;
    const companionship = sim.time - creature.bornAt;
    const favoriteLabel = UNLOCKS.find((u) => u.decorShape === creature.favoriteDecor)?.label ?? "";
    const taintLine = creature.taintedBy ? `　${t("creature.taintedBy", { name: VISITOR_LABELS[creature.taintedBy] })}` : "";
    info.textContent = `${formatCompanionship(companionship)}${creature.genome.rare ? `　${t("creature.rare")}` : ""}${
      favoriteLabel ? `　${t("creature.favorite", { name: favoriteLabel })}` : ""
    }${taintLine}`;
  }

  function show(creatureId: string): void {
    currentId = creatureId;
    card.style.display = "block";
    update();
  }

  root.appendChild(card);

  return { show, hide, update, isOpen: () => card.style.display !== "none" };
}
