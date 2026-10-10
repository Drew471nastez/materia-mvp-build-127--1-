"use client"

/**
 * ===========================================================================
 *  THE BASKET CHECKOUT: THE SHOP'S BAR, STRIPE'S FORM INSIDE THE PAGE
 * ===========================================================================
 * The bar is the shop's (./parts/shop-bar): Back to the cart on its site, its
 * logo and name, Continue shopping. Under it, Stripe's Embedded Checkout for
 * a session app/api/checkout/cart makes from the server's prices: the lines
 * with their pictures, the email, wallets, the card, the business box, Pay.
 * Paid, Stripe sends the page to the basket's completion, which writes the
 * orders and sends the buyer back to the site.
 *
 * WHILE IT LOADS, the page is already the page: the bar, the shop's name and
 * the total the server priced, in the place Stripe's own summary arrives,
 * and the form's shape beside it. Stripe.js is asked for the moment the page
 * mounts, alongside the session, not one after the other.
 *
 * IN THE APP'S SHELL Stripe.js cannot run (./parts/stripe-loader), so the
 * page asks for Stripe's own page instead and goes there, as before.
 */
import * as React from "react"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"
import { ShoppingBag } from "lucide-react"
import { cn } from "@/lib/utils"
import { checkoutOrigin } from "@/lib/orders/checkout-origin-browser"
import { adoptCarriedTouches } from "@/lib/attribution/browser"
import type { LinkItem } from "@/lib/physical/cart-link"
import { getStripePromise, isCapacitorShell, resetStripePromise } from "../parts/stripe-loader"
import { ShopBar, type ShopBrand } from "../parts/shop-bar"
import { money } from "../parts/ui"

interface Line {
  productId: string
  variantId: string | null
  quantity: number
  title: string
  imageUrl: string | null
  lineCents: number
}

type Phase = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string }

