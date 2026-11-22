"use client"

/**
 * ===========================================================================
 *  A TEMPLATE'S PREVIEW, OVER THE MARKETPLACE OR THE PAGE
 * ===========================================================================
 * Preview on a template card used to open the theme's page in a new tab.
 * Now it opens here, over whatever the creator was looking at: a top bar
 * with Back, the template's name, a desktop and phone switch, the same Add
 * button the card has, and a close button; under it the template's home
 * page, whole, scrolling.
 *
 * THE TEMPLATE'S REAL WEBSITE. A code template's pages are prerendered to
 * static files (scripts/build-template-previews.ts, public/theme-previews/
 * <slug>/) and framed here (LiveSite below): home, products, collections,
 * about and the rest, browsable, at the desktop width or in a 390px phone
 * frame, its own responsive layout either way. Rendering it per request
 * would mount a storefront for one look; these are files the CDN serves.
 *
 * ITS PICTURES ARE THERE FIRST. The template's full page screenshots
 * (public/themes/materia/<template>.webp at desktop width, <template>-phone
 * .webp at a phone's) are drawn at once, each at the width it was taken at,
 * and the website fades in over them when it has drawn. A listing with no
 * prerendered website (an uploaded theme) keeps the pictures: the switch is
 * a crossfade between two pictures that are already there, each keeping its
 * own scroll. A listing with no phone picture has no switch.
 *
 * ON A COMPUTER it is a large window over the marketplace (or the page),
 * arriving with a fade and a slight rise. ON A PHONE it is a page that
 * slides in from the right over the marketplace, inside the safe areas,
 * with the same bar made compact. The Website page pushes a history entry
 * when it opens (website-builder-client.tsx), so the system's back and
 * Back both land on the grid under it; the close button goes back over the
 * marketplace's entry too.
 *
 * MOTION IS TRANSFORM AND OPACITY ONLY, 200 to 280ms; with reduced motion
 * there is none. The focus goes into the window, stays there, and returns
 * to the cover that opened it.
 */
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ChevronLeft, Monitor, Smartphone, X } from "lucide-react"

import { SCRIM } from "@/components/ui/scrim"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { TemplateAction, type TemplateCardState } from "@/components/website-builder/theme-template-card"
import { templatePreviewPath, type ThemeListing } from "@/lib/themes/marketplace-shared"

/** In the address while a preview is open: &preview=slug, one history entry over the grid or the page. */
export const PREVIEW_PARAM = "preview"

/** How long the preview takes to arrive and to leave. scripts/check-theme-popup.mjs reads these off the page. */
export const PREVIEW_IN_MS = 260
export const PREVIEW_OUT_MS = 200
export const PREVIEW_PUSH_MS = 280
export const PREVIEW_POP_MS = 240
/** The switch between desktop and phone: one picture fades out as the other fades in. */
export const PREVIEW_SWAP_MS = 240

const MOTION = `
@keyframes wb-preview-in { from { opacity: 0; transform: translate3d(0, 12px, 0) scale(0.985); } to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } }
@keyframes wb-preview-out { from { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } to { opacity: 0; transform: translate3d(0, 8px, 0) scale(0.99); } }
@keyframes wb-preview-push { from { transform: translate3d(100%, 0, 0); } to { transform: translate3d(0, 0, 0); } }
@keyframes wb-preview-pop { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(100%, 0, 0); } }
@keyframes wb-preview-dim { from { opacity: 0; } to { opacity: 1; } }
@keyframes wb-preview-undim { from { opacity: 1; } to { opacity: 0; } }
[data-preview-scrim][data-state="open"] { animation: wb-preview-dim ${PREVIEW_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both; }
[data-preview-scrim][data-state="closed"] { animation: wb-preview-undim ${PREVIEW_OUT_MS}ms cubic-bezier(0.4, 0, 1, 1) both; }
[data-theme-preview][data-state="open"] { animation: wb-preview-in ${PREVIEW_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both; }
[data-theme-preview][data-state="closed"] { animation: wb-preview-out ${PREVIEW_OUT_MS}ms cubic-bezier(0.4, 0, 1, 1) both; }
@media (max-width: 767.98px) {
  [data-theme-preview][data-state="open"] { animation: wb-preview-push ${PREVIEW_PUSH_MS}ms cubic-bezier(0.32, 0.72, 0, 1) both; }
  [data-theme-preview][data-state="closed"] { animation: wb-preview-pop ${PREVIEW_POP_MS}ms cubic-bezier(0.4, 0, 0.9, 0.6) both; }
}
@media (prefers-reduced-motion: reduce) {
  [data-preview-scrim][data-state], [data-theme-preview][data-state] { animation: none; }
}
`

export type PreviewDevice = "desktop" | "phone"

