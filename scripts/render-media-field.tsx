/**
 * The builder's upload field, for scripts/check-media-field.mjs.
 *
 * Two of the real `MediaField`s as a section's settings show them: a picture
 * with its description under it, and a background video. Nothing about the
 * field is stubbed. What is answered here instead of Supabase:
 *
 *   `@/lib/supabase/client`   aliased by the probe to a stub with a signed in
 *                             user, a session, and public URLs on this page's
 *                             own server
 *   the storage endpoint      NEXT_PUBLIC_SUPABASE_URL is this page's origin
 *                             (window.__SUPA), so lib/storage/upload-with-progress
 *                             posts the real request, with real progress
 *                             events, to the probe's server
 */
import { createRoot } from "react-dom/client"
import { useState } from "react"

import { MediaField } from "@/components/website-builder/editor/image-picker"

declare global {
  interface Window {
    __values: { image: string | null; alt: string; video: string | null }
  }
}

window.__values = { image: null, alt: "", video: null }

function Panel() {
  const [image, setImage] = useState<string | null>(null)
  const [alt, setAlt] = useState("")
  const [video, setVideo] = useState<string | null>(null)
  window.__values = { image, alt, video }
  return (
    <div className="mx-auto w-full max-w-[340px] space-y-6 bg-white px-4 py-5">
      <div id="image">
        <MediaField
          value={image ?? undefined}
          onChange={setImage}
          label="Image"
          alt={{ value: alt, onChange: setAlt, label: "Description" }}
        />
      </div>
      <div id="video">
        <MediaField value={video ?? undefined} onChange={setVideo} label="Background video" kind="video" />
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Panel />)
