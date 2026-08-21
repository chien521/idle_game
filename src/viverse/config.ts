// VIVERSE World 的 hostname 格式：<appId>.world.viverse.app 或 <appId>-preview.world.viverse.app，
// appId 固定是 10 碼小寫英數字。
const HOSTNAME_APP_ID_PATTERN = /^([a-z0-9]{10})(?:-preview)?\.world\.viverse\.app$/i;

/**
 * 解析目前這份 build 該用的 VIVERSE App ID：優先讀建置時注入的環境變數，
 * 讀不到（例如直接被丟到 Worlds iframe、環境變數沒帶到）才退回用網址 hostname 反推。
 * 兩者都拿不到就回傳空字串，呼叫端（auth/storage）要自己檢查空字串並跳過對應的 SDK 呼叫，
 * 不然 VIVERSE SDK 對空 clientId 不會拋錯，只會靜靜地逾時卡住。
 */
export function resolveAppId(): string {
  const envId = String(import.meta.env.VITE_VIVERSE_CLIENT_ID ?? "").trim();
  if (/^[a-z0-9]{10}$/i.test(envId)) return envId;

  const match = window.location.hostname.match(HOSTNAME_APP_ID_PATTERN);
  return match ? match[1].toLowerCase() : "";
}
