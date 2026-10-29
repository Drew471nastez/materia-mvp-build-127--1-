/**
 * What the /app search opened last, offered first when its field is empty
 * (components/app/app-search.tsx). Kept in this browser only, per person:
 * the name drawn, its line and where it opens. Never sent anywhere.
 *
 * A storage that throws (a private window, blocked site data) is an empty
 * list, and the search works the same without it.
 */
export interface RecentItem {
  title: string
  detail?: string
  href: string
}

export const RECENT_KEY = "storelib:app-search:recent"
/** Enough to find the thing opened yesterday, few enough to read at a glance. */
export const RECENT_MAX = 5

/** The item put first, once: the same place opened again moves up rather than appearing twice. */
export function withRecent(list: readonly RecentItem[], item: RecentItem, max = RECENT_MAX): RecentItem[] {
  const clean: RecentItem = { title: item.title.slice(0, 120), href: item.href, ...(item.detail ? { detail: item.detail.slice(0, 160) } : {}) }
  return [clean, ...list.filter((r) => r.href !== item.href)].slice(0, max)
}

/** A stored list, read defensively: anything that is not a list of items is no list. */
export function parseRecent(raw: string | null | undefined): RecentItem[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v
      .filter((r): r is RecentItem => !!r && typeof r.title === "string" && typeof r.href === "string" && r.href.startsWith("/"))
      .slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

export function readRecent(): RecentItem[] {
  try {
    return parseRecent(window.localStorage.getItem(RECENT_KEY))
  } catch {
    return []
  }
}

export function writeRecent(list: readonly RecentItem[]): void {
  try {
    if (list.length) window.localStorage.setItem(RECENT_KEY, JSON.stringify(list))
    else window.localStorage.removeItem(RECENT_KEY)
  } catch {
    /* Not kept: the search works the same. */
  }
}
