"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js/pure"
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { createClient } from "@/lib/supabase/client"

type ProductRow = {
  id: string
  title: string
  description?: string | null
  price_cents: number
  currency?: string | null
  image_url?: string | null
  creator_id?: string | null
  created_at?: string | null
}

type CreatorRow = {
  id: string
  name?: string | null
  username?: string | null
}

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "")

function formatMoney(amountCents: number, currency: string) {
  const amount = (amountCents || 0) / 100
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(amount)
  } catch {
    return `${currency || "USD"} ${amount.toFixed(2)}`
  }
}

function CheckoutClientComponent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const productId = searchParams.get("product_id") || ""

  const [loading, setLoading] = useState(true)
  const [fatalError, setFatalError] = useState<string | null>(null)

  const [product, setProduct] = useState<ProductRow | null>(null)
  const [creator, setCreator] = useState<CreatorRow | null>(null)

  const [userEmail, setUserEmail] = useState("")
  const [emailTouched, setEmailTouched] = useState(false)

  const currency = useMemo(() => (product?.currency || "USD").toUpperCase(), [product?.currency])
  const isFree = useMemo(() => (product?.price_cents || 0) <= 0, [product?.price_cents])

  // Paid flow state
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [intentLoading, setIntentLoading] = useState(false)
  const [intentError, setIntentError] = useState<string | null>(null)

  // Free flow state
  const [freeLoading, setFreeLoading] = useState(false)
  const [freeError, setFreeError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true)
        setFatalError(null)

        if (!productId) {
          setFatalError("Missing product_id.")
          return
        }

        const supabase = createClient()

        // Get user (optional)
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user?.email) setUserEmail(user.email)

        // Fetch product
        const { data: p, error: pErr } = await supabase.from("products").select("*").eq("id", productId).single()
        if (pErr || !p) {
          setFatalError("Product not found.")
          return
        }
        setProduct(p as ProductRow)

        // Fetch creator (optional)
        if ((p as ProductRow).creator_id) {
          const { data: c } = await supabase
            .from("creators")
            .select("id,name,username")
            .eq("id", (p as ProductRow).creator_id)
            .single()
          if (c) setCreator(c as CreatorRow)
        }
      } catch (e: unknown) {
        const error = e as Error
        setFatalError(error?.message || "Something went wrong loading checkout.")
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [productId])

  // Create PaymentIntent when paid product + email exists
  useEffect(() => {
    const createIntentIfNeeded = async () => {
      if (loading) return
      if (!product) return
      if (isFree) return

      if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
        setIntentError("Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.")
        return
      }

      const email = userEmail.trim()
      if (!email || !email.includes("@")) return
      if (clientSecret) return

      try {
        setIntentLoading(true)
        setIntentError(null)

        const res = await fetch("/api/checkout/create-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: product.id, email }),
        })

        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || "Failed to initialize payment.")
        }

        const json = await res.json()
        if (!json?.clientSecret) throw new Error("Missing clientSecret from server.")
        setClientSecret(json.clientSecret)
      } catch (e: unknown) {
        const error = e as Error
        setIntentError(error?.message || "Failed to initialize payment.")
      } finally {
        setIntentLoading(false)
      }
    }

    createIntentIfNeeded()
  }, [loading, product, isFree, userEmail, clientSecret])

  const displayTitle = product?.title || "Checkout"
  const displayCreator = creator?.name || creator?.username || "Creator"

  const totalLabel = useMemo(() => {
    if (!product) return ""
    return isFree ? "US$0" : formatMoney(product.price_cents, currency)
  }, [product, isFree, currency])

  const onContinueShopping = () => router.push("/")

  const onEmailChange = (val: string) => {
    setUserEmail(val)
    setEmailTouched(true)
    setClientSecret(null)
  }

  const handleFreeGet = async () => {
    try {
      setFreeError(null)
      setFreeLoading(true)

      if (!product) throw new Error("Missing product.")
      const email = userEmail.trim()
      if (!email || !email.includes("@")) throw new Error("Please enter a valid email address.")

      const res = await fetch("/api/checkout/complete-free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, email }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || "Failed to complete checkout.")
      }

      const json = await res.json()
      const redirectUrl = json?.redirectUrl || `/library/products?highlight=${product.id}`
      router.replace(redirectUrl)
    } catch (e: unknown) {
      const error = e as Error
      setFreeError(error?.message || "Failed to complete free checkout.")
    } finally {
      setFreeLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#2b2b2b] text-white flex items-center justify-center">
        <div className="text-sm opacity-80">Loading checkout…</div>
      </div>
    )
  }

  if (fatalError) {
    return (
      <div className="min-h-screen bg-[#2b2b2b] text-white p-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-xl font-semibold">Checkout</h1>
            <button
              onClick={onContinueShopping}
              className="rounded-md border border-white/20 px-4 py-2 text-sm hover:bg-white/5"
            >
              Continue shopping
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <div className="text-sm text-red-300">{fatalError}</div>
            <div className="mt-4">
              <button
                onClick={() => router.push("/")}
                className="rounded-md bg-white text-black px-4 py-2 text-sm font-medium"
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const elementsOptions = clientSecret
    ? {
        clientSecret,
        appearance: { theme: "night" as const },
      }
    : undefined

  return (
    <div className="min-h-screen bg-[#2b2b2b] text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <h1 className="text-xl font-semibold">Checkout</h1>
          <button
            onClick={onContinueShopping}
            className="rounded-md border border-white/20 px-4 py-2 text-sm hover:bg-white/5"
          >
            Continue shopping
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
          {/* LEFT: Product summary */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <div className="flex gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                {product?.image_url ? (
                  <Image
                    src={product.image_url || "/placeholder.svg"}
                    alt={displayTitle}
                    width={80}
                    height={80}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="text-xs opacity-60">No image</div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{displayTitle}</div>
                    <div className="text-xs opacity-70 truncate">{displayCreator}</div>
                  </div>
                  <div className="text-sm font-semibold">
                    {isFree ? "US$0" : formatMoney(product!.price_cents, currency)}
                  </div>
                </div>

                <div className="mt-4 text-xs opacity-70">
                  Qty: 1 &nbsp;&nbsp; <span className="opacity-60">Version:</span> {isFree ? "Free" : "Paid"}
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-white/10 pt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between opacity-90">
                <span>Subtotal</span>
                <span>{isFree ? "US$0" : formatMoney(product!.price_cents, currency)}</span>
              </div>

              <div className="flex items-center justify-between opacity-90">
                <span>Total</span>
                <span className="font-semibold">{totalLabel}</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Email + Payment */}
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <label className="block text-sm font-medium mb-2">Email address</label>
            <input
              value={userEmail}
              onChange={(e) => onEmailChange(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              placeholder="Your email address"
              className="w-full rounded-md border border-white/15 bg-black/50 px-3 py-2 text-sm outline-none focus:border-white/30"
            />
            {emailTouched && (!userEmail.trim() || !userEmail.includes("@")) ? (
              <div className="mt-2 text-xs text-red-300">Please enter a valid email address.</div>
            ) : null}

            <div className="mt-6">
              {isFree ? (
                <>
                  {freeError ? <div className="mb-3 text-xs text-red-300">{freeError}</div> : null}

                  <button
                    onClick={handleFreeGet}
                    disabled={freeLoading || !userEmail.trim() || !userEmail.includes("@")}
                    className="w-full rounded-md bg-white text-black py-3 text-sm font-semibold disabled:opacity-60"
                  >
                    {freeLoading ? "Processing…" : "Get"}
                  </button>

                  <div className="mt-3 text-xs opacity-70">
                    You'll get an email with a re-download link, and this product will appear in{" "}
                    <span className="font-medium">My Downloads</span>.
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm font-medium mb-2">Pay with</div>

                  {intentError ? <div className="mb-3 text-xs text-red-300">{intentError}</div> : null}
                  {intentLoading && !clientSecret ? (
                    <div className="rounded-md border border-white/10 bg-black/30 p-4 text-sm opacity-80">
                      Initializing payment…
                    </div>
                  ) : null}

                  {clientSecret && elementsOptions ? (
                    <Elements stripe={stripePromise} options={elementsOptions}>
                      <PaidCheckoutForm
                        productId={product!.id}
                        totalLabel={totalLabel}
                        email={userEmail.trim()}
                        onSuccess={() => router.replace(`/library/products?highlight=${product!.id}`)}
                      />
                    </Elements>
                  ) : (
                    <div className="mt-3 text-xs opacity-70">Enter your email to load payment options.</div>
                  )}

                  <div className="mt-3 text-xs opacity-70">
                    After payment, you'll be redirected to <span className="font-medium">My Downloads</span> and also
                    receive an email re-download link.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-10 text-center text-xs opacity-60">Secure checkout • Instant access after completion</div>
      </div>
    </div>
  )
}

function PaidCheckoutForm({
  productId,
  totalLabel,
  email,
  onSuccess,
}: {
  productId: string
  totalLabel: string
  email: string
  onSuccess: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePay = async () => {
    try {
      setError(null)
      setSubmitting(true)

      if (!stripe || !elements) throw new Error("Payment is not ready yet.")
      if (!email || !email.includes("@")) throw new Error("Please enter a valid email address.")

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/library/products?highlight=${productId}`,
          receipt_email: email,
        },
        redirect: "if_required",
      })

      if (result.error) throw new Error(result.error.message || "Payment failed.")
      onSuccess()
    } catch (e: unknown) {
      const error = e as Error
      setError(error?.message || "Payment failed.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-3">
      <div className="rounded-md border border-white/10 bg-black/30 p-4">
        <PaymentElement />
      </div>

      {error ? <div className="mt-3 text-xs text-red-300">{error}</div> : null}

      <button
        onClick={handlePay}
        disabled={submitting || !stripe || !elements}
        className="mt-4 w-full rounded-md bg-white text-black py-3 text-sm font-semibold disabled:opacity-60"
      >
        {submitting ? "Processing…" : `Pay ${totalLabel}`}
      </button>
    </div>
  )
}

export default CheckoutClientComponent
