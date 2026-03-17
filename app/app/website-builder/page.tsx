"use client"

import { useEffect, useState, useCallback } from "react"
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

// ── Theme preview placeholder ─────────────────────────────────
function ThemePreview({ install, size = "large" }: { install: ThemeInstall; size?: "large" | "small" }) {
  const bg = (install.settings?.settings?.primary_color as string) ?? "#6366f1"
  const bg2 = (install.settings?.settings?.background_color as string) ?? "#f8fafc"
  const text = (install.settings?.settings?.text_color as string) ?? "#0f172a"

  const gradients: Record<string, string> = {
    "storelib-default": "from-indigo-500 via-purple-500 to-violet-600",
    "creator-minimal": "from-neutral-700 via-neutral-800 to-neutral-900",
    "digital-wave": "from-violet-600 via-fuchsia-600 to-pink-600",
  }

  const themeSlug = install.theme?.slug ?? ""
  const gradient = gradients[themeSlug]

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-lg",
        size === "large" ? "aspect-[16/9]" : "aspect-[4/3]",
      )}
      style={{ background: bg2 }}
    >
      {/* Simulated page preview */}
      <div className="relative h-full flex flex-col">
        {/* Header bar */}
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{ background: "#fff", borderColor: "#e5e7eb" }}
        >
          <div className="h-2 w-16 rounded" style={{ background: bg, opacity: 0.8 }} />
          <div className="flex gap-1.5">
            <div className="h-1.5 w-8 rounded-full" style={{ background: text, opacity: 0.2 }} />
            <div className="h-1.5 w-8 rounded-full" style={{ background: text, opacity: 0.2 }} />
            <div className="h-4 w-10 rounded" style={{ background: bg, opacity: 0.9 }} />
          </div>
        </div>

        {/* Hero area */}
        <div
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-2 px-4",
            gradient ? `bg-gradient-to-br ${gradient}` : "",
          )}
          style={!gradient ? { background: bg } : undefined}
        >
          <div className="h-3 w-3/5 rounded" style={{ background: "#fff", opacity: 0.9 }} />
          <div className="h-1.5 w-2/5 rounded" style={{ background: "#fff", opacity: 0.5 }} />
          <div className="h-5 w-20 rounded-md mt-1" style={{ background: "#fff", opacity: 0.9 }} />
        </div>

        {/* Sections row */}
        <div className="flex gap-2 px-3 py-2" style={{ background: bg2 }}>
          {[60, 80, 50, 70].map((w, i) => (
            <div
              key={i}
              className="h-8 rounded flex-1"
              style={{ background: text, opacity: 0.06, maxWidth: `${w}%` }}
            />
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

// ── Live theme hero card ─────────────────────────────────────
function LiveThemeCard({
  install,
  onEdit,
  onCode,
  onAction,
}: {
  install: ThemeInstall
  onEdit: () => void
  onCode: () => void
  onAction: (action: string, install: ThemeInstall) => void
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
      <div className="relative">
        <ThemePreview install={install} size="large" />
        <div className="absolute top-3 left-3">
          <StatusBadge status={install.status} />
        </div>
      </div>
      <div className="p-5 flex items-center justify-between gap-4">
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
              <DropdownMenuItem onClick={() => onAction("view", install)}>
                <Globe className="h-4 w-4 mr-2" />View site
              </DropdownMenuItem>
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
    </div>
  )
}

// ── Library theme card (list row) ────────────────────────────
function LibraryThemeCard({
  install,
  onEdit,
  onCode,
  onAction,
}: {
  install: ThemeInstall
  onEdit: () => void
  onCode: () => void
  onAction: (action: string, install: ThemeInstall) => void
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 hover:border-neutral-300 transition-colors">
      {/* Mini preview */}
      <div className="w-[120px] shrink-0 hidden sm:block">
        <ThemePreview install={install} size="small" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-medium text-neutral-900">{install.name}</span>
          <StatusBadge status={install.status} />
        </div>
        <p className="text-sm text-neutral-500 mt-0.5 truncate">
          {install.theme?.description ?? "A Storelib theme"}
        </p>
        {install.theme?.tags?.length ? (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {install.theme.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[11px] bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="outline" onClick={onCode} className="gap-1.5 hidden sm:flex">
          <Code2 className="h-3.5 w-3.5" />
          <span>Edit code</span>
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
          <Settings2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Customize</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
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

  const loadInstalls = useCallback(async () => {
    const res = await fetch("/api/website-builder/themes")
    if (!res.ok) return
    const data = await res.json()
    setInstalls(data.installs ?? [])
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      // Initialize if first time
      const res = await fetch("/api/website-builder/themes")
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
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
      window.open(`/store`, "_blank"); return
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
    <div className="max-w-4xl mx-auto px-5 py-8">
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
      <section className="mb-8">
        <h2 className="text-[13px] font-semibold text-neutral-500 uppercase tracking-wider mb-3">
          Current theme
        </h2>
        {liveTheme ? (
          <LiveThemeCard
            install={liveTheme}
            onEdit={() => goToEditor(liveTheme.id)}
            onCode={() => goToCode(liveTheme.id)}
            onAction={handleAction}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center">
            <Globe className="h-8 w-8 text-neutral-300 mx-auto mb-3" />
            <p className="text-neutral-500 text-sm">No live theme. Publish a theme from your library below.</p>
          </div>
        )}
      </section>

      {/* ── Theme library ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
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

        {libraryThemes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 p-8 text-center">
            <p className="text-neutral-400 text-sm">No other themes installed.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {libraryThemes.map(install => (
              <div key={install.id} className="relative">
                {actionLoading?.startsWith(install.id) && (
                  <div className="absolute inset-0 bg-white/70 rounded-xl flex items-center justify-center z-10">
                    <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
                  </div>
                )}
                <LibraryThemeCard
                  install={install}
                  onEdit={() => goToEditor(install.id)}
                  onCode={() => goToCode(install.id)}
                  onAction={handleAction}
                />
              </div>
            ))}
          </div>
        )}

        {/* Free themes info box */}
        <div className="mt-4 rounded-xl bg-neutral-50 border border-neutral-200 p-4 text-sm text-neutral-500 flex items-start gap-3">
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
