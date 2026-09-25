"use client"

/**
 * ===========================================================================
 *  SETTINGS › DOMAINS
 * ===========================================================================
 * Four cards, top to bottom, in the order a creator meets them:
 *
 *   Connect your own domain   the field, what it should show, where to buy one
 *   Your domains              each domain, what it shows, its status, actions
 *   Set up DNS                the three steps, only while a domain waits
 *   How custom domains work   four lines that are true of today's routing
 *
 * It was part of settings-form-new.tsx; it lives here so the tab can change
 * without touching the other tabs. The parent keeps the list it was given
 * (the header's quick links read it) and this reports every change back.
 *
 * What a domain shows is the creator's choice now (custom_domains.target):
 * the website, the creator page or the OnePage. The records, the registrar
 * words and the check are shared with Website Settings › Domains through
 * components/domains/.
 */
import * as React from "react"
import { CheckCircle, ChevronDown, Clock, Globe, Loader2, Plus, AlertCircle, Check } from "lucide-react"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { DnsSetup } from "@/components/domains/dns-setup"
import { TargetChoice, targetCaveat, type TargetSources } from "@/components/domains/target-choice"
import { HowItWorks } from "@/components/domains/how-it-works"
import { DOMAIN_TARGETS, TARGET_LABEL, targetOf, type DomainTarget } from "@/lib/custom-domain/targets"
import type { DnsChecks } from "@/lib/custom-domain/dns"
import { getStoreUrlDisplay, getWebsiteUrlDisplay } from "@/lib/url-helpers"
import { cn } from "@/lib/utils"

export interface DomainRow {
  id: string
  domain: string
  status: string
  target?: string | null
  created_at: string
  verified_at?: string | null
  ssl_status?: string | null
  verification_token?: string | null
}

interface DomainSources {
  website: { live: boolean; handle: string | null }
  onepage: { live: boolean }
  username: string | null
}

const CARD = "bg-white rounded-2xl border border-[#e5e7eb]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-4 sm:p-6"
const H3 = "text-[15px] font-semibold text-[#1a1a2e]"
const SECONDARY =
  "inline-flex h-11 sm:h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] disabled:cursor-default disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"

function StatusPill({ status }: { status: string }) {
  const base = "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold"
  if (status === "active")
    return (
      <span className={cn(base, "bg-emerald-50 text-emerald-700")} title="Live with HTTPS">
        <CheckCircle className="h-3 w-3" aria-hidden /> Connected
      </span>
    )
  if (status === "ssl_provisioning")
    return (
      <span className={cn(base, "bg-blue-50 text-blue-700")} title="DNS is right, HTTPS is being set up">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> HTTPS pending
      </span>
    )
  if (status === "verifying")
    return (
      <span className={cn(base, "bg-amber-50 text-amber-700")} title="Checking the DNS records">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Verifying
      </span>
    )
  if (status === "failed")
    return <span className={cn(base, "bg-red-50 text-red-700")}>Not connected</span>
  return (
    <span className={cn(base, "bg-gray-100 text-gray-600")} title="Waiting for the DNS records">
      <Clock className="h-3 w-3" aria-hidden /> Pending
    </span>
  )
}

const formatAdded = (iso: string) => new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })

/**
 * The domains last read, so opening the tab again draws them at once and
 * reads them again quietly, the way Website Settings does.
 */
let lastRead: { sources: DomainSources | null; targetReady: boolean } | null = null

