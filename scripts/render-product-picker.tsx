/**
 * The probe page for scripts/check-product-picker.mjs: the sidebar's product
 * picker (components/website-builder/editor/controls/product-list-control.tsx)
 * drawn by its real component in a column the sidebar's width, under a label
 * drawn the way FieldEditor draws one, holding its value the way the editor
 * does, with the product list control beside it for comparison.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { EditorFieldProvider, type EditorFieldEnv } from "@/components/website-builder/editor/controls/context"
import { ProductListControl, ProductPickerControl } from "@/components/website-builder/editor/controls/product-list-control"

declare global {
  interface Window {
    __ready: boolean
    __value: string
    __photos: string[]
  }
}

const photos = window.__photos
const env: EditorFieldEnv = {
  products: [
    { id: "p1", title: "Linen shirt", price: "$48.00", image: photos[0], url: "/products/linen-shirt" },
    { id: "p2", title: "Canvas tote", price: "$32.00", image: photos[1], url: "/products/canvas-tote" },
    { id: "p3", title: "Film presets", price: "$12.00", image: photos[2], url: "/products/film-presets" },
    { id: "p4", title: "No address yet", price: "", image: "", url: "" },
  ],
  menus: {},
  template: "index",
} as EditorFieldEnv

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-medium text-foreground">{label}</label>
      {children}
    </div>
  )
}

function Probe() {
  const [one, setOne] = React.useState("")
  const [many, setMany] = React.useState<string[]>(["p2"])
  React.useEffect(() => { window.__value = one }, [one])
  return (
    <EditorFieldProvider value={env}>
      <div style={{ width: 296, padding: 12 }} className="space-y-5" data-probe-column="">
        <div data-probe="one"><Field label="Product"><ProductPickerControl value={one} onChange={setOne} label="Product" /></Field></div>
        <div data-probe="many"><Field label="Products to show"><ProductListControl value={many} onChange={(v) => setMany(v)} label="Products to show" /></Field></div>
      </div>
    </EditorFieldProvider>
  )
}

createRoot(document.getElementById("app")!).render(<Probe />)
window.__ready = true
