import { useLayoutEffect, useSyncExternalStore } from "react"

/**
 * ===========================================================================
 *  EVERY LAYER OVER THE PAGE, COUNTED
 * ===========================================================================
 * "Sometimes the mobile nav bar disappears, really weird. It hides the mobile
 * nav bar and I have to do something so that it appears again."
 *
 * A layer is anything drawn over the page for a while: a page layer in the
 * app (the product editor, the plans page), the composer, the picture viewer,
 * an opened post, the search screen. Each used to say it was there by adding a
 * class or an attribute on <html> when it mounted and taking it off when it
 * unmounted, one switch per layer. A switch has no count: two layers that
 * overlap (one closing while the next opens) leave it in whatever state the
 * last of them wrote, and a class the server printed for a layer that never
 * ran its effect stays on for the rest of the visit. Nothing then says the
 * page is clear again.
 *
 * So every layer registers here and releases what it registered:
 *
 *   COUNTED          openLayer() returns a release that works once; the html
 *                    class for a kind is on exactly while its count is above
 *                    zero, so one leaving while the next arrives leaves it on,
 *                    and the last one leaving takes it off.
 *   SWEPT            sweepLayers() (on every route change, on a page shown
 *                    again from the back cache, and when a layer registers)
 *                    lets go of an entry whose element has left the document,
 *                    and takes off a class nobody holds and no element on the
 *                    page stands for. That is how a class printed by the
 *                    server cannot outlive its layer.
 *   DECIDED PER KIND whether it covers the phone's tab bar (LAYER_KINDS).
 *
 * WHAT A LAYER DOES TO THE TAB BAR (round 15, ARCH item 8):
 *
 *   covers           the composer, the picture viewer, the search screens, a
 *                    page layer, Settings over the profile: drawn over the bar, which stays exactly where
 *                    it is underneath, never slid away, so it is simply there
 *                    the moment the layer has gone.
 *   bar over it      (no kind since round 25.) An opened post was
 *                    Instagram's model, the bar lifted over it; it is a
 *                    bottom sheet now and covers the bar like the composer.
 *   neither          a sheet or a dialog: over the bar by its own z, and the
 *                    bar is left as it is.
 *
 * The bar reads this through useTabBarLayers(); <html> carries the answer too
 * (data-tabs-covered, data-tabs-over) for the stylesheet.
 */

export type LayerKind =
  /** A page drawn over the whole app shell at every width (components/app/page-layer.tsx). */
  | "page"
  /** The same below 768px only (the product editor). */
  | "phone-page"
  /** New post and Edit post on a phone, the whole window. */
  | "composer"
  /** The picture and video viewer. */
  | "viewer"
  /** An opened post (a bottom sheet on a phone): drawn over the bar. */
  | "post"
  /** The site's search screen and a community's. */
  | "search"
  /** A bottom sheet or a dialog. */
  | "sheet"
  /** Any other screen over the whole window: Settings over the profile on a phone. */
  | "screen"

type KindRule = {
  /** Drawn over the tab bar: the bar holds still under it and ignores the keyboard while it is open. */
  covers: boolean
  /** The tab bar is lifted over this layer while it is open. */
  barOver: boolean
  /** The class on <html> while one is open, for the stylesheet. */
  htmlClass?: string
}

export const LAYER_KINDS: Record<LayerKind, KindRule> = {
  page: { covers: true, barOver: false, htmlClass: "has-page-layer" },
  "phone-page": { covers: true, barOver: false, htmlClass: "has-phone-page-layer" },
  composer: { covers: true, barOver: false },
  viewer: { covers: true, barOver: false },
  /* Round 25: an opened post is the website builder's bottom sheet on a phone, over the whole app as New post is. */
  post: { covers: true, barOver: false },
  search: { covers: true, barOver: false },
  sheet: { covers: false, barOver: false },
  screen: { covers: true, barOver: false },
}

