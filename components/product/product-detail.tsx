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

/** Stands in for the buy/offer buttons when the seller cannot be paid.
    Offers go with them: an accepted offer still has to clear checkout, so
    leaving that door open would only move the dead end one step later. */
function PaymentsUnavailableNotice() {
  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-neutral-50 px-4 py-3 text-center text-[13.5px] leading-relaxed text-neutral-600">
      Vânzătorul nu a activat încă plățile. Articolul nu poate fi cumpărat momentan.
    </div>
  )
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
  // end to end (Stripe, native-app card entry, receipts), so "Cumpără acum" is
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

  // The server collapsed the seller's Stripe state into this one flag (the
  // account id itself never ships). Only an explicit false may take the buy
  // buttons away — payloads cached from before the flag existed simply don't
  // carry it, and those listings must keep selling.
  const canTakePayments = product.creator?.can_take_payments !== false

  // Stripe onboarding starts with a POST that answers a one-time account-link
  // URL (see app/api/stripe/connect/start) — there is no GET route to link to,
  // so the button has to fetch first and navigate after. Assigning
  // location.href behaves the same in the Capacitor WebView as on the web, and
  // the account link's return_url carries the seller back into the app.
  const [connecting, setConnecting] = useState(false)
  const onConnectStripe = useCallback(async () => {
    if (connecting) return
    void triggerHaptic("light")
    setConnecting(true)
    try {
      const res = await fetch("/api/stripe/connect/start", { method: "POST" })
      const data = await res.json().catch(() => null)
      if (res.ok && typeof data?.url === "string") {
        window.location.href = data.url
        return
      }
    } catch {}
    // Onboarding didn't start; release the button so the seller can retry
    // instead of staring at a permanently pending label.
    setConnecting(false)
  }, [connecting])

  const onBuy = useCallback(() => {
    void triggerHaptic("light")
    router.push(`/checkout?productId=${product.id}`)
  }, [router, product.id])

  const onOffer = useCallback(() => {
    void triggerHaptic("light")
    setOfferOpen(true)
  }, [])

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
  // Applied in a layout effect rather than at first render so the server and the
  // client agree on the markup. Layout effects run before paint, so the class is
  // in place for the first frame and the animation plays from its true start.
  const [selfAnimate, setSelfAnimate] = useState(false)
  useLayoutEffect(() => setSelfAnimate(true), [])

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

          {/* Seller-facing: this listing is unsellable until Stripe onboarding
              finishes, and the seller is the only person who can fix that — so
              it's said here, on the page they check most, not buried in
              settings. */}
          {isOwn && !canTakePayments && product.price_cents > 0 && (
            <div className="mt-5 rounded-2xl border border-[#7c3aed]/25 bg-[#7c3aed]/[0.06] px-4 py-3.5">
              <p className="text-[13.5px] leading-relaxed text-neutral-700">
                Anunțul tău nu poate fi cumpărat încă. Conectează Stripe ca să primești banii.
              </p>
              <button
                type="button"
                onClick={onConnectStripe}
                disabled={connecting}
                className="mt-2.5 h-11 w-full rounded-full bg-[#7c3aed] px-6 text-[14.5px] font-semibold text-white transition-transform duration-200 active:scale-[0.97] hover:bg-[#6d2fd6] disabled:opacity-60 md:w-auto"
              >
                {connecting ? "Se deschide…" : "Conectează Stripe"}
              </button>
            </div>
          )}

          {/* Desktop buy row — the mobile bar is fixed to the viewport bottom
              and hidden at md, so without this the desktop page had no way to
              actually buy the thing it was showing. */}
          {!isOwn && product.price_cents > 0 && (
            <div className="mt-5 hidden md:block">
              {canTakePayments ? (
                <div className="flex gap-2.5">
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
                    Cumpără acum
                  </button>
                </div>
              ) : (
                <PaymentsUnavailableNotice />
              )}
            </div>
          )}

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
      {!isOwn && product.price_cents > 0 && (
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200/80 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur-md md:hidden"
        style={{
          transform: barUp ? "translateY(0)" : "translateY(115%)",
          transition: "transform 380ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {canTakePayments ? (
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
              Cumpără acum
            </button>
          </div>
        ) : (
          <PaymentsUnavailableNotice />
        )}
      </div>
      )}

      <OfferSheet open={offerOpen} onClose={() => setOfferOpen(false)} listingId={product.id} priceCents={product.price_cents} />
    </div>
  )
}
