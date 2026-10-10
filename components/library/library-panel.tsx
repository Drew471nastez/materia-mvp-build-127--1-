"use client"

import { usePathname, useRouter } from "next/navigation"
import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import type { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types"
import { LIBRARY_HOME } from "@/lib/library/paths"
import { cleanPath, isLibraryProduct, showsLibraryTabs } from "./library-tab-list"
import { LibraryContentShell } from "./library-content-shell"
import { TabsHeaderStill, skeletonFor } from "./library-skeletons"
import { CONTENT_IN_MS, landContent } from "@/lib/ui/pill-switch"

/**
 * ===========================================================================
 *  THE LIBRARY'S STAGE: HOW ONE SCREEN BECOMES THE NEXT
 * ===========================================================================
 * ROUND 17: A PILL'S SCREEN IS IN PLACE ON THE FRAME IT ARRIVES. The owner:
 * "Paid communities, library, settings: switching in between pill shapes is
 * not smooth there." Round 16 made a community's space pills quiet, and the
 * library still cross faded: a still copy of the old screen laid over the
 * new one and dissolving over 180ms, so for about 130ms the two screens'
 * words were on the glass together, one through the other (filmed at 4x CPU
 * by scripts/check-library-switch.mjs, frames +725ms to +826ms of its
 * filmstrip). Now a pill's screen replaces the last one in a single frame,
 * as the space pills' list does, and lands with the short soft fade every
 * row of pills shares (lib/ui/pill-switch.ts landContent: from 0.6 to whole
 * over 120ms, on the compositor). No copy is made, so the press costs
 * nothing either. A cold pill whose route draws its loading.tsx first lands
 * that shape the same way, and the screen lands again when it replaces the
 * shape: never the shape and the screen together.
 *
 * The pill itself answers the press (library-tabs.tsx); every tab's screen
 * is read whole ahead of time, so the screen usually follows within a frame
 * or two, and the router keeps each one (next.config.mjs staleTimes), so
 * going back to a pill is instant.
 *
 * WHICH MOVES. Found by listening to clicks on links anywhere on the page,
 * so a pill, the header's heart, "Your wishlist" in an empty library and a
 * product row's More menu are all the same move:
 *
 *   tab    a tab's screen to another's. The heading and the pills stay still
 *          (they are outside what fades), the scroll stays where it is, and
 *          the screen holds its height for the move so nothing under the
 *          finger jumps.
 *   open   the products list to one product. Everything under the banner
 *          fades, the product's shape rises 8px as it comes in, and the
 *          page starts at the top. The list's scroll is kept.
 *   back   the product's Library control back to the list. The same fade
 *          the other way, with the pills drawn still in the shape, and the
 *          list's scroll put back where it was.
 *
 * The "open" and "back" kinds below still cross fade with a copy; nothing
 * starts them while the library sits inside the profile (moveOf).
 *
 * The browser's own back and forward are NOT faded: on an iPhone the swipe
 * already draws its own move, and a second one after it is the double
 * animation page-layer.tsx avoids for the same reason. They still get their
 * scroll back (history.scrollRestoration is manual while the library is up,
 * so the browser does not clamp it to a half drawn page first).
 *
 * WHAT IS LIVE STAYS LAID OUT. While the shape shows, the live screen is
 * taken out of the flow and made invisible, not display:none. Next's router
 * decides whether to scroll a new page to the top by where its first element
 * is, and skips an element with no box, handing the decision to the layout
 * above, which then scrolls the whole page up. Kept laid out at the top of
 * the panel, it is where the pills are, so nothing scrolls.
 *
 * Opacity on the copies, 8px of `translate` on a product's shape while it is
 * only a shape. Nothing fixed lives inside what
 * moves (the download tray and the sheets are portals on <body>). Under
 * reduced motion nothing fades: the shape is shown at once and swapped.
 */

export const OUT_MS = 150
/** A product's shape rising into place as it is uncovered. */
export const IN_MS = 200
/** The shape dissolving into the real screen, once the old screen's copy has mostly gone. */
export const SETTLE_MS = 130
export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)"
/**
 * ONE PILL'S SCREEN INTO THE NEXT. The old screen's still copy dissolves
 * over the new one, which is whole under it from the frame it arrives.
 * Long enough to read as one picture becoming another, short enough that a
 * second press never waits for it.
 */
