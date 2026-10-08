import type { SiteToken } from "@/lib/types";

/**
 * 轻量的本地缓存，用于网络不可用时降级展示分组模型与密钥列表。
 * 只缓存展示用数据，不含明文密钥；所有写入都做异常兜底。
 */
const PREFIX = "kuncode:cache:v1:";

function read<T>(key: string): { value: T; at: number } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: T; at: number };
    if (!parsed || typeof parsed !== "object" || !("value" in parsed))
      return null;
    return parsed;
  } catch {
    return null;
  }
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(
      PREFIX + key,
      JSON.stringify({ value, at: Date.now() }),
    );
  } catch {
    // 存储不可用时静默降级，不影响主流程。
  }
}

export function cacheGroupModels(
  connectionId: string,
  group: string,
  models: string[],
) {
  write(`group-models:${connectionId}:${group}`, models);
}

export function readCachedGroupModels(
  connectionId: string,
  group: string,
): string[] | null {
  return read<string[]>(`group-models:${connectionId}:${group}`)?.value ?? null;
}

export function cacheSiteTokens(connectionId: string, tokens: SiteToken[]) {
  write(`site-tokens:${connectionId}`, tokens);
}

export function readCachedSiteTokens(
  connectionId: string,
): { tokens: SiteToken[]; at: number } | null {
  const entry = read<SiteToken[]>(`site-tokens:${connectionId}`);
  return entry ? { tokens: entry.value, at: entry.at } : null;
}

/** 把缓存时间格式化为「刚刚 / N 分钟前 / N 小时前 / 日期」。 */
export function formatCacheAge(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return "刚刚";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return new Date(at).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}
