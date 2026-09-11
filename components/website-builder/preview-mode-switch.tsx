"use client"

import React, { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, Code2, Globe, Moon, Settings, Sun } from "lucide-react"

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
/**
 * ===========================================================================
 *  WHAT IS COMING, NOT THAT SOMETHING IS COMING
 * ===========================================================================
 * The code editor waited behind a lucide spinner set to `animate-spin`: a
 * circle rotating in the middle of an empty card. It says something is
 * happening and nothing else, in the one place the eye is already looking,
 * and then everything it was standing in for appears somewhere else.
 *
 * This is the shape of the thing being fetched instead — a file gutter, a tab
 * strip, and lines at the lengths code actually has, indented where code is
 * indented. Nothing moves when the real editor lands, because the real
 * editor is this shape. The bar widths are a fixed pattern rather than
 * random: a skeleton that reshuffles on every render is a second thing to
 * look at.
 *
 * The motion is ONE element sweeping across all of it, animating `transform`
 * and nothing else, so it is a single compositor layer sliding rather than
 * forty boxes repainting per frame. See `.wb-code-skeleton-sweep`.
 *
 * `dark` follows the code editor's own theme, over the same channel the bar
 * above it reads — so the skeleton is never a bright card promising a light
 * editor and then handing over a dark one.
 */
const SKELETON_LINES = [
  62, 38, 84, 46, 0, 71, 52, 90, 34, 0, 58, 76, 43, 67, 0, 49, 81, 36, 60, 73,
]
const SKELETON_INDENT = [
  0, 1, 1, 2, 0, 0, 1, 1, 2, 0, 0, 1, 2, 2, 0, 1, 1, 2, 1, 0,
]

