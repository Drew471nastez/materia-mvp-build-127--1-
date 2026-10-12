"use client"

/**
 * ===========================================================================
 *  A SLIDER AND THE NUMBER IT IS ON
 * ===========================================================================
 * The editor's one slider, lifted out of the page so the probe that measures
 * its frame pacing drives the same code the product does rather than a copy
 * of it (scripts/check-control-frames.mjs).
 *
 * TWO THINGS MAKE IT SMOOTH, and they are the same two things that make the
 * colour controls smooth.
 *
 * The thumb is drawn from state held HERE. It used to be drawn from the
 * prop, which comes back from the editor's own state: the thumb could not
 * move until a settings change had gone all the way up, re-rendered the
 * editor and come back down, so at the far end of a drag the thumb was
 * visibly behind the finger.
 *
 * And what goes up goes up once a frame, not once a `pointermove`. A phone
 * reports touches faster than it paints — up to 240 a second on a 120Hz
 * panel — and every one of those was a full settings write and a canvas
 * repaint. That is the lag, and it is not the slider's own work: it is what
 * the slider asked the rest of the editor to do while a finger was down.
 *
 * NO HAPTICS. A tick per step crossed sounded right and is not: a drag
 * crosses a lot of steps, the taps run into each other, and on a slider you
 * are already watching the number change. Asked for and removed.
 *
 * ===========================================================================
 *  THE FINGER DOES NOT GO THROUGH REACT
 * ===========================================================================
 * "Dragging must track the finger in real time." Drawn from local state, the
 * thumb still waited for a render: every move set that state, React rendered
 * the control in a task of its own after the browser had painted, and the
 * thumb was drawn one frame behind the finger on every move, on a phone and
 * on a computer alike (scripts/check-onepage-motion.mjs, `sliders`: 0 of 8
 * moves drawn in their own frame, 1.2 to 1.5 React commits per move).
 *
 * So a drag is the control's own, as the shared sheet's is
 * (components/ui/bottom-sheet.tsx): the pointer is captured on touchdown,
 * and each move writes the thumb's and the fill's `translate` directly, in
 * the handler, so the frame that carries the move draws them. Radix still
 * draws the slider at rest, reads the keyboard and names it to a screen
 * reader; while a finger is down its `left` stays where the drag began and
 * the translation carries the difference. The thumb follows the finger
 * continuously rather than jumping from step to step; the number and the
 * page move in steps. React hears the value at most once a frame, through
 * the same commit as before, and nothing in this control renders while the
 * finger moves. On release the state takes the last step, and the thumb
 * glides the few pixels from the finger to that step instead of jumping.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { useFrameCommit } from "./use-frame-commit"
import { beginLive, endLive } from "@/lib/website-builder/live-settings"
import { tt } from "@/lib/i18n/text"

/** The glide from where the finger let go to the step it lands on. */
const SETTLE_MS = 140
const SETTLE_EASE = "cubic-bezier(0.2, 0, 0, 1)"

type Drag = {
  pointerId: number
  wrap: HTMLElement
  root: HTMLElement
  thumb: HTMLElement
  thumbWrap: HTMLElement
  range: HTMLElement | null
  left: number
  width: number
  thumbW: number
  /** Where the thumb was drawn when the drag began, 0 to 1 along its travel. */
  startPct: number
  /** The finger's distance from the thumb's centre, kept so a grabbed thumb does not jump. */
  grab: number
  pct: number
  value: number
}

