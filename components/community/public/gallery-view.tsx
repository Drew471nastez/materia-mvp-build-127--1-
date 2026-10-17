"use client"

/**
 * THE ABOUT PAGE'S MEDIA: one large picture or video, and under it a strip
 * of thumbnails to choose another.
 *
 * ROUND 11: IT MOVES LIKE THE PRODUCT PAGE'S GALLERY, BECAUSE IT IS ITS
 * ENGINE. The large frame is the product gallery's own Swiper strip
 * (components/product/media-swiper: MediaSwiper and useMediaSwiper,
 * imported, not copied): on a phone the picture is attached to the finger
 * from the first pixel, a flick carries its speed into the settle, the ends
 * give a little and spring back; a mouse drags it the same way. On a
 * computer two arrows sit over it, like the product page's, shown while the
 * pointer is on the frame and hidden at the end they cannot go past. A
 * thumbnail next door slides; one further along cuts (the engine's rule), so
 * a jump never smears the pictures in between.
 *
 * WHY NOT <ProductGallery> ITSELF. It takes a product's media (picture
 * addresses, one video file, YouTube addresses) and plays a file it can load
 * at once. This gallery's uploaded videos are only addressable after asking
 * the server for a signed address, and it holds Vimeo too. Both share the
 * piece that makes the gesture feel right; the slides are this page's.
 *
 * VIDEOS: an upload shows its poster and a play button; pressed, it asks the
 * server for a signed address (the cover video and gallery videos of a
 * published community play for anyone) and plays in place in the community
 * player (components/media/video-player.tsx, round 13). An uploaded cover
 * video, the page's hero, loops its first seconds muted over its still
 * while it is on screen; any other upload does under a resting pointer. A YouTube or Vimeo video (round 11) shows its
 * still the same way and, pressed, becomes the service's privacy player
 * (youtube-nocookie, Vimeo with do not track), playing in place. A player
 * is never swiped away by accident (`swiper-no-swiping`), and moving to
 * another picture stops it.
 *
 * Arrow keys move through it when the frame or the strip has focus.
 * Nothing moves on its own: no autoplay, no carousel timer.
 */
import * as React from "react"
import { ChevronLeft, ChevronRight, Play } from "lucide-react"
import { MediaSwiper, SLIDE_SPEED_MS, SwiperSlide, useMediaSwiper, type SwiperClass } from "@/components/product/media-swiper"
import { embedPlayerSrc } from "@/lib/communities/post-media"
import { ActivitySpinner } from "@/components/ui/activity-spinner"
import { VideoPlayer } from "@/components/media/video-player"
import { PreviewLoop, fetchPlayback } from "@/components/video/storelib-video"
import { optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { cn } from "@/lib/utils"
import { galleryStill, type GalleryItemView } from "./gallery"

type Playback = { url: string; expiresAt?: number; poster?: string | null; mime?: string | null; captions?: string | null }

/** How much of an uploaded cover video loops, muted, over its still. */
const COVER_LOOP_SECONDS = 8

const PROVIDER = { youtube: "YouTube", vimeo: "Vimeo" } as const

/*
  THE RIGHT SIZE, FIRST THINGS FIRST (round 12, ask 11). A picture used to be
  asked for at twice 1200px, which the optimizer rounds up to a 3840px file,
  for a frame never wider than about 700px; the strip's at twice 240px for
  a 112px tile. Now the frame offers its widths and says how wide it is drawn
  (the About sheet's column on a computer, the screen on a phone), so a phone
  takes a 828px file and a computer about 1200px; the first picture is asked
  for first (fetchpriority high, eager), the one on screen eager, every
  other one lazy, and the strip's tiles at their own size.
*/
const FRAME_WIDTHS = [640, 750, 828, 1080, 1200, 1920]
const FRAME_SIZES = "(min-width: 1024px) 720px, 100vw"
const frameImage = (src: string) => ({ src: optimizedImageUrl(src, 640), srcSet: optimizedSrcSet(src, FRAME_WIDTHS) || undefined, sizes: FRAME_SIZES })

/*
  A LITTLE DEPTH (round 12, ask 11): the frame and each tile sit on the sheet
  with Storelib's hairline (an inset ring, so it is drawn over the picture's
  edge and never shifts it) and a soft one pixel shadow under them.
*/
const FRAME_DEPTH = "shadow-[0_1px_2px_rgba(16,24,40,0.08),0_10px_28px_-12px_rgba(16,24,40,0.28),0_2px_6px_-2px_rgba(16,24,40,0.12)]"
const HAIRLINE = "pointer-events-none absolute inset-0 z-10 rounded-[inherit] shadow-[inset_0_0_0_1px_rgba(16,24,40,0.08)]"

const keyOf = (g: GalleryItemView) => (g.type === "image" ? `i:${g.url}` : g.type === "video" ? `v:${g.videoId}` : `e:${g.provider}:${g.id}`)

/** The round play button over a still: ink, a hairline of white, its own soft shadow; pressed, a deeper ink (never a jump). */
function PlayMark({ busy }: { busy?: boolean }) {
  return (
    <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#1a1a2e] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45),0_1px_2px_rgba(16,24,40,0.12)] transition-[scale,background-color] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/play:scale-[1.04] group-active/play:scale-[0.98] group-focus-visible/play:ring-4 group-focus-visible/play:ring-white/70 motion-reduce:transition-none">
      {busy ? <ActivitySpinner size={20} label="Loading" className="text-[#1a1a2e]" /> : <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden />}
    </span>
  )
}

/**
 * An arrow over the frame, the product gallery's: white, a hairline and a 1px
 * shadow, pressed by tint alone. From 640px, and never on a touch screen
 * (pointer: coarse), where the picture itself is swiped.
 */
function Arrow({ side, hidden, onPress }: { side: "left" | "right"; hidden: boolean; onPress: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden || undefined}
      aria-label={side === "left" ? "Previous" : "Next"}
      onClick={(e) => {
        e.stopPropagation()
        onPress()
      }}
      data-gallery-arrow={side}
      className={cn(
        "absolute top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#1a1a2e]/[0.06] bg-white/95 text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.14)] outline-none transition-[opacity,background-color] duration-200 hover:bg-white active:bg-[#eef0f2] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 sm:flex [@media(pointer:coarse)]:hidden [-webkit-tap-highlight-color:transparent]",
        side === "left" ? "left-3" : "right-3",
        hidden ? "pointer-events-none !opacity-0" : "opacity-0 group-hover/gal:opacity-100",
      )}
    >
      <Icon className={cn("h-5 w-5", side === "left" ? "-ml-px" : "ml-px")} strokeWidth={2} aria-hidden />
    </button>
  )
}

