import { resolveAppId } from "./config";

export interface ViverseProfile {
  isAuthenticated: boolean;
  accessToken: string | null;
  accountId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

const GUEST_PROFILE: ViverseProfile = {
  isAuthenticated: false,
  accessToken: null,
  accountId: null,
  displayName: null,
  avatarUrl: null,
};

const AUTH_DOMAIN = "account.htcvive.com"; // VIVERSE 規定的 auth domain，不能用 viverse.com
const HANDSHAKE_DELAY_MS = 1200; // SDK 偵測到之後要等 iframe 訊息橋接穩定，太早呼叫 checkAuth 會拿到假的「沒登入」
const SDK_POLL_INTERVAL_MS = 100;
const SDK_POLL_MAX_ATTEMPTS = 50;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectSdk(): any {
  return (window as any).viverse || (window as any).VIVERSE_SDK || (window as any).vSdk;
}

async function waitForSdk(): Promise<any> {
  for (let attempt = 0; attempt < SDK_POLL_MAX_ATTEMPTS; attempt++) {
    const sdk = detectSdk();
    if (sdk && typeof sdk.client === "function") return sdk;
    await delay(SDK_POLL_INTERVAL_MS);
  }
  return null;
}

function hasIdentity(p: Record<string, unknown> | null | undefined): boolean {
  return !!(p && (p.name || p.displayName || p.display_name || p.nickName || p.nickname || p.userName || p.email));
}

function hasAvatar(p: Record<string, unknown> | null | undefined): boolean {
  const activeAvatar = p?.activeAvatar as Record<string, unknown> | undefined;
  return !!(p && (activeAvatar?.avatarUrl || p.avatarUrl || p.avatar_url || p.profilePicUrl));
}

/**
 * 依 skill 建議的多層 fallback 依序嘗試補齊使用者資料：avatar SDK → getUserInfo → getUser → getProfileByToken。
 * 任何一層失敗都吞掉繼續往下一層試，全部失敗就回傳目前已經合併到的東西（可能是空物件）。
 */
async function fetchProfile(sdk: any, client: any, token: string, appId: string): Promise<Record<string, unknown>> {
  let merged: Record<string, unknown> = {};
  const merge = (p: unknown) => {
    if (p && typeof p === "object") merged = { ...merged, ...(p as Record<string, unknown>) };
  };
  const needsMore = () => !hasIdentity(merged) || !hasAvatar(merged);

  if (sdk?.avatar) {
    try {
      const avatarClient = new sdk.avatar({
        baseURL: "https://sdk-api.viverse.com/",
        accessToken: token,
        token,
        authorization: token,
        appId,
        clientId: appId,
      });
      merge(await avatarClient.getProfile());
    } catch {
      // 忽略，往下一層 fallback
    }
  }
  if (needsMore() && client?.getUserInfo) {
    try {
      merge(await client.getUserInfo());
    } catch {
      // ignore
    }
  }
  if (needsMore() && client?.getUser) {
    try {
      merge(await client.getUser());
    } catch {
      // ignore
    }
  }
  if (needsMore() && client?.getProfileByToken) {
    try {
      merge(await client.getProfileByToken(token));
    } catch {
      // ignore
    }
  }
  return merged;
}

function extractDisplayName(profile: Record<string, unknown>): string {
  return (
    (profile.displayName as string) ||
    (profile.display_name as string) ||
    (profile.name as string) ||
    (profile.nickname as string) ||
    (profile.userName as string) ||
    (profile.email as string) ||
    "VIVERSE Player"
  );
}

function extractAvatarUrl(profile: Record<string, unknown>): string | null {
  const activeAvatar = profile.activeAvatar as Record<string, unknown> | undefined;
  return (
    (activeAvatar?.headIconUrl as string) ||
    (activeAvatar?.head_icon_url as string) ||
    (profile.headIconUrl as string) ||
    (profile.head_icon_url as string) ||
    (profile.avatarUrl as string) ||
    (profile.avatar_url as string) ||
    null
  );
}

let bootstrapped = false; // 整個 session 只跑一次，避免重複 initialize 造成 race
let clientInstance: any = null;

/**
 * 背景初始化 VIVERSE 登入狀態，永遠不會 throw、也永遠會 resolve——呼叫端不需要（也不應該）
 * 等這個結果才開始遊戲。本地開發（無 HTTPS、無註冊 redirect URI）SDK 呼叫本來就會逾時，
 * 這裡逾時/失敗都視為訪客，遊戲照常運作。
 */
export async function initViverseAuth(): Promise<ViverseProfile> {
  if (bootstrapped) return GUEST_PROFILE;
  bootstrapped = true;

  try {
    const appId = resolveAppId();
    if (!appId) {
      console.warn("[viverse-auth] 沒有可用的 App ID，略過登入初始化，以訪客模式運作。");
      return GUEST_PROFILE;
    }

    const sdk = await waitForSdk();
    if (!sdk) {
      console.warn("[viverse-auth] 找不到 VIVERSE SDK（本地開發環境正常現象），以訪客模式運作。");
      return GUEST_PROFILE;
    }

    await delay(HANDSHAKE_DELAY_MS);

    const client = new sdk.client({ clientId: appId, domain: AUTH_DOMAIN });
    clientInstance = client;

    const auth = await client.checkAuth();
    if (!auth?.access_token) return GUEST_PROFILE;

    const profile = await fetchProfile(sdk, client, auth.access_token, appId);
    return {
      isAuthenticated: true,
      accessToken: auth.access_token,
      accountId: auth.account_id ?? null,
      displayName: extractDisplayName(profile),
      avatarUrl: extractAvatarUrl(profile),
    };
  } catch (err) {
    console.warn("[viverse-auth] 初始化失敗，以訪客模式運作", err);
    return GUEST_PROFILE;
  }
}

/** 導向 VIVERSE 登入頁；成功後會帶著 session 導回本頁，交由下次 initViverseAuth 重新解析。 */
export function loginToViverse(): void {
  clientInstance?.loginWithWorlds?.({});
}

export async function logoutFromViverse(): Promise<void> {
  await clientInstance?.logout?.().catch(() => {});
}
