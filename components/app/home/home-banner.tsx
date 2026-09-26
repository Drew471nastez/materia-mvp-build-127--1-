"use client"

/**
 * ===========================================================================
 *  HOME'S BANNER: WHAT MATTERS NOW, BESIDE THE GLOBE
 * ===========================================================================
 * "The banner with the globe should present announcements that matter, a
 * slideshow based on the user's progress ... autoplay, performance
 * optimized, good on mobile ... the content should not overlap into the
 * globe."
 *
 * WHAT IT SAYS is lib/home/announcements.ts: rules on the creator's real
 * state (the facts Getting started reads, lib/home/progress, the sales
 * counted on the server and the plan), most important first, at most five, with the
 * step the card names next leading. Only this store's things: connect payouts, a first sale, what Pro
 * would really have saved.
 *
 * THE SLIDESHOW IS A CAROUSEL. "When I swipe to change the banner ... and
 * the banner autoplay switch to the next announcement, it's very bugged,
 * glitchy, not smooth at all." A change used to fade the old text out and
 * then the new one in, with an empty banner between them. Now every change,
 * by the clock, a segment, an arrow key or a finger, is one move: the slide
 * showing slides out and the next slides in beside it, both on screen the
 * whole way, on `transform` only (MOVE_MS, MOVE_EASE), run by the
 * compositor. A finger drags the text one to one and the neighbour with it;
 * let go past three tenths or with a flick and the two carry on at the
 * speed of the throw, otherwise they settle back. The marker over the
 * segments slides with them.
 *
 * The clock is the marker's fill, SLIDE_MS a slide; it waits while a mouse
 * is over the banner, while focus is inside it, while a finger is on it,
 * while it is off screen and while the tab is hidden, and starts again
 * from empty after every change. With reduced motion there is no clock,
 * and a change is the new slide simply there. A move renders the banner
 * once, when it lands, and never the globe. Screen readers hear a change
 * they asked for and none they did not (aria-live off while it plays by
 * itself).
 *
 * THE GLOBE (components/app/home/globe) has its own column: the text's
 * right padding and the globe's place are one set of numbers, per banner
 * width (container queries on the banner, so the sidebar cannot throw them
 * out), and the text column ends where the globe's atmosphere begins.
 *
 * THE BACKGROUND is light grey with a pattern too soft to name: a few
 * blurred shapes as static gradients, a sheen and a grain, a hairline and a
 * shadow for depth. Painted once; nothing in it moves or blurs live.
 *
 * Buttons go where the sidebar's rows go and the same way
 * (components/app/app-link).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"
import { AppLink } from "@/components/app/app-link"
import { announcementsFor, fromFacts, type Announcement, type SalesSummary } from "@/lib/home/announcements"
import type { ProgressFacts } from "@/lib/home/progress"
import { BannerGlobe as GlobeView } from "./globe"

/** How long a slide stays, in ms. */
export const SLIDE_MS = 9000

export interface HomeBannerProps {
  /** What the account has done, as Getting started reads it (lib/home/progress). Read only. */
  facts: ProgressFacts
  planId: string
  /** The sales, counted on the server over every order (app/app/page.tsx, lib/home/announcements salesSummaryFrom). */
  sales: SalesSummary
  /** Opens Home's share sheet, when there is an address to hand out. */
  onShare?: () => void
  /** Opens Getting started's guide (the welcome slide's button). */
  onGuide?: () => void
}

export const HomeBanner = memo(function HomeBanner({ facts, planId, sales, onShare, onGuide }: HomeBannerProps) {
  /* One clock for the page view: the same on the server and in the browser to the second, so the words agree. */
  const [now] = useState(() => Date.now())
  const list = useMemo(() => announcementsFor(fromFacts(facts, sales, planId, !!onShare), now), [facts, sales, planId, onShare, now])
  return <BannerView list={list} onShare={onShare} onGuide={onGuide} />
})

/* ─── The view ─────────────────────────────────────────────────────────── */

/** Why the clock is held. Any of them holds it. */
const HOVER = 1
const FOCUS = 2
const TOUCH = 4
const HIDDEN = 8

/** How long a change takes when nothing throws it: the clock's, a segment's, an arrow key's. */
export const MOVE_MS = 480
/** The curve of every move: quick off the mark, a long soft landing, no overshoot. */
export const MOVE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
/**
 * Between two slides as they pass: just wider than the edge the text fades
 * over on the right (the stack's --edge, 20px) and than the room to the
 * banner's edge on the left (its padding), so the one coming in starts just
 * out of sight and the one going out ends just out of it.
 */
const SLIDE_GAP = 24
/** A segment and the space after it (the CSS below: 30px wide, 2px apart). */
const TAB_PITCH = 32
/** The id every move's animations carry, so a probe can wait for them. */
const MOVE_ID = "home-banner-move"

