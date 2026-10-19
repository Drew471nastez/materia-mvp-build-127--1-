/**
 * Shop data in a sentence, as the editor's sidebar draws it: every kind of
 * text box that takes a source, each in the real DynamicSourceField with the
 * real control inside it (a one line text setting, long text, a heading and
 * a rich text body). A 320px column at a desktop, the editor's bottom sheet
 * at a phone. See scripts/check-value-pills.mjs.
 */
import { useState } from "react"
import { createRoot } from "react-dom/client"

import { DynamicSourceField, EditorFieldProvider } from "@/components/website-builder/editor/controls"
import { InlineRichTextControl } from "@/components/website-builder/editor/controls/inline-richtext-control"
import { AutoTextarea } from "@/components/website-builder/auto-textarea"
import { RichTextField } from "@/components/website-builder/rich-text-field"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"

declare global {
  interface Window {
    __pillValues: Record<string, string>
  }
}

const FIELDS = [
  { id: "line", type: "text", label: "Heading", start: "" },
  { id: "first", type: "text", label: "Eyebrow", start: "" },
  { id: "sentence", type: "text", label: "Button label", start: "Get {{ shop.name }} today" },
  { id: "swap", type: "text", label: "Subheading", start: "Made by {{ shop.name }} in Leeds" },
  { id: "arrow", type: "text", label: "Caption", start: "A{{ shop.name }}B" },
  { id: "heading", type: "inline_richtext", label: "Title", start: "Welcome" },
  { id: "body", type: "richtext", label: "Text", start: "<p>Hello there</p>" },
  { id: "end", type: "richtext", label: "Note", start: "<p>Hi</p>" },
  { id: "story", type: "textarea", label: "Story", start: "" },
] as const

window.__pillValues = Object.fromEntries(FIELDS.map((f) => [f.id, f.start]))

function Control({ type, value, onChange }: { type: string; value: string; onChange: (v: string) => void }) {
  if (type === "inline_richtext") return <InlineRichTextControl value={value} onChange={onChange} label="Title" />
  if (type === "richtext") return <RichTextField value={value} onChange={onChange} placeholder="Write something" />
  if (type === "textarea") return <AutoTextarea value={value} onChange={onChange} />
  /* The editor's one line text setting (EchoTextInput in the editor page). */
  return (
    <AutoTextarea
      singleLine
      maxRows={8}
      value={value}
      onChange={onChange}
      className="min-h-8 px-2.5 py-[6px] text-[13px] leading-[18px] rounded-md max-sm:min-h-11 max-sm:py-[10px] max-sm:text-[16px] max-sm:leading-[22px]"
    />
  )
}

function Panel({ values, set }: { values: Record<string, string>; set: (id: string, v: string) => void }) {
  return (
    <EditorFieldProvider value={{ products: [], menus: {}, template: "index" }}>
      <div className="space-y-4 p-4" id="fields">
        {FIELDS.map((f) => (
          <div key={f.id} data-probe-field={f.id}>
            <DynamicSourceField field={{ type: f.type, label: f.label }} value={values[f.id]} onChange={(v) => set(f.id, String(v ?? ""))} label={f.label}>
              <Control type={f.type} value={values[f.id]} onChange={(v) => set(f.id, v)} />
            </DynamicSourceField>
          </div>
        ))}
        <div className="h-64" />
      </div>
    </EditorFieldProvider>
  )
}

function App() {
  const [values, setValues] = useState<Record<string, string>>(window.__pillValues)
  const set = (id: string, v: string) => {
    window.__pillValues[id] = v
    setValues((prev) => ({ ...prev, [id]: v }))
  }
  return window.innerWidth < 640 ? (
    <MobileEditorSheet open onOpenChange={() => {}}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-sheet-scroll="">
        <Panel values={values} set={set} />
      </div>
    </MobileEditorSheet>
  ) : (
    <div className="flex h-screen">
      <div data-wb-sidebar-scroll="" className="h-screen w-[320px] shrink-0 overflow-y-auto border-r border-border bg-white">
        <Panel values={values} set={set} />
      </div>
      <div className="flex-1 bg-[#f3f4f6]" />
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<App />)
