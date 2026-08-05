"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ArrowLeft, Flag, Heart, MessageCircle, Share2 } from "lucide-react"
import { SmartLink } from "@/components/smart-link"
import { useLocale } from "@/components/locale-provider"
import { useIsWishlisted, useToggleWishlist } from "@/components/explore/wishlist-context"
import { FollowButton } from "@/components/explore/follow-button"
import { backHrefFor } from "@/lib/marketplace/listing-url"
import { navigateBlended, signalArrival } from "@/lib/nav-blend"
import { triggerHaptic } from "@/lib/native-bridge"
import { claimSurface } from "@/lib/surface-bg"
import { OfferSheet } from "@/components/product/offer-sheet"
import { readAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { getStoreUrl } from "@/lib/url-helpers"
import {
  CONDITIONS,
  COLOURS,
  ERAS,
  SOURCES,
  STYLES,
  categoryLabelFor,
} from "@/lib/marketplace/listing-taxonomy"
import { ImageViewer } from "@/components/messages/image-viewer"
import { cn } from "@/lib/utils"

const BLUR = "data:image/gif;base64,R0lGODlhAQABAIAAAOfn5wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="

function photos(thumb?: string | null, gallery?: string[] | null): string[] {
  const out: string[] = []
  if (thumb) out.push(thumb)
  if (Array.isArray(gallery)) for (const u of gallery) if (typeof u === "string" && u && !out.includes(u)) out.push(u)
  return out
}

function labelOf(list: { id: string; label: string }[], id?: string | null) {
  return list.find((o) => o.id === id)?.label ?? null
}

/** "acum 3 zile" — relative, because "when was this listed" is what matters. */
function since(iso?: string | null): string | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return null
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000))
  if (mins < 60) return `acum ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `acum ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 30) return `acum ${days} ${days === 1 ? "zi" : "zile"}`
  const months = Math.round(days / 30)
  return `acum ${months} ${months === 1 ? "lună" : "luni"}`
}

