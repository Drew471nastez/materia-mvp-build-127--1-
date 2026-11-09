"use client"

/**
 * ===========================================================================
 *  THE WEBSITE PAGE
 * ===========================================================================
 * Three things, in the order a store owner cares about them:
 *
 *   1. The live website — one card, one picture, one button: Edit website.
 *   2. The library: the other themes you are keeping (THEME_INSTALL_LIMIT
 *      in all), each with Publish, Edit and the long tail in a menu. A
 *      website being imported, added or copied has its row there from the
 *      first moment (./incoming.tsx), and the page scrolls to it when it lands.
 *   3. Explore — a few themes from the registry, and the door to all of them.
 *
 * What is deliberately NOT here:
 *   • A live render of any website. The cover is the snapshot the editor took
 *     on the last save, or a drawing from the theme's colours until there is
 *     one. Nothing on this page mounts a storefront.
 *   • A fetch on mount. The server hands over everything; mutations call the
 *     API and then `router.refresh()`, so the page is never in a state the
 *     server did not produce.
 *   • A loading skeleton. The server hands the page over whole, and the
 *     app's stage covers a slow round trip; nothing here stands in for it.
 *   • Explanatory copy. A card with a picture, a name and a status does not
 *     need a sentence under it saying so.
 */

import * as React from "react"
import { ownOpen, useOwnMarker } from "@/lib/analytics/own-site"
import { liveSiteLink } from "@/lib/website-builder/live-site-link"
import { AnalyticsSummaryFact } from "@/components/app/analytics-summary-line"
import { useRouter } from "next/navigation"
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  Globe,
  Layers,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Rocket,
  Settings,
  Settings2,
  Trash2,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { iconDepth, secondaryDepth } from "@/components/ui/depth-button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/use-toast"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { getWebsiteShareUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"
import { cn } from "@/lib/utils"
import { hapticTap } from "@/lib/native-bridge"
import type { ThemeSettingsValues, ThemeStatus } from "@/lib/website-builder/types"
import {
  THEME_INSTALL_LIMIT,
  getIndustry,
  getThemeDefinition,
  type ThemeDefinition,
} from "@/lib/website-builder/theme-registry"
import { ExploreThemesCard, ThemeCard } from "@/components/themes/theme-card"
import { LIBRARY_THEME_CARDS, MARKETPLACE_PATH, builtinListings, listingPath, type ThemeListing } from "@/lib/themes/marketplace-shared"
import { relativeTime } from "@/lib/website-builder/relative-time"
import { type Cover, coverBeingWatched, latestCover, requestCover, savedAt, seedCover, watchCover } from "@/lib/website-builder/cover-refresh"
import { pagesBehind } from "@/lib/website-builder/page-refresh"
import { decodeCover, isDecoded, rememberCover, shownCover } from "@/lib/website-builder/cover-memory"
import { fetchWithin } from "@/lib/website-builder/load-guard"
import { HelpLabel } from "@/components/app/help-label"
import type { SettingsSection } from "@/components/website-builder/website-settings/types"
import { LIBRARY_FULL_CODE, LIBRARY_RULE, LIBRARY_RULE_TITLE } from "@/lib/website-builder/library-limit"
import { LibraryFullDialog, type LibraryAction } from "./library-full-dialog"
import { StartWebsite } from "./start-website"
import { newStartKey, saveStartPrompt, withJobParam, withStartParam } from "@/lib/website-builder/start-handoff"
import type { StartMode } from "@/lib/website-builder/create-website"
import {
  ARRIVAL_MS,
  IncomingRow,
  importThemeFile,
  nameFromFile,
  scrollToRow,
  type Incoming,
  type IncomingKind,
} from "./incoming"
import { tt } from "@/lib/i18n/text"
import { Rich } from "@/lib/i18n/rich"

export interface WebsiteSummary {
  id: string
  name: string
  status: ThemeStatus
  theme_id: string
  created_at: string
  updated_at: string
  published_at: string | null
  /**
   * The cover: screenshots of the saved home page, taken by a browser on the
   * server — at a laptop's width, and at a phone's. Null until one has been
   * taken, when the card draws the theme's stand-in instead.
   */
  snapshot_url: string | null
  snapshot_mobile_url: string | null
  snapshot_updated_at: string | null
  /** When the site's pages or settings were last saved. Not the install
      row's own time, which recording a cover also moves. */
  saved_at: string
  theme: { name: string; version: string; slug: string } | null
  settings: ThemeSettingsValues | null
}

export type EditorView = "preview" | "code" | "settings"

function dragHasFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files")
}

/** The first dropped zip or .storelib-theme. Other files are not a theme. */
function droppedThemeFile(list: FileList | null): File | null {
  if (!list || list.length === 0) return null
  for (const file of Array.from(list)) {
    const name = file.name.toLowerCase()
    if (name.endsWith(".zip") || name.endsWith(".storelib-theme")) return file
  }
  return null
}

/**
 * The editor's canonical URL — Shopify-shaped, with the creator's slug in it.
 * The legacy path stays as the fallback for the brief window before a new
 * creator has a username.
 */
export function editorHref(
  username: string,
  installId: string,
  view: EditorView = "preview",
  /** With `view: "settings"`, the page of Website Settings to open on. */
  section?: SettingsSection,
): string {
  const base = username
    ? `/store/${encodeURIComponent(username)}/themes/${installId}/editor`
    : `/website-builder/editor/${installId}`
  const params = new URLSearchParams({ previewPath: "/" })
  if (view !== "preview") params.set("view", view)
  if (view === "settings" && section) params.set("settings", section)
  return `${base}?${params.toString()}`
}


/**
 * THE LIVE COVER, A PICTURE WITH ITS OWN CORNERS. Flush with the card, the
 * screenshot ended in a straight cut through the site's text, which read as
 * a picture that failed to load. It is set into the card again, as it was
 * before the full bleed: 12px corners on all four sides, a hairline drawn
 * over the picture so a white site keeps its edge on the white card, and two
 * soft shadows, one close and one wide. Still only the picture: no stage, no
 * browser window, no phone.
 *
 * 16:10 on the frame itself, so the box is there before the picture is, and
 * the screenshot is cut from its top (object-top in CoverPicture), so what
 * shows is the site's header and hero and the crop reads as a choice.
 *
 * Not a `.group`: on a touch screen app/globals.css takes the shadow off a
 * hovered `.group`, and a tap leaves it hovered. The hover tint is its own
 * layer (`before:`) on a fine pointer only, and the focus ring is an outline,
 * drawn outside the picture where nothing covers it. `translateZ(0)` with
 * `isolate` keeps Safari clipping the crossfading picture to the corners.
 *
 * ── AND A FINGER LEAVES NOTHING GREY ON IT ───────────────────────────────
 * "On a mobile device, if I touch the website cover, make sure there is no
 * grey thing over it, it looks bad."
 *
 * It was not this file's hover, which a finger cannot reach. It was the
 * native shell's press: html.capacitor fades ANY button to 72% for as long
 * as it is held (app/globals.css), which on a control reads as the control
 * going quiet and on a photograph reads as the picture washing out into the
 * white card behind it. Measured with :active forced in the shell, opacity
 * 0.72 over the whole 16:10 tile; the website's black hero came out grey.
 *
 * `data-picture-press` is the opt out, and the rule that answers it in
 * globals.css says why. What is left is a press the FRAME answers: the
 * hairline deepens from 8% to 22% while a finger is down, on the edge, over
 * nothing anybody is looking at. Not a tint over the picture, because a tint
 * over the picture is the grey thing that was complained about, whatever its
 * alpha. The page's loading bar starts on the same press.
 *
 * The browser's own tap highlight is already off: Tailwind's preflight sets
 * -webkit-tap-highlight-color: transparent on html, and it inherits.
 */
const COVER_FRAME =
  "relative block aspect-[16/10] w-full select-none overflow-hidden rounded-[12px] bg-[#eef0f3] text-left isolate outline-none [transform:translateZ(0)] [&_img]:[-webkit-user-drag:none] shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_10px_-6px_rgba(15,23,42,0.08),0_10px_28px_-14px_rgba(15,23,42,0.22)] after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] after:transition-shadow after:duration-150 active:after:shadow-[inset_0_0_0_1px_rgba(15,23,42,0.22)] before:pointer-events-none before:absolute before:inset-0 before:z-20 before:bg-[#1a1a2e]/0 before:transition-colors before:duration-200 pointer-fine:hover:before:bg-[#1a1a2e]/[0.04] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[#1a1a2e]/35"

/** "2 days ago" without the "ago", for a meta line that already reads as time. */
function since(iso: string | null | undefined): string | null {
  const t = relativeTime(iso)
  if (!t) return null
  return t === "just now" ? t : t.replace(/ minutes?/, "m").replace(/ hours?/, "h").replace(/ days?/, "d").replace(/ months?/, "mo").replace(" ago", " ago")
}

// ── Small pieces ───────────────────────────────────────────────────────────

function StatusDot({ status, label = true }: { status: ThemeStatus; label?: boolean }) {
  const tone =
    status === "published"
      ? { dot: "bg-emerald-500", text: "text-emerald-700", name: "Live" }
      : status === "unpublished"
        ? { dot: "bg-amber-500", text: "text-amber-700", name: "Offline" }
        : { dot: "bg-[#9ca3af]", text: "text-[#6b7280]", name: "Draft" }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-semibold", tone.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {label && tone.name}
    </span>
  )
}

/**
 * A library row's status, as the Orders table draws one: a word on a tint.
 * Draft, or Offline for the website that was live when nothing is now, on
 * Polaris's attention tint, so a site that is down does not read as a draft.
 */
function DraftBadge({ offline = false }: { offline?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center whitespace-nowrap rounded-[7px] px-2 text-[12px] font-medium",
        offline ? "bg-[#ffef9d] text-[#4f4700]" : "bg-[#f1f2f4] text-[#3f3f46]",
      )}
    >
      {offline ? tt("Offline") : tt("Draft")}
    </span>
  )
}

/**
 * ===========================================================================
 *  A NEW COVER CROSSFADES IN, IT DOES NOT CUT, AND IT IS NEVER GREY FIRST
 * ===========================================================================
 * A cover older than the site is retaken while the page is open (below), and
 * the new picture used to replace the old one in a single frame: a drawn
 * stand-in turning into a screenshot, or yesterday's screenshot into
 * today's, a moment after landing. That cut is the flash on arriving here.
 * So the cover on screen stays underneath, and the new one fades in over it,
 * then the old one is let go.
 *
 * "When I go back from the editor to the website page, the cover is gray,
 * and then it shows the cover, but it takes so long and glitches." Coming
 * back, the page was handed the newest address at once (the one the editor
 * had just taken), and drew the frame's grey until a file it had never
 * fetched arrived, then faded it in. Now the first frame draws the last cover
 * this website showed whole (lib/website-builder/cover-memory, kept for the
 * tab and across a reload), decoded, in the box the frame reserves; the new
 * address is fetched and decoded aside, and only then crossfaded in, once.
 * A picture that cannot be fetched never replaces one that could. The first
 * cover a website ever shows in a tab is not faded: it is there on the
 * page's first frame, which the shell's landing brings in.
 */