/** The attribute a layer's element carries, so a sweep can tell a class printed for it from one left behind. */
export const LAYER_ATTR = "data-layer-kind"

type Entry = { kind: LayerKind; el: (() => Element | null) | null; at: number }

let nextId = 1
const entries = new Map<number, Entry>()
const listeners = new Set<() => void>()
/* What subscribers last saw: a new object only when the answer changes, as useSyncExternalStore needs. */
let snapshot: TabBarLayers = { covered: false, over: false, count: 0 }

export type TabBarLayers = {
  /** A layer that covers the tab bar is open. */
  covered: boolean
  /** A layer the tab bar stays over is open, and nothing covers the bar. */
  over: boolean
  /** How many layers are open, of every kind. */
  count: number
}

const hasDom = () => typeof document !== "undefined" && !!document.documentElement

function compute(): TabBarLayers {
  let covered = false
  let over = false
  for (const e of entries.values()) {
    const rule = LAYER_KINDS[e.kind]
    if (rule.covers) covered = true
    if (rule.barOver) over = true
  }
  return { covered, over: over && !covered, count: entries.size }
}

/** How many layers of this kind (or of every kind) are open. */
export function layerCount(kind?: LayerKind): number {
  if (!kind) return entries.size
  let n = 0
  for (const e of entries.values()) if (e.kind === kind) n++
  return n
}

/** Whether any layer is open: the edge swipe leaves the screen to it (lib/navigation/edge-swipe.ts). */
export function anyLayerOpen(): boolean {
  return entries.size > 0
}

/** The tab bar's answer as it stands. */
export function tabBarLayers(): TabBarLayers {
  return snapshot
}

/** Writes the answer onto <html> and tells whoever listens, when it changed. */
function publish() {
  if (hasDom()) {
    const html = document.documentElement
    for (const [kind, rule] of Object.entries(LAYER_KINDS) as Array<[LayerKind, KindRule]>) {
      if (!rule.htmlClass) continue
      if (layerCount(kind) > 0) html.classList.add(rule.htmlClass)
      else if (!elementStandsFor(kind)) html.classList.remove(rule.htmlClass)
    }
  }
  const next = compute()
  if (hasDom()) {
    const html = document.documentElement
    html.toggleAttribute("data-tabs-covered", next.covered)
    html.toggleAttribute("data-tabs-over", next.over)
  }
  if (next.covered === snapshot.covered && next.over === snapshot.over && next.count === snapshot.count) return
  snapshot = next
  for (const fn of [...listeners]) fn()
}

/*
  A LAYER STILL WAITING FOR ITS EFFECT. The server prints a layer's class
  before React runs (components/platform/html-class.tsx), and the layer's own
  element is in the document from that moment, carrying LAYER_ATTR. Until its
  effect registers it, that element is what keeps the class on; once the
  element is gone, nothing does.
*/
function elementStandsFor(kind: LayerKind): boolean {
  if (!hasDom()) return false
  return !!document.querySelector(`[${LAYER_ATTR}="${kind}"]`)
}

/**
 * Opens a layer of this kind; returns its release, which works once and is
 * safe to call again. `el` is the layer's element, read at sweep time: an
 * entry whose element has left the document is let go by the next sweep.
 */
export function openLayer(kind: LayerKind, el?: (() => Element | null) | null): () => void {
  const id = nextId++
  entries.set(id, { kind, el: el ?? null, at: Date.now() })
  publish()
  return () => {
    if (!entries.delete(id)) return
    publish()
    /*
      AND AGAIN ONCE THE COMMIT IS OVER (round R8). A layer lets go in React's unmount, and React runs the cleanups of a
      component before it takes that component's element out of the document, so the publish above still found the element
      standing for the kind and left its class on <html>. Leaving New email on a phone kept `has-phone-page-layer`, which
      hides the /app header ([data-shell-chrome]): a light grey band where the header was, over the violet strip, until some
      other layer opened. A microtask runs after the commit has removed the element.
    */
    if (hasDom()) queueMicrotask(publish)
  }
}

