/**
 * The picture field and the colour scheme field, as the editor's sidebar
 * draws them, for scripts/check-builder25.ts (picker, schemes).
 *
 * The real controls (ImagePickerControl, WbImagePicker, ColorSchemeControl)
 * inside the real field context, in a column as wide as the sidebar's
 * (PROBE_COLUMN). The pictures are served by the probe:
 *
 *   ok.png        a picture
 *   missing.png   404, twice, so the field gives up on it
 *   logo.png      what an imported theme's own "logo.png" is stored as
 *
 * and an imported theme's two old-store values: one the theme brought
 * (shopify://shop_images/logo.png, in its asset map) and one it did not
 * (shopify://shop_images/favicon.png).
 */
import { createRoot } from "react-dom/client"
import { useState } from "react"

import { ImagePickerControl } from "@/components/website-builder/editor/controls/image-picker-control"
import { ColorSchemeControl } from "@/components/website-builder/editor/controls/color-scheme-control"
import { EditorFieldProvider, type EditorFieldEnv } from "@/components/website-builder/editor/controls/context"
import { WbImagePicker } from "@/components/website-builder/editor/image-picker"

const base = (globalThis as unknown as { PROBE_PICTURES: string }).PROBE_PICTURES
const column = (globalThis as unknown as { PROBE_COLUMN: number }).PROBE_COLUMN

/* Twelve schemes as an imported Horizon names and colours them: the screenshot's. */
const SCHEMES = [
  ["default", "Default", "#ffffff", "#121212", "#121212"],
  ["scheme-2", "Scheme 2", "#f5f5f5", "#121212", "#121212"],
  ["scheme-3", "Scheme 3", "#ffffff", "#121212", "#121212"],
  ["scheme-4", "Scheme 4", "#121212", "#ffffff", "#ffffff"],
  ["scheme-5", "Scheme 5", "#0b0b0b", "#ffffff", "#ffffff"],
  ["scheme-6", "Scheme 6", "#eef0eb", "#121212", "#121212"],
  ["scheme-7", "Scheme 7", "#fbfbfb", "#121212", "#d9d9d9"],
  ["scheme-8", "Scheme 8", "#ffffff", "#121212", "#f2f2f2"],
  ["scheme-9", "Scheme 9", "#1b1b1b", "#ffffff", "#8a7a6a"],
  ["scheme-10", "Scheme 10", "#102118", "#1f3a2b", "#dcff6a"],
  ["scheme-11", "Scheme 11", "#e2e2e2", "#121212", "#121212"],
  ["scheme-12", "Scheme 12", "#eef0eb", "#121212", "#ffffff"],
].map(([id, name, background, text, accent]) => ({ id, name, background, text, accent }))

const env: EditorFieldEnv = {
  products: [],
  menus: {},
  template: "index",
  colorSchemes: SCHEMES,
  pictureMedia: { "logo.png": `${base}/logo.png` },
}

function Field({ id, label, initial }: { id: string; label: string; initial: string }) {
  const [value, setValue] = useState(initial)
  return (
    <div data-probe-field={id}>
      <p className="mb-1.5 text-[13px] font-medium text-foreground">{label}</p>
      <ImagePickerControl value={value} onChange={setValue} label={label} />
    </div>
  )
}

function Box({ id, initial }: { id: string; initial: string }) {
  const [value, setValue] = useState<string | undefined>(initial)
  return (
    <div data-probe-field={id}>
      <WbImagePicker value={value} onChange={(v) => setValue(v ?? undefined)} label="Favicon" aspectRatio="favicon" library={false} />
    </div>
  )
}

function Schemes() {
  const [value, setValue] = useState("scheme-4")
  return (
    <div data-probe-field="schemes">
      <p className="mb-1.5 text-[13px] font-medium text-foreground">Color scheme</p>
      <ColorSchemeControl value={value} onChange={setValue} label="Color scheme" />
    </div>
  )
}

function Sidebar() {
  return (
    <EditorFieldProvider value={env}>
      <div data-probe-column="" className="space-y-5 bg-white px-3.5 py-3.5" style={{ width: column }}>
        <Field id="favicon-old-store" label="Favicon" initial="shopify://shop_images/favicon.png" />
        <Field id="logo-old-store" label="Logo" initial="shopify://shop_images/logo.png" />
        <Field id="missing" label="Image" initial={`${base}/missing.png`} />
        <Field id="ok" label="Image" initial={`${base}/ok.png`} />
        <Box id="settings-favicon" initial={`${base}/missing.png`} />
        <Schemes />
      </div>
    </EditorFieldProvider>
  )
}

createRoot(document.getElementById("root")!).render(<Sidebar />)