function CodeSkeleton({ dark = false }: { dark?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn("absolute inset-0 overflow-hidden", dark ? "bg-[#0e0e0e]" : "bg-white")}
      /* The sweep is white light over a pale skeleton; over a dark one it has
         to be the same idea in reverse, or it is a white bar crossing a black
         panel. One variable, set here, read by the class. */
      style={dark ? ({ "--wb-sweep": "rgba(255,255,255,0.07)" } as React.CSSProperties) : undefined}
    >
      <div className="flex h-full">
        {/* the file list, which is the first thing the real one shows */}
        <div className={cn("hidden w-44 shrink-0 flex-col gap-2.5 border-r p-3 sm:flex", dark ? "border-white/10" : "border-neutral-100")}>
          <div className={cn("h-3 w-20 rounded-full", dark ? "bg-white/15" : "bg-neutral-200/80")} />
          {[76, 58, 84, 64, 48, 70, 54].map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={cn("h-3.5 w-3.5 shrink-0 rounded", dark ? "bg-white/10" : "bg-neutral-100")} />
              <div className={cn("h-2.5 rounded-full", dark ? "bg-white/10" : "bg-neutral-100")} style={{ width: `${w}%` }} />
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {/* the tab strip */}
          <div className={cn("flex shrink-0 items-center gap-2 border-b px-3 py-2.5", dark ? "border-white/10" : "border-neutral-100")}>
            <div className={cn("h-3 w-24 rounded-full", dark ? "bg-white/15" : "bg-neutral-200/80")} />
            <div className={cn("h-3 w-16 rounded-full", dark ? "bg-white/10" : "bg-neutral-100")} />
          </div>
          {/* and the code, with its gutter */}
          <div className="flex min-h-0 flex-1 gap-3 px-3 py-3">
            <div className="flex w-5 shrink-0 flex-col gap-2.5 pt-0.5">
              {SKELETON_LINES.map((_, i) => (
                <div key={i} className={cn("h-2 w-full rounded-full", dark ? "bg-white/10" : "bg-neutral-100")} />
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-0.5">
              {SKELETON_LINES.map((w, i) =>
                /* a blank line is a blank line: skipping it would make the
                   skeleton denser than any code it stands in for */
                w === 0 ? (
                  <div key={i} className="h-2" />
                ) : (
                  <div
                    key={i}
                    className={cn("h-2 rounded-full", dark ? "bg-white/10" : "bg-neutral-100")}
                    style={{ width: `${w}%`, marginLeft: `${SKELETON_INDENT[i] * 14}px` }}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </div>
      <span className="wb-code-skeleton-sweep" />
    </div>
  )
}

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

  /**
   * THE BAR WEARS THE EDITOR'S THEME.
   *
   * On a phone this bar is the code editor's own top bar, and it is OUTSIDE
   * the frame: it belongs to the builder. So it was `bg-neutral-50` whatever
   * the editor was set to, which put a white bar with a back button on top of
   * a #0e0e0e editor. One seam, across the top of the screen.
   *
   * The page inside the frame owns the setting and its storage, and says so
   * over the same same-origin channel it already uses for the dirty flag.
   * This reads `localStorage` once for the first paint — same origin, same
   * key, so it is the same value the frame is about to report — and then
   * follows what the frame says. Nothing here is a second copy that can
   * drift: the button below asks the frame to change, and the bar only
   * repaints when the frame answers.
   */
  const [codeTheme, setCodeTheme] = useState<"light" | "dark">("light")
  const frameRef = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("wb:code-theme")
      if (saved === "dark" || saved === "light") setCodeTheme(saved)
    } catch {
      /* storage blocked: light is the default, and the frame will say */
    }
  }, [])
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const data = e.data as { type?: string; theme?: string } | null
      if (!data || data.type !== "storelib:code-theme") return
      if (data.theme === "dark" || data.theme === "light") setCodeTheme(data.theme)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])
  const askFrameForTheme = (next: "light" | "dark") => {
    try {
      frameRef.current?.contentWindow?.postMessage(
        { type: "storelib:set-code-theme", theme: next },
        window.location.origin,
      )
    } catch {
      /* the frame has not loaded yet; it reads the same storage on mount */
    }
    // Answered by the frame in a moment, but the press should not wait a
    // round trip to look like it registered.
    setCodeTheme(next)
  }
  const dark = codeTheme === "dark"

  /**
   * WARMED, NOT LOADED ON DEMAND.
   *
   * The code editor is a whole page in a frame: fetching it at the moment
   * somebody presses Code means a second of empty card every time. So it is
   * mounted ahead of being asked for — but NOT with the editor, which would
   * make it compete for bandwidth and main thread with the thing somebody is
   * actually looking at. It waits for the browser to be idle, and falls back
   * to a second and a half where `requestIdleCallback` does not exist.
   *
   * Off on a phone: a frame nobody has asked for is a page load on a mobile
   * connection, and the code opens as its own screen there anyway.
   */
  useEffect(() => {
    if (everShown || fullScreen) return
    const warm = () => setEverShown(true)
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback
    if (ric) {
      const id = ric(warm, { timeout: 4000 })
      return () => (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(warm, 1500)
    return () => window.clearTimeout(id)
  }, [everShown, fullScreen])

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
        /**
         * The editor's own surface, so nothing white shows around a dark
         * panel while it loads or as it slides. This was a flat `bg-white`,
         * which is right for the light editor and is a frame of white behind
         * the dark one on every open.
         */
        "overflow-hidden transition-colors duration-200",
        dark ? "bg-[#0e0e0e]" : "bg-white",
        fullScreen
          ? "fixed inset-0 z-[120] flex flex-col"
          : // `flex flex-col` is not decoration: the iframe's wrapper below is
            // `flex-1`, and in a block container that resolves to nothing, so
            // the iframe fell back to its 150px HTML default and left the card
            // mostly empty on a desktop.
            // The same shape as the preview it covers: turning where it
            // faces the sidebar, with its other three corners cut by the
            // workspace row around the whole builder.
            "absolute inset-0 z-[80] flex flex-col rounded-t-[20px]",
        /**
         * It rises AND settles: a short lift with a touch of scale, on the
         * curve a thrown thing lands on, which reads as the canvas turning
         * over rather than as a panel switched on. Longer than the old 220ms
         * because the distance is small, and a fast small move is what makes
         * a transition look like a flicker.
         */
        /**
         * `translate` and `scale`, NOT `transform`: Tailwind v4 compiles
         * those utilities to the standalone properties of the same names,
         * so this named a property the element never sets and the rise was
         * a cut with a fade over it.
         */
        "transition-[opacity,translate,scale] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
        visible ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-3 scale-[0.995] opacity-0",
      )}
      aria-hidden={!visible}
    >
      {fullScreen && (
        /* Its own bar, because it covers the editor's. Back is the first
           thing on it, and the theme switch is the last: the two ends of a
           bar are where a thumb reaches, and everything between them here is
           a label. */
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 border-b px-2 py-1.5 transition-colors duration-200",
            dark ? "border-white/10 bg-[#151515] text-white" : "border-neutral-200 bg-neutral-50 text-neutral-900",
          )}
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to the editor"
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg px-2 text-[15px] font-medium transition-[background-color,color,scale] duration-150 active:scale-95",
              dark
                ? "text-white/80 hover:bg-white/10 hover:text-white"
                : "text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900",
            )}
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2} />
            Editor
          </button>
          <span
            className={cn(
              "ml-1 flex items-center gap-1.5 text-[15px] font-medium transition-colors duration-200",
              dark ? "text-white/55" : "text-neutral-500",
            )}
          >
            <Code2 className="h-4 w-4" strokeWidth={1.75} />
            Code
          </span>
          {/* Right-aligned, and a 36px target: on a phone this is the only
              way to reach the setting, since the editor's own icon row is
              behind an overflow menu at that width. */}
          <button
            type="button"
            onClick={() => askFrameForTheme(dark ? "light" : "dark")}
            aria-label={dark ? "Switch to the light editor" : "Switch to the dark editor"}
            className={cn(
              "ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,scale] duration-150 active:scale-90",
              dark
                ? "text-white/80 hover:bg-white/10 hover:text-white"
                : "text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900",
            )}
          >
            {dark ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.9} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.9} />}
          </button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {!loaded && <CodeSkeleton dark={dark} />}
        <iframe
          ref={frameRef}
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
