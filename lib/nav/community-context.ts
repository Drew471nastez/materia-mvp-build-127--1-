"use client"

/**
 * ===========================================================================
 *  THE COMMUNITY THE TAB BAR'S HOME BELONGS TO
 * ===========================================================================
 * Round 12: "once the person is inside a community, the tab bar's Home goes
 * to that community's home EVEN after they visit Profile, Library or Search
 * from the tab bar; the context ends only when they choose Explore, Discover
 * communities or Dashboard in the navigator (or open another community,
 * which becomes the context)."
 *
 * So the phone's tab bar (components/nav/buyer-tab-bar.tsx) remembers the
 * last community it was drawn inside, and its Home leads back there from the
 * person's own pages. Held in memory for the page and in sessionStorage for
 * the tab, so a reload of /account keeps it and a new tab starts clean. The
 * navigator (components/nav/place-navigator.tsx) ends it when one of its
 * three ways out is chosen.
 *
 * A slug is checked against the same shape the address is
 * (lib/nav/buyer-tabs.ts communityOf), so nothing else is ever put in a link.
 */
import { useSyncExternalStore } from "react"
import { tabStorageGet, tabStorageRemove, tabStorageSet } from "@/lib/nav/tab-session-persist"

export const COMMUNITY_CONTEXT_KEY = "storelib:community-context"
const COMMUNITY_CONTEXT_ID_KEY = "storelib:community-context-id"
const COMMUNITY_CONTEXT_NAME_KEY = "storelib:community-context-name"

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

/** undefined: not read from the tab yet; null: no community. */
let held: string | null | undefined
let heldId: string | null | undefined
let heldName: string | null | undefined
const listeners = new Set<() => void>()

function read(): string | null {
  if (held !== undefined) return held
  if (typeof window === "undefined") return null
  try {
    const raw = tabStorageGet(COMMUNITY_CONTEXT_KEY)
    held = raw && SLUG.test(raw) ? raw : null
  } catch {
    held = null
  }
  return held
}

function readId(): string | null {
  if (heldId !== undefined) return heldId
  if (typeof window === "undefined") return null
  try {
    heldId = tabStorageGet(COMMUNITY_CONTEXT_ID_KEY)
  } catch {
    heldId = null
  }
  return heldId
}

function readName(): string | null {
  if (heldName !== undefined) return heldName
  if (typeof window === "undefined") return null
  try {
    heldName = tabStorageGet(COMMUNITY_CONTEXT_NAME_KEY)
  } catch {
    heldName = null
  }
  return heldName
}

const EMPTY_META: { slug: string | null; id: string | null; name: string | null } = { slug: null, id: null, name: null }
let metaCache = EMPTY_META

function syncMetaCache() {
  const slug = held === undefined ? read() : held
  const id = heldId === undefined ? readId() : heldId
  const name = heldName === undefined ? readName() : heldName
  if (metaCache.slug === slug && metaCache.id === id && metaCache.name === name) return
  metaCache = { slug, id, name }
}

function write(next: string | null, meta?: { id?: string; name?: string }) {
  const curSlug = read()
  const curId = readId()
  const curName = readName()
  const sameSlug = curSlug === next
  const sameId = !meta?.id || curId === meta.id
  const sameName = !meta?.name || curName === meta.name
  if (sameSlug && sameId && sameName && (!meta || (sameId && sameName))) {
    if (meta?.id && curId !== meta.id) {
      heldId = meta.id
    } else if (meta?.name && curName !== meta.name) {
      heldName = meta.name
    } else {
      return
    }
  } else {
    held = next
    if (meta?.id) heldId = meta.id
    if (meta?.name) heldName = meta.name
  }
  try {
    if (next) {
      tabStorageSet(COMMUNITY_CONTEXT_KEY, next)
      if (meta?.id) tabStorageSet(COMMUNITY_CONTEXT_ID_KEY, meta.id)
      if (meta?.name) tabStorageSet(COMMUNITY_CONTEXT_NAME_KEY, meta.name)
      else if (heldId) tabStorageSet(COMMUNITY_CONTEXT_ID_KEY, heldId)
      else if (heldName) tabStorageSet(COMMUNITY_CONTEXT_NAME_KEY, heldName)
    } else {
      tabStorageRemove(COMMUNITY_CONTEXT_KEY)
      tabStorageRemove(COMMUNITY_CONTEXT_ID_KEY)
      tabStorageRemove(COMMUNITY_CONTEXT_NAME_KEY)
      heldId = null
      heldName = null
    }
  } catch {
    /* No storage (a private window): the page's memory still has it. */
  }
  syncMetaCache()
  listeners.forEach((f) => f())
}

