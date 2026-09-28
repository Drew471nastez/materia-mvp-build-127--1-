"use client"

/**
 * ===========================================================================
 *  WHERE A SITE'S DRAWER IS, AND WHAT STOPS MOVING WHILE IT IS OPEN
 * ===========================================================================
 * A built site has two drawers that slide over the page, the nav menu and
 * the cart, and both have to answer the same two awkward questions. This is
 * the answer once. Three bugs went into it, one per paragraph.
 *
 * IT OPENED AT THE TOP OF THE PAGE. Inside the editor a drawer is portalled
 * into `#wb-preview-root`, which is `position: relative` and
 * `overflow-y: auto` — it IS the scroller. An absolutely positioned child of
 * a scroller is laid out against its CONTENT box and scrolls with it, so
 * `top: 0` is the top of the whole page rather than the top of what is on
 * screen. Scroll down, open the menu, and it is drawn a screen or two above
 * you. So the drawer is pinned: `top` is the scroller's `scrollTop` and its
 * height is the scroller's `clientHeight`.
 *
 * THE PAGE KEPT SCROLLING UNDERNEATH. On a published site the lock was
 * `overflow: hidden` on the body, which iOS ignores for touch scrolling, the
 * same thing the explore filters sheet hit. It is the position-fixed lock
 * now, with the offset carried on `top` and put back on close. When scoped
 * there was no lock at all; the scroller takes one of its own, which works
 * because it is a real overflow container rather than the body.
 *
 * IT WAS HALF HEIGHT. Tapping the hamburger in the editor also selects the
 * header, so the inspector sheet opens on the same tap, publishes its peek
 * and the canvas subtracts it as padding. The canvas changes height and the
 * WINDOW never resizes, so a `resize` listener hears nothing and a drawer
 * measured once is left at the wrong size for as long as it is open. A
 * ResizeObserver on the scroller hears all of it.
 *
 * Measured by scripts/check-nav-drawer.mjs, which drives a real page rather
 * than a virtual-time one: frames do not run under a virtual clock, so a
 * ResizeObserver never fires there and the third bug is invisible.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react"

/**
 * A layout effect in the browser, an ordinary one on the server — where
 * React warns about layout effects and there is no layout to be had anyway.
 * The lock and the drawer's rectangle both belong before the first paint of
 * an opening: measured afterwards, the drawer is drawn once at last time's
 * offset and jumps on the frame after.
 */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * One pace for every drawer on a built site. Open settles a touch slower
 * than close, which is how a physical thing behaves: it arrives, it leaves.
 * A link inside a drawer waits CLOSE_MS before asking for its page, so the
 * close is seen rather than cut off by the navigation.
 */
export const DRAWER_OPEN_MS = 360
export const DRAWER_CLOSE_MS = 260
export const DRAWER_OPEN_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
export const DRAWER_CLOSE_EASE = "cubic-bezier(0.4, 0, 1, 1)"
export const drawerSlide = (open: boolean) =>
  open ? `transform ${DRAWER_OPEN_MS}ms ${DRAWER_OPEN_EASE}` : `transform ${DRAWER_CLOSE_MS}ms ${DRAWER_CLOSE_EASE}`
export const drawerFade = (open: boolean) =>
  open ? `opacity 300ms ${DRAWER_OPEN_EASE}` : `opacity 220ms cubic-bezier(0.4, 0, 0.6, 1)`

