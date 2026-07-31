"use client"

import { memo, useState, useCallback, useEffect } from "react"
import Image from "next/image"
import { Heart, Send, BadgeCheck, ChevronLeft } from "lucide-react"
import { SmartLink } from "@/components/smart-link"
import { useLocale } from "@/components/locale-provider"
import { useIsWishlisted, useToggleWishlist } from "@/components/explore/wishlist-context"
import { getProductUrl, getStoreUrl } from "@/lib/url-helpers"
import { CONDITIONS } from "@/lib/marketplace/categories"
import { FollowButton } from "@/components/explore/follow-button"
import { cn } from "@/lib/utils"

const BLUR = "data:image/gif;base64,R0lGODlhAQABAIAAAOfn5wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="

function isYouTubeThumb(u: string) {
  return u.includes("img.youtube.com") || u.includes("i.ytimg.com")
}

/** Ordered, de-duped real photos for the card's horizontal gallery. */
function galleryImages(thumbnail?: string | null, gallery?: string[] | null): string[] {
  const out: string[] = []
  if (thumbnail) out.push(thumbnail)
  if (Array.isArray(gallery)) {
    for (const u of gallery) {
      if (typeof u === "string" && u && !isYouTubeThumb(u) && !out.includes(u)) out.push(u)
    }
  }
  return out.slice(0, 6)
}

function conditionLabel(condition?: string | null): string | null {
  if (!condition) return null
  const key = condition.trim().toLowerCase().replace(/[\s-]+/g, "_")
  return CONDITIONS.find((c) => c.id === key)?.label ?? null
}

export interface MobileListingProduct {
  id: string
  title: string
  slug: string
  price_cents: number
  compare_at_cents?: number | null
  thumbnail_url?: string | null
  gallery_urls?: string[] | null
  size?: string | null
  condition?: string | null
  brand?: string | null
  creator?: {
    user_id?: string | null
    profile?: { display_name?: string | null; avatar_url?: string | null; username?: string | null } | null
  } | null
}

/**
 * Full-screen, TikTok-style listing card for the mobile feed.
 * Image fills the frame; a right-hand action rail and a bottom info overlay
 * float on top. Tapping the card opens the product.
 */
