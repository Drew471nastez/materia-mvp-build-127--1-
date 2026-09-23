"use client"

/**
 * ===========================================================================
 *  THE WEBSITE PAGE
 * ===========================================================================
 * Three things, in the order a store owner cares about them:
 *
 *   1. The live website — one card, one picture, one button: Edit website.
 *   2. The library — the other themes you are keeping (up to three in all),
 *      each with Publish, Edit and the long tail in a menu.
 *   3. Explore — a few themes from the registry, and the door to all of them.
 *
 * What is deliberately NOT here:
 *   • A live render of any website. The cover is the snapshot the editor took
 *     on the last save, or a drawing from the theme's colours until there is
 *     one. Nothing on this page mounts a storefront.
 *   • A fetch on mount. The server hands over everything; mutations call the
 *     API and then `router.refresh()`, so the page is never in a state the
 *     server did not produce.
 *   • A loading skeleton inside the component. The route's `loading.tsx`
 *     covers the server round-trip, deferred so a fast load never flashes.
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
  ExternalLink,
  EyeOff,
  Layers,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Rocket,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { useToast } from "@/hooks/use-toast"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { getWebsiteShareUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"
import { cn } from "@/lib/utils"
import type { ThemeSettingsValues, ThemeStatus } from "@/lib/website-builder/types"
import {
  THEME_INSTALL_LIMIT,
  THEME_REGISTRY,
  getIndustry,
  getThemeDefinition,
  type ThemeDefinition,
} from "@/lib/website-builder/theme-registry"
import {
  PHONE_FRAME,
  ThemeCoverPair,
  coverSpecFromDefinition,
  coverSpecFromSettings,
} from "@/components/website-builder/theme-cover"
import { relativeTime } from "@/lib/website-builder/relative-time"
import { requestCover } from "@/lib/website-builder/cover-refresh"
import { HelpLabel } from "@/components/app/help-label"
import type { SettingsSection } from "@/components/website-builder/website-settings/types"

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
 * ===========================================================================
 *  THE TABS ABOVE THE COVER
 * ===========================================================================
 * The places a creator goes for their live website, named the way a host
 * names them. Overview is this page. Every other tab opens the matching
 * page of Website Settings in the editor: there is one Domains page and one
 * SEO page in Storelib, and a tab is a door to it rather than a second copy.
 */
export const WEBSITE_TABS: { label: string; section: SettingsSection | null }[] = [
  { label: "Overview", section: null },
  { label: "Pages", section: "pages" },
  { label: "Domain", section: "domains" },
  { label: "SEO", section: "seo" },
  { label: "Publishing", section: "publishing" },
  { label: "Settings", section: "general" },
]

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

