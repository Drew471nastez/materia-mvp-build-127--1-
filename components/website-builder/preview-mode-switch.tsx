"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, Code2, Globe, Loader2, Settings } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  PREVIEW, THE CODE BEHIND IT, OR THE PROJECT AROUND IT
 * ===========================================================================
 *
 * One slim pill in the bar, three segments, and ONE moving part: a bubble
 * that slides to whichever segment is chosen. Only the segment you are on
 * says its name. The other two are their icons, because a label on a thing
 * you are not looking at is noise, and because three labels make the pill a
 * toolbar where one label makes it a switch.
 *
 * The name does not pop in. Its column grows from nothing over the same
 * curve the bubble travels on, so the icons either side glide out of the way
 * rather than jump, and the bubble, re-measured as they move, follows the
 * segment it is on. That is the whole "iOS" feel: nothing appears, things
 * arrive.
 *
 * The bubble is measured, not computed. Segments are sized by their content,
 * and "Project Settings" is not the width of "Code", so a fraction of the
 * pill would land a third of the time. It is read from the DOM with rects
 * and re-read whenever a segment changes size.
 */

export type PreviewMode = "preview" | "code" | "settings"

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const MS = 320

export function PreviewModeSwitch({
  mode,
  onChange,
  compact = false,
}: {
  mode: PreviewMode
  onChange: (m: PreviewMode) => void
  /** Icons only, everywhere, for a bar with no room for a name. */
  compact?: boolean
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [bubble, setBubble] = useState<{ left: number; width: number } | null>(null)
  // The first measurement places the bubble; it does not travel there.
  const placed = useRef(false)

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () => {
      const el = track.querySelector<HTMLElement>(`[data-seg="${mode}"]`)
      if (!el) return
      const t = track.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      setBubble((prev) => {
        const next = { left: r.left - t.left, width: r.width }
        return prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.width - next.width) < 0.5 ? prev : next
      })
    }
    measure()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    ro?.observe(track)
    track.querySelectorAll<HTMLElement>("[data-seg]").forEach((el) => ro?.observe(el))
    let alive = true
    void (document as any).fonts?.ready?.then?.(() => alive && measure())
    return () => {
      alive = false
      ro?.disconnect()
    }
  }, [mode, compact])

  useEffect(() => {
    if (bubble) placed.current = true
  }, [bubble])

  const seg = (m: PreviewMode, label: string, Icon: typeof Globe) => {
    const active = mode === m
    const named = active && !compact
    return (
      <button
        key={m}
        type="button"
        data-seg={m}
        onClick={() => onChange(m)}
        aria-pressed={active}
        aria-label={label}
        className={cn(
          "relative z-10 flex h-7 items-center rounded-full px-2.5 text-[12.5px] font-medium transition-colors duration-200",
          active ? "text-white" : "text-white/55 hover:text-white/85",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        {/* A grid column from 0fr to 1fr is the one way CSS animates a width
            it does not know. The name is always in the DOM; only its room
            changes. */}
        <span
          aria-hidden={!named}
          className="grid"
          style={{
            gridTemplateColumns: named ? "1fr" : "0fr",
            opacity: named ? 1 : 0,
            transition: `grid-template-columns ${MS}ms ${EASE}, opacity ${named ? 220 : 120}ms ease-out`,
          }}
        >
          <span className="min-w-0 overflow-hidden whitespace-nowrap pl-1.5">{label}</span>
        </span>
      </button>
    )
  }

  return (
    <div
      ref={trackRef}
      // Slim. At h-8 in a p-1 track it was a 40px slab on a 48px bar, which
      // is a control shouting over the bar it sits on.
      className="relative flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.05] p-0.5"
    >
      {/* The bubble. `transform` and `width` only, so it composites; the
          overshoot curve is the one a thrown switch settles on. */}
      {bubble && (
        <span
          aria-hidden
          className="absolute top-0.5 h-7 rounded-full bg-[#8B56FA]/25 ring-1 ring-inset ring-[#8B56FA]/60 shadow-[0_0_18px_-4px_rgba(139,86,250,0.7)]"
          style={{
            left: 0,
            width: bubble.width,
            transform: `translateX(${bubble.left}px)`,
            transition: placed.current ? `transform ${MS}ms ${EASE}, width ${MS}ms ${EASE}` : "none",
          }}
        />
      )}
      {seg("preview", "Preview", Globe)}
      {seg("code", "Code", Code2)}
      {seg("settings", "Project Settings", Settings)}
    </div>
  )
}

/**
 * The code editor, in place. Mounted on first use and kept after.
 *
 * A rounded black card in the same inset as the preview card it replaces:
 * the canvas turning over, not a second thing laid on top of the first. It
 * sits above anything a theme can stack (a sticky header is z-60), and the
 * preview underneath is made invisible while it shows, so nothing of the
 * site can bleed through its corners or over its edge.
 */
export function CodePane({
  installId,
  visible,
  /**
   * A phone has no room for a card inset in a canvas: the canvas IS the
   * phone. There, the code is a page of its own over the whole screen, with
   * the one control a page over a page cannot do without.
   */
  fullScreen = false,
  onClose,
}: {
  installId: string
  visible: boolean
  fullScreen?: boolean
  onClose?: () => void
}) {
  const [everShown, setEverShown] = useState(visible)
  const [loaded, setLoaded] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (visible) setEverShown(true)
  }, [visible])

  // Escape leaves it, the way leaving any page over another one should.
  useEffect(() => {
    if (!fullScreen || !visible || !onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [fullScreen, visible, onClose])

  if (!everShown) return null

  const body = (
    <div
      className={cn(
        // Light, like the rest of the app. A black panel inside a white
        // builder is a second product bolted to the side of the first.
        "overflow-hidden bg-white",
        fullScreen
          ? "fixed inset-0 z-[120] flex flex-col"
          : // `flex flex-col` is not decoration: the iframe's wrapper below is
            // `flex-1`, and in a block container that resolves to nothing, so
            // the iframe fell back to its 150px HTML default and left the card
            // mostly empty on a desktop.
            "absolute inset-0 z-[80] flex flex-col rounded-l-xl",
        /**
         * It rises AND settles: a short lift with a touch of scale, on the
         * curve a thrown thing lands on, which reads as the canvas turning
         * over rather than as a panel switched on. Longer than the old 220ms
         * because the distance is small, and a fast small move is what makes
         * a transition look like a flicker.
         */
        "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        visible ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-3 scale-[0.995] opacity-0",
      )}
      aria-hidden={!visible}
    >
      {fullScreen && (
        /* Its own bar, because it covers the editor's. Back is the first
           thing on it. */
        <div
          className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 text-neutral-900"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to the editor"
            className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-[15px] font-medium text-neutral-700 transition-[background-color,transform] duration-150 hover:bg-neutral-200 hover:text-neutral-900 active:scale-95"
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2} />
            Editor
          </button>
          <span className="ml-1 flex items-center gap-1.5 text-[15px] font-medium text-neutral-500">
            <Code2 className="h-4 w-4" strokeWidth={1.75} />
            Code
          </span>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        <iframe
          title="Code editor"
          src={`/website-builder/code/${installId}?embedded=1`}
          onLoad={() => setLoaded(true)}
          className={cn(
            "h-full w-full border-0 bg-white transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
    </div>
  )

  /**
   * Portalled when it covers the screen. `position: fixed` is measured against
   * the nearest ancestor carrying a transform, and the canvas it is rendered
   * inside animates one — so "the whole screen" would have quietly meant "the
   * whole canvas", which is the thing it exists to stop.
   */
  if (!fullScreen) return body
  if (!mounted) return null
  return createPortal(body, document.body)
}
