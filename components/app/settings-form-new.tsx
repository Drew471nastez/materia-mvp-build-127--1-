"use client"

import { announceChange } from "@/lib/seo/announce-client"
import type React from "react"
import { BottomSheet, SHEET_CLOSE_MS, SHEET_EASE, SHEET_OPEN_MS } from "@/components/ui/bottom-sheet"
import { useState, useRef, useEffect, useCallback, useDeferredValue } from "react"
import { primaryDepth, secondaryDepth } from "@/components/ui/depth-button"
import { useRouter, useSearchParams } from "next/navigation"
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
  CreditCard, Shield, Settings, Wallet, Landmark, Truck,
  ExternalLink, ChevronRight, Globe,
  User, FileText, ChevronLeft,
  ToggleLeft, Bell, LogOut, Trash2, Languages, Info, ChevronDown, CheckCircle, Clock, Copy, Plus, Plug, Brain, MapPin, Undo2, Receipt, Store, ShoppingCart, Share2, History
} from "lucide-react"
import { IntegrationsDirectory } from "@/components/app/settings/integrations-directory"
import { AiMemoryPanel } from "@/components/app/settings/ai-memory-panel"
import { StoreDetailsPanel } from "@/components/app/settings/store-details-panel"
import { CheckoutPanel } from "@/components/app/settings/checkout-panel"
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
import { STATEMENT_NAME_MAX, bankStatementLine, statementDescriptorSuffix } from "@/lib/payments/platform-descriptor"
import { ShareStorelib } from "@/components/app/share/share-storelib"
import type { ConnectedPlatform, ShareAddress } from "@/components/app/share/share-data"
import { EmailChangeFlow, PrivacyPanel, SecurityPanel } from "@/components/app/settings/account-panels"
import { NotificationPreferencesPanel } from "@/components/app/settings/notification-preferences"
import { useShellAvatar } from "@/lib/account/avatar-store"
import { applyBusinessSession } from "@/lib/businesses/switch-client"
import { displayEmail } from "@/lib/businesses/email-alias"
import { countWord } from "@/lib/businesses/rules"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { ShippingSettings } from "@/components/physical/shipping-settings"
import { TaxesPanel } from "@/components/app/settings/taxes-panel"
import { ReasonsPanel } from "@/components/app/settings/reasons-panel"
import { ChannelsPanel } from "@/components/app/settings/channels-panel"
import { CustomerEmailsPanel } from "@/components/app/settings/customer-emails-panel"
import { ActivityPanel } from "@/components/app/settings/activity-panel"
import { PaymentsHub } from "@/components/app/settings/payments-hub"

/* The country field is components/app/settings/country-picker: every country, with its flag. */


