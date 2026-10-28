"use client"

/**
 * ===========================================================================
 *  EVERY PILL-TAB ROW IN THE ONEPAGE EDITOR, AND THE PANELS UNDER THEM
 * ===========================================================================
 * "Switching between pill tabs is laggy, buggy, direct to direct, bad,
 * cheap." Measured in scripts/check-onepage-pill-tabs.mjs at 390x844 with the
 * CPU slowed four times, Settings' sections were:
 *
 *   - chosen on the click, 146 to 241ms after the finger went down, and the
 *     chips did not move: each one faded its own dark fill in or out where it
 *     stood, and its words changed colour
 *   - drawn by rebuilding SettingsTab, whose list on a computer was a
 *     component declared inside its render (a new component every render, so
 *     all six buttons were thrown away and made again on every press)
 *   - a section built from nothing on each press (28 to 55 elements, the SEO
 *     panel's share card and Google result among them; a 119ms frame), keyed
 *     so it started at 0.2 opacity, with the box under the chips jumping
 *     from 383px to 978px tall and back, and its scroll lost
 *
 * Now there is one row and one set of panels:
 *
 *   PillTabs    a row of pills, used by Settings' sections, the Theme page's
 *               kinds and the font picker's kinds. ROUND 11, the owner: "When
 *               I click on something, it makes the text black and the pill
 *               shape black so there's nothing visible", and "the switching
 *               between the pill shapes should inherit how Storelib feels
 *               when I click pill shapes: the settings of the app". So these
 *               are Storelib's own pills now, the ones Settings, the library
 *               and the profile share (lib/ui/pill-switch.ts): white on a
 *               hairline, the chosen one on its own light grey fill that
 *               fades in where it is (PILL_FADE_MS), the words ink on it and
 *               grey off it, turning in one step, a finger landing as a light
 *               tint, a light tick of haptics on a finger's press. Nothing
 *               slides and nothing scales. The chosen words are real text in
 *               both looks, never drawn by CSS (see PillWord): the dark pill
 *               whose label came from `content: attr()` is what left a black
 *               pill with nothing on it.
 *   PillPanels  Settings' sections, every one kept mounted, one over the
 *               other in one grid cell (so the box is as tall as the tallest
 *               and never jumps), the ones not yet seen built in the page's
 *               idle time. A switch is Storelib's own (lib/ui/pill-switch
 *               landContent): the section left goes in the frame the new one
 *               arrives, and the new one lands from CONTENT_IN_FROM over
 *               CONTENT_IN_MS, on opacity alone, never from nothing, never
 *               two sections' words on the glass at once, nothing moving.
 *               Each is scrolled back to where it was left. Each is on a
 *               layer of its own, painted once, so a switch paints nothing.
 *               What a panel draws is handed in already made, so a switch
 *               re-renders the row and this, and nothing inside the panels.
 *   usePillSlide, usePillPress
 *               the sliding pill and its press, which the editor's own row
 *               of tabs on a computer uses (a segmented control, as the
 *               analytics switchers are). The phone's bottom bar has no pill
 *               (the owner asked for its buttons to change in place); it
 *               uses usePillPress to start that change on the press.
 */
import * as React from "react"
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { hapticTap } from "@/lib/native-bridge"
import { CONTENT_IN_EASE, CONTENT_IN_FROM, CONTENT_IN_MS, PILL_FILL, PILL_PRESS, PILL_WORDS, PILL_WORDS_OFF, PILL_WORDS_ON, pressPill, releasePill } from "@/lib/ui/pill-switch"