/** Somebody who has asked their phone for less movement gets none of this. */
export const prefersStill = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * ===========================================================================
 *  A DRAWER STARTS MOVING ON A FRAME THE BROWSER HAS ACTUALLY PAINTED
 * ===========================================================================
 * "When I open the navigation sidebar the nav sidebar is not even smooth."
 *
 * It was not. Filmed at 390px with the processor slowed four times, in
 * scripts/check-header-motion.mjs: from the tap, NOTHING on screen changed
 * for between 125 and 183 milliseconds, and then 93% to 100% of the picture
 * changed in a single frame. The drawer did not slide in. It appeared,
 * already most of the way across.
 *
 * The cause is an ordering nobody wrote down. Tapping the menu sets React
 * state; React re-renders the whole header, portals the drawer's panel and
 * every row in it, and the same commit puts `transform: translate3d(0,0,0)`
 * with a 360ms transition on the panel. All of that is ONE task — 85 to
 * 110ms of it here — and the browser cannot paint until it ends. But the
 * transition's clock started when the style was set, at the beginning of
 * that task. So by the time the first frame is painted the slide is already
 * a third finished, and the first third of it was never drawn.
 *
 * The answer is the one every platform's sheet uses: do the work, let the
 * browser paint the drawer where it still is, and start the travel on the
 * NEXT frame. `requestAnimationFrame` is exactly that moment — the callback
 * runs at the top of a rendering step, so the transition begins on a frame
 * that is about to be drawn and every millisecond of it is seen.
 *
 * Which means the transform cannot come from React at all: a React render is
 * the commit we are trying to get out from under. It is written here, to the
 * node, on the frame it should begin. The same hook serves the panel (which
 * travels) and the backdrop (which fades), because they must begin together
 * or the dark and the panel arrive apart.
 *
 * `will-change` is put on for the journey and taken off at the end of it, so
 * a closed drawer is not holding a compositor layer for the rest of the
 * visit. A permanently promoted layer is what the header's own note below
 * blames for stale tiles, and there is no reason for two of them.
 */
export function useDrawerMotion(
  open: boolean,
  /** `transform` for a panel that travels, `opacity` for a backdrop. */
  property: "transform" | "opacity",
  /** What the node reads while closed, and returns to. */
  closed: string,
  /** What it reads while open. */
  shown: string,
): (node: HTMLElement | null) => void {
  const nodeRef = useRef<HTMLElement | null>(null)
  const frame = useRef(0)
  /* Held in a ref so a re-rendered string does not restart the animation:
     these are constants of the drawer, not state. */
  const at = useRef({ closed, shown })
  at.current = { closed, shown }

  const setNode = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node
    if (!node || node.dataset.drawerPlaced) return
    node.dataset.drawerPlaced = "1"
    /* The resting state, put on with the node and before its first paint, so
       a drawer that has never been opened does not slide in on mount. */
    node.style.transition = "none"
    node.style[property] = at.current.closed
    /* The compositor layer goes when the journey ends, not when the drawer
       does: a closed drawer holding one for the rest of the visit is the
       promotion the header's own note below blames for stale tiles. */
    node.addEventListener("transitionend", (e) => {
      /* This node's own journey, not a chevron's inside it: transitionend
         bubbles, and the drawer is full of small things that transition. */
      if (e.target === node && e.propertyName === property) node.style.willChange = ""
    })
  }, [property])

  useEffect(() => {
    const el = nodeRef.current
    if (!el) return
    const to = open ? at.current.shown : at.current.closed
    cancelAnimationFrame(frame.current)

    if (prefersStill()) {
      el.style.transition = "none"
      el.style[property] = to
      return
    }

    frame.current = requestAnimationFrame(() => {
      el.style.willChange = property
      el.style.transition = property === "transform" ? drawerSlide(open) : drawerFade(open)
      el.style[property] = to
    })
    return () => cancelAnimationFrame(frame.current)
  }, [open, property])

  return setNode
}

/**
 * One ref attribute, two refs — memoised, because a ref callback with a new
 * identity is detached and reattached on every render, and both of the ones
 * composed here do real work when they attach.
 */
type Attach<T> = (node: T | null) => void | (() => void)
export function useComposedRef<T extends HTMLElement>(a: Attach<T>, b: Attach<T>): Attach<T> {
  return useCallback((node: T | null) => {
    const undoA = a(node)
    const undoB = b(node)
    /* React 19 takes a function back from a ref callback as its detach. One
       of these two hands one over, and losing it would leak the panel's touch
       listeners every time the drawer's node changed. */
    const undo = [undoA, undoB].filter((u): u is () => void => typeof u === "function")
    if (undo.length) return () => { for (const u of undo) u() }
  }, [a, b])
}

/**
 * ===========================================================================
 *  DISMISSING BY TAPPING AWAY, WITHOUT THE TAP DOING ANYTHING ELSE
 * ===========================================================================
 * The backdrop closed on `click`, which is two problems on a built site.
 *
 * IT ARRIVES LAST. A click is synthesised at the end of a press and a
 * release, and anything in between that cancels it takes the dismissal with
 * it. A pointer going down on the backdrop is already the whole gesture:
 * there is nothing else a press there can mean.
 *
 * AND IT DOES NOT STAY ON THE BACKDROP. A portal renders outside the
 * header's markup but stays inside its REACT tree, so the event still
 * bubbles to the section wrapper, which in the editor selects the section
 * and opens its settings. Tapping away to dismiss a menu opened the header
 * panel instead, which is the "clicking away does nothing" in the report:
 * something happened, but not the thing that was meant.
 *
 * So the dismissal is bound to the element natively, runs on pointerdown,
 * and stops there.
 */