const PHONE_SHOT = /-phone\.(?:webp|png|jpe?g|avif)(?:[?#].*)?$/i

/** The template's home page at a computer's width and at a phone's, as far as its pictures go. */
export function previewShots(l: Pick<ThemeListing, "cover" | "screenshots">): { desktop: string | null; phone: string | null } {
  return {
    desktop: l.screenshots.find((s) => !PHONE_SHOT.test(s)) ?? l.cover ?? null,
    phone: l.screenshots.find((s) => PHONE_SHOT.test(s)) ?? null,
  }
}

const phoneScreen = () => typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 767.98px)").matches

const ICON_BUTTON =
  "inline-flex shrink-0 items-center justify-center rounded-full text-[#4b5563] outline-none transition-colors duration-150 pointer-fine:hover:bg-[#f1f2f4] pointer-fine:hover:text-[#1a1a2e] active:bg-[#e9ebee] pointer-fine:active:bg-[#e9ebee] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 [-webkit-tap-highlight-color:transparent]"

export interface ThemePreviewProps {
  /** The template on show; null closes it. */
  listing: ThemeListing | null
  state: TemplateCardState
  waiting?: boolean
  viewHref?: string | null
  onAdd: (listing: ThemeListing) => void
  /** Back, Escape, the system's back and a press on the dim: to the grid under it. */
  onBack: () => void
  /** The close button: the preview and the marketplace under it. */
  onClose: () => void
  /** What takes the focus back when it closes: the cover that opened it. */
  returnFocus?: () => HTMLElement | null
}

export function ThemePreview({ listing, state, waiting = false, viewHref = null, onAdd, onBack, onClose, returnFocus }: ThemePreviewProps) {
  /* The template stays drawn while the window leaves. */
  const [kept, setKept] = React.useState<ThemeListing | null>(listing)
  if (listing && listing !== kept) setKept(listing)
  /* Each time a template opens, the switch starts on the screen the creator is holding. */
  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const [device, setDevice] = React.useState<PreviewDevice>("desktop")
  if ((listing?.slug ?? null) !== openedFor) {
    setOpenedFor(listing?.slug ?? null)
    if (listing) setDevice(phoneScreen() && previewShots(listing).phone ? "phone" : "desktop")
  }
  const panel = React.useRef<HTMLDivElement>(null)
  const scrim = React.useRef<HTMLDivElement>(null)

  const shown = listing ?? kept
  const shots = shown ? previewShots(shown) : { desktop: null, phone: null }
  const canSwitch = !!shots.desktop && !!shots.phone
  const on: PreviewDevice = canSwitch ? device : shots.desktop ? "desktop" : "phone"
  /* The template's real website, prerendered (scripts/build-template-previews.ts); its pictures stay under it until it has drawn. */
  const live = shown ? templatePreviewPath(shown) : null
  const [liveReady, setLiveReady] = React.useState<string | null>(null)
  const liveShown = !!live && liveReady === live

  return (
    <>
      <style href="wb-preview-motion" precedence="default">{MOTION}</style>
      <DialogPrimitive.Root open={!!listing} onOpenChange={(next) => !next && onBack()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay ref={scrim} data-preview-scrim="" className={cn("fixed inset-0 z-50 max-md:hidden", SCRIM)} />
          <DialogPrimitive.Content
            ref={panel}
            data-theme-preview=""
            data-device={on}
            aria-describedby={undefined}
            tabIndex={-1}
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              panel.current?.focus({ preventScroll: true })
            }}
            onCloseAutoFocus={(e) => {
              const back = returnFocus?.()
              if (!back || !back.isConnected) return
              e.preventDefault()
              back.focus({ preventScroll: true })
            }}
            /* Only a press on the dim goes back; the full library sheet and a toast are drawn outside this window. */
            onPointerDownOutside={(e) => {
              if (e.target !== scrim.current) e.preventDefault()
            }}
            onInteractOutside={(e) => {
              if (e.target !== scrim.current) e.preventDefault()
            }}
            className={cn(
              "fixed z-50 flex flex-col overflow-hidden bg-white outline-none [will-change:transform,opacity]",
              "max-md:inset-0",
              "md:inset-0 md:m-auto md:h-[calc(100dvh-48px)] md:w-[min(1392px,calc(100vw-48px))] md:rounded-2xl md:shadow-[0_0_0_1px_rgba(17,24,39,0.06),0_24px_64px_-24px_rgba(17,24,39,0.5),0_4px_12px_rgba(17,24,39,0.08)]",
            )}
          >
            {/* ── Back, the name, the switch, Add, close ─────────────────── */}
            <header
              data-preview-bar=""
              className="shrink-0 border-b border-[#e5e7eb]/80 bg-white pl-[max(4px,env(safe-area-inset-left))] pr-[max(4px,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] md:px-3"
            >
              <div className="relative flex h-14 items-center gap-1.5 md:h-16 md:gap-3">
                <button
                  type="button"
                  data-preview-back=""
                  aria-label={tt("Back")}
                  onClick={onBack}
                  className={cn(ICON_BUTTON, "h-11 w-11 md:h-9 md:w-auto md:gap-1 md:pl-1.5 md:pr-3 md:text-[14px] md:font-semibold md:text-[#1a1a2e]")}
                >
                  <ChevronLeft className="h-[22px] w-[22px] md:h-[18px] md:w-[18px]" strokeWidth={2.25} />
                  <span className="max-md:hidden">{tt("Back")}</span>
                </button>
                <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-[#1a1a2e] md:text-[16px]">
                  {shown?.name}
                </DialogPrimitive.Title>

                {canSwitch ? (
                  <div
                    role="group"
                    aria-label={tt("Preview size")}
                    data-preview-switch=""
                    className="relative inline-flex shrink-0 items-center rounded-full bg-[#f1f2f4] p-[3px] md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2"
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] w-9 rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.1),0_1px_4px_rgba(16,24,40,0.06)] transition-transform duration-[220ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none md:w-10"
                      style={{ transform: on === "phone" ? "translate3d(100%, 0, 0)" : "translate3d(0, 0, 0)" }}
                    />
                    {(["desktop", "phone"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on === d}
                        aria-label={d === "desktop" ? tt("Desktop") : tt("Phone")}
                        data-preview-device={d}
                        onClick={() => setDevice(d)}
                        className={cn(
                          "relative z-[1] inline-flex h-9 w-9 items-center justify-center rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 md:h-8 md:w-10 [-webkit-tap-highlight-color:transparent]",
                          on === d ? "text-[#1a1a2e]" : "text-[#6b7280] pointer-fine:hover:text-[#1a1a2e]",
                        )}
                      >
                        {d === "desktop" ? <Monitor className="h-[17px] w-[17px]" strokeWidth={2} /> : <Smartphone className="h-[17px] w-[17px]" strokeWidth={2} />}
                      </button>
                    ))}
                  </div>
                ) : null}

                {shown ? (
                  <TemplateAction
                    state={state}
                    viewHref={viewHref}
                    waiting={waiting}
                    onAdd={() => onAdd(shown)}
                    long="md"
                    className="h-9 px-3.5 text-[13.5px] md:h-10 md:px-4 md:text-[14px]"
                  />
                ) : null}
                <button type="button" data-preview-close="" aria-label={tt("Close")} onClick={onClose} className={cn(ICON_BUTTON, "h-11 w-11 md:h-9 md:w-9")}>
                  <X className="h-5 w-5 md:h-[18px] md:w-[18px]" strokeWidth={2} />
                </button>
              </div>
            </header>

            {/* ── The home page, at the width it was taken at ───────────── */}
            <div data-preview-stage="" className="relative min-h-0 flex-1 bg-[#eef0f3]">
              {shown
                ? (["desktop", "phone"] as const).map((d) => {
                    const src = shots[d]
                    if (!src) return null
                    const active = on === d
                    return (
                      <div
                        key={`${shown.slug}-${d}`}
                        data-preview-layer={d}
                        aria-hidden={!active || liveShown || undefined}
                        inert={!active || liveShown}
                        className={cn(
                          "absolute inset-0 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] transition-opacity ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none md:pb-0",
                          active ? "opacity-100" : "pointer-events-none opacity-0",
                        )}
                        style={{ transitionDuration: `${PREVIEW_SWAP_MS}ms` }}
                      >
                        <div className={cn("mx-auto w-full", d === "desktop" ? "max-w-[1200px] md:max-w-[1248px] md:p-6" : "max-w-[390px] md:py-6")}>
                          <PreviewShot src={src} device={d} name={shown.name} eager={active} />
                        </div>
                      </div>
                    )
                  })
                : null}
              {shown && live ? <LiveSite key={live} src={live} device={on} name={shown.name} ready={liveShown} onReady={setLiveReady} /> : null}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}

