/**
 * The sidebar's section rows, an open section's title row with its menu, and
 * Add section, as the builder draws them, for scripts/check-section-menus.mjs.
 *
 *   ?library=1   Add section opens on load
 */
import { createElement, useState } from "react"
import { createRoot } from "react-dom/client"

import { SectionsList } from "@/components/website-builder/editor/sections-list"
import { PanelBack } from "@/components/website-builder/panel-back"
import { PanelMenuButton } from "@/components/website-builder/editor/section-panel-menu"
import { SectionLibrary } from "@/components/website-builder/editor/section-library"
import { SECTION_SCHEMAS, ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"
import type { ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { SectionInstance } from "@/lib/website-builder/types"

declare global {
  interface Window { __log: string[] }
}
window.__log = []

/* The apps route, answered here: Reviews is off, so Add section says so. */
const realFetch = window.fetch.bind(window)
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (url.includes("/api/store/integrations/apps")) {
    return Promise.resolve(new Response(JSON.stringify({ states: { "storelib-reviews": "off", "storelib-bundles": "setup" } }), { status: 200, headers: { "content-type": "application/json" } }))
  }
  return realFetch(input, init)
}) as typeof fetch

const SECTIONS: SectionInstance[] = [
  { id: "header", type: "header", name: "Header", settings: {} },
  { id: "hero-1", type: "hero", name: "Hero", settings: {} },
  { id: "faq-1", type: "faq", name: "FAQ", settings: {} },
  { id: "reviews-1", type: "reviews_carousel", name: "Reviews carousel", settings: {}, hidden: true },
  { id: "footer", type: "footer", name: "Footer", settings: {} },
]

const PANEL_ITEMS: ActionMenuItem[] = [
  { id: "copy-section", label: "Copy section", onClick: () => window.__log.push("copy-section") },
  { id: "paste-section", label: "Paste section", disabled: true, hint: "Copy a section first" },
  { id: "copy-settings", label: "Copy settings", separatorBefore: true, onClick: () => window.__log.push("copy-settings") },
  { id: "paste-settings", label: "Paste settings", disabled: true, hint: "Copied settings are for a Hero" },
  { id: "edit-code", label: "Edit code", separatorBefore: true, onClick: () => window.__log.push("edit-code") },
  { id: "duplicate", label: "Duplicate", onClick: () => window.__log.push("duplicate") },
  { id: "toggle-hidden", label: "Hide", onClick: () => window.__log.push("hide") },
  { id: "delete", label: "Delete", variant: "destructive", separatorBefore: true, onClick: () => window.__log.push("delete") },
]

function App() {
  const [libraryOpen, setLibraryOpen] = useState(new URLSearchParams(location.search).get("library") === "1")
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside id="sidebar" style={{ width: "min(100vw, 320px)", background: "#fff", borderRight: "1px solid #e5e7eb" }}>
        <div id="panel">
          <PanelBack onBack={() => window.__log.push("back")} action={<PanelMenuButton label="More for Hero" title="Hero" items={() => PANEL_ITEMS} />}>
            <span className="truncate text-[15px] font-semibold md:text-sm">Hero</span>
          </PanelBack>
        </div>
        <div id="list" className="px-2 py-2">
          <SectionsList
            sections={SECTIONS}
            nameOf={(s) => s.name}
            selectedId={selected}
            onSelect={(id) => { setSelected(id); window.__log.push(`select:${id}`) }}
            onToggleHide={(id) => window.__log.push(`hide:${id}`)}
            onDuplicate={(id) => window.__log.push(`dup:${id}`)}
            onRemove={(id) => window.__log.push(`del:${id}`)}
            onMove={(id, step) => window.__log.push(`move:${id}:${step}`)}
            onAdd={() => setLibraryOpen(true)}
            codeItem={(s) => (s.type === "faq" ? { label: "Edit code", hint: "Drawn by Storelib, no code to edit" } : { label: "Edit code", run: () => window.__log.push(`code:${s.id}`) })}
            dnd={{ onReorder: () => {} }}
          />
        </div>
      </aside>
      <SectionLibrary
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onAddSection={(type) => window.__log.push(`add:${type}`)}
        schemas={SECTION_SCHEMAS}
        addable={ADDABLE_SECTIONS}
        ownTypes={[]}
        sources={{}}
      />
    </div>
  )
}

createRoot(document.getElementById("root")!).render(createElement(App))
