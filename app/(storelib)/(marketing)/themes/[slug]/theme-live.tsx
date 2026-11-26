"use client"

/**
 * ===========================================================================
 *  THE GALLERY: THE TEMPLATE'S REAL WEBSITE, ON A COMPUTER OR ON A PHONE
 * ===========================================================================
 * Marketplace round 24, the owner: "replace the static desktop and phone
 * screenshots with a live preview of the website, with a Desktop / Phone
 * switcher; both frames the same height; loading smooth, the blurred cover
 * first and then the live page fading in, never white; lazy, so the page
 * stays fast".
 *
 * ONE STAGE, ONE HEIGHT. The stage's height is set by CSS from its width
 * (8:5 from 640px, 4:5 on a phone), before anything loads, so nothing on
 * the page moves. Desktop fills it; Phone is a 390 by 844 screen at that
 * same height in its middle. The switch never changes the stage's height.
 *
 * THE PICTURES STAY. The server draws the home page's pictures
 * (scripts/build-theme-seo-images.mjs: the top at 1200 by 750, the phone's
 * first screen) inside each frame: the largest paint, what a crawler reads
 * with its alt text, and what JSON-LD names. Until the website has drawn
 * they are shown blurred (BLUR_PX), so the wait is the template's own
 * colours and never white; the website then fades in over them once
 * (LIVE_FADE_MS), which reads as the picture coming into focus.
 *
 * THE WEBSITE WAITS ITS TURN. The frame (public/theme-previews/<slug>/,
 * sandboxed, noindex) is put in the page only once the page has loaded, the
 * gallery is on screen, and the visitor has moved, scrolled, touched or
 * typed, or LIVE_IDLE_MS have passed: a page measured by a lab tool that
 * does nothing loads its own pictures and stops. Desktop's frame is the
 * website at LIVE_DESKTOP_WIDTH scaled to the stage; Phone's is the website
 * at 390 wide scaled to its screen. Each is made the first time its switch
 * is shown and then kept, so switching back is instant. The website says
 * when its first screen has drawn (storelib:template-preview-drawn, from
 * scripts/build-template-previews.ts); a page that never says so is shown
 * after its load all the same.
 *
 * On a touch screen the frame is not pressed or scrolled (a finger
 * scrolling the page over it would be caught by it); View demo opens the
 * website on its own. With a mouse it scrolls and its links work.
 */
import * as React from "react"

import { templatePreviewFrame } from "@/lib/themes/marketplace-shared"
import { cn } from "@/lib/utils"

type Device = "desktop" | "phone"

export const BLUR_PX = 14
export const LIVE_FADE_MS = 520
/** With nobody moving, the website still comes in this long after the page has loaded. */
export const LIVE_IDLE_MS = 3000
const LIVE_DESKTOP_WIDTH = 1280
const PHONE = { w: 390, h: 844 }
/** A website that loaded and never said it drew is shown after this. */
const DRAWN_GRACE_MS = 1200

