"use client"

import { Fragment, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { AddressValue, Badge, Card, ErrorNote, Lead, PageTitle, Row, buttonClass, inputClass, primaryButtonClass, textLinkClass } from "./parts"
import type { SettingsContext } from "./types"
import { DnsSetup, type DnsCheckResult } from "@/components/domains/dns-setup"
import { CNAME_TARGET, DEFAULT_A, type DnsRecord } from "@/lib/custom-domains/hostname"
import type { RecordCheck } from "@/lib/custom-domains/dns-help"
import { cn } from "@/lib/utils"
import { handleProblem, normalizeHandle } from "@/lib/website-builder/site-address"

interface DomainRow {
  id: string
  domain: string
  status: string
  ssl_status?: string | null
  verified_at?: string | null
  verification_token?: string | null
  /** From app/api/domains: what it is for, where it is served, and the records it needs. */
  purpose?: string | null
  host?: string | null
  apex?: boolean | null
  records?: { type: string; name: string; value: string }[] | null
}

/**
 * The records a domain needs: the ones app/api/domains sent, else the defaults in lib/custom-domains/hostname.
 * Drawn by the same three steps as Settings › Domains (components/domains/dns-setup.tsx).
 */
function recordsFor(d: DomainRow): DnsRecord[] {
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

export function DomainSettings({ ctx }: { ctx: SettingsContext }) {
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
        if (!res.ok) throw new Error(d.error || "Could not load your domains")
        /* This is the website's: a domain connected to the creator page is listed in Settings. */
        if (alive) setDomains((d.domains ?? []).filter((x) => (x.purpose ?? "website") === "website"))
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
      if (!res.ok || !d.domain) throw new Error(d.error || "Could not connect that domain")
      const added = d.domain
      setDomains((prev) => (current ? [added] : [added, ...(prev ?? [])]))
      setDraft("")
      setConfirming(false)
      setNote("Now add these records where you bought the domain, then press Check DNS.")
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
      if (!res.ok) throw new Error(r.error || "Could not check the DNS records")
      const message = r.verified
        ? r.sslPending
          ? "DNS is right. The certificate is being issued, which usually takes a few minutes."
          : "Connected. Your website is live at this domain."
        : r.message || "The records are not showing yet. DNS can take up to a day to reach everyone; check again later."
      if (r.verified) {
        setDomains((prev) => (prev ?? []).map((x) => (x.id === d.id ? { ...x, status: r.sslPending ? "ssl_provisioning" : "active" } : x)))
        if (!r.sslPending) setNote(message)
      }
      setChecked((all) => ({
        ...all,
        [d.id]: {
          result: { tone: r.verified ? (r.sslPending ? "wait" : "ok") : "bad", message },
          checks: Array.isArray(r.checks) ? r.checks : null,
          fixes: Array.isArray(r.fixes) ? r.fixes : [...(r.issues ?? []), ...(r.warnings ?? [])],
        },
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check the DNS records")
    } finally {
      setChecking(null)
    }
  }

  return (
    <>
      <PageTitle>Domains</PageTitle>
      <Lead>Every address here shows your live website.</Lead>

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
            return (
              <Fragment key={d.id}>
                <Row label={d.host || `www.${d.domain}`} hint="Primary address" inline>
                  <Badge tone={s.tone}>{s.label}</Badge>
                </Row>
                {d.apex !== false && (
                  <Row label={d.domain} hint="Redirects">
                    <span className="text-[14px] text-white/60">to www.{d.domain}</span>
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
                      checkLabel={checked[d.id] ? "Check again" : "Check DNS"}
                      result={checked[d.id]?.result ?? null}
                      fixes={checked[d.id]?.fixes ?? []}
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
          Remove the domain, or see its records in Settings
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

