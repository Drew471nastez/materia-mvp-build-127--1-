"use client"

/**
 * ===========================================================================
 *  A POST, OPENED ON A PHONE: THE WEBSITE BUILDER'S BOTTOM SHEET (round 25)
 * ===========================================================================
 * The owner, after round 24: "Opening a post is not smooth at all, very
 * glitchy. Make it like a mobile bottom sheet, extremely smooth, not
 * glitching, very accurate, like the website builder editor's mobile settings
 * sidebar bottom sheet."
 *
 * SO IT IS THAT SHEET. Not a copy of it: the post is drawn inside
 * components/website-builder/mobile-editor-sheet.tsx, the one the builder's
 * Sections / Pages / Settings sheet, Ask Storelib, Publish and (since round
 * 17) the community's New post all ride on. Its rise and its close are one
 * CSS transition of where it sits, on its own layer, which the compositor runs
 * to the end whatever the main thread is doing; a finger moves it directly,
 * once a frame, and the release carries on at the finger's speed into a
 * snap or a close (sheet-gestures.ts); a pull down from the top of the post,
 * or anywhere on its header, closes it; the light dim behind is the sheet's.
 * Nothing behind it moves, scales or blurs.
 *
 * WHAT IT REPLACES. Rounds 15 to 19 built five other opens on their own
 * engine (a push from the right, iOS's page sheet, a morph out of the card,
 * a rise and fade; post-morph.ts and post-stage.ts, now gone with their
 * POST_MOTION constant). One mechanism for every sheet on a phone is fewer
 * ways for one of them to feel different.
 *
 * PREPARED BEFORE IT MOVES. The sheet is mounted closed and primed
 * (`primed`: drawn at its open stop, unseen and untouchable), the post and
 * its comments laid out in it, its pictures decoded (the card's own URLs, in
 * the cache) and the comments read ahead (prepare), for at most
 * PREPARE_CAP_MS; a task goes by for React's render of what arrived, a frame
 * for its paint, and only then is it raised. So its first moving frame has
 * nothing to draw but the move.
 *
 * THE CLOSE, IN ORDER: the keyboard down (the sheet holds its content still
 * while it closes), the feed put back to the scroll it had when the post
 * opened (iOS pans the page under a focused field) while the sheet still
 * covers it, the one move down, and once the sheet says it has landed
 * (`onMoved`) the layer is hidden, the parent told, the held Back handed on.
 * A Back the browser drew itself (Safari's edge swipe) is not moved again.
 *
 * THE TAB BAR is under the sheet (lib/ui/layers.ts "post" covers it now, as
 * the composer does): a sheet over the whole app, the bar there again the
 * moment it has gone.
 *
 * THE KEYBOARD is the sheet's own way, the same as New post's: the sheet
 * stays down to the foot of the screen, white, and pads its content by the
 * keyboard's room, which the comment box (sticky at the foot of the post's
 * scroll) rides; in the iOS app the room is made in the focus itself
 * (visible-box.ts sheetKeyboardRoom), before iOS can decide to pan. Under the
 * box there is only the sheet: its padding, its own skirt one sheet tall
 * below its foot, and, while a field in it is typed in, nothing of the
 * community painted below the sheet's top edge on a white ground
 * (unpaintCommunity, html[data-post-typing] in app/globals.css), so even a
 * page iOS panned further than any number says shows white.
 *
 * THE READOUT. ?kbdebug=1 on any address, or a long press (about 1.5s) on the
 * face beside the comment box (the app has no address bar), turns on a small
 * panel of the numbers that placed the box, remembered on this phone; the
 * same press turns it off.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { MobileEditorSheet, sheetMoveMs } from "@/components/website-builder/mobile-editor-sheet"
import { useLayer } from "@/lib/ui/layers"
import { hapticTap } from "@/lib/native-bridge"
import { edgeSwipeEnvironment } from "@/lib/navigation/edge-swipe"
import { isPostAddress } from "@/lib/communities/client/places"
import { currentKeyboardEnv, sheetKeyboardRoom, takesKeyboard } from "./visible-box"
import { useCalmFocus } from "./calm-focus"
import { BROWSER_EDGE_PX, closedByBrowserSwipe, feedRestore, type CloseTrigger } from "./post-motion"

/** The long press on the face beside the comment box that turns the readout on or off. */
export const KB_DEBUG_PRESS_MS = 1500
/** The post is prepared (drawn, laid out, its pictures decoded, its comments read) for at most this long before it rises anyway. */
export const PREPARE_CAP_MS = 120
/** The sheet's one stop: the whole screen less a strip of the dimmed community at the top, as iOS's sheets leave. */
export const POST_SHEET_DETENTS = [0.94]
/** Over the community and its tab bar; Edit post (135) and search (136) open over it. */
export const POST_SHEET_Z = 130
/** The close button's tap: the whole corner, at least 48px. */
export const CLOSE_HIT = 48

