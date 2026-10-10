"use client"

/**
 * ===========================================================================
 *  SETTINGS › INTEGRATIONS
 * ===========================================================================
 * Every service a store can connect (lib/integrations/catalog.ts), as a
 * directory: a search, Request integration, the categories as pills with
 * how many each holds, Installed, and a card for each with its own mark and
 * a badge for where it stands (Storelib for a built in one, Installed,
 * Needs attention, Error, Coming soon). A card opens the integration's own page:
 * About, At a glance, Data ownership and Install, with Back to integrations.
 *
 * The page is kept in the address (?tab=integrations&integration=meta-pixel)
 * so a link to it opens it, and Back goes back to the list where it was.
 *
 * Installed means: a pixel with its ID saved, a provider with a key or an
 * address saved. Built in means it works with nothing to connect.
 */
import * as React from "react"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, ExternalLink, Search, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Field, Modal, Notice, TextInput, api, peekGet } from "@/components/physical/ui"
import { IntegrationCard, type IntegrationState } from "@/components/physical/integrations-marketplace"
import { CATEGORY_NAMES, CATEGORY_ORDER, STATUS_LABEL, searchIntegrations, visibleIntegrations, type Integration, type IntegrationCategory, type IntegrationStatus } from "@/lib/integrations/catalog"
import { applyCatalogOverrides, type CatalogOverride } from "@/lib/integrations/overrides"
import { providerInfo } from "@/lib/physical/providers"
import { TRACKERS, type Tracking } from "@/lib/store/tracking"

type Filter = "all" | "installed" | IntegrationCategory

const CARD = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

function writeIntegrationParam(id: string | null) {
  try {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("integration", id)
    else url.searchParams.delete("integration")
    window.history.replaceState(window.history.state, "", url.toString())
  } catch {
    /* An address that can't be written: the page still opens. */
  }
}

/* Storelib's own, built in: its icons, on the app's quiet tile. */
/*
  STORELIB'S OWN, DRAWN FOR IT. Four small line drawings in the same hand as
  the How it works art: a taped parcel, a letter with an order slip, two
  systems joined by a signed request, a sheet of rows. Ink on light grey.
*/
const BUILT_IN_ART: Record<string, React.ReactNode> = {
  manual: (
    <>
      <path d="M4 8.5 12 4.5l8 4v8L12 20.5l-8-4z" />
      <path d="M4 8.5 12 12.5l8-4M12 12.5v8" />
      <path d="M8 6.5l8 4v3" />
    </>
  ),
  "supplier-email": (
    <>
      <rect x="3.5" y="6" width="17" height="12.5" rx="2" />
      <path d="m4 7 8 6 8-6" />
      <path d="M14.5 3.5h5v4" />
    </>
  ),
  "custom-webhook": (
    <>
      <rect x="3" y="4" width="7" height="7" rx="2" />
      <rect x="14" y="13" width="7" height="7" rx="2" />
      <path d="M10 7.5h3.5a3 3 0 0 1 3 3V13" />
      <path d="m14.5 11 2 2 2-2" />
    </>
  ),
  csv: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M4 9h16M4 14.5h16M10 9v11.5" />
    </>
  ),
}

export function Mark({ item, size = 44 }: { item: Pick<Integration, "logo" | "name"> & { id?: string }; size?: number }) {
  const art = item.id ? BUILT_IN_ART[item.id] : undefined
  if (art) {
    /* Storelib's own: a drawing on light grey, with Storelib's real mark in the corner, so a built in reads as Storelib's at a glance. */
    const badge = Math.round(size * 0.4)
    return (
      <span aria-hidden style={{ width: size, height: size }} className="relative flex shrink-0 items-center justify-center rounded-xl border border-[#eceef1] bg-[#f6f7f9] text-[#1a1a2e]" data-integration-mark="storelib">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ width: size * 0.5, height: size * 0.5 }}>
          {art}
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/storelib-mark.svg" alt="" width={badge} height={badge} decoding="async" style={{ width: badge, height: badge }} className="absolute -bottom-1 -right-1 rounded-[6px] shadow-[0_0_0_2px_#fff]" />
      </span>
    )
  }
  if (item.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={item.logo} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-xl border border-[#eceef1] bg-white object-contain p-2" />
    )
  }
  return (
    <span aria-hidden style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-xl border border-[#eceef1] bg-[#f6f7f9] text-[17px] font-semibold text-[#1a1a2e]">
      {item.name.replace(/^(Your own |Ship it )/, "").charAt(0).toUpperCase()}
    </span>
  )
}

