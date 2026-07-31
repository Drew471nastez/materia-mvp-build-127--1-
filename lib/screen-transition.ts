"use client"

/**
 * Native-style screen transitions — a push when you open something, a pop when
 * you come back, and an edge drag that lets you do the pop by hand.
 *
 * ---------------------------------------------------------------------------
 * Why this is hand-rolled
 * ---------------------------------------------------------------------------
 * Next unmounts the outgoing page the instant it navigates, so during a route
 * change there is nothing behind the incoming one. Every white flash and every
 * "it fades into nothing" came from that single fact: a page sliding in from the
 * right is sliding in over the bare document background, not over the screen you
 * came from.
 *
 * The View Transitions API solves it by photographing both screens for you, and
 * that is what this used to use. Two problems. It isn't everywhere — and where
 * it is missing there is no graceful degradation, only the absence of any
 * animation at all, which is impossible to diagnose from the outside and is
 * almost certainly what was being reported. And it cannot be driven by a finger:
 * a transition you can start, drag halfway, and change your mind about is not
 * something the API is shaped for.
 *
 * So we take the photographs ourselves. Cloning the live DOM into a layer that
 * sits above everything gives us the same guarantee — two real screens on screen
 * at once — with none of the dependency and, because it is just elements with
 * transforms, it can follow a finger as easily as it can follow a curve.
 *
 * The clone is a real subtree with real (already-decoded) images, so it paints
 * on the first frame. Everything that animates is transform and filter, both
 * composited, so a drag stays on the compositor even while the incoming route is
 * still building on the main thread.
 */

const HOST_ID = "screen-transition-host"

/** Push is the longer of the two: arriving somewhere earns a beat, returning
 *  from somewhere you have already seen does not. */
const MS = { push: 340, pop: 280 }
/** iOS's own curve — quick off the mark, long tail, no overshoot. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** How far the screen underneath travels, as a share of the width. The parallax
 *  is what makes this read as two stacked cards rather than two sliding images. */
const PARALLAX = 22
/** And it dims, which is the other half of the same effect. */
const DIM = 0.82

/**
 * How long we will hold the outgoing screen up waiting for the incoming one.
 *
 * Short, because the wait no longer buys much: the destination is cloned, and a
 * clone is live DOM, so an image that has not arrived yet still loads and paints
 * inside the picture while it slides. There is nothing to be gained by standing
 * still first — the same wait now happens during the animation instead of in
 * front of it.
 */
const HOLD = { push: 300, pop: 220 }

// ---------------------------------------------------------------------------
// Arrival handshake
// ---------------------------------------------------------------------------

let arrive: (() => void) | null = null

/**
 * Called by a destination screen once it is genuinely rendered.
 *
 * Genuinely means with its photo, and — for the feed — with its scroll offset
 * restored. We photograph the screen the moment this fires, so anything not
 * finished at that point is baked into the picture and then jumps when the real
 * page is revealed.
 *
 * Safe to call at any time; outside a transition it does nothing.
 */
export function signalArrival(): void {
  const fn = arrive
  arrive = null
  fn?.()
}

function waitForArrival(ms: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    arrive = finish
    setTimeout(finish, ms)
  })
}

// ---------------------------------------------------------------------------
// Screenshots
// ---------------------------------------------------------------------------

function hostEl(): HTMLElement {
  let h = document.getElementById(HOST_ID)
  if (!h) {
    h = document.createElement("div")
    h.id = HOST_ID
    h.setAttribute("aria-hidden", "true")
    // Above everything, and transparent to touch: the live page underneath must
    // keep receiving the drag that is moving these very layers.
    h.style.cssText =
      "position:fixed;inset:0;z-index:2147483000;overflow:hidden;pointer-events:none;display:none;"
    document.body.appendChild(h)
  }
  return h
}

