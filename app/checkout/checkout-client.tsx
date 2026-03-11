"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
// Prevent Stripe.js Link prewarm from opening Safari in Capacitor WebViews.
// Must be imported before any loadStripe() call.
import "@/lib/stripe-nav-guard"
import { isNativeApp } from "@/lib/platform-utils"

// IMPORTANT: import from "@stripe/stripe-js/pure" NOT "@stripe/stripe-js".
// The default "@stripe/stripe-js" injects <script src="https://js.stripe.com/v3/">
// at module import time — before loadStripe() is even called — which triggers
// the Stripe Link prewarm experiment and opens the browser.
// /pure never touches the DOM until loadStripe() is explicitly invoked.
import { loadStripe } from "@stripe/stripe-js/pure"
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"

// Lazy Stripe loader — only calls loadStripe() when a paid checkout actually
// needs it. Combined with the /pure import, Stripe.js is completely absent
// on free checkout pages.
//
// In Capacitor WKWebView (native iOS/Android), Stripe.js normally creates a hidden
// "controller" iframe (js.stripe.com/v3/controller-with-preconnect-*.html) for
// advanced fraud signals collection. That iframe sends a postMessage to Stripe.js
// which then sets window.location.href = controllerUrl — a [LegacyUnforgeable] WebIDL
// property that cannot be intercepted in WKWebView. This navigates the main frame
// away from the checkout page.
//
// Setting advancedFraudSignals: false prevents the controller iframe from being
// created entirely, so window.location.href is never set. Card entry stays inline.
// (The stripe-nav-guard.ts import above remains as a secondary defence.)
let _stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripePromise() {
  if (!_stripePromise) {
    // Detect Capacitor native context at call-time (runs client-side only)
    const isNative = typeof window !== "undefined" && (() => {
      const cap = (window as any).Capacitor
      if (cap?.isNativePlatform?.()) return true
      const ua = navigator.userAgent || ""
      return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
    })()

    _stripePromise = loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
      // advancedFraudSignals is documented in the Stripe.js reference but not yet
      // reflected in the @stripe/stripe-js TypeScript types — suppress the error.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      isNative ? { advancedFraudSignals: false } : undefined,
    )
  }
  return _stripePromise
}
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
  X,
  ChevronDown,
  ChevronUp,
  Shield,
  Check,
  AlertCircle,
  Globe,
  Search,
} from "lucide-react"

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
  allVariants?: SelectedVariant[]
}

// ---------- Helpers ----------
const CSRF_TOKEN = typeof crypto !== "undefined" ? crypto.randomUUID() : "csrf-placeholder"

function sanitizeInput(value: string): string {
  return value.replace(/[<>'"]/g, "").trim()
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const formatPrice = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)

// Session storage keys
const SESSION_KEYS = {
  firstName: "checkout_firstName",
  lastName: "checkout_lastName",
  email: "checkout_email",
  vatId: "checkout_vatId",
  discountCode: "checkout_discountCode",
  country: "checkout_country",
} as const

function loadSessionField(key: string): string {
  if (typeof window === "undefined") return ""
  try { return sessionStorage.getItem(key) || "" } catch { return "" }
}

function saveSessionField(key: string, value: string) {
  if (typeof window === "undefined") return
  try { sessionStorage.setItem(key, value) } catch { /* ignore */ }
}

// Stripe Elements styling
const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: "16px",
      color: "#1f2937",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      "::placeholder": {
        color: "#9ca3af",
      },
      iconColor: "#6b7280",
    },
    invalid: {
      color: "#ef4444",
      iconColor: "#ef4444",
    },
  },
}

// ---------- Country list ----------
const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "IE", name: "Ireland" },
  { code: "PT", name: "Portugal" },
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czech Republic" },
  { code: "HU", name: "Hungary" },
  { code: "RO", name: "Romania" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "EE", name: "Estonia" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "GR", name: "Greece" },
  { code: "CY", name: "Cyprus" },
  { code: "MT", name: "Malta" },
  { code: "LU", name: "Luxembourg" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
  { code: "IN", name: "India" },
  { code: "SG", name: "Singapore" },
  { code: "HK", name: "Hong Kong" },
  { code: "TW", name: "Taiwan" },
  { code: "MY", name: "Malaysia" },
  { code: "TH", name: "Thailand" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "VN", name: "Vietnam" },
  { code: "NZ", name: "New Zealand" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
  { code: "PE", name: "Peru" },
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "EG", name: "Egypt" },
  { code: "KE", name: "Kenya" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "IL", name: "Israel" },
  { code: "TR", name: "Turkey" },
  { code: "IS", name: "Iceland" },
  { code: "PR", name: "Puerto Rico" },
  { code: "PA", name: "Panama" },
  { code: "CR", name: "Costa Rica" },
  { code: "EC", name: "Ecuador" },
  { code: "UY", name: "Uruguay" },
  { code: "PK", name: "Pakistan" },
  { code: "BD", name: "Bangladesh" },
  { code: "LK", name: "Sri Lanka" },
  { code: "NP", name: "Nepal" },
]

// ---------- SVG Icons ----------
function GooglePayIcon({ className = "h-5 w-auto" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 2387.3 948" xmlns="http://www.w3.org/2000/svg" fill="none">
      <g>
        <path fill="#ffffff" d="M1129.1,463.2V741h-88.2V54.8h233.8c56.4-1.2,110.9,20.2,151.4,59.4c41,36.9,64.1,89.7,63.2,144.8 c1.2,55.5-21.9,108.7-63.2,145.7c-40.9,39-91.4,58.5-151.4,58.4L1129.1,463.2L1129.1,463.2z M1129.1,139.3v239.6h147.8 c32.8,1,64.4-11.9,87.2-35.5c46.3-45,47.4-119.1,2.3-165.4c-0.8-0.8-1.5-1.6-2.3-2.3c-22.5-24.1-54.3-37.3-87.2-36.4L1129.1,139.3 L1129.1,139.3z M1692.5,256.2c65.2,0,116.6,17.4,154.3,52.2c37.7,34.8,56.5,82.6,56.5,143.2V741H1819v-65.2h-3.8 c-36.5,53.7-85.1,80.5-145.7,80.5c-51.7,0-95-15.3-129.8-46c-33.8-28.5-53-70.7-52.2-115c0-48.6,18.4-87.2,55.1-115.9 c36.7-28.7,85.7-43.1,147.1-43.1c52.3,0,95.5,9.6,129.3,28.7v-20.2c0.2-30.2-13.2-58.8-36.4-78c-23.3-21-53.7-32.5-85.1-32.1 c-49.2,0-88.2,20.8-116.9,62.3l-77.6-48.9C1545.6,286.8,1608.8,256.2,1692.5,256.2L1692.5,256.2z M1578.4,597.3 c-0.1,22.8,10.8,44.2,29.2,57.5c19.5,15.3,43.7,23.5,68.5,23c37.2-0.1,72.9-14.9,99.2-41.2c29.2-27.5,43.8-59.7,43.8-96.8 c-27.5-21.9-65.8-32.9-115-32.9c-35.8,0-65.7,8.6-89.6,25.9C1590.4,550.4,1578.4,571.7,1578.4,597.3L1578.4,597.3z M2387.3,271.5 L2093,948h-91l109.2-236.7l-193.6-439.8h95.8l139.9,337.3h1.9l136.1-337.3L2387.3,271.5z" />
      </g>
      <path fill="#4285F4" d="M772.8,403.2c0-26.9-2.2-53.7-6.8-80.2H394.2v151.8h212.9c-8.8,49-37.2,92.3-78.7,119.8v98.6h127.1 C729.9,624.7,772.8,523.2,772.8,403.2L772.8,403.2z" />
      <path fill="#34A853" d="M394.2,788.5c106.4,0,196-34.9,261.3-95.2l-127.1-98.6c-35.4,24-80.9,37.7-134.2,37.7 c-102.8,0-190.1-69.3-221.3-162.7H42v101.6C108.9,704.5,245.2,788.5,394.2,788.5z" />
      <path fill="#FBBC04" d="M172.9,469.7c-16.5-48.9-16.5-102,0-150.9V217.2H42c-56,111.4-56,242.7,0,354.1L172.9,469.7z" />
      <path fill="#EA4335" d="M394.2,156.1c56.2-0.9,110.5,20.3,151.2,59.1L658,102.7C586.6,35.7,492.1-1.1,394.2,0 C245.2,0,108.9,84.1,42,217.2l130.9,101.6C204.1,225.4,291.4,156.1,394.2,156.1z" />
    </svg>
  )
}

function PayPalIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 780 501" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="#003087" d="M168.379,169.853c-8.399-5.774-19.359-8.668-32.88-8.668H83.153c-4.145,0-6.435,2.073-6.87,6.215L55.018,300.883c-0.221,1.311,0.107,2.51,0.981,3.6c0.869,1.092,1.962,1.635,3.271,1.635h24.864c4.361,0,6.758-2.068,7.198-6.215l5.888-35.986c0.215-1.744,0.982-3.162,2.291-4.254c1.308-1.09,2.944-1.803,4.907-2.13c1.963-0.324,3.814-0.487,5.562-0.487c1.743,0,3.814,0.11,6.217,0.327c2.397,0.218,3.925,0.324,4.58,0.324c18.756,0,33.478-5.285,44.167-15.866c10.684-10.577,16.032-25.243,16.032-44.004C180.976,184.96,176.774,175.636,168.379,169.853z M141.389,209.933c-1.094,7.635-3.926,12.649-8.506,15.049c-4.581,2.403-11.124,3.598-19.629,3.598l-10.797,0.327l5.563-35.007c0.434-2.397,1.851-3.597,4.252-3.597h6.218c8.72,0,15.049,1.257,18.975,3.761C141.389,196.574,142.698,201.865,141.389,209.933z"/>
      <path fill="#009CDE" d="M720.794,161.185h-24.208c-2.405,0-3.821,1.2-4.253,3.6l-21.267,136.099l-0.328,0.654c0,1.096,0.437,2.127,1.311,3.109c0.868,0.98,1.963,1.471,3.27,1.471h21.595c4.138,0,6.429-2.068,6.871-6.215l21.265-133.813v-0.325C725.049,162.712,723.627,161.185,720.794,161.185z"/>
      <path fill="#003087" d="M428.31,213.856c0-1.088-0.439-2.126-1.306-3.106c-0.875-0.981-1.858-1.474-2.945-1.474h-25.192c-2.404,0-4.366,1.096-5.889,3.271l-34.679,51.04l-14.395-49.075c-1.095-3.487-3.492-5.236-7.197-5.236h-24.541c-1.093,0-2.074,0.492-2.941,1.474c-0.875,0.98-1.309,2.019-1.309,3.106c0,0.44,2.127,6.871,6.379,19.303c4.252,12.435,8.832,25.849,13.74,40.245c4.908,14.393,7.469,22.031,7.688,22.898c-17.886,24.43-26.826,37.517-26.826,39.259c0,2.838,1.416,4.254,4.253,4.254h25.192c2.398,0,4.36-1.088,5.889-3.27l83.427-120.399C428.092,215.713,428.31,214.953,428.31,213.856z"/>
      <path fill="#009CDE" d="M662.887,209.276h-24.866c-3.055,0-4.904,3.6-5.558,10.798c-5.677-8.721-16.031-13.088-31.083-13.088c-15.704,0-29.066,5.89-40.077,17.668c-11.016,11.778-16.521,25.631-16.521,41.551c0,12.871,3.761,23.121,11.285,30.752c7.525,7.639,17.612,11.451,30.266,11.451c6.323,0,12.757-1.311,19.3-3.926c6.544-2.617,11.665-6.105,15.379-10.469c0,0.219-0.222,1.199-0.655,2.943c-0.44,1.748-0.655,3.059-0.655,3.926c0,3.494,1.414,5.234,4.254,5.234h22.576c4.138,0,6.541-2.068,7.194-6.215l13.415-85.39c0.215-1.309-0.112-2.507-0.982-3.599C665.284,209.823,664.196,209.276,662.887,209.276z M620.193,273.729c-5.562,5.453-12.268,8.178-20.12,8.178c-6.328,0-11.449-1.742-15.377-5.234c-3.927-3.484-5.89-8.283-5.89-14.395c0-8.065,2.726-14.886,8.18-20.447c5.447-5.562,12.214-8.343,20.285-8.343c6.101,0,11.173,1.8,15.212,5.397c4.032,3.6,6.054,8.563,6.054,14.889C628.536,261.625,625.754,268.279,620.193,273.729z"/>
      <path fill="#003087" d="M291.231,209.276h-24.865c-3.058,0-4.908,3.6-5.563,10.798c-5.889-8.721-16.25-13.088-31.081-13.088c-15.704,0-29.065,5.89-40.078,17.668c-11.016,11.778-16.521,25.631-16.521,41.551c0,12.871,3.763,23.121,11.288,30.752c7.525,7.639,17.61,11.451,30.262,11.451c6.104,0,12.433-1.311,18.975-3.926c6.543-2.617,11.778-6.105,15.704-10.469c-0.875,2.617-1.309,4.908-1.309,6.869c0,3.494,1.417,5.234,4.253,5.234h22.574c4.141,0,6.543-2.068,7.198-6.215l13.413-85.39c0.215-1.309-0.111-2.507-0.981-3.599C293.627,209.823,292.537,209.276,291.231,209.276z M248.535,273.891c-5.563,5.35-12.382,8.016-20.447,8.016c-6.329,0-11.4-1.742-15.214-5.234c-3.819-3.484-5.726-8.283-5.726-14.395c0-8.065,2.725-14.886,8.18-20.447c5.449-5.562,12.211-8.343,20.284-8.343c6.104,0,11.175,1.8,15.214,5.397c4.032,3.6,6.052,8.563,6.052,14.889C256.878,261.844,254.097,268.553,248.535,273.891z"/>
      <path fill="#009CDE" d="M540.036,169.853c-8.398-5.774-19.356-8.668-32.879-8.668h-52.019c-4.365,0-6.765,2.073-7.198,6.215l-21.265,133.483c-0.221,1.311,0.106,2.51,0.981,3.6c0.866,1.092,1.962,1.635,3.271,1.635h26.826c2.617,0,4.361-1.416,5.235-4.252l5.89-37.949c0.216-1.744,0.98-3.162,2.29-4.254c1.309-1.09,2.943-1.803,4.908-2.13c1.962-0.324,3.813-0.487,5.562-0.487c1.743,0,3.814,0.11,6.214,0.327c2.399,0.218,3.93,0.324,4.58,0.324c18.759,0,33.479-5.285,44.168-15.866c10.687-10.577,16.031-25.243,16.031-44.004C552.632,184.96,548.431,175.636,540.036,169.853z M506.502,223.673c-4.799,3.271-11.997,4.906-21.592,4.906l-10.47,0.327l5.563-35.007c0.432-2.397,1.849-3.597,4.252-3.597h5.887c4.797,0,8.614,0.218,11.454,0.653c2.831,0.439,5.561,1.799,8.178,4.089c2.619,2.29,3.926,5.618,3.926,9.979C513.7,214.185,511.298,220.399,506.502,223.673z"/>
    </svg>
  )
}

