"use client"

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowLeft, Code2, Globe, Moon, Settings, Sun } from "lucide-react"

import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

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
 * and "Website Settings" is not the width of "Code", so a fraction of the
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
      {seg("preview", tt("Preview"), Globe)}
      {seg("code", tt("Code"), Code2)}
      {seg("settings", tt("Website Settings"), Settings)}
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
  codeFilePath,
  codeFileAt,
}: {
  installId: string
  visible: boolean
  fullScreen?: boolean
  onClose?: () => void
  /**
   * Open straight onto this file. Set when the assistant has just written a
   * section and somebody pressed "Open it": landing on the tree with the file
   * somewhere in it is not opening it.
   */
  codeFilePath?: string | null
  /** Where in it (a section's template top or its schema), counted so the same file asked for again is opened again. */
  codeFileAt?: { at: "top" | "schema"; n: number }
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
  /** Read inside `sendChrome`, which can be called from a listener that was
   *  set up before the bar's own state changed. */
  const fullScreenRef = useRef(fullScreen)
  const sendChrome = useCallback(() => {
    try {
      frameRef.current?.contentWindow?.postMessage(
        { type: "storelib:code-chrome", themeToggle: fullScreenRef.current },
        window.location.origin,
      )
    } catch {
      /* a frame that has not settled yet is told again when it announces */
    }
  }, [])
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const data = e.data as { type?: string; theme?: string } | null
      if (!data || data.type !== "storelib:code-theme") return
      if (data.theme === "dark" || data.theme === "light") setCodeTheme(data.theme)
      /**
       * The page inside announces its theme as it mounts, which is the one
       * moment it is certainly listening. Answering here rather than only on
       * the iframe's load event means a reload is told again without anyone
       * tracking it, and so is a file asked for while it was loading.
       */
      sendChrome()
      sendOpen()
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [sendChrome])
  /**
   * A FILE ASKED FOR AFTER THE FRAME LOADED IS OPENED INSIDE IT. The frame's
   * address is fixed the first time it is drawn, warmed in idle time with
   * whatever file was wanted then; a section's Edit code later tells the
   * page inside which file to open and where, and it opens it in place
   * (the code page's storelib:open-file), so a warm pane is never loaded
   * again from nothing for a new file.
   */
  const latestOpen = useRef({ path: codeFilePath ?? null, at: codeFileAt?.at ?? "top", n: codeFileAt?.n ?? 0 })
  latestOpen.current = { path: codeFilePath ?? null, at: codeFileAt?.at ?? "top", n: codeFileAt?.n ?? 0 }
  const srcRef = useRef<string | null>(null)
  const srcAsk = useRef(0)
  const sendOpen = useCallback(() => {
    const ask = latestOpen.current
    if (!ask.path || ask.n <= srcAsk.current) return
    try {
      frameRef.current?.contentWindow?.postMessage({ type: "storelib:open-file", path: ask.path, at: ask.at, n: ask.n }, window.location.origin)
    } catch {
      /* not loaded yet: it is told when it announces itself */
    }
  }, [])
  useEffect(() => {
    if (loaded) sendOpen()
  }, [loaded, codeFilePath, codeFileAt?.n, sendOpen])

  /**
   * WHAT THIS BAR IS ALREADY SHOWING, so the page inside does not show it
   * again. The framed editor has a light-and-dark switch of its own; on a
   * phone this bar carries one too, and both were on screen together. Told
   * on every load and whenever the bar appears or goes away.
   */
  useEffect(() => {
    fullScreenRef.current = fullScreen
    if (loaded) sendChrome()
  }, [loaded, fullScreen, sendChrome])

  /**
   * ===========================================================================
   *  WHAT THE CODE EDITOR LEAVES BEHIND WHEN IT CLOSES
   * ===========================================================================
   * The editor is an iframe with a text field in it, and on a phone that
   * field has the keyboard up. Closing this pane hides the frame; it does not
   * blur what is focused inside it. iOS then keeps the keyboard's scroll
   * offset on the WKWebView's own scroll view, over a builder whose document
   * is locked to the viewport and cannot scroll it back — so the canvas is
   * displaced, every touch lands somewhere other than where it looks, and the
   * preview reads as frozen.
   *
   * Blurring the field inside the frame and the one out here, then putting
   * the window back to the top, is what ends that state. Same origin, so the
   * frame's document is reachable; wrapped anyway, because a frame that has
   * not loaded has no document at all.
   */
  useEffect(() => {
    if (visible) return
    const settle = () => {
      try {
        const inner = frameRef.current?.contentDocument?.activeElement as HTMLElement | null
        inner?.blur?.()
      } catch {
        /* a frame that is not there yet has nothing focused in it */
      }
      const outer = document.activeElement as HTMLElement | null
      if (outer && outer !== document.body) outer.blur?.()
      if (window.scrollY !== 0) window.scrollTo(0, 0)
    }
    settle()
    // And again after the close animation, for a keyboard that was still on
    // its way down when the first one ran.
    const t = window.setTimeout(settle, 320)
    return () => window.clearTimeout(t)
  }, [visible])

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

  /**
   * ===========================================================================
   *  HIDDEN MEANS HIDDEN, NOT TRANSPARENT
   * ===========================================================================
   * When the pane closes it stays mounted, so the code editor inside keeps
   * its file, its cursor and its unsaved edits. It used to stay as a
   * full-screen, fixed, `opacity: 0` layer with `pointer-events: none` over
   * the whole editor, and on a phone that layer holds an IFRAME with a
   * scrolling document of its own. The DOM ignores a transparent layer with
   * pointer events off; the phone's native gesture routing does not have to,
   * and "come back from the code editor and the preview will not scroll" is
   * what a full-screen invisible frame sitting over the canvas looks like.
   *
   * So once the fade has finished, the pane is `visibility: hidden` as well.
   * A hidden layer is out of hit-testing on every engine. On opening it is
   * made visible first, in the same frame, so the fade-in still plays.
   */
  const [hidden, setHidden] = useState(!visible)
  useEffect(() => {
    if (visible) {
      setHidden(false)
      return
    }
    const t = window.setTimeout(() => setHidden(true), 320)
    return () => window.clearTimeout(t)
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
        hidden && !visible && "invisible",
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
            aria-label={tt("Back to the editor")}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg px-2 text-[15px] font-medium transition-[background-color,color,scale] duration-150 active:scale-95",
              dark
                ? "text-white/80 hover:bg-white/10 hover:text-white"
                : "text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900",
            )}
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2} />
            {tt("Editor")}
          </button>
          <span
            className={cn(
              "ml-1 flex items-center gap-1.5 text-[15px] font-medium transition-colors duration-200",
              dark ? "text-white/55" : "text-neutral-500",
            )}
          >
            <Code2 className="h-4 w-4" strokeWidth={1.75} />
            {tt("Code")}
          </span>
          {/* Right-aligned, and a 36px target: on a phone this is the only
              way to reach the setting, since the editor's own icon row is
              behind an overflow menu at that width. */}
          <button
            type="button"
            onClick={() => askFrameForTheme(dark ? "light" : "dark")}
            aria-label={dark ? tt("Switch to the light editor") : tt("Switch to the dark editor")}
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
      {/**
        * NOTHING STANDS IN FOR IT WHILE IT LOADS.
        *
        * There was a spinner, then a skeleton of the editor, then the spinner
        * again. All three were answering a question nobody asked: the pane
        * already arrives with an animation of its own — it rises, settles and
        * fades in on the curve below — and the iframe fades in over the
        * pane's own surface the moment it is ready.
        *
        * So the wait is the opening, and nothing else. An empty surface for a
        * beat reads as the thing arriving; a spinner on it reads as the thing
        * being late, and a skeleton reads as a second interface you have to
        * look at and then un-look at.
        */}
      <div className="relative min-h-0 flex-1">
        <iframe
          ref={frameRef}
          title={tt("Code editor")}
          src={(() => {
            if (srcRef.current === null) {
              srcRef.current = `/website-builder/code/${installId}?embedded=1${codeFilePath ? `&path=${encodeURIComponent(codeFilePath)}${codeFileAt?.at === "schema" ? "&at=schema" : ""}` : ""}`
              srcAsk.current = codeFileAt?.n ?? 0
            }
            return srcRef.current
          })()}
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