export function BasketCheckout({
  shopId,
  brand,
  backTo,
  shopUrl,
  items,
  couponCode,
  wholeCart,
  lines,
  totalCents,
  dropped,
}: {
  shopId: string
  brand: ShopBrand
  backTo: string | null
  shopUrl: string | null
  items: LinkItem[]
  couponCode: string | null
  wholeCart: boolean
  lines: Line[]
  totalCents: number
  dropped: string[]
}) {
  const [phase, setPhase] = React.useState<Phase>({ kind: "loading" })
  /* A new session for each try: Stripe's form is made for one. */
  const [attempt, setAttempt] = React.useState(0)
  const [native, setNative] = React.useState<boolean | null>(null)
  const [leaving, setLeaving] = React.useState(false)

  React.useEffect(() => {
    adoptCarriedTouches()
    setNative(isCapacitorShell())
  }, [])

  const ask = React.useCallback(
    async (ui: "embedded" | "hosted") => {
      const res = await fetch("/api/checkout/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ items, couponCode, ui, returnUrl: backTo, wholeCart, origin: checkoutOrigin(shopId) }),
      }).catch(() => null)
      const data = ((await res?.json().catch(() => null)) ?? {}) as { clientSecret?: unknown; url?: unknown; ships?: unknown; error?: unknown }
      /* The cart turned out to ship (a product changed since the link was made): the physical checkout. */
      if (res?.ok && data.ships === true && typeof data.url === "string") {
        window.location.replace(data.url)
        return null
      }
      if (!res) throw new Error("Could not reach the checkout. Check your connection and try again.")
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "The payment form did not load. Try again.")
      return data
    },
    [items, couponCode, backTo, wholeCart, shopId],
  )

  /* The app's shell: Stripe's own page. */
  React.useEffect(() => {
    if (native !== true) return
    let gone = false
    ask("hosted")
      .then((data) => {
        if (gone || !data) return
        if (typeof data.url === "string") window.location.replace(data.url)
        else setPhase({ kind: "error", message: "The payment page did not open. Try again." })
      })
      .catch((e: Error) => !gone && setPhase({ kind: "error", message: e.message }))
    return () => {
      gone = true
    }
  }, [native, ask, attempt])

  /*
    THE SESSION IS ASKED FOR AT ONCE, beside Stripe.js, not after it: Stripe's
    provider asks for the secret only once its script is in, and waiting for
    that before even starting the request was the slow way round. One request
    per try, whoever asks first.
  */
  const started = React.useRef<{ attempt: number; secret: Promise<string> } | null>(null)
  const secret = React.useCallback(() => {
    if (!started.current || started.current.attempt !== attempt) {
      const promise = ask("embedded").then((data) => {
        if (!data) return new Promise<string>(() => {})
        if (typeof data.clientSecret !== "string") throw new Error("The payment form did not load. Try again.")
        return data.clientSecret
      })
      promise.catch((e: unknown) => setPhase({ kind: "error", message: e instanceof Error ? e.message : "The payment form did not load. Try again." }))
      started.current = { attempt, secret: promise }
    }
    return started.current.secret
  }, [ask, attempt])
  const fetchClientSecret = React.useCallback(async () => {
    const value = await secret()
    setPhase({ kind: "ready" })
    return value
  }, [secret])
  const options = React.useMemo(() => ({ fetchClientSecret }), [fetchClientSecret])
  /* Stripe.js on its way at once too. A script that never comes (blocked, offline) says so, with Try again. */
  const stripe = React.useMemo(() => (native === false ? getStripePromise() : null), [native, attempt]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (native !== false || !stripe) return
    void secret().catch(() => {})
    let settled = false
    const fail = () => setPhase((p) => (p.kind === "error" ? p : { kind: "error", message: "The payment form did not load. Check your connection and try again." }))
    stripe.then((s) => {
      settled = true
      if (!s) fail()
    }, () => {
      settled = true
      fail()
    })
    const slow = window.setTimeout(() => {
      if (!settled) fail()
    }, 20_000)
    return () => window.clearTimeout(slow)
  }, [native, stripe, secret])

  const retry = () => {
    resetStripePromise()
    setPhase({ kind: "loading" })
    setAttempt((n) => n + 1)
  }

  return (
    <div data-page="basket-checkout" className={cn("min-h-dvh bg-white transition-opacity duration-100", leaving && "pointer-events-none opacity-80")}>
      <ShopBar brand={brand} backTo={backTo} shopUrl={shopUrl} onLeave={() => setLeaving(true)} />

      {dropped.length > 0 ? (
        <p role="status" className="mx-auto mt-4 max-w-[1120px] px-5 text-[13.5px] text-[#6b7280] sm:px-8 lg:px-[60px]">
          Left out of this order: {dropped.slice(0, 4).join(", ")}. Already yours, or no longer on sale.
        </p>
      ) : null}

      <main className="relative mx-auto max-w-[1120px] pb-[max(2rem,env(safe-area-inset-bottom))]">
        {phase.kind === "error" ? (
          <Problem message={phase.message} backTo={backTo} onRetry={retry} />
        ) : (
          <>
            {phase.kind === "loading" ? <Holding brandName={brand.name} totalCents={totalCents} lines={lines} /> : null}
            {stripe ? (
              <div data-stripe-form="" className={cn("checkout-enter min-h-[560px] pt-2 sm:pt-6", phase.kind === "loading" && "pointer-events-none absolute inset-x-0 top-0 opacity-0")}>
                <EmbeddedCheckoutProvider key={attempt} stripe={stripe} options={options}>
                  <EmbeddedCheckout className="basket-embedded-checkout" />
                </EmbeddedCheckoutProvider>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}

/** The page's shape while Stripe's form is on its way: the shop, the total, the lines, the form's blocks. */
function Holding({ brandName, totalCents, lines }: { brandName: string; totalCents: number; lines: Line[] }) {
  const bar = "rounded-[6px] bg-[#eceef1]"
  return (
    <div data-holding="" aria-busy aria-label="Loading the payment form" className="grid gap-8 px-5 pt-7 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:px-[60px] lg:pt-12">
      <div className="mx-auto w-full max-w-[440px] lg:ml-auto lg:mr-0">
        <p className="text-[15px] font-medium text-[#6b7280]">Pay {brandName}</p>
        <p className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-[#1a1a2e] sm:text-[36px]">{money(totalCents)}</p>
        <ul className="mt-6 space-y-4 lg:mt-10">
          {lines.slice(0, 6).map((l) => (
            <li key={`${l.productId}:${l.variantId ?? ""}`} className="flex items-start gap-3.5">
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-black/[0.06] bg-[#f1f2f4]">
                {l.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span className="block truncate text-[14px] font-medium text-[#1a1a2e]">{l.title}</span>
                {l.quantity > 1 ? <span className="mt-0.5 block text-[13px] text-[#6b7280]">Qty {l.quantity}</span> : null}
              </span>
              <span className="pt-0.5 text-[14px] font-medium tabular-nums text-[#1a1a2e]">{money(l.lineCents)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="skeleton-deferred checkout-shimmer-soft mx-auto w-full max-w-[440px] lg:ml-0 lg:mr-auto">
        <div className="h-11 rounded-[8px] bg-[#f1f2f4]" />
        <div className={`${bar} mt-8 h-4 w-28`} />
        <div className="mt-3 h-11 rounded-[8px] border border-[#eceef1] bg-[#f7f8f9]" />
        <div className={`${bar} mt-8 h-4 w-36`} />
        <div className="mt-3 h-[220px] rounded-[8px] border border-[#eceef1] bg-[#fafbfb]" />
        <div className="mt-7 h-12 rounded-[8px] bg-[#e7e9ec]" />
      </div>
    </div>
  )
}

function Problem({ message, backTo, onRetry }: { message: string; backTo: string | null; onRetry?: () => void }) {
  return (
    <div role="alert" className="mx-auto flex min-h-[52vh] max-w-[420px] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-[17px] font-semibold text-[#1a1a2e]">The payment form didn&apos;t open</p>
      <p className="mt-1.5 text-[14px] leading-6 text-[#6b7280]">{message}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {backTo ? (
          <a href={backTo} className="inline-flex h-10 items-center rounded-[9px] border border-[#e1e3e7] bg-white px-4 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#fafafb]">
            Back to cart
          </a>
        ) : null}
        {onRetry ? (
          <button type="button" onClick={onRetry} className="inline-flex h-10 items-center rounded-[9px] bg-[#1a1a2e] px-4 text-[14px] font-medium text-white hover:bg-[#2a2a40]">
            Try again
          </button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Nothing to pay for here: an empty cart, a shop that cannot take payments
 * now, a product gone from sale. Said on the shop's own page, with the way
 * back to the cart, never a blank page or Stripe's error.
 */
export function BasketProblem({ brand, backTo, shopUrl, title, message }: { brand: ShopBrand; backTo: string | null; shopUrl: string | null; title: string; message: string | null }) {
  return (
    <div data-page="basket-checkout" className="min-h-dvh bg-[#f8f9fa]">
      <ShopBar brand={brand} backTo={backTo} shopUrl={shopUrl} />
      <main data-basket-problem="" className="mx-auto flex min-h-[60vh] max-w-[420px] flex-col items-center justify-center px-6 py-12 text-center">
        <ShoppingBag className="h-8 w-8 text-[#c4c8cf]" strokeWidth={1.5} aria-hidden />
        <h1 className="mt-3 text-[20px] font-semibold text-[#1a1a2e]">{title}</h1>
        {message ? <p className="mt-1.5 text-[14px] leading-6 text-[#6b7280]">{message}</p> : null}
        {backTo || shopUrl ? (
          <a href={backTo ?? shopUrl ?? "/"} className="mt-6 inline-flex h-10 items-center rounded-[9px] bg-[#1a1a2e] px-4 text-[14px] font-medium text-white hover:bg-[#2a2a40]">
            {backTo ? "Back to cart" : "Continue shopping"}
          </a>
        ) : null}
      </main>
    </div>
  )
}
