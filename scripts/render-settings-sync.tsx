/**
 * ===========================================================================
 *  THE SIDEBAR BEFORE AND AFTER A SCHEMA FILE CHANGES, FOR A BROWSER TO READ
 * ===========================================================================
 * Served by scripts/check-settings-sync.mjs. Two panels the way the builder
 * draws them, from the same functions it draws them with:
 *
 *   #theme     Theme settings' group list (themeSettingsGroupsFor, the
 *              theme's config/settings_schema.json over Storelib's), and the
 *              open group's controls
 *   #section   a section's panel (schemaFor, from its .storelib <schema>,
 *              read in Node by scripts/render-settings-sync-fields.ts)
 *
 * Each control is the sidebar's own: SliderNumberControl for a range (given
 * the value clampTo shows, as WbSlider and FieldControl give it), the
 * registered controls (renderRegisteredControl) inside CollectionBoundField
 * for the rest, a switch for a toggle. The values live in one state that a
 * schema change never touches. `window.__swapSchemas()` replaces both schema files
 * in place, without remounting, as a save, a push or Storelib AI does in the
 * open editor; `window.__storedValues()` reads the stored values back.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"

import { SliderNumberControl } from "@/components/website-builder/editor/slider-number-control"
import { EditorFieldProvider, SiblingSettingsProvider, type EditorFieldEnv } from "@/components/website-builder/editor/controls/context"
import { renderRegisteredControl } from "@/components/website-builder/editor/controls"
import { CollectionBoundField } from "@/components/website-builder/editor/controls/collection-bound-field"
import { builtInSettingsSchema, clampTo, themeSettingsGroupsFor } from "@/lib/storelib-theme/theme-config"
import { resolveControlType } from "@/lib/storelib-theme/controls/types"
import type { SchemaField } from "@/lib/website-builder/types"

/* What the check script calls: its own names, typed here, not on Window, where other probes declare theirs. */
const page = window as unknown as {
  __ready: boolean
  __swapSchemas: () => void
  __storedValues: () => { theme: Record<string, unknown>; section: Record<string, unknown> }
}

const KITCHEN = "c1c1c1c1-0000-4000-8000-000000000001"
const PIXEL = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><rect width='4' height='4' fill='%23d6c7b0'/></svg>"
const env: EditorFieldEnv = {
  products: [],
  menus: {},
  template: "index",
  collections: [{ id: KITCHEN, title: "Kitchen", image: PIXEL, published: true, products_count: 12, description: "For the kitchen", url: "/collections/kitchen" }],
}

/* ── the two files, before and after ─────────────────────────────────── */

const layoutOf = (groups: ReturnType<typeof builtInSettingsSchema>) => groups.find((g) => g.id === "layout") as { settings: Record<string, unknown>[] }
const before = builtInSettingsSchema()
const after = builtInSettingsSchema()
/* After: a group of the theme's own first; Layout reordered, page_width's range moved under the value stored, a new slider. */
layoutOf(after).settings = [
  { type: "range", id: "section_gap", label: "Section gap", min: 0, max: 80, step: 4, unit: "px", default: 0 },
  { type: "range", id: "page_width", label: "Page width", min: 900, max: 1400, step: 20, unit: "px", default: 1280 },
  { type: "range", id: "card_gap", label: "Card gap", min: 0, max: 48, step: 4, unit: "px", default: 16 },
]
after.unshift({
  name: "Promo strip",
  id: "promo_strip",
  settings: [
    { type: "header", content: "Strip" },
    { type: "toggle", id: "promo_show", label: "Show the strip", default: true },
    { type: "text", id: "promo_text", label: "Words", default: "Free shipping over $50" },
    { type: "range", id: "promo_size", label: "Text size", min: 12, max: 24, step: 1, unit: "px", default: 14 },
  ],
})
const THEME_BEFORE = JSON.stringify(before)
const THEME_AFTER = JSON.stringify(after)

/* The section's panel before and after its <schema> changed, read in Node by schemaFor (scripts/render-settings-sync-fields.ts): the compiler is not a browser module. */
const SECTION_FIELDS = (window as unknown as { __sectionFields: { before: SchemaField[]; after: SchemaField[] } }).__sectionFields

