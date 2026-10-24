"use client"

/**
 * ===========================================================================
 *  INSTANT CHECKOUT: A DOWNLOAD OR A COURSE, PAID FOR WITHOUT LEAVING THE PAGE
 * ===========================================================================
 * Round 10, the owner: "the checkout is like the one in the community when
 * choosing the pricing card, the same modal". So this is the community's
 * checkout window (./checkout-window), with the seller's mark and name in the
 * grey head, the product under them, and Stripe's one line card field and the
 * device's wallet (components/community/public/compact-pay) in the body.
 *
 * IT PAYS THE WAY /checkout PAYS, through the same routes and nothing else:
 *
 *   paid    /api/checkout/stripe-session makes the PaymentIntent from the
 *           product as the database prices it (and the code, and the tax);
 *           Stripe confirms the card in its own frame (3-D Secure in a window
 *           over the page); /api/checkout/confirm-payment makes the order
 *           (lib/checkout/fulfil-payment), the same order the webhook makes,
 *           never a second, and answers the receipt.
 *   free    /api/checkout/process, the free checkout: the order, the
 *           entitlement and the emails.
 *   code    /api/coupons/validate, as the checkout page asks it.
 *
 * So the receipt, the emails, the library, the sales limit and the seller's
 * order are exactly the checkout page's. The order's body is built by
 * lib/onepage/product-block instantOrderBody, in the shape the checkout page
 * sends.
 *
 * WHEN IT CANNOT. The product facts (/api/onepage/product) say whether the
 * window can take this product; when not (a sign in first, pay what you want,
 * sold out) it says why and offers Continue to the checkout page, as the
 * community's window does for a plan it cannot sell.
 */
import * as React from "react"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { digitalTax, type CheckoutTax } from "@/lib/tax/rules"
import { WAIT_MS, requestJson } from "@/lib/net/request"
import { instantOrderBody } from "@/lib/onepage/product-block"
import { onePageOutboundHref, platformHref } from "@/lib/onepage/return-address"
import { isOnePagePreview, showPreviewNotice } from "@/lib/onepage/preview-notice"
import { tt } from "@/lib/i18n/text"
import { CompactPay, type StartedPayment } from "@/components/community/public/compact-pay"
import { CheckoutMark, CheckoutWindow } from "./checkout-window"

export interface ProductFacts {
  product: {
    id: string
    title: string
    slug: string | null
    type: string | null
    descriptionHtml: string
    priceCents: number
    compareAtCents: number | null
    pwyw: boolean
    pwywMinCents: number
    currency: string
    images: string[]
    variants: { id: string; name: string; description: string | null; priceCents: number; pwyw: boolean }[]
    soldOut: boolean
    left: number | null
    pageUrl: string
    ships: boolean
  }
  seller: { name: string; avatarUrl: string | null }
  checkout: { instant: boolean; reason: string | null; url: string; tax: CheckoutTax | null; marketingOptIn: boolean; lastNameRequired: boolean }
  buyer: { email: string; name: string; owned: boolean; ownedVariants: string[]; library: string } | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** One read of a product's facts per page view, shared by the sheet and the window. */
const factsCache = new Map<string, Promise<ProductFacts>>()
export function loadProductFacts(productId: string, fresh = false): Promise<ProductFacts> {
  const had = factsCache.get(productId)
  if (had && !fresh) return had
  const read = fetch(`/api/onepage/product?id=${encodeURIComponent(productId)}`, { cache: "no-store" }).then(async (r) => {
    const data = (await r.json().catch(() => ({}))) as ProductFacts & { error?: string }
    if (!r.ok || !data.product) throw new Error(data.error || "This product is not for sale right now.")
    return data
  })
  read.catch(() => factsCache.delete(productId))
  factsCache.set(productId, read)
  return read
}

async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string; url?: string } }> {
  const r = await requestJson<T & { error?: string; code?: string; url?: string }>(url, { method: "POST", json: body, timeoutMs: WAIT_MS.pay })
  if (r.status !== 0) return { ok: r.ok, status: r.status, data: r.data }
  return { ok: false, status: 0, data: { error: "The connection dropped before the payment started. Nothing was charged. Try again." } as T & { error?: string } }
}