/** Elements that must not be copied — they are not part of the picture. */
function skip(el: Element): boolean {
  const tag = el.tagName
  return (
    el.id === HOST_ID ||
    tag === "SCRIPT" ||
    tag === "STYLE" ||
    tag === "LINK" ||
    tag === "TEMPLATE" ||
    tag.startsWith("NEXT-") ||
    el.hasAttribute("data-nextjs-dialog-overlay") ||
    el.hasAttribute("data-no-snapshot")
  )
}

/**
 * Copy every scrolled position from the live tree onto its clone.
 *
 * The clone is structurally identical, so walking both in document order lines
 * the two up index for index. Without this a cloned feed shows the top of the
 * list while the real one is halfway down it — the picture and the page would
 * disagree, and you would see them disagree at the end of the transition.
 *
 * Has to run after the clone is in the document: scrollTop on a detached node is
 * accepted and silently discarded, because there is nothing laid out to scroll.
 */
function copyScroll(live: Element, clone: Element): number[] {
  const a = [live, ...Array.from(live.querySelectorAll("*"))]
  const b = [clone, ...Array.from(clone.querySelectorAll("*"))]
  const offsets: number[] = []
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const src = a[i] as HTMLElement
    const top = src.scrollTop
    const left = src.scrollLeft
    if (top || left) {
      ;(b[i] as HTMLElement).scrollTop = top
      ;(b[i] as HTMLElement).scrollLeft = left
      offsets.push(i, top, left)
    }
  }
  return offsets
}

/** Re-apply a recorded scroll map — used when a kept screenshot is shown again. */
function applyScroll(clone: Element, offsets: number[]) {
  const b = [clone, ...Array.from(clone.querySelectorAll("*"))]
  for (let i = 0; i < offsets.length; i += 3) {
    const el = b[offsets[i]] as HTMLElement | undefined
    if (!el) continue
    el.scrollTop = offsets[i + 1]
    el.scrollLeft = offsets[i + 2]
  }
}

type Shot = HTMLElement & { __scroll?: number[] }

/** Photograph what is on screen right now, into `host`. */
function shoot(host: HTMLElement): Shot {
  const layer = document.createElement("div") as Shot
  // `contain` stops the clone's layout from being recalculated against the live
  // document, and the background guarantees an opaque plate even if the page
  // being copied happens to be transparent.
  layer.style.cssText =
    "position:absolute;inset:0;overflow:hidden;background:#fff;will-change:transform,filter;contain:layout paint;"

  // The document may be scrolled — a product page is a long scrolling page — and
  // a clone starts at the top, so the in-flow content has to be shifted up by
  // however far down we were for the picture to match what is in front of you.
  //
  // Shifted with `top`, NOT with a transform. A transform makes the element a
  // containing block for everything fixed inside it, so a transform here dragged
  // the cloned fixed layers up with the document — and the feed is one big fixed
  // layer. Coming back from a listing scrolled 800px down, the feed's photograph
  // was rendered 800px off the top of the screen: near enough blank, then
  // correct the instant the picture was dropped. That is the flash on the way
  // back, and it is also why it never happened on the way in, where the screen
  // being photographed is the feed and the document is not scrolled at all.
  //
  // With `top`, in-flow content offsets and fixed content stays put — anchored
  // to the layer, which is exactly the viewport, because `contain: paint` makes
  // IT the containing block for fixed descendants.
  const inner = document.createElement("div")
  const y = window.scrollY || 0
  inner.style.cssText = `position:absolute;left:0;right:0;top:${-y}px;`
  layer.appendChild(inner)

  for (const child of Array.from(document.body.children)) {
    if (skip(child)) continue
    inner.appendChild(child.cloneNode(true))
  }
  host.appendChild(layer)

  // Scroll offsets, now that it is in the document and has layout.
  const live: Element[] = []
  const copies: Element[] = []
  let i = 0
  for (const child of Array.from(document.body.children)) {
    if (skip(child)) continue
    live.push(child)
    copies.push(inner.children[i++])
  }
  const map: number[] = []
  for (let k = 0; k < live.length; k++) {
    const sub = copyScroll(live[k], copies[k])
    // Offsets are per-subtree, so tag them with which subtree they belong to.
    for (let j = 0; j < sub.length; j += 3) map.push(k, sub[j], sub[j + 1], sub[j + 2])
  }
  layer.__scroll = map
  ;(layer as any).__inner = inner
  return layer
}

