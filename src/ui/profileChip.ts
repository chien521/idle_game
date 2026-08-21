import type { ViverseProfile } from "../viverse/auth";
import { t } from "../i18n";

export interface ProfileChip {
  setGuest: () => void;
  setProfile: (profile: ViverseProfile) => void;
}

export interface ProfileChipDeps {
  onLogin: () => void;
  onLogout: () => void;
}

/**
 * 畫面右上角的登入狀態小卡：預設訪客，auth resolve 後才換成頭像+暱稱——
 * 遊戲本身完全不等這個結果（見 main.ts 的 auth-decoupled 啟動順序），純粹是狀態顯示。
 */
export function mountProfileChip(root: HTMLElement, { onLogin, onLogout }: ProfileChipDeps): ProfileChip {
  const chip = document.createElement("div");
  chip.style.cssText = `
    position: absolute; top: max(10px, env(safe-area-inset-top)); right: 14px;
    z-index: 960; pointer-events: auto; display: flex; align-items: center; gap: 6px;
    background: rgba(20,37,32,0.85); border: 1px solid rgba(234,243,238,0.15); border-radius: 20px;
    padding: 4px 10px 4px 4px; color: #eaf3ee; font-size: 12px; font-weight: 600;
    font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif;
  `;

  const avatar = document.createElement("div");
  avatar.style.cssText = `
    width: 22px; height: 22px; border-radius: 50%; flex: none; overflow: hidden;
    background: rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; font-size: 12px;
  `;
  chip.appendChild(avatar);

  const nameEl = document.createElement("span");
  chip.appendChild(nameEl);

  const actionBtn = document.createElement("button");
  actionBtn.style.cssText = `
    pointer-events: auto; border: none; border-radius: 12px; padding: 3px 8px;
    font-size: 11px; font-weight: 600; color: #0e1b16; background: #7fd8b0;
  `;
  chip.appendChild(actionBtn);

  let isAuthenticated = false;
  actionBtn.addEventListener("click", () => (isAuthenticated ? onLogout() : onLogin()));

  function renderAvatar(url: string | null): void {
    avatar.replaceChildren();
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
      avatar.appendChild(img);
    } else {
      avatar.textContent = "🔓";
    }
  }

  function setGuest(): void {
    isAuthenticated = false;
    renderAvatar(null);
    nameEl.textContent = t("ui.guest");
    actionBtn.textContent = t("ui.btn.login");
    actionBtn.title = t("ui.cloudSyncHint");
  }

  function setProfile(profile: ViverseProfile): void {
    isAuthenticated = profile.isAuthenticated;
    if (!profile.isAuthenticated) {
      setGuest();
      return;
    }
    renderAvatar(profile.avatarUrl);
    nameEl.textContent = profile.displayName ?? t("ui.guest");
    actionBtn.textContent = t("ui.btn.logout");
  }

  setGuest();
  root.appendChild(chip);

  return { setGuest, setProfile };
}