/** The pill slides to the next tab on iOS's curve. */
export const PILL_MS = 220
export const PILL_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** A section landing under the pills: Storelib's own (lib/ui/pill-switch.ts), one number in one place. */
export const PANEL_IN_MS = CONTENT_IN_MS
export const PANEL_IN_FROM = CONTENT_IN_FROM

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/**
 * THE PILL UNDER THE CHOSEN TAB SLIDES. One pill, drawn under the words and
 * over the row's own grey, moved by `transform` from under the last tab to
 * under the next one, scaled from the last one's size on the way (a slide
 * and a stretch), on the compositor. A row laid out across (a bar) or down
 * (a list) alike. With no tab of the row chosen (Settings, in the editor's
 * top bar on a computer) it fades away where it is.
 *
 * `slideTo` moves it at once, from a press handler, before React renders.
 */
export function usePillSlide(activeId: string, remount?: unknown) {
  const rowRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const placed = useRef<{ id: string; x: number; y: number; w: number; h: number; on: boolean; el: HTMLElement } | null>(null)
  /*
    WHERE EACH TAB IS, READ ONCE. Read in the press, offsetLeft made the
    browser work out the styles of the whole editor there and then (the
    finger's :hover and :active had just changed them): 36ms inside the
    click on a phone with the CPU slowed four times. The tabs are measured
    after a render and whenever the row changes size, and a press reads the
    numbers.
  */
  const boxes = useRef<Map<string, { x: number; y: number; w: number; h: number }>>(new Map())
  const motion = useRef<{ anim: Animation; until: number; slides: boolean } | null>(null)
  const measure = useCallback(() => {
    const row = rowRef.current
    boxes.current = new Map()
    if (!row) return
    for (const tab of row.querySelectorAll<HTMLElement>("[data-tab]")) {
      if (tab.parentElement !== row) continue
      boxes.current.set(tab.getAttribute("data-tab") || "", { x: tab.offsetLeft, y: tab.offsetTop, w: tab.offsetWidth, h: tab.offsetHeight })
    }
  }, [])
  const place = useCallback((id: string, slide: boolean) => {
    const row = rowRef.current
    const pill = pillRef.current
    if (!row || !pill) return
    const tab = boxes.current.get(id)
    /* A row drawn again (the phone's, after the preview) starts from nothing. */
    const prev = placed.current?.el === pill ? placed.current : null
    if (!tab || !tab.w) {
      if (prev?.on) {
        placed.current = { ...prev, id, on: false }
        pill.style.opacity = "0"
        motion.current?.anim.cancel()
        motion.current = null
        if (slide && !reducedMotion()) motion.current = { anim: pill.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: "ease-out" }), until: performance.now() + 160, slides: false }
      }
      return
    }
    const { x, y, w, h } = tab
    if (prev && prev.on && prev.x === x && prev.y === y && prev.w === w && prev.h === h) return
    /* From where it is drawn now: where it was put, or, with a slide still in flight, where the slide has got to. */
    let from: { x: number; y: number; w: number; h: number } | null = null
    /* The pill's own animation, kept here: asking the element for its animations makes the browser restyle the page first. */
    const running = motion.current && motion.current.slides && performance.now() < motion.current.until
    if (slide && prev?.on && !reducedMotion()) {
      if (running) {
        const at = pill.getBoundingClientRect()
        const box = row.getBoundingClientRect()
        if (at.width > 0) from = { x: at.left - box.left - row.clientLeft + row.scrollLeft, y: at.top - box.top - row.clientTop + row.scrollTop, w: at.width, h: at.height }
      } else {
        from = { x: prev.x, y: prev.y, w: prev.w, h: prev.h }
      }
    }
    motion.current?.anim.cancel()
    motion.current = null
    pill.style.transformOrigin = "0 0"
    pill.style.width = `${w}px`
    pill.style.height = `${h}px`
    pill.style.transform = `translate3d(${x}px, ${y}px, 0)`
    pill.style.opacity = "1"
    placed.current = { id, x, y, w, h, on: true, el: pill }
    if (from && (Math.abs(from.x - x) > 0.5 || Math.abs(from.y - y) > 0.5 || Math.abs(from.w - w) > 0.5 || Math.abs(from.h - h) > 0.5)) {
      const anim = pill.animate(
        [{ transform: `translate3d(${from.x}px, ${from.y}px, 0) scale(${from.w / w}, ${from.h / h})` }, { transform: `translate3d(${x}px, ${y}px, 0)` }],
        { duration: PILL_MS, easing: PILL_EASE },
      )
      motion.current = { anim, until: performance.now() + PILL_MS, slides: true }
    } else if (slide && prev && !prev.on && !reducedMotion()) {
      motion.current = { anim: pill.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" }), until: performance.now() + 160, slides: false }
    }
  }, [])
  useLayoutEffect(() => {
    const row = rowRef.current
    if (!row) return
    measure()
    place(activeId, true)
    /* A row that changes size (a font arriving, a rotation) moves the pill with it, without a slide. */
    const resized = new ResizeObserver(() => {
      measure()
      place(placed.current?.id ?? activeId, false)
    })
    resized.observe(row)
    return () => resized.disconnect()
  }, [activeId, remount, place, measure])
  /* Called from the press itself, before React has rendered anything: the slide starts in the next frame. */
  const slideTo = useCallback((id: string) => place(id, true), [place])
  return { rowRef, pillRef, slideTo }
}