export const CROSS_MS = 180
/** Quick out of the gate, so the two screens are seen together only briefly, then a soft landing. */
export const CROSS_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"
/** The old screen's fade: under way from the press's first frame, easing into the end. */
export const EASE_IN_OUT = "cubic-bezier(0.25, 0.1, 0.25, 1)"
/** A press whose screen never came: the stage lets go and shows what is there. */
const GIVE_UP_MS = 10_000
/** The site header is sticky: a screen's top counts as seen below it. */
const HEADER_ROOM = 64

type Kind = "tab" | "open" | "back"
/**
 * `under`: the shape sits under the live screen, which fades out itself
 * (a tab pressed from where its pills are, the common case). Otherwise the
 * old screen is a copy laid over the shape (a product, a way back, a second
 * press while one is still on its way).
 */
type Pending = { href: string; kind: Kind; id: number; under: boolean }

const FULL = "full" as PrefetchKind

/** Where each library screen was scrolled to, for the way back to it. Kept across the stage's life. */
const scrolls = new Map<string, number>()

/**
 * The move between two library addresses, or null for one the stage leaves to the router.
 *
 * ONLY BETWEEN TABS NOW. The library lives inside the profile, whose header
 * (photo, name, pills) stands over the lists and steps aside on a purchase
 * opened from them (components/account/account-hub.tsx). A dissolve played
 * in place cannot also follow a header leaving above it, so opening a
 * purchase and coming back are the router's own moves, with the purchase's
 * loading.tsx shape. The "open" and "back" kinds stay for a library that is
 * ever drawn without that header again.
 */
export function moveOf(from: string, to: string): Kind | null {
  if (from === to) return null
  if (showsLibraryTabs(from) && showsLibraryTabs(to)) return "tab"
  return null
}

/**
 * From the first frame that shows it, not from whenever the compositor
 * reports it ready. A new animation's clock only starts once it is "ready",
 * and measured in Chromium that left the old screen at full strength for two
 * or three frames after the press. Its start is set as the next frame is
 * made instead: that frame draws it at the start, the one after part way.
 * Not at the press itself: when the press's frame is a long one (a phone at
 * a quarter speed), a fade begun then would be mostly over before anything
 * was drawn.
 */
function startNow(a: Animation): Animation {
  requestAnimationFrame(() => {
    /* The clock as the frame is being made, not the frame's own timestamp: after a long task Chromium hands the callback the start of the frame it missed. */
    if (a.playState !== "idle" && a.playState !== "finished" && a.startTime === null) a.startTime = performance.now()
  })
  return a
}

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

function jump(top: number) {
  window.scrollTo({ top, left: 0, behavior: "instant" as ScrollBehavior })
}

/** Out of the flow and unseen, but laid out where it was (see WHAT IS LIVE STAYS LAID OUT). */
function hide(el: HTMLElement | null) {
  if (!el) return
  el.style.position = "absolute"
  el.style.top = "0"
  el.style.left = "0"
  el.style.right = "0"
  el.style.visibility = "hidden"
  el.style.pointerEvents = "none"
}

function show(el: HTMLElement | null) {
  if (!el) return
  el.style.position = ""
  el.style.top = ""
  el.style.left = ""
  el.style.right = ""
  el.style.visibility = ""
  el.style.pointerEvents = ""
}

/** fill:"both" on a fade can leave opacity at 0 after cancel: the next screen looks blank. */
function clearLiveVisualState(el: HTMLElement | null) {
  if (!el) return
  el.getAnimations().forEach((a) => a.cancel())
  el.style.opacity = ""
}

const MARKS = ["data-library-skeleton", "data-library-incoming", "data-library-live", "data-library-panel", "data-library-now", "data-library-stage"]

/**
 * Only what is in the window is worth copying. Below the fold of a long list
 * every row would be laid out again for a copy nobody sees, and at a phone's
 * speed that is most of the press's frame. So a part wholly off the window
 * keeps its box (its height, its margins) and loses what is inside it. Read
 * while the page is laid out and untouched, so every read is free.
 */