export function useBackdropDismiss(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  return useCallback((node: HTMLDivElement | null) => {
    if (!node) return

    /*
      AND THE CLICK THAT ARRIVES AFTER IT.

      Closing on the press is the point, but the release still produces a
      click, and by then the backdrop has stopped taking pointer events — so
      that click lands on whatever was underneath. In the editor that selects
      a section and opens its panel; on a published site it can follow a link
      the menu was covering. Measured by scripts/check-nav-drawer.mjs, which
      counts what gets past the backdrop: one event did.

      So the press takes the next click with it, once, and gives up waiting
      after a moment in case no click ever comes.
    */
    const swallowNextClick = () => {
      const eat = (e: Event) => {
        e.stopPropagation()
        e.preventDefault()
        window.removeEventListener("click", eat, true)
      }
      window.addEventListener("click", eat, true)
      window.setTimeout(() => window.removeEventListener("click", eat, true), 700)
    }

    const dismiss = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
      if (e.type === "pointerdown") swallowNextClick()
      closeRef.current()
    }

    /* Native, not React's synthetic listener: React's runs from the root
       container, so a handler above this one in the React tree can see the
       event first. This one cannot be reached before the backdrop has it. */
    node.addEventListener("pointerdown", dismiss)
    /* A browser with no pointer events, and a keyboard or assistive click
       that never produces one. It is not reached after a pointerdown,
       because that press has already taken this click. */
    node.addEventListener("click", dismiss)
    /*
      AND A DRAG ON IT MOVES NOTHING.

      The press closes the menu, and the lock comes off with it, while the
      finger is still going. The rest of that drag belongs to the backdrop
      (a touch keeps the target it started on), so refusing its moves here
      is what stops it scrolling the page the menu has just let go of.
    */
    node.addEventListener("touchmove", refuseMove, { passive: false })
  }, [])
}

function refuseMove(e: TouchEvent) {
  if (e.cancelable) e.preventDefault()
}

/**
 * ===========================================================================
 *  A FINGER IN THE MENU MOVES THE MENU, NEVER THE PAGE BEHIND IT
 * ===========================================================================
 * "When I try to scroll in that sidebar navigation, it scrolls the website."
 *
 * A scroll that reaches the end of the drawer's list is handed on to
 * whatever scrolls behind it, and a list too short to scroll hands on the
 * whole gesture. `overscroll-behavior: contain` says no to that, and WebKit
 * inside the iOS app does not listen (its scroll is a native view; see
 * components/platform/capacitor-bounce-guard.tsx). The lock stops the page
 * itself; this stops the gesture ever being handed on.
 *
 * So a move is cancelled exactly when it would leave the drawer: nothing in
 * it scrolls under the finger, or what does is already at the end the finger
 * is pushing toward. Every other move is left to the browser, so the list
 * scrolls natively and a tap is never touched (a tap has no moves).
 *
 * Decided once per gesture where it is expensive (which element scrolls),
 * and per move only where it has to be (one scrollTop read).
 */