/*
  A TAB'S WORDS ARE REAL TEXT. They were drawn twice, the chosen copy by CSS
  (`after:content-[attr(data-text)]`, through Tailwind's --tw-content). Where
  an engine resolves attr() inside a custom property against the pseudo
  element rather than the button (WebKit, every iPhone, and Safari on a Mac),
  that copy is empty: the chosen pill was the dark fill with nothing on it,
  "just a pill shape full black". Now the word is the button's own text, once,
  in one colour that turns in one step with the fill (PILL_WORDS).
*/
function PillWord({ on, text, align }: { on: boolean; text: string; align: "center" | "start" }) {
  return (
    <span data-pill-word="" data-on={on ? "" : undefined} className={cn(PILL_WORDS, "block min-w-0 truncate", align === "center" ? "text-center" : "text-left", on ? PILL_WORDS_ON : PILL_WORDS_OFF)}>
      {text}
    </span>
  )
}

/**
 * THE PILL MOVES ON THE PRESS. Handlers for a tab: the finger or the button
 * going down moves the pill to it there and then; the choice itself is left
 * to the click, so a finger that goes on to scroll (pointercancel), or is
 * let go somewhere else, puts the pill back under the chosen tab.
 */
export function usePillPress(slideTo: (id: string) => void, value: string) {
  const valueRef = useRef(value)
  valueRef.current = value
  const pressed = useRef<string | null>(null)
  const back = useCallback(() => {
    pressed.current = null
    slideTo(valueRef.current)
  }, [slideTo])
  return useCallback(
    (id: string) => ({
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0 || id === valueRef.current) return
        pressed.current = id
        slideTo(id)
        /* The click, when there is one, comes before this. */
        const up = () => {
          window.removeEventListener("pointerup", up, true)
          window.setTimeout(() => { if (pressed.current === id) back() }, 60)
        }
        window.addEventListener("pointerup", up, true)
      },
      onPointerCancel: back,
      /* Call from the tab's click. */
      chosen: () => { pressed.current = null },
    }),
    [slideTo, back],
  )
}

export type PillTabItem<T extends string> = { id: T; label: string }

/**
 * Storelib's pill, the same size chosen or not: white on a hairline, with its
 * fill, its press tint and its words as layers inside it (lib/ui/pill-switch,
 * components/library/library-tabs PILL). A caller sets the size
 * (`itemClassName`: height, padding, type size); the look is this.
 */
export const PILL_TAB =
  "group/pill relative isolate inline-flex shrink-0 cursor-pointer touch-manipulation select-none items-center justify-center whitespace-nowrap rounded-full border border-[#e4e7ec] bg-white font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]"

