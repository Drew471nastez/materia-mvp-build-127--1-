"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, MapPin } from "lucide-react"
import { Elements, useElements, useStripe } from "@stripe/react-stripe-js"

import {
  AddressSheet,
  EMPTY_ADDRESS,
  formatAddressLines,
  isAddressComplete,
  isContactComplete,
  type CheckoutAddress,
} from "@/components/checkout/address-sheet"
import { CardSheet, PaymentCard, type SavedCard } from "@/components/checkout/card-sheet"
import {
  AddressCard,
  CheckoutItemCard,
  DeliveryOptions,
  SummaryCard,
  type DeliveryMethod,
} from "@/components/checkout/delivery-options"
import { PriceBreakdown } from "@/components/checkout/price-breakdown"
import { StickyPayBar } from "@/components/checkout/sticky-pay-bar"
import { LockerScreen } from "@/components/shipping/locker-screen"
import type { LockerOption } from "@/components/shipping/locker-picker"
import { PLATFORM_CURRENCY } from "@/lib/checkout/currency"
import { priceCheckout } from "@/lib/checkout/pricing"
import { getListingUrl } from "@/lib/marketplace/listing-url"
import { triggerHaptic } from "@/lib/native-bridge"
import { getStripePromise } from "@/lib/stripe-client"

/**
 * ===========================================================================
 *  THE MARKETPLACE CHECKOUT
 * ===========================================================================
 *
 * One screen of decisions, each one a single line, each line opening a subpage
 * where that decision is made:
 *
 *   the item          — not a decision, but the reason for all the others
 *   Adresă            → AddressSheet
 *   Opțiune de livrare — locker or door, both priced, chosen in place
 *   Punct de ridicare → LockerScreen (map, search, the whole screen)
 *   Plată             → CardSheet
 *   Detalii preț      — what the three lines add up to
 *   ────────────────────────────────────────
 *   Plătește          — pinned, always showing the current total
 *
 * ---------------------------------------------------------------------------
 * WHY SUBPAGES RATHER THAN ONE LONG FORM
 * ---------------------------------------------------------------------------
 * An address is seven fields, a locker is a map, a card is three iframes.
 * Inlined, that is a screen nobody can see the end of, where the total — the
 * one number that matters — is permanently below the fold. As subpages, the
 * checkout is six short lines and a button, and each subpage is a single task
 * with its own full screen to do it in.
 *
 * Every subpage discards on close and commits only on its own save button, so
 * opening one to check what you typed can never lose it.
 *
 * ---------------------------------------------------------------------------
 * THE PRICE ON THE SCREEN IS THE PRICE ON THE CARD
 * ---------------------------------------------------------------------------
 * The total here comes from `priceCheckout`, which is the same function the
 * PaymentIntent is built with. Postage comes from the courier, server-side, and
 * the amount displayed is sent back at pay time purely so the server can REFUSE
 * to charge a different one. If the tariff moved while the page was open, the
 * buyer is shown the new number rather than quietly charged it.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE DOES NOT REPLACE THE EXISTING CHECKOUT
 * ---------------------------------------------------------------------------
 * app/checkout/checkout-client.tsx handles digital goods — tips, gifts, VAT,
 * pay-what-you-want, discount codes, entitlements — and none of that applies to
 * a second-hand jacket. Physical listings route here; everything else keeps the
 * path it has always taken.
 */

export interface MarketplaceCheckoutProduct {
  id: string
  title: string
  slug: string
  priceCents: number
  thumbnailUrl: string | null
  /** The seller's name, shown under the title. */
  sellerName: string | null
  variantId: string | null
  variantName: string | null
  /** What the listing knows about the garment. Any of these may be absent. */
  brand: string | null
  size: string | null
  condition: string | null
  colour: string | null
}

/** Formatted in the currency the card is actually charged in, so the figure on
 *  the page and the figure on the statement are the same figure. */