export function SliderNumberControl({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
  className,
  onLiveChange,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  className?: string
  /**
   * Every value the thumb is drawn at, as it is drawn, before the once a frame
   * commit: for a caller that answers the finger itself (the OnePage editor's
   * sliders tick at their stops, components/onepage/editor-kit RangeRow).
   * This control stays silent.
   */
  onLiveChange?: (v: number) => void
}) {
  const [inputStr, setInputStr] = useState<string>(String(value))
  const focusedRef = useRef(false)

  /**
   * What the thumb is drawn at. The prop is where it loads from and what it
   * follows when something else changes the setting; while a finger is on
   * it, this is ahead of the prop by however long the editor takes.
   */
  const [shown, setShown] = useState(value)
  const sent = useRef<number | null>(null)
  const { emit, flush } = useFrameCommit(onChange)

  const rowRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<Drag | null>(null)
  /* The newest of everything the drag reads, so its listeners are bound once. */
  const live = useRef({ min, max, step, unit, shown, onLiveChange, emit, flush })
  useEffect(() => {
    live.current = { min, max, step, unit, shown, onLiveChange, emit, flush }
  })

  useEffect(() => {
    /* A finger on the slider is the truth until it lifts: an older value
       coming back from the editor must not pull the thumb back under it. */
    if (dragRef.current) return
    /* Our own value coming back is not a change. */
    if (sent.current !== null && value === sent.current) return
    sent.current = null
    setShown(value)
    if (!focusedRef.current) setInputStr(String(value))
  }, [value])

  const set = useCallback((v: number) => {
    live.current.onLiveChange?.(v)
    setShown(v)
    if (!focusedRef.current) setInputStr(String(v))
    sent.current = v
    live.current.emit(v)
  }, [])

  /* ── The drag, off React ─────────────────────────────────────────────── */
  useEffect(() => {
    const wrap = rowRef.current?.querySelector<HTMLElement>("[data-sheet-no-drag]")
    if (!wrap) return

    const snap = (raw: number) => {
      const { min, max, step } = live.current
      const s = step > 0 ? Math.round((raw - min) / step) * step + min : raw
      /* 0.1 + 0.2 is not 0.3: keep the step's own decimals. */
      const decimals = step > 0 && step < 1 ? String(step).split(".")[1]?.length ?? 0 : 0
      return Math.min(max, Math.max(min, Number(s.toFixed(decimals))))
    }
    const pctOf = (v: number) => {
      const { min, max } = live.current
      return max > min ? (Math.min(max, Math.max(min, v)) - min) / (max - min) : 0
    }

    const move = (d: Drag, clientX: number) => {
      const travel = Math.max(1, d.width - d.thumbW)
      d.pct = Math.min(1, Math.max(0, (clientX - d.grab - d.left - d.thumbW / 2) / travel))
      /* The frame that carries this move draws it: two style writes, no layout. */
      d.thumbWrap.style.translate = `${((d.pct - d.startPct) * travel).toFixed(2)}px 0`
      if (d.range) d.range.style.translate = `${((d.pct - d.startPct) * d.width).toFixed(2)}px 0`
      const { min, max, unit } = live.current
      const v = snap(min + d.pct * (max - min))
      if (v === d.value) return
      d.value = v
      d.thumb.setAttribute("aria-valuenow", String(v))
      const input = inputRef.current
      if (input && !focusedRef.current) input.value = String(v) + (unit ?? "")
      live.current.onLiveChange?.(v)
      sent.current = v
      live.current.emit(v)
    }

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return
      const root = wrap.querySelector<HTMLElement>('[data-slot="slider"]')
      const thumb = wrap.querySelector<HTMLElement>('[data-slot="slider-thumb"]')
      const thumbWrap = thumb?.parentElement
      if (!root || !thumb || !thumbWrap || root.hasAttribute("data-disabled")) return
      /* Radix's own pointer handling never starts: this drag is ours. */
      e.preventDefault()
      e.stopPropagation()
      /* A glide from the last release still running ends where it was going. */
      const range = root.querySelector<HTMLElement>('[data-slot="slider-range"]')
      for (const el of [thumbWrap, range]) for (const a of el?.getAnimations?.() ?? []) a.finish()
      const rect = root.getBoundingClientRect()
      const thumbW = thumb.offsetWidth
      const startPct = pctOf(live.current.shown)
      const centre = rect.left + thumbW / 2 + startPct * (rect.width - thumbW)
      /* On the thumb, the finger keeps its hold; on the track, the thumb comes to the finger. */
      const onThumb = Math.abs(e.clientX - centre) <= thumbW / 2 + 6
      const d: Drag = {
        pointerId: e.pointerId, wrap, root, thumb, thumbWrap, range,
        left: rect.left, width: rect.width, thumbW, startPct,
        grab: onThumb ? e.clientX - centre : 0,
        pct: startPct, value: live.current.shown,
      }
      dragRef.current = d
      /* What the drag sends is drawn by the section alone and committed once on release (lib/website-builder/live-settings.ts). */
      beginLive()
      try { wrap.setPointerCapture(e.pointerId) } catch { /* a pointer already gone */ }
      root.setAttribute("data-dragging", "")
      thumbWrap.style.willChange = "translate"
      if (range) range.style.willChange = "translate"
      thumb.focus({ preventScroll: true })
      move(d, e.clientX)
    }

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (d && e.pointerId === d.pointerId) move(d, e.clientX)
    }

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      dragRef.current = null
      try { if (wrap.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId) } catch { /* already released */ }
      d.root.removeAttribute("data-dragging")
      live.current.flush()
      endLive()
      /* Where the finger left the thumb and the fill, measured from the step they now rest on. */
      const travel = d.width - d.thumbW
      const restPct = pctOf(d.value)
      const thumbFrom = (d.pct - restPct) * travel
      const rangeFrom = (d.pct - restPct) * d.width
      /* React draws the step in this task, so no frame shows Radix's new left with the old translation. */
      flushSync(() => {
        setShown(d.value)
        if (!focusedRef.current) setInputStr(String(d.value))
      })
      d.thumbWrap.style.translate = ""
      d.thumbWrap.style.willChange = ""
      if (d.range) { d.range.style.translate = ""; d.range.style.willChange = "" }
      if (Math.abs(thumbFrom) < 0.5 || typeof d.thumbWrap.animate !== "function") return
      const timing = { duration: SETTLE_MS, easing: SETTLE_EASE }
      d.thumbWrap.animate([{ translate: tt("{thumbFrom}px 0", { thumbFrom }) }, { translate: "0px 0" }], timing)
      d.range?.animate([{ translate: tt("{rangeFrom}px 0", { rangeFrom }) }, { translate: "0px 0" }], timing)
    }

    wrap.addEventListener("pointerdown", onDown, { capture: true })
    wrap.addEventListener("pointermove", onMove)
    wrap.addEventListener("pointerup", onUp)
    wrap.addEventListener("pointercancel", onUp)
    wrap.addEventListener("lostpointercapture", onUp)
    return () => {
      wrap.removeEventListener("pointerdown", onDown, { capture: true })
      wrap.removeEventListener("pointermove", onMove)
      wrap.removeEventListener("pointerup", onUp)
      wrap.removeEventListener("pointercancel", onUp)
      wrap.removeEventListener("lostpointercapture", onUp)
    }
  }, [])

  const commit = (raw: string) => {
    const n = Number(raw)
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n))
      const snapped = step > 0 ? Math.round(clamped / step) * step : clamped
      set(snapped)
      flush()
      setInputStr(String(snapped))
    } else {
      setInputStr(String(shown))
    }
  }
  const commitRef = useRef(commit)
  useEffect(() => { commitRef.current = commit })

  /*
    THE SAME ELEMENT WHILE NOTHING IT DRAWS HAS CHANGED. The editor answers
    each value by re-rendering, once a frame, while the finger is still
    down; this hands React back the element it already has, so the slider
    under the finger is not rendered again and no older number is written
    back into the box over the one the drag put there.
  */
  return useMemo(() => (
    <div ref={rowRef} className={cn("flex items-center gap-2.5", className)}>
      {/**
        * ═══════════════════════════════════════════════════════════════════
        *  A SLIDER'S FINGER IS THE SLIDER'S
        * ═══════════════════════════════════════════════════════════════════
        * The sheet arbitrates every touch that lands on it between "scroll
        * the form" and "move the sheet", and a sideways drag is only handed
        * back when it is clearly sideways: 1.2 times more horizontal than
        * vertical. A thumb dragging a slider is not that precise. Ten pixels
        * right and nine down is not horizontal enough, the sheet takes the
        * gesture, and it follows the finger down and snaps to half — which
        * is "when I drag the sliders left and right it glitches the sheet
        * and makes it half for no reason".
        *
        * No threshold fixes it, because the two gestures are the same
        * gesture. What tells them apart is what the finger landed on, and
        * this attribute is the sheet's own way of being told: it does not
        * arm at all for a touch that starts in here.
        */}
      <div data-sheet-no-drag className="flex-1 relative py-2 -my-2 touch-none select-none">
        <Slider
          value={[shown]}
          onValueChange={([v]) => set(v)}
          onValueCommit={() => flush()}
          min={min}
          max={max}
          step={step}
          className="wb-black-slider"
        />
      </div>
      <div className="relative shrink-0">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          className="h-8 px-2 text-xs text-center border border-neutral-200 rounded-md bg-white text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-neutral-400 transition-colors"
          /* As wide as the longest value this slider can hold, with its unit: "1800px" ran out of a fixed 58px box on both sides. */
          style={{ width: `max(58px, calc(${Math.max(String(max).length, String(min).length, String(step).length) + (unit ?? "").length}ch + 22px))` }}
          value={inputStr + (focusedRef.current ? "" : unit ?? "")}
          onFocus={e => {
            focusedRef.current = true
            setInputStr(String(live.current.shown))
            // Select on focus so user can type immediately
            requestAnimationFrame(() => e.target.select())
          }}
          onChange={e => setInputStr(e.target.value.replace(unit ?? "", "").replace(/[^0-9.\-]/g, ""))}
          onBlur={e => { focusedRef.current = false; commitRef.current(e.target.value.replace(unit ?? "", "")) }}
          onKeyDown={e => {
            const cur = live.current.shown
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            if (e.key === "ArrowUp") { e.preventDefault(); set(Math.min(max, cur + step)); flush() }
            if (e.key === "ArrowDown") { e.preventDefault(); set(Math.max(min, cur - step)); flush() }
          }}
        />
      </div>
    </div>
  ), [className, shown, set, flush, min, max, step, inputStr, unit])
}