type Face = { url: string | null }

/** What a website's cover draws on its first frame: the last whole one, while a different current one is still to be fetched. */
function firstFace(installId: string, current: string | null): Face {
  const last = shownCover(installId)
  if (current && last && last !== current && !isDecoded(current)) return { url: last }
  return { url: current }
}

function WebsiteCover({ install, eager = false, preparing = false }: { install: WebsiteSummary; eager?: boolean; preparing?: boolean }) {
  const current = install.snapshot_url
  const [face, setFace] = React.useState<Face>(() => firstFace(install.id, current))
  /* What was on screen before the last swap, fading out under the new one. */
  const [previous, setPrevious] = React.useState<Face | null>(null)
  React.useEffect(() => {
    if (!current || current === face.url) return
    let live = true
    const swap = () => {
      if (!live) return
      setPrevious(face)
      setFace({ url: current })
    }
    /* Already decoded in this tab: on the next frame. Otherwise not before it can be drawn whole. */
    if (isDecoded(current)) swap()
    else void decodeCover(current).then((ok) => { if (ok) swap() })
    return () => {
      live = false
    }
  }, [current, face])
  React.useEffect(() => {
    if (!previous) return
    const t = window.setTimeout(() => setPrevious(null), COVER_FADE_MS + 60)
    return () => window.clearTimeout(t)
  }, [previous])
  /*
    NO PHOTOGRAPH YET IS NOT A GREY BOX FOR AS LONG AS ONE TAKES. The big
    card shows the page itself, small, from the same page the photograph is
    taken of (LiveMiniature), as soon as it has drawn: the site's name on
    grey fades off it. The photograph, when it lands, fades in over it as
    any new cover does, and the small page goes once it is covered. A
    photograph that could not be taken leaves the small page where it is.
  */
  /* A picture whose file cannot be fetched is no picture either. */
  const [broken, setBroken] = React.useState<string | null>(null)
  const wantsMini = eager && (!face.url || broken === face.url)
  const [miniMounted, setMiniMounted] = React.useState(wantsMini)
  const [miniShown, setMiniShown] = React.useState(false)
  React.useEffect(() => {
    if (wantsMini) {
      setMiniMounted(true)
      return
    }
    const t = window.setTimeout(() => setMiniMounted(false), COVER_FADE_MS + 120)
    return () => window.clearTimeout(t)
  }, [wantsMini])
  const keyOf = (f: Face) => f.url ?? `pending:${install.id}`
  const draw = (f: Face) =>
    f.url ? <CoverPicture installId={install.id} url={f.url} eager={eager} onBroken={setBroken} /> : <PendingCover name={install.name} preparing={preparing} />
  /* The name on grey has already faded off the small page: it does not come back under the photograph. */
  const pendingGone = (f: Face) => !f.url && miniShown
  return (
    <span className="relative block h-full w-full">
      {miniMounted && <LiveMiniature installId={install.id} onShown={() => setMiniShown(true)} />}
      {previous && !pendingGone(previous) && (
        <span key={keyOf(previous)} aria-hidden className="absolute inset-0">
          {draw(previous)}
        </span>
      )}
      <span
        key={keyOf(face)}
        className={cn("relative block h-full w-full", previous && "wb-cover-in")}
        style={pendingGone(face) ? { opacity: 0, transition: COVER_IN } : undefined}
      >
        {draw(face)}
      </span>
    </span>
  )
}
const COVER_FADE_MS = 420

/**
 * ===========================================================================
 *  THE PAGE ITSELF, SMALL, WHILE ITS PHOTOGRAPH IS ON ITS WAY
 * ===========================================================================
 * The page the server photographs (/cover-render, or an imported theme's
 * /api/site-theme/cover), opened with the same two-minute pass for this one
 * install (the cover route's GET ?render=1, owner only), at a laptop's
 * width and scaled down to the card. In a sandbox with no origin, taking no
 * presses, out of the tab order: it is a picture that happens to be live.
 * Only ever on the one big card, and only while there is no photograph.
 */
function LiveMiniature({ installId, onShown }: { installId: string; onShown: () => void }) {
  const [src, setSrc] = React.useState<string | null>(null)
  const [width, setWidth] = React.useState(0)
  const box = React.useRef<HTMLSpanElement | null>(null)
  const shown = React.useRef(onShown)
  shown.current = onShown
  React.useEffect(() => {
    let live = true
    void fetchWithin(`/api/website-builder/themes/${encodeURIComponent(installId)}/cover?render=1`, { cache: "no-store" }, 10_000)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { render?: unknown } | null) => {
        if (live && d && typeof d.render === "string" && d.render.startsWith("/")) setSrc(d.render)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [installId])
  React.useEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setWidth(el.clientWidth)
    fit()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <span ref={box} aria-hidden data-cover-live="" className="absolute inset-0 overflow-hidden bg-white">
      {src && width > 0 ? (
        <iframe
          src={src}
          title=""
          tabIndex={-1}
          sandbox="allow-scripts"
          loading="eager"
          /* Its pictures and fonts a moment after the page itself: then the name over it fades. */
          onLoad={() => window.setTimeout(() => shown.current(), 250)}
          className="pointer-events-none absolute left-0 top-0 block origin-top-left border-0 bg-white"
          style={{ width: 1440, height: 900, transform: `scale(${width / 1440})` }}
        />
      ) : null}
    </span>
  )
}

/**
 * The website's picture: the desktop screenshot the server took on the last
 * save, cut from the top so the site's header and hero are what shows. Plain
 * `<img>`: the snapshot is already 1440px WebP, sized once at capture, so
 * there is nothing for an optimiser to do and nothing to pay per view.
 *
 * A picture this tab has decoded, or the last one this website showed, is
 * drawn eagerly and decoded in step with the frame, so it is on the frame the
 * page lands on rather than a frame later. Once one has loaded, it is the one
 * the next visit starts from (cover-memory rememberCover).
 *
 * NO PICTURE YET IS SAID, NOT DRAWN. Until there is a screenshot the card
 * used to draw a page from the site's settings: a headline, a button in its
 * primary colour, a row of product tiles. An imported site with a black hero
 * was shown for its first seconds as a pink storefront saying "Thoughtful
 * themes for better storefronts", which is not what it looks like. Now it is
 * the site's name on the plain grey the placeholder row had, breathing while
 * a photograph is on its way (PendingCover).
 */
function CoverPicture({ installId, url, eager = false, onBroken }: { installId: string; url: string; eager?: boolean; onBroken?: (url: string) => void }) {
  const known = isDecoded(url) || shownCover(installId) === url
  const fade = useCoverFade(known)
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt=""
      width={1440}
      height={900}
      loading={eager || known ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding={known ? "sync" : "async"}
      draggable={false}
      data-cover-picture=""
      className="block h-full w-full object-cover object-top"
      ref={fade.ref}
      onLoad={(e) => {
        rememberCover(installId, url)
        fade.onLoad(e)
      }}
      onError={(e) => {
        fade.onLoad(e)
        onBroken?.(url)
      }}
      style={fade.style}
    />
  )
}

/**
 * ===========================================================================
 *  A COVER ARRIVES, IT DOES NOT PLUNK
 * ===========================================================================
 * The screenshot is a 1440px picture that lands after the page does: the
 * shell's 180ms landing is over by then, so the picture used to appear in one
 * frame at full strength over the grey frame, which read as a snap. Now a
 * picture this tab has not shown yet starts clear and fades in once it has
 * loaded (or, if it had already loaded before the page came to life, as soon
 * as it can), on the same curve and length as a retaken cover's crossfade.
 *
 * A picture already shown in this tab (or before a reload), or one fetched
 * and decoded ahead (lib/website-builder/cover-memory), is drawn at full
 * strength on its first frame: going back to the page, or a retaken cover
 * crossfading in its own wrapper, never fades twice. All of it is opacity on
 * the element itself, so nothing is laid out again.
 */
const COVER_IN = `opacity ${COVER_FADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`

function useCoverFade(known: boolean) {
  const reveal = React.useCallback(
    (el: HTMLImageElement | null) => {
      if (!el || el.style.opacity === "1") return
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        el.style.opacity = "1"
        return
      }
      el.style.transition = COVER_IN
      /* The clear frame has to be painted before the change, or there is nothing to fade from. */
      requestAnimationFrame(() => {
        el.style.opacity = "1"
      })
    },
    [],
  )
  const ref = React.useCallback(
    (el: HTMLImageElement | null) => {
      if (el && !known && el.complete && el.naturalWidth > 0) reveal(el)
    },
    [known, reveal],
  )
  const onLoad = React.useCallback((e: React.SyntheticEvent<HTMLImageElement>) => reveal(e.currentTarget), [reveal])
  return { ref, onLoad, style: known ? undefined : ({ opacity: 0 } as React.CSSProperties) }
}

/**
 * A website without a photograph yet: its name, centred on the grey of the
 * placeholder row it replaces, so the row that lands looks like the one that
 * was there. While a photograph is being taken the grey breathes (the same
 * `wb-incoming-pulse`, opacity only), and on a cover wide enough to read it,
 * the live card's, it says so. Sized to its box (container units), so the
 * name reads at a thumbnail's 96px and at the live card's full width.
 */
function PendingCover({ name, preparing }: { name: string; preparing: boolean }) {
  return (
    <span
      data-cover-pending={preparing ? "preparing" : "waiting"}
      role="img"
      aria-label={preparing ? tt("{name}, preparing preview", { name }) : name}
      className="@container relative flex h-full w-full flex-col items-center justify-center bg-[#f3f4f6] px-[8%] text-center"
    >
      {preparing && <span aria-hidden className="wb-incoming-pulse absolute inset-0 bg-[#e6e8ec]" />}
      <span aria-hidden className="relative block max-w-full truncate text-[length:clamp(9px,7.5cqi,20px)] font-semibold leading-tight tracking-tight text-[#4b5563]">
        {name}
      </span>
      {preparing && (
        <span aria-hidden className="relative mt-1.5 hidden text-[12.5px] text-[#6b7280] @min-[260px]:block">
          {tt("Preparing preview")}
        </span>
      )}
    </span>
  )
}

/**
 * The site's address, under the title, the way a host puts it there.
 *
 * It was a bordered box with an icon in it and a second square button welded
 * to its right, which is the shape of a text input — so the first thing the
 * page did was offer you something to type into that you cannot type into.
 * It is a link now: the address, the mark that says it opens away, and a
 * quiet copy button. Nothing is drawn around it.
 */