/*
  EVERY SECTION, WHERE A PERSON WOULD LOOK FOR IT. Four groups, each a
  heading over its sections: what is about you (Account), what is about the
  shop whatever it sells (Store), how physical orders get to people
  (Commerce, only while physical commerce is on in /admin), and the services
  connected to it (Integrations). `line` is what a section is for, shown
  under its name in the phone's list.
*/
const TABS = [
  { id: "general", label: "Profile", icon: User, group: "account", line: "Name, photo, username and addresses" },
  { id: "security", label: "Security", icon: Shield, group: "account", line: "Password, sign in and devices" },
  { id: "privacy", label: "Privacy", icon: ToggleLeft, group: "account", line: "What others see and what we send" },
  { id: "notifications", label: "Notifications", icon: Bell, group: "account", line: "Emails and alerts you get" },
  { id: "billing", label: "Plan", icon: CreditCard, group: "account", line: "Your plan, invoices and payment card" },
  { id: "store", label: "Store details", icon: Store, group: "store", line: "Name, contact, phone and country" },
  { id: "payments", label: "Payments", icon: Wallet, group: "store", line: "How buyers pay you and payouts" },
  { id: "checkout", label: "Checkout", icon: ShoppingCart, group: "store", line: "Accounts, news box and what is asked" },
  /* Where products are listed: the Online store, the Creator page, Explore and the store's own (components/app/settings/channels-panel.tsx). */
  { id: "channels", label: "Sales channels", icon: Share2, group: "store", line: "Where your products are listed" },
  /* Every email a buyer gets from the store, with a preview (components/app/settings/customer-emails-panel.tsx). */
  { id: "emails", label: "Customer emails", icon: Mail, group: "store", line: "What buyers get from you, and when" },
  /* The store's own tax regions and rates, for every product (components/app/settings/taxes-panel.tsx). */
  { id: "taxes", label: "Taxes", icon: Receipt, group: "store", line: "Tax you charge, by country" },
  { id: "domains", label: "Domains", icon: Globe, group: "store", line: "Your own web address" },
  /* What Storelib AI keeps for the creator on every website (components/app/settings/ai-memory-panel.tsx). */
  { id: "ai_memory", label: "AI Memory", icon: Brain, group: "store", line: "What Storelib AI remembers about your store" },
  /* Every change made to the store, who made it and when (components/app/settings/activity-panel.tsx). */
  { id: "activity", label: "Activity", icon: History, group: "store", line: "Every change made to your store" },
  /* Shipping and delivery, locations and returns: only while physical commerce is on in /admin. */
  { id: "shipping", label: "Shipping and delivery", icon: Truck, group: "commerce", line: "Rates, zones and packages" },
  { id: "locations", label: "Locations", icon: MapPin, group: "commerce", line: "Where stock is kept and ships from" },
  { id: "returns", label: "Returns and refunds", icon: Undo2, group: "commerce", line: "Return window and reasons" },
  /* Analytics and ad pixels for every store; Shippo, Printful, Gelato and the rest while physical commerce is on (components/app/settings/integrations-directory.tsx). */
  { id: "integrations", label: "Integrations", icon: Plug, group: "integrations", line: "Analytics, pixels and services you connect" },
] as const

/*
  THE SECTIONS IN GROUPS (the owner's reference: Account, Store, Commerce, Integrations, each a heading over its sections in
  the sheet's left column, and over its rows in the phone's list).
*/
const TAB_GROUPS = [
  { id: "account", label: "Account" },
  { id: "store", label: "Store" },
  { id: "commerce", label: "Commerce" },
  { id: "integrations", label: "Integrations" },
] as const
/*
  NO STORES TAB. "Get rid of the Stores tab in Settings. It doesn't make any
  sense." It held three cards, each a copy of something that has a home: the
  creator page's address (Profile, Your addresses, which opens it), a link to
  the creator page editor and a link to the OnePage editor (both in the
  sidebar). An old ?tab=stores link opens Profile.
*/

type TabId = typeof TABS[number]["id"]

const TAB_IDS: TabId[] = TABS.map((tab) => tab.id)
/** Tabs that exist only while physical commerce is on in /admin. */
/** Behind the physical commerce switch in /admin. */
const COMMERCE_TABS = new Set<string>(["shipping", "locations"])

/**
 * Where an older address meant to go. Shipping held four parts behind
 * ?section= before each became a section of Settings of its own.
 */
function tabFromAddress(tab: string | null, section: string | null): string | null {
  if (tab !== "shipping") return tab
  if (section === "locations" || section === "stock") return "locations"
  if (section === "taxes") return "taxes"
  if (section === "returns" || section === "advanced") return "returns"
  if (section === "integrations") return "integrations"
  return tab
}

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
  /** Who pays this creator (lib/payments/service providerFor). Airwallex draws Storelib Payments' hub in the Payments tab. */
  paymentsProvider?: "stripe" | "airwallex"
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