function pruneOffscreen(orig: Element, copy: Element, depth: number) {
  const a = orig.children
  const b = copy.children
  if (a.length !== b.length) return
  for (let i = 0; i < a.length; i++) {
    const r = a[i].getBoundingClientRect()
    if (r.bottom < -40 || r.top > window.innerHeight + 40) {
      const c = b[i] as HTMLElement
      c.replaceChildren()
      c.style.height = `${r.height}px`
      c.style.boxSizing = "border-box"
    } else if (depth > 0) pruneOffscreen(a[i], b[i], depth - 1)
  }
}

type Leave = { anim: Animation; start: number; duration: number }

/** The colour the page is painted under `el`: the first ancestor with a background of its own. */
function groundOf(el: HTMLElement): string {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const bg = getComputedStyle(n).backgroundColor
    if (bg && bg !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(bg)) return bg
  }
  return "#fafafa"
}

/** A still copy of `el` with nothing in it that could be mistaken for the live screen (ids, the stage's marks). */
function stillCopy(el: HTMLElement, opaque = false): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement
  /*
    OPAQUE, FOR A CROSS FADE. A copy is transparent wherever the old screen
    had no card, so the new screen showed through those gaps at full
    strength from the first frame while the rest was still the old one. On
    the page's own colour, the whole old picture gives way to the whole new
    one evenly.
  */
  if (opaque) copy.style.backgroundColor = groundOf(el)
  pruneOffscreen(el, copy, 6)
  for (const n of [copy, ...copy.querySelectorAll<HTMLElement>("[id]")]) n.removeAttribute("id")
  for (const m of MARKS) {
    copy.removeAttribute(m)
    copy.querySelectorAll(`[${m}]`).forEach((n) => n.removeAttribute(m))
  }
  return copy
}

/**
 * Lays `copy` over the window at `r` (where what it copies was, in window
 * coordinates) and fades it out over `duration`. Fixed and clipped to the
 * window, so a scroll under it does not move it. `under` puts it beneath the
 * copies already fading, so a shape that gives way to its screen never
 * covers the screen before it.
 */
function layLeaving(copy: HTMLElement, r: { left: number; top: number; width: number }, duration: number, under = false, from = 1, cross = false): Leave {
  const layer = document.createElement("div")
  layer.setAttribute("data-library-leaving", "")
  layer.setAttribute("aria-hidden", "true")
  layer.inert = true
  layer.style.cssText = "position:fixed;inset:0;overflow:hidden;pointer-events:none;z-index:1;contain:strict"
  copy.style.cssText += `;position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;margin:0;opacity:1;translate:none;scale:none;min-height:0;visibility:visible;display:block`
  layer.append(copy)
  const first = under ? document.body.querySelector(":scope > [data-library-leaving]") : null
  if (first) document.body.insertBefore(layer, first)
  else document.body.append(layer)
  const anim = layer.animate([{ opacity: from }, { opacity: 0 }], { duration, easing: cross ? CROSS_EASE : from < 1 ? EASE_OUT : EASE_IN_OUT, fill: "both" })
  if (cross) {
    /*
      SEEN WHOLE BEFORE IT FADES. The frame that brings the next screen is
      the longest of the move (React's commit, then the new screen and the
      copy laid out and painted), and a fade clocked from inside it was
      half over by the time that frame reached the glass, so the dissolve
      was mostly skipped on a slow phone. The copy waits at full strength
      until that frame has been made, then fades on the compositor.
    */
    anim.pause()
    requestAnimationFrame(() => requestAnimationFrame(() => anim.play()))
  } else startNow(anim)
  const done = () => layer.remove()
  anim.onfinish = done
  anim.oncancel = done
  window.setTimeout(done, duration + (cross ? 1000 : 400))
  return { anim, start: performance.now(), duration }
}

