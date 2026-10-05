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
 * published community play for anyone) and plays in place with the
 * browser's own controls. A YouTube or Vimeo video (round 11) shows its
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
import { MediaSwiper, SwiperSlide, useMediaSwiper, type SwiperClass } from "@/components/product/media-swiper"
import { embedPlayerSrc } from "@/lib/communities/post-media"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { cn } from "@/lib/utils"
import { galleryStill, type GalleryItemView } from "./gallery"

type Playback = { url: string; poster?: string | null; mime?: string | null }

const PROVIDER = { youtube: "YouTube", vimeo: "Vimeo" } as const

const keyOf = (g: GalleryItemView) => (g.type === "image" ? `i:${g.url}` : g.type === "video" ? `v:${g.videoId}` : `e:${g.provider}:${g.id}`)

/** The round play button over a still: ink, a hairline of white, its own soft shadow; pressed, a deeper ink (never a jump). */
function PlayMark({ busy }: { busy?: boolean }) {
  return (
    <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#1a1a2e]/80 text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5),inset_0_0_0_1px_rgba(255,255,255,0.14)] transition-[background-color] duration-150 group-hover/play:bg-[#1a1a2e]/90 group-active/play:bg-[#1a1a2e] group-focus-visible/play:ring-4 group-focus-visible/play:ring-white/60">
      {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Play className="ml-1 h-7 w-7 fill-white" aria-hidden />}
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

export function CommunityGallery({ communityId, name, items }: { communityId: string; name: string; items: GalleryItemView[] }) {
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
    carousel.slideToIndex(at, swiperRef.current?.activeIndex ?? at)
  }, [at, carousel, swiperRef])

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

  const moved = React.useCallback((i: number) => {
    setIndex(i)
    setPlaying(null)
    setFailed(null)
  }, [])

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
        role="region"
        aria-roledescription="carousel"
        aria-label={`${name}: pictures and videos`}
        tabIndex={count > 1 ? 0 : undefined}
        onKeyDown={(e) => onKey(e, false)}
        className="group/gal relative aspect-[16/9] w-full overflow-hidden rounded-xl bg-[#eceef1] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 focus-visible:ring-offset-2"
        data-gallery-main={items[at].type}
        data-gallery-index={at}
      >
        <MediaSwiper className="h-full w-full" onSwiper={onSwiper} onIndexChange={moved} enabled={count > 1}>
          {items.map((g, i) => {
            const key = keyOf(g)
            const live = playing?.key === key && i === at
            const still = galleryStill(g)
            /* The picture shown and the ones either side are fetched now; the rest when they come near. */
            const near = Math.abs(i - at) <= 1
            return (
              <SwiperSlide key={key} className="relative h-full w-full overflow-hidden bg-[#eceef1]" data-gallery-slide={g.type}>
                {g.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={optimizedImageUrl(g.url, 1200)} alt={i === 0 ? name : ""} draggable={false} loading={near ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "auto"} decoding="async" className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover" />
                ) : live && g.type === "video" && playing?.playback ? (
                  <video
                    src={playing.playback.url}
                    poster={playing.playback.poster ?? g.posterUrl ?? undefined}
                    controls
                    autoPlay
                    playsInline
                    className="swiper-no-swiping absolute inset-0 h-full w-full bg-black object-contain"
                    data-gallery-video=""
                  />
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
                      <img src={optimizedImageUrl(still, 1200)} alt="" draggable={false} loading={near ? "eager" : "lazy"} decoding="async" className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover" data-gallery-poster="" />
                    ) : null}
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
                  "relative aspect-[16/9] w-[92px] shrink-0 overflow-hidden rounded-lg bg-[#eceef1] outline-none transition-[opacity,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/40 [-webkit-tap-highlight-color:transparent]",
                  count <= 6 ? "sm:w-auto" : "sm:w-[112px]",
                  on ? "ring-2 ring-[#1a1a2e] ring-offset-2 ring-offset-white" : "opacity-75 hover:opacity-100",
                  !src && g.type !== "image" && "bg-[#1a1a2e]",
                )}
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={optimizedImageUrl(src, 240)} alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                ) : null}
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
