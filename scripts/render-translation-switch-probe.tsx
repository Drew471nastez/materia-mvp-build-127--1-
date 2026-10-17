/**
 * The builder's sidebar for one section, in the language the language row
 * picks, for scripts/check-translation-switch.mjs: the real hook
 * (components/website-builder/use-preview-language.ts), the real language
 * row, scopes, locks and translated control (components/website-builder/
 * editor/translation-edit.tsx) and the real text and rich text boxes, with
 * a strip of canvas drawn from the same translations by the website's own
 * localizeSections. The check's server answers /api/store/translations.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { usePreviewLanguage } from "@/components/website-builder/use-preview-language"
import { EditLanguageRow, Locked, SectionTranslationScope, TranslatedField, TranslationEditProvider, useFieldTranslation, type TranslationEditing } from "@/components/website-builder/editor/translation-edit"
import { RichTextField } from "@/components/website-builder/rich-text-field"
import { localizeSections } from "@/lib/markets/translate"
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

/* As the editor's FieldEditor decides: the language's control, a lock, or the control as always. */
function Field({ field, value, onChange }: { field: SchemaField; value: unknown; onChange: (v: unknown) => void }) {
  const t = useFieldTranslation(field, value)
  if (t?.mode === "edit") return <TranslatedField label={field.label} field={field} state={t} render={(f, v, change) => <Control field={f} value={v} onChange={change} />} />
  const control = (
    <div data-setting={field.id}>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{field.label}</label>
      <Control field={field} value={value ?? field.default} onChange={onChange} />
    </div>
  )
  return t?.mode === "locked" ? <Locked reason={t.reason}>{control}</Locked> : control
}

function App() {
  const lang = usePreviewLanguage("install-1")
  const [settings, setSettings] = React.useState<Record<string, unknown>>({ heading: "Spring sale", text: "<p>Linen, washed soft.</p>", image_alt: "A folded apron", accent: "#ff0000", padding: 32 })
  const edit = React.useMemo<TranslationEditing | null>(() => (lang.locale ? { locale: lang.locale, defaultLanguage: lang.defaultLanguage, rows: lang.rows, write: lang.write } : null), [lang.locale, lang.defaultLanguage, lang.rows, lang.write])
  const section = { id: "s1", type: "hero", name: "hero", settings, blocks: [] } as unknown as SectionInstance
  const [drawn] = lang.map ? localizeSections([section], lang.map, () => FIELDS, () => undefined, { approvedOnly: true, fresh: true }) : [section]
  const shown = drawn.settings as Record<string, unknown>
  return (
    <div className="flex">
      <aside className="w-[288px] bg-white" data-probe-sidebar="">
        <div className="px-3 pt-3 pb-2 text-[13px] font-semibold">Sections</div>
        <EditLanguageRow languages={lang.languages} published={lang.published} defaultLanguage={lang.defaultLanguage} locale={lang.locale} onChange={lang.setLocale} save={lang.save} onRetry={lang.retry} />
        <TranslationEditProvider value={edit}>
          <SectionTranslationScope sectionId="s1">
            <div className="px-3.5 py-3.5 space-y-3.5">
              {FIELDS.map((f) => (
                <Field key={f.id} field={f} value={settings[f.id]} onChange={(v) => setSettings((s) => ({ ...s, [f.id]: v }))} />
              ))}
            </div>
          </SectionTranslationScope>
        </TranslationEditProvider>
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