/** A draft, as the Orders table draws a status: a word on a tint. */
function DraftBadge() {
  return (
    <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-[7px] bg-[#f1f2f4] px-2 text-[12px] font-medium text-[#3f3f46]">
      Draft
    </span>
  )
}

/**
 * The website's picture. A snapshot when the editor has taken one, else the
 * cover drawn from the theme. Plain `<img>`: the snapshot is already 1200px
 * WebP, sized once at capture — there is nothing for an optimiser to do and
 * nothing to pay per view.
 */
function WebsiteCover({
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
const SECONDARY_ACTION =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] bg-white text-[13.5px] font-semibold text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors duration-150 hover:bg-[#f8f9fa] active:bg-[#f3f4f6]"

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
export function coverIsStale(i: Pick<WebsiteSummary, "snapshot_url" | "snapshot_updated_at" | "saved_at">): boolean {
  if (!i.snapshot_url || !i.snapshot_updated_at) return true
  return Date.parse(i.saved_at) > Date.parse(i.snapshot_updated_at) + 5000
}

export function WebsiteBuilderClient({
  installs: given,
  username,
}: {
  installs: WebsiteSummary[]
  username: string
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
  const [fresh, setFresh] = React.useState<Record<string, { url: string; mobile_url: string | null; updated_at: string }>>({})
  const asked = React.useRef(new Set<string>())
  const installs = React.useMemo(
    () =>
      given.map((i) => {
        const f = fresh[i.id]
        return f ? { ...i, snapshot_url: f.url, snapshot_mobile_url: f.mobile_url, snapshot_updated_at: f.updated_at } : i
      }),
    [given, fresh],
  )
  React.useEffect(() => {
    const queue = [...given]
      .sort((a, b) => (a.status === "published" ? -1 : 0) - (b.status === "published" ? -1 : 0))
      .filter((i) => coverIsStale(i) && !asked.current.has(i.id))
    if (queue.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const i of queue) {
        if (cancelled) return
        asked.current.add(i.id)
        const got = await requestCover(i.id)
        /* Used even if this run was superseded: the site is already marked
           asked, so a result dropped here would leave its card stale for the
           rest of the visit. Cancelling only stops the NEXT one starting. */
        if (got) {
          /* Decoded before it is swapped in. Handing the card a new URL
             straight away blanked the cover while a 1440px picture arrived
             and decoded, which is the flash of grey a retake used to be. */
          await decodedFirst([got.url, got.mobile_url])
          setFresh((prev) => ({ ...prev, [i.id]: got }))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [given])

  const router = useRouter()
  const { toast } = useToast()
  const [isRefreshing, startRefresh] = React.useTransition()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [renaming, setRenaming] = React.useState<WebsiteSummary | null>(null)
  const [deleting, setDeleting] = React.useState<WebsiteSummary | null>(null)
  const [publishing, setPublishing] = React.useState<WebsiteSummary | null>(null)
  const [unpublishing, setUnpublishing] = React.useState<WebsiteSummary | null>(null)
  const fileInput = React.useRef<HTMLInputElement>(null)

  const live = installs.find((i) => i.status === "published") ?? null
  const library = installs.filter((i) => i.status !== "published")
  const installedThemeIds = React.useMemo(() => new Set(installs.map((i) => i.theme_id)), [installs])
  const slotsUsed = installs.length
  const slotsLeft = Math.max(0, THEME_INSTALL_LIMIT - slotsUsed)

  const siteUrl = username ? getWebsiteShareUrl(username) : ""
  const siteDisplay = username ? getWebsiteUrlDisplay(username) : ""

  const refresh = React.useCallback(() => startRefresh(() => router.refresh()), [router])

  const go = React.useCallback(
    (href: string) => {
      startNavigationLoading()
      router.push(href)
    },
    [router],
  )

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

  const fullMessage = `Your library holds ${THEME_INSTALL_LIMIT}. Remove one first.`

  const publish = (i: WebsiteSummary) =>
    run(`${i.id}:publish`, () => fetch(`/api/website-builder/themes/${i.id}/publish`, json("POST", { action: "publish" })), `${i.name} is live`, "Could not publish")

  const unpublish = (i: WebsiteSummary) =>
    run(`${i.id}:unpublish`, () => fetch(`/api/website-builder/themes/${i.id}/publish`, json("POST", { action: "unpublish" })), `${i.name} is offline`, "Could not unpublish")

  const duplicate = (i: WebsiteSummary) => {
    if (slotsLeft === 0) {
      toast({ title: fullMessage, variant: "destructive" })
      return
    }
    return run(`${i.id}:duplicate`, () => fetch(`/api/website-builder/themes/${i.id}/duplicate`, json("POST", {})), `Copied ${i.name}`, "Could not duplicate")
  }

  const rename = (i: WebsiteSummary, name: string) =>
    run(`${i.id}:rename`, () => fetch(`/api/website-builder/themes/${i.id}`, json("PATCH", { name })), "Renamed", "Could not rename")

  const remove = (i: WebsiteSummary) =>
    run(`${i.id}:delete`, () => fetch(`/api/website-builder/themes/${i.id}`, { method: "DELETE" }), `Removed ${i.name}`, "Could not remove")

  const addTheme = (def: ThemeDefinition) => {
    if (slotsLeft === 0) {
      toast({ title: fullMessage, variant: "destructive" })
      return
    }
    return run(`${def.id}:add`, () => fetch("/api/website-builder/themes/add", json("POST", { theme_id: def.id })), `${def.name} added`, "Could not add theme")
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

  const importZip = async (file: File) => {
    if (slotsLeft === 0) {
      toast({ title: fullMessage, variant: "destructive" })
      return
    }
    const fd = new FormData()
    fd.append("file", file)
    await run("import", () => fetch("/api/website-builder/themes/import", { method: "POST", body: fd }), `Imported ${file.name.replace(/(\.storelib-theme)?\.zip$/i, "").replace(/\.storelib-theme$/i, "")}`, "Could not import that file")
    if (fileInput.current) fileInput.current.value = ""
  }

  /**
   * `preview` is gone from here. It added a "View live site" row, and the
   * live card now has that as a button of its own standing beside this
   * menu — which was the duplication the card was rewritten to remove, so
   * leaving the option in would have left the trap set.
   */
  const menuFor = (i: WebsiteSummary, opts: { publish?: boolean } = {}): ActionMenuItem[] => {
    const items: ActionMenuItem[] = []
    if (opts.publish) items.push({ label: "Publish", icon: <Rocket className="h-4 w-4" />, onClick: () => setPublishing(i) })
    items.push(
      { label: "Rename", icon: <Pencil className="h-4 w-4" />, onClick: () => setRenaming(i), separatorBefore: items.length > 0 },
      { label: "Duplicate", icon: <Layers className="h-4 w-4" />, onClick: () => void duplicate(i) },
      { label: "Edit code", icon: <Code2 className="h-4 w-4" />, onClick: () => go(editorHref(username, i.id, "code")) },
      { label: "Website settings", icon: <Settings2 className="h-4 w-4" />, onClick: () => go(editorHref(username, i.id, "settings")) },
      { label: "Export theme", icon: <Download className="h-4 w-4" />, onClick: () => void exportTheme(i) },
    )
    if (i.status === "published") {
      items.push({ label: "Take offline", icon: <EyeOff className="h-4 w-4" />, onClick: () => setUnpublishing(i), variant: "warning", separatorBefore: true })
    } else {
      items.push({ label: "Remove", icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleting(i), variant: "destructive", separatorBefore: true })
    }
    return items
  }

  // Four themes the creator has not got yet, featured first, then by registry order.
  const explore = React.useMemo(() => {
    const notMine = THEME_REGISTRY.filter((t) => !installedThemeIds.has(t.id))
    const featured = notMine.filter((t) => t.featured)
    const rest = notMine.filter((t) => !t.featured)
    return [...featured, ...rest].slice(0, 4)
  }, [installedThemeIds])

  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa]">
      <div className="app-page-enter mx-auto max-w-[1200px] space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        {/* ── Header ─────────────────────────────────────────────────
            A title and the address under it, which is the shape every other
            page in /app already uses and the shape a host uses: the first
            thing you want here is where your site lives.

            There is no button on this row any more. It held "Browse themes",
            which went to exactly the same page as "Add theme" in the Library
            heading below — two buttons, two labels, one destination — and it
            wore a plus, which is the mark for adding rather than browsing.
            The page's own first action is Edit website, immediately beneath
            this, and it does not need company. */}
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold tracking-tight text-[#1a1a2e] sm:text-[28px]">Website</h1>
          {siteUrl && <SiteAddress url={siteUrl} display={siteDisplay} />}
        </div>

        {/* ── Live website ─────────────────────────────────────────
            `data-page-block` marks the three blocks that have to sit on the
            page's own two gutters. scripts/check-website-page.mjs reads them
            and compares the left inset to the right, which is the complaint
            that started this rewrite: things on this page did not line up. */}
        <section aria-labelledby="live-heading" data-page-block>
          <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {live ? (
              <>
                {/* ── The tabs ─────────────────────────────────────────
                    Across the top of the card, the way a host puts a site's
                    sections above its preview. Text and a 2px rule under the
                    one you are on: no pills, no icons. On a phone the row
                    scrolls sideways under the thumb, and its padding is also
                    its scroll padding so the first tab lines up with the
                    card's text rather than the card's edge. */}
                <nav
                  aria-label="Website"
                  className="flex overflow-x-auto border-b border-[#eceef1] px-2 scroll-px-2 [scrollbar-width:none] sm:px-3 [&::-webkit-scrollbar]:hidden"
                >
                  {WEBSITE_TABS.map((tab) => {
                    const here = tab.section === null
                    return (
                      <button
                        key={tab.label}
                        type="button"
                        aria-current={here ? "page" : undefined}
                        onClick={here ? undefined : () => go(editorHref(username, live.id, "settings", tab.section ?? undefined))}
                        className={cn(
                          "wb-tab relative flex h-11 shrink-0 items-center px-3 text-[13.5px] font-medium transition-colors duration-150",
                          here ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]",
                        )}
                        data-active={here ? "" : undefined}
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </nav>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                  <button
                    type="button"
                    onClick={() => go(editorHref(username, live.id))}
                    aria-label={`Edit ${live.name}`}
                    className="group relative block min-w-0 overflow-hidden bg-[#eef0f3] text-left lg:border-r lg:border-[#eceef1]"
                  >
                    <span className="block aspect-[16/10] w-full">
                      <WebsiteCover install={live} eager phone />
                    </span>
                    <span className="pointer-events-none absolute inset-0 bg-[#1a1a2e]/0 transition-colors duration-200 group-hover:bg-[#1a1a2e]/[0.04]" />
                  </button>
                  <div className="flex min-w-0 flex-col p-5 sm:p-6">
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
                    <div className="mt-auto space-y-2 pt-5">
                      <Button
                        onClick={() => go(editorHref(username, live.id))}
                        className="h-11 w-full rounded-xl bg-[#1a1a2e] text-[14px] font-semibold text-white hover:bg-[#2d2d44]"
                      >
                        Edit website
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        {siteUrl ? (
                          <a
                            href={siteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={SECONDARY_ACTION}
                          >
                            <ExternalLink className="h-4 w-4 text-[#6b7280]" strokeWidth={1.9} />
                            View site
                          </a>
                        ) : (
                          <span />
                        )}
                        <ResponsiveActionMenu
                          title={live.name}
                          // No `preview`: View site is its own button, and a
                          // menu row repeating the button beside it is the
                          // thing this block was rewritten to stop doing.
                          items={menuFor(live)}
                          menuWidth="w-52"
                          trigger={
                            <button type="button" className={SECONDARY_ACTION}>
                              {busy?.startsWith(live.id) ? (
                                <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4 text-[#6b7280]" strokeWidth={1.9} />
                              )}
                              More
                            </button>
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3f4f6] text-[#6b7280]">
                  <Rocket className="h-4.5 w-4.5" />
                </span>
                <h2 id="live-heading" className="text-[15px] font-semibold text-[#1a1a2e]">Nothing is live</h2>
                <p className="text-[13px] text-[#6b7280]">Publish a website from your library.</p>
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
             * dotted underline: one live and two drafts. "2 left" answered
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
                title="One live website and two drafts"
                description={`You can keep ${THEME_INSTALL_LIMIT} websites. One is live at a time, and the others are drafts you can edit and publish in its place. Remove one to add another.`}
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
            {/* 44px, like every other button on the page. */}
            <Button
              variant="ghost"
              onClick={() => fileInput.current?.click()}
              disabled={busy === "import" || slotsLeft === 0}
              className="h-11 rounded-xl px-3 text-[13px] font-medium text-[#4b5563] hover:bg-[#eef0f3] hover:text-[#1a1a2e]"
            >
              {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import theme
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-xl border-[#e5e7eb] bg-white px-3.5 text-[13px] font-semibold text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-[#f8f9fa]"
            >
              <Link href="/app/website-builder/themes" onClick={() => startNavigationLoading()}>
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
          <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {library.length === 0 ? (
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
                      <tr key={i.id} className="transition-colors duration-150 hover:bg-[#fafbfc]">
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
                                <span className="sm:hidden">Draft · Edited {since(i.saved_at)}</span>
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="hidden px-3 sm:table-cell">
                          <DraftBadge />
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
                                  className="flex h-9 w-9 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#eef0f3] hover:text-[#1a1a2e]"
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
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[#6b7280] transition-colors hover:text-[#1a1a2e]"
            >
              See all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </SectionHeading>
          <h2 id="explore-heading" className="sr-only">Browse themes</h2>
          {/* A row you can flick through on a phone; a grid where there is room. */}
          {/* `scroll-px-4` matters as much as `px-4` here. A snap container's
              snapport starts at its PADDING BOX, so a `snap-start` card is
              aligned to the screen edge and the row's own padding is scrolled
              straight past — which is why these cards sat flush against both
              edges while every other block on the page was inset. Scroll
              padding moves the snap line in to meet the padding. */}
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scroll-px-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:scroll-px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
            {explore.map((t) => (
              <ExploreCard
                key={t.id}
                def={t}
                busy={busy === `${t.id}:add`}
                disabled={slotsLeft === 0}
                onAdd={() => void addTheme(t)}
                onOpen={() => go(`/app/website-builder/themes?theme=${t.slug}`)}
              />
            ))}
          </div>
          {slotsLeft === 0 && (
            <p className="text-[12.5px] text-[#9ca3af]">Your library is full. Remove a theme to add another.</p>
          )}
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
function ExploreCard({
  def,
  busy,
  disabled,
  onAdd,
  onOpen,
}: {
  def: ThemeDefinition
  busy: boolean
  disabled: boolean
  onAdd: () => void
  onOpen: () => void
}) {
  return (
    <div className="group w-[78%] shrink-0 snap-start overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[box-shadow,translate] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(15,23,42,0.25)] motion-reduce:transition-none sm:w-auto">
      <button
        type="button"
        onClick={onOpen}
        className="relative block aspect-[16/10] w-full overflow-hidden bg-[#f3f4f6]"
        aria-label={`Preview ${def.name}`}
      >
        <ThemeCoverPair spec={coverSpecFromDefinition(def)} />
      </button>
      <div className="flex items-center gap-3 p-3.5">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[14px] font-semibold text-[#1a1a2e]">{def.name}</p>
          <p className="mt-0.5 truncate text-[12px] text-[#6b7280]">{getIndustry(def.industry).label}</p>
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onAdd}
              disabled={busy || disabled}
              aria-label={`Add ${def.name}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1a1a2e] text-white transition-[background-color,scale] duration-150 hover:bg-[#2d2d44] active:scale-95 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[12px]">Add to library</TooltipContent>
        </Tooltip>
      </div>
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
