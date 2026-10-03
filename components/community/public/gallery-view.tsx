"use client"

/**
 * THE ABOUT PAGE'S MEDIA: one large picture or video, and under it a strip
 * of thumbnails to choose another. A video shows its poster and a play
 * button; pressed, it asks the server for a signed address (the cover video
 * and gallery videos of a published community play for anyone) and plays
 * in place with the browser's own controls. The strip scrolls sideways on a
 * phone; the chosen thumbnail is ringed in ink.
 *
 * Arrow keys move through the strip when it has focus. Nothing moves on its
 * own: no autoplay, no carousel timer.
 */
import * as React from "react"
import { Play } from "lucide-react"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { cn } from "@/lib/utils"
import type { GalleryItemView } from "./gallery"

type Playback = { url: string; poster?: string | null; mime?: string | null }

export function CommunityGallery({ communityId, name, items }: { communityId: string; name: string; items: GalleryItemView[] }) {
  const [index, setIndex] = React.useState(0)
  const [playing, setPlaying] = React.useState<{ videoId: string; playback: Playback } | null>(null)
  const [loading, setLoading] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState<string | null>(null)
  const strip = React.useRef<HTMLDivElement>(null)
  const current = items[Math.min(index, items.length - 1)]
  if (!current) return null

  const choose = (i: number) => {
    setIndex(i)
    setPlaying(null)
    setFailed(null)
    const thumb = strip.current?.querySelectorAll<HTMLElement>("[data-gallery-thumb]")[i]
    thumb?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }

  const play = async (videoId: string) => {
    if (loading) return
    setLoading(videoId)
    setFailed(null)
    try {
      const res = await fetch(`/api/community/${communityId}/videos/${videoId}/play`)
      const data = (await res.json().catch(() => null)) as (Playback & { error?: string }) | null
      if (!res.ok || !data?.url) {
        setFailed(data?.error === "not_ready" ? "This video is still being prepared." : "This video could not be played.")
        return
      }
      setPlaying({ videoId, playback: data })
    } catch {
      setFailed("The connection dropped. Try again.")
    } finally {
      setLoading(null)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    e.preventDefault()
    const next = (index + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length
    choose(next)
    strip.current?.querySelectorAll<HTMLElement>("[data-gallery-thumb]")[next]?.focus()
  }

  return (
    <div data-community-gallery="" data-gallery-count={items.length}>
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-[#eceef1]" data-gallery-main={current.type}>
        {current.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={current.url} src={optimizedImageUrl(current.url, 1200)} alt={index === 0 ? name : ""} fetchPriority={index === 0 ? "high" : "auto"} className="absolute inset-0 h-full w-full object-cover animate-in fade-in-0 duration-200 motion-reduce:animate-none" />
        ) : playing?.videoId === current.videoId ? (
          <video
            key={current.videoId}
            src={playing.playback.url}
            poster={playing.playback.poster ?? current.posterUrl ?? undefined}
            controls
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full bg-black object-contain"
            data-gallery-video=""
          />
        ) : (
          <button type="button" onClick={() => play(current.videoId)} aria-label="Play video" className="group/play absolute inset-0 flex items-center justify-center outline-none" data-gallery-play="">
            {current.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optimizedImageUrl(current.posterUrl, 1200)} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : null}
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#1a1a2e]/80 text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] transition-[scale,background-color] duration-150 group-hover/play:bg-[#1a1a2e] group-active/play:scale-95 group-focus-visible/play:ring-4 group-focus-visible/play:ring-white/60">
              {loading === current.videoId ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Play className="ml-1 h-7 w-7 fill-white" aria-hidden />}
            </span>
          </button>
        )}
        {failed ? <p className="absolute inset-x-3 bottom-3 rounded-lg bg-white/95 px-3 py-2 text-center text-[13px] text-[#b42318]" role="alert">{failed}</p> : null}
      </div>

      {items.length > 1 ? (
        /* Up to six fill the width from 640px; more, or a phone, scroll sideways. Room around each for the ring. */
        <div
          ref={strip}
          role="listbox"
          aria-label="Pictures and videos"
          aria-orientation="horizontal"
          onKeyDown={onKey}
          className={cn("-mx-1.5 mt-2.5 flex gap-2 overflow-x-auto p-1.5 scrollbar-hide", items.length <= 6 && "sm:grid sm:grid-cols-6 sm:overflow-visible")}
          data-gallery-strip=""
        >
          {items.map((g, i) => {
            const on = i === index
            const src = g.type === "image" ? g.url : g.posterUrl
            return (
              <button
                key={g.type === "image" ? `i:${g.url}` : `v:${g.videoId}`}
                type="button"
                role="option"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                aria-label={`${g.type === "video" ? "Video" : "Picture"} ${i + 1} of ${items.length}`}
                onClick={() => choose(i)}
                data-gallery-thumb=""
                className={cn(
                  "relative aspect-[16/9] w-[92px] shrink-0 overflow-hidden rounded-lg bg-[#eceef1] outline-none transition-[opacity,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/40",
                  items.length <= 6 ? "sm:w-auto" : "sm:w-[112px]",
                  on ? "ring-2 ring-[#1a1a2e] ring-offset-2 ring-offset-white" : "opacity-75 hover:opacity-100",
                )}
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={optimizedImageUrl(src, 240)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
                {g.type === "video" ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1a1a2e]/75 text-white">
                      <Play className="ml-0.5 h-3.5 w-3.5 fill-white" aria-hidden />
                    </span>
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
