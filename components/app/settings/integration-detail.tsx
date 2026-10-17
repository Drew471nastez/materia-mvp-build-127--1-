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
import { ArrowRight, Check, ChevronDown, ChevronLeft, ExternalLink, Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Field, Modal, Notice, TextInput, api, dateTime, readFresh } from "@/components/physical/ui"
import { IntegrationCard, type IntegrationState } from "@/components/physical/integrations-marketplace"
import { Mark, hasBuiltInArt, tileColor } from "@/components/app/settings/integration-mark"
import { CATEGORY_NAMES, type Integration, type IntegrationCategory, type IntegrationStatus } from "@/lib/integrations/catalog"
import { providerInfo } from "@/lib/physical/providers"
import { TRACKERS, type Tracking } from "@/lib/store/tracking"
import { ReviewsAppPanel } from "@/components/app/settings/reviews-app-panel"
import { TrackingAppPanel } from "@/components/app/settings/tracking-app-panel"
import { GaConnect } from "@/components/app/settings/ga-connect"
import { MarketingSyncPanel, type MarketingState } from "@/components/app/settings/marketing-sync-panel"
import { installVerb, oneTapInstall, removalPlan, setupSteps, type ActionCall } from "@/lib/integrations/detail-actions"
import { integrationAppView, tabFor } from "@/components/app/settings/integration-apps"
import { tt } from "@/lib/i18n/text"

/* A card with a little depth: the hairline, a contact shadow and a soft one under it. */
const DEPTH = "rounded-2xl border border-[#e5e7eb]/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-14px_rgba(16,24,40,0.14)]"
const SECTION_HEAD = "border-b border-[#f1f2f4] px-4 py-3.5 sm:px-6"
const H3 = "text-[15px] font-semibold text-[#1a1a2e]"

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
  clarity: "#0078d4",
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
  hotjar: "#ff3c00",
  "snapchat-pixel": "#fffc00",
  "reddit-pixel": "#ff4500",
}
const CATEGORY_TINT: Record<IntegrationCategory, string> = {
  reviews: "#f2607a",
  analytics: "#f5a524",
  advertising: "#3d84f5",
  email: "#e2557a",
  automation: "#f08a24",
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
  onBack: () => void
}

function Layout({ main, aside }: { main: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className={cn("grid gap-4 sm:gap-5", aside ? "lg:grid-cols-[minmax(0,1fr)_300px]" : null)} data-integration-body="">
      <div className="min-w-0 space-y-4 sm:space-y-5">{main}</div>
      {aside}
    </div>
  )
}