/** The community Home leads to outside it, or null. */
export function communityContext(): string | null {
  return read()
}

/** Inside a community: it becomes the context (another one replaces it). */
export function enterCommunityContext(slug: string | null | undefined, meta?: { id?: string; name?: string }) {
  if (slug && SLUG.test(slug)) write(slug, meta)
}

export function communityContextId(): string | null {
  return readId()
}

export function communityContextName(): string | null {
  return readName()
}

function readMeta() {
  syncMetaCache()
  return metaCache
}

export function useCommunityContextMeta(): { slug: string | null; id: string | null; name: string | null } {
  return useSyncExternalStore(subscribe, readMeta, () => EMPTY_META)
}

/** Explore, Discover communities or Dashboard chosen in the navigator: Home is Storelib's again. */
export function endCommunityContext() {
  write(null)
}

/** The navigator's rows that end the context. */
export const ENDS_COMMUNITY_CONTEXT: ReadonlySet<string> = new Set(["explore", "discover-communities", "dashboard"])

/**
 * ===========================================================================
 *  AND HOME IS THE COMMUNITY'S BEFORE THE PAGE IS AWAKE
 * ===========================================================================
 * THIS IS WHY THE CONTEXT DID NOT WORK. The community is held in the browser
 * alone, so the SERVER, which renders the bar for every load that is not a
 * step inside the app, cannot know it: `useCommunityContext` answers null on
 * the server and again on the first (hydrating) render, so the Home tab is
 * served as <a href="/explore">. The store only corrects it a moment later,
 * on a passive effect. Measured on a phone's CPU: 227ms from the first paint,
 * and that is in a bare page. The tabs are real links the whole of that time,
 * so a reload of /account, a link opened into it, or the phone app's own full
 * loads all serve a Home that goes to Explore, and a thumb that arrives
 * before the page has woken up follows it.
 *
 * So the press is answered before anything of React is running: one capture
 * listener, printed with the bar, that reads the same key and sends a press
 * on Home to the community instead. It does nothing at all when there is no
 * community to go back to, and nothing in the document is touched, so there
 * is no mark on the page for React to disagree with when it hydrates.
 *
 * AND IT STANDS DOWN THE MOMENT THE BAR IS LIVE, by two separate things,
 * because one of them has a seam in it. The link's own href becomes the
 * community's once the store has corrected it, and the listener leaves a
 * `/community/...` href alone; but the bar hydrates a moment BEFORE that
 * correction lands, and in that moment the bar's own gesture answers the
 * press (from the context as it stands, AND THE PRESS READS THE CONTEXT
 * AGAIN in components/nav/buyer-tab-bar) while the href still says
 * /explore. Both would then answer the same press, with the same
 * destination, the listener's whole page load throwing away the bar's step
 * inside the app. So the bar raises a flag on itself while it is mounted and
 * the listener yields to it. The listener is then exactly what it is for:
 * the press that lands before the page is awake, and nothing else.
 *
 * The same shape as the explore scroll's boot script (lib/explore/explore-
 * scroll-boot.ts): small, wrapped in try, and guarded so the copy React
 * re-inserts on the next page does not add a second listener.
 */
export const COMMUNITY_HOME_BOOT_FLAG = "__storelibCommunityHome"
/** Raised by the bar while it is mounted; the listener yields to it (AND IT STANDS DOWN, above). */
export const COMMUNITY_HOME_LIVE_FLAG = "__storelibTabBarLive"
export const COMMUNITY_HOME_BOOT = `(function(){try{var w=window;if(w.${COMMUNITY_HOME_BOOT_FLAG})return;w.${COMMUNITY_HOME_BOOT_FLAG}=1;var K=${JSON.stringify(COMMUNITY_CONTEXT_KEY)},S=/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;function ctx(){var s=null;try{s=sessionStorage.getItem(K)}catch(x){}if(!s){try{s=localStorage.getItem(K)}catch(x){}}return s}addEventListener("click",function(e){if(w.${COMMUNITY_HOME_LIVE_FLAG})return;if(e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var t=e.target,a=t&&t.closest?t.closest('a[data-buyer-tab="home"]'):null;if(!a)return;var h=a.getAttribute("href")||"";if(h.indexOf("/community/")===0)return;var s=ctx();if(!s||!S.test(s))return;e.preventDefault();location.href="/community/"+s},true)}catch(x){}})();`

function subscribe(f: () => void) {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}

/** The context, for a component: none on the server and on the first (hydrating) render, then the tab's. */
export function useCommunityContext(): string | null {
  return useSyncExternalStore(subscribe, read, () => null)
}