/** A plain translate, the only thing a slide's style ever holds. */
const tx = (x: number) => `translate3d(${x.toFixed(2)}px, 0, 0)`
/** Where an element is drawn right now, mid animation included. */
function drawnX(el: HTMLElement): number {
  const t = getComputedStyle(el).transform
  return !t || t === "none" ? 0 : new DOMMatrixReadOnly(t).m41
}
function drawnScaleX(el: HTMLElement): number {
  const t = getComputedStyle(el).transform
  return !t || t === "none" ? 1 : new DOMMatrixReadOnly(t).a
}
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Where the carousel is, outside React. `index` is the slide the eye reads
 * as current (during a drag, the one under the finger), which React's own
 * `currentId` catches up with when a move lands. `shown` holds the slides
 * placed by hand and where: nothing else is on screen but the one React
 * calls active.
 */
interface Motion {
  index: number
  shown: Map<number, number>
  /** The slides either side at rest, drawn out of sight so a move finds them painted. */
  primed: Set<number>
  anims: Animation[]
  /** The slide a running move is taking the stage to, or -1. */
  to: number
  /** A slide caught mid move beside the current one: which, and on which side (-1 left, 1 right). */
  pair: { index: number; side: number } | null
  /** The distance from one slide to the next, read when a move or a drag starts. */
  pitch: number
  clock: Animation | null
  /** Set when a move lands: React's commit, not this frame, clears the hand placed styles. */
  resting: boolean
}