export function SettingsFormNew({ profile, creator, accountTimeZone = null, websitePublished = false, newsletter = false, website = null, onePageLive = false, sharePlatforms = [], otherStores = 0, paymentsProvider = "stripe", initialTab = "general" }: SettingsFormProps) {
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

  const normalizeStatementDescriptor = (value: string) => statementDescriptorSuffix(value)

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
  const physicalCommerce = usePhysicalCommerceEnabled()
  const searchParams = useSearchParams()
  const addressTab = tabFromAddress(searchParams?.get("tab") ?? null, searchParams?.get("section") ?? null)
  const allowed = (tab: string | null): tab is TabId => !!tab && TAB_IDS.includes(tab as TabId) && (!COMMERCE_TABS.has(tab) || physicalCommerce)
  const [activeTab, setActiveTab] = useState<TabId>(() => (allowed(addressTab) ? addressTab : TAB_IDS.includes(initialTab) && allowed(initialTab) ? initialTab : "general"))
  /*
    ON A PHONE, A LIST FIRST. Every section in its group, a row each, the
    way a phone's own settings open; a row opens its section with a way back
    at the top. A link to a section (?tab=) opens straight on it. From 1024px
    the groups are a column beside the open section and this is never shown.
  */
  const [phoneList, setPhoneList] = useState(() => !allowed(addressTab) && !searchParams?.get("stripe"))
  /* The sections this account has: Shipping and Integrations only while physical commerce is on. */
  /* Every store refunds; only a store with physical products takes returns, so without them the section is Refunds. */
  const shownTabs = TABS.filter((tab) => !COMMERCE_TABS.has(tab.id) || physicalCommerce).map((tab) => (tab.id === "returns" && !physicalCommerce ? { ...tab, label: "Refunds", line: "Why you refund" } : tab))
  /* Each section's own name, from the one list (a name missing from a chain of cases used to fall through to "Domains"). */
  const labelOf = (id: TabId): string =>
    id === "general" ? t("settings.general") === "General" ? "Profile" : t("settings.general") :
    id === "security" ? t("settings.security") :
    id === "privacy" ? t("settings.privacy") :
    id === "notifications" ? t("settings.notifications") :
    id === "payments" ? t("settings.payments") :
    shownTabs.find((tab) => tab.id === id)?.label ?? TABS.find((tab) => tab.id === id)?.label ?? id
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
  const formRef = useRef<HTMLFormElement>(null)
  const [panelEntrance, setPanelEntrance] = useState(false)
  /*
    THE PILL FIRST, THE PANEL AFTER. A press used to change the pill and swap
    the whole panel in one render, so the pill's fill could not start until
    General's hundreds of fields had been built: the press sat still, then
    the fill, the icon and the words all changed in one late frame. The pill
    reads activeTab and is drawn at once; the panel reads this deferred copy,
    built just after, with the old panel on screen until the new one is ready.
  */
  const panelTab = useDeferredValue(activeTab)
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showSaveToast, setShowSaveToast] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
  const [currentEmail, setCurrentEmail] = useState(displayEmail(profile.email) || "")
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

    if (tab === "privacy" && window.location.hash === "#notifications") {
      /* An older email's "notification settings" link: they have a tab of their own now. */
      setActiveTab("notifications")
      const url = new URL(window.location.href)
      url.searchParams.set("tab", "notifications")
      url.hash = ""
      window.history.replaceState({}, "", url.pathname + url.search)
    } else if (allowed(tabFromAddress(tab, params.get("section")))) {
      const to = tabFromAddress(tab, params.get("section")) as TabId
      setActiveTab(to)
      setPhoneList(false)
      if (to === "domains") fetchDomains()
      if (to !== tab) {
        /* An older ?tab=shipping&section= address: the section it meant, and the address says so. */
        const url = new URL(window.location.href)
        url.searchParams.set("tab", to)
        url.searchParams.delete("section")
        window.history.replaceState({}, "", url.pathname + url.search)
      }
    } else if (tab) {
      /* A tab that is gone (?tab=stores) or never was: General, and the address says so. */
      const url = new URL(window.location.href)
      url.searchParams.delete("tab")
      window.history.replaceState({}, "", url.pathname + url.search)
    }

    if (stripeParam === "return" || stripeParam === "refresh") {
      setActiveTab("payments")
      setPhoneList(false)
      loadStripeStatus()
      // Clean URL
      const url = new URL(window.location.href)
      url.searchParams.delete("tab")
      url.searchParams.delete("stripe")
      window.history.replaceState({}, "", url.pathname)
    }
  }, [loadStripeStatus, fetchDomains])

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


  /*
    THE SELECTED TAB CHANGES IN PLACE. NOTHING TRAVELS ACROSS THE ROW.
    The owner asked twice for a calmer switch, and the second time for no
    slide at all. Every tab carries its own fill (grey and a hairline). The
    pressed tab's fill fades in on the spot, the old tab's fades out where it
    is, and the words ease from grey to ink, all over 150ms on one ease out.
    NOTHING IS SCALED: a tab and its fill used to grow from 96% and dip to
    97% under the finger, and a scaled icon and label are drawn again at the
    end of the move, which read as the icon and the words flashing. Only
    opacity moves now. Nothing moves when less motion is asked for.
  */

  // fetchDomains moved above the URL params useEffect to avoid TDZ

  // Tab change with skeleton loading animation
  const handleTabChange = (newTab: TabId) => {
    if (phoneList) {
      /* From the phone's list: the section opens at its top, its way back above it. */
      setPhoneList(false)
      const box = formRef.current?.closest("[data-settings-sheet-scroll], .app-content-scroll") as HTMLElement | null
      box?.scrollTo({ top: 0 })
    }
    if (newTab === activeTab) {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", newTab)
      window.history.replaceState({}, "", url.toString())
      return
    }
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
    /* The settings sheet's own scroller when settings is drawn in it (components/app/settings-sheet.tsx), else the shell's. */
    const scroller = formRef.current?.closest("[data-settings-sheet-scroll], .app-content-scroll") as HTMLElement | null
    const form = formRef.current
    if (scroller && form) {
      const formTop = form.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      form.style.minHeight = `${Math.max(0, Math.ceil(scroller.scrollTop + scroller.clientHeight - formTop))}px`
    }
    /* The new panel fades in, for a press only (not on load, not on a re-render). */
    setPanelEntrance(true)
    setActiveTab(newTab)
    if (newTab === "domains") fetchDomains()
    // Persist tab in URL so refresh stays on the same tab
    const url = new URL(window.location.href)
    url.searchParams.set("tab", newTab)
    url.searchParams.delete("section")
    window.history.replaceState({}, "", url.toString())
  }

  /* Back to the phone's list from a section. */
  const backToList = () => {
    setPhoneList(true)
    const url = new URL(window.location.href)
    url.searchParams.delete("tab")
    url.searchParams.delete("section")
    window.history.replaceState({}, "", url.toString())
    const box = formRef.current?.closest("[data-settings-sheet-scroll], .app-content-scroll") as HTMLElement | null
    box?.scrollTo({ top: 0 })
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
       *   storelib.me/<handle>          the OnePage       (onepages.slug)
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
          onepageWarning = `Your details were saved, but your OnePage address could not be moved to ${getLinksUrlDisplay(cleanUsername)}. Save again to retry.`
        }
      }

      /**
       * =====================================================================
       *  A NEW NAME REACHES THE TAB TITLE AND THE SHARE CARD, NOT JUST HERE
       * =====================================================================
       * The OnePage keeps the name in four places of its own — its title,
       * the copy taken when it was published, the SEO card's Meta title, and
       * the creator row — and none of them moved when this form wrote the
       * profile. That is why a renamed creator's own page still said the name
       * they opened the account with in the phone's bottom bar.
       *
       * The server moves the copies that still hold the OLD name and leaves
       * a page title somebody typed alone (/api/account/profile-changed), and
       * clears the caches the public pages read the profile through. Not
       * fatal: the name is already saved, and the database trigger in
       * supabase/sql/run-now/43 does the same work for every writer.
       */
      const previousName = profile.display_name || ""
      if (previousName && previousName !== displayName) {
        await fetch("/api/account/profile-changed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previousName }),
        }).catch(() => null)
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
      /* A new name for the bank statement is written to the creator's Stripe account as well (app/api/settings/statement-descriptor). */
      if (statementDescriptor !== initialStatementDescriptor.current && statementDescriptor.trim()) {
        void fetch("/api/settings/statement-descriptor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descriptor: statementDescriptor }),
        }).catch(() => {})
      }
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
        <div className="max-w-4xl lg:max-w-[1120px] mx-auto app-gutter py-6 sm:py-8 pb-16 sm:pb-32 overflow-x-clip">
        {/*
          THE HEADER AND THE ADDRESS PILL. On a phone the pill took the right
          half of the row the title and the subtitle shared, and "Manage your
          account and preferences" wrapped into three short lines under
          "Settings". Now the title and the pill share the first row, centred
          on each other, and the subtitle has the whole width under them. From
          640px it is as it was: the title over the subtitle on the left, the
          pill at the top right.
        */}
        {/*
          NOTHING IN IT IS CUT. The title and the line under it wrap rather
          than clip, and the address pill (its address and its Published
          mark) has a row of its own on a phone instead of a squeezed half of
          the title's. From 640px the pill sits at the top right, as wide as
          its address needs, up to 360px.
        */}
        <div data-settings-header="" className={`mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-6 ${phoneList ? "" : "max-lg:hidden"}`}>
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight text-[#1a1a2e] [overflow-wrap:anywhere] sm:text-[26px]">{t("settings.title")}</h1>
            <p className="mt-1 text-[14px] leading-snug text-[#6b7280]">{t("settings.subtitle")}</p>
          </div>
          <div data-settings-pill="" className="flex min-w-0 shrink-0 sm:max-w-[360px] sm:justify-end sm:pt-0.5">
            <ShareStorelib size="sm" className="md:hidden max-w-full" addresses={shareAddresses} platforms={sharePlatforms} />
            <ShareStorelib className="hidden md:inline-flex max-w-full" addresses={shareAddresses} platforms={sharePlatforms} />
          </div>
        </div>

        {/*
          FROM 1024px, THE SECTIONS ARE A COLUMN OF GROUPS beside the one open (the owner's reference: Account, Store,
          Commerce, Integrations). Below it, the same sections are the pill row above, in the same order.
        */}
        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-10">
        {/* A plain list, not a card in the sheet: the groups' names and their sections, the open one filled. */}
        <nav aria-label="Settings" data-settings-groups="" className="sticky top-4 hidden lg:block">
          <div className="py-1">
            {TAB_GROUPS.map((group) => {
              const list = shownTabs.filter((tab) => tab.group === group.id)
              if (list.length === 0) return null
              return (
                <div key={group.id} className="mb-1 last:mb-0" data-settings-group={group.id}>
                  <p className="px-3 pb-1 pt-4 text-[12px] font-medium text-[#9ca3af] first:pt-1">{group.label}</p>
                  {list.map((tab) => {
                    const Icon = tab.icon
                    const on = activeTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => handleTabChange(tab.id)}
                        aria-current={on ? "page" : undefined}
                        data-settings-side-tab={tab.id}
                        className={`flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-left text-[14px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent] ${
                          on ? "bg-[#eceef1] font-medium text-[#1a1a2e]" : "font-normal text-[#4b5563] hover:bg-[#f0f1f3] hover:text-[#1a1a2e]"
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${on ? "text-[#1a1a2e]" : "text-[#9ca3af]"}`} aria-hidden />
                        {labelOf(tab.id)}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </nav>
        <div className="min-w-0">
        {/*
          THE PHONE'S LIST. Every section in its group, one row each, its name
          and what it is for; a row opens the section. Below 1024px only.
        */}
        {phoneList ? (
          <div className="space-y-5 pb-6 lg:hidden" data-settings-list="">
            {TAB_GROUPS.map((group) => {
              const list = shownTabs.filter((tab) => tab.group === group.id)
              if (list.length === 0) return null
              return (
                <section key={group.id} aria-labelledby={`settings-list-${group.id}`} data-settings-list-group={group.id}>
                  <h2 id={`settings-list-${group.id}`} className="px-1 pb-2 text-[13px] font-medium text-[#6b7280]">
                    {group.label}
                  </h2>
                  <div className="overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                    {list.map((tab, i) => {
                      const Icon = tab.icon
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => handleTabChange(tab.id)}
                          data-settings-row={tab.id}
                          className={`flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors active:bg-[#f6f7f8] focus-visible:bg-[#f6f7f8] [-webkit-tap-highlight-color:transparent] ${i > 0 ? "border-t border-[#f0f1f3]" : ""}`}
                        >
                          <Icon className="h-[18px] w-[18px] shrink-0 text-[#6b7280]" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-medium leading-5 text-[#1a1a2e]">{labelOf(tab.id)}</span>
                            <span className="block truncate text-[13px] leading-[18px] text-[#6b7280]">{tab.line}</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-[#c4c8ce]" aria-hidden />
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          /* A section open on a phone: the way back to the list, and the section's name. */
          <div className="mb-4 lg:hidden" data-settings-back="">
            <button
              type="button"
              onClick={backToList}
              className="-ml-2 inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[14px] font-medium text-[#4b5563] outline-none transition-colors active:bg-[#eceef1] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Settings
            </button>
            <h2 className="mt-1 text-[22px] font-bold leading-tight text-[#1a1a2e]">{labelOf(activeTab)}</h2>
          </div>
        )}

        {/* Tab Content */}
        <form ref={formRef} onSubmit={handleSubmit} className={phoneList ? "max-lg:hidden" : undefined}>
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
          <div key={panelTab} data-settings-panel={panelTab} className={panelEntrance ? "settings-panel" : undefined}>
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
          {panelTab === "billing" && (
            <div className="space-y-4 sm:space-y-6">
              {billingData ? (
                <BillingPageClient initialData={billingData as never} embedded />
              ) : billingError ? (
                <div className="bg-white rounded-2xl app-card-x py-6 shadow-sm border border-[#e5e7eb]">
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
                <div className="bg-white rounded-2xl app-card-x py-6 shadow-sm border border-[#e5e7eb]">
                  <div className="flex items-center gap-2.5 text-[#6b7280]">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-[#e5e7eb] border-t-[#7c3aed] animate-spin" />
                    <span className="text-[13.5px]">Checking your plan and invoices</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* General Tab */}
          {panelTab === "general" && (
            <div className="space-y-4 sm:space-y-6">
              {/* Purple announcement bar: Connect Stripe (only after status confirmed) */}
              {!stripeStatus.connected && (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#1a1a2e] to-[#2d2d35] px-4 sm:px-6 py-3 sm:py-3.5 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <Wallet className="h-5 w-5 text-white shrink-0" />
                    <p className="text-[13px] sm:text-[14px] font-medium text-white">
                      <span className="sm:hidden">Set up Storelib Payments</span>
                      <span className="hidden sm:inline">Set up Storelib Payments to accept sales and receive payouts.</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTabChange("payments")}
                    className="shrink-0 h-9 px-5 text-[13px] font-semibold text-[#1a1a2e] bg-white rounded-lg hover:bg-[#f3f4f6] transition-colors shadow-sm cursor-pointer"
                  >
                    Set up
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
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
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
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]" data-settings-card="profile">
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
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
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
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
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
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">
                  Time zone
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">Your days and times in Home, Orders, Analytics, Emails and Payouts, and in the sale emails we send you</p>
                {/* Saved to the account and followed by the server too (lib/account/time-zone). */}
                <TimeZonePicker value={selectedTimezone} onChange={setSelectedTimezone} />
              </div>

              {/* Address Card */}
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
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
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
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
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
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
          {panelTab === "security" && (
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
          {panelTab === "privacy" && (
            <PrivacyPanel
              email={currentEmail}
              initialPersonalized={(profile as { personalized_recommendations?: boolean }).personalized_recommendations !== false}
              initialNewsletter={newsletter}
            />
          )}

          {/* Notifications Tab: which notifications, by email and in app (notification-preferences.tsx) */}
          {panelTab === "notifications" && <NotificationPreferencesPanel />}

          {panelTab === "ai_memory" && <AiMemoryPanel />}

          {/* Settings › Store details and Checkout: every store, whatever it sells. */}
          {panelTab === "store" && (
            <StoreDetailsPanel
              onSupportEmail={(email) => {
                /* The same address Profile shows: kept in step, and not an unsaved change there. */
                setSupportEmail(email)
                initialSupportEmail.current = email
              }}
            />
          )}
          {panelTab === "checkout" && <CheckoutPanel />}

          {panelTab === "shipping" && physicalCommerce && <ShippingSettings part="delivery" />}
          {panelTab === "locations" && physicalCommerce && <ShippingSettings part="locations" />}
          {panelTab === "taxes" && <TaxesPanel />}
          {panelTab === "channels" && <ChannelsPanel />}
          {panelTab === "emails" && <CustomerEmailsPanel />}
          {panelTab === "activity" && <ActivityPanel />}
          {panelTab === "returns" && (
            <div className="space-y-4 sm:space-y-6">
              {physicalCommerce && <ShippingSettings part="returns" />}
              <ReasonsPanel kinds={physicalCommerce ? ["return", "refund"] : ["refund"]} />
            </div>
          )}

          {/* Integrations: shipping, print on demand, dropshipping and fulfillment services (components/physical/integrations-marketplace.tsx). */}
          {panelTab === "integrations" && <IntegrationsDirectory />}

          {/* Payments Tab */}
          {panelTab === "payments" && (
            <PaymentsHub
              statementDescriptorSlot={
                paymentsProvider === "stripe" ? (
            <div className="space-y-[10px] sm:space-y-[14px] pt-2">
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-5 shadow-sm border border-[#e5e7eb]">
                <div className="space-y-1.5 max-w-[420px]">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="statement-descriptor" className="text-[13px] font-medium text-[#374151]">Name on bank statements</Label>
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
                  {/* The line as the buyer's bank app will draw it, on a small statement row. */}
                  <div data-statement-preview="" className="mt-2 flex items-center gap-3 rounded-xl border border-[#eceef1] bg-[#fafafb] px-3 py-2.5">
                    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#1a1a2e] text-[12px] font-semibold text-white">
                      {(statementDescriptor || defaultStatementDescriptor).charAt(0) || "S"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[13px] font-medium text-[#1a1a2e]">{bankStatementLine(statementDescriptor || defaultStatementDescriptor)}</p>
                      <p className="text-[12px] text-[#6b7280]">How a sale reads in your buyer&apos;s bank app</p>
                    </div>
                  </div>
                  <p className="text-[12px] text-[#9ca3af]">Letters, numbers and spaces. Up to {STATEMENT_NAME_MAX} characters.</p>
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
                ) : null
              }
            />
          )}

          {/* Domains Tab */}
          {panelTab === "domains" && (
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
        </div>
        {/* Room for the save bar while it is up, so the page's last row can scroll clear of it. */}
        {hasUnsavedChanges ? <div aria-hidden className="h-16" /> : null}
      </div>

      {/*
        THE SAVE BAR. A floating card, not a strip across the foot of the
        screen: white, a hairline and a soft shadow like the app's other
        cards, the change on the left and Discard and Save on the right. On a
        phone it rides just above the navigation pill, which stays where it
        is (it used to be pushed off the screen while there was something to
        save, and the strip covered the page's last rows). It rises in on
        transform and opacity only, over 260ms on iOS's curve.
      */}
      {(() => {
        const barUp = hasUnsavedChanges && !showEmailChangeModal && !showDeleteModal
        const discard = () => {
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
          /* Payments' two fields: Cancel used to leave them as typed, so the bar never went away there. */
          setPayoutCurrency(initialPayoutCurrency.current)
          setStatementDescriptor(initialStatementDescriptor.current)
          setError(null)
        }
        return (
      <div
        data-settings-save-bar={barUp ? "up" : "down"}
        aria-hidden={!barUp || undefined}
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 md:left-[240px] md:px-6 bottom-[calc(var(--app-nav-top)+10px)] md:bottom-[max(16px,env(safe-area-inset-bottom))]"
      >
        <div
          role="region"
          aria-label="Unsaved changes"
          /* Rises 16px and fades in over 320ms on the iOS curve, on the compositor; leaves the same way, a little quicker. */
          className={`flex w-full max-w-[520px] items-center gap-2.5 rounded-[14px] border border-[#e5e7eb]/80 bg-white/95 py-1.5 pl-3.5 pr-1.5 shadow-[0_10px_30px_-16px_rgba(17,24,39,0.30),0_2px_6px_-2px_rgba(17,24,39,0.08)] will-change-transform transition-[transform,opacity] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
            barUp ? "pointer-events-auto translate-y-0 opacity-100 duration-[320ms]" : "translate-y-4 opacity-0 duration-[220ms]"
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${error ? "bg-[#c4290c]" : "bg-[#e8a400]"}`} />
            <span className={`truncate text-[14px] ${error ? "text-[#b42318]" : "text-[#4b5563]"}`}>{error || t("settings.unsavedChanges")}</span>
          </div>
          <button type="button" onClick={discard} tabIndex={barUp ? 0 : -1} className={`${secondaryDepth} h-9 rounded-xl px-3.5 text-[14px]`}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={isLoading}
            tabIndex={barUp ? 0 : -1}
            className={`${primaryDepth} h-9 gap-2 rounded-xl px-4 text-[14px] disabled:opacity-70`}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isLoading ? "Saving" : t("settings.save")}
          </button>
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
                    Your store, products, customers and details are removed. People who bought from you keep what they bought, and your sales and payout records are kept.
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