export function CommunityGallery({ communityId, name, items, cover = null }: { communityId: string; name: string; items: GalleryItemView[]; /** Round 33: the cover picture and where it sits (object-position), applied wherever that picture is in the gallery. */ cover?: { url: string; position: string } | null }) {
  const placed = (url: string | null | undefined): React.CSSProperties | undefined => (cover && url === cover.url ? { objectPosition: cover.position } : undefined)
  const [index, setIndex] = React.useState(0)
  /* The one thing playing: an upload with its signed address, or a linked video's player. */
  const [playing, setPlaying] = React.useState<{ key: string; playback?: Playback } | null>(null)
  const [loading, setLoading] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState<string | null>(null)
  const strip = React.useRef<HTMLDivElement>(null)
  const [swiperRef, carousel] = useMediaSwiper()
  const count = items.length
  const at = Math.min(index, Math.max(0, count - 1))

  /* The engine owns the position, this owns the index (the strip, the arrows and the players read it); each checks before it writes. */
  React.useEffect(() => {
    const swiper = swiperRef.current
    if (!swiper || swiper.destroyed) return
    const from = swiper.activeIndex
    if (from === at) return
    /* Neighbours slide; a jump across the strip cuts. Last→first and first→last still slide. */
    const wrap = count > 1 && ((from === count - 1 && at === 0) || (from === 0 && at === count - 1))
    const dist = Math.abs(at - from)
    swiper.slideTo(at, wrap || dist === 1 ? SLIDE_SPEED_MS : 0)
  }, [at, count, swiperRef])

  /* The chosen thumbnail is brought into the strip's view by the strip's own scroll, never the page's. */
  React.useEffect(() => {
    const el = strip.current
    const thumb = el?.querySelectorAll<HTMLElement>("[data-gallery-thumb]")[at]
    if (!el || !thumb || el.scrollWidth <= el.clientWidth) return
    const left = thumb.offsetLeft - el.offsetLeft
    if (left < el.scrollLeft) el.scrollTo({ left: left - 6, behavior: "smooth" })
    else if (left + thumb.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollTo({ left: left + thumb.offsetWidth - el.clientWidth + 6, behavior: "smooth" })
  }, [at])

  const onSwiper = React.useCallback(
    (s: SwiperClass) => {
      swiperRef.current = s
    },
    [swiperRef],
  )

  /*
    THE SWIPE IS NEVER WAITING FOR REACT (round 13, ask 22: "gallery swipe
    smoother"). Swiper says the index changed as the settle begins; drawing
    the strip, the arrows and the slides' attributes again then is work on
    the main thread in the middle of the glide, and on a slow phone it
    dropped frames there. The index is a transition now, so React does it
    in the gaps between the glide's frames and the picture never stalls.
  */
  const moved = React.useCallback((i: number) => {
    React.startTransition(() => {
      setIndex(i)
      setPlaying(null)
      setFailed(null)
    })
  }, [])

  /*
    THE NEIGHBOURS ARE DECODED AHEAD. A picture that is fetched but not yet
    decoded is decoded on the frame it first shows, which is a hitch under
    the finger. Whenever the index settles, the pictures either side (and
    the one after next, where a flick lands) are decoded in the background,
    when the main thread is idle, so a swipe always lands on a ready one.
  */
  const frame = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const root = frame.current
    if (!root || count < 2) return
    const slides = root.querySelectorAll<HTMLElement>("[data-gallery-slide]")
    const run = () => {
      for (const i of [at + 1, at - 1, at + 2]) {
        const img = slides[i]?.querySelector<HTMLImageElement>("img")
        if (!img) continue
        if (img.loading === "lazy") img.loading = "eager"
        img.decode?.().catch(() => {})
      }
    }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run, { timeout: 600 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(run, 120)
    return () => window.clearTimeout(t)
  }, [at, count])

  if (count === 0) return null

  const choose = (i: number) => {
    if (i < 0 || i >= count || i === at) return
    moved(i)
  }

  const play = async (g: GalleryItemView) => {
    /* The end of a drag is not a press. */
    if (!carousel.clickAllowed() || loading) return
    setFailed(null)
    if (g.type === "embed") return setPlaying({ key: keyOf(g) })
    if (g.type !== "video") return
    setLoading(g.videoId)
    try {
      const res = await fetch(`/api/community/${communityId}/videos/${g.videoId}/play`)
      const data = (await res.json().catch(() => null)) as (Playback & { error?: string }) | null
      if (!res.ok || !data?.url) {
        setFailed(data?.error === "not_ready" ? "This video is still being prepared." : "This video could not be played.")
        return
      }
      setPlaying({ key: keyOf(g), playback: data })
    } catch {
      setFailed("The connection dropped. Try again.")
    } finally {
      setLoading(null)
    }
  }

  const onKey = (e: React.KeyboardEvent, focusThumb: boolean) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    const next = at + (e.key === "ArrowRight" ? 1 : -1)
    if (next < 0 || next >= count) return
    e.preventDefault()
    choose(next)
    if (focusThumb) strip.current?.querySelectorAll<HTMLElement>("[data-gallery-thumb]")[next]?.focus()
  }

  return (
    <div data-community-gallery="" data-gallery-count={count}>
      <div
        ref={frame}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${name}: pictures and videos`}
        tabIndex={count > 1 ? 0 : undefined}
        onKeyDown={(e) => onKey(e, false)}
        className={`group/gal relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-[#eceef1] outline-none ${FRAME_DEPTH} focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2`}
        data-gallery-main={items[at].type}
        data-gallery-index={at}
      >
        <MediaSwiper className="h-full w-full" onSwiper={onSwiper} onIndexChange={moved} enabled={count > 1}>
          {items.map((g, i) => {
            const key = keyOf(g)
            const live = playing?.key === key && i === at
            const still = galleryStill(g)
            /* The picture on screen is fetched now (the first ahead of everything else), the ones either side quietly after it so a swipe never lands on grey, the rest only when they come near. */
            const near = Math.abs(i - at) <= 1
            const priority = i === 0 ? "high" : i === at ? "auto" : "low"
            return (
              <SwiperSlide key={key} className="relative h-full w-full overflow-hidden bg-[#eceef1]" data-gallery-slide={g.type}>
                {g.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img {...frameImage(g.url)} alt={i === 0 ? name : ""} draggable={false} loading={near ? "eager" : "lazy"} fetchPriority={priority} decoding="async" style={placed(g.url)} className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover" />
                ) : live && g.type === "video" && playing?.playback ? (
                  /* The community player (round 13), in the frame's own box: Storelib's controls, never the browser's. */
                  <div className="swiper-no-swiping absolute inset-0 bg-black" data-gallery-video="">
                    <VideoPlayer
                      source={{ url: playing.playback.url, expiresAt: Number(playing.playback.expiresAt) || Date.now() + 3_000_000, mime: playing.playback.mime ?? null, captions: playing.playback.captions ?? null }}
                      poster={playing.playback.poster ?? g.posterUrl ?? null}
                      autoPlay
                      rounded={false}
                      ratio={16 / 9}
                      title={name}
                      renew={async () => {
                        const got = await fetchPlayback(communityId, g.videoId, { fresh: true })
                        return got.ok ? { url: got.playback.url, expiresAt: Number(got.playback.expiresAt), mime: got.playback.mime, captions: got.playback.captions } : null
                      }}
                    />
                  </div>
                ) : live && g.type === "embed" ? (
                  <iframe
                    src={embedPlayerSrc(g)}
                    title={`${PROVIDER[g.provider]} video`}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    className="swiper-no-swiping absolute inset-0 h-full w-full border-0 bg-black"
                    data-gallery-embed={g.provider}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => void play(g)}
                    aria-label={g.type === "embed" ? `Play the ${PROVIDER[g.provider]} video` : "Play video"}
                    tabIndex={i === at ? 0 : -1}
                    className={cn("group/play absolute inset-0 flex items-center justify-center outline-none [-webkit-tap-highlight-color:transparent]", !still && "bg-[#1a1a2e]")}
                    data-gallery-play={g.type === "embed" ? g.provider : "upload"}
                  >
                    {still ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img {...frameImage(still)} alt="" draggable={false} loading={near ? "eager" : "lazy"} fetchPriority={priority} decoding="async" className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover" data-gallery-poster="" />
                    ) : null}
                    {/* An uploaded video moves quietly over its still: the cover video while it is on screen, any other under a resting pointer (round 13). */}
                    {g.type === "video" && i === at ? <PreviewLoop communityId={communityId} videoId={g.videoId} mode={g.cover ? "visible" : "auto"} seconds={g.cover ? COVER_LOOP_SECONDS : undefined} /> : null}
                    <PlayMark busy={g.type === "video" && loading === g.videoId} />
                    {g.type === "embed" ? <span className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/55 px-1.5 py-0.5 text-[11.5px] font-medium text-white/95">{PROVIDER[g.provider]}</span> : null}
                  </button>
                )}
              </SwiperSlide>
            )
          })}
          {/* Inside the swiper's container (Swiper's own slot for controls over the strip), so a drag that starts on an arrow still moves it. */}
          <div slot="container-end" className="contents">
            {count > 1 ? (
              <>
                <Arrow side="left" hidden={at === 0} onPress={() => choose(at - 1)} />
                <Arrow side="right" hidden={at === count - 1} onPress={() => choose(at + 1)} />
              </>
            ) : null}
          </div>
        </MediaSwiper>
        <span aria-hidden className={HAIRLINE} data-gallery-hairline="" />
        {failed ? (
          <p className="absolute inset-x-3 bottom-3 z-30 rounded-lg bg-white/95 px-3 py-2 text-center text-[13px] text-[#b42318]" role="alert">
            {failed}
          </p>
        ) : null}
      </div>

      {count > 1 ? (
        /* Up to six fill the width from 640px; more, or a phone, scroll sideways. Room around each for the ring. */
        <div
          ref={strip}
          role="listbox"
          aria-label="Pictures and videos"
          aria-orientation="horizontal"
          onKeyDown={(e) => onKey(e, true)}
          className={cn("-mx-1.5 mt-2.5 flex gap-2 overflow-x-auto p-1.5 scrollbar-hide", count <= 6 && "sm:grid sm:grid-cols-6 sm:overflow-visible")}
          data-gallery-strip=""
        >
          {items.map((g, i) => {
            const on = i === at
            const src = galleryStill(g)
            return (
              <button
                key={keyOf(g)}
                type="button"
                role="option"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                aria-label={`${g.type === "image" ? "Picture" : "Video"} ${i + 1} of ${count}`}
                onClick={() => choose(i)}
                data-gallery-thumb=""
                className={cn(
                  "relative aspect-[16/9] w-[92px] shrink-0 overflow-hidden rounded-lg bg-[#eceef1] shadow-[0_1px_2px_rgba(16,24,40,0.08)] outline-none transition-[opacity,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/40 [-webkit-tap-highlight-color:transparent]",
                  count <= 6 ? "sm:w-auto" : "sm:w-[112px]",
                  on ? "ring-2 ring-[#1a1a2e] ring-offset-2 ring-offset-[color:var(--sl-surface,#fff)]" : "opacity-75 hover:opacity-100",
                  !src && g.type !== "image" && "bg-[#1a1a2e]",
                )}
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={optimizedImageUrl(src, 112)} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
                <span aria-hidden className={HAIRLINE} />
                {g.type !== "image" ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1a1a2e]/75 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]">
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
