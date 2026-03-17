"use client"

import { useEffect, useState, useCallback, use } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Monitor, Smartphone, Loader2, Globe, Save,
  ChevronDown, Plus, Eye, EyeOff, GripVertical, Trash2,
  Copy, Settings, Check, Layers, Palette, X, RotateCcw,
  Layout, AlignLeft, Image, ShoppingBag, MessageSquare,
  HelpCircle, Megaphone, BarChart2, Grid, Award, LayoutGrid,
  DollarSign, LayoutTemplate,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  ThemeInstall, SectionInstance, ThemeSettingsValues,
  PageKey, EditorPanel, SchemaField,
} from "@/lib/website-builder/types"
import { PAGE_META } from "@/lib/website-builder/types"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS, SECTION_CATEGORIES } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"
import { toast } from "sonner"

// ── Field editor ─────────────────────────────────────────────
function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: SchemaField
  value: unknown
  onChange: (v: unknown) => void
}) {
  const raw = value ?? field.default

  if (field.type === "text" || field.type === "link") {
    return (
      <input
        type="text"
        className="w-full h-8 px-2.5 text-[13px] border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-neutral-900"
        placeholder={field.placeholder ?? ""}
        value={typeof raw === "string" ? raw : ""}
        onChange={e => onChange(e.target.value)}
      />
    )
  }

  if (field.type === "textarea" || field.type === "richtext") {
    return (
      <textarea
        className="w-full min-h-[72px] px-2.5 py-2 text-[13px] border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-neutral-900 resize-y"
        placeholder={field.placeholder ?? ""}
        value={typeof raw === "string" ? raw : ""}
        onChange={e => onChange(e.target.value)}
      />
    )
  }

  if (field.type === "color") {
    return (
      <div className="flex items-center gap-2">
        <div className="relative h-8 w-8 rounded-lg overflow-hidden border border-neutral-200 shrink-0">
          <input
            type="color"
            className="absolute -inset-1 cursor-pointer"
            value={typeof raw === "string" ? raw : "#000000"}
            onChange={e => onChange(e.target.value)}
          />
        </div>
        <input
          type="text"
          className="flex-1 h-8 px-2.5 text-[13px] border border-neutral-200 rounded-lg bg-white font-mono focus:outline-none focus:ring-1 focus:ring-neutral-900"
          value={typeof raw === "string" ? raw : ""}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    )
  }

  if (field.type === "select") {
    return (
      <select
        className="w-full h-8 px-2.5 text-[13px] border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-neutral-900 appearance-none"
        value={typeof raw === "string" ? raw : String(field.default ?? "")}
        onChange={e => onChange(e.target.value)}
      >
        {field.options?.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    )
  }

  if (field.type === "toggle") {
    const checked = typeof raw === "boolean" ? raw : !!field.default
    return (
      <button
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
          checked ? "bg-neutral-900" : "bg-neutral-200",
        )}
        onClick={() => onChange(!checked)}
        type="button"
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    )
  }

  if (field.type === "range") {
    const num = typeof raw === "number" ? raw : Number(field.default ?? 0)
    return (
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="flex-1 accent-neutral-900"
          min={field.min ?? 0}
          max={field.max ?? 100}
          step={field.step ?? 1}
          value={num}
          onChange={e => onChange(Number(e.target.value))}
        />
        <span className="text-[12px] text-neutral-500 w-10 text-right shrink-0">
          {num}{field.unit ?? ""}
        </span>
      </div>
    )
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        className="w-full h-8 px-2.5 text-[13px] border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-neutral-900"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        value={typeof raw === "number" ? raw : Number(field.default ?? 0)}
        onChange={e => onChange(Number(e.target.value))}
      />
    )
  }

  if (field.type === "image") {
    return (
      <div className="space-y-1.5">
        {typeof raw === "string" && raw && (
          <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-neutral-200">
            <img src={raw} alt="" className="w-full h-full object-cover" />
            <button
              className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center"
              onClick={() => onChange("")}
            >
              <X className="h-3 w-3 text-white" />
            </button>
          </div>
        )}
        <input
          type="text"
          className="w-full h-8 px-2.5 text-[13px] border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-neutral-900"
          placeholder="Paste image URL..."
          value={typeof raw === "string" ? raw : ""}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    )
  }

  // Fallback
  return (
    <input
      type="text"
      className="w-full h-8 px-2.5 text-[13px] border border-neutral-200 rounded-lg bg-white"
      value={String(raw ?? "")}
      onChange={e => onChange(e.target.value)}
    />
  )
}

