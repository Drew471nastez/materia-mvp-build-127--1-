"use client"

import { announceChange } from "@/lib/seo/announce-client"
import type React from "react"
import { BottomSheet, SHEET_CLOSE_MS, SHEET_EASE, SHEET_OPEN_MS } from "@/components/ui/bottom-sheet"
import { useState, useRef, useEffect, useLayoutEffect, useCallback, startTransition } from "react"
import { createPortal } from "react-dom"
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
  ExternalLink, Globe,
  User, FileText,
  ToggleLeft, Bell, LogOut, Trash2, Languages, Info, ChevronDown, CheckCircle, Clock, Copy, Plus, Plug, Brain, MapPin, Undo2, Receipt, Store, ShoppingCart, Share2, History,
  Users,
} from "lucide-react"
import { IntegrationsDirectory } from "@/components/app/settings/integrations-directory"
import { AiMemoryPanel } from "@/components/app/settings/ai-memory-panel"
import { StoreDetailsPanel } from "@/components/app/settings/store-details-panel"
import { CheckoutPanel } from "@/components/app/settings/checkout-panel"
import { SETTINGS_TAB_EVENT, type SettingsTabRequest } from "@/lib/settings/sheet-links"
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
import { peekGet, prefetchGet, whenGets } from "@/components/physical/ui"
import { TaxesPanel } from "@/components/app/settings/taxes-panel"
import { MarketsPanel } from "@/components/app/settings/markets-panel"
import { ReasonsPanel } from "@/components/app/settings/reasons-panel"
import { ChannelsPanel } from "@/components/app/settings/channels-panel"
import { CustomerEmailsPanel } from "@/components/app/settings/customer-emails-panel"
import { ActivityPanel } from "@/components/app/settings/activity-panel"
import { TeamPanel } from "@/components/app/settings/team-panel"
import { PaymentsHub } from "@/components/app/settings/payments-hub"
import { SettingsLeaveGuard } from "@/components/app/settings/leave-guard"
import { markDirty, requestLeave } from "@/lib/settings/unsaved-guard"
import { WAIT_MS, fetchWithDeadline } from "@/lib/net/request"
import { tt } from "@/lib/i18n/text"
import { Rich } from "@/lib/i18n/rich"

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
  { id: "general", get label() { return tt("Profile") }, icon: User, group: "account", get line() { return tt("Name, photo, username and addresses") } },
  { id: "security", get label() { return tt("Security") }, icon: Shield, group: "account", get line() { return tt("Password, sign in and devices") } },
  { id: "privacy", get label() { return tt("Privacy") }, icon: ToggleLeft, group: "account", get line() { return tt("What others see and what we send") } },
  { id: "notifications", get label() { return tt("Notifications") }, icon: Bell, group: "account", get line() { return tt("Emails and alerts you get") } },
  { id: "billing", get label() { return tt("Plan") }, icon: CreditCard, group: "account", get line() { return tt("Your plan, invoices and payment card") } },
  /* Who helps run the store, and the stores you help run (components/app/settings/team-panel.tsx, lib/team). */
  { id: "team", get label() { return tt("Team") }, icon: Users, group: "account", get line() { return tt("People who help run your store") } },
  { id: "store", get label() { return tt("Store details") }, icon: Store, group: "store", get line() { return tt("Name, contact, phone and country") } },
  { id: "payments", get label() { return tt("Payments") }, icon: Wallet, group: "store", get line() { return tt("How buyers pay you and payouts") } },
  { id: "checkout", get label() { return tt("Checkout") }, icon: ShoppingCart, group: "store", get line() { return tt("Accounts, news box and what is asked") } },
  /* Where products are listed: the Online store, the Creator page, Explore and the store's own (components/app/settings/channels-panel.tsx). */
  { id: "channels", get label() { return tt("Sales channels") }, icon: Share2, group: "store", get line() { return tt("Where your products are listed") } },
  /* Every email a buyer gets from the store, with a preview (components/app/settings/customer-emails-panel.tsx). */
  { id: "emails", get label() { return tt("Customer emails") }, icon: Mail, group: "store", get line() { return tt("What buyers get from you, and when") } },
  /* The store's own tax regions and rates, for every product (components/app/settings/taxes-panel.tsx). */
  { id: "taxes", get label() { return tt("Taxes") }, icon: Receipt, group: "store", get line() { return tt("Tax you charge, by country") } },
  /* The website's languages, and the countries it sells to with their currency (components/app/settings/markets-panel.tsx, lib/markets). */
  { id: "markets", get label() { return tt("Markets and languages") }, icon: Languages, group: "store", get line() { return tt("Languages, countries and currencies") } },
  { id: "domains", get label() { return tt("Domains") }, icon: Globe, group: "store", get line() { return tt("Your own web address") } },
  /* What Storelib AI keeps for the creator on every website (components/app/settings/ai-memory-panel.tsx). */
  { id: "ai_memory", get label() { return tt("AI Memory") }, icon: Brain, group: "store", get line() { return tt("What Storelib AI remembers about your store") } },
  /* Every change made to the store, who made it and when (components/app/settings/activity-panel.tsx). */
  { id: "activity", get label() { return tt("Activity") }, icon: History, group: "store", get line() { return tt("Every change made to your store") } },
  /* Shipping and delivery, locations and returns: only while physical commerce is on in /admin. */
  { id: "shipping", get label() { return tt("Shipping and delivery") }, icon: Truck, group: "commerce", get line() { return tt("Rates, zones and packages") } },
  { id: "locations", get label() { return tt("Locations") }, icon: MapPin, group: "commerce", get line() { return tt("Where stock is kept and ships from") } },
  { id: "returns", get label() { return tt("Returns and refunds") }, icon: Undo2, group: "commerce", get line() { return tt("Return window and reasons") } },
  /* Analytics and ad pixels for every store; Shippo, Printful, Gelato and the rest while physical commerce is on (components/app/settings/integrations-directory.tsx). */
  { id: "integrations", get label() { return tt("Integrations") }, icon: Plug, group: "integrations", get line() { return tt("Analytics, pixels and services you connect") } },
] as const

