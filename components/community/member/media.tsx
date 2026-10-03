"use client"

/**
 * What a post carries besides its words: pictures (from Storelib's own
 * storage), one link card (its picture is somebody else's, so it is asked for
 * without a referrer), files (downloaded through the member route, which
 * checks the member and the file), and videos (played from a short lived
 * signed address the classroom's video route hands out).
 */
import { useState } from "react"
import { Download, FileText, Play } from "lucide-react"
import type { PostMedia } from "@/lib/communities/types"
import { api, apiBase } from "./api"

export function fileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace(/\.0$/, "")} GB`
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export function PostMediaBlock({ media, communityId, postId }: { media: PostMedia[]; communityId: string; postId: string }) {
  const images = media.filter((m): m is Extract<PostMedia, { type: "image" }> => m.type === "image")
  const links = media.filter((m): m is Extract<PostMedia, { type: "link" }> => m.type === "link")
  const files = media.filter((m): m is Extract<PostMedia, { type: "file" }> => m.type === "file")
  const videos = media.filter((m): m is Extract<PostMedia, { type: "video" }> => m.type === "video")
  if (!media.length) return null
  return (
    <div className="mt-3 space-y-2.5">
      {images.length ? <ImageGrid images={images} /> : null}
      {videos.map((v) => (
        <VideoBlock key={v.videoId} communityId={communityId} videoId={v.videoId} />
      ))}
      {links.map((l) => (
        <LinkCard key={l.url} url={l.url} title={l.title ?? null} image={l.image ?? null} />
      ))}
      {files.map((f) => (
        <a
          key={f.assetId}
          href={`${apiBase(communityId)}/posts/${postId}/files/${f.assetId}`}
          className="flex min-h-12 items-center gap-3 rounded-xl border border-[#e8e9ec] px-3 py-2 transition-colors hover:bg-[#f8f9fa]"
          data-post-file=""
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f1f2f4] text-[#4b5563]">
            <FileText className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{f.name}</span>
            {f.size ? <span className="block text-[12.5px] text-[#6b7280]">{fileSize(f.size)}</span> : null}
          </span>
          <Download className="h-[18px] w-[18px] shrink-0 text-[#6b7280]" strokeWidth={1.75} aria-label="Download" />
        </a>
      ))}
    </div>
  )
}

function ImageGrid({ images }: { images: { url: string; w?: number; h?: number }[] }) {
  if (images.length === 1) {
    const img = images[0]
    const ratio = img.w && img.h ? Math.min(Math.max(img.w / img.h, 0.8), 2) : 4 / 3
    return (
      <a href={img.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl bg-[#f1f2f4]" style={{ aspectRatio: String(ratio) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </a>
    )
  }
  const shown = images.slice(0, 4)
  const more = images.length - shown.length
  return (
    <div className="grid grid-cols-2 gap-1.5 overflow-hidden rounded-xl">
      {shown.map((img, i) => (
        <a key={img.url} href={img.url} target="_blank" rel="noopener noreferrer" className={`relative block bg-[#f1f2f4] ${shown.length === 3 && i === 0 ? "row-span-2" : ""}`} style={{ aspectRatio: shown.length === 3 && i === 0 ? undefined : "1" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.url} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
          {more > 0 && i === shown.length - 1 ? <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[20px] font-semibold text-white">+{more}</span> : null}
        </a>
      ))}
    </div>
  )
}

export function LinkCard({ url, title, image, onRemove }: { url: string; title: string | null; image: string | null; onRemove?: () => void }) {
  return (
    <div className="relative">
      <a href={url} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex min-h-[72px] items-stretch overflow-hidden rounded-xl border border-[#e8e9ec] transition-colors hover:bg-[#f8f9fa]" data-link-card="">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-[88px] shrink-0 bg-[#f1f2f4] object-cover sm:w-[112px]" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
        ) : null}
        <span className={`flex min-w-0 flex-1 flex-col justify-center px-3.5 py-2.5 ${onRemove ? "pr-11" : ""}`}>
          <span className="truncate text-[12.5px] text-[#6b7280]">{hostOf(url)}</span>
          <span className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e]">{title || url}</span>
        </span>
      </a>
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label="Remove link preview" className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full text-[#6b7280] hover:bg-[#f1f2f4] hover:text-[#1a1a2e]">
          <span aria-hidden className="text-[18px] leading-none">×</span>
        </button>
      ) : null}
    </div>
  )
}

function VideoBlock({ communityId, videoId }: { communityId: string; videoId: string }) {
  const [state, setState] = useState<{ url: string; mime?: string } | "loading" | "failed" | null>(null)
  if (state && typeof state === "object") {
    return <video src={state.url} controls autoPlay playsInline className="w-full rounded-xl bg-black" style={{ aspectRatio: "16 / 9" }} />
  }
  return (
    <button
      type="button"
      onClick={async () => {
        setState("loading")
        const r = await api<{ url?: string; mime?: string }>(`${apiBase(communityId)}/videos/${videoId}/play`)
        setState(r.ok && r.data.url ? { url: r.data.url, mime: r.data.mime } : "failed")
      }}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#111318] text-[14px] font-medium text-white"
      style={{ aspectRatio: "16 / 9" }}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15">
        <Play className="h-5 w-5 translate-x-px" fill="currentColor" aria-hidden />
      </span>
      <span>{state === "loading" ? "Loading..." : state === "failed" ? "This video is not available" : "Play video"}</span>
    </button>
  )
}