export interface InstantCheckoutProps {
  productId: string
  /** What the block already knows, drawn while the facts arrive. */
  title: string
  sellerName?: string | null
  sellerAvatar?: string | null
  /** The option chosen in the product sheet, when there was one. */
  variantId?: string | null
  /** The page behind is dark: the window is the community's dark one. */
  dark?: boolean
  /** This page and where its visit came from, for the order's Source (lib/orders/checkout-origin-browser). */
  origin?: () => unknown
  onClose: () => void
  /** Back to the product sheet it was opened from. */
  onBack?: (() => void) | null
  /** The OnePage to come back to, for a way out to the checkout page (lib/onepage/return-address). */
  back?: string | null
}

export function InstantCheckout({ productId, title, sellerName, sellerAvatar, variantId: initialVariant = null, dark = false, origin, onClose, onBack = null, back = null }: InstantCheckoutProps) {
  /*
    IN THE EDITOR'S PREVIEW NOTHING IS CHARGED (round 11). The window opens
    exactly as it does live, so the creator sees it, and Pay says it is a
    preview instead of starting a payment: no PaymentIntent is made, nothing
    is sent (components/onepage/preview-document answers the writes anyway).
  */
  const [preview] = React.useState(isOnePagePreview)
  const [facts, setFacts] = React.useState<ProductFacts | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState<{ receiptToken: string; free: boolean; email: string } | null>(null)
  const [email, setEmail] = React.useState("")
  const [name, setName] = React.useState("")
  const [optIn, setOptIn] = React.useState(false)
  const [variantId, setVariantId] = React.useState<string | null>(initialVariant)
  const [codeOpen, setCodeOpen] = React.useState(false)
  const [code, setCode] = React.useState("")
  const [codeBusy, setCodeBusy] = React.useState(false)
  const [codeError, setCodeError] = React.useState<string | null>(null)
  const [applied, setApplied] = React.useState<{ code: string; label: string; discountCents: number } | null>(null)
  const started = React.useRef<{ paymentIntentId: string; clientSecret: string } | null>(null)

  React.useEffect(() => {
    let live = true
    loadProductFacts(productId, true)
      .then((f) => {
        if (!live) return
        setFacts(f)
        if (f.buyer) {
          setEmail((e) => e || f.buyer!.email)
          setName((n) => n || f.buyer!.name)
        }
        if (f.product.variants.length && !f.product.variants.some((v) => v.id === initialVariant)) setVariantId(f.product.variants[0].id)
      })
      .catch((e: Error) => live && setLoadError(e.message || "Check your connection and try again."))
    return () => {
      live = false
    }
  }, [productId, initialVariant])

  const product = facts?.product ?? null
  const variant = product?.variants.find((v) => v.id === variantId) ?? null
  const currency = product?.currency || "usd"
  const fmt = (cents: number) => shopMoneyIn(cents, currency)
  const baseCents = variant ? variant.priceCents : product?.priceCents ?? 0
  const discountCents = applied ? Math.min(baseCents, applied.discountCents) : 0
  const taxView = facts?.checkout.tax ?? null
  const tax = taxView
    ? digitalTax(
        { enabled: true, digital: true, included: taxView.included, regions: taxView.regions.map((r) => ({ ...r, region: null })), overrides: taxView.overrides },
        { taxableCents: baseCents - discountCents, tipCents: 0, productId, country: taxView.country },
      )
    : null
  const totalCents = tax ? tax.totalCents : Math.max(0, baseCents - discountCents)
  const free = totalCents <= 0
  const ownsThis = !!facts?.buyer && (facts.buyer.owned || (!!variant && facts.buyer.ownedVariants.includes(variant.id)))

  /** What the buyer typed, checked before anything is sent. */
  const problem = (): string | null => {
    if (!EMAIL.test(email.trim())) return "Enter a valid email address."
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return "Enter your name."
    if (facts?.checkout.lastNameRequired && parts.length < 2) return "Enter your first and last name."
    return null
  }
  const order = (isFree: boolean) => instantOrderBody({ productId, variantId: variant?.id ?? null, couponCode: applied?.code ?? "", email, name, emailOptIn: optIn, taxCountry: taxView ? taxView.country : null, origin: origin?.() }, isFree)

  const paid = React.useCallback(
    (receiptToken: string, total: number, wasFree: boolean) => {
      /* The store's own analytics hear the purchase, as on /checkout (components/analytics/ga-route). */
      try {
        window.dispatchEvent(new CustomEvent("storelib:paid", { detail: { ref: receiptToken, totalCents: total } }))
      } catch {
        /* nothing to tell */
      }
      setDone({ receiptToken, free: wasFree, email: email.trim() })
    },
    [email],
  )

  /* ── Paid: the checkout's own PaymentIntent, confirmed by Stripe, the order by confirm-payment ── */
  const start = async (paymentMethodId: string): Promise<StartedPayment> => {
    void paymentMethodId
    if (preview) {
      showPreviewNotice("payment")
      throw new Error(tt("This is a preview. Nothing was charged."))
    }
    const p = problem()
    if (p) throw new Error(p)
    const res = await postJson<{ clientSecret?: string; paymentIntentId?: string }>("/api/checkout/stripe-session", order(false))
    if (!res.ok || !res.data.clientSecret || !res.data.paymentIntentId) throw new Error(res.data.error || "The payment could not be started. Nothing was charged.")
    started.current = { paymentIntentId: res.data.paymentIntentId, clientSecret: res.data.clientSecret }
    return { clientSecret: res.data.clientSecret, type: "payment" }
  }
  const afterStripe = async () => {
    const st = started.current
    if (!st) return
    let last = "Your payment went through. The order is still being saved and your receipt is on its way by email. You will not be charged again."
    for (const wait of [0, 1500, 4000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait))
      const res = await postJson<{ receiptToken?: string; amountCents?: number }>("/api/checkout/confirm-payment", { paymentIntentId: st.paymentIntentId, clientSecret: st.clientSecret })
      if (res.ok && res.data.receiptToken) {
        paid(res.data.receiptToken, res.data.amountCents ?? totalCents, false)
        return
      }
      if (res.status >= 400 && res.status < 500) {
        last = res.data.error || last
        break
      }
    }
    throw new Error(last)
  }

  /* ── Free: the free checkout ── */
  const takeFree = async () => {
    if (busy) return
    if (preview) {
      showPreviewNotice("payment")
      return setError(tt("This is a preview. Nothing was charged."))
    }
    const p = problem()
    if (p) return setError(p)
    setBusy(true)
    setError(null)
    try {
      const res = await postJson<{ receiptToken?: string }>("/api/checkout/process", order(true))
      if (!res.ok || !res.data.receiptToken) throw new Error(res.data.error || "The order could not be finished. Try again.")
      paid(res.data.receiptToken, 0, true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The order could not be finished. Try again.")
    } finally {
      setBusy(false)
    }
  }

  /* ── A code, checked as the checkout page checks it ── */
  const applyCode = async () => {
    const typed = code.trim()
    if (!typed || codeBusy) return
    setCodeBusy(true)
    setCodeError(null)
    try {
      const res = await postJson<{ ok?: boolean; code?: string; label?: string; discountCents?: number }>("/api/coupons/validate", { code: typed, productId, variantId: variant?.id ?? null, customPriceCents: null, pricing: null })
      if (!res.data.ok) return setCodeError(res.data.error || "That code is not valid.")
      setApplied({ code: res.data.code || typed, label: res.data.label || "", discountCents: res.data.discountCents || 0 })
    } catch {
      setCodeError("The code could not be checked. Try again.")
    } finally {
      setCodeBusy(false)
    }
  }

  const field = "h-12 w-full rounded-xl border border-[#e1e3e7] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:shadow-[0_0_0_1px_#1a1a2e] disabled:opacity-60"
  const shownName = facts?.seller.name || sellerName || ""
  const continueLink = (label: string, href: string) => (
    <a href={onePageOutboundHref(href, back)} className="inline-flex h-11 items-center rounded-xl border border-[#e5e7eb] px-4 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f7f7f8]" data-instant-continue="">
      {label}
    </a>
  )

  return (
    <CheckoutWindow
      mark={<CheckoutMark imageUrl={facts?.seller.avatarUrl ?? sellerAvatar ?? null} name={shownName || title} size={60} />}
      title={shownName || title}
      subtitle={product?.title || title}
      onBack={onBack}
      backLabel="Back"
      onClose={onClose}
      busy={busy}
      dark={dark}
      dataName="instant-checkout"
      labelId="instant-checkout-title"
    >
      {loadError ? (
        <div className="space-y-3 py-4 text-center" data-checkout-unavailable="">
          <p className="text-[14.5px] text-[#4b5563]">{loadError}</p>
        </div>
      ) : !facts || !product ? (
        <div aria-hidden className="space-y-3">
          <div className="h-[92px] rounded-xl bg-[#f3f4f6]" />
          <div className="h-12 rounded-xl bg-[#f3f4f6]" />
          <div className="h-12 rounded-xl bg-[#f7f7f8]" />
          <div className="h-[52px] rounded-xl bg-[#eceef1]" />
        </div>
      ) : done ? (
        <div role="status" className="rounded-2xl border border-[#e5e7eb] px-5 py-6 text-center" data-checkout-done="">
          <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#ecfdf3] text-[#15803d]">
            <Check aria-hidden className="h-5 w-5" />
          </span>
          <p className="mt-3 text-[18px] font-semibold text-[#1a1a2e]">{done.free ? "It's yours" : "Payment complete"}</p>
          <p className="mt-1 text-[14px] text-[#6b7280]">We sent your receipt and your access to {done.email}.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <a href={platformHref(`/receipt/${encodeURIComponent(done.receiptToken)}`)} className="inline-flex h-11 items-center justify-center rounded-xl bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white hover:bg-[#2a2a40]" data-instant-receipt="">
              Open it now
            </a>
          </div>
        </div>
      ) : ownsThis ? (
        <div className="space-y-3 py-4 text-center" data-instant-owned="">
          <p className="text-[14.5px] text-[#4b5563]">You already have this. It is in your library.</p>
          {continueLink("Open your library", platformHref(facts.buyer!.library))}
        </div>
      ) : !facts.checkout.instant ? (
        <div className="space-y-3 py-4 text-center" data-checkout-unavailable="">
          <p className="text-[14.5px] text-[#4b5563]">{facts.checkout.reason || "This one is bought on its checkout page."}</p>
          {product.soldOut ? null : continueLink("Continue", facts.checkout.url)}
        </div>
      ) : (
        <div className="space-y-5">
          {preview ? (
            <p role="status" className="rounded-xl bg-[#f4f4f6] px-3.5 py-2.5 text-center text-[13px] leading-snug text-[#4b5563]" data-instant-preview="">
              {tt("This is a preview. Nothing is charged here.")}
            </p>
          ) : null}
          {product.variants.length > 1 ? (
            <section aria-labelledby="instant-options">
              <h3 id="instant-options" className="mb-2 text-[14.5px] font-semibold text-[#1a1a2e]">
                Options
              </h3>
              <div role="radiogroup" aria-labelledby="instant-options" className="grid gap-2.5">
                {product.variants.map((v) => {
                  const on = variantId === v.id
                  return (
                    <button
                      key={v.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={busy}
                      onClick={() => {
                        setVariantId(v.id)
                        setError(null)
                        if (applied) {
                          setApplied(null)
                          setCodeError("Apply the code again for this option.")
                        }
                      }}
                      className={cn("relative flex items-center gap-3 rounded-xl border bg-white px-3.5 py-3 text-left outline-none transition-[border-color,box-shadow,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30", on ? "border-[#1a1a2e] shadow-[0_0_0_1px_#1a1a2e] [[data-community-theme=dark]_&]:border-[#e4e4e7]! [[data-community-theme=dark]_&]:shadow-[0_0_0_1px_#e4e4e7]!" : "border-[#e1e3e7] bg-[#fbfbfc] hover:border-[#c9ccd2]")}
                      data-instant-variant={v.id}
                    >
                      <span aria-hidden className={cn("grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors duration-150", on ? "border-[#1a1a2e] bg-[#1a1a2e] [[data-community-theme=dark]_&]:border-[#e4e4e7]! [[data-community-theme=dark]_&]:bg-[#e4e4e7]!" : "border-[#c9ccd2] bg-white")}>
                        {on ? <span className="h-1.5 w-1.5 rounded-full bg-white [[data-community-theme=dark]_&]:bg-[#18181b]!" /> : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#1a1a2e]">{v.name}</span>
                      <span className="shrink-0 text-[14px] font-semibold tabular-nums text-[#1a1a2e]">{v.priceCents > 0 ? fmt(v.priceCents) : "Free"}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="instant-contact" className="space-y-2.5">
            <h3 id="instant-contact" className="text-[14.5px] font-semibold text-[#1a1a2e]">
              Your details
            </h3>
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" disabled={busy} className={field} data-instant-email="" />
            <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={facts.checkout.lastNameRequired ? "First and last name" : "Name"} aria-label="Name" disabled={busy} className={field} data-instant-name="" />
            {facts.checkout.marketingOptIn ? (
              <label className="flex cursor-pointer items-center gap-2.5 py-1 text-[13.5px] text-[#4b5563]">
                <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="h-4 w-4 accent-[#1a1a2e]" />
                Email me news and offers
              </label>
            ) : null}
          </section>

          <div className="rounded-xl border border-[#e5e7eb]" data-checkout-summary="">
            <div className="flex min-h-12 items-center gap-2 px-4 text-[14px]">
              <span className="min-w-0 flex-1 truncate text-[#6b7280]">{variant ? `${product.title}, ${variant.name}` : product.title}</span>
              {product.compareAtCents && !variant ? <s className="tabular-nums text-[#9ca3af]">{fmt(product.compareAtCents)}</s> : null}
              <span className="font-semibold tabular-nums text-[#1a1a2e]" data-due-today="">
                {free ? "Free" : fmt(totalCents)}
              </span>
            </div>
            {applied || (tax && tax.taxCents > 0) ? (
              <dl className="space-y-2 border-t border-[#f1f2f4] px-4 py-3 text-[13.5px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#6b7280]">Price</dt>
                  <dd className="tabular-nums text-[#1a1a2e]">{fmt(baseCents)}</dd>
                </div>
                {applied ? (
                  <div className="flex justify-between gap-3" data-instant-discount="">
                    <dt className="text-[#6b7280]">Code {applied.code}</dt>
                    <dd className="tabular-nums text-[#15803d]">-{fmt(discountCents)}</dd>
                  </div>
                ) : null}
                {tax && tax.taxCents > 0 ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#6b7280]">{tax.included ? `${tax.label} (included)` : tax.label}</dt>
                    <dd className="tabular-nums text-[#1a1a2e]">{fmt(tax.taxCents)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>

          <div data-instant-code="">
            {applied ? (
              <button type="button" onClick={() => { setApplied(null); setCode("") }} className="text-[13px] font-medium text-[#6b7280] underline decoration-[#d1d5db] underline-offset-2 hover:text-[#1a1a2e]">
                Remove code
              </button>
            ) : codeOpen ? (
              <div className="flex gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyCode()} placeholder="Discount code" aria-label="Discount code" autoCapitalize="characters" className={cn(field, "h-11 text-[15px]")} />
                <button type="button" onClick={applyCode} disabled={codeBusy || !code.trim()} className="inline-flex h-11 shrink-0 items-center rounded-xl border border-[#e5e7eb] px-4 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f7f7f8] disabled:opacity-60">
                  {codeBusy ? "Checking" : "Apply"}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setCodeOpen(true)} className="inline-flex items-center gap-1 text-[13px] font-medium text-[#6b7280] hover:text-[#1a1a2e]">
                Have a code?
                <ChevronDown aria-hidden className="h-3.5 w-3.5" />
              </button>
            )}
            {codeError ? <p className="mt-1.5 text-[13px] text-[#b42318]">{codeError}</p> : null}
          </div>

          {free ? (
            <button
              type="button"
              onClick={takeFree}
              disabled={busy}
              className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-5 text-[16px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(16,24,40,0.2)] outline-none transition-[background-color,opacity] duration-150 hover:bg-[#2a2a40] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-60"
              data-pay-submit=""
            >
              {busy ? <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" /> : null}
              {busy ? "Processing" : "Get it free"}
            </button>
          ) : (
            <section aria-labelledby="instant-pay">
              <h3 id="instant-pay" className="mb-2 text-[14.5px] font-semibold text-[#1a1a2e]">
                Payment method
              </h3>
              <CompactPay
                key={`${variant?.id ?? ""}:${totalCents}`}
                dueTodayCents={totalCents}
                currency={currency}
                label={`${shownName ? `${shownName}, ` : ""}${product.title}`}
                payLabel={`Pay ${fmt(totalCents)}`}
                dark={dark}
                email={email.trim()}
                name={name.trim()}
                start={start}
                onConfirmed={afterStripe}
                onError={setError}
                busy={busy}
                setBusy={setBusy}
                allowLink
              />
            </section>
          )}
          {error ? (
            <p role="alert" className="-mt-2 text-[13.5px] leading-snug text-[#b42318]" data-checkout-error="">
              {error}
            </p>
          ) : null}
          <p className="text-center text-[11.5px] leading-relaxed text-[#8b919a]" data-instant-terms="">
            {free ? "By getting it" : "By paying"} you agree to the{" "}
            <a href={platformHref("/terms")} target="_blank" rel="noopener" className="underline decoration-[#d1d5db] underline-offset-2 hover:text-[#1a1a2e]">
              Terms
            </a>
            . Your receipt and access come by email.
          </p>
        </div>
      )}
    </CheckoutWindow>
  )
}