function SiteAddress({ url, display }: { url: string; display: string }) {
  const [copied, setCopied] = React.useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      window.open(ownOpen(url), "_blank", "noopener")
    }
  }
  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-0.5">
      <a
        {...liveSiteLink(ownOpen(url))}
        className="group inline-flex min-w-0 items-center gap-1.5 rounded-md text-[14px] text-[#6b7280] transition-colors hover:text-[#1a1a2e]"
      >
        <span className="truncate">{display}</span>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#9ca3af] transition-colors group-hover:text-[#1a1a2e]" />
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? tt("Address copied") : tt("Copy address")}
        className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#9ca3af] transition-colors hover:bg-[#eef0f3] hover:text-[#1a1a2e]"
      >
        <Copy className={cn("h-3.5 w-3.5 transition-opacity duration-150", copied && "opacity-0")} />
        <Check className={cn("absolute h-3.5 w-3.5 text-emerald-600 transition-opacity duration-150", !copied && "opacity-0")} />
      </button>
    </div>
  )
}

/**
 * THE TITLE'S BUTTONS: Public with its menu, and View website. The light grey
 * fill they had read as flat on the page's own grey, so they are the shared
 * secondary (components/ui/depth-button.ts), the one the product editor's bar
 * and its file picker wear: white, a hairline border, a 1px shade inside the
 * foot and a hairline under it, flat with the shade inside when pressed, a
 * violet focus outline. Sized as the file picker's button: 36px with 8px
 * corners from 640px; 44px with 10px corners on a phone, where it overhangs
 * the title's line by 4px above and below rather than making the line
 * taller, so the address under it stays where it was.
 */
const HEADER_BUTTON = cn(secondaryDepth, "-my-1 h-11 rounded-[10px] px-3.5 text-[14px] sm:my-0 sm:h-9 sm:rounded-lg sm:px-3")

/**
 * THE BUTTONS BESIDE EDIT WEBSITE: Settings and the three dots, both in the
 * icon depth (components/ui/depth-button.ts): a hairline, a 2px shade inside
 * the foot and a soft shadow under it, flat when pressed. 44px squares at
 * every width, as tall as Edit website. Settings is its gear alone, with its
 * name as the button's label and in a tooltip on a pointer.
 */
const SETTINGS_ON_CARD = cn(iconDepth, "h-11 w-11 rounded-xl px-0 text-[#4b5563]")

/**
 * Settings' name on a pointer: a small near-black label, the builder's own
 * dark, with no arrow. The shared tooltip's theme colours and its arrow are
 * replaced here, not added to.
 */
const TOOLTIP = "rounded-md bg-[#1a1a2e] px-2 py-1 text-[12px] font-medium text-white shadow-[0_2px_8px_rgba(15,23,42,0.18)] [&_svg]:hidden!"

/**
 * View website's words: "View" with an eye on a phone, where the title's line
 * is short, and "View website" from 640px. Both are in the markup and CSS
 * picks one, so nothing changes after the first paint; the button's label is
 * "View website" at every width.
 */
function ViewLabel() {
  return (
    <>
      <Eye aria-hidden className="h-4 w-4 text-[#4b5563] sm:hidden" strokeWidth={1.9} />
      <span className="sm:hidden">{tt("View")}</span>
      <span className="hidden sm:inline">{tt("View website")}</span>
    </>
  )
}
const MORE_ON_CARD = cn(iconDepth, "h-11 w-11 rounded-xl px-0 text-[#4b5563]")
/** Publish beside Customize on a draft's card: the same depth as the title's buttons, as tall as Customize. */
const PUBLISH_ON_CARD = cn(secondaryDepth, "h-11 shrink-0 rounded-xl px-4 text-[14px] font-semibold text-[#1a1a2e]")
/**
 * A library row's three dots: the same depth, 40px on a phone with an
 * invisible band to 48, and 36 from 640px, beside Publish and Edit.
 */
const MORE_ON_ROW = cn(
  iconDepth,
  "relative h-10 w-10 rounded-[10px] px-0 text-[#4b5563] after:absolute after:-inset-1 after:content-[''] sm:h-9 sm:w-9 sm:rounded-lg sm:after:hidden",
)

