"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { loadStripe } from "@stripe/stripe-js"
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js"
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
function GooglePayIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 150 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.178 17.052v9.891h-3.197V1.526h8.503c2.07 0 4.03.8 5.479 2.222 1.476 1.45 2.304 3.41 2.304 5.505 0 2.094-.828 4.053-2.304 5.502-1.449 1.423-3.41 2.222-5.48 2.222h-5.305v.075zm0-12.35v9.75h5.359c1.395 0 2.716-.553 3.697-1.549 1.009-1.008 1.573-2.355 1.573-3.776 0-1.42-.564-2.768-1.573-3.776-.981-.997-2.302-1.549-3.697-1.549h-5.36v.9z" fill="#5F6368"/>
      <path d="M39.385 9.57c2.383 0 4.259.656 5.633 1.864 1.396 1.235 2.095 2.94 2.095 5.129v10.38H43.94v-2.329h-.134c-1.316 1.96-3.094 2.94-5.332 2.94-1.96 0-3.617-.601-4.97-1.803-1.341-1.202-2.016-2.727-2.016-4.573 0-1.898.698-3.398 2.095-4.494 1.396-1.096 3.202-1.644 5.413-1.644 1.96 0 3.57.394 4.839 1.176v-.828c0-1.176-.508-2.304-1.423-3.154-.916-.85-2.042-1.284-3.36-1.284-1.871 0-3.36.814-4.467 2.434l-2.832-1.792C33.418 10.842 35.876 9.57 39.385 9.57zm-4.258 12.85c0 .935.427 1.792 1.176 2.382.75.601 1.663.915 2.699.915 1.449 0 2.832-.68 3.827-1.871 1.017-1.201 1.524-2.563 1.524-4.082-1.096-.934-2.646-1.396-4.648-1.396-1.423 0-2.646.388-3.645 1.15-.997.761-1.496 1.737-1.496 2.902h.563z" fill="#5F6368"/>
      <path d="M61.988 10.183L49.27 36.934h-3.306l4.349-9.397-7.828-17.354h3.518l5.748 13.43h.08l5.633-13.43h3.524z" fill="#5F6368"/>
      <path d="M85.478 7.984H75.81V26.94h-3.49V7.984h-9.666V4.987H85.48v2.997z" fill="#4285F4"/>
      <path d="M100.584 26.94h-3.49V4.987h3.49V26.94z" fill="#EA4335"/>
      <path d="M117.168 10.183l-1.203 2.97c-1.23-.825-2.81-1.238-4.74-1.238-1.64 0-2.898.35-3.773 1.047-.876.698-1.313 1.588-1.313 2.672 0 1.125.488 1.99 1.463 2.594.976.604 2.455 1.15 4.438 1.636 1.982.486 3.529 1.242 4.641 2.27 1.111 1.026 1.667 2.4 1.667 4.12 0 2.004-.793 3.604-2.38 4.8-1.587 1.197-3.58 1.795-5.98 1.795-2.75 0-5.054-.756-6.91-2.27l1.34-2.903c1.634 1.38 3.536 2.07 5.707 2.07 1.72 0 3.069-.382 4.046-1.145.976-.764 1.465-1.726 1.465-2.888 0-1.161-.466-2.05-1.397-2.662-.93-.613-2.338-1.167-4.223-1.662-1.885-.495-3.41-1.222-4.575-2.182-1.166-.959-1.749-2.31-1.749-4.053 0-1.908.73-3.44 2.19-4.598C107.55 10.523 109.39 9.944 111.609 9.944c2.22 0 4.13.413 5.559 1.239z" fill="#FBBC04"/>
      <path d="M135.5 10.183l-1.203 2.97c-1.23-.825-2.81-1.238-4.74-1.238-1.64 0-2.898.35-3.773 1.047-.876.698-1.313 1.588-1.313 2.672 0 1.125.488 1.99 1.463 2.594.976.604 2.455 1.15 4.438 1.636 1.982.486 3.529 1.242 4.641 2.27 1.111 1.026 1.667 2.4 1.667 4.12 0 2.004-.793 3.604-2.38 4.8-1.587 1.197-3.58 1.795-5.98 1.795-2.75 0-5.054-.756-6.91-2.27l1.34-2.903c1.634 1.38 3.536 2.07 5.707 2.07 1.72 0 3.069-.382 4.046-1.145.976-.764 1.465-1.726 1.465-2.888 0-1.161-.466-2.05-1.397-2.662-.93-.613-2.338-1.167-4.223-1.662-1.885-.495-3.41-1.222-4.575-2.182-1.166-.959-1.749-2.31-1.749-4.053 0-1.908.73-3.44 2.19-4.598 1.458-1.157 3.299-1.736 5.518-1.736 2.219 0 4.129.413 5.558 1.239z" fill="#4285F4"/>
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
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [cardComplete, setCardComplete] = useState({
    cardNumber: false,
    cardExpiry: false,
    cardCvc: false,
  })

  const isCardComplete = cardComplete.cardNumber && cardComplete.cardExpiry && cardComplete.cardCvc

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

  return (
    <div className="space-y-4">
      {/* Express Checkout */}
      {!isFree && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4 text-center">Express checkout</p>
          <div className="grid grid-cols-2 gap-3">
            {/* Google Pay */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !agreedToTerms || !isContactValid || !stripe}
              className="flex items-center justify-center h-12 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <GooglePayIcon className="h-[22px] w-auto" />
            </button>
            {/* PayPal */}
            <div className="relative group">
              <button
                type="button"
                disabled
                className="w-full flex items-center justify-center h-12 rounded-xl bg-[#FFC439] border border-[#F0B72A] cursor-not-allowed transition-all overflow-hidden"
              >
                <PayPalIcon className="h-7 w-auto" />
              </button>
              <div className="absolute inset-0 flex items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/75 pointer-events-none">
                <span className="text-xs text-white font-medium">Not available now</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mt-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">OR PAY WITH CARD</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        </div>
      )}

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
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <Lock className="h-3 w-3" />
          Secured by Stripe
        </p>
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
  selectedVariant,
  isPwyw,
  customPriceCents,
}: CheckoutPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const urlEmail = searchParams.get("email") || ""

  const [firstName, setFirstName] = useState(() => loadSessionField(SESSION_KEYS.firstName))
  const [lastName, setLastName] = useState(() => loadSessionField(SESSION_KEYS.lastName))
  const [email, setEmail] = useState(() => urlEmail || "")
  const [vatId, setVatId] = useState(() => loadSessionField(SESSION_KEYS.vatId))
  const [country, setCountry] = useState(() => loadSessionField(SESSION_KEYS.country) || "US")
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [nameOnCard, setNameOnCard] = useState("")

  const [tipAmount, setTipAmount] = useState(0)
  const [customTip, setCustomTip] = useState("")
  const [isGift, setIsGift] = useState(false)

  const [discountCode, setDiscountCode] = useState(() => loadSessionField(SESSION_KEYS.discountCode))
  const [discountApplied, setDiscountApplied] = useState(false)
  const [discountPercent, setDiscountPercent] = useState(0)

  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [mobileOrderOpen, setMobileOrderOpen] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showVariantModal, setShowVariantModal] = useState(false)

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
  const discountCents = discountApplied ? Math.round(subtotal * (discountPercent / 100)) : 0
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
      setIsSubmitting(false)
    }
  }

  // Create PaymentIntent
  const createPaymentIntent = useCallback(async () => {
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
      throw new Error(data.error || "Failed to create payment session")
    }

    return { clientSecret: data.clientSecret, paymentIntentId: data.paymentIntentId }
  }, [product.id, firstName, lastName, email, tipCents, isGift, selectedVariant, isPwyw, customPriceCents])

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

        router.push(`${completeData.redirectUrl}?emailSent=1`)
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

  const handleApplyDiscount = () => {
    if (!discountCode.trim()) return
    setDiscountApplied(true)
    setDiscountPercent(10)
  }

  const handleRemoveDiscount = () => {
    setDiscountApplied(false)
    setDiscountPercent(0)
    setDiscountCode("")
  }

  // ---------- RENDER ----------

  // Right column content (Desktop: Order Summary, Discount, Tip, Gift)
  const rightColumnContent = (
    <div className="space-y-5">
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

      <section className="hidden lg:block bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
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
            <button type="button" onClick={handleRemoveDiscount} className="text-green-600 hover:text-green-800 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input placeholder="Enter discount code" value={discountCode} onChange={(e) => setDiscountCode(e.target.value)} className="flex-1 h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20" />
            <Button variant="outline" onClick={handleApplyDiscount} disabled={!discountCode.trim()} className="h-11 px-5 rounded-xl border-gray-200">Apply</Button>
          </div>
        )}
      </section>

      <section className="hidden lg:block bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
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

      <section className="hidden lg:block bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
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

  // Payment content - Elements renders immediately without clientSecret
  const paymentElementsContent = !isFree ? (
    <Elements stripe={stripePromise}>
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
      />
    </Elements>
  ) : (
    <div className="space-y-4">
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
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
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

      <div className="mx-auto max-w-[1400px] px-6 sm:px-10 lg:px-16 py-6 sm:py-10 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {/* Mobile order summary toggle - open by default */}
        <div className="mb-4 lg:hidden">
          <OrderSummaryMobileToggle isOpen={mobileOrderOpen} onToggle={() => setMobileOrderOpen(!mobileOrderOpen)} total={total} />
          {mobileOrderOpen && (
            <div className="mt-3 animate-in slide-in-from-top-2 duration-200">
              <OrderSummaryContent product={product} creator={creator} selectedVariant={selectedVariant} subtotal={subtotal} tipCents={tipCents} discountApplied={discountApplied} discountCents={discountCents} total={total} isPwyw={isPwyw} formatPrice={formatPrice} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* LEFT COLUMN */}
          <div className="flex flex-col gap-5 order-2 lg:order-1">

            {/* Contact Information */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-1">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Contact information</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-xs font-medium text-gray-600">First Name *</Label>
                    <Input id="firstName" type="text" placeholder="John" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lastName" className="text-xs font-medium text-gray-600">Last Name *</Label>
                    <Input id="lastName" type="text" placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-gray-600">Email address *</Label>
                  <Input id="email" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20" required />
                  <p className="text-xs text-gray-400">We&apos;ll send your download link to this email</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">Country</Label>
                  <CountrySelector value={country} onChange={setCountry} />
                </div>
              </div>
            </section>

            {/* Product Card */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-2">
              <div className="flex gap-4">
                <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-xl bg-gray-100">
                  <div className="relative h-full w-full overflow-hidden rounded-xl">
                    {product.thumbnail_url ? (
                      <Image src={product.thumbnail_url} alt={product.title} fill className="object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center"><Package className="h-8 w-8 text-gray-300" /></div>
                    )}
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-black text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md z-10 ring-2 ring-white">1</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-base sm:text-lg text-gray-900 line-clamp-2">{product.title}</h2>
                      {selectedVariant && <p className="text-sm font-medium text-gray-600 mt-0.5">{selectedVariant.name}</p>}
                      <p className="text-sm text-gray-500 truncate mt-0.5">{creator.name}</p>
                    </div>
                    <span className="font-semibold text-gray-900 whitespace-nowrap">{subtotal === 0 ? "Free" : formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    {selectedVariant && (
                      <button type="button" onClick={() => setShowVariantModal(true)} className="text-xs font-medium text-gray-600 hover:text-gray-800 underline underline-offset-2 cursor-pointer transition-colors">Edit</button>
                    )}
                    <a href={productUrl} className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors cursor-pointer">Remove</a>
                  </div>
                </div>
              </div>
            </section>

            {/* Business VAT ID */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-7 lg:order-3">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Business VAT ID (optional)</h3>
              <Input placeholder="e.g. DE123456789" value={vatId} onChange={(e) => setVatId(e.target.value)} className="h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20" />
              <p className="text-xs text-gray-400 mt-1.5">Only required for EU B2B transactions</p>
            </section>

            {/* Payment Elements */}
            <div className="order-3 lg:order-4">
              {paymentElementsContent}
            </div>

            {/* Discount - Mobile only */}
            <section className="lg:hidden bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Tag className="w-4 h-4 text-gray-400" />Discount code
              </h3>
              {discountApplied ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">{discountCode}</span>
                    <span className="text-xs text-green-600">(-{discountPercent}%)</span>
                  </div>
                  <button type="button" onClick={handleRemoveDiscount} className="text-green-600 hover:text-green-800 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input placeholder="Enter discount code" value={discountCode} onChange={(e) => setDiscountCode(e.target.value)} className="flex-1 h-11 rounded-xl border-gray-200 focus-visible:border-gray-400 focus-visible:ring-gray-400/20" />
                  <Button variant="outline" onClick={handleApplyDiscount} disabled={!discountCode.trim()} className="h-11 px-5 rounded-xl border-gray-200">Apply</Button>
                </div>
              )}
            </section>

            {/* Tip - Mobile only */}
            <section className="lg:hidden bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-5">
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

            {/* Gift - Mobile only */}
            <section className="lg:hidden bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 order-6">
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

          {/* RIGHT COLUMN */}
          <div className="order-1 lg:order-2 lg:sticky lg:top-6">
            {rightColumnContent}
          </div>
        </div>
      </div>

      {/* Mobile sticky pay button */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 z-50" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="pt-3">
          <button
            type="button"
            disabled={isSubmitting || !isFormValid}
            className="w-full flex items-center justify-center gap-2 h-13 rounded-2xl text-base font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-500/20 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (<><Loader2 className="h-5 w-5 animate-spin" />Processing...</>) : isFree ? (<>Get for Free &rarr;</>) : (<><Lock className="h-4 w-4" />Pay {formatPrice(total)}</>)}
          </button>
        </div>
      </div>

      <div className="lg:hidden h-20" />

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
  product, creator, selectedVariant, subtotal, tipCents, discountApplied, discountCents, total, isPwyw, formatPrice,
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
      <div className="flex items-center gap-3 mb-4">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
          {product.thumbnail_url ? (
            <Image src={product.thumbnail_url} alt={product.title} fill className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center"><Package className="h-5 w-5 text-gray-300" /></div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
          {selectedVariant && <p className="text-xs text-gray-500">{selectedVariant.name}</p>}
        </div>
        <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{subtotal === 0 ? "Free" : formatPrice(subtotal)}</span>
      </div>
      <Separator className="my-3" />
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