export function IntegrationsDirectory() {
  const physical = usePhysicalCommerceEnabled()
  const all = React.useMemo(() => visibleIntegrations(physical), [physical])
  const [tracking, setTracking] = React.useState<Tracking | null>(() => peekGet<{ tracking: Tracking }>("/api/store/integrations")?.tracking ?? null)
  const [trackingReady, setTrackingReady] = React.useState(() => peekGet<{ ready: boolean }>("/api/store/integrations")?.ready ?? true)
  const [states, setStates] = React.useState<IntegrationState[] | null>(() => (physical ? (peekGet<{ integrations: IntegrationState[] }>("/api/physical/integrations")?.integrations ?? null) : []))
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<Filter>("all")
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [requesting, setRequesting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [overrides, setOverrides] = React.useState<CatalogOverride[]>(() => peekGet<{ overrides: CatalogOverride[] }>("/api/store/integrations/catalog")?.overrides ?? [])
  /* Where the list was scrolled when a card was opened, so Back lands there again. */
  const listScroll = React.useRef(0)
  const shownAll = React.useMemo(() => applyCatalogOverrides(all, overrides, physical), [all, overrides, physical])
  /* The open page follows ?integration=, on arriving and whenever it changes after: a sidebar row for
     another integration, Back and Forward. It was read once on mount, so a second row did nothing. */
  const wanted = useSearchParams()?.get("integration") ?? null
  React.useEffect(() => setOpenId(wanted), [wanted])

  React.useEffect(() => {
    void api<{ overrides: CatalogOverride[] }>("/api/store/integrations/catalog").then((r) => {
      if (r.ok) setOverrides(r.data.overrides ?? [])
    })
  }, [])
  React.useEffect(() => {
    void api<{ tracking: Tracking; ready: boolean }>("/api/store/integrations").then((r) => {
      if (r.ok) {
        setTracking(r.data.tracking)
        setTrackingReady(r.data.ready)
      } else setError(r.error)
    })
  }, [])
  React.useEffect(() => {
    if (!physical) return
    void api<{ integrations: IntegrationState[] }>("/api/physical/integrations").then((r) => setStates(r.ok ? r.data.integrations : []))
  }, [physical])

  const installed = React.useCallback(
    (i: Integration): boolean => {
      if (i.kind === "tracker") return !!(i.trackerId && tracking?.[i.trackerId])
      if (i.kind !== "commerce") return false
      const s = states?.find((x) => x.provider === i.providerId)
      return !!s && s.status !== "disconnected"
    },
    [tracking, states],
  )

  /* One word for where each stands, read off what is really saved: never an installed state that isn't. */
  const statusOf = React.useCallback(
    (i: Integration): IntegrationStatus => {
      if (i.builtIn) return "built_in"
      if (i.kind === "commerce") {
        const s = states?.find((x) => x.provider === i.providerId)
        if (s?.status === "error") return "error"
        if (s && s.status !== "disconnected") return s.lastError ? "needs_attention" : "installed"
      } else if (installed(i)) return "installed"
      return i.comingSoon ? "coming_soon" : "available"
    },
    [states, installed],
  )

  const scroller = () => document.querySelector("[data-integrations]")?.closest("[data-settings-sheet-scroll], .app-content-scroll") as HTMLElement | null
  const open = (id: string | null) => {
    if (id) listScroll.current = scroller()?.scrollTop ?? 0
    setOpenId(id)
    writeIntegrationParam(id)
    requestAnimationFrame(() => {
      /* A page opens at its top; Back puts the list where it was left, filter and search as they were. */
      if (id) document.querySelector("[data-integrations]")?.scrollIntoView({ block: "start" })
      else scroller()?.scrollTo({ top: listScroll.current, behavior: "instant" as ScrollBehavior })
    })
  }

  const current = shownAll.find((i) => i.id === openId) ?? null
  if (current) {
    return (
      <div data-integrations="" className="scroll-mt-4">
        <IntegrationPage
          item={current}
          status={statusOf(current)}
          installed={installed(current)}
          tracking={tracking}
          trackingReady={trackingReady}
          states={states}
          onTracking={(t) => {
            setTracking(t)
            /* The sidebar's Integrations group reads again (components/app/sidebar.tsx). */
            window.dispatchEvent(new Event("storelib:integrations-changed"))
          }}
          onStates={(st) => {
            setStates(st)
            window.dispatchEvent(new Event("storelib:integrations-changed"))
          }}
          onBack={() => open(null)}
        />
      </div>
    )
  }

  const counts = new Map<Filter, number>([["all", shownAll.length], ["installed", shownAll.filter((i) => installed(i) || i.builtIn).length]])
  for (const c of CATEGORY_ORDER) counts.set(c, shownAll.filter((i) => i.category === c).length)
  const pills: Filter[] = ["all", "installed", ...CATEGORY_ORDER.filter((c) => (counts.get(c) ?? 0) > 0)]
  const shown = searchIntegrations(shownAll, query).filter((i) => (filter === "all" ? true : filter === "installed" ? installed(i) || i.builtIn : i.category === filter))

  return (
    <div data-integrations="" className="scroll-mt-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search integrations</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations"
            className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-3 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#9ca3af] focus:ring-[3px] focus:ring-[rgba(17,24,39,0.06)] sm:text-[14px]"
            data-integrations-search=""
          />
        </label>
        <button type="button" className={cn(BTN_SECONDARY, "shrink-0")} onClick={() => setRequesting(true)} data-request-integration="">
          Request integration
        </button>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Categories" data-integration-pills="">
        {pills.map((f) => {
          const on = filter === f
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-[background-color,border-color,color] duration-200 ease-out motion-reduce:transition-none",
                on ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#d1d5db] hover:bg-[#f8f9fa]",
              )}
            >
              {f === "all" ? "All" : f === "installed" ? "Installed" : CATEGORY_NAMES[f]}
              <span className={cn("tabular-nums", on ? "text-white/70" : "text-[#9ca3af]")}>{counts.get(f) ?? 0}</span>
            </button>
          )
        })}
      </div>

      {error ? <Notice>{error}</Notice> : null}
      {shown.length === 0 ? (
        <div className={cn(CARD, "px-5 py-10 text-center")}>
          <p className="text-[14px] font-medium text-[#1a1a2e]">{filter === "installed" && !query ? "Nothing installed yet" : "No integrations match"}</p>
          <p className="mt-1 text-[13px] text-[#6b7280]">Can&apos;t find the one you use? Ask for it.</p>
          <button type="button" className={cn(BTN_SECONDARY, "mt-3")} onClick={() => setRequesting(true)}>
            Request integration
          </button>
        </div>
      ) : (
        /* One list for every pill: a switch only adds and removes cards, each keeping its place, so nothing flashes or zooms. */
        <ul className="grid gap-3 sm:grid-cols-2" data-integration-grid="">
          {shown.map((i) => {
            const status = statusOf(i)
            return (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => open(i.id)}
                  data-integration-card={i.id}
                  className={cn(CARD, "group flex h-full w-full flex-col gap-3 p-4 text-left transition-[box-shadow,border-color,background-color] duration-200 ease-out hover:border-[#dfe2e6] hover:shadow-[0_2px_10px_-4px_rgba(17,24,39,0.10)] motion-reduce:transition-none")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Mark item={i} />
                    <StatusBadge status={status} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold text-[#1a1a2e]">{i.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-[#6b7280]">{i.summary}</p>
                  </div>
                  <p className="mt-auto text-[12px] font-medium text-[#9ca3af]">{CATEGORY_NAMES[i.category]}</p>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <RequestForm open={requesting} onClose={() => setRequesting(false)} />
    </div>
  )
}

type Tone = "gray" | "green" | "amber" | "red"
const TONE: Record<Tone, string> = {
  gray: "bg-[#f3f4f6] text-[#4b5563]",
  green: "bg-[#ecfdf3] text-[#067647]",
  amber: "bg-[#fffaeb] text-[#b54708]",
  red: "bg-[#fef3f2] text-[#b42318]",
}
function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium", TONE[tone])} data-integration-badge="">
      {tone === "green" ? <Check className="h-3 w-3" aria-hidden /> : null}
      {children}
    </span>
  )
}

/** Available has no badge: a card with nothing on it is one you can install. */
function StatusBadge({ status }: { status: IntegrationStatus }) {
  if (status === "available") return null
  const tone: Tone = status === "built_in" ? "gray" : status === "installed" ? "green" : status === "needs_attention" ? "amber" : status === "error" ? "red" : "gray"
  return <Badge tone={tone}>{status === "built_in" ? "Storelib" : STATUS_LABEL[status]}</Badge>
}

function IntegrationPage({
  item,
  status,
  installed,
  tracking,
  trackingReady,
  states,
  onTracking,
  onStates,
  onBack,
}: {
  item: Integration
  status: IntegrationStatus
  installed: boolean
  tracking: Tracking | null
  trackingReady: boolean
  states: IntegrationState[] | null
  onTracking: (t: Tracking) => void
  onStates: (s: IntegrationState[]) => void
  onBack: () => void
}) {
  return (
    <div className="space-y-4 sm:space-y-6" data-integration-page={item.id}>
      <button type="button" onClick={onBack} className="-ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg px-1 text-[13.5px] font-medium text-[#4b5563] hover:text-[#1a1a2e]" data-integration-back="">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to integrations
      </button>

      <div className={cn(CARD, "flex items-center gap-4 p-4 sm:p-6")}>
        <Mark item={item} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[18px] font-semibold text-[#1a1a2e] sm:text-[20px]">{item.name}</h2>
            <StatusBadge status={status} />
          </div>
          <p className="mt-0.5 text-[13.5px] text-[#6b7280]">{item.summary}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4 sm:space-y-6">
          <section className={cn(CARD, "p-4 sm:p-6")} aria-labelledby="integration-about">
            <h3 id="integration-about" className="text-[15px] font-semibold text-[#1a1a2e]">About</h3>
            <div className="mt-2 space-y-2 text-[14px] leading-[21px] text-[#4b5563]">
              {item.about.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            {item.paused ? (
              <Notice tone="gray" className="mt-3">{item.name} is paused on Storelib for now. Anything already set up keeps its settings.</Notice>
            ) : item.comingSoon && item.kind === "commerce" ? (
              <Notice tone="gray" className="mt-3">Storelib doesn&apos;t send orders to {item.name} yet. Your key is ready for when it does, and orders for it are marked to send by hand until then.</Notice>
            ) : null}
          </section>

          <section className={cn(CARD, "p-4 sm:p-6")} aria-labelledby="integration-install" data-integration-install="">
            <h3 id="integration-install" className="text-[15px] font-semibold text-[#1a1a2e]">Install</h3>
            <div className="mt-3">
              {item.kind === "listed" || (item.paused && !installed) ? (
                <NotifyMe item={item} />
              ) : item.kind === "tracker" && item.trackerId ? (
                <TrackerInstall item={item} value={tracking?.[item.trackerId] ?? null} ready={trackingReady} onSaved={onTracking} />
              ) : item.providerId && providerInfo(item.providerId) ? (
                <ul>
                  <IntegrationCard provider={providerInfo(item.providerId)!} state={states?.find((s) => s.provider === item.providerId) ?? null} loading={states === null} onSaved={onStates} startOpen={!item.builtIn} />
                </ul>
              ) : null}
            </div>
          </section>

          <section className={cn(CARD, "p-4 sm:p-6")} aria-labelledby="integration-data">
            <h3 id="integration-data" className="text-[15px] font-semibold text-[#1a1a2e]">Data ownership</h3>
            <ul className="mt-2 space-y-2 text-[14px] leading-[21px] text-[#4b5563]">
              {item.data.map((d) => (
                <li key={d} className="flex gap-2.5">
                  <span aria-hidden className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#9ca3af]" />
                  {d}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className={cn(CARD, "h-fit p-4 sm:p-5")} aria-labelledby="integration-glance" data-integration-glance="">
          <h3 id="integration-glance" className="text-[15px] font-semibold text-[#1a1a2e]">At a glance</h3>
          <dl className="mt-3 space-y-3">
            <div>
              <dt className="text-[12px] font-medium text-[#9ca3af]">Category</dt>
              <dd className="text-[13.5px] text-[#1a1a2e]">{CATEGORY_NAMES[item.category]}</dd>
            </div>
            {item.glance.map((g) => (
              <div key={g.label}>
                <dt className="text-[12px] font-medium text-[#9ca3af]">{g.label}</dt>
                <dd className="text-[13.5px] text-[#1a1a2e]">{g.value}</dd>
              </div>
            ))}
          </dl>
          {item.docsUrl ? (
            <a href={item.docsUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1a1a2e] underline decoration-black/20 underline-offset-[3px] hover:decoration-black/50">
              {item.name} help
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          ) : null}
        </aside>
      </div>
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

  if (!ready) return <Notice tone="amber">Analytics and pixels need their database update (SQL part 112). Until it runs, nothing here is kept.</Notice>
  return (
    <div className="space-y-3" data-tracker-install={item.trackerId}>
      <Field label={t.label} htmlFor={`tracker-${item.trackerId}`} hint={`Where to find it: ${t.where}`}>
        <TextInput id={`tracker-${item.trackerId}`} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t.example} autoComplete="off" spellCheck={false} inputMode="text" />
      </Field>
      {error ? <Notice>{error}</Notice> : null}
      {saved && !error ? <p className="text-[13px] text-[#067647]" data-tracker-saved="">{value ? `Saved. ${t.name} loads on your website from its next page view.` : "Removed from your website."}</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        {value ? (
          <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void save(null)}>
            Remove
          </button>
        ) : null}
        <button type="button" className={BTN_PRIMARY} disabled={busy || !typed.trim() || typed.trim() === value} onClick={() => void save(typed)}>
          {busy ? "Saving" : value ? "Save" : "Install"}
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
function NotifyMe({ item }: { item: Integration }) {
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const ask = async () => {
    setState("sending")
    setError(null)
    const r = await api("/api/store/integrations/request", { method: "POST", body: { name: item.name, integrationId: item.id } })
    if (!r.ok) {
      setState("idle")
      return setError(r.error)
    }
    setState("sent")
  }
  return (
    <div className="space-y-3" data-integration-notify={item.id}>
      <p className="text-[14px] leading-[21px] text-[#4b5563]">Not available yet. Ask for it and you&apos;ll be counted: the most asked for are built first.</p>
      {error ? <Notice>{error}</Notice> : null}
      {state === "sent" ? (
        <p className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#067647]" data-integration-notified="">
          <Check className="h-4 w-4" aria-hidden />
          You&apos;re on the list for {item.name}.
        </p>
      ) : (
        <div className="flex justify-end">
          <button type="button" className={BTN_PRIMARY} disabled={state === "sending"} onClick={() => void ask()}>
            {state === "sending" ? "Sending" : "Tell me when it's ready"}
          </button>
        </div>
      )}
    </div>
  )
}

function RequestForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = React.useState("")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    setName("")
    setNote("")
    setError(null)
    setSent(false)
  }, [open])
  const send = async () => {
    setBusy(true)
    setError(null)
    const r = await api("/api/store/integrations/request", { method: "POST", body: { name, note } })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setSent(true)
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request integration"
      footer={
        sent ? (
          <button type="button" className={BTN_PRIMARY} onClick={onClose}>
            Done
          </button>
        ) : (
          <div className="flex w-full justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy || !name.trim()} onClick={() => void send()}>
              {busy ? "Sending" : "Send request"}
            </button>
          </div>
        )
      }
    >
      {sent ? (
        <p className="text-[14px] leading-[21px] text-[#4b5563]" data-request-sent="">Thanks. We read every request, and the most asked for are built first.</p>
      ) : (
        <div className="space-y-3">
          <Field label="Which service?" htmlFor="request-name">
            <TextInput id="request-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Klaviyo" />
          </Field>
          <Field label="What would you use it for?" htmlFor="request-note" hint="Optional">
            <textarea id="request-note" value={note} maxLength={600} rows={3} onChange={(e) => setNote(e.target.value)} className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-[16px] outline-none focus:border-[#9ca3af] sm:text-[14px]" />
          </Field>
          {error ? <Notice>{error}</Notice> : null}
        </div>
      )}
    </Modal>
  )
}
