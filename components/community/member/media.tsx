"use client"

/**
 * ===========================================================================
 *  WHAT A POST CARRIES BESIDES ITS WORDS
 * ===========================================================================
 * Two ways of drawing it:
 *
 *   ON THE CARD   one thumbnail on the right (PostThumb): the first picture,
 *                 else a video's still, a video by address's picture, a
 *                 GIF's still, a link's picture. 96px on a computer, 72px on
 *                 a phone, rounded, in a fixed box so nothing moves when it
 *                 arrives.
 *   IN THE POST   (round 8, PostMediaGrid, laid out by post-media.ts
 *                 mediaLayout) one picture or video is drawn large, at the
 *                 post's full width in its own shape, a picture never taller
 *                 than the screen allows; two sit side by side, each half the
 *                 width and the same height, cropped to fill; three or more
 *                 are a grid, the first large across the top and up to three
 *                 under it, the last saying how many more. A picture or GIF
 *                 opens the viewer (lightbox.tsx) at itself; a video
 *                 uploaded to the community plays where it is when it is
 *                 alone and opens the viewer from a pair or a grid; a
 *                 YouTube or Vimeo video is never in the grid but a 16:9
 *                 player of its own under it, the post's full width.
 *                 A YouTube or Vimeo address pasted into the words plays
 *                 under them the same way (post-media.ts withBodyEmbeds, done
 *                 by the caller). Then the link card and the files, each a
 *                 row; a file that is a picture or a video opens the viewer
 *                 too, with its own download button beside it.
 *
 * Pictures come through the image optimizer at the size they are drawn
 * (optimizedImageUrl / optimizedSrcSet), lazily, in boxes of a fixed shape.
 * A link card's picture and a GIF are somebody else's, so they are asked for
 * without a referrer. Files download through the member route, which checks
 * the member and the file; videos play from a short lived address, and only
 * once pressed.
 */