// ── Section icon map ─────────────────────────────────────────
const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  header: LayoutTemplate,
  footer: LayoutTemplate,
  hero: Layers,
  rich_text: AlignLeft,
  image_banner: Image,
  product_list: ShoppingBag,
  testimonials: MessageSquare,
  faq: HelpCircle,
  cta: Megaphone,
  stats: BarChart2,
  feature_grid: Grid,
  logo_bar: Award,
  gallery: LayoutGrid,
  pricing: DollarSign,
}

function SectionIcon({ type, className }: { type: string; className?: string }) {
  const Icon = SECTION_ICONS[type] ?? Layout
  return <Icon className={cn("h-3.5 w-3.5", className)} strokeWidth={1.5} />
}

// ── Types ────────────────────────────────────────────────────
type Panel = EditorPanel

// ── Main editor ──────────────────────────────────────────────
export default function StoreEditorPage({ params }: { params: Promise<{ installId: string }> }) {
  const { installId } = use(params)
  const router = useRouter()

  const [install, setInstall] = useState<ThemeInstall | null>(null)
  const [sections, setSections] = useState<SectionInstance[]>([])
  const [settingsDraft, setSettingsDraft] = useState<ThemeSettingsValues>({})
  const [currentPage, setCurrentPage] = useState<PageKey>("home")
  const [selectedPanel, setSelectedPanel] = useState<Panel>({ type: "pages" })
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [pageMenuOpen, setPageMenuOpen] = useState(false)
  const [expandedSettings, setExpandedSettings] = useState<string | null>("branding")

  // Load install data
  const loadData = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/website-builder/themes/${installId}`)
    if (!res.ok) { setLoading(false); return }
    const data = await res.json()
    const inst: ThemeInstall = data.install
    setInstall(inst)

    // Load settings
    const settings = inst.settings
    setSettingsDraft(settings?.draft_settings ?? settings?.settings ?? {})

    // Load sections for current page
    await loadSections(currentPage)
    setLoading(false)
  }, [installId, currentPage])

  const loadSections = useCallback(async (page: PageKey) => {
    const res = await fetch(`/api/website-builder/themes/${installId}/sections?page=${page}`)
    if (!res.ok) return
    const data = await res.json()
    setSections(data.sections ?? [])
  }, [installId])

  useEffect(() => { loadData() }, [loadData])

  const handlePageChange = async (page: PageKey) => {
    setCurrentPage(page)
    setSelectedPanel({ type: "pages" })
    setPageMenuOpen(false)
    await loadSections(page)
  }

  // Settings change
  const updateSetting = (key: string, value: unknown) => {
    setSettingsDraft(prev => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }

  // Section settings change
  const updateSectionSetting = (sectionId: string, key: string, value: unknown) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, settings: { ...s.settings, [key]: value } } : s
    ))
    setIsDirty(true)
  }

  // Block settings change
  const updateBlockSetting = (sectionId: string, blockId: string, key: string, value: unknown) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, blocks: s.blocks?.map(b => b.id === blockId ? { ...b, settings: { ...b.settings, [key]: value } } : b) }
        : s
    ))
    setIsDirty(true)
  }

  const addBlock = (sectionId: string, blockType: string) => {
    const newBlock = { id: `block-${Date.now()}`, type: blockType, settings: {} }
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, blocks: [...(s.blocks ?? []), newBlock] } : s
    ))
    setIsDirty(true)
  }

  const removeBlock = (sectionId: string, blockId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, blocks: s.blocks?.filter(b => b.id !== blockId) } : s
    ))
    setIsDirty(true)
  }

  const toggleSectionHidden = (sectionId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId ? { ...s, hidden: !s.hidden } : s
    ))
    setIsDirty(true)
  }

  const removeSection = (sectionId: string) => {
    setSections(prev => prev.filter(s => s.id !== sectionId))
    if (selectedSectionId === sectionId) {
      setSelectedPanel({ type: "pages" })
    }
    setIsDirty(true)
  }

  const duplicateSection = (sectionId: string) => {
    const idx = sections.findIndex(s => s.id === sectionId)
    if (idx === -1) return
    const orig = sections[idx]
    const copy: SectionInstance = { ...orig, id: `${orig.type}-${Date.now()}`, name: `${orig.name} (copy)` }
    const next = [...sections]
    next.splice(idx + 1, 0, copy)
    setSections(next)
    setIsDirty(true)
  }

  const addSection = (type: string) => {
    const schema = SECTION_SCHEMAS[type]
    if (!schema) return
    const preset = schema.presets?.[0]
    const newSection: SectionInstance = {
      id: `${type}-${Date.now()}`,
      type,
      name: schema.name,
      settings: preset?.settings ?? {},
      blocks: preset?.blocks ?? [],
      hidden: false,
    }
    // Insert before footer if it exists
    const footerIdx = sections.findIndex(s => s.type === "footer")
    const next = [...sections]
    if (footerIdx !== -1) next.splice(footerIdx, 0, newSection)
    else next.push(newSection)
    setSections(next)
    setSelectedPanel({ type: "section", sectionId: newSection.id })
    setIsDirty(true)
  }

  const saveDraft = async () => {
    setSaving(true)
    try {
      // Save settings draft
      await fetch(`/api/website-builder/themes/${installId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_settings: settingsDraft }),
      })

      // Save sections draft
      await fetch(`/api/website-builder/themes/${installId}/sections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_key: currentPage, sections, mode: "draft" }),
      })

      setIsDirty(false)
      toast.success("Draft saved")
    } catch {
      toast.error("Failed to save draft")
    }
    setSaving(false)
  }

  const publishChanges = async () => {
    setPublishing(true)
    try {
      // Save settings
      await fetch(`/api/website-builder/themes/${installId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: settingsDraft, mode: "publish" }),
      })

      // Save sections
      await fetch(`/api/website-builder/themes/${installId}/sections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_key: currentPage, sections, mode: "publish" }),
      })

      // Publish
      await fetch(`/api/website-builder/themes/${installId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      })

      setIsDirty(false)
      toast.success("Theme published and live!")
      await loadData()
    } catch {
      toast.error("Failed to publish")
    }
    setPublishing(false)
  }

  const activeThemeSettings: ThemeSettingsValues = settingsDraft

  // Narrow the selected section id safely for JSX
  const selectedSectionId: string | null =
    selectedPanel.type === "section" ? (selectedPanel as { type: "section"; sectionId: string }).sectionId : null

  const isThemeSettingsActive = selectedPanel.type === "theme_settings"

  // ── Sidebar panel rendering ─────────────────────────────────
  const renderSidebarContent = () => {
    // PAGES panel (default — shows section list)
    if (selectedPanel.type === "pages") {
      const header = sections.find(s => s.type === "header")
      const footer = sections.find(s => s.type === "footer")
      const bodySection = sections.filter(s => s.type !== "header" && s.type !== "footer")

      return (
        <div className="flex flex-col h-full">
          <div className="px-4 py-3 border-b border-neutral-100">
            <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Page</p>
            <p className="text-[14px] font-semibold text-neutral-900 mt-0.5">{PAGE_META[currentPage]?.label}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {/* Header */}
            {header && (
              <div>
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-1 mb-1">Header</p>
                <SidebarSectionRow
                  section={header}
                  isSelected={selectedSectionId === header.id}
                  onSelect={() => setSelectedPanel({ type: "section", sectionId: header.id })}
                  onToggleHide={() => toggleSectionHidden(header.id)}
                  onDuplicate={() => duplicateSection(header.id)}
                  onRemove={() => removeSection(header.id)}
                  isStructure
                />
              </div>
            )}

            {/* Template sections */}
            <div>
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-1 mb-1 mt-3">Template</p>
              <div className="space-y-1">
                {bodySection.map(section => (
                  <SidebarSectionRow
                    key={section.id}
                    section={section}
                    isSelected={selectedSectionId === section.id}
                    onSelect={() => setSelectedPanel({ type: "section", sectionId: section.id })}
                    onToggleHide={() => toggleSectionHidden(section.id)}
                    onDuplicate={() => duplicateSection(section.id)}
                    onRemove={() => removeSection(section.id)}
                  />
                ))}
                <button
                  className="w-full flex items-center gap-1.5 px-2.5 py-2 text-[13px] text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                  onClick={() => setSelectedPanel({ type: "add_section" })}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add section
                </button>
              </div>
            </div>

            {/* Footer */}
            {footer && (
              <div>
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-1 mb-1 mt-3">Footer</p>
                <SidebarSectionRow
                  section={footer}
                  isSelected={selectedSectionId === footer.id}
                  onSelect={() => setSelectedPanel({ type: "section", sectionId: footer.id })}
                  onToggleHide={() => toggleSectionHidden(footer.id)}
                  onDuplicate={() => duplicateSection(footer.id)}
                  onRemove={() => removeSection(footer.id)}
                  isStructure
                />
              </div>
            )}

            {/* Theme settings link */}
            <div className="mt-4 pt-4 border-t border-neutral-100">
              <button
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-2.5 rounded-lg text-[13px] font-medium transition-colors",
                  isThemeSettingsActive
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                )}
                onClick={() => setSelectedPanel({ type: "theme_settings" })}
              >
                <Palette className="h-4 w-4" />
                Theme settings
              </button>
            </div>
          </div>
        </div>
      )
    }

    // SECTION panel
    if (selectedPanel.type === "section") {
      const section = sections.find(s => s.id === selectedPanel.sectionId)
      if (!section) return null
      const schema = SECTION_SCHEMAS[section.type]

      return (
        <div className="flex flex-col h-full">
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2">
            <button
              className="text-neutral-400 hover:text-neutral-900"
              onClick={() => setSelectedPanel({ type: "pages" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-neutral-900 truncate">{section.name}</p>
              <p className="text-[11px] text-neutral-400">{schema?.name ?? section.type}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {schema?.fields && schema.fields.length > 0 && (
              <div className="p-4 space-y-4">
                {schema.fields.map(field => (
                  <div key={field.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[12px] font-medium text-neutral-700">{field.label}</label>
                    </div>
                    <FieldEditor
                      field={field}
                      value={section.settings[field.id]}
                      onChange={val => updateSectionSetting(section.id, field.id, val)}
                    />
                    {field.info && <p className="text-[11px] text-neutral-400 mt-1">{field.info}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Blocks */}
            {schema?.blocks && (
              <div className="border-t border-neutral-100 p-4">
                <p className="text-[12px] font-semibold text-neutral-700 mb-3">
                  {schema.blocks[0]?.name ? `${schema.blocks[0].name}s` : "Blocks"}
                </p>
                <div className="space-y-2">
                  {(section.blocks ?? []).map(block => {
                    const blockSchema = schema.blocks?.find(b => b.type === block.type)
                    return (
                      <details key={block.id} className="group border border-neutral-200 rounded-lg overflow-hidden">
                        <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer list-none">
                          <span className="text-[13px] font-medium text-neutral-700">
                            {blockSchema?.name ?? block.type}
                            {!!block.settings.author && <span className="ml-1 opacity-50">— {String(block.settings.author)}</span>}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              className="h-6 w-6 flex items-center justify-center rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                              onClick={e => { e.preventDefault(); removeBlock(section.id, block.id) }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                            <ChevronDown className="h-3.5 w-3.5 text-neutral-400 group-open:rotate-180 transition-transform" />
                          </div>
                        </summary>
                        <div className="px-3 pb-3 space-y-3 border-t border-neutral-100 pt-3">
                          {blockSchema?.fields.map(field => (
                            <div key={field.id}>
                              <label className="text-[11px] font-medium text-neutral-600 mb-1 block">{field.label}</label>
                              <FieldEditor
                                field={field}
                                value={block.settings[field.id]}
                                onChange={val => updateBlockSetting(section.id, block.id, field.id, val)}
                              />
                            </div>
                          ))}
                        </div>
                      </details>
                    )
                  })}
                </div>

                {(!schema.max_blocks || (section.blocks?.length ?? 0) < schema.max_blocks) && (
                  <button
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 text-[13px] text-neutral-500 hover:text-neutral-900 border border-dashed border-neutral-200 hover:border-neutral-400 rounded-lg transition-colors"
                    onClick={() => addBlock(section.id, schema.blocks![0].type)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add {schema.blocks[0]?.name?.toLowerCase() ?? "block"}
                  </button>
                )}
              </div>
            )}

            {/* Section actions */}
            <div className="border-t border-neutral-100 p-4 flex gap-2">
              <button
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] text-neutral-500 hover:text-neutral-900 border border-neutral-200 hover:border-neutral-400 rounded-lg transition-colors"
                onClick={() => toggleSectionHidden(section.id)}
              >
                {section.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {section.hidden ? "Show" : "Hide"}
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] text-neutral-500 hover:text-neutral-900 border border-neutral-200 hover:border-neutral-400 rounded-lg transition-colors"
                onClick={() => duplicateSection(section.id)}
              >
                <Copy className="h-3.5 w-3.5" />
                Duplicate
              </button>
              <button
                className="flex items-center justify-center gap-1.5 py-2 px-3 text-[12px] text-red-400 hover:text-red-600 border border-neutral-200 hover:border-red-200 rounded-lg transition-colors"
                onClick={() => removeSection(section.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )
    }

    // THEME SETTINGS panel
    if (selectedPanel.type === "theme_settings") {
      return (
        <div className="flex flex-col h-full">
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2">
            <button className="text-neutral-400 hover:text-neutral-900" onClick={() => setSelectedPanel({ type: "pages" })}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-[14px] font-semibold text-neutral-900">Theme settings</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {THEME_SETTINGS_GROUPS.map(group => (
              <div key={group.id} className="mb-2">
                <button
                  className="w-full flex items-center justify-between py-2.5 px-2.5 rounded-lg hover:bg-neutral-50 text-left"
                  onClick={() => setExpandedSettings(expandedSettings === group.id ? null : group.id)}
                >
                  <span className="text-[13px] font-medium text-neutral-700">{group.label}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-neutral-400 transition-transform", expandedSettings === group.id && "rotate-180")} />
                </button>
                {expandedSettings === group.id && (
                  <div className="px-2.5 pb-3 space-y-4">
                    {group.fields.map(field => (
                      <div key={field.id}>
                        <label className="text-[12px] font-medium text-neutral-700 mb-1.5 block">{field.label}</label>
                        <FieldEditor
                          field={field}
                          value={settingsDraft[field.id]}
                          onChange={val => updateSetting(field.id, val)}
                        />
                        {field.info && <p className="text-[11px] text-neutral-400 mt-1">{field.info}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }

    // ADD SECTION panel
    if (selectedPanel.type === "add_section") {
      const byCategory = ADDABLE_SECTIONS.reduce<Record<string, string[]>>((acc, type) => {
        const cat = SECTION_SCHEMAS[type]?.category ?? "content"
        if (!acc[cat]) acc[cat] = []
        acc[cat].push(type)
        return acc
      }, {})

      return (
        <div className="flex flex-col h-full">
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2">
            <button className="text-neutral-400 hover:text-neutral-900" onClick={() => setSelectedPanel({ type: "pages" })}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-[14px] font-semibold text-neutral-900">Add section</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {Object.entries(byCategory).map(([cat, types]) => (
              <div key={cat}>
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-1 mb-2">
                  {SECTION_CATEGORIES[cat] ?? cat}
                </p>
                <div className="space-y-1">
                  {types.map(type => {
                    const schema = SECTION_SCHEMAS[type]
                    return (
                      <button
                        key={type}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-neutral-100 text-left transition-colors"
                        onClick={() => { addSection(type); setSelectedPanel({ type: "pages" }) }}
                      >
                        <SectionIcon type={type} className="text-neutral-500" />
                        <div>
                          <div className="text-[13px] font-medium text-neutral-900">{schema?.name ?? type}</div>
                          {schema?.description && (
                            <div className="text-[11px] text-neutral-400">{schema.description}</div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    return null
  }

  if (loading) {
    return (
      <div className="h-svh flex items-center justify-center bg-[#f5f5f5]">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="h-svh flex flex-col bg-[#f1f1f1] overflow-hidden">
      {/* ── Top bar ── */}
      <header className="h-12 bg-white border-b border-neutral-200 flex items-center px-4 gap-3 shrink-0 z-30">
        <button
          className="flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-900 mr-2"
          onClick={() => router.push("/app/website-builder")}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Website Builder</span>
        </button>

        <div className="flex-1 flex items-center gap-2 justify-center">
          {/* Page selector */}
          <div className="relative">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
              onClick={() => setPageMenuOpen(!pageMenuOpen)}
            >
              {PAGE_META[currentPage]?.label ?? currentPage}
              <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
            </button>
            {pageMenuOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg z-50 py-1 w-40">
                {(Object.keys(PAGE_META) as PageKey[]).map(key => (
                  <button
                    key={key}
                    className={cn(
                      "w-full text-left px-3 py-2 text-[13px] hover:bg-neutral-50",
                      currentPage === key && "font-semibold",
                    )}
                    onClick={() => handlePageChange(key)}
                  >
                    {PAGE_META[key].label}
                    {currentPage === key && <Check className="h-3.5 w-3.5 inline ml-2 text-emerald-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Theme name + status */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-neutral-700">{install?.name}</span>
            {install?.status === "published" && (
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded uppercase tracking-wide">Live</span>
            )}
            {isDirty && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded uppercase tracking-wide">Unsaved</span>
            )}
          </div>
        </div>

        {/* Device preview */}
        <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-0.5">
          <button
            className={cn("p-1.5 rounded-md transition-colors", device === "desktop" ? "bg-white shadow-sm" : "hover:bg-neutral-200")}
            onClick={() => setDevice("desktop")}
          >
            <Monitor className="h-3.5 w-3.5 text-neutral-600" />
          </button>
          <button
            className={cn("p-1.5 rounded-md transition-colors", device === "mobile" ? "bg-white shadow-sm" : "hover:bg-neutral-200")}
            onClick={() => setDevice("mobile")}
          >
            <Smartphone className="h-3.5 w-3.5 text-neutral-600" />
          </button>
        </div>

        {/* Save / Publish */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={saveDraft}
            disabled={saving || !isDirty}
            className="h-7 px-3 text-[13px] gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
          <Button
            size="sm"
            onClick={publishChanges}
            disabled={publishing}
            className="h-7 px-3 text-[13px] gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white"
          >
            {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
            Publish
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left sidebar ── */}
        <aside className="w-[260px] bg-white border-r border-neutral-200 flex flex-col overflow-hidden shrink-0 z-20">
          {renderSidebarContent()}
        </aside>

        {/* ── Canvas ── */}
        <main className="flex-1 overflow-auto p-4 md:p-6 flex items-start justify-center">
          <div
            className={cn(
              "bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300",
              device === "mobile" ? "w-[390px]" : "w-full max-w-5xl",
            )}
            style={{ minHeight: "600px" }}
          >
            {/* Announcement bar */}
            {settingsDraft.announcement_bar_enabled && settingsDraft.announcement_bar_text && (
              <div
                className="w-full py-2 text-center text-[13px] font-medium"
                style={{
                  background: settingsDraft.announcement_bar_bg ?? "#6366f1",
                  color: settingsDraft.announcement_bar_color ?? "#ffffff",
                }}
              >
                {settingsDraft.announcement_bar_text}
              </div>
            )}

            {/* Sections */}
            {sections.map(section => (
              <SectionRenderer
                key={section.id}
                section={section}
                theme={activeThemeSettings}
                isEditing={true}
                isSelected={selectedSectionId === section.id}
                onClick={() => setSelectedPanel({ type: "section", sectionId: section.id })}
              />
            ))}

            {sections.length === 0 && (
              <div className="h-64 flex items-center justify-center text-neutral-400 text-sm">
                <div className="text-center">
                  <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No sections yet</p>
                  <button
                    className="mt-2 text-neutral-900 underline text-sm"
                    onClick={() => setSelectedPanel({ type: "add_section" })}
                  >
                    Add a section
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// ── Sidebar section row ──────────────────────────────────────
function SidebarSectionRow({
  section,
  isSelected,
  onSelect,
  onToggleHide,
  onDuplicate,
  onRemove,
  isStructure = false,
}: {
  section: SectionInstance
  isSelected: boolean
  onSelect: () => void
  onToggleHide: () => void
  onDuplicate: () => void
  onRemove: () => void
  isStructure?: boolean
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors",
        isSelected ? "bg-neutral-900 text-white" : "hover:bg-neutral-100 text-neutral-700",
        section.hidden && "opacity-50",
      )}
      onClick={onSelect}
    >
      {!isStructure && (
        <GripVertical className={cn("h-3.5 w-3.5 shrink-0 opacity-30", isSelected && "opacity-60")} />
      )}
      <SectionIcon type={section.type} className={isSelected ? "text-white" : "text-neutral-500"} />
      <span className="flex-1 text-[13px] font-medium truncate">{section.name}</span>
      {section.hidden && (
        <EyeOff className={cn("h-3 w-3 shrink-0", isSelected ? "opacity-60" : "opacity-40")} />
      )}

      {/* Hover actions */}
      <div className={cn("items-center gap-0.5 hidden group-hover:flex", isSelected && "flex")}>
        <button
          className={cn("h-5 w-5 rounded flex items-center justify-center hover:bg-neutral-200/60 transition-colors", isSelected && "hover:bg-white/20")}
          onClick={e => { e.stopPropagation(); onToggleHide() }}
          title={section.hidden ? "Show" : "Hide"}
        >
          {section.hidden
            ? <Eye className="h-2.5 w-2.5" />
            : <EyeOff className="h-2.5 w-2.5" />}
        </button>
        {!isStructure && (
          <>
            <button
              className={cn("h-5 w-5 rounded flex items-center justify-center hover:bg-neutral-200/60 transition-colors", isSelected && "hover:bg-white/20")}
              onClick={e => { e.stopPropagation(); onDuplicate() }}
              title="Duplicate"
            >
              <Copy className="h-2.5 w-2.5" />
            </button>
            <button
              className={cn("h-5 w-5 rounded flex items-center justify-center hover:bg-red-100 text-red-400 transition-colors", isSelected && "hover:bg-white/20 text-red-300")}
              onClick={e => { e.stopPropagation(); onRemove() }}
              title="Remove"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