function SectionHeading({
  title,
  aside,
  children,
}: {
  title: string
  aside?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    // `flex-wrap`, and the actions kept together in their own box: the row
    // had a title, a counter and two buttons on one unwrapping line, and on a
    // phone the last button ran off the right-hand gutter.
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h2 className="text-[16px] font-semibold tracking-tight text-[#1a1a2e]">{title}</h2>
        {aside}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}

// ── The page ───────────────────────────────────────────────────────────────

/**
 * Resolves once the picture has been fetched and decoded, or failed to, or
 * `within` ms have passed: a slow picture never holds up what waits on it for
 * longer than that, it just draws a moment later (cover-memory decodeCover).
 * The desktop picture only: the phone one is not drawn on this page, and
 * decoding it was work nobody saw.
 */
async function decodedFirst(url: string | null, within = 10_000): Promise<void> {
  if (url) await decodeCover(url, within)
}

/**
 * A cover older than the site it is a picture of. Missing counts, and so
 * does one taken before the last save by more than the few seconds a save
 * and its cover can straddle.
 */
/** Saves this tab has already fetched the page again for. */
const REFRESHED = new Set<string>()

export function coverIsStale(i: Pick<WebsiteSummary, "snapshot_url" | "snapshot_updated_at" | "saved_at">): boolean {
  if (!i.snapshot_url || !i.snapshot_updated_at) return true
  return Date.parse(i.saved_at) > Date.parse(i.snapshot_updated_at) + 5000
}

export function WebsiteBuilderClient({
  installs: given,
  username,
  siteHandle = null,
  listings = builtinListings(),
  account = null,
  teamMember = false,
}: {
  installs: WebsiteSummary[]
  /**
   * Round 42: a team member with Website, working in the store. Importing,
   * exporting and removing a website stay the store owner's (lib/team/website),
   * so those are not offered at all rather than answered "not found".
   */
  teamMember?: boolean
  username: string
  /** The signed in account, which the Last 30 days line is kept under. */
  account?: string | null
  /** The website's own name on Storelib, when it has one apart from the username. */
  siteHandle?: string | null
  /** The marketplace's themes, Storelib's own first (lib/themes/marketplace-server.ts). */
  listings?: ThemeListing[]
}) {
  /* Opening your own website from here is not a visit to it (lib/analytics/own-site). */
  useOwnMarker()

  /*
    ===========================================================================
     A COVER OLDER THAN THE SITE IS RETAKEN WHILE YOU LOOK AT IT
    ===========================================================================
    The editor asks for a new cover once the saving has stopped. That misses
    the saves it never saw: an editor closed a moment after a change, a tab
    from before this code, a site nobody has opened since. So this page asks
    too, for any site whose cover is missing or older than its last save,
    and puts the new pictures in as they arrive.

    The live site first, because it is the big card; then the library, one
    at a time, because each cover is a browser launch on the server and there
    is no reason to start five at once. Each site is asked about once per
    visit. A cover that cannot be taken leaves the card as it was.
  */
  const router = useRouter()
  const [fresh, setFresh] = React.useState<Record<string, { url: string; mobile_url: string | null; updated_at: string }>>({})
  const asked = React.useRef(new Set<string>())
  /** Sites whose photograph is being taken or waited for right now: a card with no picture breathes while it is. */
  const [preparing, setPreparing] = React.useState<Record<string, true>>({})
  const markPreparing = React.useCallback((id: string, on: boolean) => {
    setPreparing((prev) => {
      if (!!prev[id] === on) return prev
      const next = { ...prev }
      if (on) next[id] = true
      else delete next[id]
      return next
    })
  }, [])
  /** A new picture, decoded before it is handed to the card, which then crossfades to it. */
  const showCover = React.useCallback(async (id: string, cover: Cover) => {
    await decodedFirst(cover.url)
    setFresh((prev) => ({ ...prev, [id]: cover }))
  }, [])
  const installs = React.useMemo(
    () =>
      given.map((i) => {
        /* The newest of three: what the server said, what arrived while this
           page was open, and what arrived while it was not (cover-refresh
           remembers those for the tab). */
        const f = [fresh[i.id], latestCover(i.id)]
          .filter((c): c is NonNullable<typeof c> => !!c)
          .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0]
        const newer = f && (!i.snapshot_updated_at || Date.parse(f.updated_at) > Date.parse(i.snapshot_updated_at))
        return newer ? { ...i, snapshot_url: f.url, snapshot_mobile_url: f.mobile_url, snapshot_updated_at: f.updated_at } : i
      }),
    [given, fresh],
  )
  React.useEffect(() => {
    const queue = [...given]
      .sort((a, b) => (a.status === "published" ? -1 : 0) - (b.status === "published" ? -1 : 0))
      /* Stale against the server's last save or this tab's, whichever is
         later, and against the newest cover this tab has seen. */
      .filter((i) => {
        const known = latestCover(i.id)
        const shown = known && (!i.snapshot_updated_at || Date.parse(known.updated_at) > Date.parse(i.snapshot_updated_at))
          ? { ...i, snapshot_url: known.url, snapshot_updated_at: known.updated_at }
          : i
        const saved = new Date(Math.max(Date.parse(i.saved_at), savedAt(i.id))).toISOString()
        return coverIsStale({ ...shown, saved_at: saved }) && !asked.current.has(i.id)
      })
    if (queue.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const i of queue) {
        if (cancelled) return
        asked.current.add(i.id)
        markPreparing(i.id, true)
        /* A site added on Browse themes a moment ago is already being looked for: that answer first, a new photograph only if it brings none. */
        let got = (await coverBeingWatched(i.id)) ?? (await requestCover(i.id))
        /* One more try a little later: a browser that failed to start once
           usually starts the second time, and a card left on a stale picture
           for the whole visit is what this is here to prevent. */
        if (!got && !cancelled) {
          await new Promise((r) => setTimeout(r, 15_000))
          if (!cancelled) got = await requestCover(i.id)
        }
        /* Used even if this run was superseded: the site is already marked
           asked, so a result dropped here would leave its card stale for the
           rest of the visit. Cancelling only stops the NEXT one starting. */
        const cover = got
        if (cover) {
          /* Decoded before it is swapped in. Handing the card a new URL
             straight away blanked the cover while a 1440px picture arrived
             and decoded, which is the flash of grey a retake used to be. */
          await decodedFirst(cover.url)
          setFresh((prev) => ({ ...prev, [i.id]: cover }))
        }
        markPreparing(i.id, false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [given, markPreparing])

  const { toast } = useToast()
  const [isRefreshing, startRefresh] = React.useTransition()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [renaming, setRenaming] = React.useState<WebsiteSummary | null>(null)
  const [deleting, setDeleting] = React.useState<WebsiteSummary | null>(null)
  const [publishing, setPublishing] = React.useState<WebsiteSummary | null>(null)
  const [unpublishing, setUnpublishing] = React.useState<WebsiteSummary | null>(null)
  /** Which way into a full library was just tried. See ./library-full-dialog. */
  const [full, setFull] = React.useState<LibraryAction | null>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)
  /** The website being imported, added or copied: its row is drawn before it exists. See ./incoming. */
  const [incoming, setIncoming] = React.useState<Incoming | null>(null)
  /** How to make it again, for Try again. Kept beside the row rather than in it. */
  const retryRef = React.useRef<(() => void) | null>(null)
  /** The website that has just landed: scrolled to and ringed once. */
  const [arrived, setArrived] = React.useState<string | null>(null)
  /**
   * Its ring: a layer over the library card at the row's place, measured
   * once when it starts. Not a pseudo element on the row itself: a table
   * row is not a box a positioned child can rely on, and in Chromium the
   * ring on the row gave the table a fifth column.
   */
  const [ringed, setRinged] = React.useState<{ top: number; height: number } | null>(null)
  const libraryCard = React.useRef<HTMLDivElement>(null)

  const live = installs.find((i) => i.status === "published") ?? null
  /**
   * With nothing live, the website that was: the one taken offline most
   * recently. "unpublished" only ever means a website that was live (a new
   * one is a draft), so that status is enough; published_at orders them when
   * there are several and is missing on a database without the column.
   */
  const offline = live
    ? null
    : ([...installs]
        .filter((i) => i.status === "unpublished")
        .sort((a, b) => (Date.parse(b.published_at ?? "") || 0) - (Date.parse(a.published_at ?? "") || 0))[0] ?? null)
  /**
   * NOTHING LIVE, AND NOTHING THAT WAS: the draft to open and publish takes
   * the big card. That is the website a new account starts with (Storelib
   * Default, installed as a draft by the server: lib/website-builder/
   * starter-website.ts), or the first draft in the library. "Nothing is
   * live" over a list somewhere below was a dead end with no door in it.
   */
  const starter = live || offline ? null : (installs.find((i) => i.status === "draft") ?? null)
  const library = installs.filter((i) => i.status !== "published" && i.id !== starter?.id)
  const installedThemeIds = React.useMemo(() => new Set(installs.map((i) => i.theme_id)), [installs])
  const slotsUsed = installs.length
  const slotsLeft = Math.max(0, THEME_INSTALL_LIMIT - slotsUsed)

  const siteName = siteHandle || username
  const siteUrl = siteName ? getWebsiteShareUrl(siteName) : ""
  const siteDisplay = siteName ? getWebsiteUrlDisplay(siteName) : ""

  /*
    ONE REFRESH AT A TIME (round AP, "the website builder page refreshes or
    reloads very bad"). A publish, a rename, a copy landing, a placeholder's
    timer and a copy behind a save each asked the server for the whole page,
    and each ask draws the page, lists the covers' folders and decodes them
    again. Two in a row were two redraws a moment apart: the page flickered
    twice. Every ask goes through this one transition now, so what is on
    screen stays until the new page is ready, and an ask while one is on its
    way is folded into a single one after it.
  */
  const refreshing = React.useRef(false)
  const again = React.useRef(false)
  const refresh = React.useCallback(() => {
    if (refreshing.current) {
      again.current = true
      return
    }
    refreshing.current = true
    startRefresh(() => router.refresh())
  }, [router])
  React.useEffect(() => {
    if (isRefreshing) return
    /* A transition that never showed as pending still lets the next ask through after a moment. */
    const t = window.setTimeout(() => {
      refreshing.current = false
      if (again.current) {
        again.current = false
        refresh()
      }
    }, 0)
    return () => window.clearTimeout(t)
  }, [isRefreshing, refresh])

  /*
    A COPY OF THIS PAGE OLDER THAN A SAVE MADE IN THIS TAB. The app keeps
    pages it has shown for five minutes, so coming back from the editor can
    hand this page the list from before the edit. When this tab saved a site
    after the copy's record of it, the server is asked for the page again,
    once per save (lib/website-builder/page-refresh.ts), through the one
    refresh above, so it never stacks on another.
  */
  React.useEffect(() => {
    const behind = pagesBehind(given, savedAt, REFRESHED)
    if (behind.length === 0) return
    for (const id of behind) REFRESHED.add(`${id}:${savedAt(id)}`)
    refresh()
  }, [given, refresh])

  const go = React.useCallback(
    (href: string) => {
      startNavigationLoading()
      router.push(href)
    },
    [router],
  )

  /*
    THE EDITOR IS ON ITS WAY BEFORE THE PRESS ENDS (round 20, the owner: "it
    should feel very smooth", and "optimize for low internet speeds"). The
    editor is the one place this page leads, and its code is the heaviest
    thing in the app: asked for only on the tap, a slow connection spent the
    first seconds after it fetching what could have been here already. It is
    fetched in a quiet moment once the page is up (not when the phone asks to
    save data), and again the moment a finger lands on the way in.
  */
  /* Edit website was pressed: its circle turns until the editor is up, or the page is shown again (back) or a long wait is over. */
  const [opening, setOpening] = React.useState(false)
  React.useEffect(() => {
    if (!opening) return
    const done = () => setOpening(false)
    const t = window.setTimeout(done, 15_000)
    window.addEventListener("pageshow", done)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener("pageshow", done)
    }
  }, [opening])
  const warmed = React.useRef(new Set<string>())
  const warm = React.useCallback(
    (href: string) => {
      if (warmed.current.has(href)) return
      warmed.current.add(href)
      try {
        router.prefetch(href)
      } catch {
        /* it is fetched on the tap instead */
      }
    },
    [router],
  )
  const editorWay = live ? editorHref(username, live.id) : starter ? editorHref(username, starter.id) : null
  React.useEffect(() => {
    if (!editorWay) return
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (conn?.saveData) return
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => warm(editorWay), { timeout: 2500 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(() => warm(editorWay), 1200)
    return () => window.clearTimeout(t)
  }, [editorWay, warm])

  /* Whether the page is still here when a request it started comes back. */
  const mounted = React.useRef(true)
  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /** One API call with a busy key, a toast on each outcome and a refresh on success. */
  const run = React.useCallback(
    async (key: string, req: () => Promise<Response>, ok: string, fail: string) => {
      setBusy(key)
      try {
        const res = await req()
        if (res.ok) {
          toast({ title: ok })
          refresh()
          return true
        }
        const d = await res.json().catch(() => ({}))
        toast({ title: d.error ?? fail, variant: "destructive" })
        return false
      } catch {
        toast({ title: fail, variant: "destructive" })
        return false
      } finally {
        setBusy(null)
      }
    },
    [refresh, toast],
  )

  const json = (method: string, body?: unknown) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const publish = (i: WebsiteSummary) =>
    run(`${i.id}:publish`, () => fetch(`/api/website-builder/themes/${i.id}/publish`, json("POST", { action: "publish" })), tt("{name} is live", { name: i.name }), tt("Could not publish"))

  const unpublish = (i: WebsiteSummary) =>
    run(`${i.id}:unpublish`, () => fetch(`/api/website-builder/themes/${i.id}/publish`, json("POST", { action: "unpublish" })), tt("{name} is offline", { name: i.name }), tt("Could not unpublish"))

  /** Something is on its way in: a second one waits for it. */
  const making = !!incoming && incoming.phase !== "error"
  const importing = making && incoming?.kind === "import"

  /**
   * ===========================================================================
   *  MAKING A WEBSITE: ITS ROW FIRST, THEN THE WEBSITE
   * ===========================================================================
   * One path for Import, Add theme and Duplicate. The placeholder row goes in
   * at once, where the new website will land; the request runs; on success
   * the page is refreshed and the row is replaced by the real one (the render
   * below drops the placeholder the moment the refreshed list has the new
   * id), which is then scrolled to. On a failure the row stays with the
   * reason and Try again, and a toast says it too. A library the server says
   * is full opens the full library sheet instead.
   *
   * One at a time, held by a ref rather than by state: two taps in the same
   * frame both saw the state from before the first, and sent two requests.
   * A page left while a request runs lets it finish (the website is made
   * either way, and the toast says so) but does not refresh or open anything
   * on the page it is no longer on.
   */
  const inFlight = React.useRef(false)
  const make = React.useCallback(
    async (
      kind: IncomingKind,
      name: string,
      request: (progress: (fraction: number) => void, sent: () => void) => Promise<{ ok: boolean; data: Record<string, unknown> }>,
      done: (data: Record<string, unknown>) => string,
      fail: string,
      again: () => void,
    ) => {
      if (inFlight.current) return
      inFlight.current = true
      retryRef.current = again
      setIncoming({ kind, name, phase: kind === "import" ? "uploading" : "working", progress: 0 })
      let result: { ok: boolean; data: Record<string, unknown> }
      try {
        result = await request(
          (progress) => setIncoming((c) => (c && c.phase === "uploading" ? { ...c, progress } : c)),
          () => setIncoming((c) => (c && c.phase === "uploading" ? { ...c, phase: "working", progress: 1 } : c)),
        )
      } catch {
        result = { ok: false, data: {} }
      } finally {
        inFlight.current = false
      }
      const { ok, data } = result
      const install = data.install as { id?: string } | undefined
      const id = (typeof data.install_id === "string" ? data.install_id : install?.id) ?? null
      if (ok && id) {
        /*
          ITS PICTURE ON ITS FIRST FRAME. The answer carries the new
          website's cover when it has one (a package's, a copy's source's, or
          a photograph that was quick enough): the tab keeps it and decodes
          it BEFORE the page is refreshed, so the row that replaces the
          placeholder is drawn with it. With none yet, the server is still
          taking it, so this page only looks for it (watchCover) instead of
          starting a second browser, and the row shows the site's name until
          it lands; if nothing lands in about 30s, it asks for one.
        */
        const cover = data.cover as Cover | null | undefined
        asked.current.add(id)
        if (cover?.url) {
          seedCover(id, cover)
          await decodedFirst(cover.url, 2500)
          setFresh((prev) => ({ ...prev, [id]: cover }))
        } else {
          markPreparing(id, true)
          void (async () => {
            const got = (data.cover_pending ? await watchCover(id) : null) ?? (await requestCover(id))
            if (got?.url) await showCover(id, got)
            markPreparing(id, false)
          })()
        }
        toast({ title: done(data) })
        if (!mounted.current) return
        setIncoming((c) => (c ? { ...c, phase: "working", installId: id } : c))
        refresh()
        return
      }
      if (data.code === LIBRARY_FULL_CODE) {
        if (!mounted.current) return
        setIncoming(null)
        retryRef.current = null
        setFull(kind)
        refresh()
        return
      }
      const message = typeof data.error === "string" ? data.error : fail
      toast({ title: message, variant: "destructive" })
      setIncoming((c) => (c ? { ...c, phase: "error", error: message } : c))
    },
    [refresh, toast, markPreparing, showCover],
  )

  /*
    THE REAL ROW REPLACES THE PLACEHOLDER. Worked out during render, so the
    frame that first draws the new website is the frame that stops drawing
    its stand-in: nothing below them moves.
  */
  const landed = !!incoming?.installId && installs.some((i) => i.id === incoming.installId)
  React.useEffect(() => {
    if (!landed || !incoming?.installId) return
    setArrived(incoming.installId)
    setIncoming(null)
    retryRef.current = null
  }, [landed, incoming])
  /* A refresh that never brings it (a stale copy of the page, say) does not leave the placeholder forever. */
  React.useEffect(() => {
    if (!incoming?.installId) return
    const t = window.setTimeout(() => {
      setIncoming(null)
      refresh()
    }, 12_000)
    return () => window.clearTimeout(t)
  }, [incoming?.installId, refresh])

  /* The placeholder is shown where it is, if that is off the screen: when it
     appears, and again when a failure makes it taller. */
  const incomingRow = React.useRef<HTMLTableRowElement>(null)
  const showingIncoming = !!incoming && !landed
  const incomingFailed = incoming?.phase === "error"
  React.useEffect(() => {
    if (showingIncoming && incomingRow.current) void scrollToRow(incomingRow.current, "nearest")
  }, [showingIncoming, incomingFailed])

  /* The new website, to the middle of the screen, then its ring. */
  React.useEffect(() => {
    if (!arrived) return
    const id = arrived
    /* Cleared at once so a later refresh does not scroll to it again. The
       scroll that follows is not cancelled by that change, only by leaving
       the page. */
    setArrived(null)
    const row = document.querySelector<HTMLElement>(`[data-install-row="${CSS.escape(id)}"]`)
    if (!row) return
    void scrollToRow(row, "center").then(() => {
      const card = libraryCard.current
      if (!mounted.current || !card || !row.isConnected) return
      const at = row.getBoundingClientRect()
      const top = at.top - card.getBoundingClientRect().top - card.clientTop
      setRinged({ top: Math.round(top), height: Math.round(at.height) })
    })
  }, [arrived])
  React.useEffect(() => {
    if (!ringed) return
    const t = window.setTimeout(() => setRinged(null), ARRIVAL_MS + 50)
    return () => window.clearTimeout(t)
  }, [ringed])

  const duplicate = (i: WebsiteSummary): Promise<void> | undefined => {
    if (slotsLeft === 0) {
      setFull("duplicate")
      return
    }
    if (making) return
    const again = () => void duplicate(i)
    return make(
      "duplicate",
      tt("{name} (copy)", { name: i.name }),
      async () => {
        const res = await fetch(`/api/website-builder/themes/${i.id}/duplicate`, json("POST", {}))
        return { ok: res.ok, data: await res.json().catch(() => ({})) }
      },
      () => tt("Copied {name}", { name: i.name }),
      tt("Could not duplicate"),
      again,
    )
  }

  const rename = (i: WebsiteSummary, name: string) =>
    run(`${i.id}:rename`, () => fetch(`/api/website-builder/themes/${i.id}`, json("PATCH", { name })), tt("Renamed"), tt("Could not rename"))

  const remove = (i: WebsiteSummary) =>
    run(`${i.id}:delete`, () => fetch(`/api/website-builder/themes/${i.id}`, { method: "DELETE" }), tt("Removed {name}", { name: i.name }), tt("Could not remove"))

  const addTheme = (def: ThemeDefinition): Promise<void> | undefined => {
    if (slotsLeft === 0) {
      setFull("add")
      return
    }
    if (making) return
    return make(
      "add",
      def.name,
      async () => {
        const res = await fetch("/api/website-builder/themes/add", json("POST", { theme_id: def.id }))
        return { ok: res.ok, data: await res.json().catch(() => ({})) }
      },
      () => tt("{name} added", { name: def.name }),
      tt("Could not add theme"),
      () => void addTheme(def),
    )
  }

  /**
   * A marketplace theme: Storelib's own goes through addTheme above; one the
   * admin uploaded is imported for this creator by /api/themes/marketplace/add,
   * which checks Pro and paid on the server whatever the card showed.
   */
  const addListing = (l: ThemeListing): Promise<void> | undefined => {
    const def = l.builtinThemeId ? getThemeDefinition(l.builtinThemeId) : null
    if (def) return addTheme(def)
    if (slotsLeft === 0) {
      setFull("add")
      return
    }
    if (making) return
    return make(
      "add",
      l.name,
      async () => {
        const res = await fetch("/api/themes/marketplace/add", json("POST", { slug: l.slug }))
        return { ok: res.ok, data: await res.json().catch(() => ({})) }
      },
      () => tt("{name} added", { name: l.name }),
      tt("Could not add theme"),
      () => void addListing(l),
    )
  }

  /**
   * ===========================================================================
   *  CREATE A WEBSITE: WITH AI, OR FROM BLANK (./start-website.tsx)
   * ===========================================================================
   * Not through `make`: the new website opens in the editor at once, so it
   * never needs a row of its own here. The request makes a Storelib Default
   * website (app/api/website-builder/themes/create); with AI, the
   * description waits in this tab for the editor's Ask panel
   * (lib/website-builder/start-handoff.ts). A library the server says is full
   * opens the full library sheet, as every other way in does.
   */
  const [starting, setStarting] = React.useState<StartMode | null>(null)
  const startFlight = React.useRef(false)
  /* Back from the editor (the page kept by the browser): the doors are pressable again. */
  React.useEffect(() => {
    const back = () => setStarting(null)
    window.addEventListener("pageshow", back)
    return () => window.removeEventListener("pageshow", back)
  }, [])
  /*
    START WITH AI IS A JOB ON THE SERVER (lib/website-builder/ai-site): the description goes in the request body with a
    key for this press (one press, one website and one job, even sent twice after a lost answer), and the editor opens on
    the new website following the job (`job=` in its address). Without the job table yet the answer says `fallback` and
    the description waits in this tab for the editor, which builds the site in its own request.
  */
  const startKey = React.useRef<{ prompt: string; key: string } | null>(null)
  const startWebsite = async (mode: StartMode, prompt?: string) => {
    if (slotsLeft === 0) {
      setFull("create")
      return
    }
    if (startFlight.current || making) return
    startFlight.current = true
    setStarting(mode)
    let leaving = false
    if (mode === "ai" && prompt && startKey.current?.prompt !== prompt) startKey.current = { prompt, key: newStartKey() }
    try {
      const res = await fetch("/api/website-builder/themes/create", json("POST", mode === "ai" && prompt ? { mode, prompt, key: startKey.current!.key } : { mode }))
      const data = (await res.json().catch(() => ({}))) as { install?: { id?: string }; cover?: Cover | null; cover_pending?: boolean; code?: string; error?: string; job?: { id?: string } | null; fallback?: boolean }
      if (!res.ok || !data.install?.id) {
        if (data.code === LIBRARY_FULL_CODE) {
          setFull("create")
          refresh()
          return
        }
        toast({ title: typeof data.error === "string" ? data.error : tt("Could not create the website"), variant: "destructive" })
        return
      }
      const id = data.install.id
      /* Its first picture, for this page when the editor is closed: kept now, or looked for while it is taken. */
      asked.current.add(id)
      if (data.cover?.url) seedCover(id, data.cover)
      else if (data.cover_pending) void watchCover(id)
      const jobId = typeof data.job?.id === "string" ? data.job.id : null
      if (mode === "ai" && prompt && !jobId) {
        let storage: Storage | null = null
        try {
          storage = window.sessionStorage
        } catch {
          /* the editor opens the Ask panel empty */
        }
        saveStartPrompt(storage, id, prompt)
      }
      startKey.current = null
      leaving = true
      setOpening(true)
      go(mode === "ai" ? (jobId ? withJobParam(editorHref(username, id), jobId) : withStartParam(editorHref(username, id))) : editorHref(username, id))
    } catch {
      toast({ title: tt("Could not create the website"), variant: "destructive" })
    } finally {
      startFlight.current = false
      if (!leaving && mounted.current) setStarting(null)
    }
  }

  const exportTheme = async (i: WebsiteSummary) => {
    setBusy(`${i.id}:export`)
    try {
      const res = await fetch(`/api/website-builder/themes/${i.id}/export`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast({ title: d.error ?? tt("Could not export"), variant: "destructive" })
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      /* `a.download` WINS over the server's Content-Disposition for a blob
         URL, so the name has to end in .zip here too or the header's does
         nothing. See the note in the export route. */
      a.download = `${i.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.storelib-theme.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast({ title: tt("Exported {name}", { name: i.name }) })
    } finally {
      setBusy(null)
    }
  }

  /**
   * The file goes straight to storage by XMLHttpRequest, so the row can say
   * how much of it has gone, and then the server makes the website from it
   * (see importThemeFile). A full library never starts an upload: it opens
   * the sheet first, here and on the button.
   */
  const importZip = async (file: File): Promise<void> => {
    if (fileInput.current) fileInput.current.value = ""
    /* Importing stays the store owner's (round 42): a member's dropped file is not sent. */
    if (teamMember) return
    if (slotsLeft === 0) {
      setFull("import")
      return
    }
    if (making) return
    await make(
      "import",
      nameFromFile(file),
      (progress, sent) => importThemeFile(file, { progress, sent }),
      (data) =>
        tt("Imported {value}{value2}", { value: typeof data.name === "string" ? data.name : nameFromFile(file), value2: typeof data.media === "string" && data.media && data.media !== "nothing" ? tt(" with {media}", { media: data.media }) : "" }) +
        /* A second header or footer the package wrote as a section, left out so the site keeps its own. */
        (Array.isArray(data.left_out) && data.left_out.length ? `. Its extra ${data.left_out.join(" and ")} section was left out; the site's own is used` : "") +
        /* A Shopify theme: how many of its sections made it across (lib/storelib-theme/shopify/convert.ts). */
        (typeof (data.shopify as { summary?: unknown } | undefined)?.summary === "string" ? `. ${(data.shopify as { summary: string }).summary}` : ""),
      tt("Could not import that file"),
      () => void importZip(file),
    )
  }

  /**
   * A theme file dropped on Import theme, or anywhere in the library, takes
   * the same path as the file picker. Leaving only counts when the pointer
   * has gone outside the section, so crossing a row does not flicker.
   */
  const [libraryDrop, setLibraryDrop] = React.useState(false)
  React.useEffect(() => {
    const reset = () => setLibraryDrop(false)
    window.addEventListener("dragend", reset)
    return () => window.removeEventListener("dragend", reset)
  }, [])
  const onLibraryDragEnter = (e: React.DragEvent) => {
    if (!dragHasFiles(e) || importing) return
    e.preventDefault()
    setLibraryDrop(true)
  }
  const onLibraryDragOver = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = importing ? "none" : "copy"
  }
  const onLibraryDragLeave = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return
    const next = e.relatedTarget
    if (next instanceof Node && e.currentTarget.contains(next)) return
    setLibraryDrop(false)
  }
  const onLibraryDrop = (e: React.DragEvent) => {
    if (!dragHasFiles(e)) return
    e.preventDefault()
    e.stopPropagation()
    setLibraryDrop(false)
    if (importing) return
    const file = droppedThemeFile(e.dataTransfer.files)
    if (!file) {
      toast({ title: tt("Drop a .storelib-theme.zip file"), variant: "destructive" })
      return
    }
    void importZip(file)
  }

  /**
   * THE MORE MENU, in Shopify's action list shape: groups, a hairline
   * between them, and what cannot be undone last and in red.
   *
   * View website is not in it: that is the button beside the page title, at
   * every width. Take offline stays in the live site's menu, because on a
   * phone the title has no room for the Public control that also offers it.
   */
  const menuFor = (i: WebsiteSummary, opts: { publish?: boolean } = {}): ActionMenuItem[] => {
    const items: ActionMenuItem[] = []
    /* A site that was live and was taken offline goes back up from its own row. */
    if (opts.publish) items.push({ label: i.status === "unpublished" ? tt("Publish again") : tt("Publish"), icon: <Rocket />, onClick: () => setPublishing(i) })
    items.push(
      { label: tt("Edit code"), icon: <Code2 />, onClick: () => go(editorHref(username, i.id, "code")), separatorBefore: items.length > 0 },
      /* The live site's settings are the Settings button beside Edit website; a draft's are here. */
      ...(i.status === "published" ? [] : [{ label: tt("Website settings"), icon: <Settings2 />, onClick: () => go(editorHref(username, i.id, "settings")) }]),
      { label: tt("Rename"), icon: <Pencil />, onClick: () => setRenaming(i) },
      { label: tt("Duplicate"), icon: <Layers />, onClick: () => void duplicate(i) },
      ...(teamMember ? [] : [{ label: tt("Export theme"), icon: <Download />, onClick: () => void exportTheme(i) }]),
    )
    if (i.status === "published") {
      items.push({ label: tt("Take offline"), icon: <EyeOff />, onClick: () => setUnpublishing(i), variant: "warning", separatorBefore: true })
    } else if (installs.length > 1 && !teamMember) {
      /* Not the only website: an empty library is given the default theme
         again on the next visit, so removing the last one would only put a
         fresh copy back. */
      items.push({ label: tt("Remove"), icon: <Trash2 />, onClick: () => setDeleting(i), variant: "destructive", separatorBefore: true })
    }
    return items
  }

  /**
   * PUBLIC, BESIDE THE TITLE. Whether visitors see the site, as Shopify says
   * it: Public with Take offline under it while a website is live, and
   * Unpublished with Publish again for the one that was, through the same
   * questions the card and the rows ask. With neither (only drafts, or no
   * website at all) there is nothing for it to say, so it is not drawn.
   */
  const publicControl: { label: string; live: boolean; busy: boolean; items: ActionMenuItem[] } | null = live
    ? {
        label: tt("Public"),
        live: true,
        busy: busy === `${live.id}:unpublish`,
        items: [{ label: tt("Take offline"), icon: <EyeOff />, onClick: () => setUnpublishing(live), variant: "warning" }],
      }
    : offline
      ? {
          label: tt("Unpublished"),
          live: false,
          busy: busy === `${offline.id}:publish`,
          items: [{ label: tt("Publish again"), icon: <Rocket />, onClick: () => setPublishing(offline) }],
        }
      : null

  /* Browse themes: eight of the marketplace's themes, then a card to the rest. */
  const explore = listings.slice(0, LIBRARY_THEME_CARDS)
  /*
    BROWSE THEMES WAITS FOR THE PAGE'S FIRST FRAME, ON A PHONE. It is a
    screen below the fold there, and a drawn cover with a dozen lines of SVG
    text is the dearest thing on the page to lay out: laid out with the rest
    it made the frame that first paints the page one task of 115ms at a
    phone's speed (scripts/check-website-arrival.mjs), with the spinner's
    way out waiting behind it. So below md it starts `content-visibility:
    hidden` in the room it will take, and is let in on the frame after the
    first paint, as an attribute: no render of the page for it.
  */
  const exploreSection = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => exploreSection.current?.setAttribute("data-shown", ""))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [])

  /*
    NO FADE OF ITS OWN. This box carried `.app-page-enter`, a fade from
    opacity 0, which the shell switches off with `html.app-layout`. That class
    is added by an effect after hydration, so a page that arrives as a
    document (the sidebar's Website row on the web, a reload, a cold start,
    the session's recovery) was painted at opacity 0 first: the spinner went,
    the content area was flat grey, then the page came up. The shell's
    landing (components/app/app-stage.tsx) is the only arrival an /app page
    needs, and a document is whole on its first frame.
  */
  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa]">
      <div data-wb-page="" className="mx-auto max-w-[1200px] space-y-7 app-gutter py-6">
        {/* ── Header ─────────────────────────────────────────────────
            The title, the address under it, and on the title's line the two
            things you do to the site as a whole, as white secondary buttons:
            whether it is public, and a way to look at it. Settings moved
            down beside Edit website, where the site it opens is named.

            On a phone the line has room for one, and it is View, with an
            eye. Public is not lost there: Take offline is in the live card's
            More menu, and Publish again is on the offline card and row. The
            eye belongs to View, so Public wears a globe (and Unpublished its
            crossed eye), and the two never show the same mark. */}
        <div>
          <div className="flex items-center justify-between gap-3" data-title-row="">
            <h1 className="min-w-0 truncate text-[24px] font-bold tracking-tight text-[#1a1a2e] sm:text-[28px]">{tt("Website")}</h1>
            {(publicControl || siteUrl) && (
              <div className="flex shrink-0 items-center gap-2">
                {publicControl && (
                  <div className="hidden sm:block">
                    <ResponsiveActionMenu
                      title={publicControl.label}
                      items={publicControl.items}
                      menuWidth="w-48"
                      trigger={
                        <button type="button" data-control="public" className={HEADER_BUTTON}>
                          {publicControl.busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : publicControl.live ? (
                            <Globe className="h-4 w-4 text-[#4b5563]" strokeWidth={1.9} />
                          ) : (
                            <EyeOff className="h-4 w-4 text-[#4b5563]" strokeWidth={1.9} />
                          )}
                          {publicControl.label}
                          <ChevronDown className="-mr-0.5 h-4 w-4 text-[#6b7280]" strokeWidth={1.9} />
                        </button>
                      }
                    />
                  </div>
                )}
                {siteUrl &&
                  (live ? (
                    <a {...liveSiteLink(ownOpen(siteUrl))} aria-label={tt("View website")} data-control="view" className={HEADER_BUTTON}>
                      <ViewLabel />
                    </a>
                  ) : (
                    <button type="button" disabled aria-label={tt("View website")} data-control="view" className={HEADER_BUTTON}>
                      <ViewLabel />
                    </button>
                  ))}
              </div>
            )}
          </div>
          {siteUrl && <SiteAddress url={siteUrl} display={siteDisplay} />}
        </div>

        {/* ── Create a website: Start with AI, Start from blank, Browse themes (./start-website.tsx) ── */}
        <StartWebsite
          full={slotsLeft === 0}
          teamMember={teamMember}
          starting={starting}
          blocked={making}
          onStart={(mode, prompt) => void startWebsite(mode, prompt)}
          onFull={() => setFull("create")}
          onBrowse={() => startNavigationLoading()}
        />

        {/* ── Live website ─────────────────────────────────────────
            `data-page-block` marks the three blocks that have to sit on the
            page's own two gutters. scripts/check-website-page.mjs reads them
            and compares the left inset to the right, which is the complaint
            that started this rewrite: things on this page did not line up. */}
        <section aria-labelledby="live-heading" className="space-y-3" data-page-block>
          <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {live ? (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                  {/* ── The cover ───────────────────────────────────────
                      Set into the card rather than cut flush with its edge,
                      so it has corners of its own on all four sides: above
                      the details on a phone, on their left from `lg`. See
                      COVER_FRAME. */}
                  <div className="min-w-0 p-4 pb-3 lg:pb-4 lg:pr-2">
                    <button
                      type="button"
                      onClick={() => go(editorHref(username, live.id))}
                      onPointerDown={() => warm(editorHref(username, live.id))}
                      aria-label={tt("Edit {name}", { name: live.name })}
                      data-cover=""
                      data-picture-press=""
                      className={COVER_FRAME}
                    >
                      <WebsiteCover install={live} eager preparing={!!preparing[live.id]} />
                    </button>
                  </div>
                  <div className="flex min-w-0 flex-col px-4 pb-4 pt-2 lg:p-6 lg:pl-4">
                    <StatusDot status="published" />
                    <h2 id="live-heading" className="mt-2 truncate text-[20px] font-semibold tracking-tight text-[#1a1a2e]">
                      {live.name}
                    </h2>
                    {/* ── The facts, as a list ──────────────────────────────
                        Label on the left, value on the right, a hairline
                        between: the way a settings page states things, and
                        easier to scan than a sentence with dots in it. The
                        theme row only when it is not the site's name again. */}
                    <dl className="mt-4 divide-y divide-[#f0f1f3] border-y border-[#f0f1f3] text-[13px]">
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="text-[#6b7280]">{tt("Published")}</dt>
                        <dd className="text-right font-medium text-[#1a1a2e]">{live.published_at ? since(live.published_at) : tt("Yes")}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="text-[#6b7280]">{tt("Last edited")}</dt>
                        <dd className="text-right font-medium text-[#1a1a2e]">{since(live.saved_at)}</dd>
                      </div>
                      {/* Its visitors and orders in the last 30 days, opening Analytics filtered to this website (components/app/analytics-summary-line). */}
                      <AnalyticsSummaryFact property={`website:${live.id}`} account={account} />
                      {live.theme && live.theme.name !== live.name && (
                        <div className="flex items-center justify-between gap-4 py-2.5">
                          <dt className="text-[#6b7280]">{tt("Theme")}</dt>
                          <dd className="min-w-0 truncate text-right font-medium text-[#1a1a2e]">
                            {live.theme.name} <span className="font-normal text-[#9ca3af]">v{live.theme.version}</span>
                          </dd>
                        </div>
                      )}
                    </dl>
                    {/* One line at every width: Edit website, then Settings and
                        More as 44px squares, with Take offline last in More. */}
                    <div className="mt-auto flex gap-2 pt-5" data-card-actions="">
                      <Button
                        onClick={() => {
                          setOpening(true)
                          go(editorHref(username, live.id))
                        }}
                        onPointerDown={() => {
                          warm(editorHref(username, live.id))
                          hapticTap("light")
                        }}
                        data-edit-website=""
                        data-opening={opening ? "" : undefined}
                        aria-busy={opening || undefined}
                        /*
                          THE PRESS IS ANSWERED BY A CIRCLE, AND BY NOTHING ELSE
                          (round 21, the owner: "it should not bump or zoom ...
                          extremely subtle and clean, not even fade, maybe a
                          loading smooth circle"). The button stays exactly as it
                          is under a finger: no sink, no darker shade, no fade, no
                          grey flash of the browser's own. Once pressed, a small
                          circle turns beside the words until the editor is up: a
                          rotation only, which the screen draws by itself, so it
                          keeps turning while the page is busy opening the editor.
                        */
                        className="h-11 min-w-0 flex-1 rounded-xl bg-[#1a1a2e] text-[14px] font-semibold text-white [-webkit-tap-highlight-color:transparent] touch-manipulation hover:bg-[#2d2d44] active:bg-[#1a1a2e]"
                      >
                        {/* The circle hangs just left of the words, out of the line, so the words never move when it appears. */}
                        <span className="relative">
                          {opening ? <span aria-hidden data-edit-spinner="" className="wb-edit-spinner" /> : null}
                          {tt("Edit website")}
                        </span>
                      </Button>
                      <Tooltip delayDuration={400}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            data-control="settings"
                            aria-label={tt("Settings")}
                            onClick={() => go(editorHref(username, live.id, "settings"))}
                            className={SETTINGS_ON_CARD}
                          >
                            <Settings className="h-[18px] w-[18px]" strokeWidth={1.8} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6} className={TOOLTIP}>
                          {tt("Settings")}
                        </TooltipContent>
                      </Tooltip>
                      <ResponsiveActionMenu
                        title={live.name}
                        items={menuFor(live)}
                        menuWidth="w-56"
                        trigger={
                          <button type="button" aria-label={tt("More actions for {name}", { name: live.name })} data-more-button="" className={MORE_ON_CARD}>
                            {busy?.startsWith(live.id) ? (
                              <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4 text-[#4b5563]" strokeWidth={1.9} />
                            )}
                          </button>
                        }
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : starter ? (
              /* A draft and nothing live: its picture, its name, and the two
                 things to do with it, Customize first and Publish beside it. */
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" data-starter-card="">
                <div className="min-w-0 p-4 pb-3 lg:pb-4 lg:pr-2">
                  <button
                    type="button"
                    onClick={() => go(editorHref(username, starter.id))}
                    aria-label={tt("Customize {name}", { name: starter.name })}
                    data-cover=""
                    data-picture-press=""
                    className={COVER_FRAME}
                  >
                    <WebsiteCover install={starter} eager preparing={!!preparing[starter.id]} />
                  </button>
                </div>
                <div className="flex min-w-0 flex-col px-4 pb-4 pt-2 lg:p-6 lg:pl-4">
                  {/* Said as what it is, not as "Draft", a word that reads as a fault here. */}
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#6b7280]" data-starter-status="">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#9ca3af]" />
                    {tt("Not published yet")}
                  </span>
                  <h2 id="live-heading" className="mt-2 truncate text-[20px] font-semibold tracking-tight text-[#1a1a2e]">
                    {starter.name}
                  </h2>
                  <dl className="mt-4 divide-y divide-[#f0f1f3] border-y border-[#f0f1f3] text-[13px]">
                    <div className="flex items-center justify-between gap-4 py-2.5">
                      <dt className="text-[#6b7280]">{tt("Last edited")}</dt>
                      <dd className="text-right font-medium text-[#1a1a2e]">{since(starter.saved_at)}</dd>
                    </div>
                    {starter.theme && starter.theme.name !== starter.name && (
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="text-[#6b7280]">{tt("Theme")}</dt>
                        <dd className="min-w-0 truncate text-right font-medium text-[#1a1a2e]">{starter.theme.name}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-auto flex gap-2 pt-5" data-card-actions="">
                    <Button
                      onClick={() => go(editorHref(username, starter.id))}
                      className="h-11 min-w-0 flex-1 rounded-xl bg-[#1a1a2e] text-[14px] font-semibold text-white hover:bg-[#2d2d44]"
                      data-control="customize"
                    >
                      {tt("Customize")}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setPublishing(starter)}
                      disabled={busy === `${starter.id}:publish`}
                      data-control="publish"
                      className={PUBLISH_ON_CARD}
                    >
                      {busy === `${starter.id}:publish` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4 text-[#4b5563]" strokeWidth={1.9} />}
                      {tt("Publish")}
                    </button>
                    <ResponsiveActionMenu
                      title={starter.name}
                      items={menuFor(starter)}
                      menuWidth="w-56"
                      trigger={
                        <button type="button" aria-label={tt("More actions for {name}", { name: starter.name })} data-more-button="" className={MORE_ON_CARD}>
                          {busy?.startsWith(starter.id) && busy !== `${starter.id}:publish` ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4 text-[#4b5563]" strokeWidth={1.9} />
                          )}
                        </button>
                      }
                    />
                  </div>
                </div>
              </div>
            ) : installs.length === 0 && !offline ? (
              /* No website at all: the server could not make the first one
                 (lib/website-builder/starter-website.ts). One press adds it. */
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-live-empty="first">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3f4f6] text-[#6b7280]">
                  <Rocket className="h-4.5 w-4.5" />
                </span>
                <h2 id="live-heading" className="text-[15px] font-semibold text-[#1a1a2e]">
                  {tt("No website yet")}
                </h2>
                <p className="max-w-[320px] text-[13px] text-[#6b7280]">{tt("Start from a theme, change what you like, and publish when it is ready.")}</p>
                {explore[0] && (
                  <Button
                    onClick={() => void addListing(explore[0])}
                    disabled={making}
                    className="mt-2 h-11 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white hover:bg-[#2d2d44] sm:h-10"
                  >
                    {making && <Loader2 className="h-4 w-4 animate-spin" />}
                    {tt("Add {name}", { name: explore[0].name })}
                  </Button>
                )}
              </div>
            ) : (
              /* Nothing live. When a website was, the card says which and puts it back
                 in one press, at every width: on a phone the title has no
                 room for the Unpublished control. */
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-live-empty={offline ? "offline" : "none"}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3f4f6] text-[#6b7280]">
                  {offline ? <EyeOff className="h-4.5 w-4.5" /> : <Rocket className="h-4.5 w-4.5" />}
                </span>
                <h2 id="live-heading" className="text-[15px] font-semibold text-[#1a1a2e]">
                  {offline ? tt("Your website is offline") : tt("Nothing is live")}
                </h2>
                <p className="max-w-[320px] text-[13px] text-[#6b7280]">
                  {offline ? <>{tt("Visitors see a placeholder. {name} was the last one live.", { name: offline.name })}</> : tt("Publish a website from your library.")}
                </p>
                {offline && (
                  <Button
                    onClick={() => setPublishing(offline)}
                    disabled={busy === `${offline.id}:publish`}
                    className="mt-2 h-11 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white hover:bg-[#2d2d44] sm:h-10"
                  >
                    {busy === `${offline.id}:publish` && <Loader2 className="h-4 w-4 animate-spin" />}
                    {tt("Publish again")}
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Library ────────────────────────────────────────────── */}
        <section
          aria-labelledby="library-heading"
          data-page-block
          data-library-drop={libraryDrop ? "over" : "idle"}
          onDragEnter={teamMember ? undefined : onLibraryDragEnter}
          onDragOver={teamMember ? undefined : onLibraryDragOver}
          onDragLeave={teamMember ? undefined : onLibraryDragLeave}
          onDrop={teamMember ? undefined : onLibraryDrop}
          className="space-y-3"
        >
          <SectionHeading
            title={tt("Library")}
            /**
             * How full it is, as a count of websites, with the rule behind a
             * dotted underline: one live and the rest drafts (LIBRARY_RULE). "2 left" answered
             * whether there was room without saying what the room was for,
             * and the limit was only ever written in a toast.
             */
            aside={
              <HelpLabel
                label={
                  <span className="text-[12.5px] font-medium tabular-nums text-[#6b7280]">
                    {/* A library from before the limit can hold more than it
                        allows, and "5 of 3" reads as a broken counter. */}
                    {slotsUsed > THEME_INSTALL_LIMIT ? tt("{slotsUsed} websites", { slotsUsed }) : tt("{slotsUsed} of {themeInstallLimit} websites", { slotsUsed, themeInstallLimit: THEME_INSTALL_LIMIT })}
                  </span>
                }
                title={LIBRARY_RULE_TITLE}
                description={tt("{libraryRule} One is live at a time, and the others are drafts you can edit and publish in its place. Remove one to add another.", { libraryRule: LIBRARY_RULE })}
              />
            }
          >
            <input
              ref={fileInput}
              type="file"
              accept=".storelib-theme,.zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importZip(f)
              }}
            />
            {/* 44px, like every other button on the page. While a file is
                on its way it says how far, then that the server has it; the
                row it will become is already in the list below. */}
            {teamMember ? null : (
            <Button
              variant="ghost"
              /* Never dead: with the library full it says why, instead of doing nothing. */
              onClick={() => (slotsLeft === 0 ? setFull("import") : fileInput.current?.click())}
              disabled={importing}
              aria-haspopup={slotsLeft === 0 ? "dialog" : undefined}
              data-import-button={importing ? incoming?.phase : libraryDrop ? "drop" : "idle"}
              /* As wide as "Uploading 100%", so Add theme beside it does not move while it counts. */
              className="h-11 min-w-[140px] rounded-xl px-3 text-[13px] font-medium tabular-nums text-[#4b5563] hover:bg-[#eef0f3] hover:text-[#1a1a2e] disabled:opacity-100"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing && incoming ? (incoming.phase === "uploading" ? tt("Uploading {value}%", { value: Math.round(incoming.progress * 100) }) : tt("Importing")) : tt("Import theme")}
            </Button>
            )}
            {/* Add theme was here: it is Browse themes in Create a website now, the same page (./start-website.tsx). */}
          </SectionHeading>
          <h2 id="library-heading" className="sr-only">{tt("Library")}</h2>

          {/* ── A table, not a stack of cards ───────────────────────────
              Column headings once, at the top, and each website a row under
              them: the name where the eye starts, then the facts in columns
              that line up down the page, then what you can do. A phone has
              no room for columns, so the facts fold under the name. */}
          <div ref={libraryCard} className="relative overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div
              aria-hidden
              data-library-drop-veil=""
              className={cn(
                "pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/80 transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                libraryDrop ? "opacity-100" : "opacity-0",
              )}
            >
              <span className={cn("inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-[13.5px] font-semibold text-[#1a1a2e] shadow-[0_10px_30px_-16px_rgba(17,24,39,0.45)] transition-transform duration-200", libraryDrop ? "scale-100" : "scale-95")}>
                <Upload className="h-4 w-4" />
                {tt("Drop to import")}
              </span>
            </div>
            {ringed && (
              <div
                aria-hidden
                data-arrival-ring=""
                className="wb-arrived pointer-events-none absolute inset-x-0 z-10"
                style={{ top: ringed.top, height: ringed.height, "--wb-arrived-ms": `${ARRIVAL_MS}ms` } as React.CSSProperties}
              />
            )}
            {library.length === 0 && !showingIncoming ? (
              <div className="px-6 py-9 text-center text-[13px] text-[#6b7280]">
                {tt("No drafts. Create a website above to start another.")}
              </div>
            ) : (
              <table className="w-full table-fixed border-collapse text-left">
                <thead className="hidden bg-[#fafbfb] sm:table-header-group">
                  <tr className="border-b border-[#eceef1] text-[12px] font-medium text-[#6b7280]">
                    <th scope="col" className="h-9 px-4 font-medium">{tt("Website")}</th>
                    <th scope="col" className="h-9 w-[104px] px-3 font-medium">{tt("Status")}</th>
                    <th scope="col" className="hidden h-9 w-[132px] px-3 font-medium md:table-cell">{tt("Last edited")}</th>
                    <th scope="col" className="h-9 w-[216px] px-4 text-right font-medium">
                      <span className="sr-only">{tt("Actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eceef1]">
                  {/* An import lands first in the library (lib/website-builder/library-limit.ts, firstSortOrder), so its row is drawn there. */}
                  {showingIncoming && incoming && incoming.kind === "import" && (
                    <IncomingRow
                      ref={incomingRow}
                      incoming={incoming}
                      onRetry={() => retryRef.current?.()}
                      onDismiss={() => {
                        setIncoming(null)
                        retryRef.current = null
                      }}
                    />
                  )}
                  {library.map((i) => {
                    const def = getThemeDefinition(i.theme_id)
                    const isBusy = busy?.startsWith(i.id) ?? false
                    return (
                      <tr
                        key={i.id}
                        data-install-row={i.id}
                        /* On a fine pointer only: a tap turns :hover on in
                           several mobile engines and leaves it on until
                           something else is tapped, so the row you opened
                           stayed shaded behind you. */
                        className="transition-colors duration-150 pointer-fine:hover:bg-[#fafbfc]"
                      >
                        <td className="p-3 sm:px-4">
                          {/* The whole cell opens the editor: on a phone it is
                              the only Edit there is. */}
                          <button
                            type="button"
                            onClick={() => go(editorHref(username, i.id))}
                            className="flex w-full min-w-0 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:gap-4"
                            aria-label={tt("Edit {name}", { name: i.name })}
                          >
                            <span className="relative block w-24 shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] sm:w-28">
                              <span className="block aspect-[16/10]">
                                <WebsiteCover install={i} preparing={!!preparing[i.id]} />
                              </span>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-semibold text-[#1a1a2e]">{i.name}</span>
                              <span className="mt-0.5 block truncate text-[12.5px] text-[#6b7280]">
                                {/* On a phone the columns fold in here, and the
                                    edit time is the fact worth the room. */}
                                <span className="hidden sm:inline">{def ? getIndustry(def.industry).label : i.theme?.name ?? tt("Theme")}</span>
                                <span className="sm:hidden">{i.id === offline?.id ? tt("Offline") : tt("Draft")} · {tt("Edited {saved_at}", { saved_at: since(i.saved_at) })}</span>
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="hidden px-3 sm:table-cell">
                          <DraftBadge offline={i.id === offline?.id} />
                        </td>
                        <td className="hidden px-3 text-[13px] text-[#4b5563] md:table-cell">{since(i.saved_at)}</td>
                        <td className="w-[52px] pr-3 sm:w-auto sm:px-4">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setPublishing(i)}
                              disabled={isBusy}
                              className="hidden h-9 rounded-lg border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f8f9fa] sm:inline-flex"
                            >
                              {busy === `${i.id}:publish` && <Loader2 className="h-4 w-4 animate-spin" />}
                              {tt("Publish")}
                            </Button>
                            <Button
                              onClick={() => go(editorHref(username, i.id))}
                              className="hidden h-9 rounded-lg bg-[#1a1a2e] px-3.5 text-[13px] font-medium text-white hover:bg-[#2d2d44] sm:inline-flex"
                            >
                              {tt("Edit")}
                            </Button>
                            <ResponsiveActionMenu
                              title={i.name}
                              items={menuFor(i, { publish: true })}
                              menuWidth="w-52"
                              trigger={
                                <button
                                  type="button"
                                  aria-label={tt("More actions for {name}", { name: i.name })}
                                  data-more-button=""
                                  className={MORE_ON_ROW}
                                >
                                  {isBusy && busy !== `${i.id}:publish` ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                                </button>
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {/* Where a website being added or copied will land: after the others. */}
                  {showingIncoming && incoming && incoming.kind !== "import" && (
                    <IncomingRow
                      ref={incomingRow}
                      incoming={incoming}
                      onRetry={() => retryRef.current?.()}
                      onDismiss={() => {
                        setIncoming(null)
                        retryRef.current = null
                      }}
                    />
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* ── Explore ────────────────────────────────────────────── */}
        {/* `content-visibility: auto`: four drawn covers below the fold are
            not laid out or painted until they are scrolled near, so the top
            of the page is ready sooner on a phone. And on a phone not on the
            page's first frame at all (exploreSection, above). */}
        <section
          ref={exploreSection}
          aria-labelledby="explore-heading"
          className="space-y-3 pb-6 [contain-intrinsic-size:auto_420px] [content-visibility:auto] max-md:[content-visibility:hidden] max-md:data-shown:[content-visibility:auto]"
          data-page-block
        >
          <SectionHeading title={tt("Browse themes")}>
            {/* The whole marketplace, in its own tab: inside the phone app, a new window from the creator's tools opens in the browser (components/platform/native-link-guard.tsx). */}
            <a
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[14px] font-semibold text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.06),inset_0_-1px_0_rgba(16,24,40,0.04)] transition-[background-color,border-color,box-shadow] duration-150 hover:border-[#d1d5db] hover:bg-[#f9fafb] hover:shadow-[0_2px_6px_-2px_rgba(16,24,40,0.12)] active:bg-[#f3f4f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
              href={MARKETPLACE_PATH}
              target="_blank"
              rel="noopener"
              data-theme-marketplace-link=""
            >
              {tt("Theme marketplace")}
              <ArrowUpRight className="h-3.5 w-3.5 text-[#6b7280]" strokeWidth={2.25} />
            </a>
          </SectionHeading>
          <h2 id="explore-heading" className="sr-only">{tt("Browse themes")}</h2>
          <div data-theme-grid="" className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {explore.map((t) => (
              <ThemeCard
                key={t.slug}
                listing={t}
                href={listingPath(t.slug)}
                newTab
                action={
                  <LibraryThemeAction
                    listing={t}
                    inLibrary={!!t.builtinThemeId && installedThemeIds.has(t.builtinThemeId)}
                    busy={making && incoming?.kind === "add" && incoming.name === t.name}
                    onAdd={() => void addListing(t)}
                  />
                }
              />
            ))}
            <ExploreThemesCard href={MARKETPLACE_PATH} />
          </div>

        </section>
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────── */}
      <RenameDialog
        install={renaming}
        onClose={() => setRenaming(null)}
        onSubmit={async (name) => {
          if (!renaming) return
          const ok = await rename(renaming, name)
          if (ok) setRenaming(null)
        }}
      />

      <AlertDialog open={!!publishing} onOpenChange={(o) => !o && setPublishing(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{tt("Publish “{name}”?", { name: publishing?.name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {live
                ? <Rich text={tt("It replaces “{name}” at {site}. Nothing is deleted.", { name: live.name })} parts={{ site: <span className="font-medium text-foreground">{siteDisplay}</span> }} />
                : <Rich text={tt("It goes live at {site}.")} parts={{ site: <span className="font-medium text-foreground">{siteDisplay}</span> }} />}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">{tt("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-[#1a1a2e] hover:bg-[#2d2d44]"
              onClick={() => {
                const target = publishing
                setPublishing(null)
                if (target) void publish(target)
              }}
            >
              {tt("Publish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!unpublishing} onOpenChange={(o) => !o && setUnpublishing(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{tt("Take “{name}” offline?", { name: unpublishing?.name })}</AlertDialogTitle>
            <AlertDialogDescription>{tt("Visitors see a placeholder until you publish again.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">{tt("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                const target = unpublishing
                setUnpublishing(null)
                if (target) void unpublish(target)
              }}
            >
              {tt("Take offline")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LibraryFullDialog
        action={full}
        entries={installs.map((i) => ({ id: i.id, name: i.name, live: i.status === "published", offline: i.id === offline?.id }))}
        onClose={() => setFull(null)}
        onRemove={(id) => {
          const target = installs.find((i) => i.id === id)
          setFull(null)
          if (target) setDeleting(target)
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{tt("Remove “{name}”?", { name: deleting?.name })}</AlertDialogTitle>
            <AlertDialogDescription>{tt("Its pages, settings and code are deleted. Export first to keep a copy.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">{tt("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-red-600 hover:bg-red-700"
              onClick={() => {
                const target = deleting
                setDeleting(null)
                if (target) void remove(target)
              }}
            >
              {tt("Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* A refresh in flight after a mutation: a hairline at the top, nothing else moves. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-[#1a1a2e] transition-[opacity,translate,scale] duration-300",
          isRefreshing ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
        )}
      />
    </div>
  )
}

/**
 * The lift on hover travels `translate`, NOT `transform`.
 *
 * Tailwind v4 compiles `-translate-y-0.5` to the standalone `translate:`
 * property, so a transition naming `transform` names something the card never
 * sets: the shadow faded over 200ms while the card itself jumped the two
 * pixels in one frame. That half-and-half is what reads as cheap — the eye
 * sees the slide fail and the glow succeed at the same time.
 *
 * `motion-reduce:transition-none` rather than `transform-none`, for the same
 * reason: `transform-none` was switching off a property that was not in use.
 */
/**
 * The end of a Browse themes card's name row: Add, or that it is in the
 * library already. A Pro or paid theme opens its page in the marketplace,
 * where its price and plan are explained, rather than failing here.
 */
function LibraryThemeAction({ listing, inLibrary, busy, onAdd }: { listing: ThemeListing; inLibrary: boolean; busy: boolean; onAdd: () => void }) {
  if (inLibrary) {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#f1f2f4] px-3 text-[12.5px] font-medium text-[#3f3f46]">
        <Check className="h-3.5 w-3.5" />
        {tt("In library")}
      </span>
    )
  }
  if (listing.tier !== "free") {
    return (
      <a
        href={listingPath(listing.slug)}
        target="_blank"
        rel="noopener"
        className="inline-flex h-11 items-center rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] font-semibold text-[#1a1a2e] transition-colors duration-150 hover:bg-[#f8f9fa] sm:h-9"
      >
        {tt("View")}
      </a>
    )
  }
  return (
    <Button onClick={onAdd} disabled={busy} className="h-11 shrink-0 rounded-lg bg-[#1a1a2e] px-3.5 sm:h-9 text-[13px] font-semibold text-white hover:bg-[#2d2d44]">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {tt("Add")}
    </Button>
  )
}

function RenameDialog({
  install,
  onClose,
  onSubmit,
}: {
  install: WebsiteSummary | null
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => {
    if (install) setName(install.name)
  }, [install])
  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || !install || trimmed === install.name) {
      onClose()
      return
    }
    setSaving(true)
    try {
      await onSubmit(trimmed)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={!!install} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tt("Rename")}</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          autoFocus
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void submit()
            }
          }}
          className="h-10 rounded-lg"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-lg">{tt("Cancel")}</Button>
          <Button onClick={() => void submit()} disabled={saving || !name.trim()} className="rounded-lg bg-[#1a1a2e] hover:bg-[#2d2d44]">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {tt("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