/** One full page picture, faded in once it has arrived, on a frame that holds a screen's room until then. */
function PreviewShot({ src, device, name, eager }: { src: string; device: PreviewDevice; name: string; eager: boolean }) {
  const [ready, setReady] = React.useState(false)
  return (
    <div
      data-preview-frame={device}
      className={cn(
        "relative overflow-hidden bg-white",
        device === "desktop" ? "md:rounded-xl md:shadow-[0_0_0_1px_rgba(17,24,39,0.06),0_12px_32px_-18px_rgba(17,24,39,0.3)]" : "md:rounded-[22px] md:shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_16px_40px_-20px_rgba(17,24,39,0.35)]",
        !ready && "min-h-[70dvh]",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={tt("{name}, home page", { name })}
        decoding="async"
        loading="eager"
        fetchPriority={eager ? "high" : "low"}
        draggable={false}
        data-preview-shot={device}
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0) setReady(true)
        }}
        onLoad={() => setReady(true)}
        className={cn("block h-auto w-full select-none transition-opacity duration-200 motion-reduce:transition-none", ready ? "opacity-100" : "opacity-0")}
      />
    </div>
  )
}

/** Narrower than this (a phone or a small tablet holding Desktop), the desktop website is drawn at LIVE_DESKTOP_WIDTH and scaled down to the stage. */
const LIVE_DESKTOP_MIN = 1024
const LIVE_DESKTOP_WIDTH = 1280

