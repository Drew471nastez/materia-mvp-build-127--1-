"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Code2, Globe, Loader2, Settings } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  PREVIEW, THE CODE BEHIND IT, OR THE PROJECT AROUND IT
 * ===========================================================================
 *
 * Three segments in one slim pill, and ONE moving part: a bubble that slides
 * to whichever segment is chosen. Three buttons that each swap their own
 * background say "a change happened somewhere"; one bubble that travels says
 * exactly where from and where to, which is why every native segmented
 * control since iOS 13 does it this way.
 *
 * The bubble is measured, not computed. Segments are sized by their labels,
 * and "Project Settings" is not the width of "Code", so a fraction of the
 * pill would land a third of the time. It is read from the DOM with rects
 * and re-read when a label reflows.
 */

export type PreviewMode = "preview" | "code" | "settings"

export function PreviewModeSwitch({
  mode,
  onChange,
  compact = false,
}: {
  mode: PreviewMode
  onChange: (m: PreviewMode) => void
  /** Icons only, for a phone bar. */
  compact?: boolean
}) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [bubble, setBubble] = useState<{ left: number; width: number } | null>(null)

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

  const seg = (m: PreviewMode, label: string, Icon: typeof Globe) => {
    const active = mode === m
    return (
      <button
        key={m}
        type="button"
        data-seg={m}
        onClick={() => onChange(m)}
        aria-pressed={active}
        aria-label={label}
        className={cn(
          "relative z-10 flex h-8 items-center gap-1.5 rounded-full text-[13px] font-medium transition-colors duration-200",
          compact ? "w-9 justify-center px-0" : "px-3.5",
          active ? "text-white" : "text-white/55 hover:text-white/85",
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
        {!compact && <span className="whitespace-nowrap">{label}</span>}
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
          className="absolute top-1 h-8 rounded-full bg-[#2f5cff]/25 ring-1 ring-inset ring-[#2f5cff]/60 shadow-[0_0_18px_-4px_rgba(47,92,255,0.7)]"
          style={{
            left: 0,
            width: bubble.width,
            transform: `translateX(${bubble.left}px)`,
            transition:
              "transform 320ms cubic-bezier(0.32, 0.72, 0, 1), width 320ms cubic-bezier(0.32, 0.72, 0, 1)",
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
 * A rounded black card inset from the canvas edge, like the reference, rather
 * than a sheet of black to the edges: it is a surface on the workbench, not a
 * different room. It arrives by scaling up from 98% and fading, which is what
 * makes it read as the canvas turning over rather than as a page load.
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
        "absolute inset-2 z-20 overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e0e] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]",
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
