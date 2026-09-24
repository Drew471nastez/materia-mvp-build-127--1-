"use client"

import { Fragment, useEffect, useState } from "react"
import { Check, Copy, Loader2 } from "lucide-react"
import { AddressValue, Badge, Card, ErrorNote, Lead, PageTitle, Row, buttonClass, inputClass, primaryButtonClass } from "./parts"
import type { SettingsContext } from "./types"

interface DomainRow {
  id: string
  domain: string
  status: string
  ssl_status?: string | null
  verified_at?: string | null
  verification_token?: string | null
}

/** The records a domain needs, the same three Settings › Domains lists. */
function recordsFor(d: DomainRow): { type: string; name: string; value: string }[] {
  return [
    { type: "A", name: "@", value: "216.150.1.1" },
    { type: "CNAME", name: "www", value: "cname.vercel-dns.com" },
    ...(d.verification_token ? [{ type: "TXT", name: "_storelib", value: d.verification_token }] : []),
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
        if (alive) setDomains(d.domains ?? [])
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
  const current = domains?.[0] ?? null
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
        body: JSON.stringify({ domain: clean }),
      })
      const d = (await res.json().catch(() => ({}))) as { domain?: DomainRow; error?: string }
      if (!res.ok || !d.domain) throw new Error(d.error || "Could not connect that domain")
      setDomains([d.domain])
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
      const r = (await res.json().catch(() => ({}))) as { verified?: boolean; sslPending?: boolean; message?: string; error?: string }
      if (!res.ok) throw new Error(r.error || "Could not check the DNS records")
      if (r.verified) {
        setDomains((prev) => (prev ?? []).map((x) => (x.id === d.id ? { ...x, status: r.sslPending ? "ssl_provisioning" : "active" } : x)))
        setNote(r.sslPending ? "DNS is right. The certificate is being issued, which usually takes a few minutes." : "Connected. Your website is live at this domain.")
      } else {
        setNote("The records are not showing yet. DNS can take up to a day to reach everyone; check again later.")
      }
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
        <Row label="Address">
          <AddressValue url={ctx.websiteUrl} display={ctx.websiteUrlDisplay} />
        </Row>
        <Row label="HTTPS">
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
                <Row label={`www.${d.domain}`} hint="Primary address">
                  <Badge tone={s.tone}>{s.label}</Badge>
                </Row>
                <Row label={d.domain} hint="Redirects">
                  <span className="text-[14px] text-white/60">to www.{d.domain}</span>
                </Row>
                <Row label="HTTPS">
                  <span className="text-[14px] text-white/60">{s.ssl}</span>
                </Row>
                {waiting && (
                  <div className="space-y-3 px-5 py-4 md:px-6">
                    <p className="text-[14px] font-medium text-white">Records to add where you bought the domain</p>
                    <div className="overflow-hidden rounded-xl border border-white/10">
                      {recordsFor(d).map((r) => (
                        <DnsRecord key={r.type} {...r} />
                      ))}
                    </div>
                    <button type="button" onClick={() => void check(d)} disabled={checking === d.id} className={buttonClass}>
                      {checking === d.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      Check DNS
                    </button>
                  </div>
                )}
              </Fragment>
            )
          })
        )}

        {domains !== null && (
          <div className="space-y-3 px-5 py-4 md:px-6">
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
                className={inputClass + " text-[16px] md:w-full md:text-[14.5px]"}
              />
              <button type="button" onClick={() => void add()} disabled={!clean || adding} className={primaryButtonClass}>
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
        <button type="button" onClick={manage} className="mt-3 text-[13.5px] text-white/55 underline-offset-2 hover:text-white hover:underline">
          Remove the domain, or see its records in Settings
        </button>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </>
  )
}

function DnsRecord({ type, name, value }: { type: string; name: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.06] px-3.5 py-2.5 last:border-b-0">
      <span className="font-mono text-[12.5px] text-white/55">{type}</span>
      <span className="min-w-0">
        <span className="block font-mono text-[12.5px] text-white/55">{name}</span>
        <span className="block break-all font-mono text-[13px] text-white">{value}</span>
      </span>
      <button
        type="button"
        aria-label={copied ? `${type} value copied` : `Copy the ${type} value`}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1400)
          })
        }}
        className="rounded-md p-2 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}
