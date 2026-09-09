"use client"

/**
 * ===========================================================================
 *  THE THEME MARKETPLACE
 * ===========================================================================
 * Shopify's theme store, at Storelib's size: a search box, a row of industry
 * filters, a grid of covers, and a detail view with the theme on a desktop
 * and a phone, its palette, its fonts, and one button.
 *
 * Everything on this page is drawn, not rendered — the covers are SVGs built
 * from each theme's colours, so twenty themes cost the same as one and the
 * grid paints in a single frame. Add posts to the same route the website
 * page uses.
 */

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, Check, Loader2, Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { cn } from "@/lib/utils"
import {
  THEME_INDUSTRIES,
  THEME_INSTALL_LIMIT,
  THEME_REGISTRY,
  getIndustry,
  getThemeBySlug,
  type ThemeDefinition,
  type ThemeIndustryKey,
} from "@/lib/website-builder/theme-registry"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { ThemeCover, ThemeCoverPair, ThemePhoneCover, coverSpecFromDefinition } from "@/components/website-builder/theme-cover"

type Filter = "all" | ThemeIndustryKey

function isIndustry(v: string | null): v is ThemeIndustryKey {
  return !!v && THEME_INDUSTRIES.some((i) => i.key === v)
}

export function ThemeMarketplaceClient({
  installedThemeIds,
  slotsUsed,
  initialTheme,
  initialIndustry,
}: {
  installedThemeIds: string[]
  slotsUsed: number
  initialTheme: string | null
  initialIndustry: string | null
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<Filter>(isIndustry(initialIndustry) ? initialIndustry : "all")
  const [open, setOpen] = React.useState<ThemeDefinition | null>(() => (initialTheme ? getThemeBySlug(initialTheme) : null))
  const [adding, setAdding] = React.useState<string | null>(null)
  // Added in this visit: the button flips to "Added" without a reload.
  const [added, setAdded] = React.useState<Set<string>>(() => new Set(installedThemeIds))
  const used = slotsUsed + (added.size - new Set(installedThemeIds).size)
  const slotsLeft = Math.max(0, THEME_INSTALL_LIMIT - used)

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return THEME_REGISTRY.filter((t) => {
      if (filter !== "all" && t.industry !== filter) return false
      if (!q) return true
      const hay = [t.name, t.tagline, t.description, getIndustry(t.industry).label, ...t.tags].join(" ").toLowerCase()
      return hay.includes(q)
    })
  }, [query, filter])

  const add = async (def: ThemeDefinition) => {
    if (added.has(def.id)) return
    if (slotsLeft === 0) {
      toast({ title: `Your library holds ${THEME_INSTALL_LIMIT}. Remove one first.`, variant: "destructive" })
      return
    }
    setAdding(def.id)
    try {
      const res = await fetch("/api/website-builder/themes/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme_id: def.id }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast({ title: d.error ?? "Could not add theme", variant: "destructive" })
        return
      }
      setAdded((prev) => new Set(prev).add(def.id))
      toast({ title: `${def.name} added` })
      router.refresh()
    } catch {
      toast({ title: "Could not add theme", variant: "destructive" })
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto page-scroll bg-[#f8f9fa]">
      <div className="app-page-enter mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/app/website-builder"
              onClick={() => startNavigationLoading()}
              aria-label="Back to Website"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#4b5563] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-[background-color,color,transform] duration-150 hover:bg-[#f8f9fa] hover:text-[#1a1a2e] active:scale-95"
            >
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </Link>
            <h1 className="truncate text-[24px] font-bold tracking-tight text-[#1a1a2e] sm:text-[26px]">Themes</h1>
          </div>
          <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[12px] font-semibold tabular-nums text-[#4b5563] ring-1 ring-inset ring-[#e5e7eb]">
            {used}/{THEME_INSTALL_LIMIT} in library
          </span>
        </div>

        {/* ── Search + filters ───────────────────────────────────── */}
        <div className="sticky top-0 z-10 -mx-4 mt-5 bg-[#f8f9fa]/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[#f8f9fa]/80 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative lg:w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search themes"
                aria-label="Search themes"
                className="h-9 rounded-lg border-[#e5e7eb] bg-white pl-9 pr-9 text-[13.5px] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
              <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
              {THEME_INDUSTRIES.map((i) => (
                <Chip key={i.key} active={filter === i.key} onClick={() => setFilter(i.key)}>
                  {i.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {/* ── Grid ───────────────────────────────────────────────── */}
        {visible.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-[#e5e7eb] bg-white px-6 py-14 text-center text-[13px] text-[#6b7280]">
            Nothing matches “{query}”.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 pb-8 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((t) => {
              const inLibrary = added.has(t.id)
              return (
                <div
                  key={t.id}
                  className="group overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(15,23,42,0.25)] motion-reduce:transform-none"
                >
                  <button
                    type="button"
                    onClick={() => setOpen(t)}
                    className="relative block aspect-[16/10] w-full overflow-hidden bg-[#f3f4f6]"
                    aria-label={`Preview ${t.name}`}
                  >
                    <ThemeCoverPair spec={coverSpecFromDefinition(t)} />
                  </button>
                  <div className="flex items-center gap-3 p-3.5">
                    <button type="button" onClick={() => setOpen(t)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-[14.5px] font-semibold text-[#1a1a2e]">{t.name}</p>
                      <p className="mt-0.5 truncate text-[12px] text-[#6b7280]">{getIndustry(t.industry).label}</p>
                    </button>
                    <AddButton inLibrary={inLibrary} busy={adding === t.id} disabled={slotsLeft === 0} onClick={() => void add(t)} compact />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Detail ─────────────────────────────────────────────────── */}
      <ThemeDetailDialog
        def={open}
        inLibrary={open ? added.has(open.id) : false}
        busy={open ? adding === open.id : false}
        slotsLeft={slotsLeft}
        onClose={() => setOpen(null)}
        onAdd={() => open && void add(open)}
      />
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors duration-150",
        active
          ? "bg-[#1a1a2e] text-white"
          : "bg-white text-[#4b5563] ring-1 ring-inset ring-[#e5e7eb] hover:bg-[#f3f4f6] hover:text-[#1a1a2e]",
      )}
    >
      {children}
    </button>
  )
}

function AddButton({
  inLibrary,
  busy,
  disabled,
  onClick,
  compact = false,
  className,
}: {
  inLibrary: boolean
  busy: boolean
  disabled: boolean
  onClick: () => void
  compact?: boolean
  className?: string
}) {
  if (inLibrary) {
    return (
      <span className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-[13px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/15", className)}>
        <Check className="h-4 w-4" />
        Added
      </span>
    )
  }
  return (
    <Button
      onClick={onClick}
      disabled={busy || disabled}
      title={disabled ? `Your library holds ${THEME_INSTALL_LIMIT}` : undefined}
      className={cn("h-9 rounded-lg bg-[#1a1a2e] text-[13px] font-semibold text-white hover:bg-[#2d2d44] disabled:opacity-40", compact ? "px-3" : "px-4", className)}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      Add
    </Button>
  )
}

function ThemeDetailDialog({
  def,
  inLibrary,
  busy,
  slotsLeft,
  onClose,
  onAdd,
}: {
  def: ThemeDefinition | null
  inLibrary: boolean
  busy: boolean
  slotsLeft: number
  onClose: () => void
  onAdd: () => void
}) {
  const [device, setDevice] = React.useState<"desktop" | "phone">("desktop")
  const sections = React.useMemo(() => {
    if (!def) return []
    return def.homeSections
      .filter((s) => s !== "header" && s !== "footer")
      .map((s) => SECTION_SCHEMAS[s]?.name ?? s.replace(/_/g, " "))
  }, [def])
  const spec = def ? coverSpecFromDefinition(def) : null

  return (
    <Dialog open={!!def} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl p-0 sm:max-w-3xl">
        {def && spec && (
          <>
            <div className="relative border-b border-[#eceef1] bg-[#eef0f3] p-4 sm:p-5">
              <div className="absolute right-4 top-4 z-10 flex rounded-lg bg-white p-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-inset ring-black/5 sm:right-5 sm:top-5">
                {(["desktop", "phone"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDevice(d)}
                    aria-pressed={device === d}
                    className={cn(
                      "h-7 rounded-md px-2.5 text-[12px] font-medium capitalize transition-colors",
                      device === d ? "bg-[#1a1a2e] text-white" : "text-[#6b7280] hover:text-[#1a1a2e]",
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
              {device === "desktop" ? (
                <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]">
                  <div className="aspect-[16/10] w-full">
                    <ThemeCover spec={spec} className="h-full w-full" title={`${def.name} on a desktop`} />
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-[210px] overflow-hidden rounded-[28px] border-[3px] border-[#1a1a2e] bg-white shadow-[0_12px_32px_-12px_rgba(15,23,42,0.35)]">
                  <div className="aspect-[390/780]">
                    <ThemePhoneCover spec={spec} className="h-full w-full" />
                  </div>
                </div>
              )}
            </div>
            <div className="grid gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_220px] sm:p-6">
              <div>
                <DialogHeader className="text-left">
                  <span className="w-fit rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-[11.5px] font-semibold text-[#4b5563]">
                    {getIndustry(def.industry).label}
                  </span>
                  <DialogTitle className="mt-1.5 text-[20px] font-semibold tracking-tight text-[#1a1a2e]">{def.name}</DialogTitle>
                  <DialogDescription className="text-[13.5px] leading-[1.55] text-[#6b7280]">{def.description}</DialogDescription>
                </DialogHeader>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {sections.map((s, i) => (
                    <span key={`${s}-${i}`} className="rounded-md bg-[#f3f4f6] px-2 py-1 text-[12px] font-medium text-[#4b5563]">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-5">
                <AddButton inLibrary={inLibrary} busy={busy} disabled={slotsLeft === 0} onClick={onAdd} className="h-10 w-full text-[14px]" />
                <div className="flex gap-1.5">
                  {[def.palette.primary, def.palette.secondary, def.palette.accent, def.palette.heroBg, def.palette.bg, def.palette.surface].map((c, i) => (
                    <span key={`${c}-${i}`} className="h-6 w-6 rounded-full ring-1 ring-inset ring-black/10" style={{ background: c }} title={c} />
                  ))}
                </div>
                <dl className="space-y-1 text-[13px]">
                  <div className="flex justify-between gap-3"><dt className="text-[#9ca3af]">Headings</dt><dd className="font-medium text-[#1a1a2e]">{def.fonts.heading}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#9ca3af]">Body</dt><dd className="font-medium text-[#1a1a2e]">{def.fonts.body}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#9ca3af]">Buttons</dt><dd className="font-medium capitalize text-[#1a1a2e]">{def.buttonStyle}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-[#9ca3af]">Version</dt><dd className="font-medium text-[#1a1a2e]">{def.version}</dd></div>
                </dl>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
