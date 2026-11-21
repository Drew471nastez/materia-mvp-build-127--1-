"use client"

/**
 * ===========================================================================
 *  AN INTEGRATION'S OWN PAGE (round K4)
 * ===========================================================================
 * One shell for every integration in the marketplace
 * (./integrations-directory.tsx opens it at ?integration=<id>):
 *
 *   THE HEADER     a soft banner tinted by the integration's own colour (its
 *                  brand's, Storelib's tile tint, or its category's), the mark
 *                  on a white tile over it, the name, what it does, its
 *                  category and where it stands, and the actions: Install,
 *                  Connect or Turn on before; Installed, Settings and
 *                  Disconnect (with a confirm) after. On a phone the actions
 *                  are full width under the name.
 *   THE BODY       Set up (a few plain steps, then the integration's own panel,
 *                  exactly the one it had: GA's live check, Klaviyo's sync,
 *                  Printful's key, Reviews' settings), Status, What it does,
 *                  Your data, and Disconnect at the foot; At a glance beside
 *                  them from 1024px.
 *   AN APP'S TABS  a Storelib app with more to manage plugs its own tabs and
 *                  body in (./integration-apps.tsx, the API is documented
 *                  there). The tab is kept in the address (?view=).
 *
 * Every action calls the same route the integration's panel does
 * (lib/integrations/detail-actions.ts), and nothing on the page needs the
 * assistant.
 */
import * as React from "react"
import { useSearchParams } from "next/navigation"
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, ExternalLink, Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Field, Modal, Notice, TextInput, api, dateTime, peekGet, readFresh } from "@/components/physical/ui"
import { copyText } from "@/lib/platform/copy-text"
import { IntegrationCard, type IntegrationState } from "@/components/physical/integrations-marketplace"
import { Mark, hasBuiltInArt, tileColor } from "@/components/app/settings/integration-mark"
import { AnalyticsDestinationsPanel } from "@/components/app/analytics/send-analytics"
import { CATEGORY_NAMES, type Integration, type IntegrationCategory, type IntegrationStatus } from "@/lib/integrations/catalog"
import { providerInfo } from "@/lib/physical/providers"
import { TRACKERS, type Tracking } from "@/lib/store/tracking"
import { ReviewsAppPanel } from "@/components/app/settings/reviews-app-panel"
import { TrackingAppPanel } from "@/components/app/settings/tracking-app-panel"
import { GaConnect } from "@/components/app/settings/ga-connect"
import { MarketingSyncPanel, type MarketingState } from "@/components/app/settings/marketing-sync-panel"
import { CommunityAccessPanel } from "@/components/app/settings/community-access-panel"
import { EXTERNAL_BOOKINGS_PATH, installVerb, oneTapInstall, removalPlan, setupSteps, type ActionCall } from "@/lib/integrations/detail-actions"
import { ExternalBookingPanel, reloadExternalConnections } from "@/components/bookings/external-bookings"
import { integrationAppView, tabFor } from "@/components/app/settings/integration-apps"
import { tt } from "@/lib/i18n/text"
import { PageIntegrationsSection, reloadPageIntegrations } from "@/components/onepage/page-integrations"
import { isPageIntegration } from "@/lib/onepage/integrations/catalog"

