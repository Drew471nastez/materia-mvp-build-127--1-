"use client"

import { announceChange } from "@/lib/seo/announce-client"
import type React from "react"
import { BottomSheet, SHEET_CLOSE_MS, SHEET_EASE, SHEET_OPEN_MS } from "@/components/ui/bottom-sheet"
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient, isNativePlatform } from "@/lib/supabase/client"
import { nativeLogOut } from "@/lib/native-bridge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SmartLink } from "@/components/smart-link"
import { InfoTip } from "@/components/ui/tooltip"
import { ChoicePicker } from "@/components/ui/choice-list"
import {
  X, Check, Loader2, AlertCircle, Mail, Lock,
  CreditCard, Shield, Settings, Wallet, Landmark,
  ExternalLink, ChevronRight, Globe,
  User, FileText, ChevronLeft,
  ToggleLeft, LogOut, Trash2, Languages, Info, ChevronDown, CheckCircle, Clock, Copy, Plus
} from "lucide-react"
import type { Profile, Creator } from "@/lib/types"
import { isValidUsername } from "@/lib/reserved-words"
import { getLinksShareUrl, getLinksUrlDisplay, getStoreShareUrl, getStoreUrl, getStoreUrlDisplay, getWebsiteShareUrl, getWebsiteUrlDisplay } from "@/lib/url-helpers"
import { isNativeApp } from "@/lib/platform-utils"
import { openExternal } from "@/lib/native-bridge"
import { useLanguage, type LanguageCode } from "@/lib/i18n"
import { appLanguageChoices, appLanguageName } from "@/components/app/language-picker"
import { rememberTimeZone } from "@/lib/orders/time-zone"
import { TIME_ZONE_STORAGE_KEY, validTimeZone } from "@/lib/account/time-zone"
import { BillingPageClient } from "@/components/app/billing/billing-page-client"
import { AppAvatar } from "@/components/app/app-avatar"
import { TimeZonePicker } from "@/components/app/time-zone-picker"
import { CountryPicker } from "@/components/app/settings/country-picker"
import { ProfilePhoto } from "@/components/app/settings/profile-photo"
import { DomainsPanel, type DomainsData } from "@/components/app/settings/domains-panel"
import { creatorPageHostFrom, websiteHostFrom } from "@/lib/custom-domains/client"
import { AddressList, type SettingsWebsite } from "@/components/app/settings/addresses"
import { WaitingArea } from "@/components/ui/activity-spinner"
import { ShareStorelib } from "@/components/app/share/share-storelib"
import type { ConnectedPlatform, ShareAddress } from "@/components/app/share/share-data"
import { EmailChangeFlow, PrivacyPanel, SecurityPanel } from "@/components/app/settings/account-panels"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { applyBusinessSession } from "@/lib/businesses/switch-client"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { countWord } from "@/lib/businesses/rules"

/* The country field is components/app/settings/country-picker: every country, with its flag. */


const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "security", label: "Security", icon: Shield },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "domains", label: "Domains", icon: Globe },
  { id: "privacy", label: "Privacy", icon: ToggleLeft },
] as const
/*
  NO STORES TAB. "Get rid of the Stores tab in Settings. It doesn't make any
  sense." It held three cards, each a copy of something that has a home: the
  creator page's address (General, Your addresses, which opens it), a link to
  the creator page editor and a link to the OnePage editor (both in the
  sidebar). An old ?tab=stores link opens General.
*/

type TabId = typeof TABS[number]["id"]
const TAB_IDS: TabId[] = ["general", "security", "payments", "billing", "domains", "privacy"]

interface SettingsFormProps {
  profile: Profile & {
    cover_url?: string
    first_name?: string
    last_name?: string
    address_line1?: string
    address_line2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
    display_name?: string
    username?: string
  }
  creator: Creator & {
    store_published?: boolean
    brand_color?: string
    cover_url?: string
    support_email?: string | null
    statement_descriptor?: string | null
    payout_currency?: string | null
    slug?: string
  }
  /** The account's time zone (lib/account/time-zone), or null when none is saved yet. */
  accountTimeZone?: string | null
  /** True only when a site has actually been published, never when one merely exists. */
  websitePublished?: boolean
  /** On Storelib's own newsletter list (storelib_newsletter), read on the server. */
  newsletter?: boolean
  /** The published website, and the name it answers to when it has one of its own. */
  website?: SettingsWebsite | null
  /** The OnePage is published, so its address opens. */
  onePageLive?: boolean
  /** The platforms the creator is on, for the share pill's "My platforms". */
  sharePlatforms?: ConnectedPlatform[]
  /**
   * How many other stores on this login go when this account goes: none
   * unless this account is the login's first (app/app/settings/_server.ts).
   * Deleting is one plain thing here, the same on every store; this is only
   * so the confirmation can name everything it removes.
   */
  otherStores?: number
  initialTab?: TabId
}

/**
 * A phone, by the same breakpoint the sheet hides itself at. One answer, so
 * the children are drawn once: they used to be drawn twice, in a desktop
 * modal and a phone sheet, with CSS hiding one, which doubled every input
 * and left refs pointing at whichever copy mounted last.
 */
function useIsPhone() {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return phone
}

// Settings' own sheet: the shared phone sheet below 640px, a centred modal above.
function MobileBottomSheet({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  const phone = useIsPhone()
  if (phone) {
    return (
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        label={title}
        header={<h3 className="px-4 pb-3 pt-3 text-[16px] font-semibold text-[#1a1a2e]">{title}</h3>}
      >
        <div className="px-4 pb-4">{children}</div>
      </BottomSheet>
    )
  }
  return <DesktopSettingsModal isOpen={isOpen} onClose={onClose} title={title}>{children}</DesktopSettingsModal>
}

/** The desktop half: fades and scales in, on the same curve as the sheet. */
function DesktopSettingsModal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  const [isVisible, setIsVisible] = useState(isOpen)
  const [isAnimating, setIsAnimating] = useState(false)
  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen)
    if (isOpen) setIsVisible(true)
    else setIsAnimating(false)
  }
  const shownRef = useRef<React.ReactNode>(children)
  if (isOpen) shownRef.current = children

  useEffect(() => {
    if (!isVisible) return
    if (isOpen) {
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setIsAnimating(true)))
      return () => cancelAnimationFrame(id)
    }
    const timer = setTimeout(() => setIsVisible(false), SHEET_CLOSE_MS)
    return () => clearTimeout(timer)
  }, [isOpen, isVisible])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  if (!isVisible) return null

  return (
    <div data-app-sheet="open" className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        style={{ opacity: isAnimating ? 1 : 0, transitionDuration: `${isAnimating ? SHEET_OPEN_MS : SHEET_CLOSE_MS}ms`, transitionTimingFunction: SHEET_EASE }}
        onClick={onClose}
      />
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center p-4">
        <div
          className="pointer-events-auto relative w-full max-w-md rounded-2xl bg-white shadow-xl"
          style={{
            opacity: isAnimating ? 1 : 0,
            transform: isAnimating ? "none" : "scale(0.95)",
            transitionProperty: "opacity, transform",
            transitionDuration: `${isAnimating ? SHEET_OPEN_MS : SHEET_CLOSE_MS}ms`,
            transitionTimingFunction: SHEET_EASE,
          }}
        >
          <div className="flex items-center justify-between p-4 border-b border-[#e5e7eb]">
            <h2 className="text-[18px] font-semibold text-[#1a1a2e]">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 max-h-[70vh] overflow-y-auto overscroll-contain">{shownRef.current}</div>
        </div>
      </div>
    </div>
  )
}

