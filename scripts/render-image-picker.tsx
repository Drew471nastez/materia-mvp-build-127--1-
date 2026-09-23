/**
 * The REAL editor image picker, driven the way a creator drives it.
 *
 * Two of them:
 *
 *   upload   starts empty. The probe puts a file on its <input> and the
 *            component's own handleFile runs: local preview, upload, then
 *            the stored URL through onChange. This is the reported moment.
 *
 *   arriving starts with a value already set and no local file, which is a
 *            panel opening on a picture it has not fetched. The box has to
 *            hold something while that happens.
 *
 * `@/lib/supabase/client` is aliased by the probe to a stub whose upload
 * succeeds and whose public URL is a real image, so the component's actual
 * code path runs end to end with no network.
 */
import { createRoot } from "react-dom/client"
import { useState } from "react"

import { WbImagePicker } from "../components/website-builder/editor/image-picker"

function One({ id, initial }: { id: string; initial?: string }) {
  const [value, setValue] = useState<string | undefined>(initial)
  return (
    <div id={id} style={{ width: 320 }}>
      <WbImagePicker value={value} onChange={(url) => setValue(url ?? undefined)} label="Image" />
    </div>
  )
}

/* A 2x2 PNG, so "the stored copy" is a picture that really decodes. */
const STORED =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4nGP8z8Dwn4GBgYGJAQ0AAB5vAQVVB2CvAAAAAElFTkSuQmCC"

function Harness() {
  return (
    <div style={{ padding: 16, fontFamily: "system-ui", display: "flex", gap: 24 }}>
      <One id="upload" />
      <One id="arriving" initial={STORED} />
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<Harness />)