// ---------- Country Selector ----------
function CountrySelector({
  value,
  onChange,
}: {
  value: string
  onChange: (code: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartY = useRef(0)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedCountry = COUNTRIES.find((c) => c.code === value)
  const filtered = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = (code: string) => {
    onChange(code)
    setIsOpen(false)
    setSearch("")
  }

  // Close dropdown on click outside (desktop)
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  // Touch drag for mobile bottom sheet
  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const diff = e.touches[0].clientY - dragStartY.current
    if (diff > 0) setDragY(diff)
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
    if (dragY > 120) {
      setIsOpen(false)
      setSearch("")
    }
    setDragY(0)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between h-11 px-3 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-colors text-sm cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-gray-400" />
          <span className={selectedCountry ? "text-gray-900" : "text-gray-400"}>
            {selectedCountry ? selectedCountry.name : "Select country"}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Desktop dropdown */}
      {isOpen && (
        <div className="hidden lg:block absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-gray-400"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.map((country) => (
              <button
                key={country.code}
                type="button"
                onClick={() => handleSelect(country.code)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors cursor-pointer ${
                  value === country.code ? "bg-gray-100 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex-1 text-left">{country.name}</span>
                <span className="text-xs text-gray-400">{country.code}</span>
                {value === country.code && <Check className="w-3.5 h-3.5 text-gray-900" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No countries found</p>
            )}
          </div>
        </div>
      )}

      {/* Mobile bottom sheet */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-[100]">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => { setIsOpen(false); setSearch("") }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col"
            style={{ transform: dragY > 0 ? `translateY(${dragY}px)` : undefined, transition: isDragging ? "none" : "transform 0.3s ease-out" }}
          >
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="px-4 pb-3">
              <h3 className="text-base font-semibold text-gray-900 mb-3">Select country</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search countries..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400/20"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {filtered.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => handleSelect(country.code)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors cursor-pointer ${
                    value === country.code ? "bg-gray-100 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex-1 text-left">{country.name}</span>
                  <span className="text-xs text-gray-400">{country.code}</span>
                  {value === country.code && <Check className="w-4 h-4 text-gray-900" />}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No countries found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Sub-components ----------
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

// ---------- Native Card Form (no Stripe.js) ----------
// Used inside Capacitor WKWebView. Card inputs are plain HTML — no iframes,
// no Stripe.js controller, no window.location.href navigation possible.
function NativeCardForm({
  onSubmit,
  isSubmitting,
  isFree,
  total,
  error,
  setError,
  nameOnCard,
  setNameOnCard,
  agreedToTerms,
  setAgreedToTerms,
  isContactValid,
  cardNumber,
  setCardNumber,
  cardExpiry,
  setCardExpiry,
  cardCvc,
  setCardCvc,
  emailContent,
  contactContent,
}: {
  onSubmit: () => void
  isSubmitting: boolean
  isFree: boolean
  total: number
  error: string | null
  setError: (e: string | null) => void
  nameOnCard: string
  setNameOnCard: (v: string) => void
  agreedToTerms: boolean
  setAgreedToTerms: (v: boolean) => void
  isContactValid: boolean
  cardNumber: string
  setCardNumber: (v: string) => void
  cardExpiry: string
  setCardExpiry: (v: string) => void
  cardCvc: string
  setCardCvc: (v: string) => void
  emailContent?: React.ReactNode
  contactContent?: React.ReactNode
}) {
  // Format card number: groups of 4 separated by spaces
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 16)
    setCardNumber(digits.replace(/(.{4})/g, "$1 ").trim())
  }

  // Format expiry: MM/YY
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 4)
    if (raw.length <= 2) setCardExpiry(raw)
    else setCardExpiry(`${raw.slice(0, 2)}/${raw.slice(2)}`)
  }

  const isCardComplete = cardNumber.replace(/\s/g, "").length >= 13 &&
    /^\d{2}\/\d{2}$/.test(cardExpiry) &&
    cardCvc.length >= 3

  return (
    <div className="space-y-4">
      {/* Email input + marketing opt-in */}
      {emailContent}

      {/* Card Fields */}
      {!isFree && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Card number</Label>
            <Input
              type="tel"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="1234 5678 9012 3456"
              value={cardNumber}
              onChange={handleCardNumberChange}
              className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20 font-mono tracking-wider"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Expiry (MM/YY)</Label>
              <Input
                type="tel"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/YY"
                value={cardExpiry}
                onChange={handleExpiryChange}
                maxLength={5}
                className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">CVC</Label>
              <Input
                type="tel"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                value={cardCvc}
                onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
                className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20 font-mono"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Name on card</Label>
            <Input
              placeholder="John Doe"
              autoComplete="cc-name"
              value={nameOnCard}
              onChange={(e) => setNameOnCard(e.target.value)}
              className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20"
            />
          </div>
        </div>
      )}

      {/* Contact Info + VAT */}
      {contactContent}

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Terms & Conditions */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <Checkbox
            id="terms-native"
            checked={agreedToTerms}
            onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
            className="mt-0.5 shrink-0 data-[state=checked]:bg-black data-[state=checked]:border-black"
          />
          <Label htmlFor="terms-native" className="cursor-pointer text-sm leading-relaxed text-gray-600">
            I agree to the{" "}
            <Link href="/terms" className="text-gray-900 hover:text-black underline underline-offset-2" target="_blank">
              Terms and Conditions
            </Link>{" "}
            *
          </Label>
        </div>
      </div>

      {/* Pay Button */}
      <button
        type="button"
        onClick={() => { setError(null); onSubmit() }}
        disabled={isSubmitting || !agreedToTerms || !isContactValid || (!isFree && !isCardComplete)}
        className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-base font-semibold transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-500/20"
      >
        {isSubmitting ? (
          <><Loader2 className="h-5 w-5 animate-spin" />Processing...</>
        ) : isFree ? (
          <>Get for Free <span className="ml-1">&rarr;</span></>
        ) : (
          <>Pay {formatPrice(total)}</>
        )}
      </button>

      {/* Secured by Stripe */}
      <div className="flex items-center justify-center gap-1.5 pt-2">
        <Shield className="w-3 h-3 text-gray-300" />
        <span className="text-[11px] text-gray-300 font-medium">Secured checkout by Stripe</span>
      </div>

      <div className="flex items-center justify-center gap-3 pt-1">
        <Link href="/terms" target="_blank" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Terms</Link>
        <span className="text-gray-300 text-[8px]">&middot;</span>
        <Link href="/privacy" target="_blank" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Privacy</Link>
        <span className="text-gray-300 text-[8px]">&middot;</span>
        <Link href="/refund-policy" target="_blank" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Refund Policy</Link>
      </div>
    </div>
  )
}

// ---------- Stripe Card Form ----------
// This renders INSIDE <Elements> but does NOT require clientSecret to render card inputs.
// Card Elements render immediately. clientSecret is only needed for confirmCardPayment().
function StripeCardForm({
  onSubmit,
  isSubmitting,
  isFree,
  total,
  error,
  setError,
  nameOnCard,
  setNameOnCard,
  agreedToTerms,
  setAgreedToTerms,
  isContactValid,
  productTitle,
  onGooglePaySubmit,
  emailContent,
  contactContent,
}: {
  onSubmit: (stripe: any, elements: any) => void
  isSubmitting: boolean
  isFree: boolean
  total: number
  error: string | null
  setError: (e: string | null) => void
  nameOnCard: string
  setNameOnCard: (v: string) => void
  agreedToTerms: boolean
  setAgreedToTerms: (v: boolean) => void
  isContactValid: boolean
  productTitle: string
  onGooglePaySubmit: (paymentMethodId: string, googlePayEmail?: string, googlePayName?: string) => void
  emailContent?: React.ReactNode
  contactContent?: React.ReactNode
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [cardComplete, setCardComplete] = useState({
    cardNumber: false,
    cardExpiry: false,
    cardCvc: false,
  })
  const [googlePayReady, setGooglePayReady] = useState(false)
  const paymentRequestRef = useRef<any>(null)

  const isCardComplete = cardComplete.cardNumber && cardComplete.cardExpiry && cardComplete.cardCvc

  // Use ref to always have the latest callback without recreating the payment request
  const onGooglePaySubmitRef = useRef(onGooglePaySubmit)
  useEffect(() => {
    onGooglePaySubmitRef.current = onGooglePaySubmit
  }, [onGooglePaySubmit])

  // Initialize Google Pay via Stripe's PaymentRequest API.
  // Stripe is a registered Google Pay payment processor — no separate Google Pay
  // merchantId is needed, which completely avoids the OR_BIBED_11 error.
  useEffect(() => {
    if (!stripe || isFree || total <= 0) return

    const pr = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: {
        label: productTitle || "Purchase",
        amount: total, // already in cents
      },
      requestPayerEmail: true,
      requestPayerName: true,
    })

    pr.canMakePayment().then((result) => {
      if (result) {
        setGooglePayReady(true)
        paymentRequestRef.current = pr
      }
    })

    pr.on("paymentmethod", async (ev) => {
      // Close the Google Pay sheet immediately — processing continues server-side
      ev.complete("success")
      try {
        await onGooglePaySubmitRef.current(
          ev.paymentMethod.id,
          ev.payerEmail || "",
          ev.payerName || ""
        )
      } catch {
        // Error is surfaced via setError in handleGooglePayPayment
      }
    })

    return () => {
      paymentRequestRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe, isFree])

  // Keep the amount in sync when total or title changes
  useEffect(() => {
    if (paymentRequestRef.current && total > 0) {
      try {
        paymentRequestRef.current.update({
          total: {
            label: productTitle || "Purchase",
            amount: total,
          },
        })
      } catch { /* ignore update errors */ }
    }
  }, [total, productTitle])

  const handleSubmit = () => {
    if (!stripe || !elements) {
      setError("Payment system is loading. Please wait.")
      return
    }
    if (!agreedToTerms) {
      setError("Please agree to the Terms and Conditions")
      return
    }
    if (!isContactValid) {
      setError("Please fill in your contact information")
      return
    }
    onSubmit(stripe, elements)
  }

  const handleGooglePayClick = () => {
    if (!paymentRequestRef.current) {
      setError("Google Pay is not available. Please use card payment instead.")
      return
    }
    setError(null)
    paymentRequestRef.current.show()
  }

  return (
    <div className="space-y-4">
      {/* Express Checkout */}
      {!isFree && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 text-center">Express checkout</p>
          <div className="grid grid-cols-2 gap-3">
            {/* Google Pay - Black button with white logo */}
            <button
              type="button"
              onClick={handleGooglePayClick}
              disabled={isSubmitting || !stripe || !googlePayReady}
              className="flex items-center justify-center h-[48px] rounded-xl bg-black hover:bg-gray-900 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <GooglePayIcon className="h-[22px] w-auto" />
            </button>
            {/* PayPal */}
            <div className="relative group">
              <button
                type="button"
                disabled
                className="w-full flex items-center justify-center h-[48px] rounded-xl bg-[#FFC439] border border-[#F0B72A] cursor-not-allowed transition-all overflow-hidden"
              >
                <PayPalIcon className="h-[35px] w-auto" />
              </button>
              <div className="absolute inset-0 flex items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/75 pointer-events-none">
                <span className="text-xs text-white font-medium">Not available now</span>
              </div>
            </div>
          </div>

          {/* Subtle divider after express checkout */}
          <div className="mt-5 mb-1 h-px bg-gray-100" />
        </div>
      )}

      {/* Email input + marketing opt-in (injected from parent) */}
      {emailContent}

      {/* Card Fields - Renders immediately, no clientSecret needed */}
      {!isFree && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Card number</Label>
            <div className="h-11 px-3 flex items-center rounded-xl border border-gray-200 bg-white focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-400/20 transition-colors">
              <CardNumberElement
                options={{ ...CARD_ELEMENT_OPTIONS, showIcon: true }}
                onChange={(e) => setCardComplete(prev => ({ ...prev, cardNumber: e.complete }))}
                className="w-full"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Expiration date</Label>
              <div className="h-11 px-3 flex items-center rounded-xl border border-gray-200 bg-white focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-400/20 transition-colors">
                <CardExpiryElement
                  options={CARD_ELEMENT_OPTIONS}
                  onChange={(e) => setCardComplete(prev => ({ ...prev, cardExpiry: e.complete }))}
                  className="w-full"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Security code</Label>
              <div className="h-11 px-3 flex items-center rounded-xl border border-gray-200 bg-white focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-400/20 transition-colors">
                <CardCvcElement
                  options={CARD_ELEMENT_OPTIONS}
                  onChange={(e) => setCardComplete(prev => ({ ...prev, cardCvc: e.complete }))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Name on card</Label>
            <Input
              placeholder="John Doe"
              value={nameOnCard}
              onChange={(e) => setNameOnCard(e.target.value)}
              className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20"
            />
          </div>
        </div>
      )}

      {/* Contact Info + VAT (injected from parent) */}
      {contactContent}

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Terms & Conditions */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <Checkbox
            id="terms"
            checked={agreedToTerms}
            onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
            className="mt-0.5 shrink-0 data-[state=checked]:bg-black data-[state=checked]:border-black"
          />
          <Label htmlFor="terms" className="cursor-pointer text-sm leading-relaxed text-gray-600">
            I agree to the{" "}
            <Link href="/terms" className="text-gray-900 hover:text-black underline underline-offset-2" target="_blank">
              Terms and Conditions
            </Link>{" "}
            *
          </Label>
        </div>
      </div>

      {/* Pay Button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting || !agreedToTerms || !isContactValid || (!isFree && !isCardComplete) || !stripe}
        className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-base font-semibold transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-500/20"
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
          <>Pay {formatPrice(total)}</>
        )}
      </button>

      {/* Secured by Stripe */}
      <div className="flex items-center justify-center gap-1.5 pt-2">
        <Shield className="w-3 h-3 text-gray-300" />
        <span className="text-[11px] text-gray-300 font-medium">Secured checkout by Stripe</span>
      </div>

      {/* Policy links */}
      <div className="flex items-center justify-center gap-3 pt-1">
        <Link href="/terms" target="_blank" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Terms</Link>
        <span className="text-gray-300 text-[8px]">&middot;</span>
        <Link href="/privacy" target="_blank" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Privacy</Link>
        <span className="text-gray-300 text-[8px]">&middot;</span>
        <Link href="/refund-policy" target="_blank" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Refund Policy</Link>
      </div>
    </div>
  )
}

