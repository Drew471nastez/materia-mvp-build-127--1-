/**
 * The OnePage media pieces, mounted for scripts/check-onepage-media-r11.mjs:
 *
 *   ?view=cropper    the real MediaCropper three times: a profile circle on a
 *                    picture inside a sheet-like box moved by a transform, a
 *                    free logo crop, and a 9:16 wallpaper crop on a playing
 *                    video, on a page tall enough to scroll
 *   ?view=upload     a file input wired to the real uploadOnePageMedia, with
 *                    the browser's own XMLHttpRequest, against the probe's
 *                    storage stub (NEXT_PUBLIC_SUPABASE_URL is the probe)
 *   ?view=same       a crop drawn the way the live page draws it
 *                    (croppedMediaStyle) beside the file the editor uploads
 *                    for it (cropImageBlob), to compare their pixels
 *   ?view=design     the real Design tab, Wallpaper open, with a signed in
 *                    session: Upload, Replace and Delete as the owner taps them
 */
import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { MediaCropper } from "@/components/onepage/media-cropper"
import { DesignTab } from "@/components/onepage/tabs/design-tab"
import { OnePageProvider, useOnePage } from "@/lib/onepage/context"
import { croppedMediaStyle, type MediaCrop } from "@/lib/onepage/media-crop"
import { cropImageBlob, uploadOnePageMedia, UploadError } from "@/lib/onepage/media-upload"
import { defaultSettings, defaultTheme, type OnePage } from "@/lib/onepage/types"

const w = window as any
const params = new URLSearchParams(location.search)
const view = params.get("view")
w.__crops = {}
w.__uploads = []

function CropperView() {
  return (
    <div style={{ minHeight: 2400, background: "#f8f9fa", padding: "16px 0" }}>
      <p style={{ font: "14px Inter, sans-serif", margin: "0 16px 8px" }}>Profile photo</p>
      {/* A sheet moves its body with a transform; the cropper must still put the box under the finger. */}
      <div id="sheet" style={{ transform: "translateY(12px) scale(0.92)", transformOrigin: "50% 0", background: "#fff", borderRadius: 16, margin: "0 16px" }}>
        <MediaCropper kind="image" src="/media/grid.jpg" aspect={1} shape="circle" maxHeight={300} onChange={(c) => (w.__crops.avatar = c)} />
      </div>
      <p style={{ font: "14px Inter, sans-serif", margin: "16px 16px 8px" }}>Logo</p>
      <div id="logo" style={{ background: "#fff", borderRadius: 16, margin: "0 16px" }}>
        <MediaCropper kind="image" src="/media/grid.jpg" aspect={null} maxHeight={240} onChange={(c) => (w.__crops.logo = c)} />
      </div>
      <p style={{ font: "14px Inter, sans-serif", margin: "16px 16px 8px" }}>Wallpaper video</p>
      <div id="wall" style={{ background: "#fff", borderRadius: 16, margin: "0 16px" }}>
        <MediaCropper kind="video" src="/media/clip.webm" aspect={9 / 16} maxHeight={260} onChange={(c) => (w.__crops.wall = c)} />
      </div>
    </div>
  )
}

function UploadView() {
  const [line, setLine] = useState("")
  return (
    <div style={{ padding: 16, font: "14px Inter, sans-serif" }}>
      <input
        id="pick"
        type="file"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (!file) return
          const ctrl = new AbortController()
          w.__stop = () => ctrl.abort()
          const rec: any = { name: file.name, type: file.type, size: file.size, progress: [] as number[], started: performance.now() }
          w.__uploads.push(rec)
          try {
            const res = await uploadOnePageMedia(file, {
              prefix: "probe",
              want: (params.get("want") as any) || "any",
              signal: ctrl.signal,
              retryDelayMs: 50,
              onProgress: (p) => {
                rec.progress.push(p.percent)
                setLine(`${p.percent}%`)
              },
            })
            rec.result = res
          } catch (err) {
            rec.error = err instanceof UploadError ? { code: err.code, message: err.message } : String(err)
            setLine(rec.error.message || String(err))
          } finally {
            rec.ms = Math.round(performance.now() - rec.started)
            rec.done = true
          }
        }}
      />
      <p id="line">{line}</p>
    </div>
  )
}

function SameView() {
  const crop: MediaCrop = JSON.parse(params.get("crop") || '{"x":20,"y":10,"width":45,"height":60,"v":2}')
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  React.useEffect(() => {
    void fetch("/media/grid.jpg")
      .then((r) => r.blob())
      .then((b) => cropImageBlob(b, crop, { size: 400 }))
      .then((out) => setBlobUrl(URL.createObjectURL(out)))
  }, [])
  const box = { width: 240, height: Math.round((240 * crop.height * 3) / (crop.width * 4)), position: "relative" as const, overflow: "hidden" }
  return (
    <div style={{ display: "flex", gap: 24, padding: 16, background: "#fff" }}>
      <div id="live" style={box}>
        {/* What public-onepage.tsx does with a saved crop. */}
        <img src="/media/grid.jpg" alt="" style={{ display: "block", width: "100%", height: "100%", ...(croppedMediaStyle(crop) as any) }} />
      </div>
      <div id="saved" style={box}>{blobUrl ? <img src={blobUrl} alt="" style={{ display: "block", width: "100%", height: "100%" }} /> : null}</div>
    </div>
  )
}

const page: OnePage = {
  id: "op_probe",
  owner_id: "probe-user",
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints",
  avatar_url: null,
  theme: { ...defaultTheme, ...(w.PROBE_THEME || {}) },
  settings: defaultSettings,
  social_links: {},
  draft_blocks: [],
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
} as any

function ThemeSpy() {
  const { onepage } = useOnePage()
  w.__theme = onepage?.theme
  return null
}

const root = createRoot(document.getElementById("app")!)
if (view === "cropper") root.render(<CropperView />)
else if (view === "upload") root.render(<UploadView />)
else if (view === "same") root.render(<SameView />)
else
  root.render(
    <OnePageProvider initialOnePage={page}>
      <ThemeSpy />
      <div style={{ maxWidth: 480, margin: "0 auto", background: "#fff", minHeight: "100vh" }}>
        <DesignTab userPlan="pro" />
      </div>
    </OnePageProvider>,
  )
