"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { AddressValue, Badge, Card, ErrorNote, Lead, PageTitle, Row, buttonClass, inputClass, primaryButtonClass, textLinkClass, useSettingsLook } from "./parts"
import type { SettingsContext } from "./types"
import { DnsSetup, type DnsCheckResult } from "@/components/domains/dns-setup"
import { CNAME_TARGET, DEFAULT_A, type DnsRecord } from "@/lib/custom-domains/hostname"
import type { RecordCheck } from "@/lib/custom-domains/dns-help"
import { cn } from "@/lib/utils"
import { handleProblem, normalizeHandle } from "@/lib/website-builder/site-address"
import { tt } from "@/lib/i18n/text"

export interface DomainRow {
  id: string
  domain: string
  status: string
  ssl_status?: string | null
  verified_at?: string | null
  verification_token?: string | null
  /** From app/api/domains: what it is for, where it is served, and the records it needs. */
  purpose?: string | null
  /** The one every other website domain, and the Storelib address, send visitors to once it is live. */
  is_primary?: boolean | null
  host?: string | null
  apex?: boolean | null
  records?: { type: string; name: string; value: string }[] | null
}

/**
 * The records a domain needs: the ones app/api/domains sent, else the defaults in lib/custom-domains/hostname.
 * Drawn by the same three steps as Settings › Domains (components/domains/dns-setup.tsx).
 */
export function recordsFor(d: DomainRow): DnsRecord[] {
  if (d.records && d.records.length > 0) return d.records as DnsRecord[]
  return [
    { type: "A", name: "@", value: DEFAULT_A },
    { type: "CNAME", name: "www", value: CNAME_TARGET },
    ...(d.verification_token ? [{ type: "TXT" as const, name: "_storelib", value: d.verification_token }] : []),
  ]
}

/**
 * What a domain row's status means, in the words a creator would use. The
 * statuses are the domains route's (app/api/domains): a domain is added as
 * pending, checked, and active once its DNS answers; the certificate is
 * issued after that.
 */
export function describe(d: DomainRow): { tone: "live" | "attention" | "critical" | "neutral"; label: string; ssl: string } {
  if (d.status === "active") {
    return { tone: "live", label: tt("Connected"), ssl: d.ssl_status === "failed" ? tt("Certificate failed") : tt("Secured with HTTPS") }
  }
  if (d.status === "ssl_provisioning") return { tone: "attention", label: tt("Securing"), ssl: tt("Certificate being issued") }
  if (d.status === "failed") return { tone: "critical", label: tt("Not connected"), ssl: tt("No certificate") }
  return { tone: "attention", label: tt("Waiting for DNS"), ssl: tt("Issued once DNS is set") }
}

/**
 * The domains last read, so coming back to this subject draws them at once
 * and reads them again quietly, rather than a spinner that the card then
 * grows out of, pushing the page down.
 */
let lastDomains: DomainRow[] | null = null