export function ThemeLivePreview({
  src,
  name,
  ground,
  desktop,
  phone,
  links,
}: {
  /** The prerendered website's home page, or null (an uploaded template): then the pictures alone, sharp. */
  src: string | null
  name: string
  ground: { desktop: string; phone: string } | null
  /** The server's pictures, drawn inside each frame. */
  desktop: React.ReactNode
  phone: React.ReactNode
  /** The links to the whole page screenshots, beside the switch. */
  links?: React.ReactNode
}) {
  /* null until the browser has said which screen it is on: CSS shows Desktop from 640px and Phone under it until then. */
  const [device, setDevice] = React.useState<Device | null>(null)
  const [made, setMade] = React.useState<Record<Device, boolean>>({ desktop: false, phone: false })
  const [ready, setReady] = React.useState<Record<Device, boolean>>({ desktop: false, phone: false })
  const [go, setGo] = React.useState(false)
  const [stage, setStage] = React.useState<{ w: number; h: number } | null>(null)
  const [touch, setTouch] = React.useState(false)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const frames = React.useRef<Record<Device, HTMLIFrameElement | null>>({ desktop: null, phone: null })
  const live = !!src && (!!desktop || !!phone)

  React.useLayoutEffect(() => {
    setDevice(window.matchMedia?.("(max-width: 639.98px)").matches && phone ? "phone" : desktop ? "desktop" : "phone")
    setTouch(!!window.matchMedia?.("(hover: none)").matches)
  }, [desktop, phone])

  /* The stage's size, for the frames' scale. */
  React.useLayoutEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const measure = () => setStage((s) => (s && s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* When the website may come: loaded, on screen, and somebody here (or a quiet while). */
  React.useEffect(() => {
    if (!live) return
    const el = stageRef.current
    let loaded = document.readyState === "complete"
    let seen = false
    let moved = false
    let idle = 0
    let done = false
    const check = () => {
      if (done || !loaded || !seen || !moved) return
      done = true
      setGo(true)
    }
    const onMove = () => {
      moved = true
      check()
    }
    const events = ["pointermove", "pointerdown", "scroll", "keydown", "touchstart", "wheel"] as const
    events.forEach((e) => window.addEventListener(e, onMove, { passive: true, once: true }))
    const afterLoad = () => {
      loaded = true
      idle = window.setTimeout(onMove, LIVE_IDLE_MS)
      check()
    }
    if (loaded) afterLoad()
    else window.addEventListener("load", afterLoad, { once: true })
    const io =
      el && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            if (entries.some((x) => x.isIntersecting)) {
              seen = true
              check()
            }
          }, { rootMargin: "200px 0px" })
        : null
    if (io && el) io.observe(el)
    else seen = true
    return () => {
      events.forEach((e) => window.removeEventListener(e, onMove))
      window.removeEventListener("load", afterLoad)
      window.clearTimeout(idle)
      io?.disconnect()
    }
  }, [live])

  /* The frame for the screen on show, made once and kept. */
  React.useEffect(() => {
    if (go && device && !made[device]) setMade((m) => ({ ...m, [device]: true }))
  }, [go, device, made])

  /* The website says its first screen has drawn. */
  React.useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const which = (Object.keys(frames.current) as Device[]).find((d) => frames.current[d]?.contentWindow === e.source)
      const type = (e.data as { type?: unknown } | null)?.type
      if (!which || typeof type !== "string") return
      if (type === "storelib:template-preview-drawn") setReady((r) => (r[which] ? r : { ...r, [which]: true }))
      else if (type === "storelib:template-preview") window.setTimeout(() => setReady((r) => (r[which] ? r : { ...r, [which]: true })), DRAWN_GRACE_MS)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const phoneWidth = stage ? Math.round((stage.h * PHONE.w) / PHONE.h) : 0
  const scaleOf = (d: Device) => (!stage ? 1 : d === "desktop" ? Math.min(1, stage.w / LIVE_DESKTOP_WIDTH) : phoneWidth / PHONE.w)
  const frameBox = (d: Device): React.CSSProperties => {
    const s = scaleOf(d)
    const w = d === "desktop" ? Math.max(LIVE_DESKTOP_WIDTH, stage?.w ?? 0) : PHONE.w
    return { width: w, height: stage ? Math.ceil(stage.h / s) : "100%", transform: `scale(${s})`, transformOrigin: "0 0", backgroundColor: ground?.[d] }
  }

  /* Before the browser has said: Desktop from 640px, Phone under it. */
  const shownClass = (d: Device) => (device === null ? (d === "desktop" ? "max-sm:hidden" : "sm:hidden") : device === d ? "" : "hidden")
  const pressedClass = (d: Device) =>
    device === null ? (d === "desktop" ? "sm:bg-white sm:text-[#1a1a2e] sm:shadow-[0_1px_2px_rgba(16,24,40,0.12),0_0_0_1px_rgba(17,24,39,0.06)]" : "max-sm:bg-white max-sm:text-[#1a1a2e] max-sm:shadow-[0_1px_2px_rgba(16,24,40,0.12),0_0_0_1px_rgba(17,24,39,0.06)]") : device === d ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.12),0_0_0_1px_rgba(17,24,39,0.06)]" : ""

  const screen = (d: Device, picture: React.ReactNode) => {
    const isReady = ready[d]
    return (
      <div
        key={d}
        data-theme-live-frame={d}
        className={cn(
          "absolute inset-y-0 overflow-hidden bg-[#eef0f3]",
          d === "desktop" ? "inset-x-0 rounded-xl shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_18px_40px_-24px_rgba(15,23,42,0.35)]" : "left-1/2 aspect-[390/844] -translate-x-1/2 rounded-[22px] shadow-[0_0_0_1px_rgba(17,24,39,0.1),0_16px_32px_-18px_rgba(15,23,42,0.4)]",
          shownClass(d),
        )}
        style={ground ? { backgroundColor: ground[d] } : undefined}
      >
        <div
          data-theme-live-blur={live ? (isReady ? "clear" : "blurred") : "none"}
          className="absolute inset-0 [&>img]:absolute [&>img]:inset-0 [&>img]:h-full [&>img]:w-full [&>img]:object-cover [&>img]:object-top"
          style={live ? { filter: `blur(${BLUR_PX}px) saturate(1.05)`, transform: "scale(1.08)" } : undefined}
        >
          {picture}
        </div>
        {live && made[d] && stage ? (
          <div
            data-theme-live={isReady ? "ready" : "loading"}
            className={cn("absolute inset-0 transition-opacity ease-[cubic-bezier(0.25,0.1,0.25,1)] [will-change:opacity] motion-reduce:transition-none", isReady ? "opacity-100" : "pointer-events-none opacity-0", touch && "pointer-events-none")}
            style={{ transitionDuration: `${LIVE_FADE_MS}ms` }}
            aria-hidden={!isReady || undefined}
          >
            <iframe
              ref={(el) => {
                frames.current[d] = el
              }}
              /* From www.storelib.com on storelib.com: an origin of its own, so its files are kept (templatePreviewFrame). */
              src={templatePreviewFrame(src!).src}
              title={d === "desktop" ? `${name}, live website on a computer` : `${name}, live website on a phone`}
              sandbox={templatePreviewFrame(src!).sandbox}
              referrerPolicy="no-referrer"
              loading="lazy"
              tabIndex={-1}
              data-theme-live-site={d}
              onLoad={() => window.setTimeout(() => setReady((r) => (r[d] ? r : { ...r, [d]: true })), DRAWN_GRACE_MS)}
              className="absolute left-0 top-0 block border-0"
              style={frameBox(d)}
            />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div data-theme-live-preview={live ? "live" : "pictures"}>
      {live ? (
        <noscript>
          <style>{`[data-theme-live-blur]{filter:none!important;transform:none!important}`}</style>
        </noscript>
      ) : null}
      <div ref={stageRef} data-theme-live-stage="" className="relative aspect-[4/5] w-full sm:aspect-[8/5]">
        {desktop ? screen("desktop", desktop) : null}
        {phone ? screen("phone", phone) : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        {desktop && phone ? (
          <div role="group" aria-label="Show the website on" className="inline-flex rounded-[10px] bg-[#f1f2f4] p-1" data-theme-live-switch="">
            {(["desktop", "phone"] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={device === null ? undefined : device === d}
                onClick={() => setDevice(d)}
                data-theme-live-device={d}
                className={cn(
                  "inline-flex h-9 items-center rounded-[7px] px-4 text-[14px] font-semibold text-[#6b7280] outline-none transition-[background-color,color,box-shadow] duration-150 hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25",
                  pressedClass(d),
                )}
              >
                {d === "desktop" ? "Desktop" : "Phone"}
              </button>
            ))}
          </div>
        ) : null}
        {links}
      </div>
    </div>
  )
}