export interface GestureScroller {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/**
 * Would this move, left alone, carry past the drawer to the page? `dx` and
 * `dy` are the finger's travel since the last move, positive right and down.
 * A finger moving down drags the list toward its top.
 */
export function moveReachesPage(scroller: GestureScroller | null, dx: number, dy: number): boolean {
  if (dx === 0 && dy === 0) return false
  /* Nothing in a drawer scrolls sideways, so a sideways move is the page's. */
  if (Math.abs(dx) > Math.abs(dy)) return true
  if (!scroller) return true
  const room = scroller.scrollHeight - scroller.clientHeight
  if (room <= 1) return true
  return dy > 0 ? scroller.scrollTop <= 0 : scroller.scrollTop >= room - 1
}

/** The element that scrolls under this finger, between it and the drawer. */
function scrollerUnder(target: EventTarget | null, panel: HTMLElement): HTMLElement | null {
  let el = target instanceof Element ? target : null
  while (el && el !== panel.parentElement) {
    const oy = getComputedStyle(el).overflowY
    const h = el as HTMLElement
    if ((oy === "auto" || oy === "scroll") && h.scrollHeight > h.clientHeight + 1) return h
    if (el === panel) break
    el = el.parentElement
  }
  return null
}

/**
 * The drawer panel's half. A callback ref: the listeners go on with the
 * node and come off with it, and they only ever hear gestures that start
 * inside the drawer, which is only while it is open.
 */
export function useDrawerTouchGuard() {
  return useCallback((panel: HTMLElement | null) => {
    if (!panel) return
    let scroller: HTMLElement | null = null
    let lastX = 0
    let lastY = 0
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      lastX = t.clientX
      lastY = t.clientY
      scroller = scrollerUnder(e.target, panel)
    }
    const onMove = (e: TouchEvent) => {
      /* Two fingers is a zoom, which is the visitor's to make. */
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - lastX
      const dy = t.clientY - lastY
      lastX = t.clientX
      lastY = t.clientY
      if (e.cancelable && moveReachesPage(scroller, dx, dy)) e.preventDefault()
    }
    /* Touchdown never cancels anything, so it does not make scrolling wait. */
    panel.addEventListener("touchstart", onStart, { passive: true })
    panel.addEventListener("touchmove", onMove, { passive: false })
    return () => {
      panel.removeEventListener("touchstart", onStart)
      panel.removeEventListener("touchmove", onMove)
    }
  }, [])
}

export interface DrawerFrame {
  /** False until the client has mounted, when there is no portal target yet. */
  mounted: boolean
  /** Where to portal to: the editor's canvas, or the document. */
  target: HTMLElement | null
  /** `absolute` only when the portal really went into the canvas. */
  positionClass: "absolute" | "fixed"
  /** Top and height, covering exactly the rectangle the visitor can see. */
  frameStyle: CSSProperties
}

/**
 * The attribute the canvas carries while a site drawer holds it still. The
 * editor's own touch handling reads it and stands down: its touchdown nudge
 * moved the canvas a pixel under an open menu, which is a page that moved.
 */
export const SITE_DRAWER_OPEN_ATTRIBUTE = "data-site-drawer-open"

