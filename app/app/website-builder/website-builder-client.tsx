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
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  Copy,
  Download,
  EyeOff,
  Layers,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Rocket,
  Settings2,
  SquareArrowOutUpRight,
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
import { secondaryDepth } from "@/components/ui/depth-button"
import { useToast } from "@/hooks/use-toast"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { getWebsiteShareUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"
import { cn } from "@/lib/utils"
import type { ThemeSettingsValues, ThemeStatus } from "@/lib/website-builder/types"
import {
  BROWSABLE_THEMES,
  THEME_INSTALL_LIMIT,
  getIndustry,
  getThemeDefinition,
  type ThemeDefinition,
} from "@/lib/website-builder/theme-registry"
import {
  CoverStage,
  PHONE_FRAME,
  ThemeCover,
  ThemeCoverPair,
  ThemePhoneCover,
  coverSpecFromDefinition,
  coverSpecFromSettings,
} from "@/components/website-builder/theme-cover"
import { relativeTime } from "@/lib/website-builder/relative-time"
import { latestCover, requestCover, savedAt } from "@/lib/website-builder/cover-refresh"
import { HelpLabel } from "@/components/app/help-label"
import type { SettingsSection } from "@/components/website-builder/website-settings/types"
import { LIBRARY_FULL_CODE, LIBRARY_RULE, LIBRARY_RULE_TITLE } from "@/lib/website-builder/library-limit"
import { LibraryFullDialog, type LibraryAction } from "./library-full-dialog"
import {
  ARRIVAL_MS,
  IncomingRow,
  importThemeFile,
  nameFromFile,
  scrollToRow,
  type Incoming,
  type IncomingKind,
} from "./incoming"

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
 * The live cover's frame: 12px corners on all four sides, clipped on the
 * frame itself so nothing inside is drawn square past the curve. The
 * hairline is drawn OVER the picture (the last child), so the edge of a
 * screenshot never shows past it; the depth is two soft shadows, one close
 * and one wide.
 */
const COVER_FRAME =
  "group relative block w-full select-none overflow-hidden rounded-[12px] bg-[#eef0f3] text-left isolate outline-none [&_img]:[-webkit-user-drag:none] [transform:translateZ(0)] shadow-[0_1px_2px_rgba(15,23,42,0.06),0_10px_28px_-14px_rgba(15,23,42,0.22)] after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2"

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
      {offline ? "Offline" : "Draft"}
    </span>
  )
}

/**
 * The website's picture. A snapshot when the editor has taken one, else the
 * cover drawn from the theme. Plain `<img>`: the snapshot is already 1200px
 * WebP, sized once at capture — there is nothing for an optimiser to do and
 * nothing to pay per view.
 */
/**
 * ===========================================================================
 *  A NEW COVER CROSSFADES IN, IT DOES NOT CUT
 * ===========================================================================
 * A cover older than the site is retaken while the page is open (below), and
 * the new picture used to replace the old one in a single frame: a drawn
 * stand-in turning into a screenshot, or yesterday's screenshot into
 * today's, a moment after landing. That cut is the flash on arriving here.
 *
 * So the cover on screen stays underneath, and the new one fades in over it,
 * then the old one is let go. The first cover a card shows is not faded: the
 * page itself already arrives on its own fade (`app-page-enter`).
 */
function WebsiteCover(props: { install: WebsiteSummary; eager?: boolean; phone?: boolean; className?: string }) {
  const id = props.install.snapshot_url ?? `drawn:${props.install.theme_id}:${props.install.name}`
  const [shownId, setShownId] = React.useState(id)
  const [previous, setPrevious] = React.useState<{ id: string; props: typeof props } | null>(null)
  /* What the cover on screen was drawn from, as of the last commit. */
  const committed = React.useRef(props)
  React.useEffect(() => {
    committed.current = props
  })
  if (shownId !== id) {
    setPrevious({ id: shownId, props: committed.current })
    setShownId(id)
  }
  React.useEffect(() => {
    if (!previous) return
    const t = window.setTimeout(() => setPrevious(null), COVER_FADE_MS + 60)
    return () => window.clearTimeout(t)
  }, [previous])
  return (
    <span className="relative block h-full w-full">
      {previous && (
        <span key={previous.id} aria-hidden className="absolute inset-0">
          <CoverPicture {...previous.props} />
        </span>
      )}
      <span key={id} className={cn("relative block h-full w-full", previous && "wb-cover-in")}>
        <CoverPicture {...props} />
      </span>
    </span>
  )
}
const COVER_FADE_MS = 420

