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
 * step with what Stripe already asks for.
 */
import { useState } from "react"
import { ShoppingBag, Minus, Plus, Trash2 } from "lucide-react"
import { useSiteCart } from "./site-cart"
import { checkoutItems, lineKey } from "@/lib/website-builder/cart"

export interface CartPalette {
  bg: string
  text: string
  heading: string
  border: string
  buttonBg: string
  buttonText: string
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function CartPageBody({ palette, radius }: { palette: CartPalette; radius: number }) {
  const { lines, ready, setQty, remove, subtotalCents, count } = useSiteCart()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dropped, setDropped] = useState<string[]>([])

  async function pay() {
    setBusy(true)
    setError(null)
    setDropped([])
    try {
      const res = await fetch("/api/checkout/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: checkoutItems(lines), returnPath: "/cart" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) {
        setError(typeof data?.error === "string" ? data.error : "Could not start the checkout.")
        setBusy(false)
        return
      }
      if (Array.isArray(data.dropped) && data.dropped.length > 0) setDropped(data.dropped)
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
        <h1 className="text-[22px] font-semibold" style={{ color: palette.heading }}>Your cart is empty</h1>
        <a href="/products" className="text-[15px] font-medium underline underline-offset-4">
          Browse the shop
        </a>
      </div>
    )
  }

  return (
    <div style={{ background: palette.bg, color: palette.text }}>
      <div className="mx-auto w-full max-w-[860px] px-5 py-10 sm:px-6 sm:py-14">
        <h1 className="text-[26px] sm:text-[30px] font-bold" style={{ color: palette.heading }}>
          Your cart
        </h1>
        <p className="mt-1 text-[14px] opacity-65">{count === 1 ? "One item" : `${count} items`}</p>

        <ul className="mt-7">
          {lines.map((l) => {
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
                  {l.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : null}
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
                      {money(l.priceCents * l.quantity)}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        <div className="mt-8 flex flex-col items-end gap-4">
          <div className="flex w-full items-baseline justify-between sm:w-[300px]">
            <span className="text-[15px] opacity-70">Subtotal</span>
            <span className="text-[22px] font-bold tabular-nums" style={{ color: palette.heading }}>
              {money(subtotalCents)}
            </span>
          </div>

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
            disabled={busy}
            className="flex h-12 w-full items-center justify-center rounded-full text-[16px] font-semibold transition-opacity disabled:opacity-60 sm:w-[300px]"
            style={{ background: palette.buttonBg, color: palette.buttonText }}
          >
            {busy ? "Taking you to payment" : "Check out"}
          </button>
          <p className="w-full text-right text-[12px] opacity-55 sm:w-[300px]">
            Payment is handled by Stripe.
          </p>
        </div>
      </div>
    </div>
  )
}
