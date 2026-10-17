/**
 * The builder's sidebar for one section, in the language picked, for
 * scripts/check-translation-switch.mjs: the real hook (components/
 * website-builder/use-preview-language.ts), the real editing state, scope
 * and translated field (components/website-builder/editor/
 * translation-editing.tsx, drawn the way the editor's FieldEditor draws it)
 * and the real rich text box, with a strip of canvas drawn from the same
 * translations by the website's own localizeSections. The language is picked
 * in a plain select standing in for the editor's switch, which calls the
 * same setLocale. The check's server answers /api/store/translations.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { usePreviewLanguage } from "@/components/website-builder/use-preview-language"
import { TranslatedFieldEditor, TranslationEditingProvider, TranslationScope, useTranslationEditing, useTranslationEditor, useTranslationScope } from "@/components/website-builder/editor/translation-editing"
import { RichTextField } from "@/components/website-builder/rich-text-field"
import { localizeSections, sectionKey } from "@/lib/markets/translate"
import type { SchemaField, SectionInstance } from "@/lib/website-builder/types"

const FIELDS: SchemaField[] = [
  { type: "text", id: "heading", label: "Heading", default: "Spring sale" },
  { type: "richtext", id: "text", label: "Text", default: "" },
  { type: "text", id: "image_alt", label: "Describe the picture", default: "" },
  { type: "color", id: "accent", label: "Accent", default: "#8b5cf6" },
  { type: "range", id: "padding", label: "Padding", default: 40 },
] as SchemaField[]

const INPUT = "w-full h-8 px-2.5 text-[13px] border border-border rounded-md bg-background focus:outline-none"

function Control({ field, value, onChange }: { field: SchemaField; value: unknown; onChange: (v: unknown) => void }) {
  if (field.type === "richtext") return <RichTextField value={typeof value === "string" ? value : ""} onChange={onChange} placeholder={field.placeholder ?? ""} />
  if (field.type === "range") return <input type="range" min={0} max={100} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} data-probe-control={field.id} />
  return <input type="text" className={INPUT} value={typeof value === "string" ? value : ""} placeholder={field.placeholder ?? ""} onChange={(e) => onChange(e.target.value)} data-probe-control={field.id} />
}

/* As the editor's FieldEditor: the translated field while another language is edited, else the control as always. */
function Field({ field, value, onChange }: { field: SchemaField; value: unknown; onChange: (v: unknown) => void }) {
  const tr = useTranslationEditing()
  const keyFor = useTranslationScope()
  if (tr) return <TranslatedFieldEditor tr={tr} keyFor={keyFor} field={field} label={field.label} value={value} render={(v, change, f) => <Control field={f} value={v} onChange={change} />} />
  return (
    <div data-setting={field.id}>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
      <Control field={field} value={value ?? field.default} onChange={onChange} />
    </div>
  )
}

const keyFor = (id: string) => sectionKey("s1", id)

function App() {
  const lang = usePreviewLanguage("install-1")
  const editing = useTranslationEditor(lang)
  const [settings, setSettings] = React.useState<Record<string, unknown>>({ heading: "Spring sale", text: "<p>Linen, washed soft.</p>", image_alt: "A folded apron", accent: "#ff0000", padding: 32 })
  const section = { id: "s1", type: "hero", name: "hero", settings, blocks: [] } as unknown as SectionInstance
  const [drawn] = lang.map ? localizeSections([section], lang.map, () => FIELDS, () => undefined, { approvedOnly: true, fresh: true }) : [section]
  const shown = drawn.settings as Record<string, unknown>
  return (
    <div className="flex">
      <aside className="w-[288px] bg-white" data-probe-sidebar="">
        <div className="px-3 pt-3 pb-2">
          <select id="wb-edit-language" value={lang.locale ?? lang.defaultLanguage} onChange={(e) => lang.setLocale(e.target.value)} className={INPUT}>
            {lang.languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <TranslationEditingProvider value={editing}>
          <TranslationScope keyFor={keyFor}>
            <div className="px-3.5 py-3.5 space-y-3.5">
              {FIELDS.map((f) => (
                <Field key={f.id} field={f} value={settings[f.id]} onChange={(v) => setSettings((s) => ({ ...s, [f.id]: v }))} />
              ))}
            </div>
          </TranslationScope>
        </TranslationEditingProvider>
      </aside>
      <main className="flex-1 p-6" data-probe-canvas="">
        <h1 data-canvas-heading="">{String(shown.heading)}</h1>
        <div data-canvas-text="" dangerouslySetInnerHTML={{ __html: String(shown.text) }} />
        <img data-canvas-image="" alt={String(shown.image_alt)} src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
      </main>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