/**
 * A row of Storelib's pills. The row's layout is the caller's (`className`),
 * and each pill's size (`itemClassName`); the look and the motion are this.
 */
export function PillTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
  itemClassName,
  align = "center",
  dataRow,
  rowAttrs,
  itemAttr,
  keepInView = false,
}: {
  items: readonly PillTabItem<T>[]
  value: T
  onChange: (id: T) => void
  /** For a screen reader: what the tabs choose between. */
  label: string
  className?: string
  itemClassName?: string
  align?: "center" | "start"
  /** A name for the row, as data-pill-row. */
  dataRow?: string
  /** More attributes for the row (a probe's data attribute). */
  rowAttrs?: Record<string, string>
  /** A data attribute each tab carries its id in, as well as data-tab. */
  itemAttr?: `data-${string}`
  /** A row that scrolls sideways brings the chosen tab fully into view (see THE CHOSEN PILL IS ALWAYS IN VIEW). */
  keepInView?: boolean
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  /*
    THE PILL ANSWERS THE CLICK AT ONCE. The row is drawn again for the pill
    chosen in the click itself (a few buttons), and what the pill opens
    follows in a transition React may put aside for the next press.
  */
  const [picked, setPicked] = useState<T>(value)
  const [followed, setFollowed] = useState<T>(value)
  if (followed !== value) {
    setFollowed(value)
    setPicked(value)
  }
  /* What the last press was: a finger gets a light tick of haptics when it chooses (lib/native-bridge hapticTap). */
  const pointer = useRef<string>("mouse")

  /*
    THE CHOSEN PILL IS ALWAYS IN VIEW. A row wider than the screen (Settings'
    six sections on a phone) could open on a section whose pill was past the
    edge (#settings-billing), or leave a pressed pill half cut off. The row
    itself is scrolled, never the page: at once on the first draw, smoothly
    after a press, and only when the pill is not already wholly inside, with
    a little room beside it so its neighbour shows there is more. Scrolling
    a row moves nothing in the layout.
  */
  const firstPlace = useRef(true)
  useLayoutEffect(() => {
    if (!keepInView) return
    const row = rowRef.current
    const tab = row?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(picked)}"]`)
    const instant = firstPlace.current
    firstPlace.current = false
    if (!row || !tab || row.scrollWidth <= row.clientWidth + 1) return
    const room = 24
    const left = tab.offsetLeft
    const right = left + tab.offsetWidth
    const from = row.scrollLeft
    let to = from
    if (left - room < from) to = left - room
    else if (right + room > from + row.clientWidth) to = right + room - row.clientWidth
    to = Math.max(0, Math.min(to, row.scrollWidth - row.clientWidth))
    if (Math.abs(to - from) < 1) return
    row.scrollTo({ left: to, behavior: instant || reducedMotion() ? "auto" : "smooth" })
  }, [keepInView, picked])

  return (
    <div ref={rowRef} role="tablist" aria-label={label} data-pill-row={dataRow ?? ""} {...rowAttrs} className={cn("relative", className)}>
      {items.map((item) => {
        const on = item.id === picked
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            data-tab={item.id}
            data-active={on ? "true" : "false"}
            {...(itemAttr ? { [itemAttr]: item.id } : null)}
            onPointerDown={(e) => {
              pointer.current = e.pointerType
              if (e.button === 0 && !on) pressPill(e.currentTarget)
            }}
            onPointerUp={(e) => releasePill(e.currentTarget)}
            onPointerCancel={(e) => releasePill(e.currentTarget)}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") releasePill(e.currentTarget)
            }}
            /* The row is not scrolled to the pressed chip: "don't shift layout on click" (scripts/check-onepage-tabbar.mjs). */
            onClick={() => {
              if (on) return
              if (pointer.current === "touch") hapticTap("light")
              pointer.current = "mouse"
              setPicked(item.id)
              startTransition(() => onChange(item.id))
            }}
            className={cn(PILL_TAB, itemClassName)}
          >
            <span aria-hidden data-pill-press="" className={PILL_PRESS} />
            {/* This pill's own fill: it fades in where it is, never slides over from the last one. */}
            <span aria-hidden data-pill-fill="" className={cn(PILL_FILL, on ? "opacity-100" : "opacity-0")} />
            <PillWord on={on} text={item.label} align={align} />
          </button>
        )
      })}
    </div>
  )
}