/* ── one control, the sidebar's way ──────────────────────────────────── */

function Field({ field, value, onChange }: { field: SchemaField; value: unknown; onChange: (v: unknown) => void }) {
  const kind = resolveControlType(field.type) ?? field.type
  let control: React.ReactNode
  if (kind === "header") return <p data-field-id={field.id} data-kind="header" className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{field.label}</p>
  if (kind === "range") {
    const raw = typeof value === "number" ? value : Number(field.default ?? 0)
    const shown = clampTo(raw, field.min ?? 0, field.max ?? 100)
    control = <SliderNumberControl value={shown} onChange={onChange} min={field.min ?? 0} max={field.max ?? 100} step={field.step ?? 1} unit={field.unit ?? ""} />
  } else if (kind === "toggle") {
    const on = typeof value === "boolean" ? value : !!field.default
    control = <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="h-5 w-9 rounded-full border border-border" />
  } else {
    control = (
      <CollectionBoundField field={field} value={value} onChange={onChange}>
        {(shown) =>
          renderRegisteredControl(kind, shown.field, shown.value ?? shown.field.default, onChange) ?? (
            <input className="w-full h-8 px-2.5 text-[13px] border border-border rounded-md" value={typeof shown.value === "string" ? shown.value : ""} placeholder={shown.field.placeholder} onChange={(e) => onChange(e.target.value)} />
          )
        }
      </CollectionBoundField>
    )
  }
  return (
    <div data-field-id={field.id} data-kind={kind} className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground block">{field.label}</label>
      {control}
    </div>
  )
}

function Panel({ fields, values, set }: { fields: SchemaField[]; values: Record<string, unknown>; set: (id: string, v: unknown) => void }) {
  return (
    <SiblingSettingsProvider settings={values}>
      <div className="space-y-4 p-3.5" style={{ width: 320 }}>
        {fields.map((f) => <Field key={f.id} field={f} value={values[f.id]} onChange={(v) => set(f.id, v)} />)}
      </div>
    </SiblingSettingsProvider>
  )
}

function App() {
  const [themeText, setThemeText] = React.useState(THEME_BEFORE)
  const [sectionFields, setSectionFields] = React.useState(SECTION_FIELDS.before)
  /* The stored values: what the creator set before the schema moved. */
  const [themeValues, setThemeValues] = React.useState<Record<string, unknown>>({ page_width: 1600, section_gap: 24, brand_name: "Astrid" })
  const [sectionValues, setSectionValues] = React.useState<Record<string, unknown>>({ collection: KITCHEN, padding_top: 160, show_count: false, old_words: "kept but not drawn", title: "" })
  const valuesRef = React.useRef({ theme: themeValues, section: sectionValues })
  valuesRef.current = { theme: themeValues, section: sectionValues }
  React.useEffect(() => {
    page.__swapSchemas = () => flushSync(() => {
      setThemeText(THEME_AFTER)
      setSectionFields(SECTION_FIELDS.after)
    })
    page.__storedValues = () => JSON.parse(JSON.stringify(valuesRef.current))
    page.__ready = true
  }, [])
  const groups = themeSettingsGroupsFor(themeText)
  const layout = groups.find((g) => g.id === "layout")!
  const promo = groups.find((g) => g.id === "promo_strip")
  return (
    <EditorFieldProvider value={env}>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div id="theme">
          <ul id="groups">{groups.map((g) => <li key={g.id} data-group={g.id}>{g.label}</li>)}</ul>
          <div id="layout"><Panel fields={layout.fields.filter((f) => f.type === "range")} values={themeValues} set={(id, v) => setThemeValues((p) => ({ ...p, [id]: v }))} /></div>
          {promo ? <div id="promo"><Panel fields={promo.fields} values={themeValues} set={(id, v) => setThemeValues((p) => ({ ...p, [id]: v }))} /></div> : null}
        </div>
        <div id="section"><Panel fields={sectionFields} values={sectionValues} set={(id, v) => setSectionValues((p) => ({ ...p, [id]: v }))} /></div>
      </div>
    </EditorFieldProvider>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