export function DomainsPanel({
  username,
  userPlan,
  planLoading,
  websiteHandle,
  domains,
  onDomainsChange,
}: {
  username: string
  userPlan: string | null
  planLoading: boolean
  /** The website's own storelib.com name when it has one (Website Settings › Domains). */
  websiteHandle?: string | null
  domains: DomainRow[]
  onDomainsChange: React.Dispatch<React.SetStateAction<DomainRow[]>>
}) {
  const locked = !planLoading && (userPlan === "free" || userPlan === null)
  const [loading, setLoading] = React.useState(lastRead === null && domains.length === 0)
  const [sources, setSources] = React.useState<DomainSources | null>(lastRead?.sources ?? null)
  const [targetReady, setTargetReady] = React.useState(lastRead?.targetReady ?? true)

  React.useEffect(() => {
    let alive = true
    fetch("/api/domains")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { domains?: DomainRow[]; sources?: DomainSources; targetReady?: boolean }
        if (!alive || !res.ok) return
        if (data.domains) onDomainsChange(data.domains)
        setSources(data.sources ?? null)
        setTargetReady(data.targetReady !== false)
        lastRead = { sources: data.sources ?? null, targetReady: data.targetReady !== false }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [onDomainsChange])

  const name = (sources?.username || username || "").toLowerCase()
  const targetSources: TargetSources = {
    websiteHost: getWebsiteUrlDisplay((sources?.website.handle || websiteHandle || name || "you").toLowerCase()),
    websiteLive: sources?.website.live ?? false,
    creatorPagePath: getStoreUrlDisplay(name || "you"),
    onepageLive: sources?.onepage.live ?? false,
  }

  /* ── Connecting ─────────────────────────────────────────────────── */
  const [input, setInput] = React.useState("")
  const [newTarget, setNewTarget] = React.useState<DomainTarget | null>(null)
  const chosenTarget: DomainTarget = newTarget ?? (targetSources.websiteLive ? "website" : "creator_page")
  const [adding, setAdding] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const clean = input.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "")
  const current = domains[0] ?? null

  const add = async () => {
    if (!clean) return
    /* One domain at a time: a new one replaces the old, which redirects for 30 days (app/api/domains). Said first. */
    if (current && current.domain !== clean && !confirming) {
      setConfirming(true)
      return
    }
    setAdding(true)
    setError(null)
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(targetReady ? { domain: clean, target: chosenTarget } : { domain: clean }),
      })
      const data = (await res.json().catch(() => ({}))) as { domain?: DomainRow; error?: string }
      if (!res.ok || !data.domain) throw new Error(data.error || "Could not connect that domain")
      onDomainsChange((prev) => [data.domain as DomainRow, ...prev.filter((d) => d.domain !== clean && d.status !== "active" && d.status !== "ssl_provisioning" && d.status !== "pending" && d.status !== "verifying")])
      setInput("")
      setConfirming(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect that domain")
    } finally {
      setAdding(false)
    }
  }

  /* ── Checking ───────────────────────────────────────────────────── */
  const [checking, setChecking] = React.useState<string | null>(null)
  const [checks, setChecks] = React.useState<Record<string, DnsChecks>>({})
  const [results, setResults] = React.useState<Record<string, { ok: boolean; message: string }>>({})

  const verify = React.useCallback(
    async (id: string, quiet = false) => {
      if (!quiet) setChecking(id)
      try {
        const res = await fetch("/api/domains/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domainId: id }),
        })
        const data = (await res.json().catch(() => ({}))) as {
          verified?: boolean
          sslPending?: boolean
          message?: string
          error?: string
          checks?: DnsChecks
          issues?: string[]
        }
        if (!res.ok) throw new Error(data.error || "Could not check the DNS records")
        if (data.checks) setChecks((prev) => ({ ...prev, [id]: data.checks as DnsChecks }))
        const status = data.verified ? (data.sslPending ? "ssl_provisioning" : "active") : "pending"
        onDomainsChange((prev) =>
          prev.map((d) => (d.id === id ? { ...d, status, ...(data.verified ? { verified_at: d.verified_at ?? new Date().toISOString() } : {}) } : d)),
        )
        const trouble = (data.issues ?? []).length > 0
        setResults((prev) => ({
          ...prev,
          [id]: { ok: !!data.verified && !trouble, message: data.message || (data.verified ? "DNS is right." : "The records are not showing yet.") },
        }))
      } catch (e) {
        if (!quiet) setResults((prev) => ({ ...prev, [id]: { ok: false, message: e instanceof Error ? e.message : "Could not check the DNS records" } }))
      } finally {
        if (!quiet) setChecking(null)
      }
    },
    [onDomainsChange],
  )

  /* HTTPS being issued: asked again every 10 seconds until it is live. */
  const provisioning = domains.filter((d) => d.status === "ssl_provisioning").map((d) => d.id).join(",")
  React.useEffect(() => {
    if (!provisioning) return
    const ids = provisioning.split(",")
    const run = () => ids.forEach((id) => void verify(id, true))
    const first = window.setTimeout(run, 2000)
    const every = window.setInterval(run, 10000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(every)
    }
  }, [provisioning, verify])

  /* ── Changing what it shows, and removing ──────────────────────── */
  const [changing, setChanging] = React.useState<string | null>(null)
  const [rowError, setRowError] = React.useState<{ id: string; text: string } | null>(null)
  const changeTarget = async (d: DomainRow, target: DomainTarget) => {
    if (targetOf(d) === target) return
    const caveat = targetCaveat(target, targetSources)
    if (caveat?.blocked) {
      setRowError({ id: d.id, text: caveat.text })
      return
    }
    setChanging(d.id)
    setRowError(null)
    try {
      const res = await fetch("/api/domains", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: d.id, target }),
      })
      const data = (await res.json().catch(() => ({}))) as { domain?: DomainRow; error?: string }
      if (!res.ok) throw new Error(data.error || "Could not change what the domain shows")
      onDomainsChange((prev) => prev.map((x) => (x.id === d.id ? { ...x, target } : x)))
    } catch (e) {
      setRowError({ id: d.id, text: e instanceof Error ? e.message : "Could not change what the domain shows" })
    } finally {
      setChanging(null)
    }
  }

  const [removing, setRemoving] = React.useState<string | null>(null)
  const remove = async (id: string) => {
    setRemoving(id)
    try {
      const res = await fetch("/api/domains", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: id }),
      })
      if (res.ok) onDomainsChange((prev) => prev.filter((d) => d.id !== id))
    } finally {
      setRemoving(null)
    }
  }

  const suggestions = name ? [`${name}.com`, `${name}.store`, `${name}.shop`, `${name}.io`] : []
  const waiting = domains.filter((d) => d.status !== "active")
  const explained = current ? targetOf(current) : chosenTarget

  const showsMenu = (d: DomainRow, className: string) => {
    const on = targetOf(d)
    const items: ActionMenuItem[] = DOMAIN_TARGETS.map((t) => ({
      label: TARGET_LABEL[t],
      icon: t === on ? <Check className="h-4 w-4" /> : <span className="inline-block h-4 w-4" />,
      onClick: () => void changeTarget(d, t),
    }))
    if (!targetReady) return <span className="text-[13px] text-[#374151]">{TARGET_LABEL[on]}</span>
    return (
      <ResponsiveActionMenu
        title={`What ${d.domain} shows`}
        items={items}
        align="start"
        trigger={
          <button type="button" aria-label={`${d.domain} shows your ${TARGET_LABEL[on].toLowerCase()}. Change`} className={cn(SECONDARY, className)} disabled={changing === d.id}>
            {changing === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {TARGET_LABEL[on]}
            <ChevronDown className="h-3.5 w-3.5 text-[#9ca3af]" aria-hidden />
          </button>
        }
      />
    )
  }

  const noteFor = (d: DomainRow): string | null => {
    const t = targetOf(d)
    if (t === "website" && !targetSources.websiteLive) return "Shows your creator page until your website is published."
    if (d.status !== "active") return `Until DNS is set, use ${t === "website" ? targetSources.websiteHost : t === "creator_page" ? targetSources.creatorPagePath : `${targetSources.creatorPagePath}/links`}.`
    return null
  }

  return (
    <div data-domains-panel="" className="space-y-4 sm:space-y-6">
      {locked ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#1a1a2e] px-4 py-3 sm:px-6">
          <p className="min-w-0 truncate text-[13px] font-medium text-white sm:text-[14px]">
            <span className="sm:hidden">Custom domains are on Pro</span>
            <span className="hidden sm:inline">Custom domains are available on the Pro plan.</span>
          </p>
          <a
            href="/app/settings/billing/upgrade"
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-white px-4 text-[13px] font-semibold text-[#1a1a2e] no-underline hover:bg-[#f3f4f6] sm:h-9"
          >
            Upgrade
          </a>
        </div>
      ) : null}

      {/* ── Connect ─────────────────────────────────────────────────── */}
      <section className={cn(CARD, locked && "pointer-events-none select-none opacity-60")} aria-labelledby="domains-connect">
        <h3 id="domains-connect" className={H3}>
          Connect your own domain
        </h3>
        <p className="mt-1 text-[13px] text-[#6b7280]">Use a domain you already own for your website, creator page or OnePage.</p>

        <div className="mt-4 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" aria-hidden />
            <input
              type="text"
              aria-label="Domain"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setError(null)
                setConfirming(false)
              }}
              onKeyDown={(e) => e.key === "Enter" && void add()}
              placeholder="yourdomain.com"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={locked}
              className="h-11 w-full rounded-xl border border-[#e5e7eb] pl-10 pr-4 text-[16px] transition-colors focus:border-[#8b5cf6] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] disabled:cursor-not-allowed sm:text-[14px]"
            />
          </div>
          <button
            type="button"
            onClick={() => void add()}
            disabled={adding || !clean || locked}
            className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-[#7c3aed] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            {confirming ? "Replace" : "Connect"}
          </button>
        </div>

        {confirming && current && (
          <p className="mt-2 text-[13px] leading-snug text-[#b45309]">
            This replaces {current.domain}. For 30 days {current.domain} sends its visitors on to {clean}, then it stops. Press Replace to go ahead.
          </p>
        )}
        {error && (
          <p className="mt-2 flex items-center gap-2 text-[13px] text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {targetReady && (
          <div className="mt-4">
            <p className="mb-2 text-[13px] font-medium text-[#374151]">What it shows</p>
            <TargetChoice value={chosenTarget} onChange={setNewTarget} sources={targetSources} tone="light" disabled={locked} />
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <span className="text-[12px] text-[#9ca3af]">Get a domain:</span>
          <div className="flex items-center gap-1">
            <a href="https://www.hostinger.com/domain-name-search" target="_blank" rel="noopener noreferrer" className="inline-flex h-11 w-11 items-center justify-center rounded-lg opacity-90 transition-opacity hover:opacity-100 sm:h-8 sm:w-8" title="Hostinger" aria-label="Hostinger">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#374151" xmlns="http://www.w3.org/2000/svg" aria-hidden><path d="M16.415 0v7.16l5.785 3.384V2.949zM1.8 0v11.237h18.815L14.89 8.09l-7.457-.003V3.024zm14.615 20.894v-5.019l-7.514-.005c.007.033-5.82-3.197-5.82-3.197l19.119.091V24zM1.8 13.551v7.343l5.633 2.949v-6.988z"/></svg>
            </a>
            <a href="https://www.godaddy.com/en/domains" target="_blank" rel="noopener noreferrer" className="inline-flex h-11 w-11 items-center justify-center rounded-lg opacity-90 transition-opacity hover:opacity-100 sm:h-8 sm:w-8" title="GoDaddy" aria-label="GoDaddy">
              <svg width="20" height="20" viewBox="0 0 1534 1368" fill="#374151" xmlns="http://www.w3.org/2000/svg" aria-hidden><path fillRule="evenodd" d="M1391.5 968.9C1233.6 1221.8 986.7 1370 767 1367.2c-219.8 2.8-466.6-145.4-624.5-398.4C-71.6 625.8-41 220 210.9 62.4c159.2-99.5 369.2-75.9 555.8 41.8 187.2-117.8 397.1-141.3 556.5-41.8 251.9 157.6 282.2 563.4 68.3 906.5M280.3 929.8q11.3 16.5 23.4 32.3 12.2 15.9 25 31.1 12.8 15.3 26.4 30c-45.4-184.8-5.7-416.6 124.3-624.9Q497 370 516.5 343q19.5-27.1 40.8-52.7t44.3-49.7 47.7-46.6c-17.2-9-34.8-17.1-52.8-24.4-118.2-46.9-229.3-43.9-313.3 8.7-84 52.7-135.5 151.4-145.1 278.1q-1.8 26.9-1.3 53.8.4 27 3.1 53.8 2.7 26.9 7.6 53.4 5 26.5 12.1 52.5 7.9 30 18.2 59.3 10.2 29.3 22.6 57.8 12.4 28.4 26.9 55.8 14.6 27.5 31.1 53.7 10.5 16.9 21.9 33.3m1106.3-312.4q4.8-26.5 7.4-53.3 2.7-26.8 3.1-53.7t-1.4-53.8c-9.6-126.7-61-225.4-145.1-278-84-52.6-195.3-55.7-313.3-8.7q-24.9 10.2-48.8 22.4-24 12.3-46.9 26.5T797.1 249q-21.6 16.1-41.8 33.8c-31.1 27.3-60.2 56.8-86.9 88.2-26.8 31.5-51.2 65-73.1 100-21.9 35.1-41.2 71.7-57.8 109.6-16.5 37.9-30.2 77-41.1 116.9C477.5 767 470.3 839.2 475 911c9.5 126.8 61.1 225.6 145.1 278.1 10.8 6.7 22 12.5 33.5 17.6 11.6 5.1 23.5 9.5 35.6 13s24.5 6.2 37 8.1c12.5 1.8 25.1 2.8 37.7 3h6.5c12.6-.2 25.2-1.2 37.7-3.1 12.5-1.8 24.8-4.5 37-8 12.1-3.6 24-7.9 35.5-13 11.6-5.1 22.8-11 33.6-17.6 83.9-52.5 135.5-151.3 145-278 4.8-71.9-2.4-144.1-21.4-213.6-4.9-19.8-11.4-39-17.9-58.6l-201 125.7c-2.8 1.8-6 3-9.2 3.6-3.3.5-6.7.4-9.9-.3-3.3-.8-6.4-2.2-9.1-4.1-2.7-2-5-4.4-6.7-7.2l-45.5-72.9c-1.8-2.8-3-5.9-3.5-9.2-.6-3.3-.5-6.7.3-9.9.7-3.3 2.1-6.3 4-9 2-2.8 4.4-5.1 7.2-6.8l310.2-194c2.9-1.9 6.2-3.2 9.7-3.7 3.5-.6 7-.4 10.4.5 3.4 1 6.6 2.6 9.3 4.8s4.9 5 6.5 8.2c99.5 190.3 127.1 393.2 86.5 558.8q13.5-14.7 26.4-30 12.8-15.3 24.9-31.2t23.5-32.3q11.3-16.5 21.9-33.4 16.5-26.3 31-53.7 14.6-27.4 27-55.9 12.4-28.4 22.6-57.7t18.2-59.3q7.1-26 12-52.5"/></svg>
            </a>
            <a href="https://www.namecheap.com/domains/" target="_blank" rel="noopener noreferrer" className="inline-flex h-11 w-11 items-center justify-center rounded-lg opacity-90 transition-opacity hover:opacity-100 sm:h-8 sm:w-8" title="Namecheap" aria-label="Namecheap">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#374151" xmlns="http://www.w3.org/2000/svg" aria-hidden><path d="M17.295 17.484c.227.403.57.728.985.931-.309.15-.647.229-.99.232h-3.068a2.26 2.26 0 0 1-1.957-1.143L6.705 6.511a2.27 2.27 0 0 0-.974-.922c.309-.153.652-.233.997-.232h3.05c.81.003 1.558.438 1.959 1.143zm-9.329-7.392L6.269 6.755c-.209-.392-.582-.657-.984-.829-.204.165-.391.35-.522.581-.184.349-4.391 8.648-4.569 8.987a2.245 2.245 0 0 0 4.016 1.999zm15.846-1.593a2.245 2.245 0 0 0-1.162-2.955v-.001a2.2 2.2 0 0 0-.892-.187l-.003-.011c-.816 0-1.569.443-1.965 1.157l-3.749 7.414 1.689 3.323c.213.399.59.664.998.839.252-.2.473-.444.605-.742z"/></svg>
            </a>
          </div>
        </div>

        {suggestions.length > 0 && domains.length === 0 && (
          <div className="mt-3">
            <p className="mb-2 text-[12px] font-medium text-[#6b7280]">Suggested for {name}</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((sd, idx) => (
                <button
                  key={sd}
                  type="button"
                  onClick={() => {
                    setInput(sd)
                    setError(null)
                  }}
                  className={cn(
                    "inline-flex h-11 cursor-pointer items-center rounded-lg border border-[#ede9fe] bg-[#f5f3ff] px-3 text-[13px] font-medium text-[#7c3aed] transition-colors hover:bg-[#ede9fe] sm:h-8",
                    idx >= 3 && "hidden sm:inline-flex",
                  )}
                >
                  {sd}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Your domains ────────────────────────────────────────────── */}
      <section className={cn(CARD, locked && "pointer-events-none select-none opacity-60")} aria-labelledby="domains-list">
        <h3 id="domains-list" className={cn(H3, "mb-3")}>
          Your domains
        </h3>
        {loading ? (
          <div className="flex min-h-[120px] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#7c3aed]" aria-hidden />
          </div>
        ) : domains.length === 0 ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center text-center">
            <p className="text-[13px] text-[#6b7280]">No domains connected yet</p>
          </div>
        ) : (
          <div role="table" aria-label="Your domains">
            <div role="row" className="hidden gap-4 border-b border-[#e5e7eb] pb-2.5 sm:grid sm:grid-cols-[minmax(0,1fr)_150px_130px_130px_170px]">
              {["Domain", "Shows", "Status", "Added"].map((h) => (
                <span key={h} role="columnheader" className="text-[12px] font-medium text-[#6b7280]">
                  {h}
                </span>
              ))}
              <span role="columnheader" className="text-right text-[12px] font-medium text-[#6b7280]">
                Actions
              </span>
            </div>
            {domains.map((d) => {
              const note = noteFor(d)
              return (
                <div key={d.id} role="row" data-domain-row={d.domain} className="border-b border-[#f3f4f6] py-3.5 last:border-0 sm:grid sm:grid-cols-[minmax(0,1fr)_150px_130px_130px_170px] sm:items-center sm:gap-4">
                  <div role="cell" className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{d.domain}</p>
                      {note && <p className="mt-0.5 text-[12px] leading-snug text-[#6b7280]">{note}</p>}
                    </div>
                    <span className="shrink-0 sm:hidden">
                      <StatusPill status={d.status} />
                    </span>
                  </div>
                  <div role="cell" className="mt-2 flex items-center gap-2 sm:mt-0">
                    <span className="text-[12px] text-[#6b7280] sm:hidden">Shows</span>
                    {showsMenu(d, "")}
                  </div>
                  <div role="cell" className="hidden sm:block">
                    <StatusPill status={d.status} />
                  </div>
                  <p role="cell" className="mt-1 text-[12px] text-[#6b7280] sm:mt-0 sm:text-[13px]">
                    <span className="sm:hidden">Added </span>
                    {formatAdded(d.created_at)}
                  </p>
                  <div role="cell" className="mt-3 flex items-center gap-2 sm:mt-0 sm:justify-end">
                    {d.status !== "active" && (
                      <button type="button" onClick={() => void verify(d.id)} disabled={checking === d.id} className={cn(SECONDARY, "flex-1 border-[#ede9fe] bg-[#f5f3ff] text-[#7c3aed] hover:bg-[#ede9fe] sm:flex-none")}>
                        {checking === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                        Check DNS
                      </button>
                    )}
                    <button type="button" onClick={() => void remove(d.id)} disabled={removing === d.id} className={cn(SECONDARY, "hover:border-red-200 hover:text-red-600", d.status === "active" && "flex-1 sm:flex-none")}>
                      {removing === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                      Remove
                    </button>
                  </div>
                  {rowError?.id === d.id && <p className="mt-2 text-[12px] text-red-600 sm:col-span-5">{rowError.text}</p>}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── DNS, while a domain waits ───────────────────────────────── */}
      {waiting.map((d) => (
        <section key={d.id} className={CARD} aria-label={`Set up DNS for ${d.domain}`} data-dns-card={d.domain}>
          <h3 className={cn(H3, "mb-4")}>Set up DNS for {d.domain}</h3>
          <DnsSetup
            domain={d.domain}
            verificationToken={d.verification_token}
            checks={checks[d.id] ?? null}
            status={d.status}
            checking={checking === d.id}
            onCheck={() => void verify(d.id)}
            result={
              results[d.id] ??
              (d.status === "ssl_provisioning" ? { ok: true, message: "DNS is right. HTTPS is being set up; this page checks every 10 seconds." } : null)
            }
            tone="light"
          />
        </section>
      ))}

      {/* ── How it works ────────────────────────────────────────────── */}
      <section className={CARD} aria-labelledby="domains-how">
        <h3 id="domains-how" className={cn(H3, "mb-3")}>
          How custom domains work
        </h3>
        <HowItWorks domain={current?.domain ?? null} target={explained} sources={targetSources} tone="light" />
      </section>
    </div>
  )
}
