"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Code2, Globe, Loader2, Settings } from "lucide-react"

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
          "relative z-10 flex h-8 items-center rounded-full px-2.5 text-[13px] font-medium transition-colors duration-200",
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
      className="relative flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.05] p-1"
    >
      {/* The bubble. `transform` and `width` only, so it composites; the
          overshoot curve is the one a thrown switch settles on. */}
      {bubble && (
        <span
          aria-hidden
          className="absolute top-1 h-8 rounded-full bg-[#8B56FA]/25 ring-1 ring-inset ring-[#8B56FA]/60 shadow-[0_0_18px_-4px_rgba(139,86,250,0.7)]"
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
export function CodePane({ installId, visible }: { installId: string; visible: boolean }) {
  const [everShown, setEverShown] = useState(visible)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (visible) setEverShown(true)
  }, [visible])
  if (!everShown) return null
  return (
    <div
      className={cn(
        "absolute inset-2 z-[80] overflow-hidden rounded-xl border border-white/10 bg-[#0e0e0e] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]",
        "transition-[opacity,transform] duration-200 ease-out",
        visible ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-[0.98]",
      )}
      aria-hidden={!visible}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      <iframe
        title="Code editor"
        src={`/website-builder/code/${installId}?embedded=1`}
        onLoad={() => setLoaded(true)}
        className={cn("h-full w-full border-0 bg-[#0e0e0e] transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
      />
    </div>
  )
}
