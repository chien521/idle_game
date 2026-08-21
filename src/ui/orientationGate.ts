import { t } from "../i18n";

const MAX_PORTRAIT_WIDTH = 820; // 用寬度粗略排除「桌機視窗只是縮窄」的情況，鎖定手機/小平板量級的螢幕

/**
 * 世界本身是偏橫向的一片地，直向手機螢幕硬套同樣的相機取景邏輯，可視寬度會被壓縮到只剩不到
 * 四成，寵物大部分時間都晃到看不見的區域——這是世界形狀跟直向螢幕的根本衝突，不是相機參數
 * 能解決的，所以只正式支援橫向，直向時蓋一層提示請玩家轉裝置，並提供略過給堅持要直向玩的人。
 */
export function mountOrientationGate(root: HTMLElement): void {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: absolute; inset: 0; z-index: 1500; display: none;
    background: rgba(6, 14, 11, 0.92); pointer-events: auto;
    align-items: center; justify-content: center; padding: 24px; text-align: center;
    font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif;
  `;

  const card = document.createElement("div");
  card.style.cssText = `
    max-width: 320px; background: #142520; border: 1px solid rgba(234,243,238,0.15);
    border-radius: 14px; padding: 24px 20px; color: #eaf3ee;
  `;
  overlay.appendChild(card);

  const icon = document.createElement("div");
  icon.textContent = "🔄📱";
  icon.style.cssText = "font-size: 36px; margin-bottom: 14px;";
  card.appendChild(icon);

  const title = document.createElement("div");
  title.style.cssText = "font-size: 16px; font-weight: 700; margin-bottom: 8px;";
  card.appendChild(title);

  const hint = document.createElement("div");
  hint.style.cssText = "font-size: 13px; line-height: 1.6; opacity: 0.85; margin-bottom: 18px;";
  card.appendChild(hint);

  const skipBtn = document.createElement("button");
  skipBtn.style.cssText = `
    pointer-events: auto; border: none; border-radius: 8px; padding: 8px 16px;
    font-size: 13px; font-weight: 600; color: #0e1b16; background: #7fd8b0;
  `;
  card.appendChild(skipBtn);

  root.appendChild(overlay);

  // 「已略過」只在維持直向期間有效：一旦轉成橫向，視為新的一輪判斷，下次轉回直向會重新提示，
  // 避免略過一次之後永久失效、之後真的忘記轉回橫向也再也看不到提醒。
  let skipped = false;

  function shouldPrompt(): boolean {
    return window.innerWidth < window.innerHeight && window.innerWidth <= MAX_PORTRAIT_WIDTH;
  }

  function evaluate(): void {
    const portrait = shouldPrompt();
    if (!portrait) {
      skipped = false;
      overlay.style.display = "none";
      return;
    }
    overlay.style.display = skipped ? "none" : "flex";
  }

  function applyText(): void {
    title.textContent = t("orientation.title");
    hint.textContent = t("orientation.hint");
    skipBtn.textContent = t("orientation.skip");
  }

  skipBtn.addEventListener("click", () => {
    skipped = true;
    evaluate();
  });

  applyText();
  evaluate();
  window.addEventListener("resize", evaluate);
  window.addEventListener("orientationchange", evaluate);
}
