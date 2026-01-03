"use client"

import { useState, useCallback, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Package, Loader2, Gift, Heart, Tag } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface CheckoutPageClientProps {
  product: {
    id: string
    title: string
    slug: string
    description: string | null
    price_cents: number
    thumbnail_url: string | null
    type: string
  }
  creator: {
    id: string
    name: string
    avatar_url: string | null
  }
  userEmail: string | null
  isLoggedIn: boolean
}

export default function CheckoutPageClient({ product, creator, userEmail, isLoggedIn }: CheckoutPageClientProps) {
  const router = useRouter()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState(userEmail || "")
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [tipAmount, setTipAmount] = useState(0)
  const [isGift, setIsGift] = useState(false)
  const [discountCode, setDiscountCode] = useState("")
  const [discountApplied, setDiscountApplied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [showStripe, setShowStripe] = useState(false)

  useEffect(() => {
    const trackCheckoutStart = async () => {
      try {
        await fetch("/api/track-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: "checkout_start",
            creatorId: creator.id,
            productId: product.id,
          }),
        })
      } catch (e) {
        // Silent fail
      }
    }
    trackCheckoutStart()
  }, [creator.id, product.id])

  const subtotal = product.price_cents
  const tipCents = Math.round(tipAmount * 100)
  const total = subtotal + tipCents

  const isFree = total === 0

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  const handleFreeCheckout = async () => {
    if (!firstName.trim()) {
      setError("Please enter your first name")
      return
    }

    if (!lastName.trim()) {
      setError("Please enter your last name")
      return
    }

    if (!email) {
      setError("Please enter your email address")
      return
    }

    if (!email.includes("@") || !email.includes(".")) {
      setError("Please enter a valid email address")
      return
    }

    if (!agreedToTerms) {
      setError("Please agree to the Terms and Conditions")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/checkout/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          tipCents: 0,
          isGift,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Checkout failed")
      }

      router.push(`${data.redirectUrl}?emailSent=1`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const createStripeSession = useCallback(async () => {
    const response = await fetch("/api/checkout/stripe-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email,
        tipCents,
        isGift,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Failed to create checkout session")
    }

    return data.clientSecret
  }, [product.id, firstName, lastName, email, tipCents, isGift])

  const handlePaidCheckout = async () => {
    if (!firstName.trim()) {
      setError("Please enter your first name")
      return
    }

    if (!lastName.trim()) {
      setError("Please enter your last name")
      return
    }

    if (!email) {
      setError("Please enter your email address")
      return
    }

    if (!agreedToTerms) {
      setError("Please agree to the Terms and Conditions")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const secret = await createStripeSession()
      setClientSecret(secret)
      setShowStripe(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = () => {
    if (isFree) {
      handleFreeCheckout()
    } else {
      handlePaidCheckout()
    }
  }

  const tipOptions = [0, 1, 3, 5]

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <header className="border-b border-border bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
          <Link
            href={`/p/${product.slug}`}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">Back to product</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {showStripe && clientSecret ? (
          <div className="mx-auto max-w-2xl">
            <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
            <div className="order-2 lg:order-1">
              <Card className="overflow-hidden">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex gap-3 sm:gap-4">
                    <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {product.thumbnail_url ? (
                        <Image
                          src={product.thumbnail_url || "/placeholder.svg"}
                          alt={product.title}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Package className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-semibold text-base sm:text-lg line-clamp-2">{product.title}</h2>
                      <p className="text-sm text-muted-foreground truncate">{creator.name}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-sm text-muted-foreground">Qty: 1</span>
                        <span className="font-medium whitespace-nowrap">
                          {product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Separator className="my-4 sm:my-6" />

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatPrice(subtotal)}</span>
                    </div>

                    {tipCents > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tip</span>
                        <span>{formatPrice(tipCents)}</span>
                      </div>
                    )}

                    <div className="pt-2">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Discount code"
                            value={discountCode}
                            onChange={(e) => setDiscountCode(e.target.value)}
                            className="pl-10 min-h-[44px]"
                          />
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => setDiscountApplied(true)}
                          disabled={!discountCode}
                          className="min-h-[44px] sm:w-auto"
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Separator className="my-4 sm:my-6" />

                  <div className="flex justify-between text-lg font-semibold">
                    <span>Total</span>
                    <span>{formatPrice(total)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="order-1 lg:order-2">
              <Card>
                <CardContent className="p-4 sm:p-6 space-y-5 sm:space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name *</Label>
                      <Input
                        id="firstName"
                        type="text"
                        placeholder="John"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="min-h-[44px]"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name *</Label>
                      <Input
                        id="lastName"
                        type="text"
                        placeholder="Doe"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="min-h-[44px]"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email address *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={!!userEmail}
                      className="min-h-[44px]"
                      required
                    />
                    <p className="text-xs text-muted-foreground">We&apos;ll send your download link to this email</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-pink-500 shrink-0" />
                      <Label>Add a tip</Label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tipOptions.map((amount) => (
                        <Button
                          key={amount}
                          variant={tipAmount === amount ? "default" : "outline"}
                          size="sm"
                          onClick={() => setTipAmount(amount)}
                          className={`min-h-[40px] min-w-[48px] ${tipAmount !== amount ? "bg-transparent" : ""}`}
                        >
                          {amount === 0 ? "None" : `$${amount}`}
                        </Button>
                      ))}
                      <Input
                        type="number"
                        placeholder="Other"
                        className="w-20 min-h-[40px]"
                        min={0}
                        onChange={(e) => setTipAmount(Number(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border p-3 sm:p-4 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Gift className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <Label htmlFor="gift" className="cursor-pointer">
                          Give as a gift?
                        </Label>
                        <p className="text-xs text-muted-foreground">Send to someone else</p>
                      </div>
                    </div>
                    <Switch id="gift" checked={isGift} onCheckedChange={setIsGift} className="shrink-0" />
                  </div>

                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="terms"
                      checked={agreedToTerms}
                      onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                      className="mt-0.5 shrink-0"
                    />
                    <Label htmlFor="terms" className="cursor-pointer text-sm leading-tight">
                      I agree to the{" "}
                      <Link href="/terms" className="underline" target="_blank">
                        Terms and Conditions
                      </Link>{" "}
                      *
                    </Label>
                  </div>

                  {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

                  <Button
                    size="lg"
                    className="w-full min-h-[48px]"
                    onClick={handleSubmit}
                    disabled={loading || !email || !firstName || !lastName || !agreedToTerms}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : isFree ? (
                      "Get for Free"
                    ) : (
                      `Pay ${formatPrice(total)}`
                    )}
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">Secure checkout powered by Stripe</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