function BannerView({ list, onShare, onGuide }: { list: Announcement[]; onShare?: () => void; onGuide?: () => void }) {
  const count = list.length
  const [currentId, setCurrentId] = useState(list[0]?.id)
  /* A change the reader asked for is read out; one the clock made is not. */
  const [live, setLive] = useState<"off" | "polite">("off")
  const rootRef = useRef<HTMLElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)

  /* The slide showing stays the one showing when the list changes under it (a count arriving, a sale coming in). */
  const found = list.findIndex((a) => a.id === currentId)
  const index = found >= 0 ? found : 0
  const current = list[index]

  const m = useRef<Motion>({ index, shown: new Map(), primed: new Set(), anims: [], to: -1, pair: null, pitch: 0, clock: null, resting: false })
  /* What the handlers below read: the latest render's, without re-making them. */
  const latest = useRef({ list, count, index })
  latest.current = { list, count, index }

  const slideEl = (i: number) => (stackRef.current?.children[i] as HTMLElement | undefined) ?? null
  const measurePitch = () => {
    const el = slideEl(m.current.index) ?? slideEl(0)
    const left = stackRef.current ? parseFloat(getComputedStyle(stackRef.current).paddingLeft) || 0 : 0
    return (el?.getBoundingClientRect().width || 240) + Math.max(SLIDE_GAP, left + 2)
  }

  /* ── The clock ───────────────────────────────────────────────────────── */
  /*
    WHY THE CLOCK IS HELD LIVES OUTSIDE REACT. A hover, a focus, a finger
    down or the banner leaving the screen only pauses the segment's
    animation; as state, each of them re-rendered the banner inside the
    touch that started a scroll (measured: the longest tasks of a swipe
    that began on the banner). Now they set one attribute on the tabs and
    pause one animation.
  */
  const holdRef = useRef(0)
  const applyHold = useCallback(() => {
    const held = holdRef.current !== 0
    tabsRef.current?.toggleAttribute("data-held", held)
    const clock = m.current.clock
    if (clock && clock.playState !== "finished") {
      if (held) clock.pause()
      else clock.play()
    }
  }, [])
  const setBit = useCallback((bit: number, on: boolean) => {
    holdRef.current = on ? holdRef.current | bit : holdRef.current & ~bit
    applyHold()
  }, [applyHold])
  /* The tabs, when they appear, start in whatever state the banner is in. */
  const tabsAt = useCallback((el: HTMLDivElement | null) => {
    tabsRef.current = el
    if (el) applyHold()
  }, [applyHold])

  const stopClock = () => {
    m.current.clock?.cancel()
    m.current.clock = null
  }
  /*
    THE CLOCK IS THE SHOWING SLIDE'S SEGMENT FILLING, an animation on
    `transform` the compositor runs; when it ends, the next slide comes in.
    No timer runs. With reduced motion there is no clock at all: nothing
    moves by itself, the segment only marks the slide.
  */
  const startClock = () => {
    stopClock()
    const fill = fillRef.current
    if (!fill || latest.current.count < 2 || reducedMotion()) return
    fill.style.transform = ""
    fill.style.transformOrigin = ""
    const clock = fill.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: SLIDE_MS, easing: "linear", fill: "forwards" })
    m.current.clock = clock
    if (holdRef.current !== 0) clock.pause()
    clock.onfinish = () => {
      if (m.current.clock !== clock) return
      moveTo((m.current.index + 1) % latest.current.count, 1, false, MOVE_MS)
    }
  }

  /* ── Placing slides by hand ──────────────────────────────────────────── */
  const show = (i: number, x: number) => {
    const el = slideEl(i)
    if (!el) return
    el.style.transform = tx(x)
    el.style.visibility = "visible"
    m.current.shown.set(i, x)
  }
  const hide = (i: number) => {
    const el = slideEl(i)
    if (el) {
      el.style.transform = ""
      el.style.visibility = ""
    }
    m.current.shown.delete(i)
  }
  /*
    THE NEIGHBOURS WAIT, PAINTED. At rest the next slide (and the one
    before) stand just out of sight, drawn and on layers of their own, so a
    move or a drag starts by moving them, not by painting them first
    (every slide is on its own layer, see the CSS):
    measured, the first frame of a move that had to paint its slide first
    was the one that stuttered. They are inert, like every slide not
    showing, and the window they stand beyond hides them.
  */
  const prime = () => {
    const mm = m.current
    const { count: n } = latest.current
    const want = new Map<number, number>()
    if (n >= 2 && !reducedMotion()) {
      mm.pitch = measurePitch()
      want.set((mm.index + 1) % n, mm.pitch)
      if (n > 2) want.set((mm.index - 1 + n) % n, -mm.pitch)
    }
    for (let i = 0; i < n; i++) {
      const el = slideEl(i)
      if (!el || mm.shown.has(i)) continue
      const x = want.get(i)
      if (x !== undefined) {
        el.style.transform = tx(x)
        el.style.visibility = "visible"
      } else if (mm.primed.has(i)) {
        el.style.transform = ""
        el.style.visibility = ""
      }
    }
    mm.primed = new Set(want.keys())
  }
  const cancelAnims = () => {
    const mm = m.current
    const anims = mm.anims
    mm.anims = []
    for (const a of anims) a.cancel()
  }
  /** The segment's marker between slide `a` and slide `b`, `p` of the way. */
  const thumbAt = (a: number, b: number, p: number) => {
    const thumb = thumbRef.current
    if (!thumb) return
    const x = a * TAB_PITCH + (b - a) * TAB_PITCH * p
    const stretch = 1 + Math.min(1, Math.abs(b - a)) * 1.6 * p * (1 - p)
    thumb.style.transform = `translateX(${x.toFixed(2)}px) scaleX(${stretch.toFixed(3)})`
  }

  /**
   * A MOVE IN FLIGHT, CAUGHT. A finger landing, or a segment pressed, while
   * slides are passing: each is held where it is drawn this frame, and the
   * one coming in becomes the current one. Nothing jumps.
   */
  const catchMove = () => {
    const mm = m.current
    if (mm.to < 0) return
    for (const i of [...mm.shown.keys()]) {
      const el = slideEl(i)
      if (el) mm.shown.set(i, drawnX(el))
    }
    const thumb = thumbRef.current
    const thumbT = thumb ? getComputedStyle(thumb).transform : ""
    const fill = fillRef.current
    const fillScale = fill ? drawnScaleX(fill) : 0
    cancelAnims()
    for (const [i, x] of mm.shown) show(i, x)
    if (thumb && thumbT && thumbT !== "none") thumb.style.transform = thumbT
    if (fill) fill.style.transform = `scaleX(${fillScale})`
    const from = mm.index
    mm.index = mm.to
    mm.to = -1
    const x = mm.shown.get(mm.index) ?? 0
    mm.pair = mm.shown.has(from) ? { index: from, side: x > 0 ? -1 : 1 } : null
  }

  /** The current slide at `o` from its place, and its neighbour on the side it uncovers. */
  const placeDrag = (o: number) => {
    const mm = m.current
    const { count: n } = latest.current
    const W = mm.pitch
    const side = o < 0 ? 1 : -1
    const next = mm.pair && mm.pair.side === side ? mm.pair.index : (mm.index + side + n) % n
    for (const i of [...mm.shown.keys()]) if (i !== mm.index && i !== next) hide(i)
    show(mm.index, o)
    if (o !== 0 && next !== mm.index) show(next, o + side * W)
    else if (next !== mm.index) hide(next)
    thumbAt(mm.index, next, Math.min(1, Math.abs(o) / W))
  }

  /**
   * THE MOVE: the current slide out and the next one in, both on screen the
   * whole way, on `transform` only, run by the compositor. `dir` 1 brings
   * the new one from the right, -1 from the left. A finger's throw sets the
   * time, so the slides leave at the speed the finger let go.
   */
  const moveTo = (target: number, dir: 1 | -1, asked: boolean, duration: number) => {
    const mm = m.current
    const { list: l, count: n } = latest.current
    if (n < 2 || !l[target]) return
    if (mm.to >= 0) catchMove()
    if (target === mm.index && mm.shown.size === 0) return
    /* The time already drawn in the segment, read before the clock stops. */
    const fillFrom = fillRef.current ? drawnScaleX(fillRef.current) : 0
    stopClock()
    setLive(asked ? "polite" : "off")
    if (reducedMotion()) {
      /* Reduced motion: the new slide is simply there. */
      cancelAnims()
      for (const i of [...mm.shown.keys()]) hide(i)
      land(target)
      return
    }
    if (!mm.pitch || mm.shown.size === 0) mm.pitch = measurePitch()
    const W = mm.pitch
    const o = mm.shown.get(mm.index) ?? 0
    const delta = target === mm.index ? -o : -dir * W - o
    const opts: KeyframeAnimationOptions = { duration, easing: MOVE_EASE, id: MOVE_ID }
    cancelAnims()
    const anims: Animation[] = []
    const run = (i: number, from: number, to: number) => {
      const el = slideEl(i)
      if (!el) return null
      show(i, to)
      const a = el.animate([{ transform: tx(from) }, { transform: tx(to) }], opts)
      anims.push(a)
      return a
    }
    /* Whatever else is on screen (a slide caught beside the current one) goes the same way. */
    for (const [i, x] of [...mm.shown]) if (i !== mm.index && i !== target) {
      /* Unless it stands where the new one comes in from: that place is the new one's. */
      if (target !== mm.index && ((dir > 0 && x > o) || (dir < 0 && x < o))) hide(i)
      else run(i, x, x + delta)
    }
    if (target !== mm.index) run(mm.index, o, o + delta)
    const lead = run(target, mm.shown.get(target) ?? o + dir * W, 0)
    /* The segment's marker slides across, stretching a little on the way. */
    const thumb = thumbRef.current
    if (thumb) {
      const fromT = getComputedStyle(thumb).transform
      const fromX = fromT && fromT !== "none" ? new DOMMatrixReadOnly(fromT).m41 : mm.index * TAB_PITCH
      const toX = target * TAB_PITCH
      const far = Math.min(1, Math.abs(toX - fromX) / TAB_PITCH)
      thumb.style.transform = `translateX(${toX}px) scaleX(1)`
      anims.push(thumb.animate([
        { transform: fromT && fromT !== "none" ? fromT : `translateX(${fromX}px) scaleX(1)` },
        { transform: `translateX(${((fromX + toX) / 2).toFixed(2)}px) scaleX(${(1 + 0.4 * far).toFixed(3)})`, offset: 0.45 },
        { transform: `translateX(${toX}px) scaleX(1)` },
      ], opts))
    }
    /* And the time drawn in it drains the way the slides go, to start again empty. */
    const fill = fillRef.current
    if (fill && target !== mm.index) {
      fill.style.transformOrigin = dir > 0 ? "right center" : "left center"
      fill.style.transform = "scaleX(0)"
      anims.push(fill.animate([{ transform: `scaleX(${fillFrom})` }, { transform: "scaleX(0)" }], opts))
    }
    mm.anims = anims
    mm.to = target
    mm.pair = null
    if (!lead) return land(target)
    lead.finished.then(
      () => {
        if (mm.to !== target || mm.anims !== anims) return
        mm.to = -1
        land(target)
      },
      () => { /* cancelled: whoever cancelled it carries on from where it was drawn */ },
    )
  }

  /**
   * A MOVE LANDS: the new slide is the current one. React is told (the
   * tabs, aria, inert), and the styles placed by hand come off in the same
   * commit (the layout effect below), so no frame is drawn between the two.
   */
  const land = (target: number) => {
    const mm = m.current
    mm.index = target
    mm.pair = null
    const id = latest.current.list[target]?.id
    if (id === latest.current.list[latest.current.index]?.id) rest()
    else {
      mm.resting = true
      setCurrentId(id)
    }
  }
  /** Every hand placed style off: React's active slide stands alone at its place, and the clock starts. */
  const rest = () => {
    const mm = m.current
    mm.resting = false
    cancelAnims()
    for (const i of [...mm.shown.keys()]) hide(i)
    /* React's active slide stands on its own now: its own style is the stylesheet's. */
    const cur = slideEl(mm.index)
    if (cur) {
      cur.style.transform = ""
      cur.style.visibility = ""
    }
    mm.primed.delete(mm.index)
    const thumb = thumbRef.current
    if (thumb) thumb.style.transform = `translateX(${mm.index * TAB_PITCH}px)`
    const fill = fillRef.current
    if (fill) {
      fill.style.transform = ""
      fill.style.transformOrigin = ""
    }
    prime()
    startClock()
  }

  useLayoutEffect(() => {
    const mm = m.current
    mm.index = index
    if (mm.resting) rest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  /* A new list (a count arriving, a sale coming in): whatever was moving settles where React has it. */
  useEffect(() => {
    const mm = m.current
    mm.to = -1
    mm.index = latest.current.index
    rest()
    return stopClock
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list])

  /* A new width (a phone turned, the sidebar opened): the neighbours move to stay just out of sight. */
  useEffect(() => {
    const el = stackRef.current
    if (!el || typeof ResizeObserver !== "function") return
    let w = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === w) return
      w = el.clientWidth
      if (m.current.to < 0 && !g.current) prime()
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Off screen or on a hidden tab, the clock waits. */
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let onScreen = true
    const sync = () => setBit(HIDDEN, !onScreen || document.visibilityState === "hidden")
    const io = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => {
          onScreen = entry.isIntersecting
          sync()
        })
      : null
    io?.observe(el)
    document.addEventListener("visibilitychange", sync)
    sync()
    return () => {
      io?.disconnect()
      document.removeEventListener("visibilitychange", sync)
    }
  }, [setBit])

  /* ── Swipe, on a touch screen ───────────────────────────────────────── */
  /*
    THE TEXT FOLLOWS THE FINGER. "Swipe ... slide in the banner": once a
    touch is plainly sideways, the slide under it moves with it, one to
    one, and the next one (or the one before) comes in beside it, on
    transform, a frame at a time, with no React render until it lands. Let
    go past three tenths of the way, or with a flick, and the two carry on
    at the speed of the throw; otherwise they settle back. A finger landing
    on slides that are still moving catches them where they are.
  */
  const g = useRef<{ id: number; x: number; y: number; base: number; on: boolean; samples: { t: number; x: number }[]; o: number; frame: number } | null>(null)
  const swallowClick = useRef(false)
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return
    setBit(TOUCH, true)
    if (count < 2) return
    const mm = m.current
    let base = 0
    if (mm.to >= 0 && !reducedMotion()) {
      catchMove()
      stopClock()
      base = mm.shown.get(mm.index) ?? 0
    }
    mm.pitch = measurePitch()
    g.current = { id: e.pointerId, x: e.clientX, y: e.clientY, base, on: base !== 0, samples: [{ t: e.timeStamp, x: e.clientX }], o: base, frame: 0 }
    if (base !== 0) e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = g.current
    if (!s || s.id !== e.pointerId) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (!s.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        g.current = null
        return
      }
      if (!(Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2)) return
      s.on = true
      /* From here, not from where it landed: the slide starts moving under the finger, not 8px ahead of it. */
      s.x = e.clientX
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }
    s.samples.push({ t: e.timeStamp, x: e.clientX })
    if (s.samples.length > 6) s.samples.shift()
    if (reducedMotion()) return
    s.o = s.base + (e.clientX - s.x)
    if (!s.frame) {
      s.frame = requestAnimationFrame(() => {
        s.frame = 0
        if (g.current === s) placeDrag(s.o)
      })
    }
  }
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = g.current
    if (!s || s.id !== e.pointerId) {
      if (e.pointerType !== "mouse") window.setTimeout(() => setBit(TOUCH, false), 250)
      return
    }
    g.current = null
    if (s.frame) cancelAnimationFrame(s.frame)
    window.setTimeout(() => setBit(TOUCH, false), 250)
    if (!s.on || count < 2) return
    swallowClick.current = true
    window.setTimeout(() => { swallowClick.current = false }, 0)
    const mm = m.current
    const W = mm.pitch || measurePitch()
    /* The finger's speed over its last few points, px per ms. */
    const a = s.samples[0]
    const b = s.samples[s.samples.length - 1]
    const v = b && a && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0
    if (reducedMotion()) {
      const dx = e.clientX - s.x
      if (e.type === "pointerup" && (Math.abs(dx) > W * 0.25 || Math.abs(v) > 0.35)) moveTo((mm.index + (dx < 0 ? 1 : -1) + count) % count, dx < 0 ? 1 : -1, true, 0)
      return
    }
    const o = s.base + (e.clientX - s.x)
    placeDrag(o)
    const flick = Math.abs(v) > 0.35 && (o === 0 || Math.sign(v) === Math.sign(o))
    const far = Math.abs(o) > W * (e.type === "pointerup" ? 0.3 : 0.5)
    const dir: 1 | -1 = (o !== 0 ? o : v) < 0 ? 1 : -1
    const go = o !== 0 && (far || (flick && e.type === "pointerup"))
    const left = go ? W - Math.abs(o) : Math.abs(o)
    /* The curve starts at about 4.5 times its average speed: matched to the finger, clamped to feel like one family. */
    const byDistance = MOVE_MS * Math.max(0.45, left / W)
    const byThrow = Math.abs(v) > 0.05 ? (4.5 * left) / Math.abs(v) : Infinity
    const duration = Math.round(Math.max(240, Math.min(520, byDistance, byThrow)))
    if (go) {
      const next = mm.pair && mm.pair.side === dir ? mm.pair.index : (mm.index + dir + count) % count
      moveTo(next, dir, true, duration)
    } else {
      /* Back where it was, the neighbour back out of sight. */
      moveTo(mm.index, dir, false, Math.max(240, Math.min(420, byDistance)))
    }
  }

  /* ── The segments, as tabs ──────────────────────────────────────────── */
  const pick = (to: number, dir?: 1 | -1) => {
    const from = m.current.to >= 0 ? m.current.to : m.current.index
    if (to === from) return
    moveTo(to, dir ?? (to > from ? 1 : -1), true, MOVE_MS)
  }
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    /* From the slide on its way in, if one is: a key pressed mid move goes on from there. */
    const at = m.current.to >= 0 ? m.current.to : m.current.index
    const keys: Record<string, [number, 1 | -1 | undefined]> = { ArrowRight: [at + 1, 1], ArrowLeft: [at - 1, -1], Home: [0, undefined], End: [count - 1, undefined] }
    if (!(e.key in keys)) return
    e.preventDefault()
    const [raw, dir] = keys[e.key]
    const to = ((raw % count) + count) % count
    pick(to, dir)
    const tab = tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[to]
    tab?.focus()
  }

  return (
    <section
      ref={rootRef}
      data-home-banner=""
      aria-roledescription="carousel"
      aria-label="Announcements"
      className="home-banner relative isolate overflow-hidden rounded-2xl"
      onPointerEnter={(e) => e.pointerType === "mouse" && setBit(HOVER, true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setBit(HOVER, false)}
      onFocus={() => setBit(FOCUS, true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setBit(FOCUS, false)
      }}
    >
      <style href="home-banner" precedence="default">{BANNER_CSS}</style>
      <div aria-hidden="true" className="home-banner-bg" />
      <div className="home-banner-inner">
        <div
          className="home-banner-text"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onClickCapture={(e) => {
            /* A swipe that ended on a button is a swipe, not a press. */
            if (!swallowClick.current) return
            swallowClick.current = false
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          <div ref={stackRef} className="home-banner-stack" aria-live={live}>
            {list.map((a, i) => {
              const on = a.id === current?.id
              return (
                <div
                  key={a.id}
                  id={`home-banner-slide-${a.id}`}
                  role={count > 1 ? "tabpanel" : "group"}
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${count}`}
                  /* Not aria-hidden, and data-slide rather than data-state: a slide not showing is
                     already visibility hidden (out of the accessibility tree, unfocusable) and inert,
                     and either attribute changing anywhere makes a :has() on <html> in globals.css
                     (the nav pill's dialog rule, the cookie banner's) restyle the whole page:
                     measured at 363 elements a slide change. */
                  inert={!on}
                  data-slide={on ? "active" : "idle"}
                  data-announcement={a.id}
                  className="home-banner-slide"
                >
                  <div className="home-banner-copy">
                    <p className={`home-banner-eyebrow${a.tone === "critical" ? " is-critical" : ""}`}>{a.eyebrow}</p>
                    {/* "5 hours ago" is worked out on the server and again in the browser a moment later; across an
                        hour's boundary the two differ by a word, which the next render settles. Not a reason to
                        throw the server's page away. */}
                    <h2 className="home-banner-title" suppressHydrationWarning>{a.title}</h2>
                    <p className="home-banner-line" suppressHydrationWarning>{a.line}</p>
                  </div>
                  <div className="home-banner-cta-row">
                    {(a.action === "share" && onShare) || (a.action === "guide" && onGuide) ? (
                      <button type="button" className="home-banner-cta" onClick={a.action === "share" ? onShare : onGuide}>
                        {a.cta}
                      </button>
                    ) : (
                      <AppLink href={a.href} className="home-banner-cta">
                        {a.cta}
                      </AppLink>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {count > 1 && (
            <div ref={tabsAt} role="tablist" aria-label="Announcements" className="home-banner-tabs" onKeyDown={onTabKey}>
              {list.map((a, i) => {
                const on = i === index
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-controls={`home-banner-slide-${a.id}`}
                    aria-label={a.title}
                    tabIndex={on ? 0 : -1}
                    className="home-banner-tab"
                    data-on={on ? "" : undefined}
                    onClick={() => pick(i)}
                  >
                    <span className="home-banner-tab-track" />
                  </button>
                )
              })}
              {/*
                ONE MARKER FOR ALL THE SEGMENTS, moved rather than swapped: it slides
                from one segment to the next with the slides, stretching a little on the
                way, and follows a finger's drag. The clock is the fill inside it.
              */}
              <span ref={thumbRef} aria-hidden="true" className="home-banner-thumb" style={{ transform: `translateX(${index * TAB_PITCH}px)` }}>
                <span ref={fillRef} className="home-banner-tab-fill" />
              </span>
            </div>
          )}
        </div>

        <BannerGlobe className="home-banner-globe" />
      </div>
    </section>
  )
}

/* The globe has its own life: a slide landing re-renders the banner, never the globe. */
const BannerGlobe = memo(GlobeView)

/* ─── The look ─────────────────────────────────────────────────────────── */

/**
 * THE GEOMETRY, in one place. `--g` is the globe's square box, `--gx` how
 * far its centre sits from the banner's right edge, `--gy` how far below
 * the middle. The ball's radius is 0.4 of the box and its atmosphere
 * reaches 0.452 (globe-scene GLOBE_RADIUS, and the 1.13 the renderers draw
 * the halo to), so the text stops at `--gx + 0.452 * --g + --gap` from the
 * right: the same numbers place the globe and end the text, and cannot
 * disagree. Per banner width, by container query, because the sidebar
 * makes the viewport a poor guide to how wide the banner is.
 */
const BANNER_CSS = `
.home-banner {
  container-type: inline-size;
  border: 1px solid #e3e5ea;
  background: #f3f4f6;
  box-shadow:
    0 1px 2px rgba(16, 24, 40, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
.home-banner-bg {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  /* Clean light grey, a touch lighter at the top left where the light comes from. No violet, no
     pattern: "something more clean, smooth, not eye candy, more towards light grey". Painted once. */
  background:
    radial-gradient(60% 120% at 12% 0%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 70%),
    linear-gradient(180deg, #f6f7f9 0%, #f1f2f5 100%);
}

/*
  ONE HEIGHT, TALL ENOUGH FOR THE LONGEST SLIDE AT EVERY WIDTH, AND NO
  TALLER. "The banner shouldn't look fat, and not so much space between the
  lines and the button." The copy, the button and the segments are one
  block in the middle of it (the slides' grid below); the numbers are the
  worst case, every line of every slide full. Every line is 48 characters
  at most (lib/home/announcements). Phone type to 619px (15/20 title, 13/17
  body, two lines each): 18 + 16 + 4 + 40 + 4 + 34 + 10 + 34 + 8 + 16 + 10
  = 194, so 196. From 620 (19/24, 14/19, two lines each): 20 + 16 + 5 + 48
  + 5 + 38 + 12 + 34 + 8 + 16 + 12 = 214. From 860, one line each: 20 + 16
  + 5 + 24 + 5 + 19 + 12 + 34 + 8 + 16 + 12 = 171, so 172, the globe sized
  to sit inside it. scripts/check-home-banner.mjs holds every slide of
  every state to it.
*/
.home-banner-inner {
  --g: 168px;
  --gx: 56px;
  --gy: 4px;
  --gap: 8px;
  --pad-l: 18px;
  position: relative;
  height: 196px;
}
@container (min-width: 380px) {
  .home-banner-inner { --g: 180px; --gx: 64px; --pad-l: 20px; }
}
@container (min-width: 460px) {
  .home-banner-inner { --g: 204px; --gx: 96px; --gy: 6px; --gap: 14px; --pad-l: 26px; }
}
@container (min-width: 620px) {
  .home-banner-inner { --g: 236px; --gx: 132px; --gy: 4px; --gap: 22px; --pad-l: 32px; height: 214px; }
}
@container (min-width: 860px) {
  .home-banner-inner { --g: 204px; --gx: 140px; --gy: 0px; --gap: 32px; --pad-l: 36px; height: 172px; }
}

.home-banner-globe {
  position: absolute;
  width: var(--g);
  height: var(--g);
  right: calc(var(--gx) - var(--g) / 2);
  top: calc(50% - var(--g) / 2 + var(--gy));
}
/* Its shadow on the banner, thrown down and to the right, away from the light: painted once, it never moves. */
.home-banner-globe::before {
  content: "";
  position: absolute;
  left: 16%;
  right: 2%;
  top: 22%;
  bottom: -4%;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(40, 46, 62, 0.14), rgba(40, 46, 62, 0.05) 58%, rgba(40, 46, 62, 0) 100%);
  pointer-events: none;
}

.home-banner-text {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 18px calc(var(--gx) + var(--g) * 0.452 + var(--gap)) 10px var(--pad-l);
  touch-action: pan-y;
}
@container (min-width: 620px) {
  .home-banner-text { padding-top: 20px; padding-bottom: 12px; }
}

/*
  THE SLIDES SHARE ONE GRID CELL, so the cell is as tall as the tallest
  copy of them all, at this width, with no measuring: every slide's text
  starts at the same top, and every button (margin-top: auto) sits at the
  same height, 10px under the tallest copy (12px from 620). "The vertical
  between buttons is too huge": the room a short slide used to leave went
  between its text and its button; now the whole block, text, button and
  segments, stands in the middle of the banner and whatever room is left
  goes above and below it.

  THE WINDOW THEY PASS THROUGH reaches the banner's left edge, and on the
  right fades out over --edge before the globe, so a slide on its way in
  or out is cut by the banner's own edge on one side and fades beside the
  globe on the other. Nothing on the slides changes opacity: a button half
  way across is as black as at rest.
*/
.home-banner-stack {
  --edge: 20px;
  position: relative;
  display: grid;
  flex: 0 0 auto;
  max-width: calc(560px + var(--pad-l) + var(--edge));
  margin: -6px calc(-1 * var(--edge)) -6px calc(-1 * var(--pad-l));
  padding: 6px var(--edge) 6px var(--pad-l);
  overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - var(--edge)), transparent);
  mask-image: linear-gradient(90deg, #000 calc(100% - var(--edge)), transparent);
}
.home-banner-slide {
  grid-area: 1 / 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  /* Only the showing one is drawn; a move shows the one coming in by hand (its style), and takes it off when it lands. */
  visibility: hidden;
  /* Each on a layer of its own, for good: a move that ends by taking a layer away paints its slide again. */
  will-change: transform;
}
.home-banner-slide[data-slide="active"] { visibility: visible; }
.home-banner-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.home-banner-copy > * {
  /* Never squeezed: a title or a line clipped to fit would be a sentence cut in half. */
  flex-shrink: 0;
}

.home-banner-eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: #6b7280;
}
.home-banner-eyebrow.is-critical { color: #b45309; }
.home-banner-eyebrow.is-critical::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.16);
}
.home-banner-title {
  margin-top: 4px;
  font-size: 15px;
  line-height: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #1a1a2e;
  text-wrap: balance;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.home-banner-line {
  margin-top: 4px;
  font-size: 13px;
  line-height: 17px;
  color: #5f6673;
  text-wrap: pretty;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
@container (min-width: 620px) {
  .home-banner-title { margin-top: 5px; font-size: 19px; line-height: 24px; letter-spacing: -0.015em; }
  .home-banner-line { margin-top: 5px; font-size: 14px; line-height: 19px; -webkit-line-clamp: 2; }
}
.home-banner-cta-row { margin-top: auto; padding-top: 10px; }
@container (min-width: 620px) {
  .home-banner-cta-row { padding-top: 12px; }
}
@container (min-width: 860px) {
  .home-banner-title,
  .home-banner-line { -webkit-line-clamp: 1; }
}
.home-banner-cta {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 14px;
  border-radius: 10px;
  background: #16161a;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 1px 2px rgba(0, 0, 0, 0.18);
  transition: background-color 150ms ease;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
.home-banner-cta:hover { background: #2a2a31; }
.home-banner-cta:active { background: #0b0b0d; }
.home-banner-cta:focus-visible { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #8b5cf6; }
@container (min-width: 620px) {
  .home-banner-cta { padding: 0 16px; }
}

.home-banner-tabs {
  position: relative;
  display: flex;
  gap: 2px;
  height: 16px;
  margin-top: 8px;
  margin-left: -4px;
  flex: 0 0 auto;
}
.home-banner-tab {
  display: flex;
  align-items: center;
  width: 30px;
  height: 16px;
  padding: 0 4px;
  border-radius: 6px;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
.home-banner-tab:focus-visible { box-shadow: 0 0 0 2px #8b5cf6; }
/* The segment is 16px tall to keep the banner low; its target reaches 10px further up and down. */
.home-banner-tab { position: relative; }
.home-banner-tab::after { content: ""; position: absolute; inset: -10px -1px; }
.home-banner-tab-track {
  display: block;
  width: 100%;
  height: 3px;
  border-radius: 9999px;
  background: rgba(26, 26, 46, 0.13);
  transition: background-color 200ms ease;
}
.home-banner-tab:hover .home-banner-tab-track { background: rgba(26, 26, 46, 0.24); }
/*
  THE MARKER over the showing slide's segment (TAB_PITCH apart, 4px in),
  moved by transform only: by the slides' move, or a finger's drag. The
  clock is the fill inside it, run as an animation from the script, and it
  drains the way the slides go when they change.
*/
.home-banner-thumb {
  position: absolute;
  left: 4px;
  top: calc(50% - 1.5px);
  width: 22px;
  height: 3px;
  overflow: hidden;
  border-radius: 9999px;
  background: rgba(26, 26, 46, 0.26);
  transform-origin: 11px 50%;
  pointer-events: none;
}
.home-banner-tab-fill {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(26, 26, 46, 0.72);
  transform-origin: left center;
  transform: scaleX(0);
}

/* Reduced motion: nothing moves by itself (no clock), a change is the new slide simply there, and the marker is full. */
@media (prefers-reduced-motion: reduce) {
  .home-banner-tab-fill { transform: scaleX(1); }
}
`
