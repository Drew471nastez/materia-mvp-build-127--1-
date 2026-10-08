import type { TopBarData } from "@/components/community/member/view-types"
import { tabStorageGet, tabStorageSet } from "@/lib/nav/tab-session-persist"

const KEY = "storelib:community-chrome"
const MAX_AGE_MS = 30 * 60_000

type Saved = { slug: string; data: TopBarData; at: number }

let memory: Saved | null = null
let shown: { slug: string; data: TopBarData } | null = null
const listeners = new Set<() => void>()

function valid(data: TopBarData | null | undefined, slug: string): data is TopBarData {
  return !!data && data.community?.slug === slug && typeof data.community.name === "string"
}

export function rememberCommunityChrome(slug: string, data: TopBarData) {
  if (!valid(data, slug)) return
  const next: Saved = { slug, data, at: Date.now() }
  memory = next
  try {
    tabStorageSet(KEY, JSON.stringify(next))
  } catch {
    /* The memory copy is enough for this visit. */
  }
}

export function readCommunityChrome(slug: string): TopBarData | null {
  if (memory && memory.slug === slug && Date.now() - memory.at < MAX_AGE_MS && valid(memory.data, slug)) return memory.data
  try {
    const raw = tabStorageGet(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Saved
    if (!parsed || parsed.slug !== slug || Date.now() - parsed.at > MAX_AGE_MS || !valid(parsed.data, slug)) return null
    memory = parsed
    return parsed.data
  } catch {
    return null
  }
}

/** The account page has a community bar ready to draw (header switch hides Storelib's). */
export function publishAccountChrome(slug: string | null, data: TopBarData | null) {
  const next = slug && data && valid(data, slug) ? { slug, data } : null
  if (shown?.slug === next?.slug && shown?.data === next?.data) return
  shown = next
  listeners.forEach((fn) => fn())
}

export function accountChromeReady(slug: string | null): boolean {
  return !!(slug && shown?.slug === slug)
}

export function subscribeAccountChrome(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