/** A still copy of `el`, laid over the window exactly where `el` is, fading out over `duration`. */
function leaveCopy(el: HTMLElement, duration: number, under = false, from = 1, cross = false): Leave | null {
  const r = el.getBoundingClientRect()
  if (r.height < 1 || r.bottom < 0 || r.top > window.innerHeight) return null
  return layLeaving(stillCopy(el, cross), r, duration, under, from, cross)
}

/**
 * Told about a new address in the commit that brings it, BEFORE React
 * replaces a single element of the old screen: getSnapshotBeforeUpdate runs
 * for the whole tree ahead of any change. It is the one moment the old
 * screen can still be copied after the press has let it fade on its own.
 */
class BeforeCommit extends Component<{ path: string; onBefore: (to: string) => void }> {
  getSnapshotBeforeUpdate(prev: { path: string }) {
    if (prev.path !== this.props.path) this.props.onBefore(this.props.path)
    return null
  }
  componentDidUpdate() {}
  render() {
    return null
  }
}

/** How far a fade has got, from its own clock: no style is read, so nothing is laid out for it. */
function remaining(a: Animation | null): number {
  if (!a || a.playState === "finished" || a.playState === "idle") return 0
  const p = a.effect?.getComputedTiming().progress
  return typeof p === "number" ? Math.max(0, 1 - p) : 0
}