/*
  A FRAME OF GRACE. An element read in the same commit that registers it may
  not be in the document yet (a portal mounting a frame later); only an entry
  that has had a moment to arrive is let go for having no element.
*/
const SWEEP_GRACE_MS = 250

/**
 * Lets go of anything left over: an entry whose element has left the
 * document, and a class on <html> that no entry holds and no element stands
 * for. Called on every route change (the tab bar and the page layer do), on a
 * page shown again from the back cache, and safe to call at any time.
 */
export function sweepLayers(): void {
  clearStaleVideoFullscreen()
  const now = Date.now()
  for (const [id, e] of [...entries]) {
    if (!e.el || now - e.at < SWEEP_GRACE_MS) continue
    let node: Element | null = null
    try {
      node = e.el()
    } catch {
      node = null
    }
    /* Only an element that is known and has left: a ref not attached (yet) says nothing, and its cleanup still releases it. */
    if (node && !node.isConnected) entries.delete(id)
  }
  publish()
}

/** Forgets every layer. For tests, and for a document being torn down. */
export function resetLayers(): void {
  entries.clear()
  publish()
}

export function subscribeLayers(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const serverAnswer: TabBarLayers = { covered: false, over: false, count: 0 }
const serverSnapshot = () => serverAnswer

/** The tab bar's answer, kept current. */
export function useTabBarLayers(): TabBarLayers {
  return useSyncExternalStore(subscribeLayers, tabBarLayers, serverSnapshot)
}

/**
 * Holds a layer of this kind open while the component is mounted and `open`
 * is true. Registered in a layout effect, so it is counted in the commit that
 * draws the layer, before that frame is painted, and released in the commit
 * that takes it away. Inside an <Activity mode="hidden"> the effect is
 * cleaned up, so a hidden place holds nothing.
 *
 * `el`, when given, is the layer's element (a ref's current): the sweep lets
 * the entry go if the element has left the document.
 */
export function useLayer(kind: LayerKind, open = true, el?: { current: Element | null } | null): void {
  useLayoutEffect(() => {
    if (!open) return
    return openLayer(kind, el ? () => el.current : null)
  }, [kind, open, el])
}

/*
  THE SYSTEM VIDEO PLAYER'S CLASS. In the iPhone app, a video's own full
  screen is iOS's player, and components/platform/native-chrome.tsx hides the
  status band and the tab bar under it with `video-fullscreen` on <html>,
  taken off by the player's end event. That event is sent to the video, and a
  listener on the document only hears it while the video is still in the
  document: a video whose card was taken away under the player (a feed that
  refreshed, a post that closed) ends with nobody hearing it, and the tab bar
  stayed hidden for the rest of the visit. While the player is up the page
  takes no touches at all, so a finger on the page is proof it has gone.
*/
const VIDEO_FULLSCREEN = "video-fullscreen"
function videoPlayerUp(): boolean {
  for (const v of Array.from(document.querySelectorAll("video"))) {
    if ((v as HTMLVideoElement & { webkitDisplayingFullscreen?: boolean }).webkitDisplayingFullscreen) return true
  }
  return !!document.fullscreenElement
}
export function clearStaleVideoFullscreen(): void {
  if (!hasDom()) return
  const html = document.documentElement
  if (html.classList.contains(VIDEO_FULLSCREEN) && !videoPlayerUp()) html.classList.remove(VIDEO_FULLSCREEN)
}

/* The page came back from the back cache, or the browser went back: what was open when it left may not be any more. */
if (typeof window !== "undefined") {
  window.addEventListener("pageshow", () => sweepLayers())
  window.addEventListener("popstate", () => window.setTimeout(sweepLayers, 0))
  window.addEventListener("pointerdown", clearStaleVideoFullscreen, { capture: true, passive: true })
}
