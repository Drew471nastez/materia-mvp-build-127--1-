"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Globe, Palette, MoreHorizontal,
  Plus, Check, Pencil, Trash2, Copy, RefreshCw,
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
import type { ThemeInstall, SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { useToast } from "@/hooks/use-toast"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { getWebsiteShareUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"

// ── Theme Library Catalog ────────────────────────────────────
// 6 themes covering different niches for digital products
const THEME_CATALOG = [
  {
    id: "storelib-default",
    themeId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    name: "Storelib Default",
    description: "Clean modern storefront for any digital product",
    niche: "General",
    colors: { primary: "#6366f1", bg: "#ffffff", hero: "#0f172a", heroText: "#ffffff", text: "#0f172a", surface: "#f8fafc" },
    font: "Inter",
    buttonStyle: "rounded" as const,
  },
  {
    id: "creator-minimal",
    themeId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    name: "Creator Minimal",
    description: "Refined minimal theme for creators",
    niche: "Creators",
    colors: { primary: "#171717", bg: "#ffffff", hero: "#fafafa", heroText: "#0a0a0a", text: "#0a0a0a", surface: "#f5f5f5" },
    font: "Plus Jakarta Sans",
    buttonStyle: "square" as const,
  },
  {
    id: "digital-wave",
    themeId: "c3d4e5f6-a7b8-9012-cdef-123456789012",
    name: "Digital Wave",
    description: "Bold gradients for creators who stand out",
    niche: "Digital Products",
    colors: { primary: "#7c3aed", bg: "#0a0a0f", hero: "#0a0a0f", heroText: "#ffffff", text: "#e2e8f0", surface: "#1a1a2e" },
    font: "Space Grotesk",
    buttonStyle: "pill" as const,
  },
  {
    id: "ebook-author",
    themeId: "ebook-author-theme-001",
    name: "Ebook Author",
    description: "Perfect for authors selling books & ebooks",
    niche: "Books & Ebooks",
    colors: { primary: "#b45309", bg: "#fffbeb", hero: "#78350f", heroText: "#fef3c7", text: "#451a03", surface: "#fef9c3" },
    font: "Playfair Display",
    buttonStyle: "rounded" as const,
  },
  {
    id: "course-creator",
    themeId: "course-creator-theme-001",
    name: "Course Creator",
    description: "Built for online courses & educational content",
    niche: "Courses & Education",
    colors: { primary: "#0891b2", bg: "#f0fdfa", hero: "#134e4a", heroText: "#ccfbf1", text: "#0f172a", surface: "#e0f2fe" },
    font: "DM Sans",
    buttonStyle: "rounded" as const,
  },
  {
    id: "designer-portfolio",
    themeId: "designer-portfolio-theme-001",
    name: "Designer Portfolio",
    description: "Showcase design assets & templates beautifully",
    niche: "Design & Templates",
    colors: { primary: "#e11d48", bg: "#fafafa", hero: "#18181b", heroText: "#fafafa", text: "#18181b", surface: "#f4f4f5" },
    font: "Sora",
    buttonStyle: "pill" as const,
  },
]

// ── Status badge ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "published") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5">
        <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
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

// ── Real section-based theme preview ─────────────────────────
// Renders actual sections from the theme's saved state, scaled down
function ThemePreview({
  install,
  aspectClass = "aspect-[16/10]",
}: {
  install: ThemeInstall
  aspectClass?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(400)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const s = install.settings?.settings ?? install.settings?.draft_settings ?? {}
  const theme: ThemeSettingsValues = {
    primary_color: (s.primary_color as string) ?? "#6366f1",
    secondary_color: (s.secondary_color as string) ?? "#8b5cf6",
    accent_color: (s.accent_color as string) ?? "#f59e0b",
    background_color: (s.background_color as string) ?? "#ffffff",
    surface_color: (s.surface_color as string) ?? "#f8fafc",
    text_color: (s.text_color as string) ?? "#0f172a",
    text_secondary_color: (s.text_secondary_color as string) ?? "#64748b",
    border_color: (s.border_color as string) ?? "#e2e8f0",
    button_style: (s.button_style as "rounded" | "square" | "pill") ?? "rounded",
    border_radius: (s.border_radius as number) ?? 8,
    font_heading: (s.font_heading as string) ?? "Inter",
    font_body: (s.font_body as string) ?? "Inter",
    brand_name: (s.brand_name as string) ?? install.name ?? "My Store",
  }

  // Get home page sections
  const homePage = install.pages?.find((p: any) => p.page_key === "home")
  const sections: SectionInstance[] = homePage?.sections ?? homePage?.draft_sections ?? []

  const RENDER_WIDTH = 1200
  const scale = containerWidth / RENDER_WIDTH

  return (
    <div
      ref={containerRef}
      className={cn("w-full overflow-hidden relative bg-white", aspectClass)}
    >
      {sections.length > 0 ? (
        <div
          className="origin-top-left"
          style={{
            width: RENDER_WIDTH,
            zoom: scale,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {sections.map((section) => (
            <SectionRenderer
              key={section.id}
              section={section}
              theme={theme}
              isEditing={false}
              isSelected={false}
            />
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-50">
          <div className="text-center">
            <Layers className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
            <p className="text-xs text-neutral-400">No sections yet</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Theme catalog preview (static, no saved sections) ────────
function CatalogThemePreview({ catalog }: { catalog: typeof THEME_CATALOG[0] }) {
  const { colors, font, buttonStyle } = catalog
  const btnRadius = buttonStyle === "pill" ? "9999px" : buttonStyle === "square" ? "4px" : "8px"

  return (
    <div className="w-full aspect-[4/3] overflow-hidden flex flex-col" style={{ background: colors.bg }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: colors.surface }}>
        <span className="text-[9px] font-bold truncate" style={{ color: colors.text, fontFamily: font }}>{catalog.name}</span>
        <div className="flex gap-1.5">
          <span className="text-[7px] opacity-40" style={{ color: colors.text }}>Shop</span>
          <span className="text-[7px] opacity-40" style={{ color: colors.text }}>About</span>
        </div>
      </div>
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center gap-1.5 px-4 min-h-0" style={{ background: colors.hero }}>
        <p className="text-[10px] font-bold text-center leading-tight" style={{ color: colors.heroText, fontFamily: font }}>
          Build Something Amazing
        </p>
        <p className="text-[7px] text-center opacity-60" style={{ color: colors.heroText }}>
          Premium digital products for creators
        </p>
        <div
          className="text-[6px] font-semibold px-3 py-1 mt-0.5"
          style={{ background: colors.primary, color: "#fff", borderRadius: btnRadius }}
        >
          Shop Now
        </div>
      </div>
      {/* Feature cards */}
      <div className="px-2 py-2 shrink-0" style={{ background: colors.bg }}>
        <div className="flex gap-1.5">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-1 rounded overflow-hidden" style={{ border: `1px solid ${colors.surface}` }}>
              <div className="h-4 bg-gradient-to-br from-neutral-200 to-neutral-100" style={{ opacity: 0.6 }} />
              <div className="p-1">
                <div className="h-0.5 rounded w-3/4 mb-0.5" style={{ background: colors.text, opacity: 0.12 }} />
                <div className="h-0.5 rounded w-1/2" style={{ background: colors.primary, opacity: 0.3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
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
            Delete website?
          </DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>{install?.name}</strong> and all its customizations. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    if (data.username) setUsername(data.username)
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
  const draftThemes = installs.filter(i => i.status !== "published")

  // Which catalog themes are already installed
  const installedThemeIds = new Set(installs.map(i => i.theme_id))

  const goToEditor = (installId: string) => {
    startNavigationLoading()
    router.push(`/website-builder/editor/${installId}`)
  }

  const handleAction = async (action: string, install: ThemeInstall) => {
    if (action === "edit") { goToEditor(install.id); return }
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

  const handleAddTheme = async (catalogTheme: typeof THEME_CATALOG[0]) => {
    // Check max 3 themes
    if (installs.length >= 3) {
      toast({ title: "Maximum 3 websites allowed. Remove one to add another.", variant: "destructive" })
      return
    }

    setActionLoading(catalogTheme.id + "_add")
    // Initialize themes if needed, then reload — the theme will be auto-created
    // We need to use the duplicate endpoint from an existing install of same theme, or use initialize
    // For simplicity: use initialize to ensure theme exists, then reload
    const res = await fetch("/api/website-builder/initialize", { method: "POST" })
    setActionLoading(null)
    if (res.ok) {
      toast({ title: `"${catalogTheme.name}" added to your websites` })
      await loadInstalls()
    }
  }

  const handleRename = async (id: string, name: string) => {
    const res = await fetch(`/api/website-builder/themes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      toast({ title: "Website renamed" })
      await loadInstalls()
    } else {
      const d = await res.json()
      toast({ title: d.error ?? "Failed to rename", variant: "destructive" })
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/website-builder/themes/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast({ title: "Website deleted" })
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
        <span>{initializing ? "Setting up your themes..." : "Loading..."}</span>
      </div>
    )
  }

  const websiteUrl = username ? getWebsiteShareUrl(username) : ""
  const websiteDisplay = username ? getWebsiteUrlDisplay(username) : ""

  return (
    <div className="max-w-[900px] mx-auto px-5 py-8">
      {/* ── Page header with View Live + URL ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Layers className="h-5 w-5 text-neutral-700" />
            <h1 className="text-xl font-bold text-neutral-900">Website Builder</h1>
          </div>
          <p className="text-sm text-neutral-500">Manage and customize your store website</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {websiteUrl && (
            <>
              <div className="flex items-center gap-1.5 text-sm text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5">
                <Globe className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                <span className="truncate max-w-[180px] text-xs">{websiteDisplay}</span>
                <button
                  className="text-purple-600 hover:text-purple-700 text-xs font-medium shrink-0 ml-1"
                  onClick={() => { navigator.clipboard.writeText(websiteUrl); toast({ title: "Link copied" }) }}
                >
                  Copy
                </button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => window.open(websiteUrl, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Live
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SECTION 1: Current Website (published/live theme)
          ══════════════════════════════════════════════════════════ */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-4">
          Current Website
        </h2>
        {liveTheme ? (
          <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
            {/* Preview in browser-style frame */}
            <div className="relative bg-neutral-100 p-4 sm:p-6">
              {/* Browser chrome */}
              <div className="rounded-xl overflow-hidden shadow-xl shadow-black/8 border border-neutral-200/80 bg-white">
                {/* Browser toolbar */}
                <div className="flex items-center gap-2 px-3 py-2 bg-neutral-50 border-b border-neutral-200">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/60" />
                  </div>
                  <div className="flex-1 mx-3">
                    <div className="bg-white rounded-md border border-neutral-200 px-3 py-0.5 text-[10px] text-neutral-400 truncate max-w-[260px]">
                      {websiteDisplay || "storelib.com/yoursite"}
                    </div>
                  </div>
                </div>
                {/* Actual rendered sections */}
                <ThemePreview install={liveTheme} aspectClass="aspect-[16/9]" />
              </div>
              <div className="absolute top-6 sm:top-8 left-6 sm:left-8">
                <StatusBadge status="published" />
              </div>
            </div>

            {/* Info bar */}
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-neutral-900 truncate">{liveTheme.name}</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {liveTheme.theme?.author ?? "Storelib"} · v{liveTheme.theme?.version ?? "1.0.0"}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => goToEditor(liveTheme.id)}
                    className="gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white"
                  >
                    <Palette className="h-3.5 w-3.5" />
                    Customize Website
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => handleAction("duplicate", liveTheme)}>
                        <Copy className="h-4 w-4 mr-2" />Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleAction("rename", liveTheme)}>
                        <Pencil className="h-4 w-4 mr-2" />Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleAction("unpublish", liveTheme)} className="text-amber-600">
                        <EyeOff className="h-4 w-4 mr-2" />Unpublish
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-neutral-200 p-12 text-center">
            <Globe className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-neutral-500 text-sm font-medium">No live website</p>
            <p className="text-neutral-400 text-xs mt-1">Publish a website from your drafts below</p>
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 2: My Websites (drafts/unpublished)
          ══════════════════════════════════════════════════════════ */}
      {draftThemes.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              My Websites
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadInstalls}
              className="gap-1.5 text-neutral-400 hover:text-neutral-700 h-7"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {draftThemes.map(install => (
              <div key={install.id} className="relative">
                {actionLoading?.startsWith(install.id) && (
                  <div className="absolute inset-0 bg-white/70 rounded-xl flex items-center justify-center z-10">
                    <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
                  </div>
                )}
                <div className="group rounded-xl border border-neutral-200 bg-white overflow-hidden hover:border-neutral-300 hover:shadow-md transition-all">
                  {/* Preview */}
                  <div className="relative cursor-pointer" onClick={() => goToEditor(install.id)}>
                    <ThemePreview install={install} aspectClass="aspect-[4/3]" />
                    <div className="absolute top-2.5 left-2.5">
                      <StatusBadge status={install.status} />
                    </div>
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" className="bg-white text-neutral-900 hover:bg-neutral-100 shadow-lg gap-1.5">
                          <Palette className="h-3.5 w-3.5" />
                          Customize Website
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Info */}
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
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleAction("publish", install)}>
                            <Globe className="h-4 w-4 mr-2" />Publish
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => goToEditor(install.id)}>
                            <Palette className="h-4 w-4 mr-2" />Customize Website
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleAction("duplicate", install)}>
                            <Copy className="h-4 w-4 mr-2" />Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleAction("rename", install)}>
                            <Pencil className="h-4 w-4 mr-2" />Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleAction("delete", install)} className="text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════
          SECTION 3: Theme Library (6 themes, portrait cards)
          ══════════════════════════════════════════════════════════ */}
      <section className="mb-12">
        <div className="mb-4">
          <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Theme Library
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {THEME_CATALOG.map(catalog => {
            const isAdded = installedThemeIds.has(catalog.themeId)
            const isLoadingThis = actionLoading === catalog.id + "_add"
            return (
              <div key={catalog.id} className="relative group">
                <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden transition-all hover:border-neutral-300 hover:shadow-md">
                  {/* Portrait preview */}
                  <div className="relative">
                    <CatalogThemePreview catalog={catalog} />

                    {/* Hover overlay — Add Theme button */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        {isLoadingThis ? (
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                        ) : isAdded ? (
                          <div className="flex flex-col items-center gap-1.5">
                            <Badge className="bg-white/90 text-neutral-700 border-0 text-[11px] font-medium px-3 py-1">
                              <Check className="h-3 w-3 mr-1" />
                              Added
                            </Badge>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleAddTheme(catalog)}
                            className="bg-white text-neutral-900 hover:bg-neutral-100 shadow-lg gap-1.5"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Theme
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-sm font-medium text-neutral-900 truncate">{catalog.name}</p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">{catalog.niche}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

      </section>

      {/* ── Dialogs ── */}
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
