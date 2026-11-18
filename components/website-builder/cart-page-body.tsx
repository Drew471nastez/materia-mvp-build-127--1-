"use client"

/**
 * ===========================================================================
 *  THE CART PAGE
 * ===========================================================================
 * The drawer is for a glance and a change of mind. This is the page a
 * shopper lands on to check what they are about to pay for, and the one that
 * starts the payment.
 *
 * It takes its colours from the creator's theme, passed in already resolved
 * rather than resolved here, because a cart is not a section and has no
 * section settings to resolve from.
 *
 * WHAT IT DOES NOT DO: collect a name, an email or an address. Stripe's
 * hosted checkout collects what the payment needs, and a second form in
 * front of it is a second place for a typo and a second thing to keep in
 * step with what Stripe already asks for. The one exception is a discount
 * code that makes the whole basket free: there is no Stripe page then, so
 * the name, the address and the Terms are asked here, and only then.
 *
 * A DISCOUNT CODE is checked by the server against this basket (the same
 * pricing Check out uses, /api/coupons/validate), laid out as the product
 * checkout lays it out: a field and Apply, then the code and what it takes
 * off. A link with ?discountCode= applies it as the page opens. The totals
 * shown are the server's once a code is on.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { ShoppingBag, Minus, Plus, Trash2, X } from "lucide-react"
import { ProductImg, isDarkColor } from "@/components/media/missing-image"
import { useSiteCart } from "./site-cart"
import { checkoutItems, lineKey } from "@/lib/website-builder/cart"
import { CartLineProperties } from "@/components/website-builder/cart-line-properties"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"
import { getMainDomain } from "@/lib/url-helpers"
import { physicalCheckoutHref } from "@/lib/physical/cart-link"
import { CartReturnsNote } from "./theme/shop-commerce"
import { useAmountMoney, useCartMoney, useStorefront, useWord } from "./theme/storefront-context"
import { CartOfferSavings, CartOfferSuggestions, offerDiscount, useCartOffers } from "@/components/offers/cart-offers"
import { cartPathFor } from "@/lib/website-builder/cart-checkout"
import { attemptIdOf } from "@/lib/checkout/attempt-id"
import { CART_NOTE_MAX, onWebsiteHost, siteCheckoutHref } from "@/lib/checkout/site-checkout"
import { useBackFromCache } from "@/hooks/use-back-from-cache"
import { readCartExtras, writeCartExtras } from "@/lib/website-builder/cart-extras"
import { checkoutIntent } from "@/lib/website-builder/checkout-prefetch"

export interface CartPalette {
  bg: string
  text: string
  heading: string
  border: string
  buttonBg: string
  buttonText: string
}

interface AppliedCode {
  code: string
  label: string
  /** Everything off: the offers' part and the code's. */
  discountCents: number
  /** The store's upsells and bundles' part (lib/offers). */
  offerCents: number
  subtotalCents: number
  totalCents: number
}