export function useDrawerFrame(open: boolean, scopedToPreview: boolean, onClose: () => void): DrawerFrame {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [pin, setPin] = useState<{ top: number; height: number } | null>(null)

  /*
    THE LOCK IS TAKEN ONCE PER OPENING, NOT ONCE PER RENDER.

    `onClose` was a dependency of the effect below, and the header passes a
    new arrow every render. So every render of the header while the menu was
    open let go of the page and took it again: the body unpinned, the window
    scrolled back, the body pinned. Held in a ref, the lock follows `open`
    and nothing else.
  */
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  /*
    BEFORE THE PAINT, NOT AFTER IT.

    This was an ordinary effect, which runs once the browser has already had
    the chance to draw. Inside the editor the drawer's rectangle comes from
    `setPin` below, so on an opening the first painted frame carried LAST
    time's offset — the drawer drawn at wherever the canvas was scrolled to
    when it was last opened — and the frame after it jumped to the right
    place. On a published page the same lateness meant the page was still
    free to scroll for a frame after the menu was over it.

    A layout effect is the same code one step earlier: the lock is taken and
    the rectangle is measured in the same commit the drawer is rendered in,
    so the first frame anybody sees is already correct.
  */
  useBeforePaint(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current() }
    window.addEventListener("keydown", onKey)

    const undo: Array<() => void> = [() => window.removeEventListener("keydown", onKey)]

    const scroller = scopedToPreview ? document.getElementById("wb-preview-root") : null

    if (scroller) {
      const startTop = scroller.scrollTop
      const measure = () => setPin({ top: scroller.scrollTop, height: scroller.clientHeight })
      measure()

      const prevOverflow = scroller.style.overflow
      const prevTouch = scroller.style.touchAction
      scroller.style.overflow = "hidden"
      scroller.style.touchAction = "none"
      scroller.setAttribute(SITE_DRAWER_OPEN_ATTRIBUTE, "")

      const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
      ro?.observe(scroller)
      window.addEventListener("resize", measure)

      undo.push(() => {
        ro?.disconnect()
        window.removeEventListener("resize", measure)
        scroller.style.overflow = prevOverflow
        scroller.style.touchAction = prevTouch
        scroller.removeAttribute(SITE_DRAWER_OPEN_ATTRIBUTE)
        // `overflow: hidden` can clamp the offset; put it back verbatim.
        scroller.scrollTop = startTop
      })
    } else {
      setPin(null)
      const scrollY = window.scrollY
      const body = document.body.style
      const root = document.documentElement.style
      /*
        AND THE PAGE'S OWN SCROLLBAR GOES WITH IT.

        Pinning the body freezes the page, but the document is still the
        thing that scrolls, and on a screen with classic scrollbars its bar
        stayed drawn down the right edge beside the open drawer: a control
        for scrolling a page that could not be scrolled. It is the bar in
        the cart screenshot.

        The document's overflow is hidden while the drawer is open. That
        takes the bar's column away, which would shift everything left by
        its width, so the body is padded by exactly that width for as long
        as the bar is gone. Overlay scrollbars have no width and get no
        padding, so nothing moves there either.
      */
      /* Measured on the element that is scrolling this page. It is the
         document on every site this renders today, but a wrapper that owns
         the scroll would otherwise keep its bar while the document's went. */
      const scrollingEl = (document.scrollingElement ?? document.documentElement) as HTMLElement
      const barWidth = window.innerWidth - document.documentElement.clientWidth
      const prev = {
        position: body.position,
        top: body.top,
        left: body.left,
        right: body.right,
        width: body.width,
        paddingRight: body.paddingRight,
        rootOverflow: root.overflow,
      }
      /*
        THE BODY IS PINNED, BUT IT DOES NOT BECOME A SCROLLER.

        It was `overflow: hidden` here too. That makes the body a scroll
        container, and a sticky header sticks to its nearest scroll
        container: the body, now pinned at -scrollY, so the header left the
        screen with the page the moment the menu opened and came back when it
        closed. The document's own overflow (below) is what hides the bar and
        stops the page; the body only has to stay put, and with its overflow
        left alone a sticky header stays exactly where it was on screen.
      */
      body.position = "fixed"
      body.top = `-${scrollY}px`
      body.left = "0"
      body.right = "0"
      body.width = "100%"
      if (barWidth > 0) body.paddingRight = `${barWidth}px`
      root.overflow = "hidden"
      /*
        AND THE PAGE SAYS A DRAWER IS OPEN.

        `overflow: hidden` on the document is the correct lock and it is
        measurably enough in a page of our own making: the probe reports the
        bar at 15px, 0px while open, 15px after. It was still reported as
        drawn on a real site, where the page is a creator's own markup and
        any wrapper in it may be the thing carrying the scroll.

        Rather than keep guessing which element that is, the requirement is
        stated where it cannot be missed: while this attribute is set, no
        scrollbar is drawn on the document or the body, whichever of them
        would have drawn it. The padding above still holds the layout still,
        so taking the bar away moves nothing.
      */
      document.documentElement.setAttribute("data-drawer-open", "")
      const prevScrollingOverflow = scrollingEl.style.overflow
      if (scrollingEl !== document.documentElement && scrollingEl !== document.body) scrollingEl.style.overflow = "hidden"

      undo.push(() => {
        body.position = prev.position
        body.top = prev.top
        body.left = prev.left
        body.right = prev.right
        body.width = prev.width
        body.paddingRight = prev.paddingRight
        root.overflow = prev.rootOverflow
        document.documentElement.removeAttribute("data-drawer-open")
        if (scrollingEl !== document.documentElement && scrollingEl !== document.body) scrollingEl.style.overflow = prevScrollingOverflow
        /* Instant, whatever the theme says. On a site whose stylesheet sets
           `scroll-behavior: smooth` on the document this was a visible
           scroll from the top of the page back to where the visitor was. */
        window.scrollTo({ top: scrollY, left: 0, behavior: "instant" as ScrollBehavior })
      })
    }

    return () => { undo.forEach((fn) => fn()) }
  }, [open, scopedToPreview])

  const previewRoot = mounted && scopedToPreview ? document.getElementById("wb-preview-root") : null

  return {
    mounted,
    target: mounted ? (previewRoot ?? document.body) : null,
    positionClass: previewRoot ? "absolute" : "fixed",
    // Held through the close animation so a drawer slides out from where it
    // was rather than jumping on the way.
    frameStyle: pin ? { top: pin.top, height: pin.height } : { top: 0, bottom: 0 },
  }
}

