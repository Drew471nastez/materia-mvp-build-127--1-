/**
 * ===========================================================================
 *  THE BUILDER'S SIDEBAR PARTS, FOR A BROWSER TO MEASURE
 * ===========================================================================
 * Served by scripts/check-builder-sidebar.mjs. The real components, with the
 * real stylesheet, and nothing standing in for them:
 *
 *   SectionsList           the Header / Template / Footer list
 *   ButtonColorGroup       a button's four colours, hover included
 *   SectionColorSetting    a colour a section declares for itself
 *   DynamicSourceField     a text setting with its Insert shop data button
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { SectionsList } from "@/components/website-builder/editor/sections-list"
import { BUTTON_COLOR_GROUPS, ButtonColorGroup, SectionColorSetting } from "@/components/website-builder/editor/design-panels"
import { DynamicSourceField, EditorFieldProvider } from "@/components/website-builder/editor/controls"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

declare global {
  interface Window {
    __ready: boolean
    __added: (number | null)[]
    __removed: string[]
  }
}
window.__added = []
window.__removed = []

const SECTIONS: SectionInstance[] = [
  { id: "h", type: "header", name: "Header", settings: {} },
  { id: "a", type: "hero", name: "Notion marketplace hero", settings: {} },
  { id: "b", type: "hero_split", name: "LD 02 Hero", settings: {} },
  { id: "c", type: "faq", name: "Questions", settings: {}, hidden: true },
  { id: "f", type: "footer", name: "Footer", settings: {} },
]

function App() {
  const [sections, setSections] = React.useState(SECTIONS)
  const theme = {} as ThemeSettingsValues
  const noop = () => {}
  return (
    <TooltipProvider>
      <div style={{ display: "flex", gap: 24, padding: 16, background: "#f8f9fa", alignItems: "flex-start" }}>
        <aside id="list" style={{ width: 288, background: "#fff", borderRadius: 12, padding: 8 }}>
          <SectionsList
            sections={sections}
            nameOf={(s) => s.name}
            selectedId={null}
            onSelect={noop}
            onToggleHide={(id) => setSections((all) => all.map((s) => (s.id === id ? { ...s, hidden: !s.hidden } : s)))}
            onDuplicate={noop}
            onRemove={(id) => { window.__removed.push(id); setSections((all) => all.filter((s) => s.id !== id)) }}
            onMove={noop}
            onAdd={(at) => window.__added.push(at)}
            dnd={{ sensors: [], modifiers: [], draggingId: null, onDragStart: noop, onDragOver: noop, onDragCancel: noop, onDragEnd: noop }}
          />
        </aside>
        <aside id="panel" style={{ width: 288, background: "#fff", borderRadius: 12, padding: 14 }}>
          <ButtonColorGroup group={BUTTON_COLOR_GROUPS[0]} settings={{}} theme={theme} onApply={noop} />
          <div style={{ height: 12 }} />
          <SectionColorSetting field={{ id: "star_color", label: "Stars", default: "scheme.accent" }} value={undefined} settings={{ color_scheme: "light" }} theme={theme} onChange={noop} />
          <div style={{ height: 12 }} />
          <EditorFieldProvider value={{ products: [], menus: {}, template: "index" }}>
            <DynamicSourceField field={{ type: "text", label: "Heading" }} value="" onChange={noop} label="Heading">
              <input className="w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background" defaultValue="" />
            </DynamicSourceField>
          </EditorFieldProvider>
        </aside>
      </div>
    </TooltipProvider>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true }))