export function SettingsFormNew({ profile, creator, accountTimeZone = null, websitePublished = false, newsletter = false, website = null, onePageLive = false, sharePlatforms = [], otherStores = 0, initialTab = "general" }: SettingsFormProps) {
  const router = useRouter()
  const { language: currentLanguage, setLanguage, t } = useLanguage()
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>(currentLanguage)
  const initialLanguage = useRef(currentLanguage)

  /*
    THE ACCOUNT'S TIME ZONE (lib/account/time-zone): the one saved on the
    account, else the one this browser chose before it was saved anywhere,
    else the device's own. Saved with the rest of the page, to the account.
  */
  const [selectedTimezone, setSelectedTimezone] = useState<string>(() => {
    if (accountTimeZone) return accountTimeZone
    if (typeof window !== "undefined") {
      try {
        const stored = validTimeZone(localStorage.getItem(TIME_ZONE_STORAGE_KEY))
        if (stored) return stored
      } catch {
        /* Storage refused: the device's zone. */
      }
      return validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? "UTC"
    }
    return "UTC"
  })
  const initialTimezone = useRef(selectedTimezone)

  // Support Email state - for customer receipts
  const [supportEmail, setSupportEmail] = useState(creator?.support_email || "")
  const initialSupportEmail = useRef(supportEmail)

  const normalizeStatementDescriptor = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, "")
      .slice(0, 22)

  const defaultStatementDescriptor = normalizeStatementDescriptor(
    (creator?.statement_descriptor || profile?.username || (creator as any)?.display_name || "STORE").trim()
  )

  const [payoutCurrency, setPayoutCurrency] = useState((creator as any)?.payout_currency || "USD")
  const [statementDescriptor, setStatementDescriptor] = useState(defaultStatementDescriptor)
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const initialPayoutCurrency = useRef(payoutCurrency)
  const initialStatementDescriptor = useRef(statementDescriptor)

  /**
   * SEEDED FROM THE SERVER, NOT FROM NOTHING.
   *
   * This used to start at `{ connected: false }` with a separate
   * `stripeStatusLoading` flag, and the Get paid banner was hidden until a
   * client-side fetch came back. So the page painted, and then half a
   * second later a full-width purple bar appeared and shoved everything
   * below it down — which is the banner "appearing very late and delayed".
   *
   * The creator row already carries `stripe_account_id`, and the settings
   * page already selects it. So the answer is in the first paint: somebody
   * with no account sees the banner immediately, somebody with one never
   * sees it flash. The fetch still runs and still refines the detail —
   * whether charges and payouts are actually enabled — it just no longer
   * decides whether a whole bar exists.
   */
  const connectedAtLoad = Boolean((creator as { stripe_account_id?: string | null } | null)?.stripe_account_id)
  const [stripeStatus, setStripeStatus] = useState<{ connected: boolean; status: string; chargesEnabled?: boolean; payoutsEnabled?: boolean; detailsSubmitted?: boolean; accountId?: string | null }>({
    connected: connectedAtLoad,
    status: connectedAtLoad ? "connected" : "not_connected",
  })
  const [stripeBusy, setStripeBusy] = useState<"connect" | "disconnect" | null>(null)
  const [showStripeManage, setShowStripeManage] = useState(false)
  const [stripeBankInfo, setStripeBankInfo] = useState<{ bankName: string | null; last4: string; currency: string; status: string | null } | null>(null)
  const [stripeBankLoading, setStripeBankLoading] = useState(false)
  const [stripePayoutInfo, setStripePayoutInfo] = useState<{ payoutsEnabled: boolean; detailsSubmitted: boolean; requirementsDue: string[]; requirementsPastDue: string[] } | null>(null)

  /* A tab that no longer exists (an old ?tab=stores) is General. */
  const [activeTab, setActiveTab] = useState<TabId>(() => (TAB_IDS.includes(initialTab) ? initialTab : "general"))
  /**
   * Billing's own data, fetched the first time the tab is opened and kept.
   *
   * It is the one panel here with a real wait in it — Stripe is asked for
   * the customer, the subscription, the invoices and the card — so it is
   * the one panel that can show a loading state honestly. Kept afterwards,
   * so coming back to the tab is as instant as every other one.
   */
  const [billingData, setBillingData] = useState<null | {
    plans: unknown[]
    subscription: unknown
    currentPlan: unknown
    invoices: unknown[]
    paymentMethod: unknown
  }>(null)
  const [billingError, setBillingError] = useState(false)
  const billingAsked = useRef(false)

  const loadBilling = useCallback(async () => {
    if (billingAsked.current) return
    billingAsked.current = true
    setBillingError(false)
    try {
      const response = await fetch("/api/billing/overview")
      if (!response.ok) throw new Error("billing")
      setBillingData(await response.json())
    } catch {
      /* Asked again on the next visit rather than stuck for the session. */
      billingAsked.current = false
      setBillingError(true)
    }
  }, [])

  useEffect(() => {
    if (activeTab === "billing") void loadBilling()
  }, [activeTab, loadBilling])
  const tabNavRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)
  /* The outline that slides from one tab to the next (see the layout effect by the tab bar's auto scroll). */
  const tabRingRef = useRef<HTMLSpanElement>(null)
  const [tabRingOn, setTabRingOn] = useState(false)
  /* A tab was pressed, not opened by the address on load: only then do the outline and the new panel move. */
  const tabPressedRef = useRef(false)
  const [panelEntrance, setPanelEntrance] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showSaveToast, setShowSaveToast] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectHelpUrl, setConnectHelpUrl] = useState<string | null>(null)
  const [usernameError, setUsernameError] = useState<string | null>(null)

  /*
    THE PLAN, KNOWN FROM THE FIRST FRAME. The Domains tab is blurred on the
    free plan, and the plan used to be known only once the browser had asked
    /api/billing/subscription: the domains were drawn sharp, then blurred
    over 700ms a moment later. The creator row the server already read
    carries the plan (the same subscription_plan_id Home reads), so the page
    starts with it; the request still runs and corrects it if it has just
    changed (an upgrade a moment ago).
  */
  const serverPlan = typeof (creator as { subscription_plan_id?: unknown } | null)?.subscription_plan_id === "string"
    ? ((creator as { subscription_plan_id?: string }).subscription_plan_id || "free")
    : null
  const [userPlan, setUserPlan] = useState<string | null>(serverPlan)
  const [planLoading, setPlanLoading] = useState(serverPlan === null)

  // Domain state
  const [domains, setDomains] = useState<any[]>([])
  const [domainsLoading, setDomainsLoading] = useState(false)
  /* The whole GET /api/domains answer: the list, and the primary host of each purpose. */
  const [domainsData, setDomainsData] = useState<DomainsData | null>(null)

  /*
    THE PROFILE'S PHOTO, OR THE INITIALS, READ FROM THE SAME PLACE THE HEADER
    READS IT (lib/account/avatar-store): the server's answer, or the one this
    page or another tab has just saved. It walked the creator row, the creator
    page header, the OnePage and the Google picture once, so Settings and the
    header could each show a different photo. It is saved the moment it is
    changed (components/app/settings/profile-photo), so it is not one of the
    fields the save bar asks about.
  */
  const avatarUrl = useShellAvatar(profile.avatar_url) ?? ""

  // Profile fields
  const [firstName, setFirstName] = useState(profile.first_name || profile.display_name?.split(" ")[0] || "")
  const [lastName, setLastName] = useState(profile.last_name || profile.display_name?.split(" ").slice(1).join(" ") || "")
  const [username, setUsername] = useState(profile.username || creator.slug || "")

  // Track initial values for unsaved changes detection
  const initialValues = useRef({
    firstName: profile.first_name || profile.display_name?.split(" ")[0] || "",
    lastName: profile.last_name || profile.display_name?.split(" ").slice(1).join(" ") || "",
    username: profile.username || creator.slug || "",
    addressLine1: profile.address_line1 || "",
    city: profile.city || "",
    state: profile.state || "",
    postalCode: profile.postal_code || "",
    country: profile.country || "",
  })

  // Avatar upload/crop states

  // Email fields
  /* A second business's address is its owner's with a tag (lib/businesses/email-alias); the owner's is the one shown, and the one its codes are sent to. */
  const [currentEmail, setCurrentEmail] = useState(ownerAddress(profile.email) || profile.email || "")
  const [emailVerified] = useState(true)

  // Address fields
  const [addressLine1, setAddressLine1] = useState(profile.address_line1 || "")
  const [addressLine2, setAddressLine2] = useState(profile.address_line2 || "")
  const [city, setCity] = useState(profile.city || "")
  const [state, setState] = useState(profile.state || "")
  const [postalCode, setPostalCode] = useState(profile.postal_code || "")
  const [country, setCountry] = useState(profile.country || "")

  // Detect unsaved changes
  const hasUnsavedChanges =
    firstName !== initialValues.current.firstName ||
    lastName !== initialValues.current.lastName ||
    username !== initialValues.current.username ||
    addressLine1 !== initialValues.current.addressLine1 ||
    city !== initialValues.current.city ||
    state !== initialValues.current.state ||
    postalCode !== initialValues.current.postalCode ||
    country !== initialValues.current.country ||
    selectedLanguage !== initialLanguage.current ||
    selectedTimezone !== initialTimezone.current ||
    supportEmail !== initialSupportEmail.current ||
    payoutCurrency !== initialPayoutCurrency.current ||
    statementDescriptor !== initialStatementDescriptor.current


  const loadStripeStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/connect/status")
      const data = await res.json()
      if (res.ok) setStripeStatus(data)
    } finally {
    }
  }, [])

  const loadStripeBankInfo = useCallback(async () => {
    setStripeBankLoading(true)
    try {
      const res = await fetch("/api/stripe/payout-method")
      const data = await res.json()
      if (res.ok && data.bankAccount) setStripeBankInfo(data.bankAccount)
      else setStripeBankInfo(null)
      // Store requirements & status info
      if (res.ok) {
        setStripePayoutInfo({
          payoutsEnabled: data.payoutsEnabled ?? false,
          detailsSubmitted: data.detailsSubmitted ?? false,
          requirementsDue: data.requirementsDue || [],
          requirementsPastDue: data.requirementsPastDue || [],
        })
      }
    } catch {
      setStripeBankInfo(null)
    } finally {
      setStripeBankLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === "payments" || activeTab === "general") loadStripeStatus()
    if (activeTab === "payments") loadStripeBankInfo()
  }, [activeTab, loadStripeStatus, loadStripeBankInfo])

  // Auto-refresh bank info on window focus (catches updates from Stripe hosted form)
  useEffect(() => {
    const onFocus = () => {
      if (activeTab === "payments") loadStripeBankInfo()
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [activeTab, loadStripeBankInfo])

  // Fetch domains - defined here (before the URL params useEffect) to avoid TDZ in production builds
  /*
    A REFRESH KEEPS THE LIST ON SCREEN. The list is fetched once on mount and
    again each time the Domains tab is opened; the second fetch used to swap
    the list for a spinner and back, a box changing height under the tab
    for no new information. Only the first load, with nothing to show yet,
    shows the spinner now.
  */
  const domainsLoadedRef = useRef(false)
  const fetchDomains = useCallback(async () => {
    if (!domainsLoadedRef.current) setDomainsLoading(true)
    try {
      const res = await fetch("/api/domains")
      const data = await res.json()
      if (data.domains) {
        setDomains(data.domains)
        setDomainsData(data)
      }
      domainsLoadedRef.current = true
    } catch (err) {
      console.error("Failed to fetch domains:", err)
    } finally {
      setDomainsLoading(false)
    }
  }, [])

  // Fetch domains on mount so quick links can use the custom domain
  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  // Fetch subscription plan on mount (for feature gating in Domains tab etc.)
  useEffect(() => {
    fetch("/api/billing/subscription")
      .then((r) => r.json())
      .then((data) => setUserPlan(data.currentPlan?.id || "free"))
      .catch(() => setUserPlan("free"))
      .finally(() => setPlanLoading(false))
  }, [])

  /* A certificate being issued is polled by the Domains panel itself, while it is open. */

  // Handle URL parameters for tab navigation and Stripe Connect return/refresh
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get("tab") as TabId | null
    const stripeParam = params.get("stripe")

    if (tab && TAB_IDS.includes(tab as TabId)) {
      setActiveTab(tab as TabId)
      if (tab === "domains") fetchDomains()
    } else if (tab) {
      /* A tab that is gone (?tab=stores) or never was: General, and the address says so. */
      const url = new URL(window.location.href)
      url.searchParams.delete("tab")
      window.history.replaceState({}, "", url.pathname + url.search)
    }

    if (stripeParam === "return" || stripeParam === "refresh") {
      setActiveTab("payments")
      loadStripeStatus()
      // Clean URL
      const url = new URL(window.location.href)
      url.searchParams.delete("tab")
      url.searchParams.delete("stripe")
      window.history.replaceState({}, "", url.pathname)
    }
  }, [loadStripeStatus, fetchDomains])

  const connectStripe = async () => {
    setStripeBusy("connect")
    try {
      const res = await fetch("/api/stripe/connect/start", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        console.error("Stripe Connect start error:", data)
        if (data?.code === "platform_not_configured" && data?.helpUrl) {
          setConnectHelpUrl(data.helpUrl)
        }
        setError(data?.error || "Failed to start Stripe Connect. Please try again.")
        setTimeout(() => setError(null), 15000)
        return
      }
      if (data?.url) {
        if (isNativeApp()) {
          // On native: open in SFSafariViewController (iOS) / Chrome Custom Tab (Android)
          openExternal(data.url)
          // Refresh Stripe status when the user returns to the app
          try {
            const { App } = await import("@capacitor/app")
            const handle = await App.addListener("appStateChange", ({ isActive }) => {
              if (isActive) {
                handle.remove()
                loadStripeStatus()
              }
            })
          } catch { /* @capacitor/app not available */ }
        } else {
          // Web: open in a popup window so the user stays on the settings page
          const w = 1100
          const h = 700
          const left = window.screenX + (window.outerWidth - w) / 2
          const top = window.screenY + (window.outerHeight - h) / 2
          const popup = window.open(data.url, "stripe-connect", `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`)
          if (popup) {
            const pollTimer = setInterval(() => {
              if (popup.closed) {
                clearInterval(pollTimer)
                loadStripeStatus()
              }
            }, 1000)
          } else {
            window.location.href = data.url
          }
        }
      } else {
        setError("No onboarding URL returned. Please try again.")
        setTimeout(() => setError(null), 5000)
      }
    } catch (err) {
      console.error("Stripe Connect fetch error:", err)
      setError("Network error. Please check your connection and try again.")
      setTimeout(() => setError(null), 5000)
    } finally {
      setStripeBusy(null)
    }
  }


  const manageStripe = async () => {
    setStripeBusy("connect")
    try {
      const res = await fetch("/api/stripe/account-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "update" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to open account settings")
      if (data?.url) {
        if (isNativeApp()) {
          openExternal(data.url)
          try {
            const { App } = await import("@capacitor/app")
            const handle = await App.addListener("appStateChange", ({ isActive }) => {
              if (isActive) {
                handle.remove()
                loadStripeStatus()
                loadStripeBankInfo()
              }
            })
          } catch { /* @capacitor/app not available */ }
        } else {
          const w = 1100, h = 700
          const left = window.screenX + (window.outerWidth - w) / 2
          const top = window.screenY + (window.outerHeight - h) / 2
          const popup = window.open(data.url, "stripe-manage", `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`)
          if (popup) {
            const pollTimer = setInterval(() => {
              if (popup.closed) {
                clearInterval(pollTimer)
                loadStripeStatus()
                loadStripeBankInfo()
              }
            }, 1000)
          } else {
            window.location.href = data.url
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Try again.")
      setTimeout(() => setError(null), 5000)
    } finally {
      setStripeBusy(null)
    }
  }

  const disconnectStripe = async () => {
    setStripeBusy("disconnect")
    try {
      await fetch("/api/stripe/connect/disconnect", { method: "POST" })
      await loadStripeStatus()
    } finally {
      setStripeBusy(null)
    }
  }

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)")
    const update = () => setIsMobileViewport(mq.matches)
    update()
    mq.addEventListener?.("change", update)
    return () => mq.removeEventListener?.("change", update)
  }, [])

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ""
        return ""
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Email change: the flow keeps its own steps; a new run each time it opens.
  const [showEmailChangeModal, setShowEmailChangeModal] = useState(false)
  const [emailChangeRun, setEmailChangeRun] = useState(0)

  // Sign out all devices
  const [signingOutAll, setSigningOutAll] = useState(false)

  // Delete account modal
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteStep, setDeleteStep] = useState<"confirm" | "verify">("confirm")
  const [deleteVerificationCode, setDeleteVerificationCode] = useState(["", "", "", "", "", ""])
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteCodeInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const storeUrl = getStoreUrl(username)
  const storeUrlDisplay = getStoreUrlDisplay(username)
  const fullNameForUsernameInput = [firstName, lastName].filter(Boolean).join(" ").trim()

  const validateUsername = (value: string) => {
    const cleanValue = value.toLowerCase().replace(/[^a-z0-9-]/g, "")
    setUsername(cleanValue)
    setUsernameError(null)

    if (cleanValue.length < 3) {
      setUsernameError("Username must be at least 3 characters")
      return
    }

    const validation = isValidUsername(cleanValue)
    if (!validation.valid) {
      setUsernameError(validation.error || "Invalid username")
    }
  }

  // Auto-scroll tab nav to active tab on mobile
  useEffect(() => {
    if (activeTabRef.current && tabNavRef.current) {
      const container = tabNavRef.current
      const activeEl = activeTabRef.current
      const scrollLeft = activeEl.offsetLeft - container.offsetWidth / 2 + activeEl.offsetWidth / 2
      container.scrollTo({ left: scrollLeft, behavior: "smooth" })
    }
  }, [activeTab])

  /*
    THE SELECTED TAB'S OUTLINE SLIDES TO THE NEXT ONE.
    One outline over the whole bar, placed on the selected tab by measuring
    it, instead of a border on each tab that went out on one and came on at
    another. On a press it moves there in 200ms on transform alone: it is
    drawn at its new place and width, and starts from the old one by a
    translate and a scaleX that end at none, so it rests at scale 1 and its
    round ends are never stretched. A press during the slide starts from
    where the outline is on screen, not where it was going.

    The tab's own border stays until the outline is placed, before the first
    paint, so there is never a frame with no selection. A change in the tab's
    size (Inter arriving after the fallback) moves it without a slide, and so
    does a tab opened by the address on load. Nothing slides when the system
    asks for less motion.
  */
  useLayoutEffect(() => {
    const ring = tabRingRef.current
    const tab = activeTabRef.current
    if (!ring || !tab) return
    const place = (slide: boolean) => {
      const x = tab.offsetLeft
      const w = tab.offsetWidth
      let from: { x: number; w: number } | null = null
      if (slide && ring.style.width && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const at = ring.getBoundingClientRect()
        const bar = (ring.offsetParent as HTMLElement | null)?.getBoundingClientRect()
        if (bar && at.width > 0) from = { x: at.left - bar.left, w: at.width }
      }
      ring.getAnimations().forEach((a) => a.cancel())
      ring.style.top = `${tab.offsetTop}px`
      ring.style.height = `${tab.offsetHeight}px`
      ring.style.width = `${w}px`
      ring.style.transform = `translateX(${x}px)`
      if (from && (Math.abs(from.x - x) > 0.5 || Math.abs(from.w - w) > 0.5)) {
        ring.animate(
          [{ transform: `translateX(${from.x}px) scaleX(${from.w / w})` }, { transform: `translateX(${x}px)` }],
          { duration: 200, easing: "cubic-bezier(0.33, 1, 0.68, 1)" },
        )
      }
    }
    place(tabPressedRef.current)
    tabPressedRef.current = false
    setTabRingOn(true)
    /* Its first report is the size just placed; only a real change re-places it, so it never cuts the slide short. */
    const resized = new ResizeObserver(() => {
      if (ring.style.width !== `${tab.offsetWidth}px` || ring.style.height !== `${tab.offsetHeight}px`) place(false)
    })
    resized.observe(tab)
    return () => resized.disconnect()
  }, [activeTab])

  // fetchDomains moved above the URL params useEffect to avoid TDZ

  // Tab change with skeleton loading animation
  const handleTabChange = (newTab: TabId) => {
    if (newTab === activeTab) return
    /**
     * BILLING IS A TAB NOW, NOT A ROUTE.
     *
     * It used to `router.push("/app/settings/billing")`: a full navigation,
     * a route-level skeleton, and a page that arrived carrying its own copy
     * of this very tab bar. Switching to it now does what switching to any
     * other tab does, and the Stripe round trip happens inside the panel
     * instead of in front of the whole screen.
     */
    /**
     * SWITCHED, NOT LOADED.
     *
     * Every panel renders from props this component already holds, so there
     * is nothing to wait for and nothing to show a skeleton about. The
     * previous version set a loading flag, rendered shimmering grey cards,
     * and cleared the flag on a 160ms timer — a delay invented to make the
     * fake loading state visible, on a switch that could have been instant.
     *
     * Domains is the one tab with a real fetch, and it renders its own list
     * state rather than blanking the page.
     */
    /**
     * THE TAB BAR STAYS WHERE YOUR FINGER LEFT IT.
     *
     * Part way down General, a press on Security used to swap in a panel a
     * few hundred pixels shorter; the scroller could no longer be scrolled
     * that far, the browser pulled it back, and the whole page, tab bar
     * included, jumped 160 to 270px under the finger (measured by
     * scripts/check-settings-tabs). So before the swap the form is told to
     * be at least as tall as it needs to be for the scroll to stay where it
     * is. The new tab appears directly under the bar, and anything short of
     * the screen's foot is left as page.
     */
    const scroller = formRef.current?.closest(".app-content-scroll") as HTMLElement | null
    const form = formRef.current
    if (scroller && form) {
      const formTop = form.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      form.style.minHeight = `${Math.max(0, Math.ceil(scroller.scrollTop + scroller.clientHeight - formTop))}px`
    }
    /* The outline slides and the new panel fades in, for a press only (not on load, not on a re-render). */
    tabPressedRef.current = true
    setPanelEntrance(true)
    setActiveTab(newTab)
    if (newTab === "domains") fetchDomains()
    // Persist tab in URL so refresh stays on the same tab
    const url = new URL(window.location.href)
    if (newTab === "general") {
      url.searchParams.delete("tab")
    } else {
      url.searchParams.set("tab", newTab)
    }
    window.history.replaceState({}, "", url.toString())
  }

  const handleSubmit = async (e?: React.FormEvent | Event) => {
    if (e && 'preventDefault' in e) e.preventDefault()

    if (usernameError) {
      setError(usernameError)
      setShowSaveToast(true)
      return
    }

    if (isLoading) return // Prevent double-clicks

    setIsLoading(true)
    setError(null)
    setSuccess(false)

    const supabase = createClient()
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9-]/g, "")
    const displayName = `${firstName} ${lastName}`.trim()

    try {
      // Check if username is taken by another user
      const { data: existingUsers } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", cleanUsername)
        .neq("id", profile.id)
        .limit(1)

      if (existingUsers && existingUsers.length > 0) {
        setError("This username is already taken")
        setIsLoading(false)
        return
      }

      /* Nor another website's address (Website Settings › Domains), which is
         a name of the same kind: <name>.storelib.com. Until the address table
         exists the question fails, and the username goes ahead as before. */
      if (cleanUsername !== profile.username) {
        const { data: handleTaken } = await supabase.rpc("website_handle_taken", { p_handle: cleanUsername })
        if (handleTaken === true) {
          setError("A website already uses this name")
          setIsLoading(false)
          return
        }
      }

      // Track old username for redirects (only if actually changing)
      const oldUsername = profile.username
      const renamed = !!oldUsername && oldUsername !== cleanUsername
      if (renamed) {
        /* The row behind every "your old link still works" redirect. A
           Supabase update RESOLVES with an error rather than throwing, so the
           try/catch this replaces could never have caught one — the error was
           simply dropped. */
        const { error: historyError } = await supabase.from("username_history").insert({
          user_id: profile.id,
          old_username: oldUsername,
          new_username: cleanUsername,
        })
        if (historyError) console.error("[settings] username_history insert failed:", historyError.message)
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          display_name: displayName,
          username: cleanUsername,
          first_name: firstName,
          last_name: lastName,
          address_line1: addressLine1 || null,
          address_line2: addressLine2 || null,
          city: city || null,
          state: state || null,
          postal_code: postalCode || null,
          country: country || null,
        })
        .eq("id", profile.id)

      if (profileError) throw profileError

      const { error: creatorError } = await supabase.from("creators").update({
        slug: cleanUsername,
        support_email: supportEmail || null,
        payout_currency: payoutCurrency,
        statement_descriptor: normalizeStatementDescriptor(statementDescriptor || profile?.username || (creator as any)?.display_name || "STORE"),
      }).eq("id", creator.id)

      if (creatorError) throw creatorError

      /**
       * =====================================================================
       *  A HANDLE IS THREE ADDRESSES, AND THEY MOVE TOGETHER OR NOT AT ALL
       * =====================================================================
       *   storelib.com/<handle>         the creator page  (profiles.username)
       *   <handle>.storelib.com         the website       (creators.slug)
       *   storelib.com/<handle>/links   the OnePage       (onepages.slug)
       *
       * The first two are updated above. This is the third, and it used to be
       * wrapped in `try { } catch {}` marked "non-fatal" — but a Supabase
       * update resolves with an error instead of throwing, so the catch never
       * ran and the error was discarded either way. When it failed, the
       * OnePage kept the old slug while the Share card went on advertising
       * the new handle, and the address it gave out was a 404.
       *
       * It is not fatal, because the name change has already happened by the
       * time we get here and there is nothing to roll back. It is not silent
       * either: the save reports what did not move so it can be retried.
       */
      let onepageWarning: string | null = null
      if (renamed) {
        const { error: onepageError } = await supabase
          .from("onepages")
          .update({ slug: cleanUsername })
          .eq("owner_id", profile.id)
        if (onepageError) {
          console.error("[settings] onepage slug sync failed:", onepageError.message)
          onepageWarning = `Your details were saved, but your OnePage address could not be moved to storelib.com/${cleanUsername}/links. Save again to retry.`
        }
      }

      /* The time zone is the account's (lib/account/time-zone): saved on the
         server, then written where this browser's pages read it. */
      if (selectedTimezone !== initialTimezone.current) {
        const res = await fetch("/api/account/time-zone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeZone: selectedTimezone }),
        }).catch(() => null)
        const data = res ? ((await res.json().catch(() => null)) as { timeZone?: string; error?: string } | null) : null
        if (!res || !res.ok || !data?.timeZone) {
          throw new Error(data?.error || "Your details were saved, but the time zone was not. Try again in a moment.")
        }
        try {
          localStorage.setItem(TIME_ZONE_STORAGE_KEY, data.timeZone)
        } catch {
          /* The cookie below still carries it. */
        }
        rememberTimeZone(data.timeZone)
      }

      if (onepageWarning) {
        setError(onepageWarning)
      } else {
        setSuccess(true)
      }
      setShowSaveToast(true)
      /* The creator page and the OnePage may have moved or changed: tell
         the search engines that take IndexNow. */
      announceChange({ profile: true })

      // Check if language was changed
      const languageChanged = selectedLanguage !== initialLanguage.current

      // Update initial values to reflect saved state
      initialValues.current = {
        firstName,
        lastName,
        username: cleanUsername,
        addressLine1,
        city,
        state,
        postalCode,
        country,
      }
      initialTimezone.current = selectedTimezone
      initialSupportEmail.current = supportEmail
      initialPayoutCurrency.current = payoutCurrency
      initialStatementDescriptor.current = statementDescriptor

      // If language changed, apply it and reload the page
      if (languageChanged) {
        setLanguage(selectedLanguage)
        initialLanguage.current = selectedLanguage
        // Short delay to allow localStorage to save, then reload
        setTimeout(() => {
          window.location.reload()
        }, 500)
        return
      }

      router.refresh()
      // Hide toast and success state after 8 seconds
      setTimeout(() => {
        setSuccess(false)
        setShowSaveToast(false)
      }, 8000)
    } catch (error: unknown) {
      console.error("[Settings] Save error:", error)
      const msg = error instanceof Error ? error.message : "An error occurred while saving. Please try again."
      setError(msg)
      setShowSaveToast(false)
    } finally {
      setIsLoading(false)
    }
  }

  /* This device only. "Sign out everywhere" below is the one that ends every
     session; this used to be the same call, because supabase-js signs out
     globally unless told otherwise. */
  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: "local" })
    if (isNativePlatform()) {
      nativeLogOut()
    } else {
      router.push("/")
    }
  }

  const handleSignOutAllDevices = async () => {
    setSigningOutAll(true)
    try {
      const supabase = createClient()
      await supabase.auth.signOut({ scope: "global" })
      if (isNativePlatform()) {
        nativeLogOut()
      } else {
        router.push("/")
      }
    } catch {
      setSigningOutAll(false)
    }
  }

  const handleSendDeleteCode = async () => {
    setDeleteLoading(true)
    setDeleteError(null)

    try {
      const response = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-code" }),
      })

      const data = await response.json()

      if (response.ok) {
        setDeleteStep("verify")
        setDeleteVerificationCode(["", "", "", "", "", ""])
      } else {
        setDeleteError(data.error || "Failed to send verification code")
      }
    } catch {
      setDeleteError("An error occurred. Please try again.")
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleDeleteCodeInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return

    const newCode = [...deleteVerificationCode]
    newCode[index] = value.slice(-1)
    setDeleteVerificationCode(newCode)

    if (value && index < 5) {
      deleteCodeInputRefs.current[index + 1]?.focus()
    }
  }

  const handleDeleteCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !deleteVerificationCode[index] && index > 0) {
      deleteCodeInputRefs.current[index - 1]?.focus()
    }
  }

  const handleConfirmDelete = async () => {
    const code = deleteVerificationCode.join("")
    if (code.length !== 6) {
      setDeleteError("Please enter the complete verification code")
      return
    }

    setDeleteLoading(true)
    setDeleteError(null)

    try {
      const response = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code }),
      })

      const data = await response.json()

      if (response.ok) {
        /*
          One of the login's other stores was deleted: this browser is put
          into the login's first store, signed in, and /app is loaded fresh
          (lib/businesses). The fresh load is also what takes the deleted
          store out of the account menu, with no reload asked of anybody:
          the menu's list is read on the server for that page
          (app/app/layout.tsx listBusinesses), and the link is gone.
        */
        if (data.firstBusiness?.session) {
          await applyBusinessSession(data.firstBusiness.session, "/app")
          return
        }
        /* The account and every session are already gone on the server;
           this clears what is left on this device. */
        const supabase = createClient()
        await supabase.auth.signOut({ scope: "local" })
        if (isNativePlatform()) {
          nativeLogOut()
        } else {
          router.push("/")
        }
      } else {
        setDeleteError(data.error || "Invalid verification code")
      }
    } catch {
      setDeleteError("An error occurred. Please try again.")
    } finally {
      setDeleteLoading(false)
    }
  }

  const closeEmailChangeModal = () => {
    setShowEmailChangeModal(false)
  }

  /*
    THE ADDRESS PILL, THE SAME ONE AS THE HOME PAGE (components/app/share).
    It replaced a chip that said @handle and opened a list called Quick
    access: the three addresses are now the pill's panel, with Copy, the QR
    code and the places to post them, so Settings and the home page hand
    out a link the same way.
  */
  const settingsHandleBase = creator?.username || profile?.username || storeUrlDisplay.split(".")[0] || "store"
  /* The creator page's own domain (and so the OnePage's, at /links) and the website's, from the list read on load, given out as the home page does. */
  const connectedDomain = creatorPageHostFrom(domainsData)
  const websiteDomain = websiteHostFrom(domainsData)
  const shareAddresses: ShareAddress[] = (() => {
    const domainIsWebsite = !!websiteDomain && websitePublished
    const domainIsPage = !!connectedDomain && (!websitePublished || connectedDomain !== websiteDomain)
    /* The website answers to its own name when it has one (its Domains), and to the username otherwise. */
    const websiteHandle = website?.handle || settingsHandleBase
    const list: ShareAddress[] = [
      {
        surface: "creator",
        label: "Creator page",
        url: domainIsPage ? `https://${connectedDomain}` : getStoreShareUrl(settingsHandleBase),
        display: domainIsPage ? (connectedDomain as string) : getStoreUrlDisplay(settingsHandleBase),
      },
      {
        surface: "onepage",
        label: "OnePage",
        url: connectedDomain ? `https://${connectedDomain}/links` : getLinksShareUrl(settingsHandleBase),
        display: connectedDomain ? `${connectedDomain}/links` : getLinksUrlDisplay(settingsHandleBase),
        live: onePageLive,
      },
    ]
    if (websitePublished) {
      list.push({
        surface: "website",
        label: "Website",
        url: domainIsWebsite ? `https://${websiteDomain}` : getWebsiteShareUrl(websiteHandle),
        display: domainIsWebsite ? (websiteDomain as string) : getWebsiteUrlDisplay(websiteHandle),
      })
    }
    return list
  })()

  return (
    <>
      {/* Save Toast Notification */}
      <div
        className={`fixed top-[calc(68px+env(safe-area-inset-top)+12px)] md:top-[calc(58px+env(safe-area-inset-top)+14px)] left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 ease-out ${
          showSaveToast
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="bg-[#1a1a2e] text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2.5 whitespace-nowrap max-w-[calc(100vw-2rem)]">
          <Check className="h-4.5 w-4.5 text-emerald-400 shrink-0" />
          <span className="text-[14px] font-medium hidden sm:inline">Your settings are saved</span>
          <span className="text-[14px] font-medium sm:hidden">Settings saved</span>
        </div>
      </div>

      {/*
        CLIP, NOT HIDDEN. `overflow-x: hidden` makes a box a scroller on both
        axes (its overflow-y turns to auto), so this wrapper was a scroller
        with no height of its own. On landing the stage raises what is in a
        scroller by 2px (app-stage playEntrance); that 2px overflowed this
        box, a classic scrollbar came up inside it for the 180ms of the rise,
        the centred column narrowed, and when the bar went the whole page slid
        7.5px to the right (scripts/check-settings-landing). `clip` cuts the
        sideways overflow the same way without making a scroller, so the
        page rises inside the shell's scroller, whose track is always there.
      */}
      <div data-settings-page="" className="overflow-x-clip bg-[#fafafa]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-16 sm:pb-32 overflow-x-clip">
        {/*
          THE HEADER AND THE ADDRESS PILL. On a phone the pill took the right
          half of the row the title and the subtitle shared, and "Manage your
          account and preferences" wrapped into three short lines under
          "Settings". Now the title and the pill share the first row, centred
          on each other, and the subtitle has the whole width under them. From
          640px it is as it was: the title over the subtitle on the left, the
          pill at the top right.
        */}
        <div data-settings-header="" className="mb-6 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:items-start sm:gap-y-0">
          <h1 className="col-start-1 row-start-1 text-[22px] font-bold text-[#1a1a2e] sm:text-[28px]">{t("settings.title")}</h1>
          <div data-settings-pill="" className="col-start-2 row-start-1 flex min-w-0 justify-end sm:row-span-2 sm:max-w-[300px] sm:justify-self-end sm:pt-1">
            {/* On a phone the pill is 10% narrower than it was, so the title keeps its room. A short address is left whole. */}
            <ShareStorelib size="sm" className="md:hidden max-w-[min(calc((100vw-32px)*0.522),184px)] sm:max-w-[270px]" addresses={shareAddresses} platforms={sharePlatforms} />
            <ShareStorelib className="hidden md:inline-flex" addresses={shareAddresses} platforms={sharePlatforms} />
          </div>
          <p className="col-span-2 row-start-2 text-[14px] text-[#6b7280] sm:col-span-1 sm:col-start-1 sm:mt-1">{t("settings.subtitle")}</p>
        </div>

        {/* Pill-shaped Tab Navigation - Hidden scrollbar, fixed height to prevent layout shift */}
        <div ref={tabNavRef} data-settings-tabs="" className="mb-6 sm:mb-8 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="relative flex gap-1 p-1 w-fit h-[44px] sm:h-[48px] items-center">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const tabLabel = tab.id === "general" ? t("settings.general") :
                              tab.id === "security" ? t("settings.security") :
                              tab.id === "privacy" ? t("settings.privacy") :
                              tab.id === "billing" ? t("settings.billing") :
                              tab.id === "payments" ? t("settings.payments") :
                              "Domains"
              return (
                <button
                  key={tab.id}
                  ref={activeTab === tab.id ? activeTabRef : undefined}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium transition-colors duration-200 whitespace-nowrap cursor-pointer border ${
                    activeTab === tab.id
                      ? `bg-[#f3f4f6] text-[#1a1a2e] ${tabRingOn ? "border-transparent" : "border-[#d1d5db]"}`
                      : "bg-[#f9fafb] text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] border-transparent"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tabLabel}</span>
                </button>
              )
            })}
            {/* The selected tab's outline, over the tabs and never in the way of a press. */}
            <span
              ref={tabRingRef}
              aria-hidden
              data-settings-tab-ring=""
              className={`pointer-events-none absolute left-0 top-0 origin-left rounded-full border border-[#d1d5db] ${tabRingOn ? "" : "invisible"}`}
            />
          </div>
        </div>

        {/* Tab Content */}
        <form ref={formRef} onSubmit={handleSubmit}>
          {/*
            ONE KEYED WRAPPER, so React replaces the panel rather than
            reconciling one tab's fields into another's and keeping the DOM
            nodes. Without the key nothing is ever new, so nothing can
            animate, and the content changes under you in a single frame.

            The fade (app/globals.css, .settings-panel) is only put on once a
            tab has been pressed, so the page's first paint and a tab opened
            by the address on load are simply there, and a re-render never
            replays it: the key, and so the element, only changes with the tab.
          */}
          <div key={activeTab} data-settings-panel={activeTab} className={panelEntrance ? "settings-panel" : undefined}>
          {/*
            NO SKELETON BETWEEN TABS.
            There used to be one here: forty-five lines of shimmering grey
            cards, shown for a fixed 160ms on every switch. Nothing is
            fetched when a tab changes — every panel renders from the props
            this component was handed once — so it was a loading state for
            content that was already on the machine, and a fake one at that.
            What it bought was a flash of grey that made a change of tab
            look slower and cheaper than simply doing it.

            What replaces it is one keyed wrapper that fades. See
            `handleTabChange`.
          */}
          {/* Billing Tab */}
          {activeTab === "billing" && (
            <div className="space-y-4 sm:space-y-6">
              {billingData ? (
                <BillingPageClient initialData={billingData as never} embedded />
              ) : billingError ? (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#e5e7eb]">
                  <p className="text-[14px] font-medium text-[#1a1a2e]">We could not load your billing.</p>
                  <p className="mt-1 text-[13px] text-[#6b7280]">
                    Nothing has changed on your account. This is a problem reading it.
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadBilling()}
                    className="mt-3 h-9 px-4 text-[13px] font-semibold text-white bg-[#1a1a2e] rounded-lg"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                /*
                  THE ONE HONEST LOADING STATE IN SETTINGS. Every other panel
                  renders from props already here; this one is waiting on
                  Stripe. So it says so, in the shape of what is coming,
                  rather than shimmering — and the tab itself already
                  switched, so nothing is blocking behind it.
                */
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#e5e7eb]">
                  <div className="flex items-center gap-2.5 text-[#6b7280]">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-[#e5e7eb] border-t-[#7c3aed] animate-spin" />
                    <span className="text-[13.5px]">Checking your plan and invoices</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* General Tab */}
          {activeTab === "general" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Purple Announcement Bar — Connect Stripe (only after status confirmed) */}
              {!stripeStatus.connected && (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] px-4 sm:px-6 py-3 sm:py-3.5 shadow-sm transition-all duration-300">
                  <div className="flex items-center gap-3 min-w-0">
                    <Wallet className="h-5 w-5 text-white shrink-0" />
                    <p className="text-[13px] sm:text-[14px] font-medium text-white">
                      <span className="sm:hidden">Get paid - Connect Stripe</span>
                      <span className="hidden sm:inline">Get paid — Connect your payouts to receive payments.</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={connectStripe}
                    disabled={stripeBusy !== null}
                    className="shrink-0 h-9 px-5 text-[13px] font-semibold text-[#7c3aed] bg-white rounded-lg hover:bg-[#f5f3ff] active:bg-[#ede9fe] transition-colors shadow-sm cursor-pointer disabled:opacity-60"
                  >
                    {stripeBusy === "connect" ? "Connecting..." : "Connect"}
                  </button>
                </div>
              )}

              {/*
                LOG OUT LIVES IN SETTINGS TOO.
                It was only in the avatar menu in the header, which is not
                where anybody looks for it: on a phone that menu is behind a
                tap most people never make, and "how do I sign out" is a
                settings question everywhere else they have ever used. Placed
                last, after everything that changes the account, because it is
                a way out rather than a thing to configure.
              */}

              {/* Profile Image Card: changed right here (components/app/settings/profile-photo) */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <ProfilePhoto
                  userId={profile.id}
                  src={avatarUrl || null}
                  name={`${firstName} ${lastName}`.trim() || username || "You"}
                  onChanged={() => {
                    /* Saved and announced already (the header has it); the server's pages catch up. */
                    router.refresh()
                  }}
                />
              </div>

              {/*
                NAME AND USERNAME, AND WHERE THE USERNAME IS. The username was
                three inputs (Store URL here, a OnePage handle under it, and
                another on Stores) writing one value, and the field labelled
                Username was the display name. One field now, and the list
                under it (components/app/settings/addresses) says what it is
                the address of.
              */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]" data-settings-card="profile">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">
                  {t("settings.profileInfo")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* The username first, as asked: the handle every address is built from, then the name the pages show. */}
                  <div className="space-y-1.5">
                    <Label htmlFor="username" className="text-[13px] font-medium text-[#374151]">
                      Username
                    </Label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#9ca3af]">@</span>
                      <Input
                        id="username"
                        value={username}
                        onChange={(e) => validateUsername(e.target.value)}
                        placeholder="yourname"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className={`h-11 pl-7 rounded-xl text-[14px] ${
                          usernameError ? "border-red-300 focus:ring-red-500 focus:border-red-500" : "border-[#e5e7eb] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                        }`}
                      />
                    </div>
                    {usernameError ? (
                      <p className="text-[12px] text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {usernameError}
                      </p>
                    ) : (
                      <p className="text-[12px] text-[#9ca3af]">The address of your creator page and your OnePage</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-[13px] font-medium text-[#374151]">
                      Name
                    </Label>
                    <Input
                      id="firstName"
                      value={fullNameForUsernameInput}
                      onChange={(e) => {
                        const value = e.target.value
                        const [first = "", ...rest] = value.trimStart().split(/\s+/)
                        setFirstName(first)
                        setLastName(rest.join(" "))
                      }}
                      placeholder="Your name or your brand's"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                    <p className="text-[12px] text-[#9ca3af]">Shown on your pages and on receipts</p>
                  </div>
                </div>
                <div className="mt-5">
                  <p className="mb-2 text-[13px] font-medium text-[#374151]">Your addresses</p>
                  <AddressList username={username} website={website} websiteDomain={websiteDomain} />
                </div>
              </div>

              {/* Emails Card - Email + Support Email */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">
                  Emails
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-[13px] font-medium text-[#374151]">
                      Email
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input id="email" value={currentEmail} disabled className="h-11 bg-[#f9fafb] border-[#e5e7eb] rounded-xl text-[14px] pr-24" />
                        {emailVerified && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            Verified
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEmailChangeRun((n) => n + 1)
                          setShowEmailChangeModal(true)
                        }}
                        className="px-4 h-11 text-[13px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="supportEmailProfile" className="text-[13px] font-medium text-[#374151]">
                      Support Email
                    </Label>
                    <Input
                      id="supportEmailProfile"
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      placeholder={currentEmail || "support@yourdomain.com"}
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                    <div className="flex items-center gap-1">
                      <p className="text-[12px] text-[#9ca3af]">Shown to customers on receipts</p>
                      {/* On the body, kept inside the screen, wrapping (components/ui/tooltip): it was clipped at "customer receip". */}
                      <InfoTip label="About the support email">
                        This email appears on customer receipts and order confirmations. Customers write to it for support.
                      </InfoTip>
                    </div>
                  </div>
                </div>
              </div>

              {/* Language Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">
                  Language
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">The language of your dashboard</p>
                {/* A popover with a search on a computer, the shared sheet on a phone (components/ui/choice-list). */}
                <ChoicePicker
                  name="language"
                  title="Language"
                  choices={appLanguageChoices}
                  value={selectedLanguage}
                  onChange={(code) => setSelectedLanguage(code as LanguageCode)}
                  placeholder="Search languages"
                  fieldLabel={appLanguageName(selectedLanguage)}
                />
              </div>

              {/* Timezone Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">
                  Time zone
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Your days and times in Home, Orders, Analytics, Emails and Payouts, and in the sale emails we send you</p>
                {/* Saved to the account and followed by the server too (lib/account/time-zone). */}
                <TimeZonePicker value={selectedTimezone} onChange={setSelectedTimezone} />
              </div>

              {/* Address Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">
                  Address
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="addressLine1" className="text-[13px] font-medium text-[#374151]">
                      Address Line 1
                    </Label>
                    <Input
                      id="addressLine1"
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      placeholder="Street address"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="addressLine2" className="text-[13px] font-medium text-[#374151]">
                      Address Line 2
                    </Label>
                    <Input
                      id="addressLine2"
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      placeholder="Apt, suite, etc. (optional)"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="city" className="text-[13px] font-medium text-[#374151]">
                      City
                    </Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="state" className="text-[13px] font-medium text-[#374151]">
                      State / Province
                    </Label>
                    <Input
                      id="state"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="State"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="postalCode" className="text-[13px] font-medium text-[#374151]">
                      Postal Code
                    </Label>
                    <Input
                      id="postalCode"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="Postal code"
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="country" className="text-[13px] font-medium text-[#374151]">
                      Country
                    </Label>
                    {/* The Language and Time zone field: a popover on a computer, the shared sheet on a phone, every country with its flag. */}
                    <CountryPicker id="country" value={country} onChange={setCountry} />
                  </div>
                </div>
              </div>

              {/* Resources Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">Resources</h3>
                <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
                  <a
                    href="/app/changelog"
                    className="flex items-center justify-between p-4 hover:bg-[#f9fafb] transition-colors cursor-pointer border-b border-[#e5e7eb]"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="h-5 w-5 text-[#6b7280]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                      </svg>
                      <span className="text-[14px] text-[#374151]">Change log</span>
                    </div>
                    <button type="button" className="px-3 py-1.5 text-[13px] font-medium border border-[#e5e7eb] rounded-lg hover:bg-[#f3f4f6] transition-colors cursor-pointer">
                      View change log
                    </button>
                  </a>
                  <button
                    type="button"
                    onClick={() => { handleTabChange("domains"); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                    className="w-full flex items-center justify-between p-4 hover:bg-[#f9fafb] transition-colors cursor-pointer border-b border-[#e5e7eb]"
                  >
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-[#6b7280]" />
                      <span className="text-[14px] text-[#374151]">Custom Domain</span>
                    </div>
                    <span className="px-3 py-1.5 text-[13px] font-medium border border-[#e5e7eb] rounded-lg hover:bg-[#f3f4f6] transition-colors">
                      Set up domain
                    </span>
                  </button>
                  <a
                    href="/help"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (isNativeApp()) {
                        e.preventDefault()
                        openExternal(`https://${process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"}/help`)
                      }
                    }}
                    className="flex items-center justify-between p-4 hover:bg-[#f9fafb] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <svg className="h-5 w-5 text-[#6b7280]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span className="text-[14px] text-[#374151]">Storelib Help Center</span>
                    </div>
                    <button type="button" className="px-3 py-1.5 text-[13px] font-medium border border-[#e5e7eb] rounded-lg hover:bg-[#f3f4f6] transition-colors cursor-pointer">
                      Get help
                    </button>
                  </a>
                </div>
              </div>

              {/*
                THE WAY OUT, WHERE PEOPLE LOOK FOR IT.

                Signing out was only in the avatar menu in the header, which on
                a phone is behind a tap most people never make. "How do I sign
                out" is a settings question everywhere else they have used, so
                it is answered in settings.

                Last on the tab, quiet, and it does not pretend to be a
                destructive action: it is one click and they can come back.
                Signing out of every device already has its own control under
                Security, where a decision that logs out a phone in a drawer
                belongs.
              */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1a1a2e] text-[15px]">Log out</p>
                    <p className="text-[13px] text-[#6b7280]">Sign out of Storelib on this device.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="shrink-0 inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-[#374151] border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors cursor-pointer"
                  >
                    <LogOut className="h-4 w-4 text-[#6b7280]" />
                    Log out
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* Security Tab: components/app/settings/account-panels.tsx */}
          {activeTab === "security" && (
            <SecurityPanel
              email={currentEmail}
              createdAt={profile.created_at}
              onSignOut={handleSignOut}
              onSignOutEverywhere={handleSignOutAllDevices}
              signingOutEverywhere={signingOutAll}
              onDeleteAccount={() => setShowDeleteModal(true)}
            />
          )}

          {/* Privacy Tab: every switch saved where it is read (account-panels.tsx) */}
          {activeTab === "privacy" && (
            <PrivacyPanel
              email={currentEmail}
              initialPersonalized={(profile as { personalized_recommendations?: boolean }).personalized_recommendations !== false}
              initialNewsletter={newsletter}
            />
          )}

          {/* Payments Tab */}
          {activeTab === "payments" && (
            <div className="space-y-[10px] sm:space-y-[14px]">
              {/* Error display for Connect flow */}
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-[13px] flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button type="button" onClick={() => { setError(null); setConnectHelpUrl(null) }} className="shrink-0 cursor-pointer"><X className="h-4 w-4" /></button>
                  </div>
                  {connectHelpUrl && (
                    <a href={connectHelpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#7c3aed] hover:text-[#6d28d9] ml-6">
                      <ExternalLink className="h-3 w-3" />
                      Open Stripe Platform Profile Settings
                    </a>
                  )}
                </div>
              )}
              {/* Action required banners — use requirements from payout-method API */}
              {stripeStatus.connected && !stripeBankLoading && stripePayoutInfo && !stripePayoutInfo.payoutsEnabled && stripePayoutInfo.detailsSubmitted && (stripePayoutInfo.requirementsDue.length > 0 || stripePayoutInfo.requirementsPastDue.length > 0) && (
                <div className="flex items-start gap-3 px-4 py-3 bg-[#f8f8f9] border border-[#e8e8ec] rounded-xl">
                  <div className="w-7 h-7 rounded-lg bg-[#fef3c7] flex items-center justify-center shrink-0 mt-0.5">
                    <AlertCircle className="h-3.5 w-3.5 text-[#d97706]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#374151]">{stripePayoutInfo.requirementsPastDue.length > 0 ? "Action required to keep receiving payouts" : "Verification needed to enable payouts"}</p>
                  </div>
                  <button type="button" onClick={manageStripe} disabled={stripeBusy !== null} className="text-[12px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] transition-colors whitespace-nowrap shrink-0 mt-0.5 cursor-pointer">{stripeBusy ? "Opening..." : "Complete verification"}</button>
                </div>
              )}
              {stripeStatus.connected && !stripeBankLoading && stripePayoutInfo && !stripePayoutInfo.detailsSubmitted && !stripePayoutInfo.payoutsEnabled && (
                <div className="flex items-center gap-3 px-4 py-3 bg-[#f8f8f9] border border-[#e8e8ec] rounded-xl">
                  <div className="w-7 h-7 rounded-lg bg-[#fef3c7] flex items-center justify-center shrink-0">
                    <AlertCircle className="h-3.5 w-3.5 text-[#d97706]" />
                  </div>
                  <p className="text-[13px] text-[#4b5563] flex-1">Complete your account setup to receive payouts</p>
                  <button type="button" onClick={manageStripe} disabled={stripeBusy !== null} className="text-[12px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] transition-colors whitespace-nowrap shrink-0 cursor-pointer">{stripeBusy ? "Opening..." : "Complete setup"}</button>
                </div>
              )}
              {stripeStatus.connected && !stripeBankLoading && !stripeBankInfo && (
                <div className="flex items-center gap-3 px-4 py-3 bg-[#f8f8f9] border border-[#e8e8ec] rounded-xl">
                  <div className="w-7 h-7 rounded-lg bg-[#fef3c7] flex items-center justify-center shrink-0">
                    <Landmark className="h-3.5 w-3.5 text-[#d97706]" />
                  </div>
                  <p className="text-[13px] text-[#4b5563] flex-1">Add a bank account to cash out</p>
                  <button type="button" onClick={manageStripe} disabled={stripeBusy !== null} className="text-[12px] font-medium text-[#8b5cf6] hover:text-[#7c3aed] transition-colors whitespace-nowrap shrink-0 cursor-pointer">{stripeBusy ? "Opening..." : "Add bank"}</button>
                </div>
              )}

              {/* Stripe Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-9 h-9 sm:w-[44px] sm:h-[44px] rounded-xl overflow-hidden shrink-0">
                      <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="none" className="w-full h-full">
                        <circle cx="512" cy="512" r="512" style={{ fill: "#635bff" }} />
                        <path d="M781.67 515.75c0-38.35-18.58-68.62-54.08-68.62s-57.23 30.26-57.23 68.32c0 45.09 25.47 67.87 62 67.87 17.83 0 31.31-4 41.5-9.74v-30c-10.19 5.09-21.87 8.24-36.7 8.24-14.53 0-27.42-5.09-29.06-22.77h73.26c.01-1.92.31-9.71.31-13.3zm-74-14.23c0-16.93 10.34-24 19.78-24 9.14 0 18.88 7 18.88 24zm-95.14-54.39a42.32 42.32 0 0 0-29.36 11.69l-1.95-9.29h-33v174.68l37.45-7.94.15-42.4c5.39 3.9 13.33 9.44 26.52 9.44 26.82 0 51.24-21.57 51.24-69.06-.12-43.45-24.84-67.12-51.05-67.12zm-9 103.22c-8.84 0-14.08-3.15-17.68-7l-.15-55.58c3.9-4.34 9.29-7.34 17.83-7.34 13.63 0 23.07 15.28 23.07 34.91.01 20.03-9.28 35.01-23.06 35.01zM496.72 438.29l37.6-8.09v-30.41l-37.6 7.94v30.56zm0 11.39h37.6v131.09h-37.6zm-40.3 11.08L454 449.68h-32.34v131.08h37.45v-88.84c8.84-11.54 23.82-9.44 28.46-7.79v-34.45c-4.78-1.8-22.31-5.1-31.15 11.08zm-74.91-43.59L345 425l-.15 120c0 22.17 16.63 38.5 38.8 38.5 12.28 0 21.27-2.25 26.22-4.94v-30.45c-4.79 1.95-28.46 8.84-28.46-13.33v-53.19h28.46v-31.91h-28.51zm-101.27 70.56c0-5.84 4.79-8.09 12.73-8.09a83.56 83.56 0 0 1 37.15 9.59V454a98.8 98.8 0 0 0-37.12-6.87c-30.41 0-50.64 15.88-50.64 42.4 0 41.35 56.93 34.76 56.93 52.58 0 6.89-6 9.14-14.38 9.14-12.43 0-28.32-5.09-40.9-12v35.66a103.85 103.85 0 0 0 40.9 8.54c31.16 0 52.58-15.43 52.58-42.25-.17-44.63-57.25-36.69-57.25-53.47z" style={{ fill: "#fff" }} />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] sm:text-[16px] font-semibold text-[#1a1a2e]">Stripe</h3>
                        <span className={`px-1.5 py-0.5 font-medium rounded-full flex items-center gap-1 ${isMobileViewport ? "text-[8px]" : "text-[10px]"} ${stripeStatus.connected ? "bg-emerald-500 text-white" : "bg-amber-100 text-amber-700 border border-amber-200"}`}>
                          <Check className="h-3 w-3" /> {stripeStatus.connected ? "Connected" : stripeStatus.status === "pending" ? "Pending" : "Not connected"}
                        </span>
                      </div>
                      <p className="text-[13px] sm:text-[14px] text-[#6b7280] mt-0.5">Connect to accept payments from Credit/Debit cards</p>
                    </div>
                  </div>
                  {stripeStatus.connected ? (
                    <button type="button" onClick={() => setShowStripeManage((v) => !v)} className="px-4 sm:px-5 h-9 sm:h-10 text-[13px] sm:text-[14px] font-medium border border-[#e5e7eb] hover:bg-[#f9fafb] text-[#374151] rounded-lg transition-colors cursor-pointer shrink-0">{showStripeManage ? "Hide" : "Manage"}</button>
                  ) : (
                    <button type="button" onClick={connectStripe} disabled={stripeBusy !== null} className="px-4 sm:px-5 h-9 sm:h-10 text-[13px] sm:text-[14px] font-semibold bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-60">{stripeBusy === "connect" ? "Connecting..." : stripeStatus.status === "pending" ? "Complete Setup" : "Connect"}</button>
                  )}
                </div>
              </div>

              <div className={`grid transition-all duration-300 ease-in-out ${showStripeManage ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="-mt-2 rounded-2xl border border-[#e5e7eb] bg-[#fafafa] p-4 sm:p-5">
                    {/* Bank account info */}
                    {stripeBankLoading ? (
                      <WaitingArea className="mb-3 h-5 w-48 justify-start" size={16} />
                    ) : stripeBankInfo ? (
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <Landmark className="h-3.5 w-3.5 text-[#6b7280] shrink-0" />
                        <span className="text-[13px] font-medium text-[#1a1a2e]">{stripeBankInfo.bankName || "Bank account"} ••••{stripeBankInfo.last4}</span>
                        <span className="text-[11px] text-[#6b7280] uppercase">{stripeBankInfo.currency}</span>
                        {stripeBankInfo.status && stripeBankInfo.status !== "new" && (
                          <span className={`text-[11px] font-medium capitalize ${stripeBankInfo.status === "verified" ? "text-green-600" : "text-amber-600"}`}>{stripeBankInfo.status}</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-[13px] text-[#6b7280] mb-3">No bank account connected yet.</p>
                    )}
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="px-2 py-1 rounded-full border text-[11px] bg-white">Charges: {stripeStatus.chargesEnabled ? "Enabled" : "Pending"}</span>
                      <span className="px-2 py-1 rounded-full border text-[11px] bg-white">Payouts: {stripeStatus.payoutsEnabled ? "Enabled" : "Pending"}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={manageStripe} disabled={stripeBusy !== null || !stripeStatus.connected} className="h-9 px-3 rounded-lg border border-[#e5e7eb] bg-white text-[13px] text-[#374151] hover:bg-[#f3f4f6] disabled:opacity-60 cursor-pointer flex items-center gap-1.5"><ExternalLink className="h-3 w-3" /> Manage settings</button>
                      <button type="button" onClick={connectStripe} disabled={stripeBusy !== null} className="h-9 px-3 rounded-lg border border-[#e5e7eb] text-[13px] text-[#374151] hover:bg-[#f3f4f6] disabled:opacity-60 cursor-pointer">{stripeBusy === "connect" ? "Connecting..." : "Reconnect"}</button>
                      <button type="button" onClick={disconnectStripe} disabled={stripeBusy !== null || !stripeStatus.connected} className="h-9 px-3 rounded-lg border border-[#e5e7eb] text-[13px] text-[#374151] hover:bg-[#f3f4f6] disabled:opacity-60 cursor-pointer">{stripeBusy === "disconnect" ? "Disconnecting..." : "Disconnect"}</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* PayPal Card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-9 h-9 sm:w-[38px] sm:h-[38px] rounded-xl overflow-hidden shrink-0">
                      <svg viewBox="-23 0 302 302" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                        <path d="M217.168476 23.5070146C203.234077 7.62479651 178.045612 0.815753338 145.823355 0.815753338L52.3030619 0.815753338C45.7104431 0.815753338 40.1083819 5.6103852 39.0762042 12.1114399L0.136468302 259.076601C-0.637664968 263.946149 3.13311322 268.357876 8.06925331 268.357876H65.804612L80.3050438 176.385849L79.8555471 179.265958C80.8877248 172.764903 86.4481659 167.970272 93.0324607 167.970272H120.46841C174.366398 167.970272 216.569147 146.078116 228.897012 82.7490197C229.263268 80.8761167 229.579581 79.0531577 229.854273 77.2718188C233.525163 53.8646924 229.829301 37.9325302 217.168476 23.5070146" fill="#27346A" />
                        <path d="M228.897012 82.7490197C216.569147 146.069792 174.366398 167.970272 120.46841 167.970272H93.0241367C86.4398419 167.970272 80.8794007 172.764903 79.8555471 179.265958L61.8174095 293.621258C61.1431644 297.883153 64.4394738 301.745495 68.7513129 301.745495H117.421821C123.182038 301.745495 128.084882 297.550192 128.983876 291.864891L138.631407 231.249423C140.121406 222.351053 145.02425 218.15575 150.784467 218.15575H158.067979C205.215193 218.15575 242.132193 199.002194 252.920115 143.605884C257.423406 120.456802 255.092683 101.128442 243.181019 87.5519756C239.568397 83.4399129 235.081754 80.0437153 229.854273 77.2718188C229.571257 79.0614817 229.263268 80.8761167 228.897012 82.7490197" fill="#2790C3" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] sm:text-[16px] font-semibold text-[#1a1a2e]">PayPal</h3>
                        <span className={`px-1.5 py-0.5 font-medium bg-[#eef2ff] text-[#635bff] rounded-full border border-[#dbe4ff] ${isMobileViewport ? "text-[8px]" : "text-[10px]"}`}>Coming soon</span>
                      </div>
                      <p className="text-[13px] sm:text-[14px] text-[#6b7280] mt-0.5">PayPal payouts and card-backed options will be available soon.</p>
                    </div>
                  </div>
                  <button type="button" disabled className="px-4 sm:px-5 h-9 sm:h-10 text-[13px] sm:text-[14px] font-medium border border-[#e5e7eb] text-[#9ca3af] rounded-lg cursor-not-allowed shrink-0">Soon</button>
                </div>
              </div>

              <div className="relative inline-flex group">
                <a href="#" className="inline-flex items-center gap-1 text-[14px] font-medium text-[#0891b2] hover:text-[#0e7490] transition-colors cursor-pointer">
                  See all payment options
                  <ChevronRight className="h-4 w-4" />
                </a>
                <div className="absolute left-0 top-full mt-2 hidden group-hover:flex items-center gap-1.5 rounded-lg bg-[#111827] text-white text-xs px-3 py-2 shadow-lg z-20 whitespace-nowrap">
                  <Info className="h-3.5 w-3.5 text-[#93c5fd]" />
                  More payment options coming soon.
                </div>
              </div>

              <div className="pt-2">
                <div className="space-y-1.5 max-w-[420px]">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="statement-descriptor" className="text-[13px] font-medium text-[#374151]">Statement Descriptor</Label>
                    <InfoTip label="About statement descriptor">
                      This text appears on your customer&apos;s bank statement to identify who charged them.
                    </InfoTip>
                  </div>
                  <Input
                    id="statement-descriptor"
                    value={statementDescriptor}
                    onChange={(e) => setStatementDescriptor(normalizeStatementDescriptor(e.target.value))}
                    placeholder={defaultStatementDescriptor}
                    className="h-10 rounded-xl border-[#e5e7eb] text-[13px] focus-visible:border-[#8b5cf6] focus-visible:ring-[#8b5cf6]/20"
                  />
                  <p className="text-[12px] text-[#9ca3af]">Shown in bank apps as the charge descriptor (max 22 characters).</p>
                </div>
              </div>

              {showCurrencyPicker && !isMobileViewport && (
                <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowCurrencyPicker(false)}>
                  <div className="w-full max-w-[420px] rounded-2xl bg-white border border-[#e5e7eb] p-4 sm:p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <h4 className="text-[16px] font-semibold text-[#1a1a2e] mb-1">Select payout currency</h4>
                    <p className="text-[12px] text-[#6b7280] mb-3">Choose your payout settlement currency.</p>
                    <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                      {(["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "NOK", "NZD"] as const).map((currency) => (
                        <button key={currency} type="button" onClick={() => { setPayoutCurrency(currency); setShowCurrencyPicker(false) }} className={`w-full text-left px-3 py-3 rounded-xl text-[14px] font-medium transition-colors flex items-center justify-between cursor-pointer ${payoutCurrency === currency ? "bg-[#f5f3ff] text-[#8b5cf6]" : "text-[#374151] hover:bg-[#f3f4f6]"}`}>
                          {currency}
                          {payoutCurrency === currency && <Check className="h-4 w-4" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <MobileBottomSheet
                isOpen={showCurrencyPicker && isMobileViewport}
                onClose={() => setShowCurrencyPicker(false)}
                title="Select payout currency"
              >
                <div className="space-y-2 pb-2">
                  {(["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "NOK", "NZD"] as const).map((currency) => (
                    <button key={currency} type="button" onClick={() => { setPayoutCurrency(currency); setShowCurrencyPicker(false) }} className={`w-full text-left px-3 py-3 rounded-xl text-[14px] font-medium transition-colors flex items-center justify-between cursor-pointer ${payoutCurrency === currency ? "bg-[#f5f3ff] text-[#8b5cf6]" : "text-[#374151] hover:bg-[#f3f4f6]"}`}>
                      {currency}
                      {payoutCurrency === currency && <Check className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </MobileBottomSheet>
            </div>
          )}

          {/* Domains Tab */}
          {activeTab === "domains" && (
            <DomainsPanel
              data={domainsData}
              loading={domainsLoading}
              onData={(next) => {
                setDomainsData(next)
                setDomains(next.domains ?? [])
              }}
              websiteAddress={getWebsiteUrlDisplay(website?.handle || settingsHandleBase)}
              creatorPageAddress={getStoreUrlDisplay(settingsHandleBase)}
              handle={(username || settingsHandleBase).toLowerCase()}
              locked={userPlan === "free" || userPlan === null}
              planLoading={planLoading}
            />
          )}

          </div>
        </form>
      </div>

      {/* Sticky Save Bar - Smooth fade animation */}
      {(() => {
        const barUp = hasUnsavedChanges && !showEmailChangeModal && !showDeleteModal
        return (
      <div
        /*
          On a phone the navigation is a pill floating over the foot of the
          screen, and this bar wants the same strip. Saying so here is enough:
          app/globals.css moves the pill out of the way while this is up, and
          neither surface has to hold any state about the other.
        */
        data-app-bottom-bar={barUp ? "visible" : "hidden"}
        className={`fixed bottom-0 left-0 right-0 md:left-[240px] z-40 bg-white/95 backdrop-blur-sm border-t border-[#e5e7eb]/60 pb-[env(safe-area-inset-bottom)] transition-all duration-300 ease-out ${
          barUp
            ? "translate-y-0 opacity-100"
            : "translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {error ? (
              <>
                <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                <span className="text-[14px] text-red-600 truncate">{error}</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span className="text-[14px] text-[#6b7280]">{t("settings.unsavedChanges")}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                // Reset to initial values
                setFirstName(initialValues.current.firstName)
                setLastName(initialValues.current.lastName)
                setUsername(initialValues.current.username)
                setAddressLine1(initialValues.current.addressLine1)
                setCity(initialValues.current.city)
                setState(initialValues.current.state)
                setPostalCode(initialValues.current.postalCode)
                setCountry(initialValues.current.country)
                setSelectedLanguage(initialLanguage.current)
                setSelectedTimezone(initialTimezone.current)
                setSupportEmail(initialSupportEmail.current)
              }}
              className="px-4 h-10 text-[14px] font-medium text-[#6b7280] hover:text-[#374151] hover:bg-[#f3f4f6] rounded-lg transition-colors cursor-pointer"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={isLoading}
              className="px-5 h-10 text-[14px] font-medium rounded-lg transition-colors flex items-center gap-2 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("settings.save")
              )}
            </button>
          </div>
        </div>
      </div>
        )
      })()}

      {/* Email Change Modal: a code to each address (account-panels.tsx) */}
      <MobileBottomSheet isOpen={showEmailChangeModal} onClose={closeEmailChangeModal} title="Change email">
        <EmailChangeFlow key={emailChangeRun} currentEmail={currentEmail} onChanged={(next) => {
          setCurrentEmail(next)
          router.refresh()
        }} />
      </MobileBottomSheet>

      {/* Delete Account Modal */}
      <MobileBottomSheet
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setDeleteStep("confirm")
          setDeleteVerificationCode(["", "", "", "", "", ""])
          setDeleteError(null)
        }}
        title={deleteStep === "confirm" ? "Delete Account" : "Verify Deletion"}
      >
        {deleteStep === "confirm" ? (
          <div className="space-y-4">
            <div className="bg-[#1a1a2e] rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-[#2d2d44] rounded-full flex items-center justify-center shrink-0">
                  <Trash2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-white text-[14px]">This action cannot be undone</p>
                  {/*
                    What goes, in one sentence, the way it always read. The
                    last clause appears only on a login that has other stores
                    (they are accounts of this one and cannot be signed into
                    without it, so they go with it: app/api/auth/delete-
                    account). It is part of the list of what is removed, not
                    a feature being explained.
                  */}
                  <p className="text-[13px] text-[#9ca3af] mt-1">
                    Deleting your account will permanently remove all your data, including products, customers, and sales history.
                    {otherStores > 0 &&
                      (otherStores === 1
                        ? " The other store on this login goes with it."
                        : ` The other ${countWord(otherStores)} stores on this login go with it.`)}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-[13px] text-[#6b7280]">
              We&apos;ll send a verification code to <span className="font-medium text-[#1a1a2e]">{currentEmail}</span> to confirm this action.
            </p>
            {deleteError && <p className="text-[13px] text-white bg-[#1a1a2e] p-3 rounded-xl">{deleteError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteError(null)
                }}
                className="flex-1 h-11 text-[14px] font-medium bg-[#f3f4f6] hover:bg-[#e5e7eb] text-[#374151] rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendDeleteCode}
                disabled={deleteLoading}
                className="flex-1 h-11 text-[14px] font-medium bg-[#1a1a2e] hover:bg-[#2d2d44] disabled:bg-[#6b7280] text-white rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {deleteLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Code"
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[13px] text-[#6b7280]">
              Enter the 6-digit code we sent to <span className="font-medium text-[#1a1a2e]">{currentEmail}</span>
            </p>
            <div className="flex justify-center gap-2">
              {deleteVerificationCode.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    deleteCodeInputRefs.current[index] = el
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDeleteCodeInput(index, e.target.value)}
                  onKeyDown={(e) => handleDeleteCodeKeyDown(index, e)}
                  className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold border border-[#e5e7eb] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e] focus:border-[#1a1a2e]"
                />
              ))}
            </div>
            {deleteError && <p className="text-[13px] text-white bg-[#1a1a2e] p-3 rounded-xl text-center">{deleteError}</p>}
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleteLoading || deleteVerificationCode.join("").length !== 6}
              className="w-full h-11 text-[14px] font-medium bg-[#1a1a2e] hover:bg-[#2d2d44] disabled:bg-[#6b7280] text-white rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Permanently Delete Account"
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteStep("confirm")
                setDeleteError(null)
              }}
              className="w-full text-[13px] text-[#6b7280] hover:text-[#374151] py-2 cursor-pointer"
            >
              Go back
            </button>
          </div>
        )}
      </MobileBottomSheet>
    </div>
    </>
  )
}
