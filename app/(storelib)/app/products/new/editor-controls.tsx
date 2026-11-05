"use client"

import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { switchKnob, switchTrack } from "@/components/ui/switch-style"
import { hapticTap } from "@/lib/native-bridge"

/**
 * A switch, drawn for this form: the app's one slim, near black switch
 * (components/ui/switch-style.ts). A real button with role="switch", so it is a 44px press on
 * a phone and a key press on a computer.
 */
export function FormSwitch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  id?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => { hapticTap("light"); onChange(!checked) }}
      className="group relative -m-2 inline-flex shrink-0 cursor-pointer items-center p-2 outline-none"
    >
      <span className={cn(switchTrack(checked), "group-focus-visible:ring-2 group-focus-visible:ring-[#111113]/30 group-focus-visible:ring-offset-2")}>
        <span className={switchKnob(checked)} />
      </span>
    </button>
  )
}

/**
 * A setting as one row of a grouped list: what it is, a line on what it
 * does, and its switch at the end. The whole row turns it, as a row does in a
 * phone's own settings.
 */
export function SwitchRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div
      className="flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2.5 active:bg-[#f6f7f8] sm:min-h-[52px] sm:active:bg-transparent"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[role=switch]")) return
        onChange(!checked)
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-5 text-[#1a1a2e] sm:text-[14px]">{title}</p>
        {hint ? <p className="mt-0.5 text-[13px] leading-[18px] text-[#6b7280]">{hint}</p> : null}
      </div>
      <FormSwitch checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

/** The group a SwitchRow sits in: one rounded block, a hairline between rows. */
export const SWITCH_GROUP = "divide-y divide-[#eef0f2] overflow-hidden rounded-xl border border-[#e5e7eb]"

/** iOS's own curve: leaves fast, settles slowly, never overshoots. */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const SLIDE_MS = 200

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/**
 * Two or three choices of which exactly one is on, side by side in one
 * track, the chosen one lifted onto white. A radio group underneath, so the
 * arrow keys move it and a screen reader reads it as one.
 *
 * THE WHITE SLIDES. It is one piece under the labels, and a change moves it
 * from the old choice to the new one in 200ms on iOS's curve, on `transform`
 * alone. Choices of different widths (`fit="content"`, for labels that are
 * not the same length) are handled the way a layout animation is: the piece
 * takes its new size at once, and is drawn from its old place and width
 * with translate and scaleX, back to none. At rest it is never scaled, so
 * its corners are always round.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  fit = "equal",
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
  label: string
  /** "equal": every choice the same width. "content": each as wide as its label needs, sharing what is left. */
  fit?: "equal" | "content"
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)
  /* Where the white is now, in the track's own pixels. */
  const at = useRef<{ x: number; w: number } | null>(null)

  const place = useCallback((animate: boolean) => {
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!track || !thumb) return
    const button = track.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`)
    if (!button) return
    const next = { x: button.offsetLeft, w: button.offsetWidth }
    let prev = at.current
    /* Chosen again mid-slide: from wherever the white is right now. */
    const sliding = typeof thumb.getAnimations === "function" ? thumb.getAnimations() : []
    if (sliding.length && prev) {
      const m = new DOMMatrixReadOnly(getComputedStyle(thumb).transform)
      prev = { x: m.e, w: thumb.offsetWidth * m.a }
      for (const a of sliding) a.cancel()
    }
    at.current = next
    thumb.style.width = `${next.w}px`
    thumb.style.transform = `translate3d(${next.x}px, 0, 0)`
    track.setAttribute("data-ready", "")
    thumb.setAttribute("data-ready", "")
    if (!animate || !prev || (prev.x === next.x && prev.w === next.w) || reducedMotion() || typeof thumb.animate !== "function") return
    thumb.animate(
      [
        { transform: `translate3d(${prev.x}px, 0, 0) scaleX(${prev.w / next.w})` },
        { transform: `translate3d(${next.x}px, 0, 0) scaleX(1)` },
      ],
      { duration: SLIDE_MS, easing: EASE },
    )
  }, [value])

  /* A new choice slides; the first placing and a resize do not. */
  const placed = useRef(false)
  useLayoutEffect(() => {
    place(placed.current)
    placed.current = true
  }, [place])
  /* One observer for the life of the track: it fires once on observe, which must not cut a slide short. */
  const placeRef = useRef(place)
  useEffect(() => { placeRef.current = place }, [place])
  useEffect(() => {
    const track = trackRef.current
    if (!track || typeof ResizeObserver === "undefined") return
    let first = true
    const ro = new ResizeObserver(() => {
      if (first) { first = false; return }
      placeRef.current(false)
    })
    ro.observe(track)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={label}
      data-segmented=""
      className={cn(
        "relative flex rounded-[10px] bg-[#eceef1] p-0.5",
        /* Before the white is placed (the server's frame), the chosen one draws its own. */
        "[&:not([data-ready])>[aria-checked=true]]:bg-white [&:not([data-ready])>[aria-checked=true]]:shadow-[0_1px_2px_rgba(17,24,39,0.12)]",
      )}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
        e.preventDefault()
        const i = options.findIndex((o) => o.value === value)
        const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length]
        onChange(next.value)
        ;(e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus()
      }}
    >
      <span
        ref={thumbRef}
        aria-hidden
        data-segment-thumb=""
        className="pointer-events-none absolute bottom-0.5 left-0 top-0.5 w-0 origin-left rounded-lg bg-white shadow-[0_1px_2px_rgba(17,24,39,0.12),0_0_0_0.5px_rgba(17,24,39,0.06)] opacity-0 sm:rounded-md data-[ready]:opacity-100"
      />
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-value={o.value}
            tabIndex={on ? 0 : -1}
            onClick={() => { if (!on) onChange(o.value) }}
            className={cn(
              "relative h-10 min-w-0 cursor-pointer truncate rounded-lg px-3 text-[15px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#8b5cf6] sm:h-8 sm:rounded-md sm:text-[13px] [-webkit-tap-highlight-color:transparent]",
              fit === "equal" ? "flex-1 basis-0" : "flex-auto",
              on ? "text-[#1a1a2e]" : "text-[#4b5563] hover:text-[#1a1a2e]",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Panels that take turns in one place: only `active` is in the flow, the
 * others are laid over it, invisible and out of reach. So the box is always
 * exactly as tall as what it shows, from the server's first frame on, with
 * nothing measured to get there.
 *
 * A change cross-fades them where they stand, and the box eases from the old
 * panel's height to the new one's (both measured, neither guessed), so what
 * is below moves in one smooth run rather than a jump. With no change in
 * height nothing below moves at all. The height is the one animated
 * property here that is not transform or opacity, for 240ms, on one box
 * whose inside does not reflow while it runs.
 */
export function SwapPanels<K extends string>({
  active,
  panels,
}: {
  active: K
  panels: { key: K; node: React.ReactNode }[]
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  /* The box's height as last drawn: where a change eases from. */
  const drawn = useRef<number | null>(null)
  const shown = useRef(active)
  const running = useRef<Animation | null>(null)

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    /* Changed again mid-way: from wherever the box is right now. */
    const from = running.current ? box.getBoundingClientRect().height : drawn.current
    running.current?.cancel()
    const to = box.offsetHeight
    drawn.current = to
    if (shown.current === active) return
    shown.current = active
    if (from == null || Math.abs(from - to) < 0.5 || reducedMotion() || typeof box.animate !== "function") return
    const a = box.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 240, easing: EASE })
    running.current = a
    a.onfinish = a.oncancel = () => { if (running.current === a) running.current = null }
  }, [active])

  /* A panel that changes size at rest (a line wraps, the window narrows) is the new "from". */
  useEffect(() => {
    const box = boxRef.current
    if (!box || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => { if (!running.current) drawn.current = box.offsetHeight })
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  return (
    /* 4px of room on every side, inside the clip, so a focus ring is never cut. */
    <div ref={boxRef} data-swap-panels="" className="relative -m-1 overflow-hidden p-1">
      {panels.map((p) => {
        const on = p.key === active
        return (
          <div
            key={p.key}
            data-panel={p.key}
            aria-hidden={on ? undefined : true}
            inert={!on}
            className={cn(
              "motion-reduce:transition-none!",
              on
                ? "relative visible opacity-100 [transition:opacity_180ms_ease-out_60ms]"
                : "absolute inset-x-1 top-1 invisible opacity-0 [transition:opacity_120ms_ease-in,visibility_0s_linear_120ms]",
            )}
          >
            {p.node}
          </div>
        )
      })}
    </div>
  )
}
