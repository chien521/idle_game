import { resolveAppId } from "./config";

const STORAGE_SDK_URL = "https://www.viverse.com/static-assets/storage-sdk/1.0.0/storage-sdk.umd.js";
const CLOUD_SAVE_KEY = "game_save";
// 跟 storage-sdk 內部 upsert 端點同一個 URL，離開頁面時 saveBeacon 直接 fetch 這個端點，
// 不透過 CloudSaveClient——因為 client.setPlayerData 是一般 fetch（非 keepalive），頁面關閉時可能還沒送出。
const CLOUD_SAVE_UPSERT_URL_BASE = "https://broadcasting-gateway-gaming.vrprod.viveport.com/api/webrtcbot-service/v1/cloudsave";

let sdkLoadPromise: Promise<void> | null = null;

declare global {
  interface Window {
    storage?: { CloudSaveClient: new (appId: string) => CloudSaveClient };
  }
}

interface CloudSaveClient {
  setPlayerData(key: string, data: unknown, token: string): Promise<void>;
  getPlayerData(key: string, token: string): Promise<unknown>;
}

function loadStorageSdk(): Promise<void> {
  if (window.storage?.CloudSaveClient) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = STORAGE_SDK_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Storage SDK failed to load"));
    document.head.appendChild(script);
  });
  return sdkLoadPromise;
}

/** 雲端存檔失敗（沒登入、appId 缺失、SDK 載入失敗……）一律回傳 null／靜默失敗，
 *  呼叫端（main.ts）永遠有本地 localStorage 這條路可以退，不會因為雲端失敗卡住遊戲。 */
export async function saveToCloud(token: string, data: unknown): Promise<boolean> {
  const appId = resolveAppId();
  if (!appId || !token) return false;
  try {
    await loadStorageSdk();
    const client = new window.storage!.CloudSaveClient(appId);
    await client.setPlayerData(CLOUD_SAVE_KEY, data, token);
    return true;
  } catch (err) {
    console.warn("[viverse-storage] 雲端存檔失敗", err);
    return false;
  }
}

export async function loadFromCloud<T>(token: string): Promise<T | null> {
  const appId = resolveAppId();
  if (!appId || !token) return null;
  try {
    await loadStorageSdk();
    const client = new window.storage!.CloudSaveClient(appId);
    const data = await client.getPlayerData(CLOUD_SAVE_KEY, token);
    return (data as T) ?? null;
  } catch (err) {
    console.warn("[viverse-storage] 讀取雲端存檔失敗", err);
    return null;
  }
}

/** 離開頁面時的盡力存檔：用 fetch+keepalive，不是 navigator.sendBeacon——
 *  sendBeacon 沒辦法帶自訂 header，但這個端點需要 AccessToken header 才會被接受。 */
export function saveBeacon(token: string, data: unknown): void {
  const appId = resolveAppId();
  if (!appId || !token) return;
  try {
    fetch(`${CLOUD_SAVE_UPSERT_URL_BASE}/${appId}/upsert/${CLOUD_SAVE_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", AccessToken: token },
      body: JSON.stringify(data),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // best-effort only
  }
}