/**
 * ===========================================================================
 *  A COOKIE NOTICE MUST NOT COVER AN OPEN MENU
 * ===========================================================================
 * The drawers were z-90 and z-95, which beats everything a built site draws.
 * It does not beat the cookie banner, which is `fixed bottom-0 z-[9999]` —
 * and that banner sits across the bottom of the screen, exactly where the
 * menu keeps Search, Account, Wishlist and Create account.
 *
 * Measured on a live published site at phone size: the Search row reported
 * its own topmost element at its centre as
 *
 *     div.flex flex-col gap-3 p-5 sm:flex-row sm:i…
 *
 * which is the banner's top bar, and a tap on Search left the address at "/".
 * The rows were not dead; the tap never reached them.
 *
 * The banner's own file already records this bug happening once before, to
 * the Sites editor's Chat / Preview / Code bar, and answers it by hiding
 * itself there. A public site cannot hide it, so the menu goes above it
 * instead — which is the right order anyway: a cookie notice is the lowest
 * thing on a page, and an open dialog is the highest.
 *
 * Named here rather than written twice, because the nav drawer and the cart
 * drawer are the same surface at different edges and drifting apart is how
 * one of them gets fixed.
 */
export const DRAWER_BACKDROP_Z = "z-[10000]"
export const DRAWER_PANEL_Z = "z-[10001]"

/**
 * ===========================================================================
 *  THE HEADER GOES UNDER THE MENU WHILE IT IS OPEN
 * ===========================================================================
 * "It's opening the mobile navigation sidebar, but it keeps the header open."
 *
 * The menu is a full height panel with its own top row, "Menu" and a close
 * button, so the site's header has nothing left to do while it is open: its
 * logo and icons stayed drawn beside the panel, and a header set to show on
 * scroll up could be seen sliding about behind the backdrop. Shopify's menu
 * drawer makes the same call from the other side, with a drawer below a
 * header whose button becomes the close; here the drawer has the close, so
 * the header steps back.
 *
 * It fades out as the backdrop fades in, at the backdrop's pace, and back as
 * it goes. Opacity only, on the compositor, through the Web Animations API
 * rather than a style: show on scroll up writes `transition` straight to the
 * same node, so a transition written here would fight it.
 *
 * AND IT STARTS ON THE SAME FRAME THE DRAWER DOES. An animation created in
 * an effect starts counting from the moment it is created, which is inside
 * the commit that opened the menu — so on a slow phone it was a third spent
 * before anything was painted, and the header did not fade, it stepped. Held
 * until the next frame, exactly as the panel and the backdrop are, all three
 * begin together and are seen from their first millisecond. See
 * useDrawerMotion above for the measurements.
 */
export function useHeaderUnderDrawer(ref: { current: HTMLElement | null }, drawerOpen: boolean) {
  const fade = useRef<Animation | null>(null)
  const frame = useRef(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof el.animate !== "function") return
    /* Closed and never faded: nothing to put back. */
    if (!drawerOpen && !fade.current) return
    cancelAnimationFrame(frame.current)
    const start = () => {
      /* From wherever it is now, so a quick open and close does not jump. */
      const from = Number(getComputedStyle(el).opacity)
      fade.current?.cancel()
      const still = prefersStill()
      const a = el.animate([{ opacity: from }, { opacity: drawerOpen ? 0 : 1 }], {
        duration: still ? 0 : drawerOpen ? 300 : 220,
        easing: drawerOpen ? DRAWER_OPEN_EASE : "cubic-bezier(0.4, 0, 0.6, 1)",
        fill: "forwards",
      })
      fade.current = a
      /* Back at full opacity the animation goes, so nothing is left holding
         the header's opacity for the rest of the visit. */
      if (!drawerOpen) {
        a.finished.then(() => { if (fade.current === a) { a.cancel(); fade.current = null } }, () => {})
      }
    }
    frame.current = requestAnimationFrame(start)
    return () => cancelAnimationFrame(frame.current)
  }, [drawerOpen, ref])
  useEffect(() => () => { cancelAnimationFrame(frame.current); fade.current?.cancel() }, [])
}