/** Put a kept screenshot back on screen, offsets and all. */
function reshoot(host: HTMLElement, shot: Shot): Shot {
  // Anything still running on it holds its own values above the inline styles we
  // are about to set — including a finished fill:forwards animation, which is
  // how this was left when it was parked. Reused as-is, the screenshot starts
  // the gesture already shifted and dimmed and refuses to be moved. That is the
  // "sometimes it just doesn't work".
  shot.getAnimations().forEach((a) => a.cancel())
  host.appendChild(shot)
  const inner = (shot as any).__inner as HTMLElement | undefined
  const map = shot.__scroll
  if (inner && map) {
    for (let i = 0; i < map.length; i += 4) {
      const sub = inner.children[map[i]]
      if (sub) applyScroll(sub, [map[i + 1], map[i + 2], map[i + 3]])
    }
  }
  return shot
}

// ---------------------------------------------------------------------------
// The transition
// ---------------------------------------------------------------------------

/**
 * The screen we came from, kept alive while we are on the page it led to.
 *
 * This is what the edge drag reveals. A gesture has to show the destination from
 * its very first millimetre — you cannot navigate first and change your mind
 * afterwards — so the only way to have it there is to have kept it.
 */
let previous: Shot | null = null

function animate(el: HTMLElement, frames: Keyframe[], ms: number) {
  return el.animate(frames, { duration: ms, easing: EASE, fill: "forwards" })
}

function slideMobile(): boolean {
  return window.matchMedia("(max-width: 767px)").matches
}