import { useState } from "react"
import { Download, FileText, Film, ImageIcon, Play } from "lucide-react"
import { StorelibVideo } from "@/components/video/storelib-video"
import { optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { cardThumb, fileSizeLabel, mediaKindOf, mediaLayout, viewerItems, type ViewerItem } from "@/lib/communities/post-media"
import type { PostMedia } from "@/lib/communities/types"
import { apiBase } from "./api"
import { EmbedPlayer, Lightbox } from "./lightbox"
import { openMediaViewer } from "./media-viewer"

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

/** How a tile is drawn: its share of the post's width, for the optimizer's sizes. */
type Fit = "single" | "half" | "top" | "third"
const SIZES: Record<Fit, { widths: number[]; sizes: string; display: number }> = {
  single: { widths: [640, 750, 828, 1080, 1200, 1920], sizes: "(min-width: 640px) 720px, 100vw", display: 720 },
  top: { widths: [640, 750, 828, 1080, 1200, 1920], sizes: "(min-width: 640px) 720px, 100vw", display: 720 },
  half: { widths: [384, 640, 750, 828], sizes: "(min-width: 640px) 360px, 50vw", display: 360 },
  third: { widths: [256, 384, 640], sizes: "(min-width: 640px) 240px, 33vw", display: 240 },
}

const isMotion = (item: ViewerItem) => item.kind === "video" || item.kind === "embed" || item.kind === "clip"

/** Everything a post carries, as the opened post draws it. Pass media with the words' videos added (withBodyEmbeds). */
export function PostMediaGrid({ media, communityId, postId }: { media: PostMedia[]; communityId: string; postId: string }) {
  const [open, setOpen] = useState<{ at: number; play: boolean } | null>(null)
  if (!media.length) return null
  /* Pictures, GIFs and uploaded videos make the grid; a YouTube or Vimeo video is its own 16:9 player under it. */
  const all = viewerItems(media)
  const items = all.filter((i) => i.kind !== "embed")
  const embeds = all.filter((i): i is Extract<ViewerItem, { kind: "embed" }> => i.kind === "embed")
  const layout = mediaLayout(items.length)
  const links = media.filter((m): m is Extract<PostMedia, { type: "link" }> => m.type === "link")
  const files = media.filter((m): m is Extract<PostMedia, { type: "file" }> => m.type === "file")
  const fileUrl = (assetId: string) => `${apiBase(communityId)}/posts/${postId}/files/${assetId}`
  /* A file that is a picture or a video opens the viewer, with the post's other such files a swipe away. */
  const viewable = files.flatMap((f) => {
    const kind = mediaKindOf(f.name)
    return kind ? [{ assetId: f.assetId, item: (kind === "image" ? { kind: "image", url: fileUrl(f.assetId), raw: true } : { kind: "clip", url: fileUrl(f.assetId) }) as ViewerItem }] : []
  })
  const tile = (i: number, fit: Fit, shape: string, more = 0) => <Tile key={i} item={items[i]} fit={fit} shape={shape} more={more} onOpen={() => setOpen({ at: i, play: isMotion(items[i]) })} />
  const motionPair = layout.kind === "pair" && items.every(isMotion)

  return (
    <div className="mt-3 space-y-2.5" data-post-media="">
      {layout.kind === "single" ? (
        <Single item={items[0]} communityId={communityId} onOpen={() => setOpen({ at: 0, play: false })} />
      ) : layout.kind === "pair" ? (
        <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-xl" data-post-media-grid="pair">
          {tile(0, "half", motionPair ? "aspect-[4/3]" : "aspect-square")}
          {tile(1, "half", motionPair ? "aspect-[4/3]" : "aspect-square")}
        </div>
      ) : layout.kind === "grid" ? (
        <div className="grid gap-1 overflow-hidden rounded-xl" data-post-media-grid="grid">
          {tile(0, "top", "aspect-[16/9]")}
          <div className={`grid gap-1 ${layout.below === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {Array.from({ length: layout.below }, (_, k) => tile(k + 1, layout.below === 2 ? "half" : "third", layout.below === 2 ? "aspect-[3/2]" : "aspect-square", k === layout.below - 1 ? layout.more : 0))}
          </div>
        </div>
      ) : null}
      {embeds.map((e) => (
        <div key={`${e.provider}:${e.id}`} className="overflow-hidden rounded-xl" data-media-embed="">
          <EmbedPlayer item={e} />
        </div>
      ))}
      {links.map((l) => (
        <LinkCard key={l.url} url={l.url} title={l.title ?? null} image={l.image ?? null} />
      ))}
      {files.map((f) => {
        const kind = mediaKindOf(f.name)
        const at = viewable.findIndex((v) => v.assetId === f.assetId)
        const Icon = kind === "image" ? ImageIcon : kind === "video" ? Film : FileText
        const inner = (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f1f2f4] text-[#4b5563]">
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{f.name}</span>
              {f.size ? <span className="block text-[12.5px] text-[#6b7280]">{fileSizeLabel(f.size)}</span> : null}
            </span>
          </>
        )
        if (at === -1) {
          return (
            <a key={f.assetId} href={fileUrl(f.assetId)} download={f.name} className="flex min-h-12 max-w-[520px] items-center gap-3 rounded-xl border border-[#e8e9ec] px-3 py-2 transition-colors hover:bg-[#f8f9fa]" data-post-file="">
              {inner}
              <Download className="h-[18px] w-[18px] shrink-0 text-[#6b7280]" strokeWidth={1.75} aria-label="Download" />
            </a>
          )
        }
        return (
          <div key={f.assetId} className="flex min-h-12 max-w-[520px] items-center rounded-xl border border-[#e8e9ec] transition-colors hover:bg-[#f8f9fa]" data-post-file={kind ?? ""}>
            <button
              type="button"
              onClick={() => openMediaViewer(viewable.map((v) => v.item), at, { communityId, autoplay: kind === "video" })}
              className="flex min-h-12 min-w-0 flex-1 cursor-zoom-in items-center gap-3 rounded-l-xl px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a1a2e]/20"
              aria-label={`Open ${f.name}`}
              data-post-file-open=""
            >
              {inner}
            </button>
            <a href={fileUrl(f.assetId)} download={f.name} aria-label={`Download ${f.name}`} className="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#6b7280] transition-colors hover:bg-[#eef0f2] hover:text-[#1a1a2e]" data-no-viewer="">
              <Download className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
            </a>
          </div>
        )
      })}
      {open !== null ? <Lightbox items={items} start={open.at} communityId={communityId} autoplay={open.play} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

/** A picture's shape, kept within reason: a panorama no flatter than 2.4:1, a portrait no taller than 1:2. */
function ratioOf(item: ViewerItem): number {
  if (item.kind === "embed" || item.kind === "clip") return 16 / 9
  const w = "w" in item ? item.w : undefined
  const h = "h" in item ? item.h : undefined
  if (w && h) return Math.min(Math.max(w / h, 0.5), 2.4)
  return item.kind === "video" ? 16 / 9 : 4 / 3
}

/** One thing alone: large, at the post's full width. */
function Single({ item, communityId, onOpen }: { item: ViewerItem; communityId: string; onOpen: () => void }) {
  if (item.kind === "video") {
    return (
      <div className="overflow-hidden rounded-xl bg-black [&_[data-storelib-video]]:rounded-none" data-media-tile="video" data-post-media-grid="single">
        <StorelibVideo communityId={communityId} videoId={item.videoId} poster={item.poster} />
      </div>
    )
  }
  return (
    <div data-post-media-grid="single">
      <Tile item={item} fit="single" shape="" onOpen={onOpen} />
    </div>
  )
}

function Tile({ item, fit, shape, more = 0, onOpen }: { item: ViewerItem; fit: Fit; shape: string; more?: number; onOpen: () => void }) {
  const picture = item.kind === "image" ? item.url : item.kind === "gif" ? item.url : item.kind === "video" ? item.poster : item.kind === "embed" ? item.thumb : item.poster
  const local = (item.kind === "image" && !item.raw) || item.kind === "video"
  const size = SIZES[fit]
  const srcSet = picture && local ? optimizedSrcSet(picture, size.widths) : ""
  const single = fit === "single"
  const label = more ? `Open, and ${more} more` : item.kind === "image" ? "Open picture" : item.kind === "gif" ? "Open GIF" : "Play video"
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      data-media-tile={item.kind}
      className={`group/tile relative block w-full overflow-hidden bg-[#eef0f2] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a1a2e]/25 ${
        single ? "max-h-[min(560px,72vh)] rounded-xl" : shape
      } ${isMotion(item) ? "cursor-pointer" : "cursor-zoom-in"}`}
      style={single ? { aspectRatio: String(ratioOf(item)) } : undefined}
    >
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={local ? optimizedImageUrl(picture, size.display) : picture}
          srcSet={srcSet || undefined}
          sizes={srcSet ? size.sizes : undefined}
          width={"w" in item ? item.w : undefined}
          height={"h" in item ? item.h : undefined}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy={local ? undefined : "no-referrer"}
          className={`absolute inset-0 h-full w-full transition-[scale] duration-300 ease-out group-hover/tile:scale-[1.015] motion-reduce:transition-none ${single ? "object-contain" : "object-cover"}`}
        />
      ) : (
        <span className="absolute inset-0 bg-[#1f2230]" aria-hidden />
      )}
      {more ? (
        <span className="absolute inset-0 flex items-center justify-center bg-[#0f1115]/45 text-[22px] font-semibold tabular-nums text-white" aria-hidden data-media-more="">
          +{more}
        </span>
      ) : isMotion(item) ? (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className={`flex items-center justify-center rounded-full bg-black/55 text-white ${fit === "third" ? "h-10 w-10" : "h-12 w-12"}`}>
            <Play className={`ml-0.5 fill-current ${fit === "third" ? "h-4 w-4" : "h-5 w-5"}`} />
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
