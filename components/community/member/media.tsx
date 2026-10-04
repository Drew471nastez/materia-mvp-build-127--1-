"use client"

/**
 * ===========================================================================
 *  WHAT A POST CARRIES BESIDES ITS WORDS
 * ===========================================================================
 * Two ways of drawing it (round 7):
 *
 *   ON THE CARD   one thumbnail on the right (PostThumb): the first picture,
 *                 else a video's still, a video by address's picture, a
 *                 GIF's still, a link's picture. 96px on a computer, 72px on
 *                 a phone, rounded, in a fixed box so nothing moves when it
 *                 arrives.
 *   IN THE POST   never the post's full width (PostMediaGrid): pictures,
 *                 GIFs and videos as a grid of larger thumbnails, each
 *                 opening the lightbox (lightbox.tsx) at itself; one alone
 *                 is a single tile up to 360px wide in its own shape. Then
 *                 the link card and the files, each a row.
 *
 * Pictures come through the image optimizer at the size they are drawn
 * (optimizedImageUrl / optimizedSrcSet), lazily, in boxes of a fixed shape.
 * A link card's picture and a GIF are somebody else's, so they are asked for
 * without a referrer. Files download through the member route, which checks
 * the member and the file; videos play from a short lived address, and only
 * once pressed.
 */
import { useState } from "react"
import { Download, FileText, Play } from "lucide-react"
import { optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { cardThumb, fileSizeLabel, viewerItems, type ViewerItem } from "@/lib/communities/post-media"
import type { PostMedia } from "@/lib/communities/types"
import { apiBase } from "./api"
import { Lightbox } from "./lightbox"

export function fileSize(bytes?: number): string {
  return fileSizeLabel(bytes)
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/** The card's one thumbnail, or nothing. */
export function PostThumb({ media, className = "" }: { media: PostMedia[]; className?: string }) {
  const thumb = cardThumb(media)
  const [failed, setFailed] = useState(false)
  if (!thumb || failed) return null
  const srcSet = thumb.local ? optimizedSrcSet(thumb.url, [96, 128, 256]) : ""
  return (
    <span className={`relative block h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-[#f1f2f4] sm:h-24 sm:w-24 ${className}`} data-post-thumb={thumb.kind}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumb.local ? optimizedImageUrl(thumb.url, 96) : thumb.url}
        srcSet={srcSet || undefined}
        sizes={srcSet ? "(min-width: 640px) 96px, 72px" : undefined}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy={thumb.local ? undefined : "no-referrer"}
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
      {thumb.kind === "video" ? (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
          </span>
        </span>
      ) : thumb.kind === "gif" ? (
        <span className="absolute bottom-1 left-1 rounded-[5px] bg-black/55 px-1 text-[10px] font-semibold leading-[15px] text-white" aria-hidden>
          GIF
        </span>
      ) : null}
    </span>
  )
}

/** Everything a post carries, as the opened post draws it. */
export function PostMediaGrid({ media, communityId, postId }: { media: PostMedia[]; communityId: string; postId: string }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!media.length) return null
  const items = viewerItems(media)
  const links = media.filter((m): m is Extract<PostMedia, { type: "link" }> => m.type === "link")
  const files = media.filter((m): m is Extract<PostMedia, { type: "file" }> => m.type === "file")
  return (
    <div className="mt-3 space-y-2.5" data-post-media="">
      {items.length === 1 ? (
        <Tile item={items[0]} single onOpen={() => setOpen(0)} />
      ) : items.length > 1 ? (
        <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:gap-2" data-post-media-grid="">
          {items.map((item, i) => (
            <Tile key={i} item={item} onOpen={() => setOpen(i)} />
          ))}
        </div>
      ) : null}
      {links.map((l) => (
        <LinkCard key={l.url} url={l.url} title={l.title ?? null} image={l.image ?? null} />
      ))}
      {files.map((f) => (
        <a
          key={f.assetId}
          href={`${apiBase(communityId)}/posts/${postId}/files/${f.assetId}`}
          className="flex min-h-12 max-w-[520px] items-center gap-3 rounded-xl border border-[#e8e9ec] px-3 py-2 transition-colors hover:bg-[#f8f9fa]"
          data-post-file=""
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f1f2f4] text-[#4b5563]">
            <FileText className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{f.name}</span>
            {f.size ? <span className="block text-[12.5px] text-[#6b7280]">{fileSizeLabel(f.size)}</span> : null}
          </span>
          <Download className="h-[18px] w-[18px] shrink-0 text-[#6b7280]" strokeWidth={1.75} aria-label="Download" />
        </a>
      ))}
      {open !== null ? <Lightbox items={items} start={open} communityId={communityId} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

function ratioOf(item: ViewerItem): number {
  const w = "w" in item ? item.w : undefined
  const h = "h" in item ? item.h : undefined
  if (item.kind === "embed") return 16 / 9
  if (w && h) return Math.min(Math.max(w / h, 0.75), 1.78)
  return item.kind === "video" ? 16 / 9 : 4 / 3
}

function Tile({ item, single = false, onOpen }: { item: ViewerItem; single?: boolean; onOpen: () => void }) {
  const picture = item.kind === "image" ? item.url : item.kind === "gif" ? item.url : item.kind === "video" ? item.poster : item.thumb
  const local = item.kind === "image" || item.kind === "video"
  const display = single ? 360 : 148
  const srcSet = picture && local ? optimizedSrcSet(picture, single ? [384, 640, 750] : [256, 384]) : ""
  const label = item.kind === "image" ? "Open picture" : item.kind === "gif" ? "Open GIF" : "Play video"
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      data-media-tile={item.kind}
      className={`group/tile relative block overflow-hidden rounded-xl bg-[#eef0f2] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 ${
        single ? "w-full max-w-[min(360px,82%)]" : "aspect-square w-full sm:h-[148px] sm:w-[148px]"
      } ${item.kind === "video" || item.kind === "embed" ? "cursor-pointer" : "cursor-zoom-in"}`}
      style={single ? { aspectRatio: String(ratioOf(item)) } : undefined}
    >
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={local ? optimizedImageUrl(picture, display) : picture}
          srcSet={srcSet || undefined}
          sizes={srcSet ? (single ? "(min-width: 640px) 360px, 100vw" : "(min-width: 640px) 148px, 33vw") : undefined}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy={local ? undefined : "no-referrer"}
          className="absolute inset-0 h-full w-full object-cover transition-[scale] duration-300 ease-out group-hover/tile:scale-[1.02] motion-reduce:transition-none"
        />
      ) : (
        <span className="absolute inset-0 bg-[#1f2230]" aria-hidden />
      )}
      {item.kind === "video" || item.kind === "embed" ? (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className={`flex items-center justify-center rounded-full bg-black/55 text-white ${single ? "h-14 w-14" : "h-10 w-10"}`}>
            <Play className={`ml-0.5 fill-current ${single ? "h-6 w-6" : "h-4 w-4"}`} />
          </span>
        </span>
      ) : item.kind === "gif" ? (
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 text-[11px] font-semibold leading-[18px] text-white" aria-hidden>
          GIF
        </span>
      ) : null}
    </button>
  )
}

export function LinkCard({ url, title, image, onRemove }: { url: string; title: string | null; image: string | null; onRemove?: () => void }) {
  return (
    <div className="relative max-w-[560px]">
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
