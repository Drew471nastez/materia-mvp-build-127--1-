"use client"

/**
 * Header Section editor — rendered inside the shop header settings sidebar.
 *
 * Owns three top-level groups (Logo, Header Section, Navigation Links) and
 * a small Add/Edit Navigation Link modal. All state is lifted into the
 * parent ShopHeaderSettingsForm via the `onChange` prop so changes flow
 * through the existing draftConfig save pipeline.
 */

import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { ArrowUp, ArrowDown, ExternalLink, Pencil, Plus, Search, ShoppingBag, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import type {
  ShopHeaderSettings,
  NavLink,
  HeaderColorScheme,
  HeaderLayout,
  HeaderWidth,
} from "@/lib/store-builder/types"
import { defaultNavLinks } from "@/lib/store-builder/defaults"

interface HeaderSectionEditorProps {
  settings: ShopHeaderSettings
  onChange: (patch: Partial<ShopHeaderSettings>) => void
}

const COLOR_SCHEMES: { id: HeaderColorScheme; label: string; bg: string; fg: string; border?: string }[] = [
  { id: "white",     label: "White",     bg: "#ffffff", fg: "#111111", border: "#e5e7eb" },
  { id: "light",     label: "Light",     bg: "#f8f9fb", fg: "#111111", border: "#e5e7eb" },
  { id: "dark",      label: "Dark",      bg: "#1f2937", fg: "#ffffff" },
  { id: "black",     label: "Black",     bg: "#000000", fg: "#ffffff" },
  { id: "highlight", label: "Highlight", bg: "#fde7e0", fg: "#1a1a1a" },
]

// Visual previews for each header layout option (matches editor mock)
const LAYOUT_OPTIONS: { id: HeaderLayout; preview: ReactNode }[] = [
  {
    id: "logo-left-nav-right",
    preview: (
      <div className="flex items-center justify-between w-full">
        <span className="text-[11px] font-bold tracking-wide">LOGO</span>
        <div className="flex items-center gap-1">
          <span className="w-5 h-1 bg-gray-400 rounded-full" />
          <span className="w-5 h-1 bg-gray-400 rounded-full" />
          <span className="w-5 h-1 bg-gray-400 rounded-full" />
          <span className="ml-1.5"><Search className="w-3 h-3 text-gray-500" /></span>
          <span><ShoppingBag className="w-3 h-3 text-gray-500" /></span>
        </div>
      </div>
    ),
  },
  {
    id: "logo-left-nav-inline",
    preview: (
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold tracking-wide">LOGO</span>
          <span className="w-4 h-1 bg-gray-400 rounded-full ml-1" />
          <span className="w-4 h-1 bg-gray-400 rounded-full" />
          <span className="w-4 h-1 bg-gray-400 rounded-full" />
        </div>
        <div className="flex items-center gap-1.5">
          <Search className="w-3 h-3 text-gray-500" />
          <ShoppingBag className="w-3 h-3 text-gray-500" />
        </div>
      </div>
    ),
  },
  {
    id: "logo-left-nav-center",
    preview: (
      <div className="flex items-center justify-between w-full relative">
        <span className="text-[11px] font-bold tracking-wide">LOGO</span>
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
          <span className="w-4 h-1 bg-gray-400 rounded-full" />
          <span className="w-4 h-1 bg-gray-400 rounded-full" />
          <span className="w-4 h-1 bg-gray-400 rounded-full" />
        </div>
        <div className="flex items-center gap-1.5">
          <Search className="w-3 h-3 text-gray-500" />
          <ShoppingBag className="w-3 h-3 text-gray-500" />
        </div>
      </div>
    ),
  },
  {
    id: "nav-left-logo-center",
    preview: (
      <div className="flex items-center justify-between w-full relative">
        <div className="flex items-center gap-1">
          <span className="w-4 h-1 bg-gray-400 rounded-full" />
          <span className="w-4 h-1 bg-gray-400 rounded-full" />
          <span className="w-4 h-1 bg-gray-400 rounded-full" />
        </div>
        <span className="absolute left-1/2 -translate-x-1/2 text-[11px] font-bold tracking-wide">LOGO</span>
        <div className="flex items-center gap-1.5">
          <Search className="w-3 h-3 text-gray-500" />
          <ShoppingBag className="w-3 h-3 text-gray-500" />
        </div>
      </div>
    ),
  },
  {
    id: "logo-center-nav-below",
    preview: (
      <div className="flex flex-col items-center gap-1 w-full relative">
        <div className="w-full flex items-center justify-between">
          <span className="w-3" />
          <span className="text-[11px] font-bold tracking-wide">LOGO</span>
          <div className="flex items-center gap-1.5">
            <Search className="w-3 h-3 text-gray-500" />
            <ShoppingBag className="w-3 h-3 text-gray-500" />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-1 bg-gray-400 rounded-full" />
          <span className="w-4 h-1 bg-gray-400 rounded-full" />
          <span className="w-4 h-1 bg-gray-400 rounded-full" />
        </div>
      </div>
    ),
  },
]

const newId = () => `nav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export function HeaderSectionEditor({ settings, onChange }: HeaderSectionEditorProps) {
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [navModalOpen, setNavModalOpen] = useState(false)
  const [navModalEditing, setNavModalEditing] = useState<NavLink | null>(null)
  const [draftLink, setDraftLink] = useState<NavLink>({ id: "", label: "", url: "" })
  const [showLinkSourcePicker, setShowLinkSourcePicker] = useState(false)

  const navLinks = useMemo(() => settings.navLinks ?? defaultNavLinks, [settings.navLinks])
  const currentLayout = settings.headerLayout || "logo-left-nav-right"
  const currentScheme = settings.headerColorScheme || "white"
  const currentLayoutPreview = LAYOUT_OPTIONS.find((o) => o.id === currentLayout)?.preview

  // ─── Logo handlers ──────────────────────────────────────────────────────
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, mobile = false) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || "")
      if (mobile) onChange({ mobileLogoUrl: url })
      else onChange({ logoUrl: url })
    }
    reader.readAsDataURL(file)
  }

  // ─── Navigation link handlers ───────────────────────────────────────────
  const updateLinks = (next: NavLink[]) => onChange({ navLinks: next })

  const moveLink = (idx: number, dir: -1 | 1) => {
    const next = [...navLinks]
    const tgt = idx + dir
    if (tgt < 0 || tgt >= next.length) return
    ;[next[idx], next[tgt]] = [next[tgt], next[idx]]
    updateLinks(next)
  }

  const removeLink = (id: string) => updateLinks(navLinks.filter((l) => l.id !== id))

  const openAddLinkModal = () => {
    setNavModalEditing(null)
    setDraftLink({ id: newId(), label: "", url: "", openInNewTab: false, linkType: "custom" })
    setShowLinkSourcePicker(false)
    setNavModalOpen(true)
  }

  const openEditLinkModal = (link: NavLink) => {
    setNavModalEditing(link)
    setDraftLink({ ...link })
    setShowLinkSourcePicker(false)
    setNavModalOpen(true)
  }

  const saveLinkModal = () => {
    if (!draftLink.label.trim()) return
    if (navModalEditing) {
      updateLinks(navLinks.map((l) => (l.id === navModalEditing.id ? draftLink : l)))
    } else {
      updateLinks([...navLinks, draftLink])
    }
    setNavModalOpen(false)
  }

  return (
    <div className="space-y-7">
      {/* ═══════════════════ STORE LOGO ═══════════════════ */}
      <section className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Store Logo</h4>

        {/* Logo image picker */}
        <div className="space-y-2">
          <Label className="text-sm">Logo image</Label>
          {settings.logoUrl ? (
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={settings.logoUrl} alt="Store logo" className="max-w-full max-h-full object-contain" />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <label className="inline-flex items-center justify-center h-9 px-3 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                  Replace
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, false)} />
                </label>
                <button
                  type="button"
                  onClick={() => onChange({ logoUrl: undefined })}
                  className="inline-flex items-center justify-center h-9 px-3 rounded-lg text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <label className="flex items-center justify-center h-20 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer text-[13px] text-gray-500">
              Upload logo image
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, false)} />
            </label>
          )}
        </div>

        {/* Logo height slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Logo height</Label>
            <span className="text-[12px] text-gray-500 tabular-nums">{settings.logoHeight ?? 64}px</span>
          </div>
          <Slider
            value={[settings.logoHeight ?? 64]}
            min={20}
            max={160}
            step={1}
            onValueChange={([v]) => onChange({ logoHeight: v })}
          />
        </div>

        {/* Mobile logo toggle */}
        <div className="flex items-center justify-between pt-1">
          <Label className="text-sm leading-tight cursor-pointer flex-1">
            Use different logo for mobile devices
          </Label>
          <Switch
            checked={settings.useMobileLogo === true}
            onCheckedChange={(v) => onChange({ useMobileLogo: v })}
          />
        </div>

        {settings.useMobileLogo && (
          <div className="space-y-2">
            <Label className="text-sm">Mobile logo image</Label>
            {settings.mobileLogoUrl ? (
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={settings.mobileLogoUrl} alt="Mobile logo" className="max-w-full max-h-full object-contain" />
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <label className="inline-flex items-center justify-center h-9 px-3 rounded-lg border border-gray-200 bg-white text-[13px] font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
                    Replace
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, true)} />
                  </label>
                  <button
                    type="button"
                    onClick={() => onChange({ mobileLogoUrl: undefined })}
                    className="inline-flex items-center justify-center h-9 px-3 rounded-lg text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex items-center justify-center h-16 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer text-[13px] text-gray-500">
                Upload mobile logo
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, true)} />
              </label>
            )}
          </div>
        )}

        {/* Store title */}
        <div className="space-y-2">
          <Label className="text-sm">Store title</Label>
          <Input
            value={settings.storeTitle ?? ""}
            onChange={(e) => onChange({ storeTitle: e.target.value })}
            placeholder="My Store"
          />
          <p className="text-[11px] leading-relaxed text-gray-500">
            Search engines like Google need the store title, so ensure you add one even when you use a logo.
            Logos replace the store title on all pages. To show the store title again, delete the logo.
          </p>
        </div>
      </section>

      {/* ═══════════════════ HEADER SECTION ═══════════════════ */}
      <section className="space-y-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Header Section</h4>

        {/* Header layout */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Header Layout</Label>
          <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
            <div className="px-4 h-12 flex items-center">{currentLayoutPreview}</div>
            <button
              type="button"
              onClick={() => setLayoutPickerOpen(true)}
              className="w-full h-10 border-t border-gray-100 text-[13px] font-semibold text-gray-900 hover:bg-gray-50 transition-colors"
            >
              Change header layout
            </button>
          </div>
        </div>

        {/* Color settings */}
        <div className="space-y-2 pt-1">
          <Label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Color Settings</Label>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Make header transparent</span>
            <Switch
              checked={settings.headerTransparent === true}
              onCheckedChange={(v) => onChange({ headerTransparent: v })}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-gray-500">
            Choose a color scheme for the header. Visit the color scheme editor to customise colors.
          </p>
          <div className="space-y-2 pt-1">
            {COLOR_SCHEMES.map((s) => {
              const active = s.id === currentScheme
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onChange({ headerColorScheme: s.id })}
                  className={cn(
                    "w-full h-12 rounded-xl border flex items-center px-4 text-[14px] font-medium transition-all",
                    active ? "border-2 border-blue-500 ring-2 ring-blue-200/50" : "border border-gray-200 hover:border-gray-300",
                  )}
                  style={{ background: s.bg, color: s.fg, borderColor: active ? "#3b82f6" : s.border }}
                >
                  <span className="mr-3 font-bold tracking-tight" style={{ color: s.fg }}>
                    Aa
                  </span>
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Advanced settings */}
        <div className="space-y-3 pt-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Advanced Settings</Label>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Header width</span>
            <select
              value={settings.headerWidth || "full"}
              onChange={(e) => onChange({ headerWidth: e.target.value as HeaderWidth })}
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="full">Full Width</option>
              <option value="fixed">Fixed Width</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Fixed position</span>
            <Switch
              checked={settings.headerFixed === true}
              onCheckedChange={(v) => onChange({ headerFixed: v })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Vertical padding</span>
              <span className="text-[12px] text-gray-500 tabular-nums">{(settings.headerVerticalPaddingVw ?? 1.2).toFixed(1)}vw</span>
            </div>
            <Slider
              value={[Math.round((settings.headerVerticalPaddingVw ?? 1.2) * 10)]}
              min={0}
              max={50}
              step={1}
              onValueChange={([v]) => onChange({ headerVerticalPaddingVw: v / 10 })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700">Space between menu links</span>
              <span className="text-[12px] text-gray-500 tabular-nums">{(settings.headerLinkSpacingVw ?? 1.4).toFixed(1)}vw</span>
            </div>
            <Slider
              value={[Math.round((settings.headerLinkSpacingVw ?? 1.4) * 10)]}
              min={0}
              max={50}
              step={1}
              onValueChange={([v]) => onChange({ headerLinkSpacingVw: v / 10 })}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════ NAVIGATION LINKS ═══════════════════ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Navigation Links</h4>
          <button
            type="button"
            onClick={openAddLinkModal}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add link
          </button>
        </div>

        <div className="space-y-2">
          {navLinks.length === 0 && (
            <p className="text-[12px] text-gray-500 italic px-1">No navigation links yet.</p>
          )}
          {navLinks.map((link, idx) => (
            <div
              key={link.id}
              className="group flex items-center gap-2 px-3 h-11 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors"
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveLink(idx, -1)}
                  className="w-5 h-5 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move up"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={idx === navLinks.length - 1}
                  onClick={() => moveLink(idx, 1)}
                  className="w-5 h-5 inline-flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Move down"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-gray-900 truncate">{link.label}</div>
                <div className="text-[11px] text-gray-500 truncate flex items-center gap-1">
                  {link.openInNewTab && <ExternalLink className="w-2.5 h-2.5" />}
                  {link.url || "—"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => openEditLinkModal(link)}
                className="w-7 h-7 inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                aria-label="Edit link"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => removeLink(link.id)}
                className="w-7 h-7 inline-flex items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                aria-label="Delete link"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ Layout picker modal ═══════════════════ */}
      {layoutPickerOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40" onClick={() => setLayoutPickerOpen(false)}>
          <div
            className="bg-white w-full sm:w-[420px] sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-12 border-b border-gray-100 flex items-center justify-between px-4">
              <span className="text-[14px] font-semibold text-gray-900 mx-auto">Header Layout</span>
              <button
                type="button"
                onClick={() => setLayoutPickerOpen(false)}
                className="absolute right-4 w-7 h-7 inline-flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {LAYOUT_OPTIONS.map((opt) => {
                const active = opt.id === currentLayout
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange({ headerLayout: opt.id })
                      setLayoutPickerOpen(false)
                    }}
                    className={cn(
                      "w-full h-14 rounded-xl bg-white border px-4 flex items-center transition-all",
                      active ? "border-2 border-blue-500 ring-2 ring-blue-200/40" : "border border-gray-200 hover:border-gray-300",
                    )}
                  >
                    {opt.preview}
                  </button>
                )
              })}
            </div>
            <div className="p-4 border-t border-gray-100">
              <Button
                onClick={() => setLayoutPickerOpen(false)}
                className="w-full h-11 rounded-lg bg-blue-600 text-white text-[14px] font-semibold hover:bg-blue-700"
              >
                Choose this layout
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ Add / Edit Navigation Link modal ═══════════════════ */}
      {navModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 px-4" onClick={() => setNavModalOpen(false)}>
          <div
            className="bg-white w-full sm:w-[480px] rounded-2xl shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-14 border-b border-gray-100 flex items-center justify-between px-5">
              <span className="text-[16px] font-semibold text-gray-900">
                {navModalEditing ? "Edit Navigation Link" : "Add Navigation Link"}
              </span>
              <button
                type="button"
                onClick={() => setNavModalOpen(false)}
                className="w-8 h-8 inline-flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold text-gray-700">Name</Label>
                <Input
                  placeholder="eg. About us"
                  value={draftLink.label}
                  onChange={(e) => setDraftLink({ ...draftLink, label: e.target.value })}
                />
              </div>

              <div className="space-y-1.5 relative">
                <Label className="text-sm font-semibold text-gray-700">Link</Label>
                <Input
                  placeholder="Paste your link (or type to search)"
                  value={draftLink.url}
                  onChange={(e) => setDraftLink({ ...draftLink, url: e.target.value, linkType: "custom" })}
                  onFocus={() => setShowLinkSourcePicker(true)}
                />
                {showLinkSourcePicker && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border-l-2 border-blue-500 border-t border-r border-b border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto z-10">
                    {[
                      { id: "product",    label: "Products" },
                      { id: "collection", label: "Collections" },
                      { id: "page",       label: "Custom Pages" },
                      { id: "blog",       label: "Blogs" },
                      { id: "blogPost",   label: "Blog Posts" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setDraftLink({
                            ...draftLink,
                            linkType: opt.id as NavLink["linkType"],
                            url: draftLink.url || `/${opt.id}`,
                          })
                          setShowLinkSourcePicker(false)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-[14px] text-blue-600 font-medium hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                      >
                        <span className="w-7 h-7 rounded bg-gray-100 inline-flex items-center justify-center text-gray-400">
                          <Search className="w-3.5 h-3.5" />
                        </span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={draftLink.openInNewTab === true}
                  onChange={(e) => setDraftLink({ ...draftLink, openInNewTab: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[14px] text-gray-700">Open link in new tab</span>
              </label>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setNavModalOpen(false)}
                className="h-10 px-5 rounded-lg text-[14px] font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={saveLinkModal}
                disabled={!draftLink.label.trim()}
                className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[14px] font-semibold"
              >
                {navModalEditing ? "Save" : "Add Navigation Link"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