function formatMinor(cents: number): string {
  const amount = (cents || 0) / 100
  try {
    return new Intl.NumberFormat(PLATFORM_CURRENCY === "ron" ? "ro-RO" : "en-US", {
      style: "currency",
      currency: PLATFORM_CURRENCY.toUpperCase(),
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${PLATFORM_CURRENCY.toUpperCase()}`
  }
}

/** A courier quote, or the reason there isn't one. */
interface Quote {
  status: "idle" | "loading" | "ready" | "unavailable"
  cents: number
  message?: string
}

const NO_QUOTE: Quote = { status: "idle", cents: 0 }

/**
 * What a section still needs, said underneath that section.
 *
 * Animated open rather than snapped in: a line of red text materialising under
 * a card the instant you press Pay reads as an error the page threw at you,
 * where the same line easing into place over 200ms reads as the page answering
 * a question. It is `grid-template-rows` on a single cell — the one way to
 * transition to a height nobody has measured, without a fixed pixel value that
 * would clip a message when it wraps to two lines.
 */
function GapNote({ show, text }: { show: boolean; text: string }) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{ gridTemplateRows: show ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden">
        <p role="alert" className="pt-2 text-[13.5px] leading-snug text-[#c2410c]">
          {text}
        </p>
      </div>
    </div>
  )
}

export function MarketplaceCheckout(props: {
  product: MarketplaceCheckoutProduct
  userEmail: string | null
  isLoggedIn: boolean
  offerToken: string | null
  carrierId: number
}) {
  /**
   * Stripe.js is not on this page until a card is needed.
   *
   * Loading it when the checkout opens means the fraud frame, the controller
   * frame and a third-party script are all live while somebody is still
   * choosing an easybox — and every one of them is a way to be thrown out of
   * the WebView before anything has been bought. `<Elements>` takes null and
   * accepts the promise later precisely so this can be deferred.
   */
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof getStripePromise> | null>(null)
  const armStripe = useCallback(() => setStripePromise((p) => p ?? getStripePromise()), [])

  return (
    <Elements stripe={stripePromise}>
      <CheckoutBody {...props} onNeedStripe={armStripe} />
    </Elements>
  )
}

function CheckoutBody({
  product,
  userEmail,
  isLoggedIn,
  offerToken,
  carrierId,
  onNeedStripe,
}: {
  product: MarketplaceCheckoutProduct
  userEmail: string | null
  isLoggedIn: boolean
  offerToken: string | null
  carrierId: number
  /** Called the first time a card is actually going to be asked for. */
  onNeedStripe: () => void
}) {
  const router = useRouter()
  const stripe = useStripe()
  const elements = useElements()

  const [method, setMethod] = useState<DeliveryMethod>("locker")
  const [locker, setLocker] = useState<LockerOption | null>(null)
  // Seeded with the signed-in buyer's email so the receipt has somewhere to go
  // without asking them for something we already know.
  const [address, setAddress] = useState<CheckoutAddress>(() => ({
    ...EMPTY_ADDRESS,
    email: userEmail ?? "",
  }))
  const [card, setCard] = useState<SavedCard | null>(null)

  const [sheet, setSheet] = useState<null | "address" | "locker" | "card">(null)

  /**
   * Which section is being asked for, shown UNDER that section.
   *
   * Not above the pay button. A message at the bottom of the screen naming a
   * field near the top is a message you have to go and hunt for — it says what
   * is wrong and nothing about where. Attached to the card itself it is read in
   * the same glance as the thing it is about.
   */
  const [gap, setGap] = useState<null | "address" | "locker" | "card">(null)
  const addressRef = useRef<HTMLDivElement>(null)
  const lockerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  /**
   * Did we arrive from somewhere inside the app?
   *
   * Read ONCE on mount. `history.length` grows as the buyer opens subpages, so
   * asking at the moment they press back would answer for the wrong journey.
   */
  const cameFromApp = useRef(false)
  useEffect(() => {
    cameFromApp.current = typeof window !== "undefined" && window.history.length > 1
  }, [])

  /**
   * Paint the document white for as long as this page is open.
   *
   * The checkout is white, the app's ground is grey, and an overscroll bounce
   * at the bottom pulls the sheet up off that grey — so a strip of it appears
   * under the pay bar exactly when somebody scrolls to the end. Restored on the
   * way out, so no other screen inherits it.
   */
  useEffect(() => {
    const prev = document.documentElement.style.backgroundColor
    document.documentElement.style.backgroundColor = "#ffffff"
    return () => {
      document.documentElement.style.backgroundColor = prev
    }
  }, [])
  const [lockerQuote, setLockerQuote] = useState<Quote>(NO_QUOTE)
  const [homeQuote, setHomeQuote] = useState<Quote>(NO_QUOTE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A returning buyer should not retype what they already gave us.
  useEffect(() => {
    if (!isLoggedIn) return
    let alive = true
    fetch("/api/shipping/preference", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.preference) return
        const p = d.preference
        setAddress((a) => ({
          ...a,
          fullName: a.fullName || p.contact || "",
          phone: a.phone || p.phone || "",
        }))
        if (p.mode === "home") {
          setMethod("home")
          setAddress((a) => ({
            ...a,
            // "FN" is the server's marker for "no street number", not something
            // to hand back as though somebody had typed it.
            street: [p.street, p.streetNo && p.streetNo !== "FN" ? p.streetNo : ""].filter(Boolean).join(" "),
            details: p.details ?? "",
            postalCode: p.postalCode ?? "",
            city: p.locality ?? "",
            county: p.county ?? "",
          }))
          return
        }
        if (!p.lockerId) return
        setLocker({
          id: p.lockerId,
          name: p.details || "Easybox",
          address: [p.street, p.streetNo].filter(Boolean).join(" "),
          carrier: "",
          carrierId: p.carrierId ?? carrierId,
          locality: p.locality ?? "",
          localityId: 0,
          county: p.county ?? "",
          allowsDropOff: true,
        })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [isLoggedIn, carrierId])

  // ── Postage ───────────────────────────────────────────────────────────────
  // Re-asked whenever the destination changes, because the destination is what
  // it depends on. A request in flight is superseded rather than raced.
  const quoteSeq = useRef(0)
  const askForQuote = useCallback(
    async (body: Record<string, unknown>, set: (q: Quote) => void) => {
      const mine = ++quoteSeq.current
      set({ status: "loading", cents: 0 })
      try {
        const res = await fetch("/api/shipping/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (mine !== quoteSeq.current) return
        if (json?.ok) set({ status: "ready", cents: Number(json.cents) || 0 })
        else set({ status: "unavailable", cents: 0, message: json?.message })
      } catch {
        if (mine !== quoteSeq.current) return
        set({ status: "unavailable", cents: 0 })
      }
    },
    [],
  )

  useEffect(() => {
    if (!locker?.id) {
      setLockerQuote(NO_QUOTE)
      return
    }
    void askForQuote({ mode: "locker", lockerId: locker.id }, setLockerQuote)
  }, [locker?.id, askForQuote])

  const homeCity = address.city.trim()
  const homeCounty = address.county.trim()
  useEffect(() => {
    if (homeCity.length < 2 || homeCounty.length < 2) {
      setHomeQuote(NO_QUOTE)
      return
    }
    void askForQuote({ mode: "home", county: homeCounty, locality: homeCity }, setHomeQuote)
  }, [homeCity, homeCounty, askForQuote])

  const activeQuote = method === "locker" ? lockerQuote : homeQuote

  const breakdown = useMemo(
    () =>
      priceCheckout({
        itemCents: product.priceCents,
        shippingCents: activeQuote.status === "ready" ? activeQuote.cents : 0,
      }),
    [product.priceCents, activeQuote.status, activeQuote.cents],
  )

  // ── What is still missing? ────────────────────────────────────────────────
  // One reason at a time, in the order the page reads, so somebody is never
  // told about a field below the one they have not filled in yet.
  const addressLines = formatAddressLines(address)
  const contactName = address.fullName.trim()
  const email = address.email.trim()
  const phone = address.phone.trim()
  // A locker is identified by its own id, so nothing about the buyer's street
  // is needed to deliver to one. Only a door needs a door.
  const needsStreet = method === "home"

  /**
   * Back to the listing.
   *
   * `router.back()` when there is history to go back through, because that is
   * the navigation the app already animates in reverse — pushing a fresh URL
   * instead plays a FORWARD transition to a page you just came from, which is
   * the wrong direction and reads as a jump. It is also what lets the listing
   * restore its own scroll position, and the feed behind it restore its own.
   *
   * The push is the cold-arrival fallback: somebody who opened this link
   * directly has nothing behind them, and back() would leave the app entirely.
   */
  const goBack = useCallback(() => {
    if (cameFromApp.current) router.back()
    else router.push(getListingUrl(product.slug))
  }, [router, product.slug])

  /**
   * Nothing is missing — or the first thing that is, scrolled to and marked.
   *
   * The pay button is never greyed out (see StickyPayBar), so pressing it with
   * an empty address has to DO something. What it does is GLIDE to the section
   * that is missing and put the reason underneath it. Not open the subpage
   * outright: a full screen appearing because you pressed a button labelled
   * "Pay" is a place you did not ask to be, and the way out of it is another
   * gesture. Scrolling to the row and naming what it needs leaves the next move
   * where it belongs.
   *
   * @returns true if something was missing, in which case nothing is charged.
   */
  const showFirstGap = (): boolean => {
    const target: null | "address" | "locker" | "card" =
      !isContactComplete(address, !isLoggedIn) || (needsStreet && !isAddressComplete(address))
        ? "address"
        : method === "locker" && !locker
          ? "locker"
          : !card
            ? "card"
            : null
    if (!target) {
      setGap(null)
      return false
    }
    setGap(target)
    void triggerHaptic("light")
    const node = (target === "address" ? addressRef : target === "locker" ? lockerRef : cardRef).current
    // `nearest` rather than `center`: the sections are tall, and centring one
    // scrolls further than it needs to, which reads as the page overshooting.
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    return true
  }

  // Clear the marker the moment the thing it is complaining about is supplied,
  // rather than leaving a red line under a row that is now filled in.
  useEffect(() => {
    if (!gap) return
    const fixed =
      gap === "address"
        ? isContactComplete(address, !isLoggedIn) && (!needsStreet || isAddressComplete(address))
        : gap === "locker"
          ? Boolean(locker)
          : Boolean(card)
    if (fixed) setGap(null)
  }, [gap, address, isLoggedIn, needsStreet, locker, card])

  const pay = async () => {
    if (busy) return
    if (showFirstGap()) return
    if (!stripe || !elements || !card) return
    setBusy(true)
    setError(null)

    try {
      // 1. Record where the parcel goes. Stored against the buyer, attached to
      //    the order after it exists — which is what lets this run without
      //    touching how orders are created.
      const prefRes = await fetch("/api/shipping/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: method,
          lockerId: method === "locker" ? locker?.id : undefined,
          address:
            method === "home"
              ? {
                  county: address.county,
                  locality: address.city,
                  street: address.street,
                  details: address.details,
                  postalCode: address.postalCode,
                }
              : undefined,
          contact: contactName,
          phone,
          email,
        }),
      })
      const prefJson = await prefRes.json().catch(() => null)
      if (prefJson && !prefJson.ok) {
        // The courier being unconfigured or unreachable is not the buyer's
        // fault and not fixable by them; the address can still be set on the
        // order afterwards. A lost sale cannot be.
        if (prefJson.code !== "shipping_not_configured" && prefJson.code !== "provider_unavailable") {
          setError(prefJson.message || "Nu am putut salva adresa de livrare.")
          return
        }
      }

      // 2. Create the PaymentIntent. The server prices the postage again and
      //    refuses the charge if it no longer matches what is on this screen.
      const [firstName, ...rest] = contactName.split(/\s+/)
      const intentRes = await fetch("/api/checkout/stripe-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productId: product.id,
          variantId: product.variantId ?? undefined,
          firstName: firstName || contactName,
          lastName: rest.join(" ") || firstName || contactName,
          email,
          offerToken: offerToken ?? undefined,
          deliveryMode: method,
          deliveryLockerId: method === "locker" ? locker?.id : undefined,
          deliveryCounty: method === "home" ? address.county : undefined,
          deliveryLocality: method === "home" ? address.city : undefined,
          expectedShippingCents: breakdown.shippingCents,
        }),
      })
      const intent = await intentRes.json()
      if (!intentRes.ok || !intent?.clientSecret) {
        if (intent?.code === "shipping_price_changed") {
          // Show them the new number instead of charging it.
          void askForQuote(
            method === "locker"
              ? { mode: "locker", lockerId: locker?.id }
              : { mode: "home", county: address.county, locality: address.city },
            method === "locker" ? setLockerQuote : setHomeQuote,
          )
          setError("Prețul livrării s-a schimbat. Verifică totalul și încearcă din nou.")
          return
        }
        setError(intent?.error || "Nu am putut începe plata. Încearcă din nou.")
        return
      }

      // 3. Confirm with the card already validated in the subpage.
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(intent.clientSecret, {
        payment_method: card.paymentMethodId,
        return_url: typeof window !== "undefined" ? window.location.href : undefined,
      })

      if (stripeError) {
        setError(stripeError.message || "Cardul a fost refuzat.")
        return
      }
      if (paymentIntent?.status !== "succeeded") {
        setError("Plata are nevoie de o confirmare suplimentară. Încearcă din nou.")
        return
      }

      // 4. Turn the payment into an order.
      const doneRes = await fetch("/api/checkout/confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId: intent.paymentIntentId }),
      })
      const done = await doneRes.json()
      if (!doneRes.ok) {
        // The money HAS moved. Saying "try again" here would be an invitation
        // to pay twice, so this says what is true and where to look.
        setError(
          done?.error ||
            "Plata a reușit, dar comanda nu s-a finalizat. Verifică secțiunea Comenzi sau scrie-ne.",
        )
        return
      }
      router.replace(done.redirectUrl || "/orders")
    } catch {
      setError("Ceva nu a mers. Verifică conexiunea și încearcă din nou.")
    } finally {
      setBusy(false)
    }
  }

  const priceFor = (q: Quote): string => {
    if (q.status === "ready") return formatMinor(q.cents)
    if (q.status === "loading") return "Se calculează…"
    if (q.status === "unavailable") return "Cost confirmat după comandă"
    return method === "locker" ? "Alege un easybox" : "Completează adresa"
  }

  return (
    /* ── THE PAGE IS EXACTLY THE VIEWPORT ────────────────────────────────
       h-[100dvh] with overflow-hidden, and the content scrolls in its own
       box inside. The document itself no longer scrolls at all, which is
       what removes the strip of grey under the pay bar: there was never
       anything painted down there, only the area below a document that had
       run out. It also means the header and the bar are ordinary flex
       children pinned by layout rather than by `sticky`, so neither can
       come unstuck inside a transformed ancestor during a navigation. */
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-white">
      {/* ── The header ──────────────────────────────────────────────────────
          Sticky, and its background is carried UP THROUGH the status bar by
          the safe-area padding rather than starting below it. Without that,
          the clock and signal strength sit on whatever the page happens to be
          scrolled to, and on a phone the notch area ends up a different colour
          from the bar directly under it.

          Two ways out, because a checkout needs both: back, for somebody who
          wants the item they were just looking at, and out, for somebody who
          has changed their mind and wants the feed. Leaving only "back" makes
          the second person press it repeatedly. */}
      <header
        // Opaque, not frosted. A blur behind a checkout header means the photo
        // and the price of the thing being bought smear through it as you
        // scroll, which reads as a rendering fault rather than as depth.
        className="shrink-0 border-b border-neutral-200 bg-white"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-3">
          <button
            type="button"
            // Fired on POINTER DOWN, not on click. A click event on iOS arrives
            // after the browser has waited to see whether the touch becomes a
            // scroll or a double-tap; feeding back then is feedback arriving
            // after the decision, which is what "laggy" means here.
            onPointerDown={() => void triggerHaptic("light")}
            onClick={goBack}
            aria-label="Înapoi la produs"
            className="-ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-800 transition-colors active:bg-neutral-100"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>

          {/* Centred in what is LEFT between the two controls, not in the
              viewport. Centring on the viewport puts the title underneath the
              button on the right at phone widths — this way it is always
              readable and never overlaps, at any size. */}
          <h1 className="min-w-0 flex-1 truncate text-center text-[16px] font-bold text-neutral-900">
            Finalizare comandă
          </h1>

          {/* One line, always. It was wrapping onto two, which made the header
              taller than the row it sits in and left the words stacked in a box
              — `whitespace-nowrap` is the whole fix, and the title truncates
              instead if a narrow screen ever runs out of room. */}
          <Link
            href="/"
            className="shrink-0 whitespace-nowrap rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[11.5px] font-medium text-neutral-700 transition-colors active:bg-neutral-50"
          >
            Continuă cumpărăturile
          </Link>
        </div>
      </header>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-2xl px-4 pb-8 pt-5">
          <CheckoutItemCard
            title={product.title}
            seller={product.sellerName}
            brand={product.brand}
            // A chosen variant IS the size when there is one; the column is the
            // fallback for listings sold without variants.
            size={product.variantName || product.size}
            condition={product.condition}
            colour={product.colour}
            price={formatMinor(product.priceCents)}
            imageUrl={product.thumbnailUrl}
          />

          <div className="mt-7 space-y-7">
          {/* ONE address section, whichever way it is being delivered — the
              reference has one and so should this. Everything about the
              recipient lives behind it, including the phone number the courier
              texts the pickup code to. */}
          <div ref={addressRef} className="scroll-mt-4">
            <AddressCard
              label="Adresă"
              name={contactName || null}
              lines={needsStreet ? [...addressLines, phone] : [phone, email || null]}
              onEdit={() => setSheet("address")}
              emptyLabel="Adaugă o adresă"
              invalid={gap === "address"}
            />
            <GapNote
              show={gap === "address"}
              text={
                needsStreet
                  ? "Avem nevoie de nume, telefon și adresa completă pentru livrare."
                  : "Avem nevoie de nume și de un număr de telefon — curierul trimite codul de ridicare prin SMS."
              }
            />
          </div>

          <DeliveryOptions
            options={[
              { method: "locker", price: priceFor(lockerQuote) },
              { method: "home", price: priceFor(homeQuote) },
            ]}
            selected={method}
            onSelect={setMethod}
            disabled={busy}
          />

          {method === "locker" && (
            <div ref={lockerRef} className="scroll-mt-4">
            <SummaryCard
              label="Detalii de livrare"
              filled={Boolean(locker)}
              onEdit={() => setSheet("locker")}
              invalid={gap === "locker"}
              leading={locker ? <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" /> : undefined}
            >
              {locker ? (
                <>
                  <span className="block text-[16px] font-semibold text-neutral-900">{locker.name}</span>
                  <span className="mt-0.5 block text-[15px] leading-snug text-neutral-500">
                    {[locker.address, locker.locality].filter(Boolean).join(", ")}
                  </span>
                </>
              ) : (
                <span className="block text-[16px] text-neutral-900">Alege un punct de ridicare</span>
              )}
            </SummaryCard>
            <GapNote show={gap === "locker"} text="Alege easybox-ul din care vrei să ridici coletul." />
            </div>
          )}

          <div ref={cardRef} className="scroll-mt-4">
            <PaymentCard
              card={card}
              invalid={gap === "card"}
              onEdit={() => {
                onNeedStripe()
                setSheet("card")
              }}
            />
            <GapNote show={gap === "card"} text="Adaugă un card ca să poți finaliza comanda." />
          </div>

          <PriceBreakdown breakdown={breakdown} formatPrice={formatMinor} />

          {activeQuote.status === "unavailable" && (
            <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-[13px] leading-snug text-amber-800">
              Nu am putut calcula costul livrării acum. Comanda merge mai departe și costul livrării nu îți este
              perceput la această plată.
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-3 text-[13px] leading-snug text-red-700">
              {error}
            </p>
          )}
        </div>

        </div>
      </div>

      <StickyPayBar
        total={formatMinor(breakdown.totalCents)}
        onAction={pay}
        busy={busy}
        hint={card && !stripe ? "Se pregătește plata securizată…" : null}
      />

      {/* ── The subpages ───────────────────────────────────────────────────── */}
      <AddressSheet
        open={sheet === "address"}
        initial={address}
        needsStreet={needsStreet}
        needsEmail={!isLoggedIn}
        onClose={() => setSheet(null)}
        onSave={setAddress}
      />

      <LockerScreen
        open={sheet === "locker"}
        initial={locker}
        carrierId={carrierId}
        onClose={() => setSheet(null)}
        onSelect={(l) => {
          setLocker(l)
          setSheet(null)
        }}
      />

      <CardSheet
        open={sheet === "card"}
        onClose={() => setSheet(null)}
        onSave={setCard}
        billingName={contactName}
        billingEmail={email}
      />
    </div>
  )
}