export function IntegrationDetail({ item, status, installed, tracking, trackingReady, states, marketing, onTracking, onStates, onApp, onMarketing, onBack }: IntegrationDetailProps) {
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
  const setTab = React.useCallback(
    (id: string) => {
      if (!view) return
      setTabState(id)
      writeViewParam(id === tabFor(view, null) ? null : id)
    },
    [view],
  )

  /* Nothing to connect yet: a listed service, a provider marked Coming soon, or one paused from /admin. */
  const notifyOnly = item.kind === "listed" || (item.kind === "commerce" && !!item.comingSoon) || (!!item.paused && !installed)
  const providerState = item.providerId ? (states?.find((s) => s.provider === item.providerId) ?? null) : null
  const marketingState = item.kind === "tracker" ? (marketing?.find((m) => m.provider === item.trackerId) ?? null) : null
  const tracked = item.kind === "tracker" && item.trackerId ? (tracking?.[item.trackerId] ?? null) : null
  const plan = notifyOnly ? null : removalPlan(item, { installed, marketingConnected: !!marketingState?.connected, trackerSaved: !!tracked })
  const verb = notifyOnly || installed ? null : installVerb(item)
  const steps = installed || notifyOnly ? [] : setupSteps(item)
  /* The header's Tell me when it's ready sends the request itself. */
  const [askTick, setAskTick] = React.useState(0)
  /* A header action changed what a panel shows: the panel is drawn again from the fresh read. */
  const [panelKey, setPanelKey] = React.useState(0)
  const [confirming, setConfirming] = React.useState(false)
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
    if (!r.ok) return r.error
    if (call.path === "/api/store/reviews-app") onApp("storelib_reviews", call.body.enabled === true)
    else if (call.path === "/api/store/tracking-app") onApp("courier_tracking", false)
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
    setPanelKey((k) => k + 1)
    setBusy(false)
    setConfirming(false)
    setNotice({ tone: "green", text: plan.verb === "turn_off" ? tt("{name} is off.", { name: item.name }) : plan.verb === "remove" ? tt("{name} is removed from your website.", { name: item.name }) : tt("{name} is disconnected.", { name: item.name }) })
  }

  const verbLabel = plan ? (plan.verb === "turn_off" ? tt("Turn off") : plan.verb === "remove" ? tt("Remove") : tt("Disconnect")) : ""
  const storelibMade = hasBuiltInArt(item.id)

  /* ---- the sections, each ready to place (an app's tabs place them too) ---- */
  const panel = notifyOnly ? (
    <div className="space-y-4">
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
  ) : item.kind === "app" && item.appId === "courier_tracking" ? (
    <TrackingAppPanel onChanged={(own) => onApp("courier_tracking", own)} />
  ) : item.kind === "tracker" && item.trackerId === "ga4" ? (
    /* Google Analytics: pasted, checked with a live hit, then "Receiving data" with the last event's time. */
    <GaConnect value={tracking?.ga4 ?? null} ready={trackingReady} onSaved={onTracking} />
  ) : item.kind === "tracker" && item.trackerId ? (
    <TrackerInstall item={item} value={tracking?.[item.trackerId] ?? null} ready={trackingReady} onSaved={onTracking} />
  ) : item.providerId && providerInfo(item.providerId) ? (
    <ul className="[&>li]:border-0 [&>li]:bg-transparent [&>li]:p-0 [&>li]:shadow-none">
      <IntegrationCard provider={providerInfo(item.providerId)!} state={providerState} loading={states === null} onSaved={onStates} startOpen={!item.builtIn && !installed} />
    </ul>
  ) : null

  const setup = (
    <>
      <section ref={setupRef} className={cn(DEPTH, "scroll-mt-4 overflow-hidden")} aria-labelledby="integration-install" data-integration-install="">
        <div className={SECTION_HEAD}>
          <h3 id="integration-install" className={H3}>{notifyOnly ? tt("Get notified") : installed ? tt("Settings") : tt("Set up")}</h3>
        </div>
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          {steps.length > 0 ? (
            <ol className="mb-5 space-y-2.5 border-b border-[#f1f2f4] pb-5" data-integration-steps="">
              {steps.map((s, i) => (
                <li key={s} className="flex gap-3 text-[14px] leading-[21px] text-[#374151]">
                  <span aria-hidden className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[12px] font-semibold tabular-nums text-[#1a1a2e]">{i + 1}</span>
                  <span className="pt-px">{s}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <div key={panelKey}>{panel}</div>
        </div>
      </section>
      {item.kind === "tracker" && (item.trackerId === "klaviyo" || item.trackerId === "omnisend") && !notifyOnly ? (
        /* The key that sends subscribers and orders, apart from the onsite ID above (lib/integrations/marketing). */
        <section className={cn(DEPTH, "overflow-hidden")} aria-labelledby="integration-sync" data-integration-sync="">
          <div className={SECTION_HEAD}>
            <h3 id="integration-sync" className={H3}>{tt("Subscribers and orders")}</h3>
          </div>
          <div className="px-4 py-4 sm:px-6 sm:py-5" key={panelKey}>
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
    (installed || lastError) && diag.length > 0 && item.kind !== "app" ? (
      <section className={cn(DEPTH, "px-4 py-4 sm:px-6 sm:py-5")} aria-labelledby="integration-status" data-integration-status="">
        <div className="flex items-center justify-between gap-3">
          <h3 id="integration-status" className={H3}>{tt("Status")}</h3>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1a1a2e]">
            <span aria-hidden className={cn("h-2 w-2 rounded-full", DOT[standing.tone])} />
            {standing.label}
          </span>
        </div>
        <dl className="mt-3 divide-y divide-[#f1f2f4]">
          {diag.map((d) => (
            <div key={d.label} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
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
      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <h3 id="integration-about" className={H3}>{tt("What it does")}</h3>
        <p className="mt-2 text-[14px] leading-[21px] text-[#4b5563]">{item.lead ?? item.about[0]}</p>
        {item.paused ? <Notice tone="gray" className="mt-3">{tt("{name} is paused on Storelib for now. Anything already set up keeps its settings.", { name: item.name })}</Notice> : null}
      </div>
      {more.length > 0 ? (
        <details className="group border-t border-[#f1f2f4]" data-integration-details="">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13.5px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f8f9fa] sm:px-6 [&::-webkit-details-marker]:hidden">
            {tt("How it works")}
            <ChevronDown className="h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-200 group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-2 px-4 pb-5 text-[14px] leading-[21px] text-[#4b5563] sm:px-6">
            {more.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )

  const data = (
    <section className={cn(DEPTH, "px-4 py-4 sm:px-6 sm:py-5")} aria-labelledby="integration-data" data-integration-data="">
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
    <aside className={cn(DEPTH, "h-fit px-4 py-4 sm:px-5 lg:sticky lg:top-4")} aria-labelledby="integration-glance" data-integration-glance="">
      <h3 id="integration-glance" className={H3}>{tt("At a glance")}</h3>
      <dl className="mt-3 divide-y divide-[#f1f2f4]">
        <div className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
          <dt className="text-[13px] text-[#6b7280]">{tt("Category")}</dt>
          <dd className="text-right text-[13.5px] font-medium text-[#1a1a2e]">{CATEGORY_NAMES[item.category]}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt className="text-[13px] text-[#6b7280]">{tt("Status")}</dt>
          <dd className="text-right text-[13.5px] font-medium text-[#1a1a2e]">{standing.label}</dd>
        </div>
        {glanceRows.map((g) => (
          <div key={g.label} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="shrink-0 text-[13px] text-[#6b7280]">{g.label}</dt>
            <dd className="text-right text-[13.5px] font-medium text-[#1a1a2e]">{g.value}</dd>
          </div>
        ))}
      </dl>
      {item.docsUrl ? (
        <a href={item.docsUrl} target="_blank" rel="noopener noreferrer" className={cn(BTN_SECONDARY, "mt-3 h-10 w-full rounded-xl")}>
          {tt("{name} help", { name: item.name })}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : null}
    </aside>
  )

  const danger = plan ? (
    <section className={cn(DEPTH, "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5")} aria-labelledby="integration-remove" data-integration-remove="">
      <div className="min-w-0">
        <h3 id="integration-remove" className={H3}>{plan.verb === "turn_off" ? tt("Turn off {name}", { name: item.name }) : plan.verb === "remove" ? tt("Remove {name}", { name: item.name }) : tt("Disconnect {name}", { name: item.name })}</h3>
        <p className="mt-1 text-[13.5px] leading-[20px] text-[#6b7280]">{plan.consequence}</p>
      </div>
      <button type="button" className={cn(BTN_DANGER, "shrink-0")} disabled={busy} onClick={() => setConfirming(true)}>
        {verbLabel}
      </button>
    </section>
  ) : null

  const sections = { setup, status: statusSection, overview, data, glance, danger }
  const tabs = view ? view.tabs() : []
  const Body = view?.Body

  /* ---- the actions in the header ---- */
  const BTN = "h-10 flex-1 rounded-xl px-4 sm:flex-none"
  const actions = (
    <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:justify-end" data-integration-actions="">
      {notifyOnly ? (
        <button
          type="button"
          onClick={() => {
            setAskTick((n) => n + 1)
            toSetup()
          }}
          className={cn(BTN_PRIMARY, BTN)}
          data-integration-action=""
        >
          {tt("Tell me when it's ready")}
        </button>
      ) : verb ? (
        <button type="button" disabled={busy} onClick={() => (oneTapInstall(item) ? void turnOn() : toSetup())} className={cn(BTN_PRIMARY, BTN)} data-integration-action="" data-integration-install-action={verb}>
          {busy && oneTapInstall(item) ? tt("Turning on") : verb === "Turn on" ? tt("Turn on") : verb === "Connect" ? tt("Connect") : tt("Install")}
          {verb !== "Turn on" ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
        </button>
      ) : (
        <>
          <span className={cn("inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[13.5px] font-semibold", status === "built_in" ? "bg-[#f1f5f9] text-[#334155]" : status === "needs_attention" ? "bg-[#fffaeb] text-[#b54708]" : status === "error" ? "bg-[#fef3f2] text-[#b42318]" : "bg-[#ecfdf3] text-[#067647]")} data-integration-installed="">
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
    <div className="space-y-4 sm:space-y-5" data-integration-page={item.id}>
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 inline-flex h-9 items-center gap-1 rounded-full pl-1.5 pr-3 text-[13.5px] font-medium text-[#4b5563] outline-none transition-colors hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]"
        data-integration-back=""
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {tt("Back to integrations")}
      </button>

      <header className={cn(DEPTH, "overflow-hidden")} data-integration-header="">
        <div aria-hidden className="h-[84px] sm:h-[112px]" style={bannerStyle(bannerColor(item))} data-integration-banner="" />
        <div className="px-4 pb-4 sm:px-7 sm:pb-6">
          <div className="-mt-9 inline-flex rounded-[18px] bg-white p-1.5 shadow-[0_1px_2px_rgba(16,24,40,0.06),0_6px_16px_-6px_rgba(16,24,40,0.18)] ring-1 ring-[#e5e7eb]/70 sm:-mt-11">
            <Mark item={item} size={60} />
          </div>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
            <div className="min-w-0 max-w-[680px]">
              <h2 className="text-[24px] font-bold leading-tight tracking-[-0.02em] text-[#1a1a2e] sm:text-[30px]">{item.name}</h2>
              <p className="mt-1.5 text-[14.5px] leading-[22px] text-[#4b5563]">{item.summary}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]" data-integration-standing={status}>
                <span className="inline-flex h-6 items-center rounded-full border border-[#e5e7eb] bg-white px-2.5 font-medium text-[#1a1a2e]">{CATEGORY_NAMES[item.category]}</span>
                {storelibMade ? <span className="text-[#6b7280]">{tt("Made by Storelib")}</span> : null}
                <span className="inline-flex items-center gap-1.5 font-medium text-[#1a1a2e]">
                  <span aria-hidden className={cn("h-2 w-2 rounded-full", DOT[standing.tone])} />
                  {standing.label}
                </span>
                <span className="basis-full text-[#6b7280] sm:basis-auto">{tracked && item.trackerId ? `${TRACKERS[item.trackerId].label}: ${tracked}` : standing.line}</span>
              </div>
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
                  data-integration-tab={t.id}
                  className={cn("relative inline-flex h-11 shrink-0 items-center gap-1.5 px-3 text-[13.5px] font-medium transition-colors [-webkit-tap-highlight-color:transparent]", on ? "text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]")}
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
        <div role="tabpanel" data-integration-tabpanel={tab}>
          <Body tab={tab} setTab={setTab} item={item} status={status} installed={installed} sections={sections} Layout={Layout} onChanged={(on) => item.appId && onApp(item.appId, on)} />
        </div>
      ) : (
        <Layout
          main={
            <>
              {setup}
              {statusSection}
              {overview}
              {data}
              {danger}
            </>
          }
          aside={glance}
        />
      )}

      <Modal
        open={confirming}
        onClose={() => (busy ? undefined : setConfirming(false))}
        title={plan?.verb === "turn_off" ? tt("Turn off {name}?", { name: item.name }) : plan?.verb === "remove" ? tt("Remove {name}?", { name: item.name }) : tt("Disconnect {name}?", { name: item.name })}
        footer={
          <div className="flex w-full justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setConfirming(false)} disabled={busy}>
              {tt("Cancel")}
            </button>
            <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void takeOff()} data-integration-uninstall-confirm="">
              {busy ? tt("Working on it") : verbLabel}
            </button>
          </div>
        }
      >
        <p className="text-[14px] leading-[21px] text-[#4b5563]">{plan?.consequence}</p>
      </Modal>
    </div>
  )
}

function TrackerInstall({ item, value, ready, onSaved }: { item: Integration; value: string | null; ready: boolean; onSaved: (t: Tracking) => void }) {
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
    if (!r.ok) return setError(r.error)
    onSaved(r.data.tracking)
    setSaved(true)
  }

  if (!ready) return <Notice tone="amber">{tt("Analytics and pixels need their database update (SQL part 112). Until it runs, nothing here is kept.")}</Notice>
  return (
    <div className="space-y-3" data-tracker-install={item.trackerId}>
      <Field label={t.label} htmlFor={`tracker-${item.trackerId}`} hint={tt("Where to find it: {where}", { where: t.where })}>
        <TextInput id={`tracker-${item.trackerId}`} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t.example} autoComplete="off" spellCheck={false} inputMode="text" />
      </Field>
      {error ? <Notice>{error}</Notice> : null}
      {saved && !error ? <p className="text-[13px] text-[#067647]" data-tracker-saved="">{value ? tt("Saved. {name} loads on your website from its next page view.", { name: t.name }) : tt("Removed from your website.")}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {value ? (
          <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void save(null)}>
            {tt("Remove")}
          </button>
        ) : null}
        <button type="button" className={BTN_PRIMARY} disabled={busy || !typed.trim() || typed.trim() === value} onClick={() => void save(typed)}>
          {busy ? tt("Saving") : value ? tt("Save") : tt("Install")}
        </button>
      </div>
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
      return setError(r.error)
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
          <button type="button" className={BTN_PRIMARY} disabled={state === "sending"} onClick={() => void ask()}>
            {state === "sending" ? tt("Sending") : tt("Tell me when it's ready")}
          </button>
        </div>
      )}
    </div>
  )
}
