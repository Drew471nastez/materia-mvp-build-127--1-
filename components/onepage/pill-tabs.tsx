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
 *   PillTabs    a row of words with ONE pill under the chosen one, used by
 *               Settings' chips and list, the Theme page's kinds and the
 *               font picker's kinds. The pill is moved by a direct style
 *               write in the press itself (pointerdown), before React hears
 *               of it, and slides and stretches from where it is to the
 *               pressed tab on transform (220ms, iOS's curve), on the
 *               compositor, from where the tabs were measured after the
 *               last render. The choice is made on the click, in a
 *               transition, so a finger that scrolls the row instead puts
 *               the pill back. Each word is drawn twice, in the chosen and
 *               the plain colour, crossing on opacity, so no colour is
 *               painted frame by frame.
 *   PillPanels  Settings' sections, every one kept mounted, one over the
 *               other in one grid cell (so the box is as tall as the tallest
 *               and never jumps), the ones not yet seen built in the page's
 *               idle time. A switch fades the new one in (180ms) over the
 *               old one fading out (120ms), on opacity, with no frame of
 *               neither, and each is scrolled back to where it was left.
 *               Each is on a layer of its own, painted once, so a switch
 *               paints nothing. What a panel draws is handed in already
 *               made, so a switch re-renders the row and this, and nothing
 *               inside the panels.
 *   usePillSlide, usePillPress
 *               the pill and its press, which the editor's own row of tabs
 *               on a computer uses too. The phone's bottom bar has no pill
 *               (the owner asked for its buttons to change in place); it
 *               uses usePillPress to start that change on the press.
 */
import * as React from "react"
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/** The pill slides to the next tab on iOS's curve. */
export const PILL_MS = 220
export const PILL_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** A panel's crossfade. */
export const PANEL_FADE_MS = 180

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
  A tab's word, twice: in the colour it has when chosen and in the colour it
  has when not, one over the other, crossing on opacity, rather than the
  words painted in a new colour. The second copy is drawn by CSS, so the
  tab's text is the word once.
*/
function PillWord({ on, onClass, offClass, text, align }: { on: boolean; onClass: string; offClass: string; text: string; align: "center" | "start" }) {
  const face = cn("col-start-1 row-start-1 min-w-0 truncate transition-opacity duration-200 ease-out", align === "center" ? "text-center" : "text-left")
  return (
    <span className="relative z-[2] grid min-w-0">
      <span data-pill-face="off" className={cn(face, offClass)} style={{ opacity: on ? 0 : 1 }}>{text}</span>
      <span data-pill-face="on" aria-hidden data-text={text} className={cn(face, onClass, "after:content-[attr(data-text)]")} style={{ opacity: on ? 1 : 0 }} />
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
 * A row of pill tabs. The looks are the caller's (`className` for the row,
 * `itemClassName` for each tab, `pillClassName` for the pill, `onClass` and
 * `offClass` for the words); the motion is this.
 */
export function PillTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
  itemClassName,
  pillClassName,
  onClass,
  offClass,
  align = "center",
  dataRow,
  rowAttrs,
  itemAttr,
}: {
  items: readonly PillTabItem<T>[]
  value: T
  onChange: (id: T) => void
  /** For a screen reader: what the tabs choose between. */
  label: string
  className?: string
  itemClassName?: string
  pillClassName?: string
  onClass: string
  offClass: string
  align?: "center" | "start"
  /** A name for the row, as data-pill-row. */
  dataRow?: string
  /** More attributes for the row (a probe's data attribute). */
  rowAttrs?: Record<string, string>
  /** A data attribute each tab carries its id in, as well as data-tab. */
  itemAttr?: `data-${string}`
}) {
  const { rowRef, pillRef, slideTo } = usePillSlide(value)
  const pressFor = usePillPress(slideTo, value)

  return (
    <div ref={rowRef} role="tablist" aria-label={label} data-pill-row={dataRow ?? ""} {...rowAttrs} className={cn("relative isolate", className)}>
      <span ref={pillRef} aria-hidden data-pill="" className={cn("pointer-events-none absolute left-0 top-0 z-[1]", pillClassName)} style={{ opacity: 0 }} />
      {items.map((item) => {
        const on = item.id === value
        const press = pressFor(item.id)
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            data-tab={item.id}
            {...(itemAttr ? { [itemAttr]: item.id } : null)}
            onPointerDown={press.onPointerDown}
            onPointerCancel={press.onPointerCancel}
            /* The row is not scrolled to the pressed chip: "don't shift layout on click" (scripts/check-onepage-tabbar.mjs). */
            onClick={() => {
              press.chosen()
              slideTo(item.id)
              /*
                The pill is already on its way (a compositor animation); the
                panels follow in a render React may split up and put aside
                for the next press, rather than inside this click, where it
                stacked onto the press's own work in one long frame.
              */
              if (!on) startTransition(() => onChange(item.id))
            }}
            className={cn("relative min-w-0 cursor-pointer select-none outline-none focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)] [-webkit-tap-highlight-color:transparent]", itemClassName)}
          >
            <PillWord on={on} onClass={onClass} offClass={offClass} text={item.label} align={align} />
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
  /* The chosen one changed: the one it replaces stays drawn, leaving, in this same render. */
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
    const outgoing = refs.current[from]
    if (!incoming) return
    /* Each panel where it was left: the one leaving is remembered, the one arriving put back. */
    const scroller = scrollerOf(incoming)
    if (scroller) {
      scrolls.current[from] = scroller.scrollTop
      scroller.scrollTop = scrolls.current[to] ?? 0
    }
    const letGo = () => setState((s) => (s.leaving === from ? { ...s, leaving: null, live: s.shown } : s))
    /* Our own fades, kept here: asking an element for its animations makes the browser restyle the page first. */
    fades.current.forEach((a) => a.cancel())
    fades.current = []
    if (!outgoing || typeof incoming.animate !== "function" || reducedMotion()) {
      letGo()
      return
    }
    const into = incoming.animate([{ opacity: 0 }, { opacity: 1 }], { duration: PANEL_FADE_MS, easing: "cubic-bezier(0.2, 0, 0, 1)" })
    /* The old one goes a little faster than the new one comes, so two panels of different lengths are superimposed for as short a time as can be, without a frame of neither. */
    const out = outgoing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: PANEL_FADE_MS - 60, easing: "cubic-bezier(0.3, 0, 0.7, 1)", fill: "forwards" })
    fades.current = [into, out]
    into.onfinish = letGo
    /* However the fade ends, or if a hidden page draws no frames, the old one goes. */
    const timer = window.setTimeout(letGo, PANEL_FADE_MS + 200)
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
        const drawn = p.id === state.shown || p.id === state.leaving
        return (
          <div
            key={p.id}
            ref={(el) => { refs.current[p.id] = el }}
            data-pill-panel={p.id}
            aria-hidden={p.id === state.shown ? undefined : true}
            inert={p.id !== state.live}
            className="col-start-1 row-start-1 min-w-0 self-start"
            /*
              A panel not shown is see-through, not hidden: on its own layer
              (will-change), so it is painted once, when it is built in the
              idle time, and a switch is only the compositor changing two
              opacities. Hidden (visibility), the first frame of each switch
              painted the whole panel on the main thread: 70ms for SEO, up to
              182ms for a grid of themes, on a phone with the CPU slowed four
              times. It takes no presses (inert, see `live`) and is not read out.
            */
            style={{ ...(layered ? { opacity: drawn ? undefined : 0, willChange: "opacity" } : { visibility: drawn ? undefined : "hidden" }), zIndex: p.id === state.shown ? 1 : 0, position: "relative" }}
          >
            {p.node}
          </div>
        )
      })}
      {/* While two panels cross, a press lands here and not on either. */}
      {state.leaving !== null ? <div aria-hidden data-pill-panels-busy="" className="absolute inset-0 z-[2]" /> : null}
    </div>
  )
}