const LIVE_MOTION = `
@keyframes wb-live-load { from { transform: translate3d(-100%, 0, 0); } to { transform: translate3d(300%, 0, 0); } }
`

/**
 * THE TEMPLATE'S REAL WEBSITE, in a frame over its pictures. Static files
 * (public/theme-previews/<slug>/, scripts/build-template-previews.ts): every
 * page a visitor can reach, its links between them, nothing that buys,
 * signs in or posts. The frame runs scripts and nothing else; it is not
 * this origin, so it can read nothing of Storelib's.
 *
 * The pictures under it are there at once; the frame fades in over them
 * when its first page says it has drawn (a message from the page's shim).
 * A frame that never says so (offline, a file not built) leaves the
 * pictures. Desktop is the stage's whole width, the website's own desktop
 * layout; Phone is a 390px frame on a computer and the whole screen on a
 * phone, the website's own phone layout. A switch
 * reflows the same page in place and fades it back in, so a visitor keeps
 * the page they had browsed to.
 */
function LiveSite({ src, device, name, ready, onReady }: { src: string; device: PreviewDevice; name: string; ready: boolean; onReady: (src: string) => void }) {
  const frame = React.useRef<HTMLIFrameElement>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const [stage, setStage] = React.useState<{ w: number; h: number } | null>(null)

  React.useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const data = e.data as { type?: unknown } | null
      if (data && data.type === "storelib:template-preview") onReady(src)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [src, onReady])

  React.useLayoutEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* The switch: the page reflows to its new width, then fades back in, instead of jumping. */
  const lastDevice = React.useRef(device)
  React.useEffect(() => {
    if (lastDevice.current === device) return
    lastDevice.current = device
    const el = frame.current
    if (!el || !ready || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: PREVIEW_SWAP_MS, easing: "cubic-bezier(0.33, 1, 0.68, 1)" })
  }, [device, ready])

  /* Desktop on a narrow screen: the desktop layout, scaled to fit. */
  const scale = device === "desktop" && stage && stage.w > 0 && stage.w < LIVE_DESKTOP_MIN ? stage.w / LIVE_DESKTOP_WIDTH : 1
  const frameStyle: React.CSSProperties =
    scale < 1 && stage ? { width: LIVE_DESKTOP_WIDTH, height: Math.ceil(stage.h / scale), transform: `scale(${scale})`, transformOrigin: "0 0" } : {}

  return (
    <>
      <style href="wb-preview-live" precedence="default">{LIVE_MOTION}</style>
      {/* Until the website has drawn: a thin line moving along the top of its pictures. */}
      <div
        aria-hidden
        data-preview-live-loading=""
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-[2] h-[2px] overflow-hidden transition-opacity duration-200 motion-reduce:transition-none",
          ready ? "opacity-0" : "opacity-100",
        )}
      >
        <div className="h-full w-1/3 bg-[#1a1a2e]/30 [animation:wb-live-load_1.1s_cubic-bezier(0.45,0,0.55,1)_infinite] motion-reduce:[animation:none]" />
      </div>
      <div
        data-preview-live={ready ? "ready" : "loading"}
        aria-hidden={!ready || undefined}
        inert={!ready}
        className={cn(
          "absolute inset-0 z-[1] bg-[#eef0f3] transition-opacity ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none",
          ready ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        style={{ transitionDuration: `${PREVIEW_SWAP_MS}ms` }}
      >
        <div
          className={cn(
            "absolute inset-0 flex justify-center pb-[env(safe-area-inset-bottom)] md:pb-0",
            device === "phone" && "md:py-6",
          )}
        >
          <div
            ref={stageRef}
            data-preview-live-frame={device}
            className={cn(
              "relative h-full w-full overflow-hidden bg-white",
              device === "phone" && "md:max-w-[390px] md:rounded-[22px] md:shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_16px_40px_-20px_rgba(17,24,39,0.35)]",
            )}
          >
            <iframe
              ref={frame}
              src={src}
              title={tt("{name}, live website", { name })}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              loading="eager"
              data-preview-live-site=""
              className="block h-full w-full border-0 bg-white"
              style={frameStyle}
            />
          </div>
        </div>
      </div>
    </>
  )
}