export function DomainSettings({ ctx }: { ctx: SettingsContext }) {
  const look = useSettingsLook()
  const [domains, setDomains] = useState<DomainRow[] | null>(() => lastDomains)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (domains && !error) lastDomains = domains
  }, [domains, error])

  useEffect(() => {
    let alive = true
    fetch("/api/domains")
      .then(async (res) => {
        const d = (await res.json().catch(() => ({}))) as { domains?: DomainRow[]; error?: string }
        if (!res.ok) throw new Error(d.error || tt("Could not load your domains"))
        /* This is the website's: a domain connected to the creator page is listed in Settings. */
        if (alive) setDomains((d.domains ?? []).filter((x) => (x.purpose ?? "website") === "website"))
      })
      .catch((e) => {
        if (!alive) return
        setDomains([])
        setError(e instanceof Error ? e.message : tt("Could not load your domains"))
      })
    return () => {
      alive = false
    }
  }, [])

  const manage = () => ctx.onNavigate("/app/settings?tab=domains")
  /* The address visitors end up at: the primary domain once it is live with HTTPS; the Storelib address sends them there (lib/custom-domains/subdomain-redirect.ts). */
  const primaryLive = (domains ?? []).find((d) => (d.is_primary ?? true) && d.status === "active" && d.ssl_status !== "failed") ?? null
  const liveHost = primaryLive ? primaryLive.host || `www.${primaryLive.domain}` : null

  /* ── Adding one, here ─────────────────────────────────────────────── */
  const [draft, setDraft] = useState("")
  const [adding, setAdding] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [checking, setChecking] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  /* The last check of each domain: its line, a status per record, and what to fix. */
  const [checked, setChecked] = useState<Record<string, { result: DnsCheckResult; checks: RecordCheck[] | null; fixes: string[] }>>({})
  /* One website domain is replaced by a new one (it redirects for 30 days); a creator who
     connected several in Settings adds alongside them, and manages them there. */
  const current = domains && domains.length === 1 ? domains[0] : null
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
        body: JSON.stringify({ domain: clean, purpose: "website", replace: Boolean(current) }),
      })
      const d = (await res.json().catch(() => ({}))) as { domain?: DomainRow; error?: string }
      if (!res.ok || !d.domain) throw new Error(d.error || tt("Could not connect that domain"))
      const added = d.domain
      setDomains((prev) => (current ? [added] : [added, ...(prev ?? [])]))
      setDraft("")
      setConfirming(false)
      setNote(tt("Now add these records where you bought the domain, then press Check DNS."))
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Could not connect that domain"))
    } finally {
      setAdding(false)
    }
  }

  /* A quiet check is the page asking by itself while a certificate is issued: no spinner, no error said over the page. */
  const check = async (d: DomainRow, quiet = false) => {
    if (!quiet) {
      setChecking(d.id)
      setError(null)
      setNote(null)
    }
    try {
      const res = await fetch("/api/domains/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: d.id }),
      })
      const r = (await res.json().catch(() => ({}))) as {
        verified?: boolean
        sslPending?: boolean
        message?: string
        error?: string
        checks?: RecordCheck[]
        fixes?: string[]
        issues?: string[]
        warnings?: string[]
      }
      if (!res.ok) throw new Error(r.error || tt("Could not check the DNS records"))
      const message = r.verified
        ? r.sslPending
          ? tt("DNS is right. The certificate is being issued, which usually takes a few minutes.")
          : tt("Connected. Your website is live at this domain.")
        : r.message || tt("The records are not showing yet. DNS can take up to a day to reach everyone; check again later.")
      if (r.verified) {
        setDomains((prev) => (prev ?? []).map((x) => (x.id === d.id ? { ...x, status: r.sslPending ? "ssl_provisioning" : "active", ...(r.sslPending ? {} : { ssl_status: "active" }) } : x)))
        if (!r.sslPending) setNote(message)
      }
      /* Asked by itself and still waiting: the line under the records stays as the last press left it. */
      if (quiet && !r.verified) return
      setChecked((all) => ({
        ...all,
        [d.id]: {
          result: { tone: r.verified ? (r.sslPending ? "wait" : "ok") : "bad", message },
          checks: Array.isArray(r.checks) ? r.checks : null,
          fixes: Array.isArray(r.fixes) ? r.fixes : [...(r.issues ?? []), ...(r.warnings ?? [])],
        },
      }))
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : tt("Could not check the DNS records"))
    } finally {
      if (!quiet) setChecking(null)
    }
  }

  /*
    THE CERTIFICATE, FOLLOWED TO THE END (round 51). Once DNS is right the
    domain is "Securing" while its certificate is issued, and this page used
    to stop there until Check DNS was pressed again. Now it asks quietly
    every 12 seconds while the page is in front, as Settings › Domains does
    (components/app/settings/domains-panel.tsx), so it turns Connected by
    itself. The verify route's own limit (90 in ten minutes) is far above it.
  */
  const checkRef = useRef(check)
  useEffect(() => {
    checkRef.current = check
  })
  const securing = (domains ?? []).filter((d) => d.status === "ssl_provisioning").map((d) => d.id).join(",")
  useEffect(() => {
    if (!securing) return
    const tick = () => {
      if (document.visibilityState !== "visible") return
      for (const d of lastDomains ?? []) if (d.status === "ssl_provisioning") void checkRef.current(d, true)
    }
    const id = window.setInterval(tick, 12000)
    return () => window.clearInterval(id)
  }, [securing])

  return (
    <>
      <PageTitle>{tt("Domains")}</PageTitle>
      <Lead>{liveHost ? tt("Your website is at {liveHost}. Its other addresses send visitors there.", { liveHost }) : tt("Every address here shows your live website.")}</Lead>

      <Card title={tt("Storelib address")}>
        <StorelibAddress ctx={ctx} />
        <Row label="HTTPS" inline>
          <Badge tone="live">{tt("Secured")}</Badge>
        </Row>
        {liveHost ? (
          <Row label={tt("Visitors")} hint={tt("Pages opened here go to your domain. Checkout links already sent keep working.")}>
            <span className="text-[14px] text-white/60" data-domain-redirect="">{tt("Sent to {liveHost}", { liveHost })}</span>
          </Row>
        ) : null}
      </Card>

      <Card title={tt("Custom domain")}>
        {domains === null ? (
          <div className="flex items-center justify-center py-10 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          domains.map((d) => {
            const s = describe(d)
            const waiting = d.status !== "active"
            return (
              <Fragment key={d.id}>
                <Row label={d.host || `www.${d.domain}`} hint={(d.is_primary ?? true) ? tt("Primary address") : tt("Sends visitors to the primary address")} inline>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </Row>
                {d.apex !== false && (
                  <Row label={d.domain} hint={tt("Redirects")}>
                    {/* A second domain sends its visitors on to the primary one, once that is live (proxy.ts, a domain that is not primary). */}
                    <span className="text-[14px] text-white/60">{tt("to")} {d.is_primary === false && liveHost ? liveHost : `www.${d.domain}`}</span>
                  </Row>
                )}
                <Row label="HTTPS" inline>
                  <span className="text-[14px] text-white/60">{s.ssl}</span>
                </Row>
                {waiting && (
                  <div className="px-4 py-4 md:px-6" data-domain-setup={d.domain}>
                    <DnsSetup
                      domain={d.domain}
                      records={recordsFor(d)}
                      checks={checked[d.id]?.checks ?? null}
                      status={d.status}
                      checking={checking === d.id}
                      onCheck={() => void check(d)}
                      checkLabel={checked[d.id] ? tt("Check again") : tt("Check DNS")}
                      result={checked[d.id]?.result ?? null}
                      fixes={checked[d.id]?.fixes ?? []}
                      tone={look}
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
              {current ? tt("Use a different domain") : tt("Connect a domain you own")}
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
                {confirming ? tt("Replace") : tt("Connect")}
              </button>
            </div>
            {!current && !confirming && (
              <p className="text-[13px] leading-snug text-white/50">
                {tt("You get the records to add where you bought it. Usually live within the hour.")}
              </p>
            )}
            {confirming && current && (
              <p className="text-[13.5px] leading-snug text-amber-200">
                {tt("This replaces {domain}. For 30 days {domain2} sends its visitors on to {clean}, then it stops. Press Replace to go ahead.", { domain: current.domain, domain2: current.domain, clean })}
              </p>
            )}
          </div>
        )}
      </Card>

      {note && <p className="mt-4 text-[14px] text-white/70">{note}</p>}
      {domains && domains.length > 0 && (
        <button type="button" onClick={manage} className="mt-1 inline-flex min-h-11 items-center text-[13.5px] text-white/55 underline-offset-2 hover:text-white hover:underline md:mt-3 md:min-h-0 [-webkit-tap-highlight-color:transparent]">
          {tt("Remove the domain, or see its records in Settings")}
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
      if (!res.ok || !d.handle) throw new Error(d.error || tt("Could not change the address"))
      ctx.onAddressChanged(d.handle)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Could not change the address"))
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <Row
        label={tt("Address")}
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
            {tt("Change address")}
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
        {tt("Website address")}
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
          <span className="shrink-0 pr-3.5 text-[14.5px] text-white/50">{suffix}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button type="button" onClick={() => setEditing(false)} className={cn(buttonClass, "md:h-10")}>
            {tt("Cancel")}
          </button>
          <button type="button" onClick={() => void save()} disabled={!wanted || !!problem || saving} className={cn(primaryButtonClass, "md:h-10")}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {tt("Save")}
          </button>
        </div>
      </div>
      <p className={cn("text-[13px] leading-snug", problem || error ? "text-[#f87171]" : "text-white/50")}>
        {problem || error || (wanted && wanted !== draft.trim().toLowerCase() ? tt("Will be {wanted}{suffix}. Your username stays the same.", { wanted, suffix }) : tt("Your username stays the same. The old address keeps working."))}
      </p>
    </div>
  )
}

