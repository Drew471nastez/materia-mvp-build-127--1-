"use client"

import { Fragment, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { AddressValue, Badge, Card, ErrorNote, Lead, PageTitle, Row, buttonClass } from "./parts"
import type { SettingsContext } from "./types"

interface DomainRow {
  id: string
  domain: string
  status: string
  ssl_status?: string | null
  verified_at?: string | null
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

export function DomainSettings({ ctx }: { ctx: SettingsContext }) {
  const [domains, setDomains] = useState<DomainRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <>
      <PageTitle aside={<button type="button" onClick={manage} className={buttonClass}>Connect a domain</button>}>Domains</PageTitle>
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
        ) : domains.length === 0 ? (
          <Row label="No custom domain" hint="Use a domain you own, like yourname.com, instead of the Storelib address.">
            <button type="button" onClick={manage} className={buttonClass}>
              Connect a domain
            </button>
          </Row>
        ) : (
          domains.map((d) => {
            const s = describe(d)
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
              </Fragment>
            )
          })
        )}
      </Card>
      {domains && domains.length > 0 && (
        <button type="button" onClick={manage} className="mt-3 text-[13.5px] text-white/55 underline-offset-2 hover:text-white hover:underline">
          DNS records and domain changes
        </button>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </>
  )
}
