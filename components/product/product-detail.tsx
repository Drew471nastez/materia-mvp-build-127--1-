"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ArrowLeft, Flag, Heart, Share2 } from "lucide-react"
import { SmartLink } from "@/components/smart-link"
import { useLocale } from "@/components/locale-provider"
import { useIsWishlisted, useToggleWishlist } from "@/components/explore/wishlist-context"
import { FollowButton } from "@/components/explore/follow-button"
import { backHrefFor } from "@/lib/marketplace/listing-url"
import { navigateBlended, signalArrival } from "@/lib/nav-blend"
import { triggerHaptic } from "@/lib/native-bridge"
import { getStoreUrl } from "@/lib/url-helpers"
import {
  CONDITIONS,
  COLOURS,
  ERAS,
  SOURCES,
  STYLES,
  categoryLabelFor,
} from "@/lib/marketplace/listing-taxonomy"
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

  const wishlisted = useIsWishlisted(product.id)
  const toggleWishlist = useToggleWishlist()
  const [nonce, setNonce] = useState(0)
  const [index, setIndex] = useState(0)
  const galleryRef = useRef<HTMLDivElement>(null)

  const images = photos(product.thumbnail_url, product.gallery_urls)
  const seller = product.creator?.profile
  const sellerName = seller?.display_name || seller?.username || "Storelib"
  const storeUrl = seller?.username ? getStoreUrl(seller.username) : "#"

  // Back goes BACK — the actual previous entry, so the feed is restored at the
  // scroll position you left it, with the reel you were on still current.
  // `origin` is the fallback for a cold arrival (a shared link, a new tab),
  // where there is no history to return to.
  const onBack = useCallback(() => {
    // history.back() so the feed comes back exactly as it was — same scroll
    // offset, same reel — rather than being re-entered from the top. `origin` is
    // only the fallback for a cold arrival (a shared link, a new tab), where
    // there is no history to pop.
    //
    // Blended, so this page stays on screen as a snapshot while the feed builds
    // behind it and the two dissolve. Animating the page out on its own was the
    // white flash on the way back: the feed hadn't mounted, so moving this page
    // uncovered the bare background rather than the feed.
    // Going back is an action you took, the same as opening was, so it gets the
    // same acknowledgement. No gesture check needed: this is a button, and a
    // button is not something you scroll.
    void triggerHaptic("light")
    navigateBlended("back", () => {
      if (typeof window !== "undefined" && window.history.length > 1) router.back()
      else router.push(backHrefFor(origin))
    })
  }, [router, origin])

  // Does this page have to animate itself in?
  //
  // Only when nothing else is doing it. A blend in progress at mount means the
  // browser is already sliding this page into place, and a second animation on
  // top of that would be the doubled open all over again. No blend means either
  // the browser can't do them, or the navigation was too slow and the blend gave
  // up and swapped instantly — and in both of those cases opening a listing with
  // no animation whatsoever is worse than a plain one. Exactly one, always;
  // never two, never none.
  //
  // Decided in a layout effect rather than at first render, so the server and
  // the client agree on the markup and nothing hydrates mismatched. Layout
  // effects run before the browser paints, so the class is still in place for
  // the first frame and the animation plays from its true start.
  const [selfAnimate, setSelfAnimate] = useState(false)
  useLayoutEffect(() => {
    if (!document.documentElement.dataset.blend) setSelfAnimate(true)
  }, [])

  // Tell an in-flight blend that this page is genuinely on screen.
  //
  // "On screen" has to include the photo. The blend photographs whatever is
  // rendered the moment we signal, and a product page without its photo is a
  // grey rectangle — so signalling on mount meant sliding neatly in to a blank
  // page and having the image land on its own a moment later. Two events, and
  // the second reads as the transition firing twice.
  //
  // Coming from the reels feed this costs nothing: that photo is already the
  // full-bleed size at the same quality, so it is the same file, already
  // decoded. From the grid it is a wider source than the tile was using and
  // there is a real fetch to wait on.
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
    // Short, now that the route itself is cached and prefetched: the fetch that
    // used to sit in front of this is gone, so the only thing left to wait for
    // is the image, and past a quarter-second it is better to arrive without it
    // than to keep the previous screen frozen.
    timer = window.setTimeout(go, 240)
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
  useEffect(() => {
    document.documentElement.classList.add("native-feed-bg")
    return () => document.documentElement.classList.remove("native-feed-bg")
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
    <div
      ref={rootRef}
      className={cn("min-h-screen bg-white pb-28 md:pb-0", selfAnimate && "listing-enter")}
    >
      <div className="md:mx-auto md:grid md:max-w-6xl md:grid-cols-2 md:gap-10 md:px-6 md:py-8">
        {/* ---- Photos ---- */}
        <div className="relative md:sticky md:top-24 md:self-start">
          <div
            ref={galleryRef}
            onScroll={onGalleryScroll}
            className="flex snap-x snap-mandatory overflow-x-auto scrollbar-hide md:rounded-2xl"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
          >
            {(images.length ? images : [null]).map((src, i) => (
              <div key={i} className="relative aspect-[3/4] w-full shrink-0 snap-center bg-neutral-100">
                {src ? (
                  <Image
                    src={src}
                    alt={product.title}
                    fill
                    sizes="(min-width: 768px) 50vw, 100vw"
                    quality={68}
                    className="object-cover"
                    placeholder="blur"
                    blurDataURL={BLUR}
                    priority={i === 0}
                  />
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
            className="h-12 flex-1 rounded-full border border-[#7c3aed] text-[15px] font-semibold text-[#7c3aed] transition-transform duration-200 active:scale-[0.98]"
          >
            Fă o ofertă
          </button>
          <button
            type="button"
            className="h-12 flex-[1.4] rounded-full bg-[#7c3aed] text-[15.5px] font-semibold text-white shadow-[0_4px_16px_-4px_rgba(124,58,237,0.6)] transition-transform duration-200 active:scale-[0.98]"
          >
            Cumpără acum
          </button>
        </div>
      </div>
    </div>
  )
}