/*
  THE KEYBOARD READOUT. ?kbdebug=1 on any address turns it on, ?kbdebug=0 off; the long press toggles it. Kept in local
  storage, so it stays on on this phone (the opened post's own address drops the query, and the app has no address bar).
*/
export const KB_DEBUG_KEY = "storelib:kbdebug"
function readKbDebugFlag(): boolean {
  if (typeof window === "undefined") return false
  try {
    const asked = new URLSearchParams(window.location.search).get("kbdebug")
    if (asked === "1") window.localStorage.setItem(KB_DEBUG_KEY, "1")
    else if (asked === "0") window.localStorage.removeItem(KB_DEBUG_KEY)
    return window.localStorage.getItem(KB_DEBUG_KEY) === "1" || window.sessionStorage.getItem(KB_DEBUG_KEY) === "1"
  } catch {
    return false
  }
}
export function kbDebugOn(): boolean {
  return readKbDebugFlag()
}
/** The long press: on if it was off, off if it was on; remembered on this phone. */
export function toggleKbDebug(): boolean {
  const on = !readKbDebugFlag()
  try {
    if (on) window.localStorage.setItem(KB_DEBUG_KEY, "1")
    else {
      window.localStorage.removeItem(KB_DEBUG_KEY)
      window.sessionStorage.removeItem(KB_DEBUG_KEY)
    }
  } catch {
    /* No storage: on for as long as this post is open. */
  }
  return on
}

/* When a finger last landed at the screen's left edge: a popstate soon after is the browser's own swipe back (closedByBrowserSwipe). */
let lastEdgeTouch = -Infinity
if (typeof document !== "undefined") {
  document.addEventListener(
    "touchstart",
    (e) => {
      const x = e.touches[0]?.clientX
      if (x !== undefined && x <= BROWSER_EDGE_PX) lastEdgeTouch = performance.now()
    },
    { passive: true, capture: true },
  )
}

/*
  BACK CLOSES AS FAST AS THE X (round 21). The X starts the close in its own press, and the address steps back only once the
  move is over, so everything that reads the address (the router, the feed, the place host, the frame) draws after it. This
  listener is added as this module loads, before the router's and every component's, so it is heard first: the open post
  starts its close in the event and keeps the event from the rest of the page until the move is over, then hands it on
  (replayPop), exactly as the X's step back reaches them. A Back the browser drew itself (Safari's edge swipe) is handed on
  at once.
*/
let onPopFirst: (() => boolean) | null = null
let replaying = false
if (typeof window !== "undefined")
  window.addEventListener(
    "popstate",
    (e) => {
      if (!replaying && onPopFirst?.()) e.stopImmediatePropagation()
    },
    { capture: true },
  )
/** The Back held while the close moved, handed to the rest of the page now (the router, the feed, the history layers). */
function replayPop() {
  replaying = true
  try {
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }))
  } finally {
    replaying = false
  }
}

/** The community's frame, marked while a post is open over it (globals.css: the keyboard does not shorten it then). */
function communityShell(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.querySelector<HTMLElement>("[data-community-shell]")
}

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/** Every picture in a box decoded (or given up on), the first eight, for at most `cap` ms. */
export async function decodeIn(boxes: (Element | null)[], cap = PREPARE_CAP_MS): Promise<void> {
  const imgs = boxes.flatMap((b) => (b ? Array.from(b.querySelectorAll("img")) : [])).slice(0, 8)
  const all = Promise.all(imgs.map((i) => (typeof i.decode === "function" ? i.decode().catch(() => undefined) : undefined)))
  await Promise.race([all, sleep(cap)])
}