/** The element that scrolls a panel: the nearest one above it that can. */
function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement ?? null; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY
    if (o === "auto" || o === "scroll") return n
  }
  return null
}

/**
 * The panels under a row of pill tabs, kept (see the top of this file).
 * `panels` are made by the caller; each is drawn as it is, so a card, a
 * data attribute, anything, is the caller's.
 */
export function PillPanels<T extends string>({
  value,
  panels,
  className,
  dataPanels,
  build = "idle",
  buildAfter = 0,
  layered = true,
  fit = false,
}: {
  value: T
  panels: readonly { id: T; node: React.ReactNode }[]
  className?: string
  dataPanels?: string
  /** "idle": every panel built once the page is idle. "visited": each built the first time it is chosen, and kept. */
  build?: "idle" | "visited"
  /** How long after this is drawn the idle build may start (ms): later for heavy panels, so it does not land on the press that opened them. */
  buildAfter?: number
  /** Each panel on a layer of its own, painted once (see below). Off for large panels, where the layers cost more than the paint. */
  layered?: boolean
  /**
   * THE BOX IS AS TALL AS THE PANEL SHOWN, not the tallest. The panels share
   * one grid cell so nothing jumps, which also made a short panel (Billing
   * on Pro: one card) sit on top of the height of the longest (SEO), an
   * empty white field with a scrollbar beside it. With `fit` the panels not
   * shown are taken out of the cell, laid over the top of it and cut to its
   * height, so they stay painted on their layers for a free switch but add
   * no height and no scroll.
   */
  fit?: boolean
}) {
  /*
    `live` is the panel that takes presses and focus; the rest are inert.
    It follows `shown` once the crossfade is over, not in the press: inert
    (like pointer-events) is inherited, so turning it on or off restyles
    every element in the panel, and done in the press it was 480 elements
    restyled in one frame (144ms for a grid of themes on a phone with the
    CPU slowed four times). During the fade a sheet over the panels takes
    any press, so nothing half faded can be pressed.
  */
  const [state, setState] = useState<{ shown: T; leaving: T | null; live: T; built: T[] }>(() => ({ shown: value, leaving: null, live: value, built: [value] }))
  /* The chosen one changed: the one it replaces is remembered as leaving (inert until the landing ends), and no longer drawn. */
  if (state.shown !== value) {
    setState({ ...state, shown: value, leaving: state.shown, built: state.built.includes(value) ? state.built : [...state.built, value] })
  }
  /* The rest are built once the page is idle, at a priority any press overtakes. */
  const ids = panels.map((p) => p.id).join("|")
  useEffect(() => {
    if (build !== "idle") return
    const all = ids.split("|") as T[]
    const buildAll = () => startTransition(() => setState((s) => (all.every((id) => s.built.includes(id)) ? s : { ...s, built: [...s.built, ...all.filter((id) => !s.built.includes(id))] })))
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    /* Safari has no requestIdleCallback. */
    const hasIdle = typeof w.requestIdleCallback === "function"
    let idle = 0
    const wait = window.setTimeout(() => {
      if (hasIdle) idle = w.requestIdleCallback!(buildAll, { timeout: 1500 })
      else buildAll()
    }, hasIdle ? buildAfter : Math.max(300, buildAfter))
    return () => {
      window.clearTimeout(wait)
      if (idle) w.cancelIdleCallback?.(idle)
    }
  }, [ids, build, buildAfter])

  const refs = useRef<Partial<Record<T, HTMLDivElement | null>>>({})
  const scrolls = useRef<Partial<Record<T, number>>>({})
  const drawnRef = useRef(state.shown)
  const fades = useRef<Animation[]>([])
  useLayoutEffect(() => {
    const to = state.shown
    const from = drawnRef.current
    drawnRef.current = to
    if (from === to) return
    const incoming = refs.current[to]
    if (!incoming) return
    /* Each panel where it was left: the one leaving is remembered, the one arriving put back. */
    const scroller = scrollerOf(incoming)
    if (scroller) {
      scrolls.current[from] = scroller.scrollTop
      scroller.scrollTop = scrolls.current[to] ?? 0
    }
    const letGo = () => setState((s) => (s.leaving === from ? { ...s, leaving: null, live: s.shown } : s))
    /* Our own landing, kept here: asking an element for its animations makes the browser restyle the page first. */
    fades.current.forEach((a) => a.cancel())
    fades.current = []
    if (typeof incoming.animate !== "function" || reducedMotion()) {
      letGo()
      return
    }
    /*
      STORELIB'S OWN SWITCH (lib/ui/pill-switch landContent). The section
      left is gone in the frame this one arrives (it is not drawn: see
      `drawn` below), and this one lands from most of the way there, so no
      frame is empty and no two sections' words are ever on the glass at
      once. Opacity alone; nothing moves.
    */
    const into = incoming.animate([{ opacity: PANEL_IN_FROM }, { opacity: 1 }], { duration: PANEL_IN_MS, easing: CONTENT_IN_EASE })
    fades.current = [into]
    into.onfinish = letGo
    /* However the landing ends, or if a hidden page draws no frames, the one left is let go. */
    const timer = window.setTimeout(letGo, PANEL_IN_MS + 200)
    return () => window.clearTimeout(timer)
  }, [state.shown])
  /* A panel that has finished leaving is at rest: nothing of its fade is left on it. */
  useLayoutEffect(() => {
    if (state.leaving !== null) return
    fades.current.forEach((a) => a.cancel())
    fades.current = []
  }, [state.leaving])

  return (
    <div data-pill-panels={dataPanels ?? ""} className={cn("relative grid", className)}>
      {panels.filter((p) => state.built.includes(p.id)).map((p) => {
        /* Only the one chosen is drawn: the one it replaces goes in the same frame (it stays inert until the landing is over). */
        const drawn = p.id === state.shown
        return (
          <div
            key={p.id}
            ref={(el) => { refs.current[p.id] = el }}
            data-pill-panel={p.id}
            aria-hidden={p.id === state.shown ? undefined : true}
            inert={p.id !== state.live}
            className="col-start-1 row-start-1 min-w-0 self-start"
            data-pill-panel-fit={fit ? (drawn ? "in" : "out") : undefined}
            /*
              A panel not shown is see-through, not hidden: on its own layer
              (will-change), so it is painted once, when it is built in the
              idle time, and a switch is only the compositor changing two
              opacities. Hidden (visibility), the first frame of each switch
              painted the whole panel on the main thread: 70ms for SEO, up to
              182ms for a grid of themes, on a phone with the CPU slowed four
              times. It takes no presses (inert, see `live`) and is not read out.
            */
            style={{
              ...(layered ? { opacity: drawn ? undefined : 0, willChange: "opacity" } : { visibility: drawn ? undefined : "hidden" }),
              zIndex: p.id === state.shown ? 1 : 0,
              position: "relative",
              ...(fit && !drawn ? { position: "absolute", top: 0, left: 0, right: 0, maxHeight: "100%", overflow: "hidden" } : null),
            }}
          >
            {p.node}
          </div>
        )
      })}
      {/* While a section lands, a press lands here and not on the one before it. */}
      {state.leaving !== null ? <div aria-hidden data-pill-panels-busy="" className="absolute inset-0 z-[2]" /> : null}
    </div>
  )
}
