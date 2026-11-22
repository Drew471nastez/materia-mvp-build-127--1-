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
 * THE WEBSITE, AND NOTHING BEFORE IT (templates round 21, the owner: "it
 * first shows the picture, then swaps to the live website"). The frame is
 * asked for on the press that opens the window. Until the website says it
 * has drawn, the stage is the frame's own white on the quiet grey, with a
 * faint line along its top only if the wait passes half a second; then the
 * website fades in, once. No screenshot is drawn under it, so nothing is
 * swapped. A listing with no prerendered website (an uploaded theme), or one
 * whose website does not answer, shows its full page screenshots instead
 * (public/themes/materia/<template>.webp and -phone.webp): the switch is a
 * crossfade between two pictures that are already there.
 *
 * ON A COMPUTER it is a large window over the marketplace (or the page),
 * arriving with a fade and a slight rise. ON A PHONE it is the whole screen,
 * inside the safe areas, with the same bar made compact; it fades in and
 * grows the last few percent out of the card that was pressed, and goes
 * back into it the same way. (It used to slide in from the right, which on
 * a phone reads as going somewhere, and it was a preview of where you are.)
 * The Website page pushes a history entry when it opens (website-builder-
 * client.tsx), so the system's back and Back both land on the grid under
 * it; the close button goes back over the marketplace's entry too.
 *
 * MOTION IS TRANSFORM AND OPACITY ONLY, 200 to 280ms, on the compositor;
 * with reduced motion there is none. The focus goes into the window, stays
 * there, and returns to the cover that opened it.
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
/** On a phone: a fade and the last few percent of its size, out of the card and back into it. */
export const PREVIEW_RISE_MS = 240
export const PREVIEW_SINK_MS = 200
/** The switch between desktop and phone pictures, and the website settling into its new width. */
export const PREVIEW_SWAP_MS = 240
/** The website fading in once it has drawn. */
export const PREVIEW_LIVE_FADE_MS = 220
/** Before this, a wait for the website shows nothing at all; after it, a faint line. */
export const PREVIEW_QUIET_MS = 500

const MOTION = `
@keyframes wb-preview-in { from { opacity: 0; transform: translate3d(0, 12px, 0) scale(0.985); } to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } }
@keyframes wb-preview-out { from { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } to { opacity: 0; transform: translate3d(0, 8px, 0) scale(0.99); } }
@keyframes wb-preview-rise { from { opacity: 0; transform: translate3d(0, 0, 0) scale(0.94); } to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } }
@keyframes wb-preview-sink { from { opacity: 1; transform: translate3d(0, 0, 0) scale(1); } to { opacity: 0; transform: translate3d(0, 0, 0) scale(0.96); } }
@keyframes wb-preview-dim { from { opacity: 0; } to { opacity: 1; } }
@keyframes wb-preview-undim { from { opacity: 1; } to { opacity: 0; } }
@keyframes wb-preview-wait { from { opacity: 0; } to { opacity: 1; } }
@keyframes wb-live-load { from { transform: translate3d(-100%, 0, 0); } to { transform: translate3d(300%, 0, 0); } }
[data-preview-scrim][data-state="open"] { animation: wb-preview-dim ${PREVIEW_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both; }
[data-preview-scrim][data-state="closed"] { animation: wb-preview-undim ${PREVIEW_OUT_MS}ms cubic-bezier(0.4, 0, 1, 1) both; }
[data-theme-preview][data-state="open"] { animation: wb-preview-in ${PREVIEW_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both; }
[data-theme-preview][data-state="closed"] { animation: wb-preview-out ${PREVIEW_OUT_MS}ms cubic-bezier(0.4, 0, 1, 1) both; }
[data-preview-live-loading] { animation: wb-preview-wait 200ms ease-out ${PREVIEW_QUIET_MS}ms both; }
@media (max-width: 767.98px) {
  [data-theme-preview][data-state="open"] { animation: wb-preview-rise ${PREVIEW_RISE_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both; }
  [data-theme-preview][data-state="closed"] { animation: wb-preview-sink ${PREVIEW_SINK_MS}ms cubic-bezier(0.4, 0, 1, 1) both; }
}
@media (prefers-reduced-motion: reduce) {
  [data-preview-scrim][data-state], [data-theme-preview][data-state] { animation: none; }
  [data-preview-live-loading], [data-preview-live-loading] > * { animation: none; }
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

/*
  OUT OF THE CARD. The window grows from the cover that was pressed: its
  transform origin is that cover's middle, in the window's own box. The box
  is known without asking the page to lay anything out: on a phone it is the
  screen; on a computer it is centred, min(1392px, 100vw - 48px) wide and
  24px from the top (the classes below). The cover is measured on the press,
  before the window is in the page, when the layout is the one on screen.
*/
function originFrom(opener: HTMLElement | null): string | undefined {
  const r = opener?.getBoundingClientRect()
  if (!r || r.width === 0) return undefined
  const vw = window.innerWidth
  const vh = window.innerHeight
  const phone = phoneScreen()
  const w = phone ? vw : Math.min(1392, vw - 48)
  const h = phone ? vh : vh - 48
  const left = phone ? 0 : (vw - w) / 2
  const top = phone ? 0 : 24
  const x = Math.max(0, Math.min(w, r.left + r.width / 2 - left))
  const y = Math.max(0, Math.min(h, r.top + r.height / 2 - top))
  return `${Math.round(x)}px ${Math.round(y)}px`
}

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
  const shown = listing ?? kept
  const shots = shown ? previewShots(shown) : { desktop: null, phone: null }
  /* The template's real website, prerendered (scripts/build-template-previews.ts). One that did not answer is left for its pictures. */
  const path = shown ? templatePreviewPath(shown) : null
  const missing = React.useSyncExternalStore(subscribeMissing, () => (path ? MISSING.has(path) : false), () => false)
  const live = path && !missing ? path : null
  /* The website has both layouts; pictures need both pictures for a switch. */
  const canSwitch = !!live || (!!shots.desktop && !!shots.phone)

  /* Each time a template opens, the switch starts on the screen the creator is holding. */
  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const [device, setDevice] = React.useState<PreviewDevice>("desktop")
  /* Where the window grows from: the middle of the cover that was pressed, read before anything of the window is in the page. */
  const [origin, setOrigin] = React.useState<string | undefined>(undefined)
  if ((listing?.slug ?? null) !== openedFor) {
    setOpenedFor(listing?.slug ?? null)
    if (listing) {
      setDevice(phoneScreen() && (!!templatePreviewPath(listing) || !!previewShots(listing).phone) ? "phone" : "desktop")
      setOrigin(originFrom(returnFocus?.() ?? null))
    }
  }
  const panel = React.useRef<HTMLDivElement | null>(null)
  const scrim = React.useRef<HTMLDivElement>(null)
  /* When this window was put up: a website that draws while it is still arriving needs no fade of its own. */
  const openedAt = React.useRef(0)

  const on: PreviewDevice = canSwitch ? device : shots.desktop || live ? "desktop" : "phone"

  const placed = React.useRef<HTMLDivElement | null>(null)
  const placePanel = React.useCallback((el: HTMLDivElement | null) => {
    panel.current = el
    /* Once per window: a new render hands the same element in again, and that is not an arrival. */
    if (!el || el === placed.current) return
    placed.current = el
    openedAt.current = performance.now()
  }, [])

  return (
    <>
      <style href="wb-preview-motion" precedence="default">{MOTION}</style>
      <DialogPrimitive.Root open={!!listing} onOpenChange={(next) => !next && onBack()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay ref={scrim} data-preview-scrim="" className={cn("fixed inset-0 z-50 max-md:hidden", SCRIM)} />
          <DialogPrimitive.Content
            ref={placePanel}
            data-theme-preview=""
            data-device={on}
            aria-describedby={undefined}
            tabIndex={-1}
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              /*
                The window takes the focus on the frame after its first: a
                focus here makes the browser work out every style on the page
                at once, in the middle of the press (64ms at a quarter speed,
                measured), and that frame is the window's first.
              */
              const el = panel.current
              requestAnimationFrame(() => {
                if (el?.isConnected && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
              })
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
            style={{ transformOrigin: origin }}
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

            {/* ── The website, or the home page's pictures when there is none ── */}
            <div data-preview-stage="" className="relative min-h-0 flex-1 bg-[#eef0f3]">
              {shown && live ? (
                <LiveSite key={live} src={live} device={on} name={shown.name} openedAt={openedAt} />
              ) : shown ? (
                (["desktop", "phone"] as const).map((d) => {
                  const src = shots[d]
                  if (!src) return null
                  const active = on === d
                  return (
                    <div
                      key={`${shown.slug}-${d}`}
                      data-preview-layer={d}
                      aria-hidden={!active || undefined}
                      inert={!active}
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
              ) : null}
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

/*
  A WEBSITE THAT DID NOT ANSWER. A frame cannot say it failed (a 404 inside
  it is a page like any other), so a website that has not said it drew after
  a long wait is asked about once, by its address; one that is not there is
  remembered for this visit and the preview shows its pictures instead.
*/
const MISSING = new Set<string>()
const missingListeners = new Set<() => void>()
function subscribeMissing(cb: () => void) {
  missingListeners.add(cb)
  return () => missingListeners.delete(cb)
}
const ASKED = new Set<string>()
function askWhetherThere(src: string) {
  if (ASKED.has(src)) return
  ASKED.add(src)
  void fetch(src, { method: "HEAD", cache: "no-store", credentials: "omit" })
    .then((r) => {
      if (r.ok) return
      MISSING.add(src)
      for (const cb of missingListeners) cb()
    })
    .catch(() => {
      ASKED.delete(src)
    })
}
/*
  ===========================================================================
   THE WEBSITE'S OWN PAGES IN THE TAB'S HISTORY
  ===========================================================================
  A link followed inside the frame is a history entry of the tab's, after
  the preview's own (&preview=slug). Back in the bar went back one entry,
  which was the website's previous page, not the grid: the frame changed
  page as the window left, a 318ms parse at a quarter speed in the middle of
  the leaving, and the entries stayed behind with no frame to show, so the
  system's back afterwards did nothing for as many presses as pages had been
  browsed (scripts/check-theme-preview-live.mjs). So the website's pages are
  counted as the frame reports each one (its shim says so on every page),
  against the tab's history length: a page that grew the history is a step
  forward, one that did not and is the page before is a step back. Leaving
  goes back over all of them at once (framedSteps, read by the Website page).
*/
const FRAMED: { pages: string[]; at: number; length: number } = { pages: [], at: 0, length: 0 }
function framedPage(path: string) {
  const length = window.history.length
  if (FRAMED.pages.length === 0) {
    FRAMED.pages = [path]
    FRAMED.at = 0
  } else if (length > FRAMED.length) {
    FRAMED.pages = [...FRAMED.pages.slice(0, FRAMED.at + 1), path]
    FRAMED.at = FRAMED.pages.length - 1
  } else if (FRAMED.pages[FRAMED.at - 1] === path) {
    FRAMED.at -= 1
  } else if (FRAMED.pages[FRAMED.at + 1] === path) {
    FRAMED.at += 1
  }
  FRAMED.length = length
}
/** How many of the tab's history entries the open preview's website has put after the preview's own. */
export function framedSteps(): number {
  return Math.max(0, FRAMED.at)
}

/** How long a website may take to say it drew before its address is checked. */
const LIVE_CHECK_MS = 2500

/** Narrower than this (a phone or a small tablet holding Desktop), the desktop website is drawn at LIVE_DESKTOP_WIDTH and scaled down to the stage. */
const LIVE_DESKTOP_MIN = 1024
const LIVE_DESKTOP_WIDTH = 1280

/**
 * THE TEMPLATE'S REAL WEBSITE. Static files (public/theme-previews/<slug>/,
 * scripts/build-template-previews.ts): every page a visitor can reach, its
 * links between them, nothing that buys, signs in or posts. The frame runs
 * scripts and nothing else; it is not this origin, so it can read nothing of
 * Storelib's. (The same is why the browser keeps none of its files between
 * two previews: Chromium does not cache for a frame with no origin. See
 * scripts/check-theme-preview-live.mjs.)
 *
 * The frame is in the page from the window's first frame, and is given its
 * address as the window lands (below). Its box is white
 * at once (the whole stage for Desktop, a 390px frame on a computer for
 * Phone), so the wait is the frame's own colour and nothing else; past
 * PREVIEW_QUIET_MS a faint line runs along its top. The website itself
 * fades in once, when its first page says it has drawn (a message from the
 * page's shim), or appears with the window when it was that quick.
 *
 * A switch reflows the same page in place, so a visitor keeps the page they
 * had browsed to: the website dips for a moment while it lays itself out
 * at the new width and comes back, rather than being seen to jump.
 */
function LiveSite({ src, device, name, openedAt }: { src: string; device: PreviewDevice; name: string; openedAt: React.RefObject<number> }) {
  const frame = React.useRef<HTMLIFrameElement>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const [stage, setStage] = React.useState<{ w: number; h: number } | null>(null)
  /** null while it loads; then whether it fades in or is simply there with the window. */
  const [ready, setReady] = React.useState<null | "fade" | "with-window">(null)
  /*
    ASKED FOR AS THE WINDOW LANDS. A website arriving is a page being parsed
    and its scripts run, and in a browser that keeps the frame in the same
    process as Storelib (an iPhone's web view; Chromium here, measured) that
    work held the page's thread through the window's arrival: at a quarter
    speed its first 300ms drew 4 frames. The address is set once the
    arrival's 240 to 260ms are over (at once with reduced motion), so the
    window moves on a free thread and the website starts right behind it.
  */
  const [asked, setAsked] = React.useState(false)
  React.useEffect(() => {
    const still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const arrival = still ? 0 : phoneScreen() ? PREVIEW_RISE_MS : PREVIEW_IN_MS
    const t = window.setTimeout(() => setAsked(true), Math.max(0, arrival - (performance.now() - (openedAt.current ?? 0))))
    return () => window.clearTimeout(t)
  }, [openedAt])

  /* A new website: none of its pages are in the history yet. */
  React.useEffect(() => {
    FRAMED.pages = []
    FRAMED.at = 0
    FRAMED.length = window.history.length
  }, [src])
  /*
    THE WEBSITE'S OWN BACKGROUND BEHIND IT. Between two of its pages the
    frame shows only itself for a moment, and it was white: a dark template
    (Night shop) flashed white on every click. Each page says its background
    as it starts (scripts/build-template-previews.ts) and the frame takes it.
  */
  const [siteBackground, setSiteBackground] = React.useState<string | null>(null)
  React.useEffect(() => setSiteBackground(null), [src])
  React.useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      const data = e.data as { type?: unknown; path?: unknown; background?: unknown } | null
      if (data && data.type === "storelib:template-preview-background") {
        const c = typeof data.background === "string" ? data.background.trim() : ""
        if (/^rgba?\([\d.,\s/%]+\)$|^#[0-9a-f]{3,8}$/i.test(c)) setSiteBackground(c)
        return
      }
      if (!data || data.type !== "storelib:template-preview") return
      if (typeof data.path === "string") framedPage(data.path)
      /* Still arriving: the window's own fade shows it. Later: a fade of its own, once. */
      const early = performance.now() - (openedAt.current ?? 0) < PREVIEW_IN_MS * 0.6
      setReady((r) => r ?? (early ? "with-window" : "fade"))
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [src, openedAt])

  /* A website that has not drawn after a long wait: is it there at all? */
  React.useEffect(() => {
    if (ready || !asked) return
    const t = window.setTimeout(() => askWhetherThere(src), LIVE_CHECK_MS)
    return () => window.clearTimeout(t)
  }, [src, ready, asked])

  React.useLayoutEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const measure = () => setStage((s) => (s && s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /*
    THE SWITCH. The frame's new width is set in this commit and the website
    lays itself out again in it; until it has, the frames in between are
    the old layout cut or stretched. So the website goes clear on the
    press's frame and fades back in only once two frames have been drawn
    after it: a frame in the same process as this page is laid out with the
    page, so by then it has its new layout (at a quarter speed that layout
    took 300ms, and a fade on a timer showed the old one through it). One
    fade, on opacity, on the compositor.
  */
  const lastDevice = React.useRef(device)
  React.useLayoutEffect(() => {
    if (lastDevice.current === device) return
    lastDevice.current = device
    const el = frame.current
    if (!el || !ready || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.getAnimations().forEach((a) => a.cancel())
    const hold = el.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 1000, fill: "forwards" })
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        hold.cancel()
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: PREVIEW_SWAP_MS, easing: "cubic-bezier(0.33, 1, 0.68, 1)" })
      })
    })
    return () => {
      cancelAnimationFrame(id)
      hold.cancel()
    }
  }, [device, ready])

  /* Desktop on a narrow screen: the desktop layout, scaled to fit. */
  const scale = device === "desktop" && stage && stage.w > 0 && stage.w < LIVE_DESKTOP_MIN ? stage.w / LIVE_DESKTOP_WIDTH : 1
  const frameStyle: React.CSSProperties = {
    ...(scale < 1 && stage ? { width: LIVE_DESKTOP_WIDTH, height: Math.ceil(stage.h / scale), transform: `scale(${scale})`, transformOrigin: "0 0" } : {}),
    ...(siteBackground ? { backgroundColor: siteBackground } : {}),
  }

  return (
    <div className={cn("absolute inset-0 flex justify-center pb-[env(safe-area-inset-bottom)] md:pb-0", device === "phone" && "md:py-6")}>
      <div
        ref={stageRef}
        data-preview-live-frame={device}
        className={cn(
          "relative h-full w-full overflow-hidden bg-white",
          device === "phone" && "md:max-w-[390px] md:rounded-[22px] md:shadow-[0_0_0_1px_rgba(17,24,39,0.08),0_16px_40px_-20px_rgba(17,24,39,0.35)]",
        )}
      >
        {/* The wait, said quietly and only once it is long enough to notice: a thin line along the top. */}
        {!ready ? (
          <div aria-hidden data-preview-live-loading="" className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[2px] overflow-hidden">
            <div className="h-full w-1/3 bg-[#1a1a2e]/15 [animation:wb-live-load_1.2s_cubic-bezier(0.45,0,0.55,1)_infinite] motion-reduce:[animation:none]" />
          </div>
        ) : null}
        <div
          data-preview-live={ready ? "ready" : "loading"}
          data-preview-src={src}
          aria-hidden={!ready || undefined}
          inert={!ready}
          className={cn("absolute inset-0", ready ? "opacity-100" : "pointer-events-none opacity-0", ready === "fade" && "transition-opacity ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none")}
          style={ready === "fade" ? { transitionDuration: `${PREVIEW_LIVE_FADE_MS}ms` } : undefined}
        >
          {/* Not even an empty frame before then: making one is a document of its own, 15ms at a quarter speed. */}
          {asked ? (
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
          ) : null}
        </div>
      </div>
    </div>
  )
}