export const MobileListingCard = memo(function MobileListingCard({
  product,
  priority = false,
  active = false,
  near = true,
}: {
  product: MobileListingProduct
  priority?: boolean
  /** True for the currently-visible reel (drives the swipe hint timer). */
  active?: boolean
  /** Current card or an immediate neighbour — mounts the sideways gallery ahead
   *  of time so it never has to appear on a card you're already looking at. */
  near?: boolean
}) {
  const { t, formatPrice } = useLocale()
  const isWishlisted = useIsWishlisted(product.id)
  const toggleWishlist = useToggleWishlist()
  const [imgIndex, setImgIndex] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [nonce, setNonce] = useState(0)

  const images = galleryImages(product.thumbnail_url, product.gallery_urls)

  // Secondary photos mount only on the current card and its immediate
  // neighbours. A window of cards is live at any moment; having every one render
  // its whole gallery up front put dozens of image elements in flight at once,
  // competing for decode with the photo actually on screen. Crucially this is
  // keyed off ADJACENCY, not off becoming active: by the time a card is the one
  // you're looking at, its gallery mounted a swipe ago, off-screen. Nothing is
  // ever added to a card you can see. Once mounted it stays — a card must not
  // shed its photos while it's still in the window.
  const [everNear, setEverNear] = useState(near)
  useEffect(() => {
    if (near && !everNear) setEverNear(true)
  }, [near, everNear])
  const shown = everNear ? images : images.slice(0, 1)

  // Only the card you're on is a real scroller. A scroll container costs a
  // compositing layer, and with a window of cards mounted that was several
  // full-screen layers held for photos nobody can swipe sideways yet.
  const swipeable = active && images.length > 1

  // After ~3s of lingering on the active card (with more than one photo, and
  // still on the first), show a clean minimalist "swipe" nudge once.
  useEffect(() => {
    if (!active || images.length < 2 || imgIndex > 0) {
      setShowHint(false)
      return
    }
    const timer = setTimeout(() => setShowHint(true), 4500)
    return () => clearTimeout(timer)
  }, [active, images.length, imgIndex])
  const creatorName = product.creator?.profile?.display_name || "Storelib"
  const username = product.creator?.profile?.username || ""
  const avatar = product.creator?.profile?.avatar_url || null
  const productUrl = `${getProductUrl(username, product.slug || "")}${(getProductUrl(username, product.slug || "").includes("?") ? "&" : "?")}layout=discover`
  const storeUrl = username ? getStoreUrl(username) : "#"
  const cond = conditionLabel(product.condition)
  // A follow points at the person, so it needs the seller's profile id — the
  // creator row is only how their listings hang off them.
  const sellerId = product.creator?.user_id || null

  const onFollowed = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("follow-toast", { detail: { name: username || creatorName } }),
    )
  }, [username, creatorName])

  const onLike = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setNonce((n) => n + 1)
      window.dispatchEvent(new CustomEvent("wishlist-toast", { detail: { saved: !isWishlisted } }))
      void toggleWishlist(product.id)
    },
    [product.id, isWishlisted, toggleWishlist],
  )

  const onScrollGallery = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const i = Math.round(el.scrollLeft / el.clientWidth)
    setImgIndex((prev) => (prev === i ? prev : i))
  }, [])

  return (
    <div className="no-tap-fade relative h-full w-full overflow-hidden bg-neutral-900">
      {/* Photo settle — the zoom a listing eases out of as it scrolls in. Driven
          entirely from scroll POSITION, never from a timer: by `.reel-photo` in
          globals.css off the scroll timeline where the browser supports it, and
          imperatively by the pager where it doesn't. Nothing is set here, so the
          two can't fight over it. It only ever scales DOWN to 1, never up, so no
          edge can expose a seam. */}
      <div className="reel-photo absolute inset-0">
      {/* Horizontal swipeable gallery — momentum + snap for a smooth carousel */}
      <div
        className="flex h-full w-full snap-x snap-mandatory scrollbar-hide"
        onScroll={onScrollGallery}
        style={{
          overflowX: swipeable ? "auto" : "hidden",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: swipeable ? "touch" : "auto",
          overscrollBehaviorX: "contain",
        }}
      >
        {(shown.length ? shown : [null]).map((src, i) => (
          <SmartLink
            key={i}
            href={productUrl}
            className="relative h-full w-full shrink-0 snap-center"
          >
            {src ? (
              <>
                {/* Blurred fill behind the photo. A listing photo is 3:4 and a
                    phone is far taller, so object-cover had to crop roughly a
                    third of every garment away to fill the screen. Contained,
                    the whole item is visible in its true proportions, and this
                    scaled, blurred copy of the same photo fills what's left —
                    the screen still reads as one wall of colour instead of two
                    black bars. It's the same already-decoded image, so it costs
                    a composite and nothing else. */}
                <Image
                  src={src}
                  alt=""
                  aria-hidden
                  fill
                  sizes="100vw"
                  quality={20}
                  className="scale-125 object-cover blur-2xl brightness-[0.55] saturate-150"
                  priority={priority && i === 0}
                  loading={i === 0 ? "eager" : "lazy"}
                />
              <Image
                src={src}
                alt={product.title}
                fill
                sizes="100vw"
                quality={82}
                className="object-contain"
                placeholder="blur"
                blurDataURL={BLUR}
                priority={priority && i === 0}
                // The lead photo of every mounted card loads eagerly: the pager
                // mounts a small window ahead of you, so by the time a card
                // scrolls in its photo is already decoded. Secondary gallery
                // photos stay lazy — they only matter once you swipe sideways.
                loading={i === 0 ? "eager" : "lazy"}
              />
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-neutral-800 text-5xl">👕</div>
            )}
          </SmartLink>
        ))}
      </div>
      </div>

      {/* The overlay is STATIC and always mounted alongside the photo, so the
          gradient, caption and action rail slide into view WITH the image as a
          single unit — nothing can arrive late on top of it. */}
      {/* Legibility gradients */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

      {/* Swipe hint — clean, minimalist, appears after lingering, then fades */}
      {showHint && images.length > 1 && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2"
          onAnimationEnd={() => setShowHint(false)}
        >
          <div className="swipe-hint flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-2 text-neutral-900 shadow-lg backdrop-blur">
            <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            <span className="text-[12px] font-semibold">{t("mfeed.swipe_photos")}</span>
          </div>
        </div>
      )}

      {/* Photo dots — centered, clear of the caption, in a subtle glass pill so
          they read cleanly over any photo. */}
      {images.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[136px] z-20 flex justify-center">
          <div className="flex items-center gap-[7px] rounded-full bg-black/25 px-2.5 py-1.5 backdrop-blur-sm">
            {images.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-[6px] rounded-full transition-all duration-300 ease-out",
                  i === imgIndex ? "w-5 bg-white" : "w-[6px] bg-white/55",
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* Right action rail — follow, save, share (no comments). Icons sit in
          soft translucent circles so they read cleanly over any photo. */}
      <div className="absolute bottom-24 right-3 flex flex-col items-center gap-4 text-white">
        {/* Just the seller's avatar, linking to their store. The red "+" badge
            that used to hang off it was pure TikTok costume — the follow action
            lives with their name in the caption now, where it reads as a
            labelled control instead of a mystery glyph. */}
        <SmartLink href={storeUrl} onClick={(e) => e.stopPropagation()} className="relative mb-1">
          <span className="block h-11 w-11 overflow-hidden rounded-full border-2 border-white/90 bg-neutral-700 shadow-sm">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt={creatorName} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-base font-semibold">
                {creatorName.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
        </SmartLink>

        <button type="button" onClick={onLike} aria-pressed={isWishlisted} aria-label={t("product.add_to_wishlist")} className="flex flex-col items-center gap-1">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/25 backdrop-blur-sm transition-transform active:scale-90">
            <Heart key={nonce} className={cn("h-[22px] w-[22px] transition-colors duration-[750ms] ease-out", nonce > 0 && "motion-safe:heart-pop", isWishlisted ? "fill-rose-500 text-rose-500" : "text-white")} />
          </span>
          <span className="text-[11px] font-medium drop-shadow">{t("mfeed.save")}</span>
        </button>

        <SmartLink href={productUrl} onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-1">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/25 backdrop-blur-sm transition-transform active:scale-90">
            <Send className="h-[20px] w-[20px] text-white" />
          </span>
          <span className="text-[11px] font-medium drop-shadow">{t("mfeed.share")}</span>
        </SmartLink>
      </div>

      {/* Bottom info overlay */}
      <SmartLink href={productUrl} className="absolute inset-x-0 bottom-0 block p-4 pb-14 pr-20 text-white">
        <h3 className="text-[19px] font-semibold leading-tight">{product.title}</h3>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-[22px] font-bold">{product.price_cents === 0 ? t("product.free") : formatPrice(product.price_cents)}</span>
          {!!product.compare_at_cents && product.compare_at_cents > product.price_cents && (
            <span className="text-[13px] text-white/70 line-through">{formatPrice(product.compare_at_cents)}</span>
          )}
        </div>
        {(product.size || cond) && (
          <p className="mt-1 text-[13px] text-white/85">
            {[product.size, cond].filter(Boolean).join(" · ")}
          </p>
        )}
      </SmartLink>

      {/* The seller row sits OUTSIDE the product link. It used to be inside it,
          which put a <button> inside an <a> — invalid HTML that the browser
          re-parses, and a tap that reached the link underneath however hard the
          handler tried to stop it. That's why following sometimes navigated you
          somewhere else entirely. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 p-4 pr-20 text-white">
        <SmartLink href={storeUrl} className="pointer-events-auto flex min-w-0 items-center gap-1.5">
          <span className="h-5 w-5 shrink-0 overflow-hidden rounded-full bg-white/25">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : null}
          </span>
          <span className="truncate text-[13px] font-medium">{username || creatorName}</span>
          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-300" />
        </SmartLink>
        <FollowButton userId={sellerId} onFollowed={onFollowed} className="pointer-events-auto ml-1.5" />
      </div>
    </div>
  )
})
