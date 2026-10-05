/**
 * Round 13's video and attachments for scripts/check-community-video.mjs:
 * the real components with fixtures, chosen by ?case=. The routes they call
 * are answered by the probe (a stubbed video service that goes uploading,
 * processing, ready; the play route with a real WebM clip it serves).
 *
 *   composer   the post composer, open; a video from the device goes through
 *              the community's video route and Post waits until it plays
 *   tray       the attachment tray alone with six tiles (pictures, a video,
 *              a GIF, a linked video, a file), for drag, remove and add
 *   player     a post's video (poster, preview, then the community player)
 *   portrait   the same with a portrait video (a 4:5 box)
 *   cover      the About page's gallery led by an uploaded cover video
 */
import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { Composer } from "@/components/community/member/composer"
import { AttachmentTray, moveKey, type TrayItem } from "@/components/community/member/attachment-tray"
import { StorelibVideo } from "@/components/video/storelib-video"
import { CommunityGallery } from "@/components/community/public/gallery-view"
import { LocaleProvider } from "@/components/locale-provider"

const CID = "6f1c2a1e-0000-4000-8000-000000000001"
const VID = "33333333-0000-4000-8000-000000000001"
const params = new URLSearchParams(location.search)
const which = params.get("case") || "composer"

const picture = (a: string, b: string, w = 1200, h = 800) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.3}" r="${h * 0.18}" fill="#ffffff" opacity="0.28"/></svg>`)}`

function TrayCase() {
  const [items, setItems] = useState<TrayItem[]>([
    { key: "a", kind: "image", name: "", size: 0, progress: 100, preview: picture("#e9e4dc", "#c8b9a6"), media: { type: "image", url: "x" } },
    { key: "b", kind: "video", name: "Video", size: 0, progress: 100, preview: picture("#1f2a3a", "#4b6b8a"), media: { type: "video", videoId: VID } },
    { key: "c", kind: "gif", name: "GIF", size: 0, progress: 100, preview: picture("#f4d7c8", "#d98f6a", 400, 300), media: { type: "gif", url: "x", still: "x" } },
    { key: "d", kind: "embed", name: "YouTube", size: 0, progress: 100, preview: picture("#2b2b2b", "#b33a3a"), media: { type: "embed", provider: "youtube", id: "dQw4w9WgXcQ", url: "https://youtu.be/dQw4w9WgXcQ" } },
    { key: "e", kind: "file", name: "Onboarding flow v3.pdf", size: 2_400_000, progress: 100, media: { type: "file", assetId: "22222222-0000-4000-8000-000000000001", name: "Onboarding flow v3.pdf" } },
    { key: "f", kind: "image", name: "", size: 0, progress: 100, preview: picture("#dfe7ee", "#a9bccd"), media: { type: "image", url: "y" } },
  ])
  const states = params.get("states") === "1"
  const shown: TrayItem[] = states
    ? [
        ...items.slice(0, 2),
        { key: "u", kind: "video", name: "clip.mov", size: 0, progress: 42, preview: picture("#1f2a3a", "#4b6b8a") },
        { key: "p", kind: "video", name: "clip.mov", size: 0, progress: 100, preview: picture("#2a3a2f", "#5b8a6b") },
        { key: "x", kind: "video", name: "clip.mov", size: 0, progress: 100, preview: picture("#3a2a2a", "#8a5b5b"), error: "This video could not be processed: the file has no video track." },
        { key: "i", kind: "image", name: "", size: 0, progress: 10, preview: picture("#e9e4dc", "#c8b9a6") },
      ]
    : items
  ;(window as unknown as { __order: () => string }).__order = () => items.map((x) => x.key).join("")
  return (
    <div className="mx-auto max-w-[620px] bg-white p-4 sm:mt-10 sm:rounded-2xl sm:border sm:border-[#e5e7eb]/60 sm:p-6">
      <p className="mb-3 text-[15px] font-semibold text-[#1a1a2e]">A post with things attached</p>
      <AttachmentTray
        items={shown}
        onMove={(k, to) => setItems((list) => moveKey(list, k, to))}
        onRemove={(it) => setItems((list) => list.filter((x) => x.key !== it.key))}
        onAdd={
          items.length < 10
            ? () => setItems((list) => [...list, { key: `n${list.length}`, kind: "image", name: "", size: 0, progress: 100, preview: picture("#e3e9d9", "#9fb08a"), media: { type: "image", url: `n${list.length}` } }])
            : undefined
        }
      />
      <div className="h-[600px]" />
    </div>
  )
}

function App() {
  if (which === "tray") return <TrayCase />
  if (which === "player" || which === "portrait")
    return (
      <div className="mx-auto max-w-[640px] bg-white p-0 sm:mt-10 sm:rounded-2xl sm:p-5">
        <p className="px-4 pb-3 pt-4 text-[15px] font-semibold text-[#1a1a2e] sm:px-0 sm:pt-0">Walkthrough of the new studio</p>
        <div className="px-4 sm:px-0">
          <StorelibVideo communityId={CID} videoId={VID} poster={picture("#1f2a3a", "#4b6b8a", which === "portrait" ? 720 : 1280, which === "portrait" ? 1280 : 720)} width={which === "portrait" ? 720 : 1280} height={which === "portrait" ? 1280 : 720} durationSeconds={8} title="Walkthrough of the new studio" />
        </div>
        <div className="h-[900px]" />
      </div>
    )
  if (which === "cover")
    return (
      <div className="mx-auto max-w-[760px] bg-white p-4 sm:mt-8 sm:rounded-2xl sm:p-6">
        <CommunityGallery
          communityId={CID}
          name="Studio Notes"
          items={[
            { type: "video", videoId: VID, posterUrl: picture("#1f2a3a", "#4b6b8a", 1280, 720), cover: true },
            { type: "image", url: picture("#e9e4dc", "#c8b9a6") },
            { type: "image", url: picture("#dfe7ee", "#a9bccd") },
          ]}
        />
      </div>
    )
  return (
    <div className="mx-auto max-w-[680px] p-0 sm:mt-8">
      <Composer
        communityId={CID}
        userId="u-me"
        me={{ name: "Sam Carter", avatarUrl: null }}
        spaces={[{ id: "s-general", name: "General", kind: "feed" }]}
        onPosted={(p) => ((window as unknown as { __posted: unknown }).__posted = p)}
      />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <App />
  </LocaleProvider>,
)