/*
  THE SECTIONS IN GROUPS (the owner's reference: Account, Store, Commerce, Integrations, each a heading over its sections in
  the sheet's left column, and over its rows in the phone's list).
*/
const TAB_GROUPS = [
  { id: "account", get label() { return tt("Account") } },
  { id: "store", get label() { return tt("Store") } },
  { id: "commerce", get label() { return tt("Commerce") } },
  { id: "integrations", get label() { return tt("Integrations") } },
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

/* A pill's own fill fades in where it is, on one gentle ease out (as before the sheet). */
const TAB_FADE_MS = 150
const TAB_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"
/** The longest a press waits for a section's data that is still on its way, before the section shows with its own placeholder. */
const DATA_WAIT_MS = 160
/*
  A SECTION PRESSED WHILE SCROLLED DOWN GLIDES UP TO ITS TOP (round 20, the
  owner: "when I click in the sidebar, it should auto scroll up smoothly,
  clean"). Filmed: the jump straight to the top made "Settings" pop in over
  the column in one frame, and the column dropped from where it was held to
  its place under the title in the same frame. The new section still swaps
  on the press, at once (never the old one riding a glide up and swapped
  mid motion, round R1's "bump"), but it is drawn GLIDE_FROM_PX above the
  top, where nothing above it is in view yet, and the browser's own smooth
  scroll carries it the rest of the way: the title comes down into view and
  the column settles under it, on the compositor. From closer than that it
  glides from where it is; within SNAP_PX, and with less motion asked for,
  it is simply at the top.
*/
const GLIDE_FROM_PX = 200
const SNAP_PX = 8

/**
 * What each section reads when it opens, so Settings can fetch it ahead
 * (components/physical/ui prefetchGet) and show a section only once it is
 * whole. A section that reads nothing of its own shows at once.
 */
const TAB_DATA: Partial<Record<TabId, (physical: boolean) => string[]>> = {
  store: (p) => ["/api/store/settings", ...(p ? ["/api/physical/settings"] : [])],
  checkout: () => ["/api/store/settings"],
  channels: () => ["/api/store/channels"],
  taxes: () => ["/api/store/taxes"],
  markets: () => ["/api/store/markets"],
  emails: () => ["/api/store/emails"],
  activity: () => ["/api/store/activity"],
  ai_memory: () => ["/api/ai-memory"],
  shipping: () => ["/api/physical/settings"],
  locations: () => ["/api/physical/settings"],
  returns: (p) => ["/api/store/reasons", ...(p ? ["/api/physical/settings"] : [])],
  integrations: (p) => ["/api/store/integrations", "/api/store/integrations/catalog", ...(p ? ["/api/physical/integrations"] : [])],
}
const tabData = (id: TabId, physical: boolean): string[] => TAB_DATA[id]?.(physical) ?? []
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
  /** Working in another store as a team member (lib/team): only the account's own sections, never this account's store dressed as the one they work in. */
  teamActing?: boolean
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
        hideFrom={null}
        /* Change email and Delete account have fields: the sheet sits on the keyboard, never under it. */
        aboveKeyboard
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

  if (!isVisible || typeof document === "undefined") return null

  /* On the body: inside Settings' page (640 to 1023px, a layer under the app's header) it was drawn under the header. */
  return createPortal(
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
              aria-label={tt("Close")}
              className="w-8 h-8 rounded-lg bg-[#f3f4f6] flex items-center justify-center text-[#6b7280] hover:bg-[#e5e7eb] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4 max-h-[70vh] overflow-y-auto overscroll-contain">{shownRef.current}</div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function SettingsFormNew({ profile, creator, accountTimeZone = null, websitePublished = false, newsletter = false, website = null, onePageLive = false, sharePlatforms = [], otherStores = 0, paymentsProvider = "stripe", teamActing = false, initialTab = "general" }: SettingsFormProps) {
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
  const allowed = (tab: string | null): tab is TabId =>
    !!tab && TAB_IDS.includes(tab as TabId) && (!COMMERCE_TABS.has(tab) || physicalCommerce) && (!teamActing || TABS.find((x) => x.id === tab)?.group === "account")
  const [activeTab, setActiveTab] = useState<TabId>(() => (allowed(addressTab) ? addressTab : TAB_IDS.includes(initialTab) && allowed(initialTab) ? initialTab : "general"))
  /*
    BELOW 1024px, PILLS (round V, the owner: "like it was before, the whole
    settings page with those pill shapes"). Settings opens on its first
    section with every section in a row of pills at the top; a press swaps
    the section in place. The list of rows that opened a section and came
    back to it is gone.
  */
  /* The sections this account has: Shipping and Integrations only while physical commerce is on. */
  /* Every store refunds; only a store with physical products takes returns, so without them the section is Refunds. */
  const shownTabs = TABS.filter((tab) => (!COMMERCE_TABS.has(tab.id) || physicalCommerce) && (!teamActing || tab.group === "account")).map((tab) => (tab.id === "returns" && !physicalCommerce ? { ...tab, label: tt("Refunds"), line: tt("Why you refund") } : tab))
  /* Each section's own name, from the one list (a name missing from a chain of cases used to fall through to "Domains"). */
  const labelOf = (id: TabId): string =>
    id === "general" ? t("settings.general") === "General" ? tt("Profile") : t("settings.general") :
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
  /*
   * Every tab's settings, fetched quietly once the first one has drawn, so a
   * tab opened later draws at once (peekGet in each panel) instead of an
   * empty pane that fills a beat after. Billing too.
   */
  useEffect(() => {
    /*
      Right after the first draw, not when the browser is idle: a section pressed a second after opening must find its
      data here. In the sheet, once it has risen: nine answers landing during the rise each redrew the whole of
      Settings while the sheet was moving.
    */
    let live = true
    let t = 0
    const go = () => {
      if (!live) return
      prefetchGet([...new Set(Object.keys(TAB_DATA).flatMap((id) => tabData(id as TabId, physicalCommerce)))])
      void loadBilling()
    }
    const rising = (formRef.current?.closest("[data-settings-sheet]") as HTMLElement | null)?.getAnimations?.() ?? []
    if (rising.length) void Promise.all(rising.map((a) => a.finished.catch(() => null))).then(go)
    else t = window.setTimeout(go, 0)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [physicalCommerce, loadBilling])
  const formRef = useRef<HTMLDivElement>(null)
  const pillRowRef = useRef<HTMLDivElement>(null)
  /*
    THE PRESSED PILL COMES TO THE MIDDLE OF THE ROW, as it did before the
    sheet: press one near an edge and the row glides so it sits centred, the
    ones beyond it slide into view, and the next press is a thumb away. A
    section opened by its address is placed there without the glide.
  */
  const pillPlaced = useRef(false)
  useEffect(() => {
    const row = pillRowRef.current
    const pill = row?.querySelector<HTMLElement>(`[data-settings-tab="${activeTab}"]`)
    if (!row || !pill) return
    const left = Math.max(0, Math.min(row.scrollWidth - row.clientWidth, pill.offsetLeft - (row.clientWidth - pill.offsetWidth) / 2))
    row.scrollTo({ left, behavior: pillPlaced.current ? "smooth" : ("instant" as ScrollBehavior) })
    pillPlaced.current = true
  }, [activeTab])
  const [panelEntrance, setPanelEntrance] = useState(false)
  /*
    THE PILL FIRST, THE PANEL AFTER. A press used to change the pill and swap
    the whole panel in one render, so the pill's fill could not start until
    General's hundreds of fields had been built: the press sat still, then
    the fill, the icon and the words all changed in one late frame. The pill
    reads activeTab and is drawn at once; the panel reads this deferred copy,
    built just after, with the old panel on screen until the new one is ready.
  */
  /*
    THE PILL AT ONCE, THE SECTION RIGHT AFTER, AT ITS TOP (round R1).
    The pill reads activeTab and fills on the press. The section reads
    panelTab, swapped in a transition on the same press, so the pill's frame
    is never held up by the section being built. A section whose data is
    already here (fetched ahead when Settings opened, or kept from an earlier
    visit: components/physical/ui peekGet) swaps on that press; one whose data
    is still on its way waits for it at most DATA_WAIT_MS and then shows its
    own placeholder.

    NO GLIDE, NO WAIT FOR ONE. From 1024px a press used to glide the scroll to
    the top first (lib/ui/glide-scroll) and swap the section in once the glide
    neared the top, 400 to 470ms after the press: the old section rode up the
    screen and was then replaced mid motion, "a little bit of a bump". The
    section now swaps at once and is placed at its top before it is painted
    (the layout effect below), so nothing moves after it appears.
  */
  const [panelTab, setPanelTab] = useState<TabId>(activeTab)
  useEffect(() => {
    if (panelTab === activeTab) return
    let live = true
    const urls = tabData(activeTab, physicalCommerce)
    const show = () => {
      if (live) startTransition(() => setPanelTab(activeTab))
    }
    /*
      Plan waits for its own answer the same way (round 20): the open section stays while it comes, rather than a
      one line "Checking your plan" card that the plans then push down from under it. This effect runs again when the
      answer lands, and shows it then.
    */
    if (activeTab === "billing" && !billingData && !billingError) {
      const t = window.setTimeout(show, DATA_WAIT_MS)
      return () => {
        live = false
        window.clearTimeout(t)
      }
    }
    if (urls.every((u) => peekGet(u) !== null)) show()
    else void Promise.race([whenGets(urls), new Promise((r) => window.setTimeout(r, DATA_WAIT_MS))]).then(show)
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, physicalCommerce, !!billingData, billingError])
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
  /* The Name field's own text while it is being typed (see the field). */
  const [nameDraft, setNameDraft] = useState<string | null>(null)

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
  /* A failed read keeps the plan the server drew the page with: an error never blurs a paid store's Domains. */
  useEffect(() => {
    fetch("/api/billing/subscription")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setUserPlan((plan) => data?.currentPlan?.id || (data ? "free" : plan ?? "free")))
      .catch(() => setUserPlan((plan) => plan ?? "free"))
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
      setUsernameError(tt("Username must be at least 3 characters"))
      return
    }

    const validation = isValidUsername(cleanValue)
    if (!validation.valid) {
      setUsernameError(validation.error || tt("Invalid username"))
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
     * EVERY SECTION OPENS AT ITS TOP.
     *
     * The form used to be pinned to the height the old scroll needed, so the
     * page did not jump under the finger; the pin was never taken off, so a
     * short section opened halfway down a long one's scroll, with nothing in
     * view. Now the scroll goes to the top before the new section is drawn,
     * in one frame and without a smooth scroll, and any pin left by an older
     * build is cleared.
     */
    /*
      FROM 1024px, THE NEW SECTION AT ITS TOP, IN THE FRAME IT APPEARS. The
      glide to the top that was here (lib/ui/glide-scroll) held the new
      section back until the glide was nearly done, and swapping it in mid
      motion was the bump the owner kept feeling. See panelTab, above. Below
      1024px the pills keep their own placing.
    */
    /*
      CHANGES THAT AREN'T SAVED ASK FIRST (lib/settings/unsaved-guard.ts):
      Save, Discard or Keep editing, and the section changes only after Save
      or Discard.
    */
    requestLeave(() => {
      scrollPending.current = true
      /*
        NO HEIGHT LOST WHILE THE NEXT SECTION COMES (round 20). Its box keeps the open section's height until the swap's
        layout effect has read the scroll: a short section put in under a long one's scroll laid the page out short, the
        browser dropped the scroll to the top in that frame, and "Settings" popped in over a column that jumped down.
      */
      if (formRef.current) formRef.current.style.minHeight = `${formRef.current.offsetHeight}px`
      /* Where the column is on screen as it is pressed, so it can be eased from there if the swap moves it (below). */
      const column = formRef.current?.closest("[data-settings-columns]")?.querySelector<HTMLElement>("[data-settings-groups]")
      columnFrom.current = column && column.offsetHeight > 0 ? column.getBoundingClientRect().top : null
      /* The new panel fades in, for a press only (not on load, not on a re-render). */
      setPanelEntrance(true)
      setActiveTab(newTab)
      if (newTab === "domains") fetchDomains()
      // Persist tab in URL so refresh stays on the same tab
      const url = new URL(window.location.href)
      url.searchParams.set("tab", newTab)
      url.searchParams.delete("section")
      url.searchParams.delete("integration")
      window.history.replaceState({}, "", url.toString())
    })
  }

  /* A link inside a section to another section (components/physical/readiness-client ReadinessLink): the same switch a press on its tab makes, unsaved changes asked about first. */
  const tabSwitch = useRef<(tab: string) => void>(() => undefined)
  tabSwitch.current = (tab: string) => {
    if (allowed(tab)) handleTabChange(tab)
  }
  useEffect(() => {
    const go = (e: Event) => tabSwitch.current(String((e as CustomEvent<unknown>).detail ?? ""))
    window.addEventListener("storelib:settings-tab", go)
    return () => window.removeEventListener("storelib:settings-tab", go)
  }, [])

  const scrollPending = useRef(false)
  /** Lets go of the section's held height once a glide to the top is over (see the layout effect below). */
  const glideHold = useRef<null | (() => void)>(null)
  /** The column's top on screen at the press (from 1024px), or null. */
  const columnFrom = useRef<number | null>(null)
  /** The settings sheet's own scroller when settings is drawn in it (components/app/settings-sheet.tsx), else the shell's. */
  const scrollerOf = () => formRef.current?.closest("[data-settings-sheet-scroll], .app-content-scroll") as HTMLElement | null
  /* Before the new section is painted: the scroll goes to the section's top, under the pills. */
  useLayoutEffect(() => {
    if (!scrollPending.current) return
    scrollPending.current = false
    const scroller = scrollerOf()
    /*
      With the pill row held at the top (below 1024px), a section opens just
      under it: the row stays where the thumb left it instead of dropping
      back down with the page. Without the row, the very top as before.
    */
    const bar = pillRowRef.current
    const held = !!bar && getComputedStyle(bar).display !== "none" && !!formRef.current && !!scroller
    const target = held ? Math.max(0, formRef.current!.getBoundingClientRect().top - scroller!.getBoundingClientRect().top + scroller!.scrollTop - bar!.offsetHeight - 12) : 0
    /* Where the old section was scrolled to, read while the press's hold (handleTabChange) still keeps its height. */
    const from = scroller?.scrollTop ?? 0
    /* A short section still fills the screen under the row, so the row can stay where it is. Measured first, set once:
       clearing it before measuring laid the page out short and the browser pulled the scroll to the top. */
    if (formRef.current) formRef.current.style.minHeight = held ? `${scroller!.clientHeight}px` : ""
    if (!scroller || from <= target) return
    /* In this frame the new section is never painted part way down the old one's scroll: at most GLIDE_FROM_PX above its top, then up. */
    const still = from - target <= SNAP_PX || typeof scroller.scrollTo !== "function" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    /*
      From where the column is still held (sticky) and the title still out of view, so neither moves in the swap's frame:
      GLIDE_FROM_PX, or more when the column's own place is further down than that.
    */
    const columns = formRef.current?.closest<HTMLElement>("[data-settings-columns]")
    const column = columns?.querySelector<HTMLElement>("[data-settings-groups]")
    const shownColumn = !!column && column.offsetHeight > 0
    const columnHeld = shownColumn ? columns!.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - (parseFloat(getComputedStyle(column!).top) || 0) : 0
    const start = still ? target : Math.min(from, target + Math.max(GLIDE_FROM_PX, Math.ceil(columnHeld)))
    /*
      THE COLUMN STAYS WHERE IT WAS HELD IN THE FRAME OF THE SWAP. It is held (sticky) inside the row it shares with the
      section, and a short section made that row too short to hold it GLIDE_FROM_PX down: the column was pushed up by
      100px in the swap's frame and came back down with the glide (scripts/check-settings20.mjs). For the length of the
      glide the section's box is at least the column's height plus the glide, then it is let go, at the top, where
      nothing in view depends on it.
    */
    glideHold.current?.()
    const box = formRef.current
    if (!held && !still && box && shownColumn) {
      /* And tall enough that the scroll can stand at `start` at all: a short section (Domains on a large screen) let it fall to the top at once. */
      box.style.minHeight = `${Math.max(column!.offsetHeight, scroller.clientHeight) + start - target}px`
      const release = () => {
        window.clearTimeout(timer)
        scroller.removeEventListener("scroll", onScroll)
        if (glideHold.current === release) glideHold.current = null
        box.style.minHeight = ""
      }
      glideHold.current = release
      const onScroll = () => {
        if (scroller.scrollTop <= target + 1) release()
      }
      const timer = window.setTimeout(release, 1500)
      scroller.addEventListener("scroll", onScroll, { passive: true })
    }
    scroller.scrollTop = start
    /*
      AND FROM THE VERY END OF A LONG SECTION, the column was pushed up to make room for the end of its row (by 104px on
      a 900px screen), and in the new section's first frame it is back at its held place: it eases there instead, over
      the glide, never in one frame.
    */
    const was = columnFrom.current
    columnFrom.current = null
    if (!still && shownColumn && was !== null && typeof column!.animate === "function") {
      const by = was - column!.getBoundingClientRect().top
      if (Math.abs(by) > 1) column!.animate([{ transform: `translateY(${by}px)` }, { transform: "translateY(0)" }], { duration: 360, easing: "cubic-bezier(0.32, 0.72, 0, 1)" })
    }
    if (!still) scroller.scrollTo({ top: target, behavior: "smooth" })
  }, [panelTab])

  /*
    A LINK TO A SECTION FROM INSIDE SETTINGS (lib/settings/sheet-links.ts):
    the sheet stops the navigation and names the section, and it opens here
    as a press in the column would, with no new history entry.
  */
  const tabChangeRef = useRef(handleTabChange)
  tabChangeRef.current = handleTabChange
  const allowedRef = useRef(allowed)
  allowedRef.current = allowed
  useEffect(() => {
    const onAsk = (e: Event) => {
      const ask = (e as CustomEvent<SettingsTabRequest>).detail
      const to = tabFromAddress(ask?.tab ?? null, ask?.section ?? null)
      if (allowedRef.current(to)) tabChangeRef.current(to)
    }
    window.addEventListener(SETTINGS_TAB_EVENT, onAsk)
    return () => window.removeEventListener(SETTINGS_TAB_EVENT, onAsk)
  }, [])

  const handleSubmit = async (e?: React.FormEvent | Event): Promise<boolean> => {
    if (e && 'preventDefault' in e) e.preventDefault()

    if (usernameError) {
      setError(usernameError)
      setShowSaveToast(true)
      return false
    }

    if (isLoading) return false // Prevent double-clicks

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
        setError(tt("This username is already taken"))
        setIsLoading(false)
        return false
      }

      /* Nor another website's address (Website Settings › Domains), which is
         a name of the same kind: <name>.storelib.com. Until the address table
         exists the question fails, and the username goes ahead as before. */
      if (cleanUsername !== profile.username) {
        const { data: handleTaken } = await supabase.rpc("website_handle_taken", { p_handle: cleanUsername })
        if (handleTaken === true) {
          setError(tt("A website already uses this name"))
          setIsLoading(false)
          return false
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
        /* Bounded: the name is saved already, and Save waited on this follow-up with no limit. */
        await fetchWithDeadline("/api/account/profile-changed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ previousName }),
        }, WAIT_MS.write).catch(() => null)
      }

      /* The time zone is the account's (lib/account/time-zone): saved on the
         server, then written where this browser's pages read it. */
      if (selectedTimezone !== initialTimezone.current) {
        const res = await fetchWithDeadline("/api/account/time-zone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeZone: selectedTimezone }),
        }, WAIT_MS.write).catch(() => null)
        const data = res ? ((await res.json().catch(() => null)) as { timeZone?: string; error?: string } | null) : null
        if (!res || !res.ok || !data?.timeZone) {
          throw new Error(data?.error || tt("Your details were saved, but the time zone was not. Try again in a moment."))
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
        return true
      }

      router.refresh()
      // Hide toast and success state after 8 seconds
      setTimeout(() => {
        setSuccess(false)
        setShowSaveToast(false)
      }, 8000)
      return !onepageWarning
    } catch (error: unknown) {
      console.error("[Settings] Save error:", error)
      const msg = error instanceof Error ? error.message : tt("An error occurred while saving. Please try again.")
      setError(msg)
      setShowSaveToast(false)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const discardChanges = () => {
    setNameDraft(null)
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

  /*
    WHAT THE SAVE BAR HOLDS IS UNSAVED FOR THE WHOLE OF SETTINGS
    (lib/settings/unsaved-guard.ts): another section, closing the sheet, a
    link out and Back all ask Save, Discard or Keep editing first
    (components/app/settings/leave-guard.tsx). The latest save and discard
    are read through refs, so the entry is only rewritten when it comes or goes.
  */
  const submitRef = useRef(handleSubmit)
  submitRef.current = handleSubmit
  const discardRef = useRef(discardChanges)
  discardRef.current = discardChanges
  useEffect(() => {
    markDirty("settings-form", hasUnsavedChanges ? { save: () => submitRef.current(), discard: () => discardRef.current() } : null)
  }, [hasUnsavedChanges])
  useEffect(() => () => markDirty("settings-form", null), [])

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
        setDeleteError(data.error || tt("Failed to send verification code"))
      }
    } catch {
      setDeleteError(tt("An error occurred. Please try again."))
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
      setDeleteError(tt("Please enter the complete verification code"))
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
        setDeleteError(data.error || tt("Invalid verification code"))
      }
    } catch {
      setDeleteError(tt("An error occurred. Please try again."))
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
        label: tt("Creator page"),
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
        label: tt("Website"),
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
          <span className="text-[14px] font-medium hidden sm:inline">{tt("Your settings are saved")}</span>
          <span className="text-[14px] font-medium sm:hidden">{tt("Settings saved")}</span>
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
        {/*
          ROOM AT THE FOOT FOR WHAT FLOATS OVER IT. On a phone the nav pill,
          and while there is something to save the save bar above it, both
          float over the end of the page: the last card used to sit under
          the bar. The room is the pill's own (--app-nav-room) plus, with the
          bar up, the bar's 48px and the 10px it floats above the pill. From
          768px there is no pill; the bar floats 16px off the bottom.
        */}
        <div
          data-settings-foot={hasUnsavedChanges ? "bar" : "pill"}
          className={`max-w-4xl lg:max-w-[1200px] mx-auto app-gutter pt-6 sm:pt-8 overflow-x-clip ${
            hasUnsavedChanges
              ? "pb-[calc(var(--app-nav-top)+10px+48px+24px)] md:pb-[calc(max(16px,env(safe-area-inset-bottom))+48px+32px)] sm:max-md:pb-[calc(var(--app-nav-top)+10px+48px+32px)] lg:pb-32"
              : "pb-[var(--app-nav-room)] md:pb-16 lg:pb-32"
          }`}
        >
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
        {/* On a phone as before the sheet: the title and the address pill on one row, centred on each other, the line under them. */}
        <div data-settings-header="" className="mb-5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:mb-6 sm:items-start sm:gap-y-0">
          <h1 className="col-start-1 row-start-1 text-[22px] font-bold leading-tight text-[#1a1a2e] sm:text-[26px]">{t("settings.title")}</h1>
          <div data-settings-pill="" className="col-start-2 row-start-1 flex min-w-0 justify-end sm:row-span-2 sm:max-w-[360px] sm:justify-self-end sm:pt-0.5">
            <ShareStorelib size="sm" className="md:hidden max-w-[min(calc((100vw-32px)*0.522),184px)] sm:max-w-[270px]" addresses={shareAddresses} platforms={sharePlatforms} />
            <ShareStorelib className="hidden md:inline-flex max-w-full" addresses={shareAddresses} platforms={sharePlatforms} />
          </div>
          <p className="col-span-2 row-start-2 text-[14px] leading-snug text-[#6b7280] sm:col-span-1 sm:col-start-1 sm:mt-1">{t("settings.subtitle")}</p>
        </div>

        {/*
          FROM 1024px, THE SECTIONS ARE A COLUMN OF GROUPS beside the one open (the owner's reference: Account, Store,
          Commerce, Integrations). Below it, the same sections are the pill row above, in the same order.
        */}
        <div data-settings-columns="" className="lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start lg:gap-12">
        {/* A plain list, not a card in the sheet: the groups' names and their sections, the open one filled. */}
        <nav aria-label={tt("Settings")} data-settings-groups="" className="sticky top-6 hidden lg:block">
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
                        onPointerEnter={() => prefetchGet(tabData(tab.id, physicalCommerce))}
                        aria-current={on ? "page" : undefined}
                        data-settings-side-tab={tab.id}
                        /*
                          THE OPEN ONE SITS A HAIR ABOVE THE COLUMN, as the row you are on does in the dashboard's
                          rail (sidebar-desktop-nav ACTIVE_DEPTH): its grey, a 1px contact shadow, a faint edge and a
                          light top lip. A press gives under the finger (98%) and springs back; the fill, the shadow
                          and the colour all ease in place, so nothing slides between rows.
                        */
                        className={`flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-3 text-left text-[14px] outline-none transition-[background-color,box-shadow,color,scale] duration-150 ease-out active:scale-[0.98] active:duration-75 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none motion-reduce:active:scale-100 [-webkit-tap-highlight-color:transparent] ${
                          on
                            ? "bg-[#e9e9eb] font-medium text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,18,27,0.08),inset_0_0_0_1px_rgba(16,18,27,0.05),inset_0_1px_0_rgba(255,255,255,0.7)] dark:bg-white/[0.10] dark:text-white dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.08)]"
                            : "font-normal text-[#4b5563] hover:bg-[#f1f1f3] hover:text-[#1a1a2e] active:bg-[#ececee] dark:text-white/70 dark:hover:bg-white/[0.06] dark:hover:text-white"
                        }`}
                        data-settings-side-on={on ? "" : undefined}
                      >
                        <Icon className={`h-4 w-4 shrink-0 transition-colors duration-150 ${on ? "text-[#1a1a2e] dark:text-white" : "text-[#9ca3af]"}`} strokeWidth={on ? 2.1 : 1.8} aria-hidden />
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
          THE PILL ROW, BELOW 1024px. Every section in its groups' order, a
          hairline between groups, held at the top of the scroll so it is
          always a thumb away. The pill is drawn at once (activeTab); the
          section follows a frame later (panelTab, useDeferredValue), so the
          press never waits on the panel it opens.
        */}
        <div
          ref={pillRowRef}
          data-settings-tabs=""
          role="tablist"
          aria-label={tt("Settings")}
          className="-mx-4 mb-5 overflow-x-auto px-4 sm:mb-6 sm:-mx-6 sm:px-6 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/*
            THE PILLS AS THEY WERE (before the sheet, the owner's reference):
            words on the page's grey, the open one on a soft grey fill with a
            hairline. Nothing slides across from the last one; nothing scales.

            THE FILL IS THE PILL'S OWN BACKGROUND (round R1). "The text hides
            and the icon flashes." The fill was a separate span laid over the
            whole pill with its opacity eased, and the icon and the words were
            lifted over it with position: relative. An element whose opacity
            is animating is put on a layer of its own, and WebKit then has to
            lift everything drawn over it onto layers too, for the length of
            the fade, and drop them again after: the words and the icon were
            painted again twice on every press, which on a phone is a frame
            with the words missing and the icon blinking. Now the pill eases
            its own background colour and its inset hairline, nothing is
            stacked over anything, and nothing is ever put on a layer. The
            words and the icon change colour with it.
          */}
          <div className="flex h-[44px] w-max items-center gap-1 p-1 sm:h-[48px]">
            {shownTabs.map((tab) => {
              const Icon = tab.icon
              const on = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => handleTabChange(tab.id)}
                  onPointerDown={() => prefetchGet(tabData(tab.id, physicalCommerce))}
                  data-settings-tab={tab.id}
                  data-settings-tab-on={on ? "" : undefined}
                  style={{ transitionDuration: `${TAB_FADE_MS}ms`, transitionTimingFunction: TAB_EASE }}
                  className={`flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-[13px] font-medium outline-none transition-[color,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none sm:px-4 sm:py-2.5 sm:text-[14px] [-webkit-tap-highlight-color:transparent] ${
                    on
                      ? "bg-[#f3f4f6] text-[#1a1a2e] shadow-[inset_0_0_0_1px_#d1d5db,0_1px_2px_rgba(0,0,0,0.04)]"
                      : "bg-[#f3f4f6]/0 text-[#6b7280] shadow-[inset_0_0_0_1px_rgba(209,213,219,0),0_1px_2px_rgba(0,0,0,0)] active:bg-[#f3f4f6]/70"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{labelOf(tab.id)}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/*
          Tab Content. NOT A <form> (round R1). It was one form around every
          section, so a panel's own form was a form inside a form: AI Memory's
          Remember submitted this one too (a submit bubbles through React to
          every form above it), which saved the profile and refreshed the
          route, and the sheet closed under the person typing. Any button a
          panel left without a type did the same. The save bar calls
          handleSubmit itself; nothing here submits by accident.
        */}
        <div ref={formRef} data-settings-content="">
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
                  <p className="text-[14px] font-medium text-[#1a1a2e]">{tt("We could not load your billing.")}</p>
                  <p className="mt-1 text-[13px] text-[#6b7280]">
                    {tt("Nothing has changed on your account. This is a problem reading it.")}
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadBilling()}
                    className="mt-3 h-9 px-4 text-[13px] font-semibold text-white bg-[#1a1a2e] rounded-lg"
                  >
                    {tt("Try again")}
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
                    <span className="text-[13.5px]">{tt("Checking your plan and invoices")}</span>
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
                      <span className="sm:hidden">{tt("Set up Storelib Payments")}</span>
                      <span className="hidden sm:inline">{tt("Set up Storelib Payments to accept sales and receive payouts.")}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTabChange("payments")}
                    className="shrink-0 h-9 px-5 text-[13px] font-semibold text-[#1a1a2e] bg-white rounded-lg hover:bg-[#f3f4f6] transition-colors shadow-sm cursor-pointer"
                  >
                    {tt("Set up")}
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
                  name={`${firstName} ${lastName}`.trim() || username || tt("You")}
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
                      {tt("Username")}
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
                      <p className="text-[12px] text-[#9ca3af]">{tt("The address of your creator page and your OnePage")}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="firstName" className="text-[13px] font-medium text-[#374151]">
                      {tt("Name")}
                    </Label>
                    {/*
                      WHAT IS TYPED IS WHAT IS SHOWN. The field showed first and
                      last name joined back together, so the space typed after
                      "Mara" was split off and dropped before the next key: a
                      two word name could only be pasted. It shows the typing
                      itself now, and the halves are worked out from it.
                    */}
                    <Input
                      id="firstName"
                      value={nameDraft ?? fullNameForUsernameInput}
                      onChange={(e) => {
                        const value = e.target.value
                        setNameDraft(value)
                        const [first = "", ...rest] = value.trim().split(/\s+/)
                        setFirstName(first)
                        setLastName(rest.join(" "))
                      }}
                      onBlur={() => setNameDraft(null)}
                      placeholder={tt("Your name or your brand's")}
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                    <p className="text-[12px] text-[#9ca3af]">{tt("Shown on your pages and on receipts")}</p>
                  </div>
                </div>
                <div className="mt-5">
                  <p className="mb-2 text-[13px] font-medium text-[#374151]">{tt("Your addresses")}</p>
                  <AddressList username={username} website={website} websiteDomain={websiteDomain} />
                </div>
              </div>

              {/* Emails Card - Email + Support Email */}
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">
                  {tt("Emails")}
                </h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-[13px] font-medium text-[#374151]">
                      {tt("Email")}
                    </Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input id="email" value={currentEmail} disabled className="h-11 bg-[#f9fafb] border-[#e5e7eb] rounded-xl text-[14px] pr-24" />
                        {emailVerified && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            {tt("Verified")}
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
                        {tt("Change")}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="supportEmailProfile" className="text-[13px] font-medium text-[#374151]">
                      {tt("Support Email")}
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
                      <p className="text-[12px] text-[#9ca3af]">{tt("Shown to customers on receipts")}</p>
                      {/* On the body, kept inside the screen, wrapping (components/ui/tooltip): it was clipped at "customer receip". */}
                      <InfoTip label={tt("About the support email")}>
                        {tt("This email appears on customer receipts and order confirmations. Customers write to it for support.")}
                      </InfoTip>
                    </div>
                  </div>
                </div>
              </div>

              {/* Language Card */}
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">
                  {tt("Language")}
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">{tt("The language of your dashboard")}</p>
                {/* A popover with a search on a computer, the shared sheet on a phone (components/ui/choice-list). */}
                <ChoicePicker
                  name="language"
                  title={tt("Language")}
                  choices={appLanguageChoices}
                  value={selectedLanguage}
                  onChange={(code) => setSelectedLanguage(code as LanguageCode)}
                  placeholder={tt("Search languages")}
                  fieldLabel={appLanguageName(selectedLanguage)}
                />
              </div>

              {/* Timezone Card */}
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-1">
                  {tt("Time zone")}
                </h3>
                <p className="text-[13px] text-[#6b7280] mb-4">{tt("Your days and times in Home, Orders, Analytics, Emails and Payouts, and in the sale emails we send you")}</p>
                {/* Saved to the account and followed by the server too (lib/account/time-zone). */}
                <TimeZonePicker value={selectedTimezone} onChange={setSelectedTimezone} />
              </div>

              {/* Address Card */}
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">
                  {tt("Address")}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="addressLine1" className="text-[13px] font-medium text-[#374151]">
                      {tt("Address Line 1")}
                    </Label>
                    <Input
                      id="addressLine1"
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      placeholder={tt("Street address")}
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="addressLine2" className="text-[13px] font-medium text-[#374151]">
                      {tt("Address Line 2")}
                    </Label>
                    <Input
                      id="addressLine2"
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      placeholder={tt("Apt, suite, etc. (optional)")}
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="city" className="text-[13px] font-medium text-[#374151]">
                      {tt("City")}
                    </Label>
                    <Input
                      id="city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder={tt("City")}
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="state" className="text-[13px] font-medium text-[#374151]">
                      {tt("State / Province")}
                    </Label>
                    <Input
                      id="state"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder={tt("State")}
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="postalCode" className="text-[13px] font-medium text-[#374151]">
                      {tt("Postal Code")}
                    </Label>
                    <Input
                      id="postalCode"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder={tt("Postal code")}
                      className="h-11 border-[#e5e7eb] rounded-xl text-[14px] focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="country" className="text-[13px] font-medium text-[#374151]">
                      {tt("Country")}
                    </Label>
                    {/* The Language and Time zone field: a popover on a computer, the shared sheet on a phone, every country with its flag. */}
                    <CountryPicker id="country" value={country} onChange={setCountry} />
                  </div>
                </div>
              </div>

              {/* Resources Card */}
              <div className="bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]">
                <h3 className="text-[15px] font-semibold text-[#1a1a2e] mb-4">{tt("Resources")}</h3>
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
                      <span className="text-[14px] text-[#374151]">{tt("Change log")}</span>
                    </div>
                    <button type="button" className="px-3 py-1.5 text-[13px] font-medium border border-[#e5e7eb] rounded-lg hover:bg-[#f3f4f6] transition-colors cursor-pointer">
                      {tt("View change log")}
                    </button>
                  </a>
                  <button
                    type="button"
                    onClick={() => { handleTabChange("domains"); window.scrollTo({ top: 0, behavior: "smooth" }) }}
                    className="w-full flex items-center justify-between p-4 hover:bg-[#f9fafb] transition-colors cursor-pointer border-b border-[#e5e7eb]"
                  >
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-[#6b7280]" />
                      <span className="text-[14px] text-[#374151]">{tt("Custom Domain")}</span>
                    </div>
                    <span className="px-3 py-1.5 text-[13px] font-medium border border-[#e5e7eb] rounded-lg hover:bg-[#f3f4f6] transition-colors">
                      {tt("Set up domain")}
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
                      <span className="text-[14px] text-[#374151]">{tt("Storelib Help Center")}</span>
                    </div>
                    <button type="button" className="px-3 py-1.5 text-[13px] font-medium border border-[#e5e7eb] rounded-lg hover:bg-[#f3f4f6] transition-colors cursor-pointer">
                      {tt("Get help")}
                    </button>
                  </a>
                  {/* A request to Storelib, answered by a person (app/app/support, lib/support). */}
                  <SmartLink href="/app/support" className="flex items-center justify-between p-4 hover:bg-[#f9fafb] transition-colors" data-settings-support="">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-[#6b7280]" />
                      <span className="text-[14px] text-[#374151]">{tt("Contact Storelib support")}</span>
                    </div>
                    <span className="px-3 py-1.5 text-[13px] font-medium border border-[#e5e7eb] rounded-lg hover:bg-[#f3f4f6] transition-colors">
                      {tt("Open a request")}
                    </span>
                  </SmartLink>
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
                    <p className="font-semibold text-[#1a1a2e] text-[15px]">{tt("Log out")}</p>
                    <p className="text-[13px] text-[#6b7280]">{tt("Sign out of Storelib on this device.")}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="shrink-0 inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-[#374151] border border-[#e5e7eb] rounded-lg hover:bg-[#f9fafb] transition-colors cursor-pointer"
                  >
                    <LogOut className="h-4 w-4 text-[#6b7280]" />
                    {tt("Log out")}
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
          {panelTab === "markets" && <MarketsPanel />}
          {panelTab === "channels" && <ChannelsPanel />}
          {panelTab === "emails" && <CustomerEmailsPanel />}
          {panelTab === "activity" && <ActivityPanel />}
          {panelTab === "team" && <TeamPanel />}
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
                    <Label htmlFor="statement-descriptor" className="text-[13px] font-medium text-[#374151]">{tt("Name on bank statements")}</Label>
                    <InfoTip label={tt("About statement descriptor")}>
                      {tt("This text appears on your customer's bank statement to identify who charged them.")}
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
                      <p className="text-[12px] text-[#6b7280]">{tt("How a sale reads in your buyer's bank app")}</p>
                    </div>
                  </div>
                  <p className="text-[12px] text-[#9ca3af]">{tt("Letters, numbers and spaces. Up to")} {STATEMENT_NAME_MAX} {tt("characters.")}</p>
                </div>
              </div>

              {showCurrencyPicker && !isMobileViewport && createPortal(
                /* On the body, so Settings' own layer (under the app's header below 1024px) does not hold it under the header. */
                <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={() => setShowCurrencyPicker(false)}>
                  <div className="w-full max-w-[420px] rounded-2xl bg-white border border-[#e5e7eb] p-4 sm:p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <h4 className="text-[16px] font-semibold text-[#1a1a2e] mb-1">{tt("Select payout currency")}</h4>
                    <p className="text-[12px] text-[#6b7280] mb-3">{tt("Choose your payout settlement currency.")}</p>
                    <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
                      {(["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "SEK", "NOK", "NZD"] as const).map((currency) => (
                        <button key={currency} type="button" onClick={() => { setPayoutCurrency(currency); setShowCurrencyPicker(false) }} className={`w-full text-left px-3 py-3 rounded-xl text-[14px] font-medium transition-colors flex items-center justify-between cursor-pointer ${payoutCurrency === currency ? "bg-[#f5f3ff] text-[#8b5cf6]" : "text-[#374151] hover:bg-[#f3f4f6]"}`}>
                          {currency}
                          {payoutCurrency === currency && <Check className="h-4 w-4" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>,
                document.body,
              )}

              <MobileBottomSheet
                isOpen={showCurrencyPicker && isMobileViewport}
                onClose={() => setShowCurrencyPicker(false)}
                title={tt("Select payout currency")}
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
        </div>
        </div>
        </div>
      </div>
      <SettingsLeaveGuard />

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
        const discard = discardChanges
        return (
      <div
        data-settings-save-bar={barUp ? "up" : "down"}
        aria-hidden={!barUp || undefined}
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 md:left-[var(--app-rail-w,240px)] md:px-6 bottom-[calc(var(--app-nav-top)+10px)] md:bottom-[max(16px,env(safe-area-inset-bottom))]"
      >
        <div
          role="region"
          aria-label={tt("Unsaved changes")}
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
            {isLoading ? tt("Saving") : t("settings.save")}
          </button>
        </div>
      </div>
        )
      })()}

      {/* Email Change Modal: a code to each address (account-panels.tsx) */}
      <MobileBottomSheet isOpen={showEmailChangeModal} onClose={closeEmailChangeModal} title={tt("Change email")}>
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
        title={deleteStep === "confirm" ? tt("Delete Account") : tt("Verify Deletion")}
      >
        {deleteStep === "confirm" ? (
          <div className="space-y-4">
            <div className="bg-[#1a1a2e] rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-[#2d2d44] rounded-full flex items-center justify-center shrink-0">
                  <Trash2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-white text-[14px]">{tt("This action cannot be undone")}</p>
                  {/*
                    What goes, in one sentence, the way it always read. The
                    last clause appears only on a login that has other stores
                    (they are accounts of this one and cannot be signed into
                    without it, so they go with it: app/api/auth/delete-
                    account). It is part of the list of what is removed, not
                    a feature being explained.
                  */}
                  <p className="text-[13px] text-[#9ca3af] mt-1">
                    {tt("Your store, products, customers and details are removed. People who bought from you keep what they bought, and your sales and payout records are kept.")}
                    {otherStores > 0 &&
                      (otherStores === 1
                        ? tt(" The other store on this login goes with it.")
                        : tt(" The other {count} stores on this login go with it.", { count: countWord(otherStores) }))}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-[13px] text-[#6b7280]">
              <Rich text={tt("We'll send a verification code to {email} to confirm this action.")} parts={{ email: <span className="font-medium text-[#1a1a2e]">{currentEmail}</span> }} />
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
                {tt("Cancel")}
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
                    {tt("Sending...")}
                  </>
                ) : (
                  tt("Send Code")
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[13px] text-[#6b7280]">
              {tt("Enter the 6-digit code we sent to")} <span className="font-medium text-[#1a1a2e]">{currentEmail}</span>
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
                  {tt("Deleting...")}
                </>
              ) : (
                tt("Permanently Delete Account")
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
              {tt("Go back")}
            </button>
          </div>
        )}
      </MobileBottomSheet>
    </div>
    </>
  )
}