/*
  READY, THEN DRAWN, THEN RAISED. What `prepare` waits for (the comments' data) resolves in a microtask, and the render it
  causes is React's next task: raised on that microtask, the move would carry that render in its first frames. So once ready
  (or at the cap), a task goes by for that render, then a frame for its paint, and only then the sheet rises.
*/
export async function readyThenDrawn(ready: Promise<unknown>, cap: number): Promise<void> {
  await Promise.race([ready, sleep(cap)])
  await sleep(0)
  await nextFrame()
}

export interface PostFullscreenProps {
  open: boolean
  label: string
  title: string
  /** Asked to close (the close button, a pull, the dim, Escape): the parent sets `open` false. */
  onRequestClose: () => void
  /** The open has arrived. */
  onShown: () => void
  /** It has gone (landed and hidden): the parent takes it out. */
  onGone: () => void
  /** Waited for before the sheet rises (at most PREPARE_CAP_MS): the comments read ahead, say. */
  prepare?: () => Promise<unknown>
  contentRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}

export function PostFullscreen({ open, label, title, onRequestClose, onShown, onGone, prepare, contentRef, children }: PostFullscreenProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  /* The post's root, once the sheet has put it in the page (the sheet draws its portal from its own first effect): what the effects below wait for. */
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const takeRoot = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el
    if (el) setRoot(el)
  }, [])
  const scrollRef = useRef<HTMLDivElement>(null)
  const debugRef = useRef<HTMLDivElement>(null)
  /* The sheet's `open`: false while the post is prepared, true once it rises, false again to close it. */
  const [up, setUp] = useState(false)
  const done = useRef({ onShown, onGone, onRequestClose, prepare })
  useEffect(() => {
    done.current = { onShown, onGone, onRequestClose, prepare }
  })
  /* What closed it (null: a Back, or the parent). */
  const how = useRef<CloseTrigger | null>(null)
  const closing = useRef(false)
  const arrived = useRef(false)
  /* The feed's scroll when the post opened: where it is put back before the close moves. */
  const noted = useRef<number | null>(null)
  const heldPop = useRef(false)
  const ended = useRef(false)
  const closeTimer = useRef(0)

  /* THE TAB BAR, under the sheet while the post is in the page (lib/ui/layers.ts). */
  useLayer("post", true, rootRef)

  /* The sheet as a whole (its own element and the dim before it), for a close the browser has already drawn. */
  const sheetEl = () => rootRef.current?.closest<HTMLElement>("[data-mobile-bottom-sheet]") ?? null

  /* ── IN ── prepared, then raised (PREPARED BEFORE IT MOVES). */
  useLayoutEffect(() => {
    noted.current = window.scrollY
    communityShell()?.setAttribute("data-post-over", "")
    return () => {
      communityShell()?.removeAttribute("data-post-over")
      document.documentElement.removeAttribute("data-post-typing")
    }
  }, [])
  useEffect(() => {
    if (!root) return
    let stop = false
    void (async () => {
      await readyThenDrawn(Promise.all([done.current.prepare?.(), decodeIn([root])]), PREPARE_CAP_MS)
      if (stop || closing.current) return
      /* Moving: a kept sheet elsewhere waits to build itself until this mark is gone (components/ui/bottom-sheet.tsx). */
      rootRef.current?.setAttribute("data-moving", "")
      setUp(true)
    })()
    /* A page in the background draws no frames: it has still arrived. */
    const t = window.setTimeout(() => shown(), PREPARE_CAP_MS + sheetMoveMs() + 700)
    return () => {
      stop = true
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root])
  const shown = () => {
    if (arrived.current) return
    arrived.current = true
    done.current.onShown()
  }

  /*
    THE COMMUNITY, NOT PAINTED UNDER A TYPED IN POST. Only the strip of it above the sheet's top edge (the dimmed header, the
    one part on the screen) is kept: everything below is clipped away, so whatever a platform brings into sight under the
    sheet or behind the translucent keys is the page's white ground (html[data-post-typing], app/globals.css), never a
    picture of the feed. A clip, so nothing is laid out again and the feed keeps its scroll and its decoded pictures.
  */
  const unpaintCommunity = (on: boolean) => {
    const shell = communityShell()
    if (!shell) return
    if (!on) {
      shell.style.clipPath = ""
      shell.removeAttribute("data-post-unpainted")
      return
    }
    const sheet = sheetEl()
    /* The sheet's top edge, its rounded corners included, measured in the frame's own box. */
    const keep = sheet ? Math.max(0, Math.round(sheet.getBoundingClientRect().top + 24 - shell.getBoundingClientRect().top)) : 0
    shell.style.clipPath = `inset(0px 0px calc(100% - ${keep}px) 0px)`
    shell.setAttribute("data-post-unpainted", "")
  }

  /* ── OUT ── */
  const end = useCallback(() => {
    if (ended.current) return
    ended.current = true
    window.clearTimeout(closeTimer.current)
    const sheet = sheetEl()
    if (sheet) {
      sheet.style.visibility = "hidden"
      const dim = sheet.previousElementSibling as HTMLElement | null
      if (dim?.hasAttribute("data-wb-sheet-overlay")) dim.style.visibility = "hidden"
    }
    if (how.current && how.current !== "history" && how.current !== "browser-swipe") done.current.onRequestClose()
    /* A Back held while it moved: the router, the feed and the history layer hear it now, as they hear the X's step back. */
    if (heldPop.current) {
      heldPop.current = false
      replayPop()
    }
    done.current.onGone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function beginClose(trigger: CloseTrigger) {
    if (closing.current) return
    closing.current = true
    how.current ??= trigger
    /* THE KEYBOARD goes down with the post (the sheet keeps its content still while it closes). */
    const active = document.activeElement as HTMLElement | null
    const wasTyping = !!active && !!rootRef.current?.contains(active) && takesKeyboard(active)
    if (active && rootRef.current?.contains(active)) active.blur()
    document.documentElement.removeAttribute("data-post-typing")
    unpaintCommunity(false)
    /* HOLD-FEED: the feed exactly where it was, while the sheet still covers it. */
    const back = noted.current === null ? null : feedRestore(noted.current, window.scrollY)
    if (back !== null) window.scrollTo({ top: back, behavior: "instant" as ScrollBehavior })
    /* A Back the browser already drew as its own swipe: no second move. */
    if (trigger === "browser-swipe") {
      end()
      return
    }
    /*
      The community was not painted while the comment box was typed in (THE KEYBOARD above): a frame for it to be painted
      again under the covering sheet, so the sheet uncovers a drawn feed, not one still being drawn.
    */
    const go = () => {
      rootRef.current?.setAttribute("data-moving", "")
      setUp(false)
    }
    if (wasTyping) requestAnimationFrame(() => requestAnimationFrame(go))
    else go()
    /* A tab in the background draws no frames: it still goes. */
    closeTimer.current = window.setTimeout(end, sheetMoveMs() + 500)
  }
  const request = (trigger: CloseTrigger) => {
    if (closing.current) return
    how.current ??= trigger
    beginClose(trigger)
  }
  /* The sheet has landed: open (arrived) or closed (gone, now hidden; the parent told). */
  const onMoved = useCallback(
    (nowOpen: boolean) => {
      rootRef.current?.removeAttribute("data-moving")
      if (nowOpen) {
        if (!closing.current) shown()
        return
      }
      if (closing.current) end()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [end],
  )
  /* The sheet asks to close: a pull let go past the line (it has already landed, closed), or a tap on the dim. */
  const onOpenChange = useCallback((next: boolean) => {
    if (!next) request("pull")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
    THE BACK, HEARD FIRST (onPopFirst above): an address that is no longer a post's is this post closing (a Back from a viewer
    over it lands on the post's own address and leaves it open). Held until the move is over, then handed on.
  */
  useEffect(() => {
    const mine = () => {
      if (closing.current || isPostAddress(window.location.pathname)) return false
      const trigger: CloseTrigger = closedByBrowserSwipe(performance.now() - lastEdgeTouch, edgeSwipeEnvironment()) ? "browser-swipe" : "history"
      how.current ??= trigger
      if (trigger === "browser-swipe") {
        beginClose(trigger)
        return false
      }
      heldPop.current = true
      beginClose(trigger)
      return true
    }
    onPopFirst = mine
    return () => {
      if (onPopFirst === mine) onPopFirst = null
      /* Taken out mid move: the page still hears its Back. */
      if (heldPop.current) {
        heldPop.current = false
        replayPop()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useLayoutEffect(() => {
    if (open || closing.current) return
    beginClose(how.current ?? (closedByBrowserSwipe(performance.now() - lastEdgeTouch, edgeSwipeEnvironment()) ? "browser-swipe" : "history"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  /*
    ── TYPING ── A field in the post typed in: the post says so (data-typing: the comment box stands on a white ground), and
    the community under the sheet is not painted at all until it lets go (html[data-post-typing], app/globals.css). A gap that
    any platform leaves between the box and the keys can then only ever be white.
  */
  useEffect(() => {
    if (!root) return
    const html = document.documentElement
    const sync = () => {
      const a = document.activeElement
      const on = !closing.current && !!a && root.contains(a) && takesKeyboard(a)
      root.toggleAttribute("data-typing", on)
      html.toggleAttribute("data-post-typing", on)
      unpaintCommunity(on)
    }
    const onIn = () => sync()
    const onOut = () => requestAnimationFrame(sync)
    document.addEventListener("focusin", onIn, true)
    document.addEventListener("focusout", onOut, true)
    return () => {
      document.removeEventListener("focusin", onIn, true)
      document.removeEventListener("focusout", onOut, true)
      html.removeAttribute("data-post-typing")
      unpaintCommunity(false)
    }
  }, [root])

  /*
    THE BOX IN SIGHT ON THE KEYBOARD. The comment box sticks to the scroller's foot only inside the comments section; a long
    post puts that section below the foot, and the box with it. Typing, when the sheet makes the keyboard's room (the scroller
    gets shorter), the post is scrolled by just enough to bring it up.
  */
  useEffect(() => {
    const scroller = scrollRef.current
    if (!root || !scroller || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => {
      if (!rootRef.current?.hasAttribute("data-typing")) return
      const dock = scroller.querySelector<HTMLElement>("[data-comments-composer]")
      if (!dock) return
      const over = dock.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom
      if (over > 1) scroller.scrollTop += over
    })
    ro.observe(scroller)
    return () => ro.disconnect()
  }, [root])

  /* ── THE READOUT ── the numbers the sheet placed the box with, while it is on. */
  useEffect(() => {
    const panel = debugRef.current
    if (!panel || !root) return
    let frame = 0
    const paint = () => {
      frame = 0
      const on = kbDebugOn()
      panel.hidden = !on
      if (!on) return
      const vv = window.visualViewport
      const sheet = sheetEl()
      const probe = document.querySelector<HTMLElement>("[data-viewport-probe]")
      const box = root.querySelector<HTMLElement>("[data-comment-box=comment]")?.getBoundingClientRect()
      const s = sheet?.getBoundingClientRect()
      const r = (n: number | undefined) => (n === undefined ? "-" : String(Math.round(n)))
      const a = document.activeElement
      const typing = !!a && root.contains(a) && takesKeyboard(a)
      panel.textContent = [
        `${currentKeyboardEnv()}  ${typing ? "typing" : "not typing"}  room asked ${typing ? (sheetKeyboardRoom(root) ?? "-") : "-"}`,
        `innerHeight ${window.innerHeight}  layout ${probe?.offsetHeight ?? "-"}  scrollY ${Math.round(window.scrollY)}`,
        `vv.height ${r(vv?.height)}  vv.offsetTop ${r(vv?.offsetTop)}`,
        `sheet top ${r(s?.top)} bottom ${r(s?.bottom)}  room under ${sheet ? getComputedStyle(sheet).paddingBottom : "-"}`,
        `comment box top ${r(box?.top)} bottom ${r(box?.bottom)}`,
      ].join("\n")
    }
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    paint()
    const vv = window.visualViewport
    vv?.addEventListener("resize", soon)
    vv?.addEventListener("scroll", soon)
    window.addEventListener("resize", soon)
    document.addEventListener("focusin", soon, true)
    document.addEventListener("focusout", soon, true)
    /* Only while it is on: the long press that turns it on later is followed by a focus, which redraws it. */
    const t = kbDebugOn() ? window.setInterval(soon, 500) : 0
    return () => {
      cancelAnimationFrame(frame)
      window.clearInterval(t)
      vv?.removeEventListener("resize", soon)
      vv?.removeEventListener("scroll", soon)
      window.removeEventListener("resize", soon)
      document.removeEventListener("focusin", soon, true)
      document.removeEventListener("focusout", soon, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root])

  /*
    ── THE READOUT'S LONG PRESS ── on the face beside the comment box. Held still for KB_DEBUG_PRESS_MS: on (or off), a light
    tap of the phone's haptics (hapticTap, which reaches iOS too), and the panel shown at once.
  */
  useEffect(() => {
    if (!root) return
    let timer = 0
    let at: { x: number; y: number } | null = null
    const cancel = () => {
      window.clearTimeout(timer)
      timer = 0
      at = null
    }
    const onDown = (e: PointerEvent) => {
      const face = (e.target as Element | null)?.closest?.("[data-comment-box=comment] > [data-app-avatar]")
      if (!face) return
      at = { x: e.clientX, y: e.clientY }
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = 0
        const on = toggleKbDebug()
        hapticTap("light")
        const panel = debugRef.current
        if (panel) {
          panel.hidden = !on
          if (on) panel.textContent = "Keyboard readout on. Tap the comment box to see the numbers.\nHold the face again to turn it off."
        }
      }, KB_DEBUG_PRESS_MS)
    }
    const onMove = (e: PointerEvent) => {
      if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > 10) cancel()
    }
    root.addEventListener("pointerdown", onDown, { passive: true })
    root.addEventListener("pointermove", onMove, { passive: true })
    root.addEventListener("pointerup", cancel, { passive: true })
    root.addEventListener("pointercancel", cancel, { passive: true })
    return () => {
      cancel()
      root.removeEventListener("pointerdown", onDown)
      root.removeEventListener("pointermove", onMove)
      root.removeEventListener("pointerup", cancel)
      root.removeEventListener("pointercancel", cancel)
    }
  }, [root])

  /* Escape, for a keyboard on a tablet. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[data-lightbox], [role=alertdialog]")) {
        e.preventDefault()
        request("escape")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* A tap into the empty comment box on iOS: focused without iOS scrolling the page to it (calm-focus.ts). */
  const scope = useCallback(() => rootRef.current, [])
  useCalmFocus(!!root, scope)
  /* The keyboard's room, made in the focus itself where the platform reports nothing (visible-box.ts sheetKeyboardRoom). */
  const keyboardRoom = useCallback(() => sheetKeyboardRoom(rootRef.current), [])

  return (
    <MobileEditorSheet
      open={up}
      onOpenChange={onOpenChange}
      onMoved={onMoved}
      primed
      label={label}
      peekHeight={0}
      detents={POST_SHEET_DETENTS}
      openFull
      layer="raised"
      zIndex={POST_SHEET_Z}
      holdPage="scroll"
      keyboard="sheet"
      keyboardRoom={keyboardRoom}
      className="bg-white [--wb-sheet-skirt:#fff]"
    >
      <div ref={takeRoot} className="relative flex min-h-0 flex-1 flex-col bg-white" data-post-fullscreen="" data-layer-kind="post" data-post-overlay="phone" data-keyboard-own="">
        {/* THE TOP: the space's name and the way out, under the sheet's grab bar. A finger here pulls the sheet. */}
        <div data-post-fullscreen-top="" className="relative flex h-11 shrink-0 items-center justify-center border-b border-[#f0f1f3] px-14">
          <span className="truncate text-[15.5px] font-semibold text-[#1a1a2e]">{title}</span>
          <button
            type="button"
            aria-label="Close post"
            onClick={() => request("back")}
            className="group/close absolute right-0 top-1/2 flex -translate-y-1/2 touch-manipulation items-center justify-center outline-none [-webkit-tap-highlight-color:transparent] focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-[#1a1a2e]/20"
            style={{ width: CLOSE_HIT + 8, height: CLOSE_HIT }}
            data-post-overlay-close=""
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f1f2f4] text-[#4b5563] transition-[background-color,scale] duration-150 ease-out group-active/close:scale-[0.94] group-active/close:bg-[#e6e8eb]">
              <X className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
            </span>
          </button>
        </div>
        <div ref={scrollRef} data-post-overlay-scroll="" className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]">
          <div ref={contentRef} className="flex min-h-full flex-col bg-white" data-post-overlay-phase="">
            {children}
          </div>
        </div>
        {/* THE READOUT (?kbdebug=1, or the long press on the face beside the comment box). */}
        <div ref={debugRef} hidden aria-hidden className="pointer-events-none absolute left-2 right-2 top-12 z-[10] whitespace-pre-wrap rounded-lg bg-[#1a1a2e]/85 px-2.5 py-2 font-mono text-[10.5px] leading-[1.45] text-white" data-kbdebug="" />
      </div>
    </MobileEditorSheet>
  )
}
