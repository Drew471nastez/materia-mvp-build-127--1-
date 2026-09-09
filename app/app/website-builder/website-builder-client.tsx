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
  ThemeCoverPair,
  coverSpecFromDefinition,
  coverSpecFromSettings,
} from "@/components/website-builder/theme-cover"
import { relativeTime } from "@/lib/website-builder/relative-time"

export interface WebsiteSummary {
  id: string
  name: string
  status: ThemeStatus
  theme_id: string
  created_at: string
  updated_at: string
  published_at: string | null
  /** Last-save picture from the editor; null until the editor has saved once. */
  snapshot_url: string | null
  snapshot_updated_at: string | null
  /** The newest of the install's own timestamps and its settings row. */
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
export function editorHref(username: string, installId: string, view: EditorView = "preview"): string {
  const base = username
    ? `/store/${encodeURIComponent(username)}/themes/${installId}/editor`
    : `/website-builder/editor/${installId}`
  const params = new URLSearchParams({ previewPath: "/" })
  if (view !== "preview") params.set("view", view)
  return `${base}?${params.toString()}`
}

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
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={install.snapshot_url}
        alt=""
        width={1200}
        height={750}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        decoding="async"
        draggable={false}
        className={cn("h-full w-full object-cover object-top", className)}
      />
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

function CopyUrlPill({ url, display }: { url: string; display: string }) {
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
    <div className="inline-flex h-9 max-w-full items-stretch overflow-hidden rounded-lg border border-[#e5e7eb] bg-white text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <button
        type="button"
        onClick={copy}
        className="flex min-w-0 items-center gap-2 px-3 font-medium text-[#1a1a2e] transition-colors hover:bg-[#f8f9fa]"
        title="Copy address"
      >
        <span className="truncate">{display}</span>
        <span className="relative h-3.5 w-3.5 shrink-0 text-[#9ca3af]">
          <Copy className={cn("absolute inset-0 h-3.5 w-3.5 transition-opacity duration-150", copied && "opacity-0")} />
          <Check className={cn("absolute inset-0 h-3.5 w-3.5 text-emerald-600 transition-opacity duration-150", !copied && "opacity-0")} />
        </span>
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center border-l border-[#e5e7eb] px-2.5 text-[#6b7280] transition-colors hover:bg-[#f8f9fa] hover:text-[#1a1a2e]"
        title="Open"
      >
        <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

function IconAction({
  label,
  href,
  onClick,
  children,
  busy,
}: {
  label: string
  href?: string
  onClick?: () => void
  children: React.ReactNode
  busy?: boolean
}) {
  const cls =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#4b5563] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-[background-color,color,transform] duration-150 hover:bg-[#f8f9fa] hover:text-[#1a1a2e] active:scale-95"
  const inner = busy ? <Loader2 className="h-4 w-4 animate-spin" /> : children
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={cls}>
            {inner}
          </a>
        ) : (
          <button type="button" onClick={onClick} aria-label={label} className={cls}>
            {inner}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[12px]">{label}</TooltipContent>
    </Tooltip>
  )
}

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
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <h2 className="text-[16px] font-semibold tracking-tight text-[#1a1a2e]">{title}</h2>
        {aside}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

// ── The page ───────────────────────────────────────────────────────────────

export function WebsiteBuilderClient({
  installs,
  username,
}: {
  installs: WebsiteSummary[]
  username: string
}) {
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
      a.download = `${i.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.storelib-export.zip`
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
    await run("import", () => fetch("/api/website-builder/themes/import", { method: "POST", body: fd }), `Imported ${file.name.replace(/\.zip$/i, "")}`, "Could not import that file")
    if (fileInput.current) fileInput.current.value = ""
  }

  const menuFor = (i: WebsiteSummary, opts: { publish?: boolean; preview?: boolean } = {}): ActionMenuItem[] => {
    const items: ActionMenuItem[] = []
    if (opts.publish) items.push({ label: "Publish", icon: <Rocket className="h-4 w-4" />, onClick: () => setPublishing(i) })
    if (opts.preview && siteUrl) items.push({ label: "View live site", icon: <ExternalLink className="h-4 w-4" />, href: siteUrl, target: "_blank" })
    items.push(
      { label: "Rename", icon: <Pencil className="h-4 w-4" />, onClick: () => setRenaming(i), separatorBefore: items.length > 0 },
      { label: "Duplicate", icon: <Layers className="h-4 w-4" />, onClick: () => void duplicate(i) },
      { label: "Edit code", icon: <Code2 className="h-4 w-4" />, onClick: () => go(editorHref(username, i.id, "code")) },
      { label: "Project settings", icon: <Settings2 className="h-4 w-4" />, onClick: () => go(editorHref(username, i.id, "settings")) },
      { label: "Export .zip", icon: <Download className="h-4 w-4" />, onClick: () => void exportTheme(i) },
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
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[24px] font-bold tracking-tight text-[#1a1a2e] sm:text-[26px]">Website</h1>
          <div className="flex flex-wrap items-center gap-2">
            {siteUrl && <CopyUrlPill url={siteUrl} display={siteDisplay} />}
            <Button
              asChild
              variant="outline"
              className="h-9 rounded-lg border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-[#f8f9fa]"
            >
              <Link href="/app/website-builder/themes" onClick={() => startNavigationLoading()}>
                <Plus className="h-4 w-4" />
                Browse themes
              </Link>
            </Button>
          </div>
        </div>

        {/* ── Live website ───────────────────────────────────────── */}
        <section aria-labelledby="live-heading">
          <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {live ? (
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
                <div className="flex min-w-0 flex-col justify-center p-5 sm:p-6">
                  <StatusDot status="published" />
                  <h2 id="live-heading" className="mt-2 truncate text-[20px] font-semibold tracking-tight text-[#1a1a2e]">
                    {live.name}
                  </h2>
                  <p className="mt-1 text-[13px] text-[#6b7280]">
                    {live.published_at ? `Published ${since(live.published_at)}` : "Published"}
                    <span className="mx-1.5 text-[#d1d5db]">·</span>
                    Edited {since(live.saved_at)}
                  </p>
                  {live.theme && (
                    <p className="mt-0.5 text-[12.5px] text-[#9ca3af]">
                      {live.theme.name} <span className="text-[#d1d5db]">v{live.theme.version}</span>
                    </p>
                  )}
                  <div className="mt-5 flex flex-col gap-2.5">
                    <Button
                      onClick={() => go(editorHref(username, live.id))}
                      className="h-10 rounded-lg bg-[#1a1a2e] text-[13.5px] font-semibold text-white hover:bg-[#2d2d44]"
                    >
                      Edit website
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                      {siteUrl && (
                        <IconAction label="View live site" href={siteUrl}>
                          <ExternalLink className="h-4 w-4" />
                        </IconAction>
                      )}
                      <IconAction label="Edit code" onClick={() => go(editorHref(username, live.id, "code"))}>
                        <Code2 className="h-4 w-4" />
                      </IconAction>
                      <IconAction label="Project settings" onClick={() => go(editorHref(username, live.id, "settings"))}>
                        <Settings2 className="h-4 w-4" />
                      </IconAction>
                      <IconAction label="Export .zip" onClick={() => void exportTheme(live)} busy={busy === `${live.id}:export`}>
                        <Download className="h-4 w-4" />
                      </IconAction>
                      <ResponsiveActionMenu
                        title={live.name}
                        items={menuFor(live, { preview: true })}
                        menuWidth="w-52"
                        trigger={
                          <button
                            type="button"
                            aria-label="More"
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#4b5563] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-[background-color,color,transform] duration-150 hover:bg-[#f8f9fa] hover:text-[#1a1a2e] active:scale-95"
                          >
                            {busy?.startsWith(live.id) && busy !== `${live.id}:export` ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                          </button>
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f3f4f6] text-[#6b7280]">
                  <Rocket className="h-4.5 w-4.5" />
                </span>
                <h2 id="live-heading" className="text-[15px] font-semibold text-[#1a1a2e]">Nothing is live</h2>
                <p className="text-[13px] text-[#6b7280]">Publish a theme from your library.</p>
              </div>
            )}
          </div>
        </section>

        {/* ── Library ────────────────────────────────────────────── */}
        <section aria-labelledby="library-heading" className="space-y-3">
          <SectionHeading
            title="Library"
            aside={
              <span className="rounded-md bg-[#eef0f3] px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums text-[#6b7280]" title={`Up to ${THEME_INSTALL_LIMIT} websites, including the live one`}>
                {slotsUsed}/{THEME_INSTALL_LIMIT}
              </span>
            }
          >
            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importZip(f)
              }}
            />
            <Button
              variant="ghost"
              onClick={() => fileInput.current?.click()}
              disabled={busy === "import" || slotsLeft === 0}
              className="h-9 rounded-lg px-2.5 text-[13px] font-medium text-[#4b5563] hover:bg-[#eef0f3] hover:text-[#1a1a2e]"
            >
              {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span className="hidden sm:inline">Upload .zip</span>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-9 rounded-lg border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f8f9fa]"
            >
              <Link href="/app/website-builder/themes" onClick={() => startNavigationLoading()}>
                <Plus className="h-4 w-4" />
                Add theme
              </Link>
            </Button>
          </SectionHeading>
          <h2 id="library-heading" className="sr-only">Library</h2>

          <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {library.length === 0 ? (
              <div className="px-6 py-9 text-center text-[13px] text-[#6b7280]">
                No other themes yet.
              </div>
            ) : (
              <ul className="divide-y divide-[#eceef1]">
                {library.map((i) => {
                  const def = getThemeDefinition(i.theme_id)
                  const isBusy = busy?.startsWith(i.id) ?? false
                  return (
                    <li key={i.id} className="flex items-center gap-3 p-3 transition-colors hover:bg-[#fafbfc] sm:gap-4 sm:p-4">
                      {/* The whole left of the row opens the editor — on a phone it is
                          the only Edit there is. */}
                      <button
                        type="button"
                        onClick={() => go(editorHref(username, i.id))}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:gap-4"
                        aria-label={`Edit ${i.name}`}
                      >
                        <span className="relative block w-24 shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] sm:w-36">
                          <span className="block aspect-[16/10]">
                            <WebsiteCover install={i} />
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-semibold text-[#1a1a2e]">{i.name}</span>
                          {/* No status word here. "Offline" and "Draft" name
                              the same ordinary thing — a site you have not
                              published — in language that sounds like a
                              fault, on every row you have not published yet.
                              The live site is called out in its own block
                              above; everything in the library is simply a
                              website you are working on. */}
                          <span className="mt-1 flex items-center gap-2 text-[12.5px] text-[#6b7280]">
                            <span className="truncate">
                              Edited {since(i.saved_at)}
                              {def && <> · {getIndustry(def.industry).label}</>}
                            </span>
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setPublishing(i)}
                          disabled={isBusy}
                          className="hidden h-9 rounded-lg border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f8f9fa] sm:inline-flex"
                        >
                          {busy === `${i.id}:publish` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
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
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ── Explore ────────────────────────────────────────────── */}
        <section aria-labelledby="explore-heading" className="space-y-3 pb-6">
          <SectionHeading title="Explore themes">
            <Link
              href="/app/website-builder/themes"
              onClick={() => startNavigationLoading()}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[#6b7280] transition-colors hover:text-[#1a1a2e]"
            >
              See all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </SectionHeading>
          <h2 id="explore-heading" className="sr-only">Explore themes</h2>
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
          "pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-[#1a1a2e] transition-[transform,opacity] duration-300",
          isRefreshing ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
        )}
      />
    </div>
  )
}

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
    <div className="group w-[78%] shrink-0 snap-start overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(15,23,42,0.25)] motion-reduce:transform-none sm:w-auto">
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
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1a1a2e] text-white transition-[background-color,transform] duration-150 hover:bg-[#2d2d44] active:scale-95 disabled:opacity-40"
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