export function LibraryPanel({ head, children }: { head?: ReactNode; children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const pathRef = useRef(cleanPath(pathname))
  const nowRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const liveRef = useRef<HTMLDivElement>(null)
  const incomingRef = useRef<HTMLDivElement>(null)
  const seq = useRef(0)
  const giveUp = useRef<number | null>(null)
  const release = useRef<number | null>(null)
  /* Set by a popstate the stage did not start (the browser's back or forward). */
  const traversal = useRef(false)
  /* The press's copy of the old screen, still fading. */
  const lastLeave = useRef<Leave | null>(null)
  /* The live screen fading out by itself, before its route has answered. */
  const liveFade = useRef<Animation | null>(null)
  /* A route's own skeleton on the screen after a pill press, waiting for the screen that replaces it. */
  const skeletonUp = useRef(false)
  /* A pill's screen is on its way in this commit: it lands as it is painted. */
  const tabLanding = useRef(false)
  /* The panel's height held while a pill's screen lands. */
  const tabHold = useRef<number | null>(null)

  /**
   * The least height the panel can have without the page becoming shorter
   * than where it is scrolled (which the browser answers by scrolling it up,
   * moving the pills under the finger).
   */
  const scrollNeed = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return 0
    const top = panel.getBoundingClientRect().top + window.scrollY
    const below = document.documentElement.scrollHeight - (top + panel.offsetHeight)
    return Math.ceil(window.scrollY + window.innerHeight - below - top)
  }, [])

  /* After the move, the held height goes, unless the page would then be shorter than where it is scrolled. */
  const letGo = useCallback((arriving = false) => {
    const panel = panelRef.current
    const live = liveRef.current
    if (!panel || !live || (pendingRef.current && !arriving)) return
    const need = scrollNeed()
    panel.style.minHeight = live.offsetHeight >= need ? "" : `${need}px`
  }, [scrollNeed])

  /**
   * The screen has come: it takes the shape's place. It is shown whole,
   * under whatever is still fading over it, so the eye sees one picture
   * dissolve into the next and never the page's background between them.
   * The shape is copied over it to fade out too, unless the old screen's
   * copy is still covering nearly all of it (a warm tab lands a frame or two
   * after the press), when the shape was never really seen.
   */
  const arrive = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    if (giveUp.current) window.clearTimeout(giveUp.current)
    giveUp.current = null
    const incoming = incomingRef.current
    const lead = lastLeave.current
    const covered = Math.max(remaining(liveFade.current), lead ? 1 - Math.min(1, (performance.now() - lead.start) / lead.duration) : 0)
    if (incoming && !reducedMotion() && covered < 0.75 && p.kind !== "tab") leaveCopy(incoming, SETTLE_MS, true)
    if (incoming) incoming.style.display = "none"
    liveFade.current?.cancel()
    liveFade.current = null
    const live = liveRef.current
    clearLiveVisualState(live)
    if (panelRef.current) panelRef.current.style.isolation = ""
    show(nowRef.current)
    show(live)
    if (p.kind === "back") jump(scrolls.get(p.href) ?? 0)
    else if (p.kind === "open") jump(0)
    setPending(null)
    /* Keep min-height through the shape dissolve so the page does not jump shorter mid-fade. */
    if (release.current) window.clearTimeout(release.current)
    release.current = window.setTimeout(() => {
      release.current = null
      letGo(true)
    }, SETTLE_MS + 40)
  }, [letGo])

  /** A press on a link to another library screen: the move starts now, whatever the server does. */
  const begin = useCallback(
    (kind: Kind, href: string) => {
      const reduce = reducedMotion()
      const was = pendingRef.current
      const panel = panelRef.current
      const now = nowRef.current
      /* Every read first, while the page is laid out and nothing has changed yet. */
      const visible = was ? incomingRef.current : kind === "tab" ? liveRef.current : now
      const nowTop = now ? now.getBoundingClientRect().top : 0
      const panelBox = panel?.getBoundingClientRect()
      const panelTop = panelBox ? panelBox.top : 0
      const panelHeight = panelBox ? Math.ceil(panelBox.height) : 0
      if (!was) scrolls.set(pathRef.current, window.scrollY)
      const live = liveRef.current
      /*
        THE COMMON PRESS COPIES NOTHING. A pill pressed where its row can be
        seen: the live screen fades out by itself, on the compositor, over
        the new shape laid under it, and is only copied if its route answers
        before the fade is over (BeforeCommit). Copying a screen at the press
        cost a phone at a quarter speed about 80ms before the first frame.
      */
      const under =
        kind === "tab" && !was && !reduce && !!live && typeof live.animate === "function"
      if (under && live) {
        clearLiveVisualState(live)
        if (panel) panel.style.isolation = "isolate"
        liveFade.current = startNow(live.animate([{ opacity: 1 }, { opacity: 0 }], { duration: OUT_MS, easing: EASE_IN_OUT, fill: "both" }))
      } else if (visible && !reduce) lastLeave.current = leaveCopy(visible, OUT_MS)
      if (was && incomingRef.current) incomingRef.current.style.display = "none"

      if (under || kind === "tab") {
        if (kind === "tab" && nowTop < 0 && panelTop < HEADER_ROOM) {
          jump(Math.max(0, nowTop + window.scrollY - HEADER_ROOM))
        }
        /* The height it has now, held for the move: the next screen may be shorter than where the page is scrolled. */
        if (panel) panel.style.minHeight = `${panelHeight}px`
      } else {
        if (panel) panel.style.minHeight = ""
        show(liveRef.current)
        hide(now)
        jump(0)
      }
      if (release.current) window.clearTimeout(release.current)
      const next = { href, kind, id: ++seq.current, under }
      pendingRef.current = next
      setPending(next)
      if (giveUp.current) window.clearTimeout(giveUp.current)
      giveUp.current = window.setTimeout(() => {
        /* Nothing came. What is live is shown again, as it is. */
        if (pendingRef.current?.id !== next.id) return
        pendingRef.current = null
        liveFade.current?.cancel()
        liveFade.current = null
        clearLiveVisualState(liveRef.current)
        if (panelRef.current) panelRef.current.style.isolation = ""
        show(nowRef.current)
        show(liveRef.current)
        setPending(null)
        letGo()
      }, GIVE_UP_MS)
    },
    [letGo],
  )

  /**
   * ===========================================================================
   *  A PILL'S SCREEN, IN PLACE OF THE LAST (round 17)
   * ===========================================================================
   * Told in the commit that brings the next screen, before React has changed
   * a single element of the old one: the panel keeps the height it has for
   * the landing, so a shorter screen does not pull the page up under the
   * finger, and lets go of it once the screen has landed (letGo keeps what the
   * scroll needs). The landing itself is played in the layout effect below,
   * on the frame the new screen is first painted. Round 16 laid a copy of the
   * old screen over the new one here and dissolved it, which is what showed
   * two screens at once.
   */
  const beforeCommit = useCallback((to: string) => {
    const p = pendingRef.current
    const live = liveRef.current
    if (p && p.under && live && cleanPath(to) === p.href) {
      /* A move the stage started (a product's way in or out): its own fade carries it. */
      liveFade.current?.cancel()
      liveFade.current = null
      clearLiveVisualState(live)
      return
    }
    if (p || !live || traversal.current) return
    if (moveOf(pathRef.current, cleanPath(to)) !== "tab") return
    const panel = panelRef.current
    if (panel) panel.style.minHeight = `${Math.ceil(panel.getBoundingClientRect().height)}px`
    tabLanding.current = true
    if (tabHold.current) window.clearTimeout(tabHold.current)
    tabHold.current = window.setTimeout(() => {
      tabHold.current = null
      if (!skeletonUp.current) letGo(true)
    }, CONTENT_IN_MS + 60)
  }, [letGo])

  /**
   * A cold pill: its route drew its loading.tsx shape first, which landed
   * like any screen. When the real screen replaces it, the screen lands in
   * its place the same way: the shape is gone in that frame. Read in a
   * MutationObserver, which runs after React has changed the page and before
   * it is painted.
   */
  const watchSkeleton = useCallback(() => {
    const live = liveRef.current
    if (!live || pendingRef.current) return
    if (live.querySelector("[data-library-skeleton]")) {
      if (showsLibraryTabs(pathRef.current)) skeletonUp.current = true
      return
    }
    if (!skeletonUp.current) return
    skeletonUp.current = false
    landContent(live)
    if (tabHold.current) window.clearTimeout(tabHold.current)
    tabHold.current = window.setTimeout(() => {
      tabHold.current = null
      letGo(true)
    }, CONTENT_IN_MS + 60)
  }, [letGo])

  /* Every plain press on a link to another library screen, wherever the link is. */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return
      let url: URL
      try {
        url = new URL(a.href, window.location.href)
      } catch {
        return
      }
      if (url.origin !== window.location.origin) return
      const from = pendingRef.current?.href ?? pathRef.current
      const kind = moveOf(from, cleanPath(url.pathname))
      if (kind === "tab") {
        /* A pill's own press is the router's move, cross faded as it commits (beforeCommit). From a link with the pills above the window, the head is brought back into view first. */
        const now = nowRef.current
        if (now && !pendingRef.current) {
          const top = now.getBoundingClientRect().top
          if (top < 0) jump(Math.max(0, top + window.scrollY - HEADER_ROOM))
        }
        return
      }
      if (kind) begin(kind, cleanPath(url.pathname))
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [begin])

  /* Intent: a product about to be opened, or a tab about to be pressed, is fetched whole first. */
  useEffect(() => {
    const warmed = new Set<string>()
    const warm = (e: Event) => {
      if (e.type === "pointerover" && (e as PointerEvent).pointerType !== "mouse") return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a) return
      let path: string
      try {
        const url = new URL(a.href, window.location.href)
        if (url.origin !== window.location.origin) return
        path = cleanPath(url.pathname)
      } catch {
        return
      }
      if (warmed.has(path) || !moveOf(pathRef.current, path)) return
      warmed.add(path)
      try {
        router.prefetch(path, { kind: FULL })
      } catch {
        /* a prefetch that fails is a press that waits, nothing worse */
      }
    }
    document.addEventListener("pointerover", warm, { passive: true })
    document.addEventListener("touchstart", warm, { passive: true })
    document.addEventListener("focusin", warm)
    return () => {
      document.removeEventListener("pointerover", warm)
      document.removeEventListener("touchstart", warm)
      document.removeEventListener("focusin", warm)
    }
  }, [router])

  /* On a product, the list is kept warm for the way back. */
  useEffect(() => {
    if (!isLibraryProduct(pathname)) return
    try {
      router.prefetch(LIBRARY_HOME, { kind: FULL })
    } catch {
      /* the way back waits for the list instead */
    }
  }, [pathname, router])

  /* The scroll of each screen as it moves; the browser is told not to put it back on its own. */
  useEffect(() => {
    const onScroll = () => {
      if (!pendingRef.current) scrolls.set(pathRef.current, window.scrollY)
    }
    const onPop = () => {
      traversal.current = true
    }
    const before = history.scrollRestoration
    history.scrollRestoration = "manual"
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("popstate", onPop)
    return () => {
      history.scrollRestoration = before
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("popstate", onPop)
    }
  }, [])

  /* The address changed: the screen that came, or its route's skeleton, is in the live slot now. */
  useLayoutEffect(() => {
    const path = cleanPath(pathname)
    const prevPath = pathRef.current
    if (path === prevPath && !pendingRef.current) return
    pathRef.current = path
    const p = pendingRef.current
    if (!p) {
      /* Arrived without a press here: the browser's back or forward, or a link from elsewhere. */
      if (traversal.current && scrolls.has(path)) jump(scrolls.get(path) ?? 0)
      /* A pill's landing holds the panel's height until it is over (beforeCommit); anything else lets go now. */
      if (panelRef.current && !tabHold.current) panelRef.current.style.minHeight = ""
      traversal.current = false
      if (tabLanding.current) {
        tabLanding.current = false
        landContent(liveRef.current)
      }
      if (moveOf(prevPath, path) === "tab") watchSkeleton()
      return
    }
    traversal.current = false
    if (path === p.href && liveRef.current?.querySelector("[data-library-skeleton]")) {
      /* The route drew its own skeleton, out of sight: the page takes the shape's height while it waits, so the screen's arrival changes it little. */
      const panel = panelRef.current
      const shape = incomingRef.current
      if (p.under && panel && shape) panel.style.minHeight = `${Math.max(shape.offsetHeight, scrollNeed())}px`
      return
    }
    arrive()
  }, [pathname, arrive, scrollNeed, watchSkeleton])

  /* A route skeleton giving way to its screen, while the stage still shows the shape. */
  useEffect(() => {
    const live = liveRef.current
    if (!live || typeof MutationObserver === "undefined") return
    const mo = new MutationObserver(() => {
      const p = pendingRef.current
      if (p && p.href === pathRef.current && !live.querySelector("[data-library-skeleton]")) arrive()
      else if (!p) watchSkeleton()
    })
    mo.observe(live, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [arrive, watchSkeleton])

  /*
    The shape is there at full strength from the press's frame, under the
    old screen's copy, which is what fades: one layer moving, on the
    compositor, and nothing showing through. A product's shape also rises
    8px as it is uncovered, the direction of going in.
  */
  useLayoutEffect(() => {
    const el = incomingRef.current
    if (!pending || pending.kind !== "open" || !el || reducedMotion() || typeof el.animate !== "function") return
    el.animate([{ translate: "0 8px" }, { translate: "0 0" }], { duration: IN_MS, easing: EASE_OUT })
  }, [pending])

  useEffect(
    () => () => {
      if (giveUp.current) window.clearTimeout(giveUp.current)
      if (release.current) window.clearTimeout(release.current)
      if (tabHold.current) window.clearTimeout(tabHold.current)
      document.querySelectorAll("[data-library-leaving]").forEach((n) => n.remove())
    },
    [],
  )

  return (
    <div data-library-stage="" className="relative">
      <BeforeCommit path={cleanPath(pathname)} onBefore={beforeCommit} />
      <div ref={nowRef} data-library-now="">
        {head}
        <div ref={panelRef} data-library-panel="" className="relative">
          <div ref={liveRef} data-library-live="">
            <LibraryContentShell>{children}</LibraryContentShell>
          </div>
          {pending?.kind === "tab" ? (
            <div key={pending.id} ref={incomingRef} data-library-incoming="tab" className={pending.under ? "absolute inset-x-0 top-0 -z-10" : undefined}>
              {skeletonFor(pending.href, true)}
            </div>
          ) : null}
        </div>
      </div>
      {pending && pending.kind !== "tab" ? (
        <div key={pending.id} ref={incomingRef} data-library-incoming={pending.kind}>
          {pending.kind === "back" ? <TabsHeaderStill active={pending.href} /> : null}
          {skeletonFor(pending.href, true)}
        </div>
      ) : null}
    </div>
  )
}