function CoverPicture({
  install,
  eager = false,
  phone = false,
  className,
}: {
  install: WebsiteSummary
  eager?: boolean
  phone?: boolean
  className?: string
}) {
  const def = getThemeDefinition(install.theme_id)
  /*
    THE LIVE CARD IS A PRODUCT SHOT: the desktop version in a browser window
    and the phone version in front of it, on a softly lit stage. See
    CoverStage. Library rows and thumbnails keep the plain picture.
  */
  if (phone) {
    const spec = install.snapshot_url ? null : coverSpecFromSettings(install.settings, def, install.name)
    return (
      <CoverStage
        desktop={
          install.snapshot_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={install.snapshot_url}
              alt=""
              width={1440}
              height={900}
              loading={eager ? "eager" : "lazy"}
              fetchPriority={eager ? "high" : "auto"}
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <ThemeCover spec={spec!} className="h-full w-full" />
          )
        }
        phone={
          install.snapshot_url ? (
            install.snapshot_mobile_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={install.snapshot_mobile_url}
                alt=""
                width={390}
                height={844}
                loading={eager ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover object-top"
              />
            ) : null
          ) : (
            <ThemePhoneCover spec={spec!} className="h-full w-full" />
          )
        }
      />
    )
  }
  if (install.snapshot_url) {
    /*
      THE SITE, AT BOTH WIDTHS. The desktop screenshot fills the card and the
      phone screenshot stands in front of it in a phone's frame — the same
      place and shape the theme's drawn stand-in uses, so the card does not
      change layout when a real cover arrives. Both pictures are from one
      save: the route writes them under one timestamp.
    */
    return (
      <div className={cn("relative h-full w-full overflow-hidden", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={install.snapshot_url}
          alt=""
          width={1440}
          height={900}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover object-top"
        />
        {phone && install.snapshot_mobile_url && (
          <div className={PHONE_FRAME}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={install.snapshot_mobile_url}
              alt=""
              width={390}
              height={844}
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              className="block aspect-[390/780] w-full object-cover object-top"
            />
          </div>
        )}
      </div>
    )
  }
  return (
    <ThemeCoverPair
      spec={coverSpecFromSettings(install.settings, def, install.name)}
      phone={phone}
      className={className}
    />
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
      window.open(url, "_blank", "noopener")
    }
  }
  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-0.5">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex min-w-0 items-center gap-1.5 rounded-md text-[14px] text-[#6b7280] transition-colors hover:text-[#1a1a2e]"
      >
        <span className="truncate">{display}</span>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#9ca3af] transition-colors group-hover:text-[#1a1a2e]" />
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Address copied" : "Copy address"}
        className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#9ca3af] transition-colors hover:bg-[#eef0f3] hover:text-[#1a1a2e]"
      >
        <Copy className={cn("h-3.5 w-3.5 transition-opacity duration-150", copied && "opacity-0")} />
        <Check className={cn("absolute h-3.5 w-3.5 text-emerald-600 transition-opacity duration-150", !copied && "opacity-0")} />
      </button>
    </div>
  )
}

/**
 * The second rank of button: same height and shape as the primary above it,
 * white instead of near-black. 44px, because it is the size a thumb hits.
 */
/**
 * Settings, beside the page title: 44px on a phone, 36px from a tablet up,
 * with a hairline. On a phone it overhangs the title's line by 4px above and
 * below rather than making the line taller, so the address under it stays
 * where it was.
 */
const SETTINGS_BUTTON =
  "-my-1 inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-colors duration-150 hover:bg-[#f8f9fa] active:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:my-0 sm:h-9"