// ---------- Main Component ----------
export default function CheckoutPageClient({
  product,
  creator,
  userEmail,
  isLoggedIn,
  selectedVariant: initialVariant,
  isPwyw,
  customPriceCents,
  allVariants = [],
}: CheckoutPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const urlEmail = searchParams.get("email") || ""
  // URL params used when re-opening the checkout inside SFSafariViewController
  // (the native Browser plugin passes these so the form is pre-filled)
  const urlFirstName = searchParams.get("firstName") || ""
  const urlLastName  = searchParams.get("lastName")  || ""
  // ?directPay=1  → skip Phase-1 placeholder and mount Stripe Elements immediately.
  // Set when the Capacitor WebView opens this URL in the in-app browser so the
  // user lands directly on the card form (standard Safari, no WebView restrictions).
  const urlDirectPay = searchParams.get("directPay") === "1"

  const [firstName, setFirstName] = useState(() => urlFirstName || loadSessionField(SESSION_KEYS.firstName))
  const [lastName,  setLastName]  = useState(() => urlLastName  || loadSessionField(SESSION_KEYS.lastName))
  const [email, setEmail] = useState(() => urlEmail || "")
  const [vatId, setVatId] = useState(() => loadSessionField(SESSION_KEYS.vatId))
  const [country, setCountry] = useState(() => loadSessionField(SESSION_KEYS.country) || "US")
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [emailOptIn, setEmailOptIn] = useState(false)
  const [nameOnCard, setNameOnCard] = useState("")

  const [tipAmount, setTipAmount] = useState(0)
  const [customTip, setCustomTip] = useState("")
  const [isGift, setIsGift] = useState(false)

  // Variant selection state
  const [selectedVariant, setSelectedVariant] = useState<SelectedVariant | null | undefined>(initialVariant)

  const [discountCode, setDiscountCode] = useState(() => searchParams.get("discountCode") || loadSessionField(SESSION_KEYS.discountCode))
  const [discountApplied, setDiscountApplied] = useState(false)
  const [discountPercent, setDiscountPercent] = useState(0)
  const [appliedDiscountCents, setAppliedDiscountCents] = useState<number | null>(null)
  const [discountLabel, setDiscountLabel] = useState("")
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false)
  const [discountError, setDiscountError] = useState<string | null>(null)
  const [appliedCouponId, setAppliedCouponId] = useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [mobileOrderOpen, setMobileOrderOpen] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showVariantModal, setShowVariantModal] = useState(false)
  // Deferred Stripe gate: Stripe.js must NOT load until the user explicitly
  // activates the card form.
  const [cardFormActive, setCardFormActive] = useState(urlDirectPay)

  // ── Native app: plain card inputs ────────────────────────────────────────────
  // In Capacitor WKWebView, Stripe.js is completely bypassed. Card data is
  // entered in plain HTML inputs and POSTed directly to the Stripe REST API
  // (api.stripe.com/v1/payment_methods) using the publishable key — same
  // security model as Stripe Elements (card data never reaches our server).
  // No Stripe.js = no controller iframe = no window.location.href navigation.
  const [nativeApp, setNativeApp] = useState(false)
  useEffect(() => { setNativeApp(isNativeApp()) }, [])
  const [nativeCardNumber, setNativeCardNumber] = useState("")
  const [nativeCardExpiry, setNativeCardExpiry] = useState("")
  const [nativeCardCvc, setNativeCardCvc]       = useState("")

  // Reset payment intent when variant changes (price may differ)
  useEffect(() => {
    setClientSecret(null)
    setPaymentIntentId(null)
  }, [selectedVariant?.id])

  const lastSubmitTime = useRef(0)

  // Persist form fields
  useEffect(() => { saveSessionField(SESSION_KEYS.firstName, firstName) }, [firstName])
  useEffect(() => { saveSessionField(SESSION_KEYS.lastName, lastName) }, [lastName])
  useEffect(() => { saveSessionField(SESSION_KEYS.email, email) }, [email])
  useEffect(() => { saveSessionField(SESSION_KEYS.vatId, vatId) }, [vatId])
  useEffect(() => { saveSessionField(SESSION_KEYS.discountCode, discountCode) }, [discountCode])
  useEffect(() => { saveSessionField(SESSION_KEYS.country, country) }, [country])

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

  // Price calculations
  const subtotal = selectedVariant ? selectedVariant.priceCents : product.price_cents
  const tipCents = customTip ? Math.round(parseFloat(customTip) * 100) || 0 : Math.round(tipAmount * 100)
  const discountCents = discountApplied
    ? (appliedDiscountCents !== null ? appliedDiscountCents : Math.round(subtotal * (discountPercent / 100)))
    : 0
  const total = Math.max(0, subtotal - discountCents + tipCents)
  const isFree = total === 0

  const tipOptions = [0, 1, 3, 5]
  const productUrl = getProductUrl(creator.username, product.slug)

  // Contact validation
  const isContactValid = useMemo(() => {
    return (
      firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      validateEmail(email)
    )
  }, [firstName, lastName, email])

  // Handle successful order: redirect to checkout/receipt page
  const completeOrder = useCallback(async (receiptToken: string, _newOrderId?: string) => {
    // Fire-and-forget: increment coupon usage count after successful purchase
    if (appliedCouponId) {
      fetch(`/api/coupons/${appliedCouponId}/use`, { method: "POST" }).catch(() => {})
    }
    router.push(`/checkout/receipt?token=${encodeURIComponent(receiptToken)}`)
  }, [router, appliedCouponId])

  // Handle return from Stripe 3DS redirect (bank auth page → return_url → back here)
  useEffect(() => {
    const piClientSecret = searchParams.get('payment_intent_client_secret')
    const piId = searchParams.get('payment_intent')
    if (!piClientSecret || !piId) return
    setIsSubmitting(true)
    getStripePromise().then(async (stripe) => {
      if (!stripe) { setIsSubmitting(false); return }
      try {
        const { paymentIntent } = await stripe.retrievePaymentIntent(piClientSecret)
        if (paymentIntent?.status === 'succeeded') {
          const res = await fetch('/api/checkout/confirm-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF_TOKEN },
            body: JSON.stringify({ paymentIntentId: piId }),
          })
          const data = await res.json()
          if (res.ok) {
            const match = data.redirectUrl?.match(/\/receipt\/([^?]+)/)
            router.push(`/checkout/receipt?token=${encodeURIComponent(match?.[1] || '')}`)
          } else {
            setError(data.error || 'Failed to complete order')
            setIsSubmitting(false)
          }
        } else {
          setError('Payment authentication failed or was cancelled. Please try again.')
          setIsSubmitting(false)
        }
      } catch {
        setError('Failed to verify payment. Please contact support.')
        setIsSubmitting(false)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // only run on mount — the params don't change after redirect

  // Full form validation: includes terms
  const isFormValid = useMemo(() => {
    return isContactValid && agreedToTerms
  }, [isContactValid, agreedToTerms])

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
          emailOptIn,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        const errorDetails = data.details ? ` (${data.details})` : ""
        const errorCode = data.code ? ` [${data.code}]` : ""
        throw new Error((data.error || "Checkout failed") + errorDetails + errorCode)
      }

      await completeOrder(data.receiptToken, data.orderId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Create PaymentIntent (overrides allow Google Pay to supply email/name)
  const createPaymentIntent = useCallback(async (overrides?: { email?: string; firstName?: string; lastName?: string }) => {
    const finalEmail = overrides?.email || email
    const finalFirstName = overrides?.firstName || firstName
    const finalLastName = overrides?.lastName || lastName

    const response = await fetch("/api/checkout/stripe-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": CSRF_TOKEN,
      },
      body: JSON.stringify({
        productId: product.id,
        firstName: sanitizeInput(finalFirstName),
        lastName: sanitizeInput(finalLastName),
        email: sanitizeInput(finalEmail),
        tipCents,
        isGift,
        variantId: selectedVariant?.id || null,
        customPriceCents: isPwyw ? customPriceCents : null,
        emailOptIn,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "Failed to create payment session")
    }

    return { clientSecret: data.clientSecret, paymentIntentId: data.paymentIntentId }
  }, [product.id, firstName, lastName, email, tipCents, isGift, selectedVariant, isPwyw, customPriceCents, emailOptIn])

  // ── Native paid checkout — no Stripe.js ──────────────────────────────────────
  // 1. POSTs card data directly to api.stripe.com/v1/payment_methods (publishable
  //    key only, card data never touches our server — PCI SAQ A-EP equivalent).
  // 2. Calls /api/checkout/stripe-session to create the PaymentIntent.
  // 3. Calls /api/checkout/confirm-with-pm to confirm server-side.
  // 4. If 3DS required: navigates to hooks.stripe.com challenge page (in-app).
  // 5. After 3DS: existing useEffect on mount handles the return and completes.
  const handleNativePaidCheckout = async () => {
    if (!isFormValid) {
      if (!firstName.trim()) return setError("Please enter your first name")
      if (!lastName.trim())  return setError("Please enter your last name")
      if (!validateEmail(email)) return setError("Please enter a valid email address")
      if (!agreedToTerms)    return setError("Please agree to the Terms and Conditions")
      return
    }

    // Basic native card validation
    const rawCard = nativeCardNumber.replace(/\s/g, "")
    if (rawCard.length < 13 || rawCard.length > 19) return setError("Please enter a valid card number")
    const [expMo, expYr] = nativeCardExpiry.split("/")
    if (!expMo || !expYr || expMo.length !== 2 || expYr.length !== 2) return setError("Please enter a valid expiry date (MM/YY)")
    if (!nativeCardCvc || nativeCardCvc.length < 3) return setError("Please enter a valid CVC")

    if (isRateLimited()) { setError("Please wait a moment before trying again"); return }

    setIsSubmitting(true)
    setError(null)

    try {
      // Step 1 — create PaymentMethod via Stripe REST API (no Stripe.js)
      const pmParams = new URLSearchParams()
      pmParams.set("type", "card")
      pmParams.set("card[number]", rawCard)
      pmParams.set("card[exp_month]", expMo.trim())
      pmParams.set("card[exp_year]", `20${expYr.trim()}`)
      pmParams.set("card[cvc]", nativeCardCvc.trim())
      const cardholderName = (nameOnCard || `${firstName} ${lastName}`).trim()
      if (cardholderName) pmParams.set("billing_details[name]", cardholderName)

      const pmRes = await fetch("https://api.stripe.com/v1/payment_methods", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: pmParams.toString(),
      })
      const pmData = await pmRes.json()
      if (!pmRes.ok) throw new Error(pmData.error?.message || "Card declined. Please check your card details.")
      const paymentMethodId: string = pmData.id

      // Step 2 — create PaymentIntent server-side
      let secret = clientSecret
      let piId = paymentIntentId
      if (!secret) {
        const result = await createPaymentIntent()
        secret = result.clientSecret
        piId = result.paymentIntentId
        setClientSecret(secret)
        setPaymentIntentId(piId)
      }

      // Step 3 — confirm server-side
      const returnUrl = typeof window !== "undefined" ? window.location.href : ""
      const confirmRes = await fetch("/api/checkout/confirm-with-pm", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": CSRF_TOKEN },
        body: JSON.stringify({ paymentIntentId: piId, paymentMethodId, returnUrl }),
      })
      const confirmData = await confirmRes.json()
      if (!confirmRes.ok) throw new Error(confirmData.error || "Payment failed. Please try again.")

      if (confirmData.status === "succeeded") {
        // Step 4 — create order record
        const completeRes = await fetch("/api/checkout/confirm-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": CSRF_TOKEN },
          body: JSON.stringify({ paymentIntentId: piId }),
        })
        const completeData = await completeRes.json()
        if (!completeRes.ok) throw new Error(completeData.error || "Failed to complete order")
        const tokenMatch = completeData.redirectUrl?.match(/\/receipt\/([^?]+)/)
        await completeOrder(tokenMatch?.[1] || "")
      } else if (confirmData.status === "requires_action" && confirmData.actionUrl) {
        // Step 5 — 3DS: stay in WKWebView (hooks.stripe.com is in allowNavigation)
        window.location.href = confirmData.actionUrl
      } else {
        throw new Error("Payment could not be completed. Please try again.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle paid checkout
  const handlePaidCheckout = async (stripe: any, elements: any) => {
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
    setError(null)

    try {
      // Create PaymentIntent on submit (not before)
      let secret = clientSecret
      let piId = paymentIntentId

      if (!secret) {
        const result = await createPaymentIntent()
        secret = result.clientSecret
        piId = result.paymentIntentId
        setClientSecret(secret)
        setPaymentIntentId(piId)
      }

      const cardElement = elements.getElement(CardNumberElement)
      if (!cardElement) {
        throw new Error("Card input not ready. Please try again.")
      }

      const { error: stripeError, paymentIntent: confirmedIntent } = await stripe.confirmCardPayment(secret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: nameOnCard || `${firstName} ${lastName}`.trim(),
            email: email,
          },
        },
        // return_url is needed for redirect-based 3DS (some banks). After bank auth,
        // Stripe redirects here with ?payment_intent=... so the page can complete the order.
        return_url: typeof window !== 'undefined' ? window.location.href : undefined,
      })

      if (stripeError) {
        if (stripeError.type === "card_error" || stripeError.type === "validation_error") {
          setError(stripeError.message || "Your card was declined. Please try another card.")
        } else {
          setError("An unexpected error occurred. Please try again.")
        }
        return
      }

      if (confirmedIntent?.status === "succeeded") {
        const completeResponse = await fetch("/api/checkout/confirm-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": CSRF_TOKEN,
          },
          body: JSON.stringify({ paymentIntentId: piId }),
        })

        const completeData = await completeResponse.json()

        if (!completeResponse.ok) {
          throw new Error(completeData.error || "Failed to complete order")
        }

        // Extract receipt token from redirect URL
        const receiptTokenMatch = completeData.redirectUrl?.match(/\/receipt\/([^?]+)/)
        const token = receiptTokenMatch?.[1] || ""
        await completeOrder(token)
      } else if (confirmedIntent?.status === "requires_action") {
        setError("Additional authentication required. Please complete the verification.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process payment")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = (stripeInstance?: any, elementsInstance?: any) => {
    if (isFree) {
      handleFreeCheckout()
    } else if (stripeInstance && elementsInstance) {
      handlePaidCheckout(stripeInstance, elementsInstance)
    }
  }

  const handleApplyDiscount = async () => {
    const code = discountCode.trim()
    if (!code) return
    setIsApplyingDiscount(true)
    setDiscountError(null)
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          creator_id: creator.id,
          product_id: product.id,
          price_cents: subtotal,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        setDiscountError(data.error || "Invalid coupon code")
        return
      }
      const label = data.discount_type === "percentage"
        ? `${data.discount_value}%`
        : `$${Number(data.discount_value).toFixed(2)}`
      setAppliedDiscountCents(data.discount_cents)
      setDiscountLabel(label)
      setAppliedCouponId(data.coupon_id)
      setDiscountApplied(true)
      setDiscountPercent(data.discount_type === "percentage" ? data.discount_value : 0)
    } catch {
      setDiscountError("Could not validate coupon. Please try again.")
    } finally {
      setIsApplyingDiscount(false)
    }
  }

  const handleRemoveDiscount = () => {
    setDiscountApplied(false)
    setDiscountPercent(0)
    setAppliedDiscountCents(null)
    setDiscountLabel("")
    setAppliedCouponId(null)
    setDiscountError(null)
    setDiscountCode("")
  }

  // ---------- RENDER ----------

  // Right column content (Desktop: Order Summary, Discount, Tip, Gift)
  const rightColumnContent = (
    <div className="space-y-5">
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
        productUrl={productUrl}
        allVariants={allVariants}
        onVariantChange={setSelectedVariant}
      />

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
              <span className="text-xs text-green-600">(-{discountLabel || `${discountPercent}%`})</span>
            </div>
            <button type="button" onClick={handleRemoveDiscount} className="text-green-600 hover:text-green-800 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="Enter discount code" value={discountCode} onChange={(e) => { setDiscountCode(e.target.value); setDiscountError(null) }} className="flex-1 h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20" onKeyDown={(e) => e.key === "Enter" && handleApplyDiscount()} />
              <Button variant="outline" onClick={handleApplyDiscount} disabled={!discountCode.trim() || isApplyingDiscount} className="h-11 px-5 rounded-xl border-gray-200">
                {isApplyingDiscount ? <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full border-2 border-gray-400 border-t-transparent animate-spin inline-block" />Checking</span> : "Apply"}
              </Button>
            </div>
            {discountError && <p className="text-xs text-red-500">{discountError}</p>}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="h-4 w-4 text-pink-500 shrink-0" />
          <h3 className="text-sm font-semibold text-gray-900">Add a tip for {creator.name}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {tipOptions.map((amount) => (
            <button key={amount} type="button" onClick={() => { setTipAmount(amount); setCustomTip("") }}
              className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${tipAmount === amount && !customTip ? "bg-[#2563eb] text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >{amount === 0 ? "None" : `$${amount}`}</button>
          ))}
          <Input type="number" placeholder="Other" value={customTip} className="w-24 h-10 rounded-full text-center border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20" min={0} step={0.5} onChange={(e) => { setCustomTip(e.target.value); setTipAmount(0) }} />
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Gift className="h-5 w-5 text-gray-500 shrink-0" />
            <div className="min-w-0">
              <Label htmlFor="gift-desktop" className="cursor-pointer text-sm font-semibold text-gray-900">Give as a gift?</Label>
              <p className="text-xs text-gray-400">Send to someone else via email</p>
            </div>
          </div>
          <Switch id="gift-desktop" checked={isGift} onCheckedChange={setIsGift} className="shrink-0" />
        </div>
      </section>
    </div>
  )

  // Handle Google Pay payment method (email/name come from the Google Pay sheet)
  const handleGooglePayPayment = useCallback(async (paymentMethodId: string, googlePayEmail?: string, googlePayName?: string) => {
    setIsSubmitting(true)
    setError(null)

    try {
      // Derive name/email: prefer form values, fall back to Google Pay data
      const finalEmail = email || googlePayEmail || ""
      let finalFirstName = firstName
      let finalLastName = lastName

      if (googlePayName && (!firstName.trim() || !lastName.trim())) {
        const nameParts = googlePayName.trim().split(/\s+/)
        if (!firstName.trim()) finalFirstName = nameParts[0] || "Customer"
        if (!lastName.trim()) finalLastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "Customer"
      }
      if (!finalFirstName.trim()) finalFirstName = "Customer"
      if (!finalLastName.trim()) finalLastName = "Customer"

      // Sync form state so the UI updates
      if (!email && googlePayEmail) setEmail(googlePayEmail)
      if (!firstName.trim()) setFirstName(finalFirstName)
      if (!lastName.trim()) setLastName(finalLastName)
      if (!agreedToTerms) setAgreedToTerms(true)

      // Create PaymentIntent with the resolved contact info
      const result = await createPaymentIntent({ email: finalEmail, firstName: finalFirstName, lastName: finalLastName })
      setClientSecret(result.clientSecret)
      setPaymentIntentId(result.paymentIntentId)

      // Confirm with the payment method from Google Pay
      const stripeInstance = await getStripePromise()
      if (!stripeInstance) throw new Error("Stripe not loaded")

      const { error: stripeError, paymentIntent: confirmedIntent } = await stripeInstance.confirmCardPayment(
        result.clientSecret,
        { payment_method: paymentMethodId }
      )

      if (stripeError) {
        setError(stripeError.message || "Payment failed. Please try again.")
        return
      }

      if (confirmedIntent?.status === "succeeded") {
        const completeResponse = await fetch("/api/checkout/confirm-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": CSRF_TOKEN,
          },
          body: JSON.stringify({ paymentIntentId: result.paymentIntentId }),
        })

        const completeData = await completeResponse.json()

        if (!completeResponse.ok) {
          throw new Error(completeData.error || "Failed to complete order")
        }

        const receiptTokenMatch = completeData.redirectUrl?.match(/\/receipt\/([^?]+)/)
        const token = receiptTokenMatch?.[1] || ""
        await completeOrder(token)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process Google Pay payment")
    } finally {
      setIsSubmitting(false)
    }
  }, [createPaymentIntent, router, email, firstName, lastName, agreedToTerms])

  // Shared email input + marketing opt-in checkbox content
  const emailSectionContent = (idSuffix: string = "") => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`email-checkout${idSuffix}`} className="text-xs font-medium text-gray-600">Email address *</Label>
        <Input
          id={`email-checkout${idSuffix}`}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20"
          required
        />
      </div>
      <div className="flex items-center gap-2.5">
        <Checkbox
          id={`email-optin${idSuffix}`}
          checked={emailOptIn}
          onCheckedChange={(checked) => setEmailOptIn(checked as boolean)}
          className="shrink-0 data-[state=checked]:bg-black data-[state=checked]:border-black"
        />
        <Label htmlFor={`email-optin${idSuffix}`} className="cursor-pointer text-xs text-gray-500 leading-relaxed">
          Email me with news and offers
        </Label>
      </div>
    </div>
  )

  // Shared contact info + VAT content (rendered inside StripeCardForm via contactContent prop)
  const contactSectionContent = (idSuffix: string = "") => (
    <>
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Contact information</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`firstName${idSuffix}`} className="text-xs font-medium text-gray-600">First Name *</Label>
              <Input id={`firstName${idSuffix}`} type="text" placeholder="John" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`lastName${idSuffix}`} className="text-xs font-medium text-gray-600">Last Name *</Label>
              <Input id={`lastName${idSuffix}`} type="text" placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-600">Country</Label>
            <CountrySelector value={country} onChange={setCountry} />
          </div>
        </div>
      </section>
      <section className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Business VAT ID (optional)</h3>
        <Input placeholder="e.g. DE123456789" value={vatId} onChange={(e) => setVatId(e.target.value)} className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20" />
        <p className="text-xs text-gray-400 mt-1.5">Only required for EU B2B transactions</p>
      </section>
    </>
  )

  // Payment content.
  // For paid products we use a two-phase approach:
  //   Phase 1 (cardFormActive=false): render the full checkout form BUT with a
  //     card-placeholder instead of the real Stripe Elements. Stripe.js is never
  //     loaded. No Link prewarm, no controller iframe, no Safari popup — exactly
  //     the same behaviour as a free product.
  //   Phase 2 (cardFormActive=true): the user has explicitly tapped the card
  //     area or the Pay button. Only NOW do we call getStripePromise() and mount
  //     <Elements>. Stripe.js loads, card inputs appear, user enters details and
  //     pays. The email/contact values captured in Phase 1 are preserved in
  //     parent state and shown pre-filled inside StripeCardForm.
  const paymentElementsContent = !isFree ? (
    nativeApp ? (
      // Native app path — plain HTML inputs + direct Stripe REST API, no Stripe.js, no iframes
      <NativeCardForm
        onSubmit={handleNativePaidCheckout}
        isSubmitting={isSubmitting}
        isFree={isFree}
        total={total}
        error={error}
        setError={setError}
        nameOnCard={nameOnCard}
        setNameOnCard={setNameOnCard}
        agreedToTerms={agreedToTerms}
        setAgreedToTerms={setAgreedToTerms}
        isContactValid={isContactValid}
        cardNumber={nativeCardNumber}
        setCardNumber={setNativeCardNumber}
        cardExpiry={nativeCardExpiry}
        setCardExpiry={setNativeCardExpiry}
        cardCvc={nativeCardCvc}
        setCardCvc={setNativeCardCvc}
        emailContent={emailSectionContent("")}
        contactContent={contactSectionContent("")}
      />
    ) : cardFormActive ? (
      // Phase 2 — real Stripe card form (Stripe.js loads here for the first time)
      <Elements stripe={getStripePromise()}>
        <StripeCardForm
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          isFree={isFree}
          total={total}
          error={error}
          setError={setError}
          nameOnCard={nameOnCard}
          setNameOnCard={setNameOnCard}
          agreedToTerms={agreedToTerms}
          setAgreedToTerms={setAgreedToTerms}
          isContactValid={isContactValid}
          productTitle={product.title}
          onGooglePaySubmit={handleGooglePayPayment}
          emailContent={emailSectionContent("")}
          contactContent={contactSectionContent("")}
        />
      </Elements>
    ) : (
      // Phase 1 — Stripe-free placeholder. Collects email/contact so values
      // are already in state when Phase 2 mounts.
      <div className="space-y-4">
        {emailSectionContent("-gate")}

        {/* Card placeholder — tapping activates Stripe Elements inline */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setCardFormActive(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setCardFormActive(true) }}
          className="bg-white rounded-2xl border border-gray-200 p-5 cursor-pointer hover:border-blue-300 transition-colors group"
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Payment details
          </p>
          <div className="space-y-3 pointer-events-none select-none">
            <div className="h-11 px-3 flex items-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-300 group-hover:border-blue-200 transition-colors">
              Card number
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="h-11 px-3 flex items-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-300 group-hover:border-blue-200 transition-colors">
                MM / YY
              </div>
              <div className="h-11 px-3 flex items-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-300 group-hover:border-blue-200 transition-colors">
                CVC
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-4">
            <Lock className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-blue-500 font-medium">Tap to enter card details securely</span>
          </div>
        </div>

        {contactSectionContent("-gate")}

        {/* Terms */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="terms-gate"
              checked={agreedToTerms}
              onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
              className="mt-0.5 shrink-0 data-[state=checked]:bg-black data-[state=checked]:border-black"
            />
            <Label htmlFor="terms-gate" className="cursor-pointer text-sm leading-relaxed text-gray-600">
              I agree to the{" "}
              <Link href="/terms" className="text-gray-900 hover:text-black underline underline-offset-2" target="_blank">
                Terms and Conditions
              </Link>{" "}*
            </Label>
          </div>
        </div>

        {/* Pay button — activates Stripe Elements inline on all platforms */}
        <button
          type="button"
          onClick={() => setCardFormActive(true)}
          disabled={!agreedToTerms || !isContactValid}
          className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-base font-semibold transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-500/20"
        >
          <Lock className="w-4 h-4" />
          Pay {formatPrice(total)}
        </button>

        <div className="flex items-center justify-center gap-1.5 pt-2">
          <Shield className="w-3 h-3 text-gray-300" />
          <span className="text-[11px] text-gray-300 font-medium">Secured checkout by Stripe</span>
        </div>
        <div className="flex items-center justify-center gap-3 pt-1">
          <Link href="/terms" target="_blank" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Terms</Link>
          <span className="text-gray-300 text-[8px]">&middot;</span>
          <Link href="/privacy" target="_blank" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Privacy</Link>
          <span className="text-gray-300 text-[8px]">&middot;</span>
          <Link href="/refund-policy" target="_blank" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Refund Policy</Link>
        </div>
      </div>
    )
  ) : (
    <div className="space-y-4">
      {/* Email + opt-in for free products */}
      {emailSectionContent("-free")}

      {/* Contact Info + VAT for free products */}
      {contactSectionContent("-free")}

      {/* Terms */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <Checkbox
            id="terms-free"
            checked={agreedToTerms}
            onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
            className="mt-0.5 shrink-0 data-[state=checked]:bg-black data-[state=checked]:border-black"
          />
          <Label htmlFor="terms-free" className="cursor-pointer text-sm leading-relaxed text-gray-600">
            I agree to the{" "}
            <Link href="/terms" className="text-gray-900 hover:text-black underline underline-offset-2" target="_blank">Terms and Conditions</Link>{" "}*
          </Label>
        </div>
      </div>
      <button
        type="button"
        onClick={handleFreeCheckout}
        disabled={isSubmitting || !isFormValid}
        className="w-full flex items-center justify-center gap-2 h-14 rounded-2xl text-base font-semibold transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-500/20"
      >
        {isSubmitting ? (<><Loader2 className="h-5 w-5 animate-spin" />Processing...</>) : (<>Get for Free<span className="ml-1">&rarr;</span></>)}
      </button>

      {/* Secured by Stripe */}
      <div className="flex items-center justify-center gap-1.5 pt-2">
        <Shield className="w-3 h-3 text-gray-300" />
        <span className="text-[11px] text-gray-300 font-medium">Secured checkout by Stripe</span>
      </div>

      {/* Policy links */}
      <div className="flex items-center justify-center gap-3 pt-1">
        <Link href="/terms" target="_blank" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Terms</Link>
        <span className="text-gray-300 text-[8px]">&middot;</span>
        <Link href="/privacy" target="_blank" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Privacy</Link>
        <span className="text-gray-300 text-[8px]">&middot;</span>
        <Link href="/refund-policy" target="_blank" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Refund Policy</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50" data-page="checkout">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6 sm:px-10 lg:px-16">
          <a href={productUrl} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 min-h-[44px] transition-colors">
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">Back to product</span>
          </a>
          <Link href="/explore" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Continue Shopping
          </Link>
        </div>
      </header>

      {/* Mobile layout: normal stacked flow */}
      <div className="lg:hidden">
        <div className="mx-auto max-w-[1400px] px-6 sm:px-10 py-6 sm:py-10 pb-[max(2rem,env(safe-area-inset-bottom))]">
          {/* Mobile order summary toggle - open by default */}
          <div className="mb-4">
            <OrderSummaryMobileToggle isOpen={mobileOrderOpen} onToggle={() => setMobileOrderOpen(!mobileOrderOpen)} total={total} />
            {mobileOrderOpen && (
              <div className="mt-3 animate-in slide-in-from-top-2 duration-200">
                <OrderSummaryContent product={product} creator={creator} selectedVariant={selectedVariant} subtotal={subtotal} tipCents={tipCents} discountApplied={discountApplied} discountCents={discountCents} total={total} isPwyw={isPwyw} formatPrice={formatPrice} productUrl={productUrl} allVariants={allVariants} onVariantChange={setSelectedVariant} />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-5">
            {/* All content (Express Checkout → Email → Card → Contact Info → VAT → Terms → Pay) */}
            <div>
              {paymentElementsContent}
            </div>

            {/* Discount - Mobile */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Tag className="w-4 h-4 text-gray-400" />Discount code
              </h3>
              {discountApplied ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">{discountCode}</span>
                    <span className="text-xs text-green-600">(-{discountLabel || `${discountPercent}%`})</span>
                  </div>
                  <button type="button" onClick={handleRemoveDiscount} className="text-green-600 hover:text-green-800 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input placeholder="Enter discount code" value={discountCode} onChange={(e) => { setDiscountCode(e.target.value); setDiscountError(null) }} className="flex-1 h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20" onKeyDown={(e) => e.key === "Enter" && handleApplyDiscount()} />
                    <Button variant="outline" onClick={handleApplyDiscount} disabled={!discountCode.trim() || isApplyingDiscount} className="h-11 px-5 rounded-xl border-gray-200">
                      {isApplyingDiscount ? <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full border-2 border-gray-400 border-t-transparent animate-spin inline-block" />Checking</span> : "Apply"}
                    </Button>
                  </div>
                  {discountError && <p className="text-xs text-red-500">{discountError}</p>}
                </div>
              )}
            </section>

            {/* Tip - Mobile */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <Heart className="h-4 w-4 text-pink-500 shrink-0" />
                <h3 className="text-sm font-semibold text-gray-900">Add a tip for {creator.name}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {tipOptions.map((amount) => (
                  <button key={amount} type="button" onClick={() => { setTipAmount(amount); setCustomTip("") }}
                    className={`px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${tipAmount === amount && !customTip ? "bg-[#2563eb] text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >{amount === 0 ? "None" : `$${amount}`}</button>
                ))}
                <Input type="number" placeholder="Other" value={customTip} className="w-24 h-10 rounded-full text-center border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20" min={0} step={0.5} onChange={(e) => { setCustomTip(e.target.value); setTipAmount(0) }} />
              </div>
            </section>

            {/* Gift - Mobile */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Gift className="h-5 w-5 text-gray-500 shrink-0" />
                  <div className="min-w-0">
                    <Label htmlFor="gift" className="cursor-pointer text-sm font-semibold text-gray-900">Give as a gift?</Label>
                    <p className="text-xs text-gray-400">Send to someone else via email</p>
                  </div>
                </div>
                <Switch id="gift" checked={isGift} onCheckedChange={setIsGift} className="shrink-0" />
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Desktop layout: split-screen with white left / light gray right / subtle divider */}
      <div className="hidden lg:flex min-h-[calc(100vh-57px)]">
        {/* LEFT HALF - White background */}
        <div className="w-1/2 bg-white">
          <div className="max-w-[640px] ml-auto py-10 px-10 xl:px-16">
            {/* All content (Express Checkout → Email → Card → Contact Info → VAT → Terms → Pay) */}
            {paymentElementsContent}
          </div>
        </div>

        {/* Subtle vertical divider */}
        <div className="w-px bg-gray-200 shrink-0" />

        {/* RIGHT HALF - Light gray background, sticky order summary */}
        <div className="w-1/2 bg-[#f7f7f8]">
          <div className="sticky top-[57px] max-w-[644px] mr-auto py-10 px-10 xl:px-16">
            {rightColumnContent}
          </div>
        </div>
      </div>


      {/* Variant Modal */}
      {showVariantModal && selectedVariant && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowVariantModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Select variant</h3>
              <button type="button" onClick={() => setShowVariantModal(false)} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-black bg-gray-50">
                <div className="w-4 h-4 rounded-full border-2 border-black flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-black" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{selectedVariant.name}</p>
                  {selectedVariant.description && <p className="text-xs text-gray-500 mt-0.5">{selectedVariant.description}</p>}
                </div>
                <span className="font-semibold text-gray-900 whitespace-nowrap">{selectedVariant.priceCents === 0 ? "Free" : formatPrice(selectedVariant.priceCents)}</span>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button type="button" onClick={() => setShowVariantModal(false)} className="w-full h-11 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold transition-colors cursor-pointer">Save changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Order Summary ----------
function OrderSummaryContent({
  product, creator, selectedVariant, subtotal, tipCents, discountApplied, discountCents, total, isPwyw, formatPrice, productUrl, allVariants, onVariantChange,
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
  productUrl?: string
  allVariants?: SelectedVariant[]
  onVariantChange?: (variant: SelectedVariant) => void
}) {
  const [variantOpen, setVariantOpen] = useState(false)
  const [sheetVisible, setSheetVisible] = useState(false)
  const variantRef = useRef<HTMLDivElement>(null)
  const sheetDragStartY = useRef(0)
  const [sheetDragY, setSheetDragY] = useState(0)
  const [sheetIsDragging, setSheetIsDragging] = useState(false)

  // Close variant dropdown on outside click (desktop only)
  useEffect(() => {
    if (!variantOpen) return
    const handleClick = (e: MouseEvent) => {
      if (variantRef.current && !variantRef.current.contains(e.target as Node)) {
        setVariantOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [variantOpen])

  const hasMultipleVariants = allVariants && allVariants.length > 1

  // Mobile bottom sheet open/close with smooth animation
  const openSheet = () => {
    setSheetVisible(true)
  }
  const closeSheet = () => {
    setSheetVisible(false)
    setSheetDragY(0)
  }

  const handleSheetTouchStart = (e: React.TouchEvent) => {
    sheetDragStartY.current = e.touches[0].clientY
    setSheetIsDragging(true)
  }
  const handleSheetTouchMove = (e: React.TouchEvent) => {
    if (!sheetIsDragging) return
    const diff = e.touches[0].clientY - sheetDragStartY.current
    if (diff > 0) setSheetDragY(diff)
  }
  const handleSheetTouchEnd = () => {
    setSheetIsDragging(false)
    if (sheetDragY > 100) {
      closeSheet()
    }
    setSheetDragY(0)
  }

  // Variant list used in both desktop dropdown and mobile sheet
  const variantListItems = allVariants?.map((v) => (
    <button
      key={v.id}
      type="button"
      onClick={() => {
        onVariantChange?.(v)
        setVariantOpen(false)
        closeSheet()
      }}
      className={`w-full flex items-center justify-between px-3 py-3 text-sm transition-colors cursor-pointer ${
        selectedVariant?.id === v.id ? "bg-gray-50 font-medium text-gray-900" : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      <span className="flex items-center gap-2">
        {selectedVariant?.id === v.id && <Check className="w-3.5 h-3.5 text-gray-900 shrink-0" />}
        <span>{v.name}</span>
      </span>
      <span className="text-xs text-gray-500 shrink-0">{v.priceCents === 0 ? "Free" : formatPrice(v.priceCents)}</span>
    </button>
  ))

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
      {/* Product thumbnail + name + variant */}
      <div className="flex gap-4 mb-4">
        {/* Thumbnail with quantity badge */}
        <div className="relative h-[74px] w-[74px] shrink-0">
          <div className="relative h-full w-full overflow-hidden rounded-xl bg-gray-100">
            {product.thumbnail_url ? (
              <Image src={product.thumbnail_url} alt={product.title} fill className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center"><Package className="h-7 w-7 text-gray-300" /></div>
            )}
          </div>
          {/* Quantity bubble badge */}
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
            1
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 line-clamp-2">{product.title}</p>
          {/* Variant display + selector */}
          {selectedVariant && (
            <div className="relative mt-1" ref={variantRef}>
              {hasMultipleVariants ? (
                <>
                  {/* Desktop: dropdown trigger */}
                  <button
                    type="button"
                    onClick={() => setVariantOpen(!variantOpen)}
                    className="hidden lg:inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md px-2 py-1 transition-colors cursor-pointer"
                  >
                    <span className="font-medium">{selectedVariant.name}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${variantOpen ? "rotate-180" : ""}`} />
                  </button>
                  {/* Mobile: bottom sheet trigger */}
                  <button
                    type="button"
                    onClick={openSheet}
                    className="lg:hidden inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md px-2 py-1 transition-colors cursor-pointer"
                  >
                    <span className="font-medium">{selectedVariant.name}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {/* Desktop dropdown */}
                  {variantOpen && (
                    <div className="hidden lg:block absolute top-full left-0 mt-1 w-56 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                      <div className="py-1">
                        {variantListItems}
                      </div>
                    </div>
                  )}
                  {/* Mobile bottom sheet */}
                  {sheetVisible && (
                    <div className="lg:hidden fixed inset-0 z-[100]">
                      <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={closeSheet}
                      />
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[70vh] flex flex-col"
                        style={{
                          transform: sheetDragY > 0 ? `translateY(${sheetDragY}px)` : undefined,
                          transition: sheetIsDragging ? "none" : "transform 0.3s ease-out",
                        }}
                      >
                        {/* Drag handle */}
                        <div
                          className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
                          onTouchStart={handleSheetTouchStart}
                          onTouchMove={handleSheetTouchMove}
                          onTouchEnd={handleSheetTouchEnd}
                        >
                          <div className="w-10 h-1 bg-gray-300 rounded-full" />
                        </div>
                        <div className="px-4 pb-3">
                          <h3 className="text-base font-semibold text-gray-900">Select variant</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
                          {variantListItems}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-md px-2 py-1">
                  {selectedVariant.name}
                </span>
              )}
            </div>
          )}
          {productUrl && (
            <a href={productUrl} className="text-xs text-gray-400 hover:text-red-500 transition-colors mt-1.5 inline-block">Remove</a>
          )}
        </div>
        <span className="text-sm font-semibold text-gray-900 whitespace-nowrap shrink-0">{subtotal === 0 ? "Free" : formatPrice(subtotal)}</span>
      </div>
      <Separator className="my-3" />
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Order summary</h3>
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
      <div className="flex justify-between">
        <span className="text-base font-semibold text-gray-900">Total</span>
        <span className="text-lg font-bold text-gray-900">{formatPrice(total)}</span>
      </div>
    </div>
  )
}