/*
  A CARD, AS EVERY /app CARD ON A PHONE (the mobile pass, the owner: "more
  native, iOS, clean, Shopify like"). On a phone a grouped white card on the
  page's grey, with the /app hairline and contact shadow and its sides from
  --app-card-x, so the page reads as one settings screen with Products and
  Coupons. From 640px it keeps a little depth: the hairline, a contact shadow
  and a soft one under it.
*/
const DEPTH = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:border-[#e5e7eb]/70 sm:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-14px_rgba(16,24,40,0.14)]"
const PAD = "app-card-x py-4 sm:py-5"
const SECTION_HEAD = "border-b border-[#f1f2f4] app-card-x py-3.5"
const H3 = "text-[15px] font-semibold text-[#1a1a2e]"
/* One row of a grouped list (Status, At a glance): 44px a row on a phone, as a settings screen's rows are; the rows' own rhythm from 640px. */
const ROW = "flex min-h-11 items-center justify-between gap-4 py-2 sm:min-h-0 sm:items-baseline"
/*
  A PHONE'S PRESSES INSIDE A PANEL. The panels in the setup card are shared
  (GA's check, a provider's key, Klaviyo's sync) and draw 40px buttons, the
  computer's size. Inside this page, on a phone, each is 44px, the same as
  the page's own; their 40px stays wherever else they are drawn.
*/
const PANEL_PRESS = "max-sm:[&_:is(button,a).h-10]:h-11 max-sm:[&_:is(button,a).h-9]:h-11"
/* A small press that keeps its look and gets a 44px target around it (the following bar's buttons, where a taller one would move the bar). */
const HIT = "relative after:absolute after:-inset-1 after:content-['']"

/*
  THE BANNER'S COLOUR. The service's own brand colour where it is known (its
  logo's main colour), Storelib's tile tint for Storelib's own, and a quiet
  tint per category for the rest. Never a photo, never purple (CLAUDE.md).
*/
const BRAND: Record<string, string> = {
  "google-analytics": "#f9ab00",
  "google-tag-manager": "#4285f4",
  "google-ads": "#4285f4",
  "meta-pixel": "#0866ff",
  "tiktok-pixel": "#25f4ee",
  "pinterest-tag": "#e60023",
  "microsoft-clarity": "#0078d4",
  klaviyo: "#232426",
  omnisend: "#1d1d1d",
  aftership: "#ff6b2b",
  printful: "#2c2c2c",
  printify: "#39b75d",
  gelato: "#0b2e4e",
  "cj-dropshipping": "#f25c05",
  shipstation: "#84c225",
  shippo: "#1fa463",
  easypost: "#2d5bff",
  mailchimp: "#ffe01b",
  brevo: "#0b996e",
  zapier: "#ff4f00",
  discord: "#5865f2",
  telegram: "#26a5e4",
  hotjar: "#ff3c00",
  "snapchat-pixel": "#fffc00",
  "reddit-pixel": "#ff4500",
}
const CATEGORY_TINT: Record<IntegrationCategory, string> = {
  reviews: "#f2607a",
  scheduling: "#3d84f5",
  analytics: "#f5a524",
  advertising: "#3d84f5",
  email: "#e2557a",
  automation: "#f08a24",
  community: "#5865f2",
  shipping: "#3d84f5",
  print_on_demand: "#1fa971",
  dropshipping: "#0f9fb5",
  fulfillment: "#1fa971",
  suppliers: "#64748b",
}

export function bannerColor(item: Pick<Integration, "id" | "category">): string {
  return tileColor(item.id) ?? BRAND[item.id] ?? CATEGORY_TINT[item.category] ?? "#64748b"
}

/** A wash of the colour, strongest at the top left and fading into the page's grey: there, never loud. */
export function bannerStyle(color: string): React.CSSProperties {
  return {
    backgroundColor: "#f6f7f9",
    backgroundImage: `radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, ${color} 30%, transparent) 0%, transparent 60%), radial-gradient(90% 120% at 100% 0%, color-mix(in srgb, ${color} 14%, transparent) 0%, transparent 70%), linear-gradient(180deg, color-mix(in srgb, ${color} 10%, #f6f7f9), #f6f7f9)`,
  }
}

type Tone = "gray" | "green" | "amber" | "red"
const STANDING: Record<IntegrationStatus, { tone: Tone; label: string; line: string }> = {
  built_in: { tone: "gray", get label() { return tt("Built into Storelib") }, get line() { return tt("Ready to use. Nothing to connect.") } },
  installed: { tone: "green", get label() { return tt("Connected") }, get line() { return tt("Working on your store.") } },
  needs_attention: { tone: "amber", get label() { return tt("Needs attention") }, get line() { return tt("Connected, but the last try didn't go through.") } },
  error: { tone: "red", get label() { return tt("Not working") }, get line() { return tt("Check its settings below.") } },
  coming_soon: { tone: "gray", get label() { return tt("Coming soon") }, get line() { return tt("Not available to connect yet.") } },
  available: { tone: "gray", get label() { return tt("Not connected") }, get line() { return tt("Set it up below in a minute.") } },
}
const DOT: Record<Tone, string> = { gray: "bg-[#9ca3af]", green: "bg-[#12b76a]", amber: "bg-[#f79009]", red: "bg-[#f04438]" }

function reduced(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/** The open tab, in the address in place (no new history entry), so Back from the page and a link keep it. */
function writeViewParam(id: string | null) {
  try {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("view", id)
    else url.searchParams.delete("view")
    if (url.href === window.location.href) return
    window.history.replaceState(window.history.state, "", url.toString())
  } catch {
    /* An address that can't be written: the tab still changes. */
  }
}

export interface IntegrationDetailProps {
  item: Integration
  status: IntegrationStatus
  installed: boolean
  tracking: Tracking | null
  trackingReady: boolean
  states: IntegrationState[] | null
  marketing: MarketingState[] | null
  onTracking: (t: Tracking) => void
  onStates: (s: IntegrationState[]) => void
  onApp: (appId: string, on: boolean) => void
  onMarketing: (m: MarketingState[]) => void
  /** Back to the list. Left out where the page is a place of its own (/app/reviews): no back link is drawn. */
  onBack?: () => void
  /** The page scrolls on its own (/app/integrations, /app/reviews): its action follows in a bar at the top once the header's is scrolled away. */
  pin?: boolean
}

function Layout({ main, aside }: { main: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className={cn("grid gap-4 sm:gap-5", aside ? "lg:grid-cols-[minmax(0,1fr)_300px]" : null)} data-integration-body="">
      <div className="min-w-0 space-y-4 sm:space-y-5">{main}</div>
      {aside}
    </div>
  )
}

export function IntegrationDetail({ item, status, installed, tracking, trackingReady, states, marketing, onTracking, onStates, onApp, onMarketing, onBack, pin = false }: IntegrationDetailProps) {
  const setupRef = React.useRef<HTMLElement>(null)
  const standing = STANDING[status]
  const params = useSearchParams()
  const view = integrationAppView(item.id)
  const wantedTab = params?.get("view") ?? null
  const [tab, setTabState] = React.useState(() => (view ? tabFor(view, wantedTab) : ""))
  /* Back and Forward, or a link to another tab, while the page is open. */
  React.useEffect(() => {
    if (view) setTabState(tabFor(view, wantedTab))
  }, [view, wantedTab])
  /*
    A TAB CHANGES IN PLACE (round 27, the owner: moving between Overview,
    Reviews, Requests... must feel smooth). The tab is marked on the press,
    in the same frame. The page under the tabs is held at the height it had
    until the next one is in, then eased to its own only as far as the page
    can go without moving: a shorter tab used to clamp the scroll and pull
    the tabs down the screen. The room left goes as the page is scrolled
    back up, below the screen's edge, where nothing is seen to move.
  */
  const panelRef = React.useRef<HTMLDivElement>(null)
  const tabNow = React.useRef(tab)
  tabNow.current = tab
  const heldAt = React.useRef<number | null>(null)
  const roomOff = React.useRef<(() => void) | null>(null)
  React.useEffect(() => () => roomOff.current?.(), [])
  const setTab = React.useCallback(
    (id: string) => {
      if (!view) return
      const panel = panelRef.current
      if (id !== tabNow.current && panel) {
        roomOff.current?.()
        heldAt.current = panel.getBoundingClientRect().height
        panel.style.minHeight = `${heldAt.current}px`
      }
      setTabState(id)
      writeViewParam(id === tabFor(view, null) ? null : id)
    },
    [view],
  )
  React.useLayoutEffect(() => {
    const panel = panelRef.current
    const was = heldAt.current
    heldAt.current = null
    if (!panel || was === null) return
    const box = panel.closest<HTMLElement>("[data-integrations-scroll], [data-settings-sheet-scroll], .app-content-scroll")
    /* The new tab's own height, read off what is in the panel, so the panel itself never has to be let go to measure it. */
    const natural = () => [...panel.children].reduce((h, c) => h + c.getBoundingClientRect().height, 0)
    /* The least the panel can be with the page staying where it is scrolled: its foot at the screen's. */
    const fit = () => {
      const own = natural()
      const needed = box ? box.scrollTop + box.clientHeight - (box.scrollHeight - panel.getBoundingClientRect().height) : 0
      const keep = Math.min(was, Math.max(own, needed))
      if (keep <= own + 0.5) {
        panel.style.minHeight = ""
        return false
      }
      panel.style.minHeight = `${keep}px`
      return true
    }
    if (!box || !fit()) {
      panel.style.minHeight = ""
      return
    }
    const onScroll = () => {
      if (!fit()) roomOff.current?.()
    }
    box.addEventListener("scroll", onScroll, { passive: true })
    roomOff.current = () => {
      box.removeEventListener("scroll", onScroll)
      panel.style.minHeight = ""
      roomOff.current = null
    }
  }, [tab])
  /* The tab a pointer or a finger is on, or the keyboard is at: its page is readied before the press lands. */
  const [warmTab, setWarmTab] = React.useState<string | null>(null)
  const warm = (id: string) => {
    if (id !== tab && id !== warmTab) React.startTransition(() => setWarmTab(id))
  }

  /* Nothing to connect yet: a listed service, a provider marked Coming soon, or one paused from /admin. */
  const notifyOnly = item.kind === "listed" || (item.kind === "commerce" && !!item.comingSoon) || (!!item.paused && !installed)
  const providerState = item.providerId ? (states?.find((s) => s.provider === item.providerId) ?? null) : null
  const marketingState = item.kind === "tracker" ? (marketing?.find((m) => m.provider === item.trackerId) ?? null) : item.appId === "marketing_sync" ? (marketing?.find((m) => m.provider === item.marketingProvider) ?? null) : null
  const tracked = item.kind === "tracker" && item.trackerId ? (tracking?.[item.trackerId] ?? null) : null
  const plan = notifyOnly ? null : removalPlan(item, { installed, marketingConnected: !!marketingState?.connected, trackerSaved: !!tracked })
  const verb = notifyOnly || installed ? null : installVerb(item)
  /* The page has one thing to do (Connect, Install, Turn on, Tell me when it's ready), and it follows in a bar once scrolled away. */
  const pinnable = pin && (notifyOnly || !!verb)
  /* A bar wherever the page has a Back to integrations, or an action to follow (round Y2). */
  const barOn = !!onBack || pinnable
  const steps = installed || notifyOnly ? [] : setupSteps(item)
  /*
    THE STEPS, WITH WHAT TO COPY (round 42). Each step says where it stands:
    the one to do now, the ones after it, and a tick once the integration is
    connected. A value the other service asks for (the webhook address
    Gelato or AfterShip sends updates to) is in the step that needs it, with
    its own Copy, read off what the page already has; it is never made up.
  */
  const ownTrackingHook = item.id === "aftership" ? (peekGet<{ tracking?: { own?: { provider?: string; webhookUrl?: string | null } | null } }>("/api/store/tracking-app")?.tracking?.own ?? null) : null
  const shownSteps: SetupStep[] = steps.map((text, i) => ({
    text,
    copy: item.id === "aftership" && i === 1 && ownTrackingHook?.provider === "aftership" && ownTrackingHook.webhookUrl ? { label: tt("Webhook address"), value: ownTrackingHook.webhookUrl } : null,
  }))
  if (item.id === "gelato" && providerState?.webhookAddress && providerState.webhooks !== "on")
    shownSteps.push({ text: tt("In Gelato, Developer › Webhooks, add this address for order status and tracking updates."), copy: { label: tt("Webhook address"), value: providerState.webhookAddress } })
  /* The header's Tell me when it's ready sends the request itself. */
  const [askTick, setAskTick] = React.useState(0)
  /* A header action changed what a panel shows: the panel is drawn again from the fresh read. */
  const [panelKey, setPanelKey] = React.useState(0)
  const [confirming, setConfirming] = React.useState(false)
  /* Round 41: the setup steps and the details (what it does, your data, at a glance) open on top of the page, not under it. */
  const [howTo, setHowTo] = React.useState(false)
  const [details, setDetails] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [notice, setNotice] = React.useState<{ tone: "green" | "red"; text: string } | null>(null)
  React.useEffect(() => setNotice(null), [item.id])

  const toSetup = () => {
    const go = () => {
      const el = setupRef.current
      if (!el) return
      el.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" })
      window.setTimeout(() => el.querySelector<HTMLElement>("input, textarea, select, button")?.focus({ preventScroll: true }), reduced() ? 0 : 420)
    }
    /* An app with its own tabs: the Settings tab first, then its panel. */
    if (view && view.tabs().some((t) => t.id === "settings") && tab !== "settings") {
      setTab("settings")
      window.requestAnimationFrame(() => window.requestAnimationFrame(go))
    } else go()
  }

  /** One request from the header, and what it changes on the page. */
  const send = async (call: ActionCall): Promise<string | null> => {
    const r = await api<{ tracking?: Tracking; marketing?: MarketingState[]; integrations?: IntegrationState[] }>(call.path, { method: call.method, body: call.body })
    if (!r.ok) return ("error" in r ? r.error : "")
    if (call.path === "/api/store/reviews-app") onApp("storelib_reviews", call.body.enabled === true)
    else if (call.path === "/api/store/tracking-app") onApp("courier_tracking", false)
    else if (call.path === EXTERNAL_BOOKINGS_PATH && item.bookingProvider) {
      onApp(`booking_sync:${item.bookingProvider}`, false)
      void reloadExternalConnections()
    }
    else if (call.path === "/api/store/integrations" && r.data.tracking) onTracking(r.data.tracking)
    else if (call.path.startsWith("/api/store/integrations/marketing") && r.data.marketing) onMarketing(r.data.marketing)
    else if (call.path.startsWith("/api/physical/integrations") && r.data.integrations) onStates(r.data.integrations)
    return null
  }

  /* Turn on in one press (Storelib Reviews): on at once, back off if the server says no. */
  const turnOn = async () => {
    const call = oneTapInstall(item)
    if (!call || busy) return
    setBusy(true)
    setNotice(null)
    if (item.appId) onApp(item.appId, true)
    const error = await send(call)
    if (error) {
      if (item.appId) onApp(item.appId, false)
      setNotice({ tone: "red", text: error })
    } else {
      await readFresh("/api/store/reviews-app")
      setPanelKey((k) => k + 1)
      setNotice({ tone: "green", text: tt("{name} is on.", { name: item.name }) })
    }
    setBusy(false)
  }

  const takeOff = async () => {
    if (!plan || busy) return
    setBusy(true)
    setNotice(null)
    for (const call of plan.calls) {
      const error = await send(call)
      if (error) {
        setBusy(false)
        setConfirming(false)
        setNotice({ tone: "red", text: error })
        return
      }
    }
    await readFresh(plan.refresh)
    /* The OnePage's own connections are read once for both screens (components/onepage/page-integrations): asked again, so the card and the editor say the same. */
    if (item.appId === "onepage_signups") await reloadPageIntegrations()
    setPanelKey((k) => k + 1)
    setBusy(false)
    setConfirming(false)
    setNotice({ tone: "green", text: plan.verb === "turn_off" ? tt("{name} is off.", { name: item.name }) : plan.verb === "remove" ? tt("{name} is removed from your website.", { name: item.name }) : tt("{name} is disconnected.", { name: item.name }) })
  }

  const verbLabel = plan ? (plan.verb === "turn_off" ? tt("Turn off") : plan.verb === "remove" ? tt("Remove") : tt("Disconnect")) : ""
  const storelibMade = hasBuiltInArt(item.id)
  const Title = pin ? "h1" : "h2"
  const standingNote = tracked && item.trackerId ? `${TRACKERS[item.trackerId].label}: ${tracked}` : status === "needs_attention" || status === "error" ? standing.line : null

  /* ---- the sections, each ready to place (an app's tabs place them too) ---- */
  const panel = notifyOnly ? (
    <div className="space-y-4">
      {/* Round 41: Mailchimp, Brevo, Zapier and Make already take a OnePage's signups: connected here as on the OnePage's own Settings. */}
      {isPageIntegration(item.id) ? <PageIntegrationsSection only={[item.id]} /> : null}
      <NotifyMe item={item} askTick={askTick} />
      {/* A key saved before this was marked Coming soon: shown, so it can be removed. */}
      {item.kind === "commerce" && item.providerId && providerInfo(item.providerId) && providerState && providerState.status !== "disconnected" ? (
        <ul className="border-t border-[#f1f2f4] pt-4 [&>li]:border-0 [&>li]:bg-transparent [&>li]:p-0 [&>li]:shadow-none">
          <IntegrationCard provider={providerInfo(item.providerId)!} state={providerState} loading={false} onSaved={onStates} />
        </ul>
      ) : null}
    </div>
  ) : item.kind === "app" && item.appId === "storelib_reviews" ? (
    <ReviewsAppPanel onChanged={(st) => onApp("storelib_reviews", st.enabled)} />
  ) : item.kind === "app" && item.appId === "marketing_sync" && item.marketingProvider ? (
    /* Brevo, MailerLite and Kit: the same sync card as Emails › Platforms. */
    <MarketingSyncPanel provider={item.marketingProvider} onChanged={onMarketing} />
  ) : item.kind === "app" && (item.appId === "discord_roles" || item.appId === "telegram_access") ? (
    /* Storelib's own bots: connect, map products to a role or a chat, and each member's access (lib/community-roles). */
    <CommunityAccessPanel provider={item.appId === "discord_roles" ? "discord" : "telegram"} onChanged={(on) => onApp(item.appId!, on)} />
  ) : item.kind === "app" && item.appId === "booking_sync" && item.bookingProvider ? (
    /* Calendly and Cal.com: the same panel as the OnePage editor's (components/bookings/external-bookings). */
    <ExternalBookingPanel provider={item.bookingProvider} onChanged={(on) => onApp(`booking_sync:${item.bookingProvider}`, on)} />
  ) : item.kind === "app" && item.appId === "onepage_signups" && item.pageIntegration ? (
    /* Mailchimp, Zapier and Make: connected here with the same card, the same API and the same read as the OnePage editor's Settings › Integrations. */
    <PageIntegrationsSection only={[item.pageIntegration]} />
  ) : item.kind === "app" && item.appId === "courier_tracking" ? (
    <TrackingAppPanel onChanged={(own) => onApp("courier_tracking", own)} />
  ) : item.kind === "app" && item.appId === "analytics_destinations" ? (
    /* The same list as Analytics › Send to (components/app/analytics/send-analytics). */
    <AnalyticsDestinationsPanel onConnectedChange={(on) => onApp("analytics_destinations", on)} />
  ) : item.kind === "tracker" && item.trackerId === "ga4" ? (
    /* Google Analytics: pasted, checked with a live hit, then "Receiving data" with the last event's time. */
    <GaConnect value={tracking?.ga4 ?? null} ready={trackingReady} onSaved={onTracking} />
  ) : item.kind === "tracker" && item.trackerId ? (
    <TrackerInstall item={item} value={tracking?.[item.trackerId] ?? null} label={item.trackerId === "google_ads" ? (tracking?.google_ads_label ?? null) : undefined} ready={trackingReady} onSaved={onTracking} />
  ) : item.providerId && providerInfo(item.providerId) ? (
    <ul className="[&>li]:border-0 [&>li]:bg-transparent [&>li]:p-0 [&>li]:shadow-none">
      <IntegrationCard provider={providerInfo(item.providerId)!} state={providerState} loading={states === null} onSaved={onStates} startOpen={!item.builtIn && !installed} />
    </ul>
  ) : null

  const setup = (
    <>
      <section ref={setupRef} className={cn(DEPTH, "scroll-mt-4 overflow-hidden", PANEL_PRESS)} aria-labelledby="integration-install" data-integration-install="">
        <div className={SECTION_HEAD}>
          <h3 id="integration-install" className={H3}>{notifyOnly ? tt("Get notified") : installed ? tt("Settings") : tt("Set up")}</h3>
        </div>
        <div className={PAD}>
          <div key={panelKey}>{panel}</div>
        </div>
        {steps.length > 0 ? (
          /*
            THE WAY TO THE STEPS (round 42, round 43): the card's own last row,
            under a hairline, the whole width a target (48px on a phone, 44px
            on a computer), saying how many steps there are.
          */
          <button
            type="button"
            onClick={() => setHowTo(true)}
            className="group flex h-12 w-full items-center gap-3 border-t border-[#f1f2f4] app-card-x text-left outline-none transition-colors duration-150 hover:bg-[#f8f9fa] active:bg-[#f1f2f4] focus-visible:bg-[#f8f9fa] sm:h-11 [-webkit-tap-highlight-color:transparent]"
            data-integration-steps-open=""
          >
            <span className="min-w-0 flex-1 text-[13.5px] font-medium text-[#1a1a2e]">{tt("How to set it up")}</span>
            <span className="shrink-0 text-[13px] tabular-nums text-[#6b7280]">{tt("{n, plural, one {# step} other {# steps}}", { n: shownSteps.length })}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
          </button>
        ) : null}
      </section>
      {item.kind === "tracker" && (item.trackerId === "klaviyo" || item.trackerId === "omnisend") && !notifyOnly ? (
        /* The key that sends subscribers and orders, apart from the onsite ID above (lib/integrations/marketing). */
        <section className={cn(DEPTH, "overflow-hidden", PANEL_PRESS)} aria-labelledby="integration-sync" data-integration-sync="">
          <div className={SECTION_HEAD}>
            <h3 id="integration-sync" className={H3}>{tt("Subscribers and orders")}</h3>
          </div>
          <div className={PAD} key={panelKey}>
            <MarketingSyncPanel provider={item.trackerId} onChanged={onMarketing} />
          </div>
        </section>
      ) : null}
    </>
  )

  /* STATUS AND DIAGNOSTICS: only what is really known about the connection, each line read off the store. */
  const lastSync = providerState?.lastSyncAt ?? marketingState?.lastSyncAt ?? null
  const lastError = providerState?.lastError ?? marketingState?.lastError ?? null
  const account = providerState?.account ?? marketingState?.account ?? null
  const keyHint = providerState?.keyHint ?? marketingState?.keyHint ?? null
  const diag: { label: string; value: string; tone?: "red" }[] = [
    ...(account ? [{ label: tt("Account"), value: account }] : []),
    ...(tracked && item.trackerId ? [{ label: TRACKERS[item.trackerId].label, value: tracked }] : []),
    ...(keyHint ? [{ label: tt("Key"), value: `•••• ${keyHint}` }] : []),
    ...(providerState?.verifiedAt ? [{ label: tt("Checked"), value: dateTime(providerState.verifiedAt) }] : []),
    ...(installed || lastSync ? [{ label: tt("Last sync"), value: lastSync ? dateTime(lastSync) : tt("Not yet") }] : []),
    ...(lastError ? [{ label: tt("Last problem"), value: lastError, tone: "red" as const }] : []),
  ]
  const statusSection =
    (installed || lastError) && diag.length > 0 && (item.kind !== "app" || item.appId === "marketing_sync") ? (
      <section className={cn(DEPTH, PAD)} aria-labelledby="integration-status" data-integration-status="">
        <div className="flex items-center justify-between gap-3">
          <h3 id="integration-status" className={H3}>{tt("Status")}</h3>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1a1a2e]">
            <span aria-hidden className={cn("h-2 w-2 rounded-full", DOT[standing.tone])} />
            {standing.label}
          </span>
        </div>
        <dl className="mt-1.5 divide-y divide-[#f1f2f4] sm:mt-3">
          {diag.map((d) => (
            <div key={d.label} className={cn(ROW, "sm:first:pt-0 max-sm:last:-mb-2 sm:last:pb-0")}>
              <dt className="shrink-0 text-[13px] text-[#6b7280]">{d.label}</dt>
              <dd className={cn("min-w-0 break-words text-right text-[13.5px] font-medium", d.tone === "red" ? "text-[#b42318]" : "text-[#1a1a2e]")}>{d.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    ) : null

  /*
    LESS TO READ (round I4). What it does is one paragraph; how it works is
    a tap away, closed by default.
  */
  const more = item.lead ? item.about : item.about.slice(1)
  const overview = (
    <section className={cn(DEPTH, "overflow-hidden")} aria-labelledby="integration-about" data-integration-about="">
      <div className={PAD}>
        <h3 id="integration-about" className={H3}>{tt("What it does")}</h3>
        <p className="mt-2 text-[14px] leading-[21px] text-[#4b5563]">{item.lead ?? item.about[0]}</p>
        {item.paused ? <Notice tone="gray" className="mt-3">{tt("{name} is paused on Storelib for now. Anything already set up keeps its settings.", { name: item.name })}</Notice> : null}
      </div>
      {more.length > 0 ? (
        <details className="group border-t border-[#f1f2f4]" data-integration-details="">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 app-card-x py-3 text-[13.5px] font-medium text-[#1a1a2e] outline-none transition-colors duration-150 hover:bg-[#f8f9fa] active:bg-[#f1f2f4] focus-visible:bg-[#f8f9fa] sm:min-h-11 [-webkit-tap-highlight-color:transparent] [&::-webkit-details-marker]:hidden">
            {tt("How it works")}
            <ChevronDown className="h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
          </summary>
          <div className="space-y-2 app-card-x pb-5 text-[14px] leading-[21px] text-[#4b5563]">
            {more.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )

  const data = (
    <section className={cn(DEPTH, PAD)} aria-labelledby="integration-data" data-integration-data="">
      <h3 id="integration-data" className={H3}>{tt("Your data")}</h3>
      <ul className="mt-2 space-y-2 text-[14px] leading-[21px] text-[#4b5563]">
        {item.data.map((d) => (
          <li key={d} className="flex gap-2.5">
            <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#9ca3af]" />
            {d}
          </li>
        ))}
      </ul>
    </section>
  )

  const glanceRows = item.glance.filter((g) => g.label !== "Status")
  const glance = (
    /* Stuck under the following bar when there is one, so its title is never under it. */
    <aside className={cn(DEPTH, "h-fit app-card-x py-4 sm:px-5 lg:sticky", barOn ? "lg:top-[80px]" : "lg:top-4")} aria-labelledby="integration-glance" data-integration-glance="">
      <h3 id="integration-glance" className={H3}>{tt("At a glance")}</h3>
      <dl className="mt-1.5 divide-y divide-[#f1f2f4] sm:mt-3">
        <div className={cn(ROW, "gap-3 sm:first:pt-0")}>
          <dt className="text-[13px] text-[#6b7280]">{tt("Category")}</dt>
          <dd className="text-right text-[13.5px] font-medium text-[#1a1a2e]">{CATEGORY_NAMES[item.category]}</dd>
        </div>
        <div className={cn(ROW, "gap-3")}>
          <dt className="text-[13px] text-[#6b7280]">{tt("Status")}</dt>
          <dd className="text-right text-[13.5px] font-medium text-[#1a1a2e]">{standing.label}</dd>
        </div>
        {glanceRows.map((g) => (
          <div key={g.label} className={cn(ROW, "gap-3")}>
            <dt className="shrink-0 text-[13px] text-[#6b7280]">{g.label}</dt>
            <dd className="text-right text-[13.5px] font-medium text-[#1a1a2e]">{g.value}</dd>
          </div>
        ))}
      </dl>
      {item.docsUrl ? (
        <a href={item.docsUrl} target="_blank" rel="noopener noreferrer" className={cn(BTN_SECONDARY, "mt-3 h-11 w-full rounded-xl sm:h-10")}>
          {tt("{name} help", { name: item.name })}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : null}
    </aside>
  )

  const danger = plan ? (
    <section className={cn(DEPTH, PAD, "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between")} aria-labelledby="integration-remove" data-integration-remove="">
      <div className="min-w-0">
        <h3 id="integration-remove" className={H3}>{plan.verb === "turn_off" ? tt("Turn off {name}", { name: item.name }) : plan.verb === "remove" ? tt("Remove {name}", { name: item.name }) : tt("Disconnect {name}", { name: item.name })}</h3>
        <p className="mt-1 text-[13.5px] leading-[20px] text-[#6b7280]">{plan.consequence}</p>
      </div>
      <button type="button" className={cn(BTN_DANGER, "h-11 w-full shrink-0 rounded-xl sm:h-10 sm:w-auto sm:rounded-lg")} disabled={busy} onClick={() => setConfirming(true)}>
        {verbLabel}
      </button>
    </section>
  ) : null

  const sections = { setup, status: statusSection, overview, data, glance, danger }
  const tabs = view ? view.tabs() : []
  const Body = view?.Body

  /* ---- the actions in the header ---- */
  /* 44px on a phone, where the two share the row; the computer's 40px from 640px. */
  const BTN = "h-11 flex-1 rounded-xl px-4 sm:h-10 sm:flex-none"
  /* The one thing to do on the page, when there is one: Connect, Install, Turn on, or Tell me when it's ready. */
  const primaryLabel = notifyOnly ? tt("Tell me when it's ready") : !verb ? null : busy && oneTapInstall(item) ? tt("Turning on") : verb === "Turn on" ? tt("Turn on") : verb === "Connect" ? tt("Connect") : tt("Install")
  const pressPrimary = () => {
    if (notifyOnly) {
      setAskTick((n) => n + 1)
      toSetup()
    } else if (oneTapInstall(item)) void turnOn()
    else toSetup()
  }
  const primaryRef = React.useRef<HTMLButtonElement>(null)
  const actionsRef = React.useRef<HTMLDivElement>(null)
  const backMark = React.useRef<HTMLSpanElement>(null)
  /*
    THE BAR, WITH ITS WAY BACK (round Y2, the owner: "so I don't have to
    scroll all the way back up"). Wherever the page has a Back to
    integrations (/app/integrations and Settings, Integrations, on every one
    of an app's tabs), the bar comes in the moment that link goes out of the
    top, with a back arrow at its left in the link's place, and goes again
    the moment the link is back: the link and the arrow trade places on one
    observer and one transition. The bar's own action follows the header's,
    as before: shown only once the header's is out of view.
  */
  const { bar: barShown, action: actionOut } = usePageBar(onBack ? backMark : null, actionsRef, barOn)
  const pinned = onBack ? barShown : actionOut
  const barAction = notifyOnly || !!verb ? "primary" : plan || installed ? "settings" : null
  const actions = (
    <div ref={actionsRef} className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:justify-end" data-integration-actions="">
      {notifyOnly ? (
        <button ref={primaryRef} type="button" onClick={pressPrimary} className={cn(BTN_PRIMARY, BTN)} data-integration-action="">
          {primaryLabel}
        </button>
      ) : verb ? (
        <button ref={primaryRef} type="button" disabled={busy} onClick={pressPrimary} className={cn(BTN_PRIMARY, BTN)} data-integration-action="" data-integration-install-action={verb}>
          {primaryLabel}
          {verb !== "Turn on" ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
        </button>
      ) : (
        <>
          <span className={cn("inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-[13.5px] font-semibold sm:h-10", status === "built_in" ? "bg-[#f1f5f9] text-[#334155]" : status === "needs_attention" ? "bg-[#fffaeb] text-[#b54708]" : status === "error" ? "bg-[#fef3f2] text-[#b42318]" : "bg-[#ecfdf3] text-[#067647]")} data-integration-installed="">
            {status === "installed" || status === "built_in" ? <Check className="h-4 w-4" aria-hidden /> : null}
            {status === "built_in" ? tt("Built in") : status === "needs_attention" ? tt("Needs attention") : status === "error" ? tt("Not working") : tt("Installed")}
          </span>
          <button type="button" onClick={toSetup} className={cn(BTN_SECONDARY, BTN)} data-integration-action="">
            <Settings2 className="h-4 w-4" aria-hidden />
            {tt("Settings")}
          </button>
        </>
      )}
      {plan ? (
        /* On a phone it is at the foot of the page instead (the Disconnect card), so the header keeps to two buttons on one row. */
        <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="hidden h-10 items-center justify-center rounded-xl px-3 text-[13.5px] font-medium text-[#b42318] sm:inline-flex transition-colors hover:bg-[#fef3f2] disabled:opacity-50 [-webkit-tap-highlight-color:transparent]" data-integration-uninstall={plan.verb}>
          {verbLabel}
        </button>
      ) : null}
    </div>
  )

  return (
    <>
      {barOn ? (
        /*
          THE ACTION FOLLOWS (round 27, round Y2). A sticky box with no
          height, so it takes no room and nothing under it moves. The bar
          fades and drops 6px into place on the compositor (opacity and
          translate only), in and out on the same 200ms curve as the Back
          link it trades places with. It sits under the top of the page's own
          scroller, which already starts below the app's header and its safe
          area (app/app/layout.tsx, the settings sheet), so it is never under
          a notch and the inset is never counted twice.
        */
        <div className="sticky top-0 z-20 h-0" data-integration-pin-box="">
          <div
            className={cn(
              "absolute inset-x-0 top-0 pt-2 transition-[opacity,translate] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none sm:pt-3",
              pinned ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1.5 opacity-0",
            )}
            inert={!pinned}
            aria-hidden={!pinned}
            data-integration-pin={pinned ? "shown" : "hidden"}
          >
            <div className={cn("flex items-center gap-2.5 rounded-2xl border border-[#e5e7eb]/80 bg-white p-2 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_12px_28px_-14px_rgba(16,24,40,0.24)]", onBack ? "pl-1.5" : "pl-2.5")}>
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label={tt("Back to integrations")}
                  className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#4b5563] outline-none transition-colors after:absolute after:-inset-1 after:content-[''] hover:bg-[#f1f2f4] active:bg-[#eceef1] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]"
                  data-integration-pin-back=""
                >
                  <ChevronLeft className="h-[18px] w-[18px]" aria-hidden />
                </button>
              ) : null}
              <Mark item={item} size={32} />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-[#1a1a2e]">{item.name}</span>
              {barAction ? (
                /* Kept in its place while the header's own is in view (faded, out of reach), so the name never changes width as it comes. */
                <span
                  className={cn("shrink-0 transition-opacity duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none", actionOut ? "opacity-100" : "pointer-events-none opacity-0")}
                  inert={!actionOut}
                  data-integration-pin-action-slot={actionOut ? "shown" : "hidden"}
                >
                  {barAction === "primary" ? (
                    <button type="button" disabled={busy} onClick={pressPrimary} className={cn(BTN_PRIMARY, "h-9 shrink-0 rounded-lg px-3.5", HIT)} data-integration-pin-action="">
                      {primaryLabel}
                      {verb && verb !== "Turn on" ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
                    </button>
                  ) : (
                    <button type="button" onClick={toSetup} className={cn(BTN_SECONDARY, "h-9 shrink-0 rounded-lg px-3", HIT)} data-integration-pin-action="">
                      <Settings2 className="h-4 w-4" aria-hidden />
                      {tt("Settings")}
                    </button>
                  )}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {/* The page comes in on a 200ms fade (opacity only, so nothing fixed inside it loses its place), none under reduced motion. */}
      <div className="space-y-3 motion-safe:animate-[app-page-enter_200ms_cubic-bezier(0.2,0,0,1)_backwards] sm:space-y-5" data-integration-page={item.id}>
        {onBack ? (
          /* The mark is what the bar watches: 64px under the link's foot, so it crosses into the bar's room as the link's last pixel leaves the top. */
          <div className="relative">
            <button
              type="button"
              onClick={onBack}
              className={cn(
                "-ml-2 inline-flex h-11 items-center gap-1 rounded-full pl-1.5 pr-3 text-[14px] font-medium text-[#4b5563] outline-none transition-[background-color,color,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:bg-[#f1f2f4] active:bg-[#eceef1] sm:h-10 sm:text-[13.5px] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent]",
                barShown ? "opacity-0" : "opacity-100",
              )}
              data-integration-back={barShown ? "away" : "here"}
            >
              <ChevronLeft className="h-[18px] w-[18px] sm:h-4 sm:w-4" aria-hidden />
              {tt("Back to integrations")}
            </button>
            <span ref={backMark} aria-hidden className="pointer-events-none absolute left-0 h-px w-px" style={{ top: `calc(100% + ${PIN_ROOM - 1}px)` }} data-integration-back-mark="" />
          </div>
        ) : null}

        <header className={cn(DEPTH, "overflow-hidden")} data-integration-header="">
          <div aria-hidden className="h-[84px] sm:h-[112px]" style={bannerStyle(bannerColor(item))} data-integration-banner="" />
          <div className="app-card-x pb-4 sm:px-7 sm:pb-6">
            <div className="-mt-9 inline-flex rounded-[18px] bg-white p-1.5 shadow-[0_1px_2px_rgba(16,24,40,0.06),0_6px_16px_-6px_rgba(16,24,40,0.18)] ring-1 ring-[#e5e7eb]/70 sm:-mt-11">
              <Mark item={item} size={60} />
            </div>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
              <div className="min-w-0 max-w-[680px]">
                {/* The page's title where it is a page of its own (no Integrations title above it any more). */}
                <Title className="text-[24px] font-bold leading-[30px] tracking-[-0.02em] text-[#1a1a2e] sm:text-[30px] sm:leading-tight">{item.name}</Title>
                <p className="mt-1 text-[14.5px] leading-[21px] text-[#4b5563] sm:mt-1.5 sm:leading-[22px]">{item.summary}</p>
                {/*
                  ONE LINE (round 27, the owner: "Reviews, Made by Storelib, Connected, Working on your store" was too much
                  text): the category, who made it and where it stands. The sentence under it only when it says something
                  the word does not: the ID that is saved, or what is wrong.
                */}
                <div className="mt-3 flex min-w-0 flex-nowrap items-center gap-x-2.5 whitespace-nowrap text-[13px]" data-integration-standing={status}>
                  <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-[#e5e7eb] bg-white px-2.5 font-medium text-[#1a1a2e]">{CATEGORY_NAMES[item.category]}</span>
                  {storelibMade ? <span className="min-w-0 truncate text-[#6b7280]">{tt("Made by Storelib")}</span> : null}
                  <span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-[#1a1a2e]">
                    <span aria-hidden className={cn("h-2 w-2 rounded-full", DOT[standing.tone])} />
                    {standing.label}
                  </span>
                </div>
                {standingNote ? (
                  <p className="mt-1.5 text-[13px] leading-5 text-[#6b7280]" data-integration-standing-note="">
                    {standingNote}
                  </p>
                ) : null}
                {!Body ? (
                  <button type="button" onClick={() => setDetails(true)} className="-mb-2 -ml-1.5 mt-0.5 inline-flex h-11 items-center gap-0.5 rounded-lg pl-1.5 pr-2 text-[13.5px] font-medium text-[#4b5563] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] active:bg-[#eceef1] focus-visible:ring-2 sm:-mb-1 sm:mt-1 sm:h-10 sm:text-[13px] focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]" data-integration-details-open="">
                    {tt("Details")}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
              {actions}
            </div>
            {notice ? (
              <Notice tone={notice.tone} className="mt-4">
                <span data-integration-notice={notice.tone}>{notice.text}</span>
              </Notice>
            ) : null}
          </div>
          {tabs.length > 0 ? (
            <div className="flex gap-1 overflow-x-auto border-t border-[#f1f2f4] px-2 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={item.name} data-integration-tabs="">
              {tabs.map((t) => {
                const on = t.id === tab
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setTab(t.id)}
                    onPointerEnter={() => warm(t.id)}
                    onFocus={() => warm(t.id)}
                    onTouchStart={() => warm(t.id)}
                    data-integration-tab={t.id}
                    className={cn("relative inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 px-3 text-[13.5px] font-medium transition-colors duration-150 [-webkit-tap-highlight-color:transparent]", on ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
                  >
                    {t.label}
                    {t.count ? <span className="rounded-full bg-[#f3f4f6] px-1.5 text-[11.5px] tabular-nums text-[#4b5563]">{t.count}</span> : null}
                    {on ? <span aria-hidden className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-[#1a1a2e]" /> : null}
                  </button>
                )
              })}
            </div>
          ) : null}
        </header>

        {Body ? (
          <div ref={panelRef} role="tabpanel" data-integration-tabpanel={tab}>
            <Body tab={tab} setTab={setTab} item={item} status={status} installed={installed} sections={sections} Layout={Layout} warm={warmTab} onChanged={(on) => item.appId && onApp(item.appId, on)} />
          </div>
        ) : (
          <Layout
            main={
              <>
                {setup}
                {statusSection}
                {danger}
              </>
            }
          />
        )}

        <Modal open={howTo}
          onClose={() => setHowTo(false)}
          title={tt("Set up {name}", { name: item.name })}
          footer={
            primaryLabel ? (
              <div className="flex w-full gap-2 sm:justify-end">
                <button type="button" className={cn(BTN_SECONDARY, "flex-1 sm:flex-none")} onClick={() => setHowTo(false)}>
                  {tt("Close")}
                </button>
                <button
                  type="button"
                  className={cn(BTN_PRIMARY, "flex-1 sm:flex-none")}
                  disabled={busy}
                  onClick={() => {
                    setHowTo(false)
                    /* After the sheet has gone, so the page's field takes the focus and not the sheet's last button. */
                    window.setTimeout(pressPrimary, reduced() ? 0 : 220)
                  }}
                  data-integration-steps-go=""
                >
                  {primaryLabel}
                </button>
              </div>
            ) : undefined
          }
        >
          <div className="mb-4 flex items-center gap-1.5 text-[13px] text-[#6b7280]" data-integration-steps-standing={status}>
            <span aria-hidden className={cn("h-2 w-2 rounded-full", DOT[standing.tone])} />
            <span className="font-medium text-[#1a1a2e]">{standing.label}</span>
          </div>
          <SetupStepList steps={shownSteps} done={installed} />
        </Modal>

        {/* What it does, your data and the facts at a glance, a tap away (round 41: the page itself is the header, the setup and the status). */}
        <Modal open={details} onClose={() => setDetails(false)} title={item.name}>
          <div className="space-y-5 text-[14px] leading-[21px] text-[#4b5563]" data-integration-details-sheet="">
            <div className="space-y-2">
              {(item.lead ? [item.lead, ...item.about] : item.about).map((x) => (
                <p key={x}>{x}</p>
              ))}
            </div>
            {item.data.length ? (
              <div>
                <h3 className={H3}>{tt("Your data")}</h3>
                <ul className="mt-2 space-y-2">
                  {item.data.map((d) => (
                    <li key={d} className="flex gap-2.5">
                      <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#9ca3af]" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {glanceRows.length ? (
              <dl className="divide-y divide-[#f1f2f4] border-t border-[#f1f2f4]">
                {glanceRows.map((g) => (
                  <div key={g.label} className={cn(ROW, "gap-3")}>
                    <dt className="shrink-0 text-[13px] text-[#6b7280]">{g.label}</dt>
                    <dd className="text-right text-[13.5px] font-medium text-[#1a1a2e]">{g.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {item.docsUrl ? (
              <a href={item.docsUrl} target="_blank" rel="noopener noreferrer" className={cn(BTN_SECONDARY, "h-11 w-full rounded-xl sm:h-10")}>
                {tt("{name} help", { name: item.name })}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
        </Modal>

        <Modal
          open={confirming}
          onClose={() => (busy ? undefined : setConfirming(false))}
          title={plan?.verb === "turn_off" ? tt("Turn off {name}?", { name: item.name }) : plan?.verb === "remove" ? tt("Remove {name}?", { name: item.name }) : tt("Disconnect {name}?", { name: item.name })}
          footer={
            <div className="flex w-full justify-end gap-2">
              <button type="button" className={cn(BTN_SECONDARY, "flex-1 sm:flex-none")} onClick={() => setConfirming(false)} disabled={busy}>
                {tt("Cancel")}
              </button>
              <button type="button" className={cn(BTN_DANGER, "flex-1 sm:flex-none")} disabled={busy} onClick={() => void takeOff()} data-integration-uninstall-confirm="">
                {busy ? tt("Working on it") : verbLabel}
              </button>
            </div>
          }
        >
          <p className="text-[14px] leading-[21px] text-[#4b5563]">{plan?.consequence}</p>
        </Modal>
      </div>
    </>
  )
}

/*
 * The room the following bar takes at the top of the page: 8 or 12px over it
 * and the bar itself (8px around a 36px button and the hairline). The
 * header's action counts as out of view once it is under that room, so the
 * two hand over where they meet: the header's slides under the bar as the
 * bar comes, and the bar leaves the moment the header's comes out from under
 * it.
 */
const PIN_ROOM = 64

/**
 * Where the page stands against the bar, from one IntersectionObserver on the
 * page's scroller, so scrolling renders nothing between the two moments:
 *
 *   bar     the Back link's mark is in the bar's room: the link is out of the
 *           top (with no link, the header's action is)
 *   action  the header's actions are out of view or under the bar's room
 *
 * Both are read in the same callback and set in one update, so the link and
 * the bar's arrow change in the same frame.
 */
function usePageBar(back: React.RefObject<HTMLElement | null> | null, actions: React.RefObject<HTMLElement | null>, on: boolean): { bar: boolean; action: boolean } {
  const [state, setState] = React.useState({ bar: false, action: false })
  React.useEffect(() => {
    const act = actions.current
    const mark = back?.current ?? null
    if (!on || !act || typeof IntersectionObserver === "undefined") {
      setState({ bar: false, action: false })
      return
    }
    const root = act.closest<HTMLElement>("[data-integrations-scroll], [data-settings-sheet-scroll], .app-content-scroll")
    const out = new Map<Element, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const top = e.rootBounds?.top ?? 0
          out.set(e.target, !e.isIntersecting && e.boundingClientRect.bottom <= top + 0.5)
        }
        const action = out.get(act) ?? false
        const bar = mark ? (out.get(mark) ?? false) : action
        setState((s) => (s.bar === bar && s.action === action ? s : { bar, action }))
      },
      { root, threshold: 0, rootMargin: `-${PIN_ROOM}px 0px 0px 0px` },
    )
    io.observe(act)
    if (mark) io.observe(mark)
    return () => io.disconnect()
  }, [back, actions, on])
  return on ? state : { bar: false, action: false }
}

/**
 * The ID, and for Google Ads (round 52) its purchase conversion label under
 * it once the ID is saved: `label` is the saved one, undefined for every
 * other service.
 */
function TrackerInstall({ item, value, label, ready, onSaved }: { item: Integration; value: string | null; label?: string | null; ready: boolean; onSaved: (t: Tracking) => void }) {
  const t = TRACKERS[item.trackerId!]
  const [typed, setTyped] = React.useState(value ?? "")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  React.useEffect(() => setTyped(value ?? ""), [value])

  const save = async (next: string | null) => {
    setBusy(true)
    setError(null)
    setSaved(false)
    const r = await api<{ tracking: Tracking }>("/api/store/integrations", { method: "PUT", body: { id: item.trackerId, value: next } })
    setBusy(false)
    if (!r.ok) return setError(("error" in r ? r.error : ""))
    onSaved(r.data.tracking)
    setSaved(true)
  }

  if (!ready) return <Notice tone="amber">{tt("Analytics and pixels need their database update (SQL part 112). Until it runs, nothing here is kept.")}</Notice>
  return (
    <div className="space-y-3" data-tracker-install={item.trackerId}>
      {/* Round 43: the field and what saves it on one row from 640px, with where to find it under both; on a phone the field, where to find it, then the button the width of the card. */}
      <Field label={t.label} htmlFor={`tracker-${item.trackerId}`}>
        <div className="grid grid-cols-1 gap-x-2 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_auto]" data-tracker-row="">
          <TextInput id={`tracker-${item.trackerId}`} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t.example} autoComplete="off" spellCheck={false} inputMode="text" aria-describedby={`tracker-${item.trackerId}-where`} />
          <div className="order-last mt-2 flex gap-2 sm:order-none sm:mt-0">
            {value ? (
              <button type="button" className={cn(BTN_DANGER, "h-11 flex-1 sm:h-10 sm:flex-none")} disabled={busy} onClick={() => void save(null)}>
                {tt("Remove")}
              </button>
            ) : null}
            <button type="button" className={cn(BTN_PRIMARY, "h-11 flex-1 sm:h-10 sm:flex-none")} disabled={busy || !typed.trim() || typed.trim() === value} onClick={() => void save(typed)}>
              {busy ? tt("Saving") : value ? tt("Save") : tt("Install")}
            </button>
          </div>
          <p id={`tracker-${item.trackerId}-where`} className="text-[12.5px] leading-[18px] text-[#6b7280] sm:col-span-2">{tt("Where to find it: {where}", { where: t.where })}</p>
        </div>
      </Field>
      {error ? <Notice>{error}</Notice> : null}
      {saved && !error ? <p className="text-[13px] text-[#067647]" data-tracker-saved="">{value ? tt("Saved. {name} loads on your website from its next page view.", { name: t.name }) : tt("Removed from your website.")}</p> : null}
      {label !== undefined && value ? <AdsLabelInstall value={label} adsId={value} onSaved={onSaved} /> : null}
    </div>
  )
}

/**
 * GOOGLE ADS' PURCHASE CONVERSION LABEL (round 52). With it, each paid order
 * is a conversion of that action (lib/store/tracking.ts purchaseTags); the
 * ID alone attributes none. The same row as the ID above.
 */
/* What a conversion label looks like: an example, not words to translate. */
const ADS_LABEL_EXAMPLE = "AbC-D_efGh12"

function AdsLabelInstall({ value, adsId, onSaved }: { value: string | null; adsId: string; onSaved: (t: Tracking) => void }) {
  const [typed, setTyped] = React.useState(value ?? "")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  React.useEffect(() => setTyped(value ?? ""), [value])

  const save = async (next: string | null) => {
    setBusy(true)
    setError(null)
    setSaved(false)
    const r = await api<{ tracking: Tracking }>("/api/store/integrations", { method: "PUT", body: { id: "google_ads_label", value: next } })
    setBusy(false)
    if (!r.ok) return setError(("error" in r ? r.error : ""))
    onSaved(r.data.tracking)
    setSaved(true)
  }

  return (
    <div className="space-y-3" data-ads-label="">
      <Field label={tt("Purchase conversion label")} htmlFor="tracker-google_ads_label">
        <div className="grid grid-cols-1 gap-x-2 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_auto]" data-tracker-row="">
          <TextInput id="tracker-google_ads_label" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={ADS_LABEL_EXAMPLE} autoComplete="off" spellCheck={false} inputMode="text" aria-describedby="tracker-google_ads_label-where" />
          <div className="order-last mt-2 flex gap-2 sm:order-none sm:mt-0">
            {value ? (
              <button type="button" className={cn(BTN_DANGER, "h-11 flex-1 sm:h-10 sm:flex-none")} disabled={busy} onClick={() => void save(null)}>
                {tt("Remove")}
              </button>
            ) : null}
            <button type="button" className={cn(BTN_PRIMARY, "h-11 flex-1 sm:h-10 sm:flex-none")} disabled={busy || !typed.trim() || typed.trim() === value} onClick={() => void save(typed)}>
              {busy ? tt("Saving") : tt("Save")}
            </button>
          </div>
          <p id="tracker-google_ads_label-where" className="text-[12.5px] leading-[18px] text-[#6b7280] sm:col-span-2">{tt("Where to find it: {where}", { where: tt("Google Ads › Goals › Conversions › your purchase › Event snippet, after {id}/ in send_to.", { id: adsId }) })}</p>
        </div>
      </Field>
      {error ? <Notice>{error}</Notice> : null}
      {saved && !error ? <p className="text-[13px] text-[#067647]" data-ads-label-saved="">{value ? tt("Saved. Each paid order is now a Google Ads conversion.") : tt("Removed. Orders are no longer sent as conversions.")}</p> : null}
    </div>
  )
}

/**
 * TELL ME WHEN IT'S READY. A Coming soon integration has nothing to install,
 * so its Install section is one press that counts the store as asking for it
 * (a request in /admin, once per store). "You're on the list" only once the
 * request is really kept.
 */
function NotifyMe({ item, askTick = 0 }: { item: Integration; askTick?: number }) {
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const ask = async () => {
    if (state !== "idle") return
    setState("sending")
    setError(null)
    const r = await api("/api/store/integrations/request", { method: "POST", body: { name: item.name, integrationId: item.id } })
    if (!r.ok) {
      setState("idle")
      return setError(("error" in r ? r.error : ""))
    }
    setState("sent")
  }
  /* Pressed in the header. */
  React.useEffect(() => {
    if (askTick > 0) void ask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askTick])
  return (
    <div className="space-y-3" data-integration-notify={item.id}>
      <p className="text-[14px] leading-[21px] text-[#4b5563]">{tt("Not available yet. Ask for it and you'll be counted: the most asked for are built first.")}</p>
      {error ? <Notice>{error}</Notice> : null}
      {state === "sent" ? (
        <p className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#067647]" data-integration-notified="">
          <Check className="h-4 w-4" aria-hidden />
          {tt("You're on the list for {name}.", { name: item.name })}
        </p>
      ) : (
        <div className="flex justify-end">
          <button type="button" className={cn(BTN_PRIMARY, "h-11 w-full rounded-xl sm:h-10 sm:w-auto sm:rounded-lg")} disabled={state === "sending"} onClick={() => void ask()}>
            {state === "sending" ? tt("Sending") : tt("Tell me when it's ready")}
          </button>
        </div>
      )}
    </div>
  )
}

/** One step of setting an integration up, and the value it asks to copy, when it has one. */
export interface SetupStep {
  text: string
  copy?: { label: string; value: string } | null
}

/**
 * THE STEPS AS A LIST TO FOLLOW (round 42). Numbered circles on one hairline,
 * top to bottom: the step to do now is dark, the ones after it are open
 * circles, and every one is a tick once it is connected. Read as a list by a
 * screen reader, with where each step stands in words.
 */
export function SetupStepList({ steps, done }: { steps: SetupStep[]; done: boolean }) {
  return (
    <ol className="relative" data-integration-steps="">
      {steps.map((st, i) => {
        const state = done ? "done" : i === 0 ? "now" : "next"
        const last = i === steps.length - 1
        return (
          <li key={st.text} className={cn("relative flex gap-3", last ? null : "pb-5")} data-integration-step={state}>
            {last ? null : <span aria-hidden className="absolute bottom-0 left-[11.5px] top-[26px] w-px bg-[#e5e7eb]" />}
            <span
              aria-hidden
              className={cn(
                "relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums",
                state === "done" ? "bg-[#ecfdf3] text-[#067647]" : state === "now" ? "bg-[#1a1a2e] text-white" : "border border-[#d1d5db] bg-white text-[#4b5563]",
              )}
            >
              {state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-[2px]">
              <p className={cn("text-[14px] leading-[21px]", state === "next" ? "text-[#4b5563]" : "text-[#1a1a2e]")}>
                <span className="sr-only">{state === "done" ? tt("Done.") : state === "now" ? tt("Do this now.") : null} </span>
                {st.text}
              </p>
              {st.copy ? <CopyValue label={st.copy.label} value={st.copy.value} /> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** A value to paste somewhere else, with its own Copy that says Copied for a moment. */
function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(t)
  }, [copied])
  return (
    <div className="mt-2 rounded-xl border border-[#eceef1] bg-[#f8f9fa] p-1.5 pl-3" data-integration-copy="">
      <p className="pt-1 text-[12px] font-medium text-[#6b7280]">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] leading-[18px] text-[#1a1a2e]" title={value}>
          {value}
        </code>
        <button
          type="button"
          onClick={async () => setCopied(await copyText(value))}
          className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium text-[#1a1a2e] shadow-[0_0_0_1px_#e5e7eb] transition-colors sm:h-10 hover:bg-[#f3f4f6] active:bg-[#eceef1] [-webkit-tap-highlight-color:transparent]"
          aria-label={copied ? tt("Copied") : tt("Copy {label}", { label })}
          data-integration-copy-button={copied ? "copied" : "idle"}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#067647]" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? tt("Copied") : tt("Copy")}
        </button>
      </div>
    </div>
  )
}
