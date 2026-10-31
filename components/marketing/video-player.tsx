"use client"

import { useState } from "react"
import { clock, embedUrl, thumbnailUrl, watchUrl, type VideoChapter } from "@/lib/marketing/videos"

/**
 * A YouTube video that costs nothing until it is pressed: the thumbnail and a
 * play button, drawn on the server as a link to the video on YouTube, so it
 * works with no script at all. Pressed, it becomes the player (the
 * privacy-enhanced youtube-nocookie address, which sets no cookie until
 * play). A chapter link opens or moves the player to its time; without a
 * script it is a link to that time on YouTube.
 */
export function VideoPlayer({ id, title, chapters }: { id: string; title: string; chapters: VideoChapter[] }) {
  const [start, setStart] = useState<number | null>(null)
  const play = (t: number) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    setStart(t)
  }
  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-[#16161a]">
        {start === null ? (
          <a href={watchUrl(id)} onClick={play(0)} className="group absolute inset-0 block" aria-label={`Play ${title}`}>
            {/* A plain img: the thumbnail is YouTube's, so the image optimizer would only fetch it again. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbnailUrl(id)} alt="" width={480} height={360} loading="lazy" decoding="async" className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
            <span aria-hidden className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
              <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 fill-[#1a1a2e]">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </a>
        ) : (
          <iframe
            key={start}
            src={`${embedUrl(id)}?autoplay=1&rel=0${start ? `&start=${start}` : ""}`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        )}
      </div>
      {chapters.length > 0 ? (
        <ol className="mt-4 grid gap-x-6 gap-y-1.5 sm:grid-cols-2" aria-label="Chapters">
          {chapters.map((c) => (
            <li key={c.t} className="text-[14px] leading-[1.5]">
              <a href={watchUrl(id, c.t)} onClick={play(c.t)} className="group inline-flex gap-2 text-[#374151] hover:text-[#1a1a2e]">
                <span className="w-12 shrink-0 tabular-nums text-[#6b7280] group-hover:text-[#1a1a2e]">{clock(c.t)}</span>
                <span className="underline-offset-2 group-hover:underline">{c.label}</span>
              </a>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
