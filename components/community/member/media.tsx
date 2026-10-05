"use client"

/**
 * ===========================================================================
 *  WHAT A POST CARRIES BESIDES ITS WORDS
 * ===========================================================================
 * Two ways of drawing it:
 *
 *   ON THE CARD   from 640px one thumbnail on the right (PostThumb): the
 *                 first picture, else a video's still, a video by address's
 *                 picture, a GIF's still, a link's picture. 96px, rounded,
 *                 in a fixed box so nothing moves when it arrives. On a
 *                 phone (round 9) the pictures go under the words instead,
 *                 the row's full width (CardMedia).
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
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Play } from "lucide-react"
import { CommunityFileAttachment, CommunityFileAttachmentSplit } from "./community-file-attachment"
import { StorelibVideo } from "@/components/video/storelib-video"
import { optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { MAX_COMMENT_EMBEDS, bodyEmbeds, cardPictures, cardThumb, fileSizeLabel, mediaKindOf, mediaLayout, viewerItems, type CardPicture, type ViewerItem } from "@/lib/communities/post-media"
import type { PostMedia } from "@/lib/communities/types"
import { apiBase } from "./api"
import { EmbedPlayer, EmbedPoster, Lightbox } from "./lightbox"
import { localPicture } from "./media-upload"
import { openMediaViewer } from "./media-viewer"

/**
 * ===========================================================================
 *  PICTURES THAT ARRIVE SOFTLY, AND NEVER OUTSHINE THE PAGE (round 13)
 * ===========================================================================
 * NEVER AN EMPTY BOX. A picture on our storage is first a 32px copy from the
 * image optimizer (a few hundred bytes, there almost at once even on a slow
 * phone network), stretched and blurred under where the picture will be, so
 * the box shows the picture's own colours; the picture then fades in over
 * it (250ms, opacity only). One already in the browser's cache is drawn at
 * once, with no fade, so a card drawn again (another space, back to the
 * feed) never blinks. Somebody else's picture (a GIF's still, a link's) has
 * the quiet grey box and the same fade.
 *
 * STANDARD DYNAMIC RANGE. An iPhone photo can carry an HDR gain map, which
 * Safari and Chrome show brighter than the white page around it, so the
 * page looked dim next to it (72.webp). Every community picture is drawn
 * with `dynamic-range-limit: standard` (SDR), and the browser's compression
 * re-encodes a photo to SDR before it is sent (media-compress.ts).
 *
 * A HAIRLINE AND A LITTLE DEPTH around a card's pictures: an inset 1px line
 * of 6% ink over the picture's edge (a white photo still has an edge) and a
 * 1px soft shadow under the box.
 */
export const SDR = "[dynamic-range-limit:standard]"
/** The inset hairline over a picture's edge (its parent is the rounded, clipped box). */
export const PICTURE_EDGE = "pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/[0.06]"
const FADE_MS = 250

/** The placeholder's copy: the optimizer's smallest file, for our own pictures only. */
export function blurSrc(url: string, local: boolean): string | null {
  if (!local || !url || /^(data|blob):/.test(url)) return null
  const tiny = optimizedImageUrl(url, 16)
  return tiny === url ? null : tiny
}

/**
 * A picture in a box of known shape: the blurred placeholder (or the grey), then the picture fading in when it has loaded,
 * unless it was already in the cache when it was drawn.
 */
