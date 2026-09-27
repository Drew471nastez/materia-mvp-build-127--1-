/**
 * Settings that can take a dynamic source, as the editor's sidebar draws
 * them: a 320px column at a desktop, the editor's real bottom sheet at a
 * phone. See scripts/check-dynamic-source.mjs.
 */
import { useState } from "react"
import { createRoot } from "react-dom/client"

import { DynamicSourceField, EditorFieldProvider } from "@/components/website-builder/editor/controls"
import { INPUT, SELECT } from "@/components/website-builder/editor/controls/styles"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"

declare global {
  interface Window {
    __values: Record<string, unknown>
  }
}

const start: Record<string, string> = {
  eyebrow: "Featured",
  heading: "A few things worth opening",
  cta: "Get {{ product.title }} today",
  title: "{{ product.title }}",
  image: "{{ product.image }}",
}
window.__values = { ...start }

function useValue(id: string) {
  const [value, setValue] = useState<unknown>(start[id] ?? "")
  const onChange = (v: unknown) => {
    window.__values[id] = v
    setValue(v)
  }
  return [value, onChange] as const
}

function TextField({ id, label }: { id: string; label: string }) {
  const [value, onChange] = useValue(id)
  return (
    <div data-probe-field={id}>
      <DynamicSourceField field={{ type: "text", label }} value={value} onChange={onChange} label={label}>
        <input type="text" className={INPUT} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
      </DynamicSourceField>
    </div>
  )
}

function ImageField() {
  const [value, onChange] = useValue("image")
  return (
    <div data-probe-field="image">
      <DynamicSourceField field={{ type: "image_picker", label: "Image" }} value={value} onChange={onChange} label="Image">
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">Select image</div>
      </DynamicSourceField>
    </div>
  )
}

function PlainField() {
  return (
    <div data-probe-field="style">
      <DynamicSourceField field={{ type: "select", label: "Style" }} value="a" onChange={() => {}} label="Style">
        <select className={SELECT}>
          <option>Left</option>
        </select>
      </DynamicSourceField>
    </div>
  )
}

function Panel() {
  return (
    <EditorFieldProvider value={{ products: [], menus: {}, template: "product" }}>
      <div className="p-4 space-y-4" id="fields">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Content</p>
        <TextField id="eyebrow" label="Eyebrow" />
        <TextField id="heading" label="Heading" />
        <PlainField />
        <TextField id="cta" label="Button label" />
        <TextField id="title" label="Product name line" />
        <ImageField />
        <div className="h-64" />
      </div>
    </EditorFieldProvider>
  )
}

const phone = window.innerWidth < 640
createRoot(document.getElementById("root")!).render(
  phone ? (
    <MobileEditorSheet open onOpenChange={() => {}}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-sheet-scroll="">
        <Panel />
      </div>
    </MobileEditorSheet>
  ) : (
    <div className="flex h-screen">
      <div data-wb-sidebar-scroll="" className="h-screen w-[320px] shrink-0 overflow-y-auto border-r border-border bg-white">
        <Panel />
      </div>
      <div className="flex-1 bg-[#f3f4f6]" />
    </div>
  ),
)