function reduced(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Frames for the screen arriving, and the screen leaving, in each direction. */
function frames(kind: "push" | "pop") {
  // Reduced motion keeps the transition but takes the travel out of it: the
  // preference asks for less movement, not for less feedback, and a page change
  // with no sign that it changed is harder to follow rather than easier.
  if (reduced()) {
    return {
      incoming: [{ opacity: 0 }, { opacity: 1 }],
      outgoing: [{ opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }],
    }
  }
  if (kind === "push") {
    return {
      incoming: [{ transform: "translateX(100%)" }, { transform: "translateX(0)" }],
      outgoing: [
        { transform: "translateX(0)", filter: "brightness(1)" },
        { transform: `translateX(-${PARALLAX}%)`, filter: `brightness(${DIM})` },
      ],
    }
  }
  return {
    incoming: [
      { transform: `translateX(-${PARALLAX}%)`, filter: `brightness(${DIM})` },
      { transform: "translateX(0)", filter: "brightness(1)" },
    ],
    outgoing: [{ transform: "translateX(0)" }, { transform: "translateX(100%)" }],
  }
}

let running = false

/**
 * Navigate with a push or a pop.
 *
 * The order matters and is the whole trick. We photograph the current screen and
 * raise it over everything FIRST, so the navigation happens behind a picture of
 * where you already were and nothing is ever seen half-built. Only once the
 * destination reports itself ready do we photograph that too, and animate the
 * two against each other. The live page is revealed at the end, in its finished
 * state, by throwing both pictures away.
 */
export async function navigateScreen(kind: "push" | "pop", go: () => void): Promise<void> {
  // Desktop navigates plainly. A full-viewport slide on a large screen reads as
  // a phone app pretending to be a website, and there is no back gesture there
  // for it to correspond to.
  if (typeof document === "undefined" || !slideMobile() || running) {
    go()
    return
  }

  running = true
  const host = hostEl()
  host.innerHTML = ""
  host.style.display = "block"
  // Lets a destination tell whether something is already animating it in, so it
  // doesn't add an entry animation of its own on top.
  document.documentElement.dataset.blend = kind === "push" ? "enter" : "back"

  const outgoing = shoot(host)

  try {
    go()
    await waitForArrival(HOLD[kind])

    const incoming = shoot(host)
    // Popping, the screen you are LEAVING stays on top — it is the thing that
    // moves away to reveal what was under it. Pushing, the arriving screen is
    // the one that travels, so it goes above.
    if (kind === "pop") host.insertBefore(incoming, outgoing)

    const f = frames(kind)
    // Start style applied before the first frame so nothing is ever seen at rest
    // in the wrong place.
    Object.assign(incoming.style, f.incoming[0] as any)
    const a = animate(incoming, f.incoming, MS[kind])
    const b = animate(outgoing, f.outgoing, MS[kind])
    await Promise.allSettled([a.finished, b.finished])

    // Keep the screen we left, but only when we pushed into something — that is
    // the picture the back gesture will need. Popping, we are returning to it,
    // so what we were holding is now stale.
    previous = kind === "push" ? outgoing : null
    if (previous) previous.remove()
  } finally {
    host.innerHTML = ""
    host.style.display = "none"
    delete document.documentElement.dataset.blend
    running = false
  }
}

// ---------------------------------------------------------------------------
// Edge drag
// ---------------------------------------------------------------------------

/** How far in from the left edge a touch has to start to count as a back drag. */
const EDGE = 28
/** Past this share of the width, letting go completes rather than cancels. */
const COMMIT = 0.34
/** Or past this speed, in px/ms, however far it got — a flick counts. */
const FLICK = 0.45

/**
 * Wire up the drag-from-the-left-edge back gesture on the current screen.
 *
 * Returns a teardown function, so it can live in an effect.
 *
 * Only works when there is a kept screenshot of where you came from. Arriving on
 * a listing from a shared link there is nothing behind it to drag it off, and a
 * gesture that reveals a blank screen is worse than no gesture.
 */
export function enableEdgeBack(onCommit: () => void): () => void {
  if (typeof document === "undefined") return () => {}

  let host: HTMLElement | null = null
  let top: Shot | null = null
  let under: Shot | null = null
  let startX = 0
  let startY = 0
  let startT = 0
  let lastX = 0
  let lastT = 0
  let active = false
  let armed = false

  const width = () => window.innerWidth || 1

  const paint = (dx: number) => {
    if (!top || !under) return
    const p = Math.max(0, Math.min(1, dx / width()))
    top.style.transform = `translate3d(${dx}px,0,0)`
    // The screen underneath comes the rest of the way as you pull, so the two
    // stay locked together the way they would if they were physically stacked.
    under.style.transform = `translate3d(${-PARALLAX * (1 - p)}%,0,0)`
    under.style.filter = `brightness(${DIM + (1 - DIM) * p})`
  }

  const begin = () => {
    if (!previous || running) return false
    host = hostEl()
    host.innerHTML = ""
    host.style.display = "block"
    under = reshoot(host, previous)
    under.style.transform = `translate3d(-${PARALLAX}%,0,0)`
    under.style.filter = `brightness(${DIM})`
    top = shoot(host)
    top.style.transform = "translate3d(0,0,0)"
    document.documentElement.dataset.blend = "back"
    // Claim the same lock a tapped transition takes, so a tap landing mid-drag
    // cannot start a second one over the top of this.
    running = true
    return true
  }

  const finish = (commit: boolean, dx: number) => {
    const t = top
    const u = under
    const h = host
    active = false
    armed = false
    top = null
    under = null
    host = null
    if (!t || !u || !h) return

    const w = width()
    // Time what is left to run at the speed of the rest of the gesture, so a
    // flick finishes fast and a slow drag lands gently. A fixed duration here is
    // what makes a hand-driven transition feel as though it stops obeying you
    // the moment you let go.
    const remaining = commit ? w - dx : dx
    const ms = Math.max(120, Math.min(MS.pop, (remaining / w) * MS.pop * 1.6))

    const a = t.animate(
      [{ transform: `translate3d(${dx}px,0,0)` }, { transform: `translate3d(${commit ? w : 0}px,0,0)` }],
      { duration: ms, easing: "cubic-bezier(0.25, 0.9, 0.3, 1)", fill: "forwards" },
    )
    const p = Math.max(0, Math.min(1, dx / w))
    u.animate(
      [
        { transform: `translate3d(${-PARALLAX * (1 - p)}%,0,0)`, filter: `brightness(${DIM + (1 - DIM) * p})` },
        commit
          ? { transform: "translate3d(0,0,0)", filter: "brightness(1)" }
          : { transform: `translate3d(-${PARALLAX}%,0,0)`, filter: `brightness(${DIM})` },
      ],
      { duration: ms, easing: "cubic-bezier(0.25, 0.9, 0.3, 1)", fill: "forwards" },
    )

    const clear = () => {
      h.innerHTML = ""
      h.style.display = "none"
      delete document.documentElement.dataset.blend
      running = false
      if (!commit && previous) {
        // Cancelled: the picture is still ours to keep, and it is now detached.
        previous.remove()
      }
    }

    a.finished
      .catch(() => {})
      .then(() => {
        if (!commit) {
          clear()
          return
        }
        // The screen is fully off and what you are looking at is the picture of
        // where you are going, so the navigation underneath is invisible. Hold
        // the pictures up until it reports itself ready, then drop them.
        onCommit()
        previous = null
        waitForArrival(HOLD.pop).then(clear)
      })
  }

  const onStart = (e: TouchEvent) => {
    if (running || e.touches.length !== 1) return
    const t = e.touches[0]
    if (t.clientX > EDGE) return
    if (!previous) return
    startX = lastX = t.clientX
    startY = t.clientY
    startT = lastT = e.timeStamp
    armed = true
  }

  const onMove = (e: TouchEvent) => {
    if (!armed || e.touches.length !== 1) return
    const t = e.touches[0]
    const dx = t.clientX - startX
    const dy = t.clientY - startY

    if (!active) {
      // Decide once, on the first real movement, whether this is a back drag or
      // a scroll. Mostly-sideways and rightwards is ours; anything else is the
      // page's, and we get out of the way for good.
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
        armed = false
        return
      }
      if (!begin()) {
        armed = false
        return
      }
      active = true
    }

    lastX = t.clientX
    lastT = e.timeStamp
    // Once it is ours, the page must not also scroll underneath it.
    if (e.cancelable) e.preventDefault()
    paint(Math.max(0, dx))
  }

  const onEnd = (e: TouchEvent) => {
    if (!active) {
      armed = false
      return
    }
    const dx = Math.max(0, lastX - startX)
    const dt = Math.max(1, lastT - startT)
    const speed = dx / dt
    finish(dx / width() > COMMIT || speed > FLICK, dx)
    void e
  }

  // Non-passive: the move handler has to be able to stop the page scrolling
  // once it has claimed the gesture.
  document.addEventListener("touchstart", onStart, { passive: true })
  document.addEventListener("touchmove", onMove, { passive: false })
  document.addEventListener("touchend", onEnd, { passive: true })
  document.addEventListener("touchcancel", onEnd, { passive: true })

  return () => {
    document.removeEventListener("touchstart", onStart)
    document.removeEventListener("touchmove", onMove as any)
    document.removeEventListener("touchend", onEnd)
    document.removeEventListener("touchcancel", onEnd)
  }
}

/** Drop the kept screenshot — call when leaving a screen sideways rather than back. */
export function forgetPrevious(): void {
  previous = null
}
