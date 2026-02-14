"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { getProductUrl } from "@/lib/url-helpers"
import {
  ArrowLeft,
  Package,
  Loader2,
  Gift,
  Heart,
  Tag,
  Lock,
  CreditCard,
  X,
  ChevronDown,
  ChevronUp,
  Shield,
  Check,
  AlertCircle,
} from "lucide-react"

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ---------- Types ----------
interface SelectedVariant {
  id: string
  name: string
  description: string | null
  priceCents: number
}

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
    username: string
  }
  userEmail: string | null
  isLoggedIn: boolean
  selectedVariant?: SelectedVariant | null
  isPwyw?: boolean
  customPriceCents?: number | null
}

// ---------- Helpers ----------
const CSRF_TOKEN = typeof crypto !== "undefined" ? crypto.randomUUID() : "csrf-placeholder"

function sanitizeInput(value: string): string {
  return value.replace(/[<>'"]/g, "").trim()
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, "")
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10)
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

function detectCardBrand(number: string): string {
  const cleaned = number.replace(/\D/g, "")
  if (/^4/.test(cleaned)) return "visa"
  if (/^5[1-5]/.test(cleaned) || /^2[2-7]/.test(cleaned)) return "mastercard"
  if (/^3[47]/.test(cleaned)) return "amex"
  if (/^6(?:011|5)/.test(cleaned)) return "discover"
  return ""
}

function formatCardNumber(value: string): string {
  const cleaned = value.replace(/\D/g, "").slice(0, 16)
  return cleaned.replace(/(.{4})/g, "$1 ").trim()
}

function formatExpiry(value: string): string {
  const cleaned = value.replace(/\D/g, "").slice(0, 4)
  if (cleaned.length >= 3) return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`
  return cleaned
}

const formatPrice = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)

// Session storage keys (never store card details)
const SESSION_KEYS = {
  firstName: "checkout_firstName",
  lastName: "checkout_lastName",
  email: "checkout_email",
  vatId: "checkout_vatId",
  discountCode: "checkout_discountCode",
} as const

function loadSessionField(key: string): string {
  if (typeof window === "undefined") return ""
  try { return sessionStorage.getItem(key) || "" } catch { return "" }
}

function saveSessionField(key: string, value: string) {
  if (typeof window === "undefined") return
  try { sessionStorage.setItem(key, value) } catch { /* ignore */ }
}

// ---------- Sub-components ----------
function CardBrandIcon({ brand }: { brand: string }) {
  const icons: Record<string, string> = {
    visa: "💳 Visa",
    mastercard: "💳 MC",
    amex: "💳 Amex",
    discover: "💳 Disc",
  }
  if (!brand) return null
  return (
    <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
      {icons[brand] || brand}
    </span>
  )
}

function OrderSummaryMobileToggle({
  isOpen,
  onToggle,
  total,
}: {
  isOpen: boolean
  onToggle: () => void
  total: number
}) {
  return (
    <button
      onClick={onToggle}
      className="lg:hidden flex items-center justify-between w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium cursor-pointer"
      type="button"
    >
      <span className="flex items-center gap-2">
        <Package className="w-4 h-4 text-gray-500" />
        {isOpen ? "Hide" : "Show"} order summary
      </span>
      <span className="flex items-center gap-2">
        <span className="font-semibold">{formatPrice(total)}</span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </span>
    </button>
  )
}

// ---------- Main Component ----------
export default function CheckoutPageClient({
  product,
  creator,
  userEmail,
  isLoggedIn,
  selectedVariant,
  isPwyw,
  customPriceCents,
}: CheckoutPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Email from URL param (intentional pre-fill exception)
  const urlEmail = searchParams.get("email") || ""

  // Form state - restored from session (except card details)
  const [firstName, setFirstName] = useState(() => loadSessionField(SESSION_KEYS.firstName))
  const [lastName, setLastName] = useState(() => loadSessionField(SESSION_KEYS.lastName))
  const [email, setEmail] = useState(() => urlEmail || "")
  const [vatId, setVatId] = useState(() => loadSessionField(SESSION_KEYS.vatId))
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  // Tip state
  const [tipAmount, setTipAmount] = useState(0)
  const [customTip, setCustomTip] = useState("")

  // Gift
  const [isGift, setIsGift] = useState(false)

  // Discount
  const [discountCode, setDiscountCode] = useState(() => loadSessionField(SESSION_KEYS.discountCode))
  const [discountApplied, setDiscountApplied] = useState(false)
  const [discountPercent, setDiscountPercent] = useState(0)

  // Card fields (never stored in session)
  const [cardNumber, setCardNumber] = useState("")
  const [cardExpiry, setCardExpiry] = useState("")
  const [cardCvc, setCardCvc] = useState("")
  const [cardBrand, setCardBrand] = useState("")

  // Payment method tab
  const [paymentMethod, setPaymentMethod] = useState<"card" | "paypal">("card")

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [showStripe, setShowStripe] = useState(false)
  const [mobileOrderOpen, setMobileOrderOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Variant modal state
  const [showVariantModal, setShowVariantModal] = useState(false)

  // Rate limiting
  const lastSubmitTime = useRef(0)

  // Persist form fields to session storage
  useEffect(() => { saveSessionField(SESSION_KEYS.firstName, firstName) }, [firstName])
  useEffect(() => { saveSessionField(SESSION_KEYS.lastName, lastName) }, [lastName])
  useEffect(() => { saveSessionField(SESSION_KEYS.email, email) }, [email])
  useEffect(() => { saveSessionField(SESSION_KEYS.vatId, vatId) }, [vatId])
  useEffect(() => { saveSessionField(SESSION_KEYS.discountCode, discountCode) }, [discountCode])

  // Track checkout start
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
      } catch { /* Silent fail */ }
    }
    trackCheckoutStart()
  }, [creator.id, product.id])

  // Card brand detection
  useEffect(() => {
    setCardBrand(detectCardBrand(cardNumber))
  }, [cardNumber])

  // Price calculations
  const subtotal = selectedVariant ? selectedVariant.priceCents : product.price_cents
  const tipCents = customTip ? Math.round(parseFloat(customTip) * 100) || 0 : Math.round(tipAmount * 100)
  const discountCents = discountApplied ? Math.round(subtotal * (discountPercent / 100)) : 0
  const total = Math.max(0, subtotal - discountCents + tipCents)
  const isFree = total === 0

  const tipOptions = [0, 1, 3, 5]
  const productUrl = getProductUrl(creator.username, product.slug)

  // Form validation
  const isFormValid = useMemo(() => {
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      validateEmail(email) &&
      agreedToTerms
    )
  }, [firstName, lastName, email, agreedToTerms])

  // Rate limit check
  const isRateLimited = useCallback(() => {
    const now = Date.now()
    if (now - lastSubmitTime.current < 3000) return true
    lastSubmitTime.current = now
    return false
  }, [])

  // Handle free checkout
  const handleFreeCheckout = async () => {
    if (!isFormValid) {
      if (!firstName.trim()) return setError("Please enter your first name")
      if (!lastName.trim()) return setError("Please enter your last name")
      if (!validateEmail(email)) return setError("Please enter a valid email address")
      if (!agreedToTerms) return setError("Please agree to the Terms and Conditions")
      return
    }

    if (isRateLimited()) {
      setError("Please wait a moment before trying again")
      return
    }

    setIsSubmitting(true)
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/checkout/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": CSRF_TOKEN,
        },
        body: JSON.stringify({
          productId: product.id,
          firstName: sanitizeInput(firstName),
          lastName: sanitizeInput(lastName),
          email: sanitizeInput(email),
          tipCents: 0,
          isGift,
          variantId: selectedVariant?.id || null,
          customPriceCents: isPwyw ? customPriceCents : null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        const errorDetails = data.details ? ` (${data.details})` : ""
        const errorCode = data.code ? ` [${data.code}]` : ""
        throw new Error((data.error || "Checkout failed") + errorDetails + errorCode)
      }

      router.push(`${data.redirectUrl}?emailSent=1`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed. Please try again.")
    } finally {
      setLoading(false)
      setIsSubmitting(false)
    }
  }

  // Create Stripe session
  const createStripeSession = useCallback(async () => {
    const response = await fetch("/api/checkout/stripe-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": CSRF_TOKEN,
      },
      body: JSON.stringify({
        productId: product.id,
        firstName: sanitizeInput(firstName),
        lastName: sanitizeInput(lastName),
        email: sanitizeInput(email),
        tipCents,
        isGift,
        variantId: selectedVariant?.id || null,
        customPriceCents: isPwyw ? customPriceCents : null,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Failed to create checkout session")
    }

    return data.clientSecret
  }, [product.id, firstName, lastName, email, tipCents, isGift, selectedVariant, isPwyw, customPriceCents])

  // Handle paid checkout
  const handlePaidCheckout = async () => {
    if (!isFormValid) {
      if (!firstName.trim()) return setError("Please enter your first name")
      if (!lastName.trim()) return setError("Please enter your last name")
      if (!validateEmail(email)) return setError("Please enter a valid email address")
      if (!agreedToTerms) return setError("Please agree to the Terms and Conditions")
      return
    }

    if (isRateLimited()) {
      setError("Please wait a moment before trying again")
      return
    }

    setIsSubmitting(true)
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
      setIsSubmitting(false)
    }
  }

  const handleSubmit = () => {
    if (isFree) {
      handleFreeCheckout()
    } else {
      handlePaidCheckout()
    }
  }

  const handleApplyDiscount = () => {
    if (!discountCode.trim()) return
    // Placeholder: In production, validate discount code via API
    setDiscountApplied(true)
    setDiscountPercent(10)
  }

  const handleRemoveDiscount = () => {
    setDiscountApplied(false)
    setDiscountPercent(0)
    setDiscountCode("")
  }

  // If Stripe session is active, show embedded checkout
  if (showStripe && clientSecret) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
            <a
              href={productUrl}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 min-h-[44px] transition-colors"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className="truncate">Back to product</span>
            </a>
          </div>
        </header>
        <div className="mx-auto max-w-2xl px-4 py-8">
          <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </div>
    )
  }

  // ---------- RENDER ----------
  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <a
            href={productUrl}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 min-h-[44px] transition-colors"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">Back to product</span>
          </a>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Lock className="h-3.5 w-3.5" />
            <span>Secure checkout</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {/* Mobile order summary toggle */}
        <div className="mb-4 lg:hidden">
          <OrderSummaryMobileToggle
            isOpen={mobileOrderOpen}
            onToggle={() => setMobileOrderOpen(!mobileOrderOpen)}
            total={total}
          />
          {mobileOrderOpen && (
            <div className="mt-3 animate-in slide-in-from-top-2 duration-200">
              <OrderSummaryContent
                product={product}
                creator={creator}
                selectedVariant={selectedVariant}
                subtotal={subtotal}
                tipCents={tipCents}
                discountApplied={discountApplied}
                discountCents={discountCents}
                total={total}
                isPwyw={isPwyw}
                formatPrice={formatPrice}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8 lg:gap-12 items-start">
          {/* ===== LEFT COLUMN (60%) ===== */}
          <div className="space-y-6 order-2 lg:order-1">

            {/* Product Card */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <div className="flex gap-4">
                <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                  {product.thumbnail_url ? (
                    <Image
                      src={product.thumbnail_url}
                      alt={product.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Package className="h-8 w-8 text-gray-300" />
                    </div>
                  )}
                  {/* Quantity badge */}
                  <div className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-purple-600 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-sm">
                    1
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-base sm:text-lg text-gray-900 line-clamp-2">{product.title}</h2>
                      {selectedVariant && (
                        <p className="text-sm font-medium text-purple-600 mt-0.5">{selectedVariant.name}</p>
                      )}
                      <p className="text-sm text-gray-500 truncate mt-0.5">{creator.name}</p>
                    </div>
                    <span className="font-semibold text-gray-900 whitespace-nowrap">
                      {subtotal === 0 ? "Free" : formatPrice(subtotal)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    {selectedVariant && (
                      <button
                        type="button"
                        onClick={() => setShowVariantModal(true)}
                        className="text-xs font-medium text-purple-600 hover:text-purple-700 underline underline-offset-2 cursor-pointer transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    <a
                      href={productUrl}
                      className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                    >
                      Remove
                    </a>
                  </div>
                </div>
              </div>
            </section>

            {/* Discount Code */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Tag className="w-4 h-4 text-gray-400" />
                Discount code
              </h3>
              {discountApplied ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">{discountCode}</span>
                    <span className="text-xs text-green-600">(-{discountPercent}%)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveDiscount}
                    className="text-green-600 hover:text-green-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter discount code"
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value)}
                    className="flex-1 h-11 rounded-xl border-gray-200 focus-visible:border-purple-400 focus-visible:ring-purple-400/20"
                  />
                  <Button
                    variant="outline"
                    onClick={handleApplyDiscount}
                    disabled={!discountCode.trim()}
                    className="h-11 px-5 rounded-xl border-gray-200"
                  >
                    Apply
                  </Button>
                </div>
              )}
            </section>

            {/* Contact Information */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Contact information</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-xs font-medium text-gray-600">First Name *</Label>
                    <Input
                      id="firstName"
                      type="text"
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="h-11 rounded-xl border-gray-200 focus-visible:border-purple-400 focus-visible:ring-purple-400/20"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" className="text-xs font-medium text-gray-600">Last Name *</Label>
                    <Input
                      id="lastName"
                      type="text"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="h-11 rounded-xl border-gray-200 focus-visible:border-purple-400 focus-visible:ring-purple-400/20"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-gray-600">Email address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 rounded-xl border-gray-200 focus-visible:border-purple-400 focus-visible:ring-purple-400/20"
                    required
                  />
                  <p className="text-xs text-gray-400">We&apos;ll send your download link to this email</p>
                </div>
              </div>
            </section>

            {/* Business VAT ID */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Business VAT ID (optional)</h3>
              <Input
                placeholder="e.g. DE123456789"
                value={vatId}
                onChange={(e) => setVatId(e.target.value)}
                className="h-11 rounded-xl border-gray-200 focus-visible:border-purple-400 focus-visible:ring-purple-400/20"
              />
              <p className="text-xs text-gray-400 mt-1.5">Only required for EU B2B transactions</p>
            </section>

            {/* Tip Section */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <Heart className="h-4 w-4 text-pink-500 shrink-0" />
                <h3 className="text-sm font-semibold text-gray-900">Add a tip for {creator.name}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {tipOptions.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => { setTipAmount(amount); setCustomTip("") }}
                    className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
                      tipAmount === amount && !customTip
                        ? "bg-purple-600 text-white shadow-sm"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {amount === 0 ? "None" : `$${amount}`}
                  </button>
                ))}
                <Input
                  type="number"
                  placeholder="Other"
                  value={customTip}
                  className="w-24 h-10 rounded-full text-center border-gray-200 focus-visible:border-purple-400 focus-visible:ring-purple-400/20"
                  min={0}
                  step={0.5}
                  onChange={(e) => {
                    setCustomTip(e.target.value)
                    setTipAmount(0)
                  }}
                />
              </div>
            </section>

            {/* Gift Toggle */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Gift className="h-5 w-5 text-purple-500 shrink-0" />
                  <div className="min-w-0">
                    <Label htmlFor="gift" className="cursor-pointer text-sm font-semibold text-gray-900">
                      Give as a gift?
                    </Label>
                    <p className="text-xs text-gray-400">Send to someone else via email</p>
                  </div>
                </div>
                <Switch id="gift" checked={isGift} onCheckedChange={setIsGift} className="shrink-0" />
              </div>
            </section>
          </div>

          {/* ===== RIGHT COLUMN (40%, sticky) ===== */}
          <div className="order-1 lg:order-2 lg:sticky lg:top-6">
            <div className="space-y-5">
              {/* Order Summary - hidden on mobile (uses collapsible above) */}
              <div className="hidden lg:block">
                <OrderSummaryContent
                  product={product}
                  creator={creator}
                  selectedVariant={selectedVariant}
                  subtotal={subtotal}
                  tipCents={tipCents}
                  discountApplied={discountApplied}
                  discountCents={discountCents}
                  total={total}
                  isPwyw={isPwyw}
                  formatPrice={formatPrice}
                />
              </div>

              {/* Express Checkout */}
              {!isFree && (
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 text-center">Express checkout</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="flex items-center justify-center gap-2 h-12 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-800 transition-colors cursor-pointer"
                    >
                       Pay
                    </button>
                    <button
                      type="button"
                      className="flex items-center justify-center gap-2 h-12 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-800 transition-colors cursor-pointer"
                    >
                      G Pay
                    </button>
                  </div>
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400">OR</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                </div>
              )}

              {/* Payment Method */}
              {!isFree && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  {/* Tab buttons */}
                  <div className="flex border-b border-gray-200">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("card")}
                      className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors cursor-pointer ${
                        paymentMethod === "card"
                          ? "bg-white text-purple-600 border-b-2 border-purple-600"
                          : "bg-gray-50 text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      Credit Card
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("paypal")}
                      className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors cursor-pointer relative ${
                        paymentMethod === "paypal"
                          ? "bg-white text-purple-600 border-b-2 border-purple-600"
                          : "bg-gray-50 text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      PayPal
                      <span className="text-[10px] font-semibold bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">Soon</span>
                    </button>
                  </div>

                  {/* Card inputs */}
                  {paymentMethod === "card" && (
                    <div className="p-5 space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-medium text-gray-600">Card number</Label>
                          <CardBrandIcon brand={cardBrand} />
                        </div>
                        <Input
                          placeholder="1234 5678 9012 3456"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                          className="h-11 rounded-xl border-gray-200 focus-visible:border-purple-400 focus-visible:ring-purple-400/20 font-mono tracking-wider"
                          maxLength={19}
                          inputMode="numeric"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-gray-600">Expiry</Label>
                          <Input
                            placeholder="MM/YY"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                            className="h-11 rounded-xl border-gray-200 focus-visible:border-purple-400 focus-visible:ring-purple-400/20 font-mono"
                            maxLength={5}
                            inputMode="numeric"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-gray-600">CVC</Label>
                          <Input
                            placeholder="123"
                            value={cardCvc}
                            onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            className="h-11 rounded-xl border-gray-200 focus-visible:border-purple-400 focus-visible:ring-purple-400/20 font-mono"
                            maxLength={4}
                            inputMode="numeric"
                            type="password"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {paymentMethod === "paypal" && (
                    <div className="p-5 text-center text-sm text-gray-400">
                      PayPal support is coming soon. Please use a credit card for now.
                    </div>
                  )}
                </div>
              )}

              {/* Terms & Conditions */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                    className="mt-0.5 shrink-0 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                  />
                  <Label htmlFor="terms" className="cursor-pointer text-sm leading-relaxed text-gray-600">
                    I agree to the{" "}
                    <Link href="/terms" className="text-purple-600 hover:text-purple-700 underline underline-offset-2" target="_blank">
                      Terms and Conditions
                    </Link>{" "}
                    *
                  </Label>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* CTA Button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !isFormValid || (paymentMethod === "paypal" && !isFree)}
                className={`w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-base font-semibold transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                  isFree
                    ? "bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/20"
                    : "bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/20"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Processing...
                  </>
                ) : isFree ? (
                  <>
                    Get for Free
                    <span className="ml-1">&rarr;</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Pay {formatPrice(total)}
                  </>
                )}
              </button>

              {/* Trust signals */}
              <div className="flex flex-col items-center gap-2 pt-1">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Payment is secure and encrypted</span>
                </div>
                {!isFree && (
                  <div className="flex items-center gap-3 text-xs text-gray-300">
                    <span>Visa</span>
                    <span>Mastercard</span>
                    <span>Amex</span>
                    <span>Discover</span>
                  </div>
                )}
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Secured checkout by Stripe
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sticky pay button */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 z-50" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="pt-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !isFormValid || (paymentMethod === "paypal" && !isFree)}
            className="w-full flex items-center justify-center gap-2 h-13 rounded-2xl text-base font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/20 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : isFree ? (
              <>Get for Free &rarr;</>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Pay {formatPrice(total)}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bottom padding for mobile sticky button */}
      <div className="lg:hidden h-20" />

      {/* Variant Selection Modal */}
      {showVariantModal && selectedVariant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowVariantModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Select variant</h3>
              <button
                type="button"
                onClick={() => setShowVariantModal(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {/* Current variant shown as selected */}
              <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-purple-600 bg-purple-50">
                <div className="w-4 h-4 rounded-full border-2 border-purple-600 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{selectedVariant.name}</p>
                  {selectedVariant.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{selectedVariant.description}</p>
                  )}
                </div>
                <span className="font-semibold text-purple-600 whitespace-nowrap">
                  {selectedVariant.priceCents === 0 ? "Free" : formatPrice(selectedVariant.priceCents)}
                </span>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                type="button"
                onClick={() => setShowVariantModal(false)}
                className="w-full h-11 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-colors cursor-pointer"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Order Summary Sub-component ----------
function OrderSummaryContent({
  product,
  creator,
  selectedVariant,
  subtotal,
  tipCents,
  discountApplied,
  discountCents,
  total,
  isPwyw,
  formatPrice,
}: {
  product: CheckoutPageClientProps["product"]
  creator: CheckoutPageClientProps["creator"]
  selectedVariant?: SelectedVariant | null
  subtotal: number
  tipCents: number
  discountApplied: boolean
  discountCents: number
  total: number
  isPwyw?: boolean
  formatPrice: (cents: number) => string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Order summary</h3>

      {/* Product row */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
          {product.thumbnail_url ? (
            <Image
              src={product.thumbnail_url}
              alt={product.title}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Package className="h-5 w-5 text-gray-300" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
          {selectedVariant && (
            <p className="text-xs text-purple-600">{selectedVariant.name}</p>
          )}
        </div>
        <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
          {subtotal === 0 ? "Free" : formatPrice(subtotal)}
        </span>
      </div>

      <Separator className="my-3" />

      {/* Line items */}
      <div className="space-y-2.5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">{isPwyw ? "Your price" : "Subtotal"}</span>
          <span className="text-gray-900">{formatPrice(subtotal)}</span>
        </div>

        {discountApplied && discountCents > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-green-600">Discount</span>
            <span className="text-green-600 font-medium">-{formatPrice(discountCents)}</span>
          </div>
        )}

        {tipCents > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Tip</span>
            <span className="text-gray-900">{formatPrice(tipCents)}</span>
          </div>
        )}
      </div>

      <Separator className="my-3" />

      {/* Total */}
      <div className="flex justify-between">
        <span className="text-base font-semibold text-gray-900">Total</span>
        <span className="text-lg font-bold text-gray-900">{formatPrice(total)}</span>
      </div>
    </div>
  )
}