export function SoftImg({
  src,
  srcSet,
  sizes,
  blur,
  alt = "",
  width,
  height,
  referrerPolicy,
  className = "",
  onError,
  eager = false,
}: {
  src: string
  srcSet?: string
  sizes?: string
  blur?: string | null
  alt?: string
  width?: number
  height?: number
  referrerPolicy?: React.HTMLAttributeReferrerPolicy
  className?: string
  onError?: () => void
  eager?: boolean
}) {
  const ref = useRef<HTMLImageElement>(null)
  /* "cached": drawn at once; "wait": transparent until it loads; "in": fading in. */
  const [state, setState] = useState<"cached" | "wait" | "in">("wait")
  useLayoutEffect(() => {
    const el = ref.current
    if (el?.complete && el.naturalWidth > 0) setState("cached")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const shown = state !== "wait"
  return (
    <>
      {blur && state !== "cached" ? (
        <span aria-hidden className={`absolute inset-0 scale-110 bg-cover bg-center blur-[10px] ${SDR}`} style={{ backgroundImage: `url("${blur}")` }} data-soft-blur="" />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        srcSet={srcSet || undefined}
        sizes={srcSet ? sizes : undefined}
        width={width}
        height={height}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy={referrerPolicy}
        onLoad={() => setState((s) => (s === "wait" ? "in" : s))}
        onError={onError}
        className={`${className} ${SDR} ${state === "cached" ? "" : "transition-opacity ease-out motion-reduce:transition-none"} ${shown ? "opacity-100" : "opacity-0"}`}
        style={state === "in" ? { transitionDuration: `${FADE_MS}ms` } : undefined}
        data-soft-img={state}
      />
    </>
  )
}

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

/**
 * ===========================================================================
 *  A GIF MOVES WHILE IT CAN BE SEEN (round 12)
 * ===========================================================================
 * In the feed, in an opened post and under a comment a GIF plays on its own,
 * silent and looping (a GIF is both), but only while it is on screen (or
 * about to be: 120px of margin): off screen it rests on its still, so a long
 * feed of GIFs costs nothing while it is scrolled past. One shared
 * IntersectionObserver for every GIF on the page. With reduced motion the
 * still stays. The moving picture replaces the still in the same <img>, so
 * the box never changes and the still shows until the GIF has loaded.
 */
const ON_SCREEN = new Map<Element, (on: boolean) => void>()
let screenWatch: IntersectionObserver | null = null
function watchOnScreen(el: Element, cb: (on: boolean) => void): () => void {
  if (typeof IntersectionObserver === "undefined") {
    cb(true)
    return () => {}
  }
  screenWatch ??= new IntersectionObserver((entries) => {
    for (const e of entries) ON_SCREEN.get(e.target)?.(e.isIntersecting)
  }, { rootMargin: "120px 0px" })
  ON_SCREEN.set(el, cb)
  screenWatch.observe(el)
  return () => {
    ON_SCREEN.delete(el)
    screenWatch?.unobserve(el)
  }
}

export function GifImg({ still, motion, className = "", alt = "", width, height }: { still: string; motion: string; className?: string; alt?: string; width?: number; height?: number }) {
  const ref = useRef<HTMLImageElement>(null)
  const [moving, setMoving] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    return watchOnScreen(el, setMoving)
  }, [])
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={moving ? motion : still} alt={alt} width={width} height={height} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={`${className} ${SDR}`} data-gif-state={moving ? "playing" : "paused"} />
  )
}

/** The card's one thumbnail, or nothing. */
export function PostThumb({ media, className = "" }: { media: PostMedia[]; className?: string }) {
  const thumb = cardThumb(media)
  const [failed, setFailed] = useState(false)
  if (!thumb || failed) return null
  const srcSet = thumb.local ? optimizedSrcSet(thumb.url, [96, 128, 256]) : ""
  return (
    <span className={`relative block h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-[#f1f2f4] shadow-[0_1px_2px_rgba(16,24,40,0.06)] sm:h-24 sm:w-24 ${className}`} data-post-thumb={thumb.kind}>
      {thumb.kind === "gif" && thumb.motion ? (
        <GifImg still={thumb.url} motion={thumb.motion} className="h-full w-full object-cover" />
      ) : (
        <SoftImg
          src={thumb.local ? optimizedImageUrl(thumb.url, 96) : thumb.url}
          srcSet={srcSet}
          sizes="(min-width: 640px) 96px, 72px"
          blur={blurSrc(thumb.url, thumb.local)}
          referrerPolicy={thumb.local ? undefined : "no-referrer"}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      <span aria-hidden className={PICTURE_EDGE} />
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

/**
 * ON A PHONE THE PICTURES GO UNDER THE WORDS (round 9, after Skool's phone
 * feed, image 60): the row's full width rather than a thumbnail beside the
 * title, rounded 12px, in boxes whose shape is known before anything loads.
 * One picture keeps its own shape between square and 2:1 (16:9 when the
 * shape is not known), cropped to fill. Lazy, through the optimizer at the
 * width they are drawn. The whole card opens the post, so a press here does
 * too; nothing in it is a control of its own.
 *
 * TWO OR MORE ARE A GRID, ON A PHONE AND ON A COMPUTER (round 12, round 13):
 * never a thumbnail on the right. The grid is one box of a fixed shape (2:1
 * on a phone, 8:3 across a computer's card, so a card with pictures is the
 * same height whatever it carries): two side by side; three or more the
 * first large on the left and two stacked on the right, the last saying how
 * many more. A GIF plays while it is on screen.
 */
export function CardMedia({ media, className = "" }: { media: PostMedia[]; className?: string }) {
  const pics = cardPictures(media)
  if (!pics.length) return null
  const box = "relative overflow-hidden rounded-xl bg-[#f1f2f4] shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
  if (pics.length === 1) {
    const p = pics[0]
    const ratio = p.w && p.h ? Math.min(Math.max(p.w / p.h, 1), 2) : 16 / 9
    return (
      <div className={`${box} ${className}`} style={{ aspectRatio: String(ratio) }} data-card-media="single">
        <CardPictureImg p={p} widths={[390, 640, 828, 1080]} sizes="(min-width: 640px) 600px, 100vw" display={640} />
        <span aria-hidden className={PICTURE_EDGE} />
      </div>
    )
  }
  const three = pics.length >= 3
  const more = pics.length - (three ? 3 : 2)
  const shown = pics.slice(0, three ? 3 : 2)
  return (
    <div className={`${box} grid aspect-[2/1] grid-cols-2 gap-[3px] bg-white sm:aspect-[8/3] ${three ? "grid-rows-2" : ""} ${className}`} data-card-media={three ? "grid" : "pair"}>
      {shown.map((p, i) => (
        <div key={i} className={`relative min-h-0 overflow-hidden bg-[#f1f2f4] ${three && i === 0 ? "row-span-2" : ""}`} data-card-media-tile={p.kind}>
          <CardPictureImg p={p} widths={three && i > 0 ? [256, 384, 640] : [256, 384, 640, 828]} sizes={three && i > 0 ? "(min-width: 640px) 300px, 50vw" : "(min-width: 640px) 360px, 50vw"} display={three && i > 0 ? 300 : 384} />
          {i === shown.length - 1 && more > 0 ? (
            <span className="absolute inset-0 flex items-center justify-center bg-[#0f1115]/45 text-[20px] font-semibold tabular-nums text-white" aria-label={`${more} more`} data-card-media-more="">
              +{more}
            </span>
          ) : null}
        </div>
      ))}
      <span aria-hidden className={PICTURE_EDGE} />
    </div>
  )
}

function CardPictureImg({ p, widths, sizes, display }: { p: CardPicture; widths: number[]; sizes: string; display: number }) {
  const [failed, setFailed] = useState(false)
  const srcSet = p.local ? optimizedSrcSet(p.url, widths) : ""
  return (
    <>
      {failed ? null : p.kind === "gif" && p.motion ? (
        <GifImg still={p.url} motion={p.motion} width={p.w} height={p.h} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <SoftImg
          src={p.local ? optimizedImageUrl(p.url, display) : p.url}
          srcSet={srcSet}
          sizes={sizes}
          blur={blurSrc(p.url, p.local)}
          referrerPolicy={p.local ? undefined : "no-referrer"}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      {p.kind === "video" ? (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </span>
      ) : p.kind === "gif" ? (
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 text-[11px] font-semibold leading-[18px] text-white" aria-hidden>
          GIF
        </span>
      ) : null}
    </>
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
  const rootRef = useRef<HTMLDivElement>(null)
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
  const tile = (i: number, fit: Fit, shape: string, more = 0) => <Tile key={i} index={i} item={items[i]} fit={fit} shape={shape} more={more} onOpen={() => setOpen({ at: i, play: isMotion(items[i]) })} />
  const motionPair = layout.kind === "pair" && items.every(isMotion)

  return (
    <div ref={rootRef} className="mt-3 space-y-2.5" data-post-media="">
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
        const href = fileUrl(f.assetId)
        if (at === -1) {
          return <CommunityFileAttachment key={f.assetId} apiPath={href} fileName={f.name} size={f.size} />
        }
        return (
          <CommunityFileAttachmentSplit
            key={f.assetId}
            apiPath={href}
            fileName={f.name}
            size={f.size}
            openLabel={`Open ${f.name}`}
            onOpen={() => openMediaViewer(viewable.map((v) => v.item), at, { communityId, autoplay: kind === "video" })}
          />
        )
      })}
      {open !== null ? (
        <Lightbox
          items={items}
          start={open.at}
          communityId={communityId}
          autoplay={open.play}
          onClose={() => setOpen(null)}
          /* The tile each one is drawn in, so the viewer grows out of it and goes back into it. */
          originOf={(i) => rootRef.current?.querySelector<HTMLElement>(`[data-media-index="${i}"]`) ?? null}
        />
      ) : null}
    </div>
  )
}

/**
 * ===========================================================================
 *  WHAT A COMMENT CARRIES (round 11)
 * ===========================================================================
 * Under the comment's words: its pictures and its GIF as small tiles in a
 * row (one height, each in its own shape within reason, a hairline and a
 * 1px shadow), then its files as compact rows. A tile opens the viewer at
 * itself and grows out of it; a file that is a picture or a video opens the
 * viewer too, any other file downloads through the comment's own member
 * route (/api/community/<id>/comments/<commentId>/files/<assetId>).
 * A picture just sent from this browser is drawn from the file the member
 * picked (media-upload.ts localPicture), so the tile is full from its first
 * frame and stays the same when the server's copy replaces the stand in.
 * While the comment is still on its way (`sending`) nothing opens.
 * Round 12: a video by link (YouTube, Vimeo, Loom) is a small 16:9 player
 * under the tiles, its poster first, played where it is; a GIF plays while
 * on screen. Comments no longer take files; one kept from before still
 * shows here and downloads.
 */
export const COMMENT_TILE_H = 96

export function CommentMedia({ media, text = "", communityId, commentId, sending = false }: { media: PostMedia[]; text?: string; communityId: string; commentId: string; sending?: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  /* Round 12: a video by link plays under the words, the one the comment carries or the first named in its words. */
  const embeds = [...media.filter((m): m is Extract<PostMedia, { type: "embed" }> => m.type === "embed"), ...bodyEmbeds(text, media)].slice(0, MAX_COMMENT_EMBEDS)
  if (!media.length && !embeds.length) return null
  const pictures = media.filter((m): m is Extract<PostMedia, { type: "image" | "gif" }> => m.type === "image" || m.type === "gif")
  const items: ViewerItem[] = pictures.map((m) => (m.type === "image" ? { kind: "image", url: m.url, w: m.w, h: m.h } : { kind: "gif", url: m.url, still: m.still, w: m.w, h: m.h }))
  const files = media.filter((m): m is Extract<PostMedia, { type: "file" }> => m.type === "file")
  const fileUrl = (assetId: string) => `${apiBase(communityId)}/comments/${commentId}/files/${assetId}`
  const viewable = files.flatMap((f) => {
    const kind = mediaKindOf(f.name)
    return kind ? [{ assetId: f.assetId, item: (kind === "image" ? { kind: "image", url: fileUrl(f.assetId), raw: true } : { kind: "clip", url: fileUrl(f.assetId) }) as ViewerItem }] : []
  })
  return (
    <div ref={rootRef} className="mt-1.5 space-y-1.5" data-comment-media="">
      {pictures.length ? (
        <div className="flex flex-wrap gap-1.5" data-comment-pictures="">
          {pictures.map((m, i) => {
            const ratio = m.w && m.h ? Math.min(Math.max(m.w / m.h, 0.75), 1.8) : m.type === "gif" ? 4 / 3 : 1
            const local = m.type === "image" ? localPicture(m.url) : null
            const src = local ?? (m.type === "image" ? optimizedImageUrl(m.url, 384) : m.url)
            return (
              <button
                key={`${m.url}:${i}`}
                type="button"
                onClick={() => !sending && setOpen(i)}
                aria-label={m.type === "gif" ? "Open GIF" : "Open picture"}
                data-media-index={i}
                data-comment-tile={m.type}
                className="group/ctile relative block shrink-0 overflow-hidden rounded-[10px] border border-[#e6e8eb] bg-[#eef0f2] shadow-[0_1px_1px_rgba(16,24,40,0.05)] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 [-webkit-tap-highlight-color:transparent]"
                style={{ height: COMMENT_TILE_H, width: Math.round(COMMENT_TILE_H * ratio) }}
              >
                {m.type === "gif" ? (
                  <GifImg still={m.still} motion={m.url} width={m.w} height={m.h} className="absolute inset-0 h-full w-full object-cover transition-[opacity] duration-150 group-active/ctile:opacity-85 motion-reduce:transition-none" />
                ) : (
                  <SoftImg
                    src={src}
                    width={m.w}
                    height={m.h}
                    blur={local ? null : blurSrc(m.url, true)}
                    className="absolute inset-0 h-full w-full object-cover group-active/ctile:opacity-85"
                  />
                )}
                {m.type === "gif" ? (
                  <span className="absolute bottom-1 left-1 rounded-[5px] bg-black/55 px-1 text-[10px] font-semibold leading-4 text-white" aria-hidden>
                    GIF
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
      {embeds.map((e) => (
        <div key={`${e.provider}:${e.id}`} className="max-w-[420px] overflow-hidden rounded-[10px] border border-[#e6e8eb] shadow-[0_1px_1px_rgba(16,24,40,0.05)]" data-comment-embed={e.provider}>
          {sending ? (
            <EmbedPoster item={{ kind: "embed", provider: e.provider, id: e.id, hash: e.hash, thumb: e.thumb, title: e.title }} />
          ) : (
            <EmbedPlayer item={{ kind: "embed", provider: e.provider, id: e.id, hash: e.hash, thumb: e.thumb, title: e.title }} posterWidth={420} />
          )}
        </div>
      ))}
      {files.map((f) => {
        const kind = mediaKindOf(f.name)
        const at = viewable.findIndex((v) => v.assetId === f.assetId)
        const href = fileUrl(f.assetId)
        if (sending) {
          return (
            <div key={f.assetId} className="flex min-h-11 max-w-[360px] items-center gap-2.5 rounded-[10px] border border-[#e6e8eb] bg-white px-2.5 py-1.5 opacity-70" data-comment-file="">
              <span className="truncate text-[13.5px] font-medium text-[#1a1a2e]">{f.name}</span>
            </div>
          )
        }
        if (at === -1) {
          return <CommunityFileAttachment key={f.assetId} apiPath={href} fileName={f.name} size={f.size} compact className="max-w-[360px]" />
        }
        return (
          <CommunityFileAttachmentSplit
            key={f.assetId}
            apiPath={href}
            fileName={f.name}
            size={f.size}
            openLabel={`Open ${f.name}`}
            onOpen={() => openMediaViewer(viewable.map((v) => v.item), at, { communityId, autoplay: kind === "video" })}
          />
        )
      })}
      {open !== null ? (
        <Lightbox
          items={items}
          start={open}
          communityId={communityId}
          onClose={() => setOpen(null)}
          originOf={(i) => rootRef.current?.querySelector<HTMLElement>(`[data-media-index="${i}"]`) ?? null}
        />
      ) : null}
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
        <StorelibVideo communityId={communityId} videoId={item.videoId} poster={item.poster} width={item.w} height={item.h} />
      </div>
    )
  }
  return (
    <div data-post-media-grid="single">
      <Tile index={0} item={item} fit="single" shape="" onOpen={onOpen} />
    </div>
  )
}

function Tile({ index, item, fit, shape, more = 0, onOpen }: { index: number; item: ViewerItem; fit: Fit; shape: string; more?: number; onOpen: () => void }) {
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
      data-media-index={index}
      className={`group/tile relative block w-full overflow-hidden bg-[#eef0f2] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a1a2e]/25 ${
        single ? "max-h-[min(560px,72vh)] rounded-xl" : shape
      } ${isMotion(item) ? "cursor-pointer" : "cursor-zoom-in"}`}
      style={single ? { aspectRatio: String(ratioOf(item)) } : undefined}
    >
      {item.kind === "gif" ? (
        <GifImg still={item.still} motion={item.url} width={item.w} height={item.h} className={`absolute inset-0 h-full w-full transition-[scale] duration-300 ease-out group-hover/tile:scale-[1.015] motion-reduce:transition-none ${single ? "object-contain" : "object-cover"}`} />
      ) : picture ? (
        <SoftImg
          src={local ? optimizedImageUrl(picture, size.display) : picture}
          srcSet={srcSet}
          sizes={size.sizes}
          blur={blurSrc(picture, local)}
          width={"w" in item ? item.w : undefined}
          height={"h" in item ? item.h : undefined}
          referrerPolicy={local ? undefined : "no-referrer"}
          className={`absolute inset-0 h-full w-full transition-[scale,opacity] duration-300 ease-out group-hover/tile:scale-[1.015] motion-reduce:transition-none ${single ? "object-contain" : "object-cover"}`}
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
          <img src={image} alt="" referrerPolicy="no-referrer" loading="lazy" className={`w-[88px] shrink-0 bg-[#f1f2f4] object-cover sm:w-[112px] ${SDR}`} onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
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
