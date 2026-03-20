"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Eye, Code2, Settings2, Globe, Palette, MoreHorizontal,
  Plus, Check, Pencil, Trash2, Copy, Upload, RefreshCw,
  EyeOff, ExternalLink, Loader2, AlertTriangle, Layers,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { ThemeInstall } from "@/lib/website-builder/types"
import { useToast } from "@/hooks/use-toast"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { getWebsiteShareUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"

// ── Status badge ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Live
      </Badge>
    )
  }
  if (status === "draft") {
    return (
      <Badge className="bg-amber-500/15 text-amber-700 border-amber-200 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5">
        Draft
      </Badge>
    )
  }
  return (
    <Badge className="bg-neutral-100 text-neutral-500 border-neutral-200 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5">
      Unpublished
    </Badge>
  )
}

// ── Theme preview using actual screenshot (thum.io) with mock fallback ─────
function ThemePreview({
  install,
  size = "large",
  username,
  screenshotTimestamp,
}: {
  install: ThemeInstall
  size?: "large" | "small"
  username?: string
  screenshotTimestamp?: number
}) {
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const isSmall = size === "small"
  const isPublished = install.status === "published"

  // Only show screenshot for the published (live) theme
  const screenshotUrl = isPublished && username && !imgError
    ? `https://image.thum.io/get/width/800/crop/${isSmall ? "300" : "500"}/${encodeURIComponent(`https://materia.so/u/${username}`)}?t=${screenshotTimestamp ?? 0}`
    : null

  // Mock preview using theme colors (fallback)
  const s = install.settings?.draft_settings ?? install.settings?.settings ?? {}
  const primaryColor = (s.primary_color as string) ?? "#6366f1"
  const bgColor = (s.background_color as string) ?? "#ffffff"
  const textColor = (s.text_color as string) ?? "#0f172a"
  const surfaceColor = (s.surface_color as string) ?? "#f8fafc"
  const brandName = (s.brand_name as string) ?? install.name ?? "My Store"
  const fontHeading = (s.font_heading as string) ?? "Inter"
  const buttonStyle = (s.button_style as string) ?? "rounded"
  const btnRadius = buttonStyle === "pill" ? "9999px" : buttonStyle === "square" ? "4px" : "8px"
  const heroSection = install.pages?.find((p: any) => p.page_key === "home")
  const pageSections = heroSection?.draft_sections ?? heroSection?.sections ?? []
  const hero = Array.isArray(pageSections) ? pageSections.find((sec: any) => sec.type === "hero") : null
  const heroBg = String(hero?.settings?.bg_color ?? "#0f172a")
  const heroTextColor = String(hero?.settings?.text_color ?? "#ffffff")
  const heroHeading = String(hero?.settings?.heading ?? "Discover Amazing Digital Products")
  const heroCta = String(hero?.settings?.cta_text ?? "Shop Now")

  return (
    <div
      className={cn(
        "w-full overflow-hidden border border-neutral-200/60 relative",
        isSmall ? "aspect-[4/3] rounded-lg" : "aspect-[16/10] rounded-xl",
      )}
      style={{ background: bgColor }}
    >
      {/* Screenshot image */}
      {screenshotUrl && (
        <>
          {!imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 z-10">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            </div>
          )}
          <img
            src={screenshotUrl}
            alt="Live site preview"
            className={cn("absolute inset-0 w-full h-full object-cover object-top transition-opacity duration-300", imgLoaded ? "opacity-100" : "opacity-0")}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        </>
      )}

      {/* Mock fallback (always rendered, hidden when screenshot loaded) */}
      {(!screenshotUrl || imgError) && (
        <div className="relative h-full flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0" style={{ background: bgColor, borderColor: surfaceColor }}>
            <span className={cn("font-bold truncate", isSmall ? "text-[8px]" : "text-[10px]")} style={{ color: textColor, fontFamily: fontHeading }}>
              {brandName}
            </span>
            {!isSmall && (
              <div className="flex gap-1">
                <span className="text-[7px] opacity-50" style={{ color: textColor }}>Shop</span>
                <span className="text-[7px] opacity-50" style={{ color: textColor }}>About</span>
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-1 px-3 min-h-0" style={{ background: heroBg }}>
            <p className={cn("font-bold text-center leading-tight max-w-[90%]", isSmall ? "text-[8px]" : "text-[11px]")} style={{ color: heroTextColor, fontFamily: fontHeading }}>
              {heroHeading}
            </p>
            <div className={cn("text-white font-semibold mt-0.5", isSmall ? "text-[6px] px-2 py-0.5" : "text-[7px] px-3 py-1")} style={{ background: primaryColor, borderRadius: btnRadius }}>
              {heroCta}
            </div>
          </div>
          <div className="px-2 py-1.5 shrink-0" style={{ background: bgColor }}>
            <div className="flex gap-1">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex-1 rounded overflow-hidden" style={{ border: `1px solid ${surfaceColor}` }}>
                  <div className={cn("bg-gradient-to-br from-neutral-200 to-neutral-100", isSmall ? "h-3" : "h-5")} />
                  <div className="p-0.5">
                    <div className={cn("rounded", isSmall ? "h-0.5 w-3/4" : "h-1 w-3/4")} style={{ background: textColor, opacity: 0.15 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Rename dialog ────────────────────────────────────────────
function RenameDialog({
  open, onClose, install, onSave,
}: { open: boolean; onClose: () => void; install: ThemeInstall | null; onSave: (id: string, name: string) => Promise<void> }) {
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => { setName(install?.name ?? "") }, [install])

  const handleSave = async () => {
    if (!install || !name.trim()) return
    setLoading(true)
    await onSave(install.id, name.trim())
    setLoading(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename theme</DialogTitle>
          <DialogDescription>Choose a name for this theme installation.</DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Theme name"
          onKeyDown={e => e.key === "Enter" && handleSave()}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading || !name.trim()}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Delete confirm dialog ────────────────────────────────────
function DeleteDialog({
  open, onClose, install, onDelete,
}: { open: boolean; onClose: () => void; install: ThemeInstall | null; onDelete: (id: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    if (!install) return
    setLoading(true)
    await onDelete(install.id)
    setLoading(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Delete theme?
          </DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>{install?.name}</strong> and all its customizations. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Delete theme
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Live theme hero card (Current theme — larger) ────────────
function LiveThemeCard({
  install,
  username,
  onEdit,
  onCode,
  onAction,
  screenshotTimestamp,
}: {
  install: ThemeInstall
  username: string
  onEdit: () => void
  onCode: () => void
  onAction: (action: string, install: ThemeInstall) => void
  screenshotTimestamp?: number
}) {
  const websiteUrl = username ? getWebsiteShareUrl(username) : ""
  const websiteDisplay = username ? getWebsiteUrlDisplay(username) : ""

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
      <div className="relative">
        <ThemePreview install={install} size="large" username={username} screenshotTimestamp={screenshotTimestamp} />
        <div className="absolute top-3 left-3">
          <StatusBadge status={install.status} />
        </div>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[17px] font-semibold text-neutral-900 truncate">{install.name}</h2>
            </div>
            <p className="text-sm text-neutral-500 mt-0.5">
              {install.theme?.author ?? "Storelib"} · v{install.theme?.version ?? "1.0.0"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={onCode} className="gap-1.5">
              <Code2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Edit code</span>
            </Button>
            <Button size="sm" onClick={onEdit} className="gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white">
              <Palette className="h-3.5 w-3.5" />
              Edit theme
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {websiteUrl && (
                  <DropdownMenuItem onClick={() => window.open(websiteUrl, "_blank")}>
                    <ExternalLink className="h-4 w-4 mr-2" />View live site
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onAction("duplicate", install)}>
                  <Copy className="h-4 w-4 mr-2" />Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onAction("rename", install)}>
                  <Pencil className="h-4 w-4 mr-2" />Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onAction("unpublish", install)} className="text-amber-600">
                  <EyeOff className="h-4 w-4 mr-2" />Unpublish
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {websiteUrl && (
          <div className="mt-3 flex items-center gap-2 text-sm text-neutral-500 bg-neutral-50 rounded-lg px-3 py-2">
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{websiteDisplay}</span>
            <button
              className="text-purple-600 hover:text-purple-700 text-xs font-medium shrink-0"
              onClick={() => { navigator.clipboard.writeText(websiteUrl); }}
            >
              Copy
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Theme card (grid card — 3 per row) ───────────────────────
function ThemeGridCard({
  install,
  onEdit,
  onAction,
  username,
  screenshotTimestamp,
}: {
  install: ThemeInstall
  onEdit: () => void
  onAction: (action: string, install: ThemeInstall) => void
  username?: string
  screenshotTimestamp?: number
}) {
  return (
    <div className="group rounded-xl border border-neutral-200 bg-white overflow-hidden hover:border-neutral-300 hover:shadow-md transition-all">
      {/* Preview */}
      <div className="relative cursor-pointer" onClick={onEdit}>
        <ThemePreview install={install} size="small" username={username} screenshotTimestamp={screenshotTimestamp} />
        <div className="absolute top-2 left-2">
          <StatusBadge status={install.status} />
        </div>
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="sm" className="bg-white text-neutral-900 hover:bg-neutral-100 shadow-lg gap-1.5">
              <Palette className="h-3.5 w-3.5" />
              Customize
            </Button>
          </div>
        </div>
      </div>

      {/* Info + actions */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">{install.name}</p>
            <p className="text-xs text-neutral-500 truncate mt-0.5">
              {install.theme?.author ?? "Storelib"}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onAction("publish", install)}>
                <Globe className="h-4 w-4 mr-2" />Publish
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAction("edit", install)}>
                <Palette className="h-4 w-4 mr-2" />Edit theme
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAction("code", install)}>
                <Code2 className="h-4 w-4 mr-2" />Edit code
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAction("duplicate", install)}>
                <Copy className="h-4 w-4 mr-2" />Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAction("rename", install)}>
                <Pencil className="h-4 w-4 mr-2" />Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAction("delete", install)} className="text-red-600">
                <Trash2 className="h-4 w-4 mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function WebsiteBuilderPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [installs, setInstalls] = useState<ThemeInstall[]>([])
  const [loading, setLoading] = useState(true)
  const [initializing, setInitializing] = useState(false)
  const [renameInstall, setRenameInstall] = useState<ThemeInstall | null>(null)
  const [deleteInstall, setDeleteInstall] = useState<ThemeInstall | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [username, setUsername] = useState("")
  const [screenshotTimestamp, setScreenshotTimestamp] = useState(() => Date.now())

  const loadInstalls = useCallback(async () => {
    const res = await fetch("/api/website-builder/themes")
    if (!res.ok) return
    const data = await res.json()
    setInstalls(data.installs ?? [])
    // Derive username from the first install's brand_name or creator slug
    if (data.username) {
      setUsername(data.username)
    }
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      const res = await fetch("/api/website-builder/themes")
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      if (data.username) setUsername(data.username)
      if ((data.installs ?? []).length === 0) {
        setInitializing(true)
        await fetch("/api/website-builder/initialize", { method: "POST" })
        setInitializing(false)
        await loadInstalls()
      } else {
        setInstalls(data.installs)
      }
      setLoading(false)
    }
    init()
  }, [loadInstalls])

  const liveTheme = installs.find(i => i.status === "published")
  const libraryThemes = installs.filter(i => i.status !== "published")

  const goToEditor = (installId: string) => {
    startNavigationLoading()
    router.push(`/website-builder/editor/${installId}`)
  }

  const goToCode = (installId: string) => {
    startNavigationLoading()
    router.push(`/website-builder/code/${installId}`)
  }

  const handleAction = async (action: string, install: ThemeInstall) => {
    if (action === "edit") { goToEditor(install.id); return }
    if (action === "code") { goToCode(install.id); return }
    if (action === "rename") { setRenameInstall(install); return }
    if (action === "delete") { setDeleteInstall(install); return }

    if (action === "view") {
      const url = username ? getWebsiteShareUrl(username) : ""
      if (url) window.open(url, "_blank")
      return
    }

    if (action === "publish") {
      setActionLoading(install.id + "_publish")
      const res = await fetch(`/api/website-builder/themes/${install.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      })
      setActionLoading(null)
      if (res.ok) {
        toast({ title: `"${install.name}" is now live` })
        setScreenshotTimestamp(Date.now())
        await loadInstalls()
      } else {
        const d = await res.json()
        toast({ title: d.error ?? "Failed to publish", variant: "destructive" })
      }
      return
    }

    if (action === "unpublish") {
      setActionLoading(install.id + "_unpublish")
      const res = await fetch(`/api/website-builder/themes/${install.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unpublish" }),
      })
      setActionLoading(null)
      if (res.ok) {
        toast({ title: `"${install.name}" unpublished` })
        await loadInstalls()
      } else {
        const d = await res.json()
        toast({ title: d.error ?? "Failed to unpublish", variant: "destructive" })
      }
      return
    }

    if (action === "duplicate") {
      setActionLoading(install.id + "_dup")
      const res = await fetch(`/api/website-builder/themes/${install.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      setActionLoading(null)
      if (res.ok) {
        toast({ title: `"${install.name}" duplicated` })
        await loadInstalls()
      } else {
        const d = await res.json()
        toast({ title: d.error ?? "Failed to duplicate", variant: "destructive" })
      }
      return
    }
  }

  const handleRename = async (id: string, name: string) => {
    const res = await fetch(`/api/website-builder/themes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      toast({ title: "Theme renamed" })
      await loadInstalls()
    } else {
      const d = await res.json()
      toast({ title: d.error ?? "Failed to rename", variant: "destructive" })
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/website-builder/themes/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast({ title: "Theme deleted" })
      await loadInstalls()
    } else {
      const d = await res.json()
      toast({ title: d.error ?? "Failed to delete", variant: "destructive" })
    }
  }

  if (loading || initializing) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-neutral-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>{initializing ? "Setting up your themes…" : "Loading…"}</span>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-5 py-8">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Layers className="h-6 w-6 text-neutral-700" />
            <h1 className="text-[22px] font-bold text-neutral-900">Website Builder</h1>
          </div>
          <p className="text-sm text-neutral-500">Manage your store's look and feel</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" disabled>
          <Upload className="h-3.5 w-3.5" />
          Import theme
        </Button>
      </div>

      {/* ── Current live theme ── */}
      <section className="mb-10">
        <h2 className="text-[13px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">
          Current theme
        </h2>
        {liveTheme ? (
          <LiveThemeCard
            install={liveTheme}
            username={username}
            onEdit={() => goToEditor(liveTheme.id)}
            onCode={() => goToCode(liveTheme.id)}
            onAction={handleAction}
            screenshotTimestamp={screenshotTimestamp}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center">
            <Globe className="h-8 w-8 text-neutral-300 mx-auto mb-3" />
            <p className="text-neutral-500 text-sm">No live theme. Publish a theme from your library below.</p>
          </div>
        )}
      </section>

      {/* ── Theme library (3 per row grid) ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-semibold text-neutral-500 uppercase tracking-wider">
            Theme library
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadInstalls}
            className="gap-1.5 text-neutral-400 hover:text-neutral-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {libraryThemes.length === 0 && !liveTheme ? (
          <div className="rounded-xl border border-dashed border-neutral-200 p-8 text-center">
            <p className="text-neutral-400 text-sm">No themes installed yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Show all themes including live in the grid */}
            {installs.map(install => (
              <div key={install.id} className="relative">
                {actionLoading?.startsWith(install.id) && (
                  <div className="absolute inset-0 bg-white/70 rounded-xl flex items-center justify-center z-10">
                    <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
                  </div>
                )}
                <ThemeGridCard
                  install={install}
                  onEdit={() => goToEditor(install.id)}
                  onAction={handleAction}
                  username={username}
                  screenshotTimestamp={screenshotTimestamp}
                />
              </div>
            ))}
          </div>
        )}

        {/* Free themes info box */}
        <div className="mt-6 rounded-xl bg-neutral-50 border border-neutral-200 p-4 text-sm text-neutral-500 flex items-start gap-3">
          <Check className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
          <div>
            <span className="font-medium text-neutral-700">3 free themes included</span>
            <span className="ml-1">— Storelib Default, Creator Minimal, and Digital Wave are pre-installed and ready to customize.</span>
          </div>
        </div>
      </section>

      {/* Dialogs */}
      <RenameDialog
        open={!!renameInstall}
        onClose={() => setRenameInstall(null)}
        install={renameInstall}
        onSave={handleRename}
      />
      <DeleteDialog
        open={!!deleteInstall}
        onClose={() => setDeleteInstall(null)}
        install={deleteInstall}
        onDelete={handleDelete}
      />
    </div>
  )
}
