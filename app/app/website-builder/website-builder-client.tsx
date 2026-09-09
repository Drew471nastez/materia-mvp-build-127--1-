"use client"

/**
 * ===========================================================================
 *  THE WEBSITE PAGE
 * ===========================================================================
 * Three things, in the order a store owner cares about them:
 *
 *   1. The live website — one card, one picture, one button: Customize.
 *   2. The library — the other themes you are keeping (up to three in all),
 *      each with Publish, Customize and the long tail in a menu.
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
  DialogDescription,
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
import { ThemeCover, coverSpecFromDefinition, coverSpecFromSettings } from "@/components/website-builder/theme-cover"
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

// ── Small pieces ───────────────────────────────────────────────────────────

function StatusPill({ status }: { status: ThemeStatus }) {
  if (status === "published") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        Live
      </span>
    )
  }
  if (status === "unpublished") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/15">
        Offline
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[12px] font-semibold text-[#4b5563] ring-1 ring-inset ring-black/5">
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
  className,
}: {
  install: WebsiteSummary
  eager?: boolean
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
    <ThemeCover
      spec={coverSpecFromSettings(install.settings, def, install.name)}
      className={cn("h-full w-full", className)}
    />
  )
}

/** A thin browser chrome so a cover reads as "a website", not "a picture". */
function BrowserFrame({
  url,
  children,
  className,
}: {
  url?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-[#e5e7eb] bg-white", className)}>
      <div className="flex h-8 items-center gap-2 border-b border-[#eceef1] bg-[#f8f9fa] px-3">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e5e7eb]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e5e7eb]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e5e7eb]" />
        </span>
        {url && (
          <span className="ml-1 flex h-5 min-w-0 flex-1 items-center rounded-md bg-white px-2 text-[11px] text-[#6b7280] ring-1 ring-inset ring-black/5">
            <span className="truncate">{url}</span>
          </span>
        )}
      </div>
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#f3f4f6]">{children}</div>
    </div>
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
    <div className="inline-flex h-10 max-w-full items-stretch overflow-hidden rounded-xl border border-[#e5e7eb] bg-white text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <button
        type="button"
        onClick={copy}
        className="flex min-w-0 items-center gap-2 px-3 font-medium text-[#1a1a2e] transition-colors hover:bg-[#f8f9fa]"
        title="Copy website address"
      >
        <span className="truncate">{display}</span>
        <span className="relative h-4 w-4 shrink-0 text-[#6b7280]">
          <Copy className={cn("absolute inset-0 h-4 w-4 transition-opacity duration-150", copied && "opacity-0")} />
          <Check className={cn("absolute inset-0 h-4 w-4 text-emerald-600 transition-opacity duration-150", !copied && "opacity-0")} />
        </span>
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center border-l border-[#e5e7eb] px-2.5 text-[#6b7280] transition-colors hover:bg-[#f8f9fa] hover:text-[#1a1a2e]"
        title="Open website"
      >
        <ArrowUpRight className="h-4 w-4" />
      </a>
    </div>
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
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <h2 className="text-[17px] font-semibold tracking-tight text-[#1a1a2e]">{title}</h2>
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

  const publish = (i: WebsiteSummary) =>
    run(`${i.id}:publish`, () => fetch(`/api/website-builder/themes/${i.id}/publish`, json("POST", { action: "publish" })), `"${i.name}" is live`, "Could not publish")

  const unpublish = (i: WebsiteSummary) =>
    run(`${i.id}:unpublish`, () => fetch(`/api/website-builder/themes/${i.id}/publish`, json("POST", { action: "unpublish" })), `"${i.name}" is offline`, "Could not unpublish")

  const duplicate = (i: WebsiteSummary) => {
    if (slotsLeft === 0) {
      toast({ title: `You can keep up to ${THEME_INSTALL_LIMIT} websites. Remove one first.`, variant: "destructive" })
      return
    }
    return run(`${i.id}:duplicate`, () => fetch(`/api/website-builder/themes/${i.id}/duplicate`, json("POST", {})), `Copied "${i.name}"`, "Could not duplicate")
  }

  const rename = (i: WebsiteSummary, name: string) =>
    run(`${i.id}:rename`, () => fetch(`/api/website-builder/themes/${i.id}`, json("PATCH", { name })), "Renamed", "Could not rename")

  const remove = (i: WebsiteSummary) =>
    run(`${i.id}:delete`, () => fetch(`/api/website-builder/themes/${i.id}`, { method: "DELETE" }), `Removed "${i.name}"`, "Could not remove")

  const addTheme = (def: ThemeDefinition) => {
    if (slotsLeft === 0) {
      toast({ title: `You can keep up to ${THEME_INSTALL_LIMIT} websites. Remove one first.`, variant: "destructive" })
      return
    }
    return run(`${def.id}:add`, () => fetch("/api/website-builder/themes/add", json("POST", { theme_id: def.id })), `Added "${def.name}" to your library`, "Could not add theme")
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
      toast({ title: `Exported "${i.name}"` })
    } finally {
      setBusy(null)
    }
  }

  const importZip = async (file: File) => {
    if (slotsLeft === 0) {
      toast({ title: `You can keep up to ${THEME_INSTALL_LIMIT} websites. Remove one first.`, variant: "destructive" })
      return
    }
    const fd = new FormData()
    fd.append("file", file)
    await run("import", () => fetch("/api/website-builder/themes/import", { method: "POST", body: fd }), `Imported "${file.name.replace(/\.zip$/i, "")}"`, "Could not import that file")
    if (fileInput.current) fileInput.current.value = ""
  }

  const menuFor = (i: WebsiteSummary): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [
      { label: "Rename", icon: <Pencil className="h-4 w-4" />, onClick: () => setRenaming(i) },
      { label: "Duplicate", icon: <Layers className="h-4 w-4" />, onClick: () => void duplicate(i) },
      { label: "Edit code", icon: <Code2 className="h-4 w-4" />, onClick: () => go(editorHref(username, i.id, "code")) },
      { label: "Project settings", icon: <Settings2 className="h-4 w-4" />, onClick: () => go(editorHref(username, i.id, "settings")) },
      { label: "Export .zip", icon: <Download className="h-4 w-4" />, onClick: () => void exportTheme(i) },
    ]
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
      <div className="app-page-enter mx-auto max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 lg:px-8">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Website</h1>
            <p className="mt-1 text-[14px] text-[#6b7280]">Design, customize and publish your storefront.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {siteUrl && <CopyUrlPill url={siteUrl} display={siteDisplay} />}
            <Button
              asChild
              variant="outline"
              className="h-10 rounded-xl border-[#e5e7eb] bg-white px-3.5 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:bg-[#f8f9fa]"
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
              <div className="grid gap-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                <div className="bg-[#f8f9fa] p-4 sm:p-5 lg:border-r lg:border-[#eceef1]">
                  <BrowserFrame url={siteDisplay || undefined} className="shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]">
                    <WebsiteCover install={live} eager />
                  </BrowserFrame>
                </div>
                <div className="flex flex-col p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <StatusPill status="published" />
                    <span className="text-[12px] text-[#9ca3af]">Your live website</span>
                  </div>
                  <h2 id="live-heading" className="mt-3 truncate text-[20px] font-semibold tracking-tight text-[#1a1a2e]">
                    {live.name}
                  </h2>
                  <dl className="mt-3 space-y-1.5 text-[13px]">
                    <MetaRow label="Published" value={relativeTime(live.published_at) ?? "Live"} />
                    <MetaRow label="Last saved" value={relativeTime(live.saved_at) ?? "—"} />
                    {live.theme && <MetaRow label="Theme" value={`${live.theme.name} · v${live.theme.version}`} />}
                  </dl>
                  <div className="mt-auto pt-6">
                    <div className="flex gap-2">
                      <Button
                        onClick={() => go(editorHref(username, live.id))}
                        className="h-11 flex-1 rounded-xl bg-[#8b5cf6] text-[14px] font-semibold text-white hover:bg-[#7c3aed]"
                      >
                        Customize
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                      {siteUrl && (
                        <Button
                          asChild
                          variant="outline"
                          className="h-11 rounded-xl border-[#e5e7eb] px-4 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f8f9fa]"
                        >
                          <a href={siteUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            Preview
                          </a>
                        </Button>
                      )}
                      <ResponsiveActionMenu
                        title={live.name}
                        items={menuFor(live)}
                        menuWidth="w-52"
                        trigger={
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="More actions"
                            className="h-11 w-11 rounded-xl border-[#e5e7eb] text-[#1a1a2e] hover:bg-[#f8f9fa]"
                          >
                            {busy?.startsWith(live.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                          </Button>
                        }
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                      <QuietLink onClick={() => go(editorHref(username, live.id, "code"))} icon={<Code2 className="h-3.5 w-3.5" />}>Edit code</QuietLink>
                      <QuietLink onClick={() => go(editorHref(username, live.id, "settings"))} icon={<Settings2 className="h-3.5 w-3.5" />}>Project settings</QuietLink>
                      <QuietLink onClick={() => void exportTheme(live)} icon={<Download className="h-3.5 w-3.5" />}>Export</QuietLink>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f3f0ff] text-[#8b5cf6]">
                  <Rocket className="h-5 w-5" />
                </span>
                <h2 id="live-heading" className="text-[17px] font-semibold text-[#1a1a2e]">Nothing is live yet</h2>
                <p className="max-w-sm text-[13.5px] text-[#6b7280]">
                  Publish a theme from your library and it appears at{" "}
                  <span className="font-medium text-[#1a1a2e]">{siteDisplay || "your store address"}</span>.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── Library ────────────────────────────────────────────── */}
        <section aria-labelledby="library-heading" className="space-y-3">
          <SectionHeading
            title="Theme library"
            aside={
              <span className="rounded-full bg-[#eef0f3] px-2 py-0.5 text-[11.5px] font-medium text-[#6b7280]" title={`Up to ${THEME_INSTALL_LIMIT} websites, including the live one`}>
                {slotsUsed} of {THEME_INSTALL_LIMIT}
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
              className="h-9 rounded-lg px-3 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#eef0f3]"
            >
              {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload .zip
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

          <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {library.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <p className="text-[14px] font-medium text-[#1a1a2e]">Nothing waiting in the wings</p>
                <p className="max-w-sm text-[13px] text-[#6b7280]">
                  Add a theme to try a new look without touching your live website. Publish it when it is ready.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#eceef1]">
                {library.map((i) => {
                  const def = getThemeDefinition(i.theme_id)
                  const isBusy = busy?.startsWith(i.id) ?? false
                  return (
                    <li key={i.id} className="group flex items-center gap-4 p-3 transition-colors hover:bg-[#fafbfc] sm:p-4">
                      <button
                        type="button"
                        onClick={() => go(editorHref(username, i.id))}
                        className="relative w-[112px] shrink-0 overflow-hidden rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] sm:w-[144px]"
                        aria-label={`Customize ${i.name}`}
                      >
                        <span className="block aspect-[16/10]">
                          <WebsiteCover install={i} />
                        </span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[14.5px] font-semibold text-[#1a1a2e]">{i.name}</span>
                          <StatusPill status={i.status} />
                        </div>
                        <p className="mt-1 truncate text-[12.5px] text-[#6b7280]">
                          Saved {relativeTime(i.saved_at) ?? "—"}
                          {i.theme && <> · {i.theme.name}</>}
                          {def && <> · {getIndustry(def.industry).label}</>}
                        </p>
                      </div>
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
                          className="h-9 rounded-lg bg-[#1a1a2e] px-3 text-[13px] font-medium text-white hover:bg-[#2d2d44]"
                        >
                          Customize
                        </Button>
                        <ResponsiveActionMenu
                          title={i.name}
                          items={[
                            { label: "Publish", icon: <Rocket className="h-4 w-4" />, onClick: () => setPublishing(i) },
                            ...menuFor(i),
                          ]}
                          menuWidth="w-52"
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`More actions for ${i.name}`}
                              className="h-9 w-9 rounded-lg text-[#6b7280] hover:bg-[#eef0f3] hover:text-[#1a1a2e]"
                            >
                              {isBusy && busy !== `${i.id}:publish` ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                            </Button>
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
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[#8b5cf6] transition-colors hover:text-[#7c3aed]"
            >
              View all themes
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </SectionHeading>
          <h2 id="explore-heading" className="sr-only">Explore themes</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {explore.map((t) => (
              <ExploreCard
                key={t.id}
                def={t}
                busy={busy === `${t.id}:add`}
                disabled={slotsLeft === 0}
                onAdd={() => void addTheme(t)}
                onPreview={() => go(`/app/website-builder/themes?theme=${t.slug}`)}
              />
            ))}
          </div>
          {slotsLeft === 0 && (
            <p className="text-[12.5px] text-[#9ca3af]">
              Your library is full. Remove a theme to add another.
            </p>
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
                ? <>It becomes your live website at <span className="font-medium text-foreground">{siteDisplay}</span>. “{live.name}” goes offline but stays in your library, with everything saved.</>
                : <>It becomes your live website at <span className="font-medium text-foreground">{siteDisplay}</span>.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed]"
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
            <AlertDialogDescription>
              Visitors to {siteDisplay || "your website"} will see a placeholder until you publish a theme again. Nothing is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-amber-600 hover:bg-amber-700"
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
            <AlertDialogDescription>
              This deletes its pages, settings and code. Export it first if you might want it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 hover:bg-red-700"
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
          "pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-[#8b5cf6] transition-[transform,opacity] duration-300",
          isRefreshing ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
        )}
      />
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-[88px] shrink-0 text-[#9ca3af]">{label}</dt>
      <dd className="truncate text-[#1a1a2e]">{value}</dd>
    </div>
  )
}

function QuietLink({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[#6b7280] transition-colors hover:text-[#1a1a2e]"
    >
      {icon}
      {children}
    </button>
  )
}

function ExploreCard({
  def,
  busy,
  disabled,
  onAdd,
  onPreview,
}: {
  def: ThemeDefinition
  busy: boolean
  disabled: boolean
  onAdd: () => void
  onPreview: () => void
}) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(15,23,42,0.25)] motion-reduce:transform-none">
      <button
        type="button"
        onClick={onPreview}
        className="relative block aspect-[16/10] w-full overflow-hidden bg-[#f3f4f6]"
        aria-label={`Preview ${def.name}`}
      >
        <ThemeCover spec={coverSpecFromDefinition(def)} className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.02] motion-reduce:transform-none" />
      </button>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-[#1a1a2e]">{def.name}</p>
            <p className="mt-0.5 text-[12px] text-[#6b7280]">{getIndustry(def.industry).label}</p>
          </div>
          <span className="shrink-0 rounded-full bg-[#f3f0ff] px-2 py-0.5 text-[11px] font-semibold text-[#7c3aed]">Free</span>
        </div>
        <p className="mt-2 line-clamp-2 text-[12.5px] leading-[1.45] text-[#6b7280]">{def.tagline}</p>
        <div className="mt-auto flex gap-2 pt-4">
          <Button
            onClick={onAdd}
            disabled={busy || disabled}
            className="h-9 flex-1 rounded-lg bg-[#1a1a2e] text-[13px] font-medium text-white hover:bg-[#2d2d44] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
          <Button
            variant="outline"
            onClick={onPreview}
            className="h-9 rounded-lg border-[#e5e7eb] px-3 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f8f9fa]"
          >
            Preview
          </Button>
        </div>
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
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename website</DialogTitle>
          <DialogDescription>Only you see this name. Your store address stays the same.</DialogDescription>
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
          className="h-11 rounded-xl"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button onClick={() => void submit()} disabled={saving || !name.trim()} className="rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed]">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
