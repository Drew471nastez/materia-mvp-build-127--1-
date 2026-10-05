/**
 * THE CREATOR'S COVER AND GALLERY FIELDS, with fixtures, for
 * scripts/check-community-about11.mjs (round 11, ask 27). The real
 * components (CoverField and GalleryEditor from
 * components/community/creator/gallery-editor.tsx), wired the way the Page
 * settings wire them: the cover video, when there is one, is the gallery's
 * first item, and the gallery editor edits what follows it. The state is
 * printed into [data-probe-state] so the probe reads what Save would send.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CoverField, GalleryEditor } from "@/components/community/creator/gallery-editor"
import { GALLERY_MAX, coverVideo, type GalleryItem } from "@/components/community/creator/logic"

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`)}`
}
const PIC = svg(1600, 900, `<rect width="1600" height="900" fill="#cfdbd5"/><path d="M0 620 C 400 480, 800 740, 1600 550 L1600 900 L0 900 Z" fill="#6f8f7f"/>`)

function App() {
  const [state, setState] = React.useState<{ coverUrl: string | null; gallery: GalleryItem[] }>({ coverUrl: null, gallery: [{ type: "image", url: PIC }] })
  const [error, setError] = React.useState<string | null>(null)
  const cover = coverVideo(state.gallery)
  return (
    <div className="mx-auto max-w-[720px] space-y-6 bg-white p-6">
      <div>
        <p className="mb-1.5 block text-[13px] font-medium text-[#4b5563]">Cover</p>
        <CoverField
          coverUrl={state.coverUrl}
          gallery={state.gallery}
          onChange={(next) => {
            setState(next)
            setError(null)
          }}
          onError={setError}
        />
      </div>
      <div>
        <p className="mb-1.5 block text-[13px] font-medium text-[#4b5563]">Gallery</p>
        <GalleryEditor
          communityId="c0000000-0000-4000-8000-000000000001"
          value={cover ? state.gallery.slice(1) : state.gallery}
          onChange={(v) => setState((x) => ({ ...x, gallery: cover ? [cover, ...v] : v }))}
          max={cover ? GALLERY_MAX - 1 : GALLERY_MAX}
          videos={{}}
          ready
          onError={setError}
        />
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <pre data-probe-state="" style={{ fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        {JSON.stringify(state)}
      </pre>
    </div>
  )
}

createRoot(document.getElementById("app") as HTMLElement).render(<App />)
