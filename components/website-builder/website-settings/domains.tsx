"use client"

import { Fragment, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { AddressValue, Badge, Card, ErrorNote, Lead, PageTitle, Row, buttonClass, inputClass, primaryButtonClass, textLinkClass } from "./parts"
import type { SettingsContext } from "./types"
import { cn } from "@/lib/utils"
import { handleProblem, normalizeHandle } from "@/lib/website-builder/site-address"
import { DnsSetup } from "@/components/domains/dns-setup"
import { TargetChoice, type TargetSources } from "@/components/domains/target-choice"
import { TARGET_LABEL, targetOf, type DomainTarget } from "@/lib/custom-domain/targets"
import type { DnsChecks } from "@/lib/custom-domain/dns"
import { getStoreUrlDisplay } from "@/lib/url-helpers"

interface DomainRow {
  id: string
  domain: string
  status: string
  target?: string | null
  ssl_status?: string | null
  verified_at?: string | null
  verification_token?: string | null
}

interface DomainSources {
  website: { live: boolean; handle: string | null }
  onepage: { live: boolean }
  username: string | null
}

/**
 * What a domain row's status means, in the words a creator would use. The
 * statuses are the domains route's (app/api/domains): a domain is added as
 * pending, checked, and active once its DNS answers; the certificate is
 * issued after that.
 */
function describe(d: DomainRow): { tone: "live" | "attention" | "critical" | "neutral"; label: string; ssl: string } {
  if (d.status === "active") {
    return { tone: "live", label: "Connected", ssl: d.ssl_status === "failed" ? "Certificate failed" : "Secured with HTTPS" }
  }
  if (d.status === "ssl_provisioning") return { tone: "attention", label: "Securing", ssl: "Certificate being issued" }
  if (d.status === "failed") return { tone: "critical", label: "Not connected", ssl: "No certificate" }
  return { tone: "attention", label: "Waiting for DNS", ssl: "Issued once DNS is set" }
}

/**
 * The domains last read, so coming back to this subject draws them at once
 * and reads them again quietly, rather than a spinner that the card then
 * grows out of, pushing the page down.
 */
let lastDomains: DomainRow[] | null = null
let lastSources: DomainSources | null = null

export function DomainSettings({ ctx }: { ctx: SettingsContext }) {
  const [domains, setDomains] = useState<DomainRow[] | null>(() => lastDomains)
  const [sources, setSources] = useState<DomainSources | null>(() => lastSources)
  const [targetReady, setTargetReady] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (domains && !error) lastDomains = domains
  }, [domains, error])

  useEffect(() => {
    let alive = true
    fetch("/api/domains")
      .then(async (res) => {
        const d = (await res.json().catch(() => ({}))) as { domains?: DomainRow[]; sources?: DomainSources; targetReady?: boolean; error?: string }
        if (!res.ok) throw new Error(d.error || "Could not load your domains")
        if (!alive) return
        setDomains(d.domains ?? [])
        if (d.sources) setSources((lastSources = d.sources))
        setTargetReady(d.targetReady !== false)
      })
      .catch((e) => {
        if (!alive) return
        setDomains([])
        setError(e instanceof Error ? e.message : "Could not load your domains")
      })
    return () => {
      alive = false
    }
  }, [])

  const manage = () => ctx.onNavigate("/app/settings?tab=domains")

  /* ── Adding one, here ─────────────────────────────────────────────── */
  const [draft, setDraft] = useState("")
  const [adding, setAdding] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [checking, setChecking] = useState<string | null>(null)
  const [checks, setChecks] = useState<Record<string, DnsChecks>>({})
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [note, setNote] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  const current = domains?.[0] ?? null
  const username = (sources?.username ?? "").toLowerCase()
  const targetSources: TargetSources = {
    websiteHost: ctx.websiteUrlDisplay,
    websiteLive: sources?.website.live ?? ctx.live,
    creatorPagePath: getStoreUrlDisplay(username || "you"),
    onepageLive: sources?.onepage.live ?? false,
  }
  const clean = draft.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "")

  const add = async () => {
    if (!clean) return
    /* A site has one domain: a new one replaces the old, which then
       redirects for 30 days (app/api/domains). Said, and asked, first. */
    if (current && current.domain !== clean && !confirming) {
      setConfirming(true)
      return
    }
    setAdding(true)
    setError(null)
    setNote(null)
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* Connected from this website's settings, so it shows this website. */
        body: JSON.stringify(targetReady ? { domain: clean, target: "website" } : { domain: clean }),
      })
      const d = (await res.json().catch(() => ({}))) as { domain?: DomainRow; error?: string }
      if (!res.ok || !d.domain) throw new Error(d.error || "Could not connect that domain")
      setDomains([d.domain])
      setDraft("")
      setConfirming(false)
      setNote("Now add the records below where you bought the domain, then press Check DNS.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect that domain")
    } finally {
      setAdding(false)
    }
  }

  const check = async (d: DomainRow) => {
    setChecking(d.id)
    setError(null)
    setNote(null)
    try {
      const res = await fetch("/api/domains/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: d.id }),
      })
      const r = (await res.json().catch(() => ({}))) as { verified?: boolean; sslPending?: boolean; message?: string; error?: string; checks?: DnsChecks; issues?: string[] }
      if (!res.ok) throw new Error(r.error || "Could not check the DNS records")
      if (r.checks) setChecks((prev) => ({ ...prev, [d.id]: r.checks as DnsChecks }))
      const trouble = (r.issues ?? []).length > 0
      if (r.verified) {
        setDomains((prev) => (prev ?? []).map((x) => (x.id === d.id ? { ...x, status: r.sslPending ? "ssl_provisioning" : "active" } : x)))
        setResults((prev) => ({ ...prev, [d.id]: { ok: !trouble, message: r.message || (r.sslPending ? "DNS is right. HTTPS is being set up." : "Connected.") } }))
      } else {
        setResults((prev) => ({ ...prev, [d.id]: { ok: false, message: r.message || "The records are not showing yet." } }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check the DNS records")
    } finally {
      setChecking(null)
    }
  }

  const point = async (d: DomainRow, target: DomainTarget) => {
    if (targetOf(d) === target) return
    setChanging(true)
    setError(null)
    try {
      const res = await fetch("/api/domains", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: d.id, target }),
      })
      const r = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(r.error || "Could not change what the domain shows")
      setDomains((prev) => (prev ?? []).map((x) => (x.id === d.id ? { ...x, target } : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change what the domain shows")
    } finally {
      setChanging(false)
    }
  }

  return (
    <>
      <PageTitle>Domains</PageTitle>
      <Lead>Your website's storelib.com address, and a domain of your own.</Lead>

      <Card title="Storelib address">
        <StorelibAddress ctx={ctx} />
        <Row label="HTTPS" inline>
          <Badge tone="live">Secured</Badge>
        </Row>
      </Card>

      <Card title="Custom domain">
        {domains === null ? (
          <div className="flex items-center justify-center py-10 text-white/45">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          domains.map((d) => {
            const s = describe(d)
            const waiting = d.status !== "active"
            const shows = targetOf(d)
            return (
              <Fragment key={d.id}>
                <Row label={`www.${d.domain}`} hint="Primary address" inline>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </Row>
                <Row label={d.domain} hint="Redirects">
                  <span className="text-[14px] text-white/60">to www.{d.domain}</span>
                </Row>
                {/*
                  What the domain shows. From here the question is usually
                  "is it this website": said plainly when it is not, with the
                  one press that makes it so. The full choice is below it.
                */}
                <div data-domain-shows={shows} className="space-y-3 px-4 py-4 md:px-6">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-[14.5px] font-medium text-white">Shows</p>
                      <p className="mt-0.5 text-[13px] leading-snug text-white/45">
                        {shows === "website"
                          ? targetSources.websiteLive
                            ? "This website."
                            : "This website once it is published. Your creator page until then."
                          : `Your ${TARGET_LABEL[shows].toLowerCase()}, not this website.`}
                      </p>
                    </div>
                    {shows !== "website" && targetReady && (
                      <button type="button" onClick={() => void point(d, "website")} disabled={changing} className={cn(buttonClass, "md:h-9")}>
                        {changing && <Loader2 className="h-4 w-4 animate-spin" />}
                        Show this website
                      </button>
                    )}
                  </div>
                  {targetReady && (
                    <TargetChoice value={shows} onChange={(t) => void point(d, t)} sources={targetSources} tone="dark" disabled={changing} label={`What ${d.domain} shows`} />
                  )}
                </div>
                <Row label="HTTPS" inline>
                  <span className="text-[14px] text-white/60">{s.ssl}</span>
                </Row>
                {waiting && (
                  <div className="px-4 py-4 md:px-6">
                    <DnsSetup
                      domain={d.domain}
                      verificationToken={d.verification_token}
                      checks={checks[d.id] ?? null}
                      status={d.status}
                      checking={checking === d.id}
                      onCheck={() => void check(d)}
                      result={results[d.id] ?? null}
                      tone="dark"
                    />
                  </div>
                )}
              </Fragment>
            )
          })
        )}

        {domains !== null && (
          <div className="space-y-3 px-4 py-4 md:px-6">
            <label htmlFor="wb-new-domain" className="block text-[14.5px] font-medium text-white">
              {current ? "Use a different domain" : "Connect a domain you own"}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="wb-new-domain"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setConfirming(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void add()
                }}
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="yourname.com"
                className={inputClass + " md:w-full"}
              />
              <button type="button" onClick={() => void add()} disabled={!clean || adding} className={cn(primaryButtonClass, "md:h-10")}>
                {adding && <Loader2 className="h-4 w-4 animate-spin" />}
                {confirming ? "Replace" : "Connect"}
              </button>
            </div>
            {confirming && current && (
              <p className="text-[13.5px] leading-snug text-amber-200">
                This replaces {current.domain}. For 30 days {current.domain} sends its visitors on to {clean}, then it stops. Press Replace to go ahead.
              </p>
            )}
          </div>
        )}
      </Card>

      {note && <p className="mt-4 text-[14px] text-white/70">{note}</p>}
      {domains && domains.length > 0 && (
        <button type="button" onClick={manage} className="mt-1 inline-flex min-h-11 items-center text-[13.5px] text-white/55 underline-offset-2 hover:text-white hover:underline md:mt-3 md:min-h-0 [-webkit-tap-highlight-color:transparent]">
          Remove the domain in Settings
        </button>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </>
  )
}

/**
 * ===========================================================================
 *  THE WEBSITE'S NAME ON STORELIB, CHANGED HERE, USERNAME UNTOUCHED
 * ===========================================================================
 * The address was the username and nothing else, so renaming the website
 * meant renaming the creator. It has a name of its own now, starting as the
 * username (lib/website-builder/site-address). Checked as it is typed, and
 * again by app/api/website-address before it is saved; the old address
 * keeps answering for the site, so nothing already shared breaks.
 */
function StorelibAddress({ ctx }: { ctx: SettingsContext }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const suffix = ctx.websiteUrlDisplay.includes(".") ? ctx.websiteUrlDisplay.slice(ctx.websiteUrlDisplay.indexOf(".")) : ".storelib.com"
  const current = ctx.websiteUrlDisplay.split(".")[0] ?? ""
  const wanted = normalizeHandle(draft)
  const problem = draft ? handleProblem(wanted) : null

  const save = async () => {
    if (!wanted || problem) return
    if (wanted === current) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/website-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: wanted }),
      })
      const d = (await res.json().catch(() => ({}))) as { handle?: string; error?: string }
      if (!res.ok || !d.handle) throw new Error(d.error || "Could not change the address")
      ctx.onAddressChanged(d.handle)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the address")
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <Row
        label="Address"
        hint={
          <button
            type="button"
            onClick={() => {
              setDraft(current)
              setError(null)
              setEditing(true)
            }}
            className={textLinkClass}
          >
            Change address
          </button>
        }
      >
        <AddressValue url={ctx.websiteUrl} display={ctx.websiteUrlDisplay} />
      </Row>
    )
  }

  return (
    <div className="space-y-3 px-4 py-4 md:px-6" data-address-editor="">
      <label htmlFor="wb-site-handle" className="block text-[14.5px] font-medium text-white">
        Website address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center rounded-lg border border-white/12 bg-[#171717] focus-within:border-white/35">
          <input
            id="wb-site-handle"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save()
              if (e.key === "Escape") setEditing(false)
            }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            className="h-11 min-w-0 flex-1 bg-transparent pl-3.5 text-[16px] text-white outline-none md:h-10 md:text-[14.5px]"
          />
          <span className="shrink-0 pr-3.5 text-[14.5px] text-white/45">{suffix}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button type="button" onClick={() => setEditing(false)} className={cn(buttonClass, "md:h-10")}>
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={!wanted || !!problem || saving} className={cn(primaryButtonClass, "md:h-10")}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
      <p className={cn("text-[13px] leading-snug", problem || error ? "text-[#f87171]" : "text-white/45")}>
        {problem || error || (wanted && wanted !== draft.trim().toLowerCase() ? `Will be ${wanted}${suffix}. Your username stays the same.` : "Your username stays the same. The old address keeps working.")}
      </p>
    </div>
  )
}

