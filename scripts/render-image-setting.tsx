/**
 * ===========================================================================
 *  THE IMAGE SETTING, FOR A BROWSER TO MEASURE
 * ===========================================================================
 * Served by scripts/check-image-setting.mjs. The real ImagePickerControl the
 * sidebar draws for every image setting, in a column as wide as the sidebar,
 * holding its value the way the editor does. Two of them:
 *
 *   empty    nothing chosen: the dropzone, and the address box under it
 *   filled   a picture already set: the picture, Replace and Remove, and
 *            the address box under it showing the picture's address
 *
 * Each wrapper carries what the control last handed back as `data-value`,
 * so the probe reads the setting rather than the box.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { ImagePickerControl } from "@/components/website-builder/editor/controls/image-picker-control"

declare global {
  interface Window {
    __ready: boolean
  }
}

function One({ id, initial }: { id: string; initial: string }) {
  const [value, setValue] = React.useState(initial)
  return (
    <div id={id} data-value={value} style={{ width: 296 }}>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">Logo</p>
      <ImagePickerControl value={value} onChange={setValue} label="Logo" />
    </div>
  )
}

function Harness() {
  React.useEffect(() => {
    window.__ready = true
  }, [])
  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 24 }}>
      <One id="empty" initial="" />
      <One id="filled" initial="https://cdn.test/brand/logo-ld.png" />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
