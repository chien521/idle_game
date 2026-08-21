import { t } from "../i18n";

/**
 * 取代 window.confirm/alert 跟直接靠 <a download>.click() 觸發下載：VIVERSE 把遊戲嵌在 iframe 裡，
 * 如果那個 iframe 的 sandbox 沒開 allow-modals/allow-downloads，原生 confirm/alert 會被靜默吃掉、
 * 下載連結點了也完全沒反應——玩家會覺得按鈕壞了。這裡全部改成畫面內的卡片，不依賴任何可能被
 * iframe 限制擋掉的瀏覽器原生 API，在哪個環境都能用。下載類仍然「順便」嘗試原生下載當作額外方便，
 * 但一定會同時把內容顯示在卡片上，讓下載被擋掉時玩家還是能手動存（長按圖片/選取文字複製）。
 */

interface DialogRefs {
  backdrop: HTMLDivElement;
  message: HTMLDivElement;
  body: HTMLDivElement;
  actions: HTMLDivElement;
}

let refs: DialogRefs | null = null;

function ensureMounted(): DialogRefs {
  if (refs) return refs;
  const backdrop = document.createElement("div");
  backdrop.style.cssText = `
    position: absolute; inset: 0; z-index: 1000; display: none;
    background: rgba(6, 14, 11, 0.75); pointer-events: auto;
    align-items: center; justify-content: center; padding: 20px;
  `;
  const card = document.createElement("div");
  card.style.cssText = `
    width: min(360px, 100%); max-height: 80vh; overflow-y: auto;
    background: #142520; border: 1px solid rgba(234,243,238,0.15); border-radius: 14px;
    padding: 18px; color: #eaf3ee;
    font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", sans-serif;
  `;
  backdrop.appendChild(card);

  const message = document.createElement("div");
  message.style.cssText = "font-size: 14px; line-height: 1.5; margin-bottom: 14px;";
  card.appendChild(message);

  const body = document.createElement("div");
  body.style.cssText = "margin-bottom: 14px;";
  card.appendChild(body);

  const actions = document.createElement("div");
  actions.style.cssText = "display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap;";
  card.appendChild(actions);

  document.body.appendChild(backdrop);
  refs = { backdrop, message, body, actions };
  return refs;
}

function makeButton(label: string, primary: boolean): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.style.cssText = `
    pointer-events: auto; border: none; border-radius: 8px; padding: 8px 14px;
    font-size: 13px; font-weight: 600; color: ${primary ? "#0e1b16" : "#eaf3ee"};
    background: ${primary ? "#7fd8b0" : "rgba(234,243,238,0.12)"};
  `;
  return btn;
}

function openDialog(fill: (r: DialogRefs) => void): DialogRefs {
  const r = ensureMounted();
  r.body.replaceChildren();
  r.actions.replaceChildren();
  fill(r);
  r.backdrop.style.display = "flex";
  return r;
}

export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const r = openDialog((r) => {
      r.message.textContent = message;
    });
    const close = (result: boolean) => {
      r.backdrop.style.display = "none";
      resolve(result);
    };
    const cancelBtn = makeButton(t("dialog.cancel"), false);
    const okBtn = makeButton(t("dialog.ok"), true);
    cancelBtn.addEventListener("click", () => close(false));
    okBtn.addEventListener("click", () => close(true));
    r.actions.append(cancelBtn, okBtn);
  });
}

export function showAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    const r = openDialog((r) => {
      r.message.textContent = message;
    });
    const okBtn = makeButton(t("dialog.ok"), true);
    okBtn.addEventListener("click", () => {
      r.backdrop.style.display = "none";
      resolve();
    });
    r.actions.append(okBtn);
  });
}

function attemptNativeDownload(url: string, filename: string): void {
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  } catch {
    // 被擋掉也無所謂，卡片本身已經顯示了可以手動存的內容
  }
}

export function showDownloadableImage(title: string, dataUrl: string, filename: string): void {
  const r = openDialog((r) => {
    r.message.textContent = title;
    const img = document.createElement("img");
    img.src = dataUrl;
    img.style.cssText = "max-width: 100%; border-radius: 8px; image-rendering: pixelated; display: block;";
    r.body.appendChild(img);
    const hint = document.createElement("div");
    hint.style.cssText = "font-size: 11px; opacity: 0.7; margin-top: 8px;";
    hint.textContent = t("dialog.saveImageHint");
    r.body.appendChild(hint);
  });
  const closeBtn = makeButton(t("dialog.close"), false);
  closeBtn.addEventListener("click", () => (r.backdrop.style.display = "none"));
  const downloadBtn = makeButton(t("ui.btn.screenshot"), true);
  downloadBtn.addEventListener("click", () => attemptNativeDownload(dataUrl, filename));
  r.actions.append(closeBtn, downloadBtn);
  attemptNativeDownload(dataUrl, filename); // 沒被擋掉的環境（例如一般網頁）順便直接觸發一次
}

export function showDownloadableText(title: string, text: string, filename: string, mime: string): void {
  const r = openDialog((r) => {
    r.message.textContent = title;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.cssText = `
      width: 100%; height: 160px; box-sizing: border-box; resize: vertical;
      background: rgba(255,255,255,0.06); color: #eaf3ee; border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px; padding: 8px; font-size: 11px; font-family: ui-monospace, monospace;
    `;
    r.body.appendChild(textarea);
    const hint = document.createElement("div");
    hint.style.cssText = "font-size: 11px; opacity: 0.7; margin-top: 8px;";
    hint.textContent = t("dialog.copyHint");
    r.body.appendChild(hint);
  });

  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);

  const closeBtn = makeButton(t("dialog.close"), false);
  closeBtn.addEventListener("click", () => {
    r.backdrop.style.display = "none";
    URL.revokeObjectURL(url);
  });
  const copyBtn = makeButton(t("dialog.copy"), false);
  copyBtn.addEventListener("click", async () => {
    const textarea = r.body.querySelector("textarea");
    textarea?.select();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      document.execCommand("copy"); // clipboard API 在受限環境可能不能用，退回舊式複製
    }
  });
  const downloadBtn = makeButton(t("ui.btn.export"), true);
  downloadBtn.addEventListener("click", () => attemptNativeDownload(url, filename));
  r.actions.append(closeBtn, copyBtn, downloadBtn);
  attemptNativeDownload(url, filename); // 沒被擋掉的環境順便直接觸發一次
}