export function ProductDetail({ product }: { product: any }) {
  const { t, formatPrice } = useLocale()
  const router = useRouter()
  // Where you came from, straight off the URL.
  //
  // Not useSearchParams: that hook forces Next to wrap this in a Suspense
  // boundary, so the component mounted, suspended, and mounted AGAIN — the enter
  // animation played twice and the page appeared to arrive a second time. And
  // not a server prop either: reading searchParams on the server opts the whole
  // route out of caching, which is far more expensive than this one breadcrumb
  // is worth. Read once, at first client render, from a source that costs
  // nothing and suspends nothing.
  const [origin] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    try {
      return new URLSearchParams(window.location.search).get("origin")
    } catch {
      return null
    }
  })

  // Buying and offering. Checkout already handles any published `products` row
  // end to end (Stripe, native-app card entry, receipts), so "Cumpără" is
  // a link into it rather than a second payment stack. The offer goes through
  // messages — that is where the negotiation lives.
  const [offerOpen, setOfferOpen] = useState(false)
  const sellerUserId = product.creator?.user_id ?? null
  // Own listing? Then neither button makes sense. The snapshot is a head start,
  // not an authority — worst case the buttons render and checkout refuses.
  const [isOwn, setIsOwn] = useState(false)
  useEffect(() => {
    const snap = readAuthSnapshot()
    if (snap?.signedIn && snap.userId && sellerUserId && snap.userId === sellerUserId) setIsOwn(true)
  }, [sellerUserId])

  // A listing says nothing about the seller's Stripe state — not to buyers,
  // for whom it is somebody else's paperwork on a page about a jacket, and not
  // to the seller either, who does not need their own shopfront lecturing them.
  // Settings carries that, in the one place it is actionable.

  /**
   * The bar is on EVERY listing now, for everyone.
   *
   * It used to be gated on `!isOwn && price_cents > 0`, so your own listings and
   * anything priced at zero simply had no bar — the page reserved `pb-28` for it
   * and then showed a strip of empty white. A listing that looks different
   * depending on who is reading it is also how the buy bar being unpinned went
   * unnoticed for so long: the person most likely to be testing was the one
   * person guaranteed not to see it.
   *
   * Buying from yourself is the one thing that cannot work, and checkout would
   * refuse it — so it is answered here, in a line, instead of sending you into a
   * flow that dead-ends. The button is present, which is what consistency means;
   * it just tells you the truth when you press it.
   */
  const [ownNote, setOwnNote] = useState(false)
  const noteTimer = useRef(0)
  const sayOwn = useCallback(() => {
    void triggerHaptic("light")
    setOwnNote(true)
    window.clearTimeout(noteTimer.current)
    noteTimer.current = window.setTimeout(() => setOwnNote(false), 2200)
  }, [])
  useEffect(() => () => window.clearTimeout(noteTimer.current), [])

  const onBuy = useCallback(() => {
    if (isOwn) return sayOwn()
    void triggerHaptic("light")
    router.push(`/checkout?productId=${product.id}`)
  }, [router, product.id, isOwn, sayOwn])

  const onOffer = useCallback(() => {
    if (isOwn) return sayOwn()
    void triggerHaptic("light")
    setOfferOpen(true)
  }, [isOwn, sayOwn])

  // "Ask the seller", which on a marketplace is not a nicety — it is how half of
  // everything gets sold. Is it still available, does it run small, can you send
  // a photo of the label.
  //
  // It opens the conversation and takes you into it rather than asking you to
  // compose your first sentence in a box on this page. The thread is about THIS
  // listing, which is the whole difference between a marketplace chat and an
  // inbox: the item is pinned above the exchange, so neither side has to say
  // which of the seller's forty things they mean.
  const [opening, setOpening] = useState(false)
  const onMessage = useCallback(async () => {
    if (opening) return
    void triggerHaptic("light")
    setOpening(true)
    try {
      const r = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ listingId: product.id }),
      })
      if (r.status === 401) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)
        return
      }
      const data = await r.json()
      if (r.ok && data?.conversationId) router.push(`/messages/${data.conversationId}`)
    } catch {
      /* nothing opened; the button simply comes back */
    } finally {
      setOpening(false)
    }
  }, [opening, product.id, router])

  const wishlisted = useIsWishlisted(product.id)
  const toggleWishlist = useToggleWishlist()
  const [nonce, setNonce] = useState(0)
  const [index, setIndex] = useState(0)
  const galleryRef = useRef<HTMLDivElement>(null)

  const images = photos(product.thumbnail_url, product.gallery_urls)
  /** Which photo the full-size viewer is on, or null when it is closed. */
  const [viewerAt, setViewerAt] = useState<number | null>(null)
  /** The already-decoded version of EVERY photo in the gallery, positionally,
   *  so the viewer has something to draw in its first frame — and still does
   *  after you swipe. See the tap handler below. */
  const [posters, setPosters] = useState<(string | null)[] | null>(null)
  const seller = product.creator?.profile
  const sellerName = seller?.display_name || seller?.username || "Storelib"
  const storeUrl = seller?.username ? getStoreUrl(seller.username) : "#"

  // Back goes BACK — the actual previous entry, so the feed is restored at the
  // scroll position you left it, with the reel you were on still current.
  // `origin` is the fallback for a cold arrival (a shared link, a new tab),
  // where there is no history to return to.
  // The navigation on its own, with nothing animating around it.
  const goBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back()
    else router.push(backHrefFor(origin))
  }, [router, origin])

  const onBack = useCallback(() => {
    // history.back() so the feed comes back exactly as it was — same scroll
    // offset, same reel — rather than being re-entered from the top. `origin` is
    // only the fallback for a cold arrival (a shared link, a new tab), where
    // there is no history to pop.
    //
    // Nothing animates this page out. There is nothing behind it to reveal — the
    // feed has not mounted yet — so anything that moved it would uncover the
    // bare document. The arriving feed does the animation instead; see
    // `.feed-return`. Going back is an action you took, so it gets the same
    // acknowledgement opening did.
    void triggerHaptic("light")
    navigateBlended("back", goBack)
  }, [goBack])

  // This page animates itself in, and it is the only thing that animates.
  //
  // Nothing coordinates with anything: no snapshot of the previous screen, no
  // handshake deciding who owns the animation, no second party that can get it
  // wrong. One opaque element scaling into place, which is the version of this
  // that cannot flash, cannot double, and cannot silently fail to run.
  //
  // THE ENTRANCE IS NOT HERE ANY MORE, and it must not come back.
  //
  // It was `.listing-enter` on the root below, applied from a layout effect, and
  // it was wrong in two separate ways.
  //
  // The animation was a scale on an ancestor of the fixed buy bar, which stopped
  // that bar being fixed to the viewport at all: measured at 390x844, bar top
  // 768 without the class and 1556 with it. The whole reason this page reserves
  // `pb-28` walked off the bottom of the document.
  //
  // And an entrance driven by this component's mount can only ever animate half
  // the journey — the screen you left is frozen from the tap until the route
  // commits, and a skeleton mounting first splits it again. Opening a listing is
  // now the same dip-and-release the tab bar uses, on <main>, which is above
  // both the skeleton and this. See app/globals.css and components/smart-link.tsx.

  // Report the page as arrived, which is what completes the progress bar.
  //
  // Arrived includes the photo, so the bar does not finish while the page is
  // still a grey rectangle. Coming from the reels feed that is immediate — the
  // reel photo is already full-bleed at the same quality, so it is the same
  // file, already decoded. From the grid it was warmed when your finger landed
  // (see warm-image), so usually also immediate. The cap is short because past
  // that point the bar sitting there is worse than the bar being slightly early.
  const rootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const img = rootRef.current?.querySelector("img")
    if (!img || img.complete) {
      signalArrival()
      return
    }
    let timer = 0
    const go = () => {
      window.clearTimeout(timer)
      img.removeEventListener("load", go)
      img.removeEventListener("error", go)
      signalArrival()
    }
    img.addEventListener("load", go, { once: true })
    img.addEventListener("error", go, { once: true })
    // Just long enough for a cached image to come back. Past that, go.
    timer = window.setTimeout(go, 110)
    return () => {
      window.clearTimeout(timer)
      img.removeEventListener("load", go)
      img.removeEventListener("error", go)
    }
  }, [])

  const onGalleryScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const i = Math.round(el.scrollLeft / el.clientWidth)
    setIndex((p) => (p === i ? p : i))
  }, [])

  /**
   * SWIPING THE GALLERY WAS OPENING THE PHOTO.
   *
   * Every slide is a full-bleed <button> that opens the viewer, and there was
   * nothing between "a finger moved across this button" and "this button was
   * pressed". WebKit still delivers a click after a short drag — the same
   * behaviour SmartLink documents and guards against for exactly this reason —
   * so a quick flick to the next photo scrolled a little AND opened the
   * full-screen viewer on top of it. Every swipe was a coin toss between paging
   * and a modal, which is the whole of "the carousel is glitchy and doesn't
   * work": it was working, and then something else happened over it.
   *
   * The grid solved this a long time ago (see ProductCard's `didScroll`); the
   * gallery is the one horizontal scroller in the app that never got it.
   *
   * Ten pixels, on both axes. Horizontal is the page change; vertical matters
   * just as much, because the photograph is the top half of the screen and
   * scrolling down the listing starts with a finger on it.
   */
  const swipe = useRef({ x: 0, y: 0, moved: false })

  const onGalleryPointerDown = useCallback((e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, moved: false }
  }, [])

  const onGalleryPointerMove = useCallback((e: React.PointerEvent) => {
    const s = swipe.current
    if (s.moved) return
    if (Math.abs(e.clientX - s.x) > 10 || Math.abs(e.clientY - s.y) > 10) s.moved = true
  }, [])

  // Capture, so it stops the click before the slide's own handler sees it.
  const onGalleryClickCapture = useCallback((e: React.MouseEvent) => {
    if (!swipe.current.moved) return
    e.preventDefault()
    e.stopPropagation()
    swipe.current.moved = false
  }, [])

  const onLike = useCallback(() => {
    setNonce((n) => n + 1)
    window.dispatchEvent(new CustomEvent("wishlist-toast", { detail: { saved: !wishlisted } }))
    void toggleWishlist(product.id)
  }, [wishlisted, toggleWishlist, product.id])

  // The buy bar hides as you read down and comes back the moment you scroll up —
  // the same reflex as reaching for a toolbar. Out of the way while you're
  // looking at photos and detail; there the instant you want it. Driven off a
  // rAF-coalesced scroll read and written as a transform, so it costs a
  // composite and can't stutter the scroll.
  const [barUp, setBarUp] = useState(true)
  useEffect(() => {
    let last = window.scrollY
    let queued = false
    const read = () => {
      queued = false
      const y = window.scrollY
      const dy = y - last
      // Always visible near the top; below that, direction decides.
      if (y < 120) setBarUp(true)
      else if (dy > 6) setBarUp(false)
      else if (dy < -6) setBarUp(true)
      last = y
    }
    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(read)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // The photo runs under the status bar, so the page owns the whole screen.
  //
  // A LAYOUT effect, not a plain one: the entry animation starts at first paint,
  // and a claim that lands after it would leave the very first frame wearing the
  // previous screen's colour — a black rim for one frame, coming from a reel.
  useLayoutEffect(() => {
    const surface = claimSurface("#ffffff")
    return () => surface.release()
  }, [])

  const cond = labelOf(CONDITIONS, product.condition)
  const colour = labelOf(COLOURS, product.colour)
  const era = labelOf(ERAS, product.era)
  const category = categoryLabelFor(product.category, product.subcategory)
  const sourceLabels = (product.source_tags || []).map((s: string) => labelOf(SOURCES, s)).filter(Boolean)
  const styleLabels = (product.style_tags || []).map((s: string) => labelOf(STYLES, s)).filter(Boolean)
  const hasDiscount = !!product.compare_at_cents && product.compare_at_cents > product.price_cents

  // The line under the title, exactly like the reference: size · condition ·
  // brand · when. Everything that decides "is this the one" in one glance.
  const summary = [product.size?.toUpperCase(), cond].filter(Boolean).join(" · ")

  return (
    <div ref={rootRef} className="min-h-screen bg-white pb-28 md:pb-0">
      <div className="md:mx-auto md:grid md:max-w-6xl md:grid-cols-2 md:gap-10 md:px-6 md:py-8">
        {/* ---- Photos ---- */}
        <div className="relative md:sticky md:top-24 md:self-start">
          <div
            ref={galleryRef}
            onScroll={onGalleryScroll}
            onPointerDown={onGalleryPointerDown}
            onPointerMove={onGalleryPointerMove}
            onClickCapture={onGalleryClickCapture}
            className="no-touch-callout flex snap-x snap-mandatory overflow-x-auto scrollbar-hide md:rounded-2xl"
            style={{
              scrollbarWidth: "none",
              WebkitOverflowScrolling: "touch",
              // Swiping past the last photo used to chain outwards — into the
              // page's own scroll, and on iOS into the edge-swipe that leaves
              // the listing. The rail keeps its own overscroll; the page keeps
              // vertical, which is why only the X axis is named.
              overscrollBehaviorX: "contain",
            }}
          >
            {(images.length ? images : [null]).map((src, i) => (
              <div key={i} className="relative aspect-[3/4] w-full shrink-0 snap-center bg-neutral-100">
                {src ? (
                  // TAPPING THE PHOTOGRAPH OPENS IT.
                  //
                  // Buying a second-hand coat is a decision made by looking
                  // closely at pictures of it — at the cuffs, at the label, at
                  // the mark the seller mentioned — and the gallery would not
                  // let you. It scrolled sideways at one fixed size, cropped to
                  // 3:4, and that was all it did. Everybody tries the tap; it
                  // did nothing.
                  //
                  // The same viewer the conversation uses, given the whole
                  // gallery and the index you were on, so pinch, double tap and
                  // swipe-between behave identically wherever a photo is opened
                  // in this app. `object-cover` up here means what you see is a
                  // crop; the viewer is where the picture is whole.
                  <button
                    type="button"
                    aria-label={`Deschide fotografia ${i + 1}`}
                    onClick={() => {
                      void triggerHaptic("light")
                      // THE PICTURES THAT ARE ALREADY ON SCREEN, handed over as
                      // posters.
                      //
                      // The viewer opens on the raw storage URLs while this
                      // gallery renders through next/image — a DIFFERENT
                      // resource, at a different URL, none of it in cache. So
                      // opening a photo meant a black screen for as long as a
                      // full-resolution original took to arrive, on a tap whose
                      // whole purpose is to look at something you can already
                      // see.
                      //
                      // `currentSrc` is the exact file the browser chose and
                      // has already decoded for each <img>. All of them are
                      // collected, not just the one tapped, because a single
                      // poster is the picture you tapped drawn over a different
                      // picture the moment you swipe.
                      const shown = galleryRef.current?.querySelectorAll("img") ?? []
                      setPosters(images.map((_, n) => shown[n]?.currentSrc || shown[n]?.src || null))
                      // The full-size file starts arriving NOW, not when the
                      // viewer has mounted and React has committed a portal.
                      // Setting `src` on a detached element is enough to begin
                      // the fetch, and the <img> inside the viewer then finds it
                      // in the cache — a couple of hundred milliseconds that
                      // otherwise sit between the tap and the sharp version.
                      // The neighbours are warmed too, because the first thing
                      // anybody does in a gallery is swipe.
                      for (const n of [i, i + 1, i - 1]) {
                        const url = images[n]
                        if (url) document.createElement("img").src = url
                      }
                      setViewerAt(i)
                    }}
                    // `no-tap-fade`: in the app every button dims to 0.65 on
                    // press, which is right for a control and wrong for a
                    // photograph. Tapping the picture faded the whole picture
                    // out and then opened it — a cheap-looking dissolve in
                    // front of the real transition, on the one element you are
                    // pressing precisely because you want to see it better.
                    className="no-tap-fade absolute inset-0 h-full w-full cursor-zoom-in"
                  >
                    <Image
                      src={src}
                      alt={product.title}
                      fill
                      sizes="(min-width: 768px) 50vw, 100vw"
                      quality={68}
                      // `select-none` and draggable={false} for the same reason
                      // the grid tiles carry them: an <img> is draggable by
                      // default, so a slow swipe across the photo starts a
                      // native image drag or a long-press callout instead of
                      // moving the carousel, and the gesture is lost.
                      className="object-cover select-none"
                      draggable={false}
                      placeholder="blur"
                      blurDataURL={BLUR}
                      priority={i === 0}
                    />
                  </button>
                ) : (
                  <div className="flex h-full items-center justify-center text-5xl">👕</div>
                )}
              </div>
            ))}
          </div>

          {/* Overlaid controls. White on a scrim rather than on a bar, so the
              photo keeps the full frame and still runs under the status bar. */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-3 md:hidden"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
          >
            <button
              type="button"
              onClick={onBack}
              aria-label="Înapoi"
              className="no-tap-fade pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-transform duration-200 active:scale-90"
            >
              <ArrowLeft className="h-[22px] w-[22px]" strokeWidth={2.4} />
            </button>
            <div className="pointer-events-auto flex gap-2">
              <button type="button" aria-label="Raportează" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-transform duration-200 active:scale-90">
                <Flag className="h-[19px] w-[19px]" />
              </button>
              <button
                type="button"
                aria-label="Distribuie"
                onClick={() => {
                  if (navigator.share) void navigator.share({ title: product.title, url: window.location.href })
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition-transform duration-200 active:scale-90"
              >
                <Share2 className="h-[19px] w-[19px]" />
              </button>
            </div>
          </div>

          {/* Top scrim only — enough to keep white icons legible on a pale photo
              without dimming the product itself. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/35 to-transparent md:hidden" />

          <button
            type="button"
            onClick={onLike}
            aria-pressed={wishlisted}
            aria-label={t("product.add_to_wishlist")}
            className="no-tap-fade absolute bottom-4 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm transition-transform duration-200 active:scale-90"
          >
            <Heart
              key={nonce}
              className={cn(
                "h-6 w-6 transition-colors duration-[750ms] ease-out",
                nonce > 0 && "motion-safe:heart-pop",
                wishlisted ? "fill-rose-500 text-rose-500" : "text-white",
              )}
            />
          </button>

          {images.length > 1 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center gap-1.5">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-[7px] rounded-full transition-all duration-300",
                    i === index ? "w-[7px] bg-white" : "w-[7px] bg-white/45",
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* ---- Details ---- */}
        <div className="px-4 pt-5 md:px-0 md:pt-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-neutral-900 md:text-[26px]">
            {product.title}
          </h1>

          <p className="mt-1.5 text-[14.5px] text-neutral-500">
            {summary}
            {summary && product.brand ? " · " : ""}
            {product.brand && (
              <SmartLink href={`/?q=${encodeURIComponent(product.brand)}`} className="underline underline-offset-2">
                {product.brand}
              </SmartLink>
            )}
            {since(product.created_at) ? ` · ${since(product.created_at)}` : ""}
          </p>

          <div className="mt-4 flex items-baseline gap-2.5">
            <span className="text-[26px] font-bold tracking-[-0.02em] text-neutral-900">
              {product.price_cents === 0 ? t("product.free") : formatPrice(product.price_cents)}
            </span>
            {hasDiscount && (
              <>
                <span className="text-[15px] text-neutral-400 line-through">
                  {formatPrice(product.compare_at_cents)}
                </span>
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[12px] font-semibold text-rose-600">
                  -{Math.round((1 - product.price_cents / product.compare_at_cents) * 100)}%
                </span>
              </>
            )}
          </div>

          {/* Desktop buy row — the mobile bar is fixed to the viewport bottom
              and hidden at md, so without this the desktop page had no way to
              actually buy the thing it was showing. */}
          <div className="mt-5 hidden gap-2.5 md:flex">
            <button
              type="button"
              onClick={onOffer}
              className="h-12 flex-1 rounded-full border border-[#7c3aed] text-[15px] font-semibold text-[#7c3aed] transition-transform duration-200 active:scale-[0.98] hover:bg-[#7c3aed]/5"
            >
              Fă o ofertă
            </button>
            <button
              type="button"
              onClick={onBuy}
              className="h-12 flex-[1.4] rounded-full bg-[#7c3aed] text-[15.5px] font-semibold text-white shadow-[0_4px_16px_-4px_rgba(124,58,237,0.6)] transition-transform duration-200 active:scale-[0.98] hover:bg-[#6d2fd6]"
            >
              Cumpără
            </button>
          </div>

          {/* Seller */}
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-neutral-200/70 p-3">
            <SmartLink href={storeUrl} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-neutral-100">
                {seller?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={seller.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[16px] font-semibold text-neutral-400">
                    {sellerName.charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-neutral-900">{sellerName}</span>
                {seller?.username && (
                  <span className="block truncate text-[13px] text-neutral-500">@{seller.username}</span>
                )}
              </span>
            </SmartLink>
            <FollowButton userId={product.creator?.user_id} variant="quiet" />
          </div>

          {/* Asking a question sits WITH the seller, not in the buy bar. It is
              addressed to a person, not to the item, and putting a third button
              beside "buy" and "offer" would turn a two-choice decision into a
              menu. Hidden on your own listing, where there is nobody to ask. */}
          {!isOwn && (
            <button
              type="button"
              onClick={() => void onMessage()}
              disabled={opening}
              className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-neutral-200 text-[14.5px] font-semibold text-neutral-800 transition-[transform,background-color] duration-200 active:scale-[0.98] active:bg-neutral-50 disabled:opacity-50"
            >
              <MessageCircle className="h-[17px] w-[17px]" />
              {opening ? "Se deschide…" : `Întreabă-l pe ${sellerName.split(" ")[0]}`}
            </button>
          )}

          {/* Description */}
          {product.description && (
            <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-neutral-700">
              {product.description}
            </p>
          )}

          {/* Reassurance, delivery, returns — the three questions every resale
              buyer asks before committing, answered inline so nobody has to go
              hunting for them. */}
          <div className="mt-6 space-y-2.5">
            {[
              ["Protecția cumpărătorului", "Banii îți sunt returnați dacă articolul nu ajunge sau nu e conform descrierii."],
              ["Livrare", "Vânzătorul expediază în 1–3 zile lucrătoare de la confirmarea comenzii."],
              ["Retur", "Ai 14 zile să anunți o problemă din momentul primirii coletului."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl bg-neutral-50 px-3.5 py-3">
                <p className="text-[14px] font-semibold text-neutral-900">{title}</p>
                <p className="mt-0.5 text-[13.5px] leading-relaxed text-neutral-500">{body}</p>
              </div>
            ))}
          </div>

          {/* Everything the seller filled in, as a plain spec list — a buyer
              scans this to answer one question at a time. */}
          <dl className="mt-6 divide-y divide-neutral-100 border-t border-neutral-100">
            {[
              ["Categorie", category],
              ["Brand", product.brand],
              ["Stare", cond],
              ["Mărime", product.size?.toUpperCase()],
              ["Culoare", colour],
              ["Tip", sourceLabels.join(", ") || null],
              ["Epocă", era],
              ["Stil", styleLabels.join(", ") || null],
            ]
              .filter(([, v]) => !!v)
              .map(([k, v]) => (
                <div key={String(k)} className="flex items-start justify-between gap-4 py-3">
                  <dt className="shrink-0 text-[14px] text-neutral-500">{k}</dt>
                  <dd className="text-right text-[14px] font-medium text-neutral-900">{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>

      {/* Sticky buy bar — on a phone this is the whole point of the page, so it
          never scrolls away. */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200/80 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur-md md:hidden"
        style={{
          transform: barUp ? "translateY(0)" : "translateY(115%)",
          transition: "transform 380ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onOffer}
              className="h-12 flex-1 rounded-full border border-[#7c3aed] text-[15px] font-semibold text-[#7c3aed] transition-transform duration-200 active:scale-[0.98]"
            >
              Fă o ofertă
            </button>
            <button
              type="button"
              onClick={onBuy}
              className="h-12 flex-[1.4] rounded-full bg-[#7c3aed] text-[15.5px] font-semibold text-white shadow-[0_4px_16px_-4px_rgba(124,58,237,0.6)] transition-transform duration-200 active:scale-[0.98]"
            >
              Cumpără
            </button>
          </div>
      </div>

      {/* Pressing either control on your own listing. Portalled to the body, so
          it is fixed to the SCREEN whatever this page's ancestors are doing —
          the lesson the buy bar above taught the hard way. */}
      {ownNote && typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[120] flex justify-center px-6 md:bottom-10">
            <span className="rounded-full bg-neutral-900/90 px-4 py-2 text-[13px] font-medium text-white shadow-lg">
              Acesta este anunțul tău
            </span>
          </div>,
          document.body,
        )}

      <OfferSheet open={offerOpen} onClose={() => setOfferOpen(false)} listingId={product.id} priceCents={product.price_cents} />

      {/* The gallery, full size. Mounted only while it is open, so a listing
          page carries none of its gesture state until somebody asks for it. */}
      {viewerAt !== null && images.length > 0 && (
        <ImageViewer
          images={images}
          index={viewerAt}
          posters={posters}
          alt={product.title}
          onClose={() => setViewerAt(null)}
        />
      )}
    </div>
  )
}