export function CartPageBody({ palette, radius }: { palette: CartPalette; radius: number }) {
  const { lines, ready, setQty, remove, clear, count, shopId, add } = useSiteCart()
  /* Amounts as the product cards show them and checkout adds them up: the visitor's market's currency, or the store's. */
  const cartMoney = useCartMoney()
  /* Back from checkout lands on this cart, in the page's language. */
  const cartPath = cartPathFor(useStorefront().language)
  /* The shop's own words, in the page's language (lib/markets/ui-words.ts). */
  const w = useWord()
  const [busy, setBusy] = useState(false)
  /* Back from the payment page, restored from the browser's cache: not still on its way there. */
  useBackFromCache(() => setBusy(false))
  const [error, setError] = useState<string | null>(null)
  const [dropped, setDropped] = useState<string[]>([])

  /* ── Discount code ─────────────────────────────────────────────── */
  const [code, setCode] = useState("")
  /* A note for the shop, for a cart with something to post: the checkout's own note starts with it (lib/checkout/site-checkout cartNote), and the order keeps it. */
  const [note, setNote] = useState("")
  const [applied, setApplied] = useState<AppliedCode | null>(null)
  const [codeBusy, setCodeBusy] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)
  /** The reason is about a code the page applied itself (from the link, or again after the basket changed): said quietly. */
  const [codeQuiet, setCodeQuiet] = useState(false)
  const items = JSON.stringify(checkoutItems(lines))
  /* The store's upsells and bundles for this cart (components/offers/cart-offers.tsx): what it gets now and what it could add. With a code on, the code's check prices them too. */
  const offers = useCartOffers(lines, shopId, ready)
  const offerCents = applied ? applied.offerCents : (offers?.offerCents ?? 0)
  const amounts = cartMoney(lines, applied ? { subtotalCents: applied.subtotalCents, discountCents: applied.discountCents } : offerDiscount(lines, offers))
  const amountMoney = useAmountMoney()
  const unitMoney = (cents: number) => cartMoney([{ priceCents: cents, quantity: 1 }]).lines[0]

  const applyCode = useCallback(
    async (typed: string, quiet: boolean) => {
      const value = typed.trim()
      if (!value) return
      setCodeBusy(true)
      setCodeError(null)
      setCodeQuiet(quiet)
      try {
        const res = await fetch("/api/coupons/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: value, items: JSON.parse(items) }),
        })
        const data = await res.json().catch(() => ({}))
        if (!data?.ok) {
          setApplied(null)
          setCodeError(typeof data?.error === "string" ? data.error : "That code is not valid.")
          return
        }
        setApplied({
          code: data.code || value,
          label: data.label || "",
          discountCents: Number(data.discountCents) || 0,
          offerCents: Number(data.offerCents) || 0,
          subtotalCents: Number(data.subtotalCents) || 0,
          totalCents: Math.max(0, Number(data.totalCents) || 0),
        })
        setCode(data.code || value)
      } catch {
        setCodeError("The code could not be checked. Try again.")
      } finally {
        setCodeBusy(false)
      }
    },
    [items],
  )

  /* ?discountCode= in the link, else the code and note kept from before a reload (lib/website-builder/cart-extras): applied once the basket has been read. */
  const linkCode = useRef<string | null>(null)
  useEffect(() => {
    if (!ready || linkCode.current !== null) return
    let fromLink = ""
    try {
      fromLink = new URLSearchParams(window.location.search).get("discountCode")?.trim().slice(0, 64) ?? ""
    } catch {
      /* no address to read */
    }
    const kept = readCartExtras(shopId)
    if (kept.note) setNote(kept.note)
    const first = fromLink || kept.code
    linkCode.current = first
    if (first && lines.length > 0) {
      setCode(first)
      void applyCode(first, true)
    }
  }, [ready, lines.length, applyCode, shopId])

  /* What is applied and written is kept, so a reload or the drawer's Check out still has it. */
  useEffect(() => {
    if (!ready || linkCode.current === null) return
    writeCartExtras(shopId, { code: applied?.code ?? "", note })
  }, [ready, shopId, applied?.code, note])

  /* Another quantity or one line fewer is another price: the code is priced
     again, once the presses have stopped (the check is rate limited). */
  const pricedFor = useRef(items)
  useEffect(() => {
    if (pricedFor.current === items || !applied || lines.length === 0) return
    const again = window.setTimeout(() => {
      pricedFor.current = items
      void applyCode(applied.code, true)
    }, 500)
    return () => window.clearTimeout(again)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  function removeCode() {
    setApplied(null)
    setCode("")
    setCodeError(null)
  }

  /* ── A basket the code makes free: who it is for ──────────────── */
  const free = applied !== null && applied.totalCents === 0
  const [askDetails, setAskDetails] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [agreed, setAgreed] = useState(false)
  const showDetails = free || askDetails
  /* This page's press of the free order (lib/checkout/attempt-id): sent again after a lost answer, the server answers the basket it already wrote (lib/checkout/free-claim). */
  const freeAttempt = useRef<string | null>(null)

  /* The website's own checkout for a cart with something to post (app/checkout/site), which asks for the address and the delivery; null on a preview on storelib.com, or a cart of downloads, which asks the server first. */
  const siteHref = (): string | null =>
    shopId && lines.some((l) => l.physical) && onWebsiteHost(window.location.hostname, getMainDomain(), window.location.pathname)
      ? siteCheckoutHref({ items: checkoutItems(lines), back: cartPath, couponCode: applied?.code ?? null, wholeCart: true, note })
      : null

  async function pay() {
    /* Something that ships: the physical checkout, which asks for the address and the delivery (lib/physical). */
    if (shopId && lines.some((l) => l.physical)) {
      setBusy(true)
      /* On the website: its own checkout, on this same address. A preview on storelib.com keeps the platform's. */
      window.location.href = siteHref() ?? physicalCheckoutHref(shopId, checkoutItems(lines), window.location.href)
      return
    }
    setBusy(true)
    setError(null)
    setDropped([])
    try {
      const res = await fetch("/api/checkout/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* `origin`: this website and where its visit came from, for the
           order's Source (lib/orders/checkout-origin). */
        body: JSON.stringify({
          items: checkoutItems(lines),
          returnPath: cartPath,
          origin: pageOrigin(),
          ...(applied ? { couponCode: applied.code } : {}),
          ...(showDetails ? { buyer: { firstName, lastName, email, agreedToTerms: agreed }, attemptId: attemptIdOf(freeAttempt) } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) {
        if (data?.needsDetails) setAskDetails(true)
        setError(typeof data?.error === "string" ? data.error : "Could not start the checkout.")
        setBusy(false)
        return
      }
      if (Array.isArray(data.dropped) && data.dropped.length > 0) setDropped(data.dropped)
      /* A free basket is already an order: it leaves the cart now. A paid
         one stays until Stripe has taken the money. */
      if (data.free === true) clear()
      window.location.href = data.url
    } catch {
      setError("Could not reach the checkout. Check your connection and try again.")
      setBusy(false)
    }
  }

  /* Before local storage has been read there is nothing truthful to draw.
     A skeleton here would flash on every visit for one frame. */
  if (!ready) return <div className="min-h-[40vh]" aria-hidden />

  if (lines.length === 0) {
    return (
      <div
        className="flex min-h-[46vh] flex-col items-center justify-center gap-3 px-6 text-center"
        style={{ background: palette.bg, color: palette.text }}
      >
        <ShoppingBag className="h-8 w-8 opacity-25" strokeWidth={1.5} />
        <h1 className="text-[22px] font-semibold" style={{ color: palette.heading }}>{w("cart_empty")}</h1>
        <a href="/products" className="text-[15px] font-medium underline underline-offset-4">
          {w("continue_shopping")}
        </a>
      </div>
    )
  }

  return (
    <div style={{ background: palette.bg, color: palette.text }}>
      <div className="mx-auto w-full max-w-[860px] px-5 py-10 sm:px-6 sm:py-14">
        <h1 className="text-[26px] sm:text-[30px] font-bold" style={{ color: palette.heading }}>
          {w("cart_title")}
        </h1>
        <p className="mt-1 text-[14px] opacity-65">{count === 1 ? "One item" : `${count} items`}</p>

        <ul className="mt-7">
          {lines.map((l, i) => {
            const k = lineKey(l)
            return (
              <li
                key={k}
                className="flex gap-4 py-5 border-b first:border-t"
                style={{ borderColor: palette.border }}
              >
                <a
                  href={`/products/${l.slug}`}
                  className="h-[84px] w-[84px] shrink-0 overflow-hidden sm:h-[96px] sm:w-[96px]"
                  style={{ background: palette.border, borderRadius: radius }}
                >
                  <ProductImg src={l.thumbnailUrl} className="h-full w-full object-cover" loading="lazy" dark={isDarkColor(palette.bg)} />
                </a>
                <div className="flex min-w-0 flex-1 flex-col">
                  <a
                    href={`/products/${l.slug}`}
                    className="text-[16px] font-semibold leading-snug"
                    style={{ color: palette.heading }}
                  >
                    {l.title}
                  </a>
                  {l.variantName && <p className="mt-0.5 text-[13px] opacity-60">{l.variantName}</p>}
                  <CartLineProperties properties={l.properties} className="mt-0.5 space-y-0.5 text-[13px] opacity-70" />
                  <div className="mt-auto flex items-center gap-4 pt-3">
                    {l.digital ? (
                      <button
                        type="button"
                        onClick={() => remove(k)}
                        className="flex items-center gap-1.5 text-[13px] opacity-65 hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.8} />
                        Remove
                      </button>
                    ) : (
                      <div
                        className="flex items-center rounded-full"
                        style={{ border: `1px solid ${palette.border}` }}
                      >
                        <button
                          type="button"
                          onClick={() => setQty(k, l.quantity - 1)}
                          aria-label={l.quantity === 1 ? `Remove ${l.title}` : `One fewer ${l.title}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5"
                        >
                          {l.quantity === 1
                            ? <Trash2 className="h-[14px] w-[14px]" strokeWidth={1.8} />
                            : <Minus className="h-[14px] w-[14px]" strokeWidth={2} />}
                        </button>
                        <span className="w-7 text-center text-[14px] tabular-nums">{l.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setQty(k, l.quantity + 1)}
                          aria-label={`One more ${l.title}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5"
                        >
                          <Plus className="h-[14px] w-[14px]" strokeWidth={2} />
                        </button>
                      </div>
                    )}
                    <span className="ml-auto text-[16px] font-semibold tabular-nums" style={{ color: palette.heading }}>
                      {amounts.lines[i]}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        {/* Upsells shown in the cart and bundles it holds part of (lib/offers). */}
        <div className="mt-6 max-w-[520px] empty:hidden">
          <CartOfferSuggestions data={offers} onAdd={(added) => added.forEach((l) => add(l))} money={unitMoney} colors={{ text: palette.heading, muted: palette.text, border: palette.border, buttonBg: palette.buttonBg, buttonText: palette.buttonText }} radius={radius} />
        </div>

        <div className="mt-8 flex flex-col items-end gap-4">
          <div className="w-full sm:w-[300px]">
            <CodeField
              palette={palette}
              radius={radius}
              code={code}
              onCode={(v) => {
                setCode(v)
                setCodeError(null)
              }}
              applied={applied}
              busy={codeBusy}
              error={codeError}
              quiet={codeQuiet}
              onApply={() => void applyCode(code, false)}
              onRemove={removeCode}
            />
          </div>

          <dl className="w-full space-y-2 sm:w-[300px]">
            {applied || offerCents > 0 ? (
              <>
                <div className="flex items-baseline justify-between">
                  <dt className="text-[15px] opacity-70">{w("subtotal")}</dt>
                  <dd className="text-[15px] tabular-nums">{amounts.subtotal}</dd>
                </div>
                {/* Each bundle and upsell the cart gets: by the code's check when a code is on, else by the cart's own. */}
                <CartOfferSavings data={applied ? null : offers} money={amountMoney} className="space-y-2 text-[15px]" />
                {applied && applied.offerCents > 0 ? (
                  <div className="flex items-baseline justify-between">
                    <dt className="text-[15px] opacity-70">{w("bundles_and_offers")}</dt>
                    <dd className="text-[15px] tabular-nums">&minus;{amountMoney(applied.offerCents)}</dd>
                  </div>
                ) : null}
                {applied ? (
                  <div className="flex items-baseline justify-between">
                    <dt className="text-[15px] opacity-70">{w("discount")} ({applied.code})</dt>
                    <dd className="text-[15px] tabular-nums">&minus;{applied.offerCents > 0 ? amountMoney(applied.discountCents - applied.offerCents) : amounts.discount}</dd>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between pt-1">
                  <dt className="text-[15px] opacity-70">{w("total")}</dt>
                  <dd className="text-[22px] font-bold tabular-nums" style={{ color: palette.heading }}>
                    {amounts.total}
                  </dd>
                </div>
              </>
            ) : (
              <div className="flex items-baseline justify-between">
                <dt className="text-[15px] opacity-70">{w("subtotal")}</dt>
                <dd className="text-[22px] font-bold tabular-nums" style={{ color: palette.heading }}>
                  {amounts.subtotal}
                </dd>
              </div>
            )}
          </dl>
          {/* Something to post: delivery and any tax are added at checkout, where the address is, said as a shop's cart says it. */}
          {lines.some((l) => l.physical) ? (
            <p data-cart-shipping-note="" className="-mt-2 w-full text-right text-[13px] opacity-60 sm:w-[300px]">
              {w("taxes_at_checkout")}
            </p>
          ) : null}

          {showDetails && (
            <FreeDetails
              palette={palette}
              radius={radius}
              firstName={firstName}
              lastName={lastName}
              email={email}
              agreed={agreed}
              onFirstName={setFirstName}
              onLastName={setLastName}
              onEmail={setEmail}
              onAgreed={setAgreed}
            />
          )}

          {lines.some((l) => l.physical) && !showDetails ? (
            <label className="block w-full sm:w-[300px]" data-cart-note="">
              <span className="mb-1.5 block text-[13px] opacity-70">{w("note_for_shop")}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, CART_NOTE_MAX))}
                rows={2}
                placeholder="Gift wrap, delivery instructions..."
                className="block w-full resize-y bg-transparent px-3.5 py-2.5 text-[16px] outline-none placeholder:opacity-50 focus:ring-2 focus:ring-current/20 sm:text-[14px]"
                style={{ border: `1px solid ${palette.border}`, borderRadius: Math.min(radius, 12), color: palette.text }}
              />
            </label>
          ) : null}

          {error && (
            <p role="alert" className="w-full text-right text-[13px] font-medium text-[#b91c1c]">
              {error}
            </p>
          )}
          {dropped.length > 0 && (
            <p className="w-full text-right text-[13px] opacity-70">
              Not included: {dropped.join(", ")}
            </p>
          )}

          <button
            type="button"
            onClick={pay}
            /* The checkout fetched ahead while the finger is on the button (lib/website-builder/checkout-prefetch). */
            {...(showDetails ? {} : checkoutIntent(siteHref))}
            disabled={busy || codeBusy}
            className="flex h-12 w-full items-center justify-center rounded-full text-[16px] font-semibold transition-opacity disabled:opacity-60 sm:w-[300px]"
            style={{ background: palette.buttonBg, color: palette.buttonText }}
          >
            {showDetails ? (busy ? "Getting your order" : w("get_it_free")) : busy ? "Taking you to payment" : w("check_out")}
          </button>
          {/* No "charged in USD" line in the cart (the owner): it is said at checkout, where the card is charged. */}
          {!showDetails && (
            <p className="w-full text-right text-[12px] opacity-55 sm:w-[300px]">
              Payment is handled by Stripe.
            </p>
          )}
          {/* Website settings › Commerce › Returns line in the cart. */}
          <CartReturnsNote className="w-full text-right text-[12.5px] opacity-70 sm:w-[300px]" />
        </div>
      </div>
    </div>
  )
}

/**
 * The code box, laid out as the product checkout's (app/checkout/parts
 * order-summary DiscountForm): a field and Apply, then the code and what it
 * takes off with a way to remove it. In the site's own colours.
 */
function CodeField({
  palette,
  radius,
  code,
  onCode,
  applied,
  busy,
  error,
  quiet,
  onApply,
  onRemove,
}: {
  palette: CartPalette
  radius: number
  code: string
  onCode: (v: string) => void
  applied: AppliedCode | null
  busy: boolean
  error: string | null
  quiet: boolean
  onApply: () => void
  onRemove: () => void
}) {
  const w = useWord()
  const r = Math.min(radius, 10)
  if (applied) {
    return (
      <div
        className="flex items-center justify-between gap-3 px-3.5 py-2.5"
        style={{ border: `1px solid ${palette.border}`, borderRadius: r }}
      >
        <span className="min-w-0 truncate text-[14px]">
          <span className="font-medium uppercase tracking-wide" style={{ color: palette.heading }}>{applied.code}</span>
          <span className="opacity-65"> · {applied.label} off</span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove discount code"
          className="flex h-8 w-8 shrink-0 items-center justify-center opacity-60 transition-opacity hover:opacity-100"
          style={{ borderRadius: r }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }
  return (
    <div>
      <label htmlFor="cart-discount-code" className="sr-only">
        {w("discount_code")}
      </label>
      <div className="flex gap-2">
        <input
          id="cart-discount-code"
          value={code}
          placeholder={w("discount_code")}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={64}
          aria-invalid={!!error && !quiet}
          aria-describedby={error ? "cart-discount-code-error" : undefined}
          onChange={(e) => onCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onApply()
            }
          }}
          className="h-11 min-w-0 flex-1 bg-transparent px-3.5 text-[16px] outline-none placeholder:opacity-50 focus:ring-2 focus:ring-current/20"
          style={{ border: `1px solid ${error && !quiet ? "#b91c1c" : palette.border}`, borderRadius: r, color: palette.text }}
        />
        <button
          type="button"
          onClick={onApply}
          disabled={!code.trim() || busy}
          className="h-11 shrink-0 px-4 text-[14px] font-semibold transition-opacity disabled:opacity-45"
          style={{ border: `1px solid ${palette.border}`, borderRadius: r, color: palette.heading }}
        >
          {busy ? "Checking" : w("apply")}
        </button>
      </div>
      {error ? (
        <p
          id="cart-discount-code-error"
          role={quiet ? "status" : "alert"}
          className="mt-1.5 text-[13px]"
          style={quiet ? { opacity: 0.7 } : { color: "#b91c1c" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Who a free basket is for: there is no Stripe page to ask. */
function FreeDetails({
  palette,
  radius,
  firstName,
  lastName,
  email,
  agreed,
  onFirstName,
  onLastName,
  onEmail,
  onAgreed,
}: {
  palette: CartPalette
  radius: number
  firstName: string
  lastName: string
  email: string
  agreed: boolean
  onFirstName: (v: string) => void
  onLastName: (v: string) => void
  onEmail: (v: string) => void
  onAgreed: (v: boolean) => void
}) {
  const r = Math.min(radius, 10)
  const field = "h-11 w-full min-w-0 bg-transparent px-3.5 text-[16px] outline-none placeholder:opacity-50 focus:ring-2 focus:ring-current/20"
  const style = { border: `1px solid ${palette.border}`, borderRadius: r, color: palette.text }
  return (
    <div className="w-full space-y-2.5 sm:w-[300px]">
      <p className="text-[14px] opacity-70">Where should we send it?</p>
      <div className="grid grid-cols-2 gap-2">
        <input aria-label="First name" placeholder="First name" autoComplete="given-name" value={firstName} maxLength={60} onChange={(e) => onFirstName(e.target.value)} className={field} style={style} />
        <input aria-label="Last name" placeholder="Last name" autoComplete="family-name" value={lastName} maxLength={60} onChange={(e) => onLastName(e.target.value)} className={field} style={style} />
      </div>
      <input
        aria-label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="Email"
        value={email}
        maxLength={254}
        onChange={(e) => onEmail(e.target.value)}
        className={field}
        style={style}
      />
      <label className="flex items-start gap-2.5 pt-1 text-[13px]">
        <input type="checkbox" checked={agreed} onChange={(e) => onAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" style={{ accentColor: palette.buttonBg }} />
        <span className="opacity-75">
          I agree to the{" "}
          <a href={`https://${getMainDomain()}/terms`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            Terms and Conditions
          </a>
        </span>
      </label>
    </div>
  )
}
