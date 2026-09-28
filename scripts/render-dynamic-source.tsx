/**
 * Settings that can take a dynamic source, as the editor's sidebar draws
 * them: a 320px column at a desktop, the editor's real bottom sheet at a
 * phone. See scripts/check-dynamic-source.mjs.
 *
 * ONE OF EVERY KIND OF SETTING THAT TAKES A SOURCE, AND A CANVAS BESIDE IT.
 * The list a setting is offered, and what the page then draws, are decided
 * by the setting's type: words take anything and read it as words, a link
 * takes only an address, a picture only a picture, a number only a number.
 * A probe that mounts text fields alone can say the button opens; it cannot
 * say the options are right. So every target is here, and the values run
 * through `fillSources` — the same call the server makes when it draws a
 * section — into `[data-canvas-for]`, which is the canvas as far as this
 * probe is concerned.
 */
import { useState } from "react"
import { createRoot } from "react-dom/client"

import { DynamicSourceField, EditorFieldProvider } from "@/components/website-builder/editor/controls"
import { INPUT, SELECT } from "@/components/website-builder/editor/controls/styles"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { fillSources, type DynamicContext } from "@/lib/storelib-theme/dynamic"

declare global {
  interface Window {
    __values: Record<string, unknown>
  }
}

/** What the page knows, the way lib/website-builder/dynamic-sources.ts hands it over. */
const CTX: DynamicContext = {
  shop: { name: "Drew's shop", description: "Things worth opening", url: "https://drew.storelib.com", product_count: 12 },
  creator: { name: "Drew", headline: "Maker", bio: "Makes things", avatar: "https://cdn.example.com/drew.jpg" },
  product: { title: "The Blue Notebook", price: "$48.00", compare_price: "$60.00", description: "Paper, bound.", image: "https://cdn.example.com/notebook.jpg", url: "/products/the-blue-notebook" },
  page: { title: "The Blue Notebook", template: "product" },
  social: { instagram: "https://instagram.com/drew", tiktok: "https://tiktok.com/@drew", youtube: "https://youtube.com/@drew", twitter: "https://x.com/drew" },
  date: { year: 2026 },
}

/** Every field this panel draws, by the id the probe knows it as. */
const FIELDS = [
  { id: "eyebrow", type: "text", label: "Eyebrow", start: "Featured" },
  { id: "heading", type: "text", label: "Heading", start: "A few things worth opening" },
  { id: "style", type: "select", label: "Style", start: "a" },
  { id: "cta", type: "text", label: "Button label", start: "Get {{ product.title }} today" },
  { id: "title", type: "text", label: "Product name line", start: "{{ product.title }}" },
  { id: "image", type: "image_picker", label: "Image", start: "{{ product.image }}" },
  { id: "link", type: "url", label: "Button link", start: "/shop" },
  { id: "count", type: "number", label: "Columns", start: 3 },
  { id: "story", type: "textarea", label: "Story", start: "Two lines about it" },
] as const

const start: Record<string, unknown> = Object.fromEntries(FIELDS.map((f) => [f.id, f.start]))
window.__values = { ...start }

function Field({
  id,
  type,
  label,
  value,
  onChange,
}: {
  id: string
  type: string
  label: string
  value: unknown
  onChange: (v: unknown) => void
}) {
  const str = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value)
  return (
    <div data-probe-field={id}>
      <DynamicSourceField field={{ type, label, default: type === "number" ? 3 : "" }} value={value} onChange={onChange} label={label}>
        {type === "select" ? (
          <select className={SELECT}>
            <option>Left</option>
          </select>
        ) : type === "image_picker" ? (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">Select image</div>
        ) : type === "textarea" ? (
          <textarea className={INPUT} rows={2} value={str} onChange={(e) => onChange(e.target.value)} />
        ) : type === "number" ? (
          <input type="number" className={INPUT} value={str} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
        ) : (
          <input type="text" className={INPUT} value={str} onChange={(e) => onChange(e.target.value)} />
        )}
      </DynamicSourceField>
    </div>
  )
}

/** The page, drawn from the settings the way a section is drawn from them. */
function Canvas({ values }: { values: Record<string, unknown> }) {
  return (
    <div data-canvas="" className="p-6 text-sm text-[#1a1a2e]">
      {FIELDS.map((f) => {
        const filled = fillSources(values[f.id], f.type, CTX)
        return (
          <p key={f.id} data-canvas-for={f.id} className="py-0.5">
            {typeof filled === "number" ? (Number.isFinite(filled) ? String(filled) : "") : String(filled ?? "")}
          </p>
        )
      })}
    </div>
  )
}

function Panel({ values, set }: { values: Record<string, unknown>; set: (id: string, v: unknown) => void }) {
  return (
    <EditorFieldProvider value={{ products: [], menus: {}, template: "product" }}>
      <div className="p-4 space-y-4" id="fields">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Content</p>
        {FIELDS.map((f) => (
          <Field key={f.id} id={f.id} type={f.type} label={f.label} value={values[f.id]} onChange={(v) => set(f.id, v)} />
        ))}
        <div className="h-64" />
      </div>
    </EditorFieldProvider>
  )
}

function App() {
  const [values, setValues] = useState<Record<string, unknown>>(start)
  const set = (id: string, v: unknown) => {
    window.__values[id] = v
    setValues((prev) => ({ ...prev, [id]: v }))
  }
  const phone = window.innerWidth < 640
  return phone ? (
    <>
      <div className="fixed inset-0 overflow-hidden bg-white">
        <Canvas values={values} />
      </div>
      <MobileEditorSheet open onOpenChange={() => {}}>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-sheet-scroll="">
          <Panel values={values} set={set} />
        </div>
      </MobileEditorSheet>
    </>
  ) : (
    <div className="flex h-screen">
      <div data-wb-sidebar-scroll="" className="h-screen w-[320px] shrink-0 overflow-y-auto border-r border-border bg-white">
        <Panel values={values} set={set} />
      </div>
      <div className="flex-1 overflow-y-auto bg-[#f3f4f6]">
        <Canvas values={values} />
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