/**
 * THE MORE BUTTON, WITH A LITTLE DEPTH. "The three dots button should have
 * more depth, a very subtle depth." The shared secondary depth
 * (components/ui/depth-button.ts): a hairline, a 1px shade at its foot, and
 * flat with the shade inside when pressed, the same press as the product
 * editor's buttons. On the live card it is the Edit button's height; on a
 * library row it is 40px on a phone with an invisible band to 48, and 36 from
 * 640px, beside Publish and Edit.
 */
const MORE_ON_CARD = cn(secondaryDepth, "h-11 w-11 rounded-xl px-0 text-[#4b5563]")
const MORE_ON_ROW = cn(
  secondaryDepth,
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

/** Resolves once every picture has been fetched and decoded, or failed to. */
async function decodedFirst(urls: (string | null)[]): Promise<void> {
  await Promise.all(
    urls.map((url) => {
      if (!url) return null
      const img = new Image()
      img.decoding = "async"
      img.src = url
      return img.decode().catch(() => null)
    }),
  )
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
}: {
  installs: WebsiteSummary[]
  username: string
  /** The website's own name on Storelib, when it has one apart from the username. */
  siteHandle?: string | null
}) {
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
  /*
    A COPY OF THIS PAGE OLDER THAN A SAVE MADE IN THIS TAB. The app keeps
    pages it has shown for five minutes, so coming back from the editor can
    hand this page the list from before the edit. When this tab saved a
    site after the copy was made, the server is asked for the page again,
    once per save.
  */
  React.useEffect(() => {
    const behind = given.filter((i) => savedAt(i.id) > Date.parse(i.saved_at) + 2000 && !REFRESHED.has(`${i.id}:${savedAt(i.id)}`))
    if (behind.length === 0) return
    for (const i of behind) REFRESHED.add(`${i.id}:${savedAt(i.id)}`)
    router.refresh()
  }, [given, router])
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
        let got = await requestCover(i.id)
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
          await decodedFirst([cover.url, cover.mobile_url])
          setFresh((prev) => ({ ...prev, [i.id]: cover }))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [given])

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
  /** Whose Website Settings the button beside the title opens: the live site's, else the one that was. */
  const settingsFor = live ?? offline ?? installs[0] ?? null
  const library = installs.filter((i) => i.status !== "published")
  const installedThemeIds = React.useMemo(() => new Set(installs.map((i) => i.theme_id)), [installs])
  const slotsUsed = installs.length
  const slotsLeft = Math.max(0, THEME_INSTALL_LIMIT - slotsUsed)

  const siteName = siteHandle || username
  const siteUrl = siteName ? getWebsiteShareUrl(siteName) : ""
  const siteDisplay = siteName ? getWebsiteUrlDisplay(siteName) : ""

  const refresh = React.useCallback(() => startRefresh(() => router.refresh()), [router])

  const go = React.useCallback(
    (href: string) => {
      startNavigationLoading()
      router.push(href)
    },
    [router],
  )

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
    run(`${i.id}:publish`, () => fetch(`/api/website-builder/themes/${i.id}/publish`, json("POST", { action: "publish" })), `${i.name} is live`, "Could not publish")

  const unpublish = (i: WebsiteSummary) =>
    run(`${i.id}:unpublish`, () => fetch(`/api/website-builder/themes/${i.id}/publish`, json("POST", { action: "unpublish" })), `${i.name} is offline`, "Could not unpublish")

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
    [refresh, toast],
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
      `${i.name} (copy)`,
      async () => {
        const res = await fetch(`/api/website-builder/themes/${i.id}/duplicate`, json("POST", {}))
        return { ok: res.ok, data: await res.json().catch(() => ({})) }
      },
      () => `Copied ${i.name}`,
      "Could not duplicate",
      again,
    )
  }

  const rename = (i: WebsiteSummary, name: string) =>
    run(`${i.id}:rename`, () => fetch(`/api/website-builder/themes/${i.id}`, json("PATCH", { name })), "Renamed", "Could not rename")

  const remove = (i: WebsiteSummary) =>
    run(`${i.id}:delete`, () => fetch(`/api/website-builder/themes/${i.id}`, { method: "DELETE" }), `Removed ${i.name}`, "Could not remove")

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
      () => `${def.name} added`,
      "Could not add theme",
      () => void addTheme(def),
    )
  }

  const exportTheme = async (i: WebsiteSummary) => {
    setBusy(`${i.id}:export`)
    try {
      const res = await fetch(`/api/website-builder/themes/${i.id}/export`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast({ title: d.error ?? "Could not export", variant: "destructive" })
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
      toast({ title: `Exported ${i.name}` })
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
    if (slotsLeft === 0) {
      setFull("import")
      return
    }
    if (making) return
    await make(
      "import",
      nameFromFile(file),
      (progress, sent) => importThemeFile(file, { progress, sent }),
      (data) => `Imported ${typeof data.name === "string" ? data.name : nameFromFile(file)}${typeof data.media === "string" && data.media && data.media !== "nothing" ? ` with ${data.media}` : ""}`,
      "Could not import that file",
      () => void importZip(file),
    )
  }

  /**
   * `preview` is gone from here. It added a "View live site" row, and the
   * live card now has that as a button of its own standing beside this
   * menu — which was the duplication the card was rewritten to remove, so
   * leaving the option in would have left the trap set.
   */
  /**
   * THE MORE MENU, in Shopify's action list shape: groups, a hairline
   * between them, and what cannot be undone last and in red.
   *
   * The live site's menu opens with the pages of its Website Settings,
   * which were the tabs above the cover. A draft's menu keeps one row for
   * them, because a draft's domain and SEO are not live anywhere yet.
   */
  const menuFor = (i: WebsiteSummary, opts: { publish?: boolean } = {}): ActionMenuItem[] => {
    const items: ActionMenuItem[] = []
    /* The live site, in a new tab from a real anchor: it was a button beside the page title. */
    if (i.status === "published" && siteUrl) items.push({ label: "View website", icon: <SquareArrowOutUpRight />, href: siteUrl, target: "_blank" })
    /* A site that was live and was taken offline goes back up from its own row. */
    if (opts.publish) items.push({ label: i.status === "unpublished" ? "Publish again" : "Publish", icon: <Rocket />, onClick: () => setPublishing(i) })
    items.push(
      { label: "Edit code", icon: <Code2 />, onClick: () => go(editorHref(username, i.id, "code")), separatorBefore: items.length > 0 },
      /* The live site's settings are the Settings button beside the page title; a draft's are here. */
      ...(i.status === "published" ? [] : [{ label: "Website settings", icon: <Settings2 />, onClick: () => go(editorHref(username, i.id, "settings")) }]),
      { label: "Rename", icon: <Pencil />, onClick: () => setRenaming(i) },
      { label: "Duplicate", icon: <Layers />, onClick: () => void duplicate(i) },
      { label: "Export theme", icon: <Download />, onClick: () => void exportTheme(i) },
    )
    if (i.status === "published") {
      items.push({ label: "Take offline", icon: <EyeOff />, onClick: () => setUnpublishing(i), variant: "warning", separatorBefore: true })
    } else {
      items.push({ label: "Remove", icon: <Trash2 />, onClick: () => setDeleting(i), variant: "destructive", separatorBefore: true })
    }
    return items
  }

  /* The themes Browse themes offers (one, for now), whether or not they are in the library already. */
  const explore = BROWSABLE_THEMES

  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa]">
      <div className="app-page-enter mx-auto max-w-[1200px] space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        {/* ── Header ─────────────────────────────────────────────────
            The title with one button on its line, Settings, and the address
            under them: the shape every other page in /app uses, and the
            first thing you want here is where your site lives.

            The row held three controls (View website, Public, Settings) and
            on a phone they wrapped under the title as a sideways scroller.
            Each of the other two is where the thing it acts on is: View
            website and Take offline in the live website's More menu, and
            Publish again on the offline website's own row. */}
        <div>
          <div className="flex items-center justify-between gap-3" data-title-row="">
            <h1 className="min-w-0 truncate text-[24px] font-bold tracking-tight text-[#1a1a2e] sm:text-[28px]">Website</h1>
            {settingsFor && (
              <button
                type="button"
                data-control="settings"
                onClick={() => go(editorHref(username, settingsFor.id, "settings"))}
                className={SETTINGS_BUTTON}
              >
                <Settings2 className="h-[15px] w-[15px] text-[#6b7280]" strokeWidth={1.9} />
                Settings
              </button>
            )}
          </div>
          {siteUrl && <SiteAddress url={siteUrl} display={siteDisplay} />}
        </div>

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
                      so it has corners of its own on all four sides. The clip
                      is on the picture itself, with a hairline and a short
                      two layer shadow for depth. */}
                  <div className="min-w-0 p-4 pb-3 lg:pb-4 lg:pr-2">
                    <button
                      type="button"
                      onClick={() => go(editorHref(username, live.id))}
                      aria-label={`Edit ${live.name}`}
                      data-cover=""
                      className={COVER_FRAME}
                    >
                      <span className="block aspect-[16/10] w-full">
                        <WebsiteCover install={live} eager phone />
                      </span>
                      <span className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[#1a1a2e]/0 transition-colors duration-200 group-hover:bg-[#1a1a2e]/[0.04]" />
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
                        <dt className="text-[#6b7280]">Published</dt>
                        <dd className="text-right font-medium text-[#1a1a2e]">{live.published_at ? since(live.published_at) : "Yes"}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4 py-2.5">
                        <dt className="text-[#6b7280]">Last edited</dt>
                        <dd className="text-right font-medium text-[#1a1a2e]">{since(live.saved_at)}</dd>
                      </div>
                      {live.theme && live.theme.name !== live.name && (
                        <div className="flex items-center justify-between gap-4 py-2.5">
                          <dt className="text-[#6b7280]">Theme</dt>
                          <dd className="min-w-0 truncate text-right font-medium text-[#1a1a2e]">
                            {live.theme.name} <span className="font-normal text-[#9ca3af]">v{live.theme.version}</span>
                          </dd>
                        </div>
                      )}
                    </dl>
                    {/* Edit website, and everything else behind More: View website first, Take offline last. */}
                    <div className="mt-auto flex gap-2 pt-5">
                      <Button
                        onClick={() => go(editorHref(username, live.id))}
                        className="h-11 min-w-0 flex-1 rounded-xl bg-[#1a1a2e] text-[14px] font-semibold text-white hover:bg-[#2d2d44]"
                      >
                        Edit website
                      </Button>
                      <ResponsiveActionMenu
                        title={live.name}
                        items={menuFor(live)}
                        menuWidth="w-56"
                        trigger={
                          <button type="button" aria-label={`More actions for ${live.name}`} data-more-button="" className={MORE_ON_CARD}>
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
            ) : (
              /* Nothing live. When a website was, the card says which and puts it back
                 in one press: the header's Public control used to be the only
                 place that said the site was down. */
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-live-empty={offline ? "offline" : "none"}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3f4f6] text-[#6b7280]">
                  {offline ? <EyeOff className="h-4.5 w-4.5" /> : <Rocket className="h-4.5 w-4.5" />}
                </span>
                <h2 id="live-heading" className="text-[15px] font-semibold text-[#1a1a2e]">
                  {offline ? "Your website is offline" : "Nothing is live"}
                </h2>
                <p className="max-w-[320px] text-[13px] text-[#6b7280]">
                  {offline ? <>Visitors see a placeholder. {offline.name} was the last one live.</> : "Publish a website from your library."}
                </p>
                {offline && (
                  <Button
                    onClick={() => setPublishing(offline)}
                    disabled={busy === `${offline.id}:publish`}
                    className="mt-2 h-11 rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white hover:bg-[#2d2d44] sm:h-10"
                  >
                    {busy === `${offline.id}:publish` && <Loader2 className="h-4 w-4 animate-spin" />}
                    Publish again
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Library ────────────────────────────────────────────── */}
        <section aria-labelledby="library-heading" className="space-y-3" data-page-block>
          <SectionHeading
            title="Library"
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
                    {slotsUsed > THEME_INSTALL_LIMIT ? `${slotsUsed} websites` : `${slotsUsed} of ${THEME_INSTALL_LIMIT} websites`}
                  </span>
                }
                title={LIBRARY_RULE_TITLE}
                description={`${LIBRARY_RULE} One is live at a time, and the others are drafts you can edit and publish in its place. Remove one to add another.`}
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
            <Button
              variant="ghost"
              /* Never dead: with the library full it says why, instead of doing nothing. */
              onClick={() => (slotsLeft === 0 ? setFull("import") : fileInput.current?.click())}
              disabled={importing}
              aria-haspopup={slotsLeft === 0 ? "dialog" : undefined}
              data-import-button={importing ? incoming?.phase : "idle"}
              /* As wide as "Uploading 100%", so Add theme beside it does not move while it counts. */
              className="h-11 min-w-[140px] rounded-xl px-3 text-[13px] font-medium tabular-nums text-[#4b5563] hover:bg-[#eef0f3] hover:text-[#1a1a2e] disabled:opacity-100"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing && incoming ? (incoming.phase === "uploading" ? `Uploading ${Math.round(incoming.progress * 100)}%` : "Importing") : "Import theme"}
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-xl border-[#e5e7eb] bg-white px-3.5 text-[13px] font-semibold text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-[#f8f9fa]"
            >
              <Link
                href="/app/website-builder/themes"
                onClick={(e) => {
                  if (slotsLeft === 0) {
                    e.preventDefault()
                    setFull("add")
                    return
                  }
                  startNavigationLoading()
                }}
              >
                <Plus className="h-4 w-4" />
                Add theme
              </Link>
            </Button>
          </SectionHeading>
          <h2 id="library-heading" className="sr-only">Library</h2>

          {/* ── A table, not a stack of cards ───────────────────────────
              Column headings once, at the top, and each website a row under
              them: the name where the eye starts, then the facts in columns
              that line up down the page, then what you can do. A phone has
              no room for columns, so the facts fold under the name. */}
          <div ref={libraryCard} className="relative overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
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
                No drafts. Add a theme to start another website.
              </div>
            ) : (
              <table className="w-full table-fixed border-collapse text-left">
                <thead className="hidden bg-[#fafbfb] sm:table-header-group">
                  <tr className="border-b border-[#eceef1] text-[12px] font-medium text-[#6b7280]">
                    <th scope="col" className="h-9 px-4 font-medium">Website</th>
                    <th scope="col" className="h-9 w-[104px] px-3 font-medium">Status</th>
                    <th scope="col" className="hidden h-9 w-[132px] px-3 font-medium md:table-cell">Last edited</th>
                    <th scope="col" className="h-9 w-[216px] px-4 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eceef1]">
                  {library.map((i) => {
                    const def = getThemeDefinition(i.theme_id)
                    const isBusy = busy?.startsWith(i.id) ?? false
                    return (
                      <tr
                        key={i.id}
                        data-install-row={i.id}
                        className="transition-colors duration-150 hover:bg-[#fafbfc]"
                      >
                        <td className="p-3 sm:px-4">
                          {/* The whole cell opens the editor: on a phone it is
                              the only Edit there is. */}
                          <button
                            type="button"
                            onClick={() => go(editorHref(username, i.id))}
                            className="flex w-full min-w-0 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:gap-4"
                            aria-label={`Edit ${i.name}`}
                          >
                            <span className="relative block w-24 shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] sm:w-28">
                              <span className="block aspect-[16/10]">
                                <WebsiteCover install={i} />
                              </span>
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-semibold text-[#1a1a2e]">{i.name}</span>
                              <span className="mt-0.5 block truncate text-[12.5px] text-[#6b7280]">
                                {/* On a phone the columns fold in here, and the
                                    edit time is the fact worth the room. */}
                                <span className="hidden sm:inline">{def ? getIndustry(def.industry).label : i.theme?.name ?? "Theme"}</span>
                                <span className="sm:hidden">{i.id === offline?.id ? "Offline" : "Draft"} · Edited {since(i.saved_at)}</span>
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
                              Publish
                            </Button>
                            <Button
                              onClick={() => go(editorHref(username, i.id))}
                              className="hidden h-9 rounded-lg bg-[#1a1a2e] px-3.5 text-[13px] font-medium text-white hover:bg-[#2d2d44] sm:inline-flex"
                            >
                              Edit
                            </Button>
                            <ResponsiveActionMenu
                              title={i.name}
                              items={menuFor(i, { publish: true })}
                              menuWidth="w-52"
                              trigger={
                                <button
                                  type="button"
                                  aria-label={`More actions for ${i.name}`}
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
                  {/* Where the website being made will land: after the others. */}
                  {showingIncoming && incoming && (
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
            of the page is ready sooner on a phone. */}
        <section aria-labelledby="explore-heading" className="space-y-3 pb-6 [contain-intrinsic-size:auto_420px] [content-visibility:auto]" data-page-block>
          <SectionHeading title="Browse themes">
            <Link
              href="/app/website-builder/themes"
              onClick={() => startNavigationLoading()}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-[#6b7280] transition-colors duration-150 hover:bg-[#eef0f3] hover:text-[#1a1a2e]"
            >
              Browse
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </SectionHeading>
          <h2 id="explore-heading" className="sr-only">Browse themes</h2>
          <div className="space-y-3">
            {explore.map((t) => (
              <ExploreRow
                key={t.id}
                def={t}
                inLibrary={installedThemeIds.has(t.id)}
                busy={making && incoming?.kind === "add" && incoming.name === t.name}
                onAdd={() => void addTheme(t)}
                onOpen={() => go("/app/website-builder/themes")}
              />
            ))}
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
            <AlertDialogTitle>Publish “{publishing?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {live
                ? <>It replaces “{live.name}” at <span className="font-medium text-foreground">{siteDisplay}</span>. Nothing is deleted.</>
                : <>It goes live at <span className="font-medium text-foreground">{siteDisplay}</span>.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-[#1a1a2e] hover:bg-[#2d2d44]"
              onClick={() => {
                const target = publishing
                setPublishing(null)
                if (target) void publish(target)
              }}
            >
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!unpublishing} onOpenChange={(o) => !o && setUnpublishing(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Take “{unpublishing?.name}” offline?</AlertDialogTitle>
            <AlertDialogDescription>Visitors see a placeholder until you publish again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                const target = unpublishing
                setUnpublishing(null)
                if (target) void unpublish(target)
              }}
            >
              Take offline
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
            <AlertDialogTitle>Remove “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Its pages, settings and code are deleted. Export first to keep a copy.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-red-600 hover:bg-red-700"
              onClick={() => {
                const target = deleting
                setDeleting(null)
                if (target) void remove(target)
              }}
            >
              Remove
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
 * A theme Browse themes offers, as one row: a drawn cover, what it is, and
 * Add (or that it is in the library already). Nothing moves on hover, only
 * the row's tint: the cards used to rise 2px, which read as a bump.
 */
function ExploreRow({
  def,
  inLibrary,
  busy,
  onAdd,
  onOpen,
}: {
  def: ThemeDefinition
  inLibrary: boolean
  busy: boolean
  onAdd: () => void
  onOpen: () => void
}) {
  return (
    <div
      data-explore-row=""
      className="flex items-center gap-3 overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors duration-150 hover:bg-[#fcfcfd] sm:gap-4"
    >
      <button type="button" onClick={onOpen} aria-label={`Preview ${def.name}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:gap-4">
        <span className="relative block w-24 shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] sm:w-32">
          <span className="block aspect-[16/10]">
            <ThemeCoverPair spec={coverSpecFromDefinition(def)} />
          </span>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-[#1a1a2e]">{def.name}</span>
          <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[#6b7280]">{def.tagline}</span>
        </span>
      </button>
      {inLibrary ? (
        <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#f1f2f4] px-3 text-[12.5px] font-medium text-[#3f3f46]">
          <Check className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">In library</span>
        </span>
      ) : (
        <Button onClick={onAdd} disabled={busy} className="h-11 shrink-0 rounded-lg bg-[#1a1a2e] px-3 sm:h-9 text-[13px] font-semibold text-white hover:bg-[#2d2d44]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      )}
    </div>
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
          <DialogTitle>Rename</DialogTitle>
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
          <Button variant="outline" onClick={onClose} className="rounded-lg">Cancel</Button>
          <Button onClick={() => void submit()} disabled={saving || !name.trim()} className="rounded-lg bg-[#1a1a2e] hover:bg-[#2d2d44]">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
