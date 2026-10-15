"use client"

/**
 * ===========================================================================
 *  A COMMUNITY'S OWN DOMAIN, IN ITS ADMIN (round 31)
 * ===========================================================================
 * One card in /app/community/<slug>: the domain this community opens at,
 * how far along it is, the records to add while it waits (the same
 * components/domains/dns-setup the website builder draws), and Connect or
 * Disconnect. Everything else about domains lives in Settings › Domains,
 * linked from here.
 *
 * It asks app/api/domains like Settings does, so the session decides whose
 * domains these are, and the route decides whose community it is: a domain
 * connects only to a community the signed in creator owns
 * (lib/custom-domains/community-server.ts ownedCommunity). An admin or
 * moderator of somebody else's community sees one line saying the owner
 * connects it.
 *
 * What the domain then serves, and why members still sign in on
 * storelib.com, is lib/custom-domains/community.ts.
 */
import * as React from "react"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { getMainDomain } from "@/lib/url-helpers"
import { HOSTNAME_PROBLEM_TEXT, cleanHostname, hostnameProblem, recordsFor, servingHost, type DnsRecord, type DomainPurpose } from "@/lib/custom-domains/hostname"
import type { RecordCheck } from "@/lib/custom-domains/dns-help"
import { DnsSetup, type DnsCheckResult } from "@/components/domains/dns-setup"
import { Confirm, LinkButton, Notice, Section, buttonPrimary, buttonSecondary, field, send } from "./parts"

interface PanelDomain {
  id: string
  domain: string
  status: string
  host?: string | null
  purpose?: DomainPurpose | null
  records?: DnsRecord[] | null
  community_id?: string | null
  last_checked_at?: string | null
}

interface PanelData {
  domains: PanelDomain[]
  purposes?: DomainPurpose[]
  communities?: { id: string; name: string; slug: string }[]
}

type Check = { result: DnsCheckResult; checks: RecordCheck[] | null; fixes: string[] }

const SETTINGS_DOMAINS = "/app/settings?tab=domains"

/** Connected, setting up HTTPS, or waiting for the records: the three things a domain can be here. */
function standingOf(status: string): { label: string; dot: string } {
  if (status === "active") return { label: tt("Connected"), dot: "bg-[#16a34a]" }
  if (status === "ssl_provisioning") return { label: tt("Setting up HTTPS"), dot: "bg-[#d97706]" }
  return { label: tt("Waiting for DNS"), dot: "bg-[#9ca3af]" }
}

export function CommunityDomainPanel({ communityId }: { communityId: string }) {
  const [data, setData] = React.useState<PanelData | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [upgrade, setUpgrade] = React.useState(false)
  const [busy, setBusy] = React.useState<"connect" | "check" | "remove" | null>(null)
  const [checked, setChecked] = React.useState<Check | null>(null)
  const [confirming, setConfirming] = React.useState(false)

  const load = React.useCallback(async () => {
    const res = await send<PanelData>("/api/domains", "GET")
    if (!res.ok) {
      setLoadError(res.data.error || tt("Could not load your domains."))
      return null
    }
    setLoadError(null)
    setData(res.data)
    return res.data
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const community = data?.communities?.find((c) => c.id === communityId || c.slug === communityId) ?? null
  const available = !!data?.purposes?.includes("community")
  const domain = community ? (data?.domains.find((d) => d.community_id === community.id) ?? null) : null
  const clean = cleanHostname(draft)

  const connect = async () => {
    if (!community || busy) return
    const problem = hostnameProblem(clean)
    if (problem) return setError(HOSTNAME_PROBLEM_TEXT[problem])
    setBusy("connect")
    setError(null)
    setUpgrade(false)
    const res = await send<{ domain?: PanelDomain; upgrade?: boolean }>("/api/domains", "POST", { domain: clean, purpose: "community", communityId: community.id })
    setBusy(null)
    if (!res.ok || !res.data.domain) {
      setUpgrade(res.data.upgrade === true)
      return setError(res.data.error || tt("Could not add that domain."))
    }
    setDraft("")
    setChecked(null)
    await load()
  }

  const check = React.useCallback(
    async (d: PanelDomain, quiet = false) => {
      if (!quiet) setBusy("check")
      const res = await send<{ status?: string; verified?: boolean; message?: string; records?: DnsRecord[]; checks?: RecordCheck[]; fixes?: string[]; issues?: string[]; warnings?: string[] }>("/api/domains/verify", "POST", { domainId: d.id })
      if (!quiet) setBusy(null)
      if (!res.ok) {
        if (!quiet) setChecked({ result: { tone: "bad", message: res.data.error || tt("Could not check the records just now.") }, checks: null, fixes: [] })
        return
      }
      const status = res.data.status || (res.data.verified ? "ssl_provisioning" : "pending")
      setChecked({
        result: { tone: status === "active" ? "ok" : res.data.verified ? "wait" : "bad", message: res.data.message || "" },
        checks: Array.isArray(res.data.checks) ? res.data.checks : null,
        fixes: Array.isArray(res.data.fixes) ? res.data.fixes : [...(res.data.issues ?? []), ...(res.data.warnings ?? [])],
      })
      setData((cur) => (cur ? { ...cur, domains: cur.domains.map((x) => (x.id === d.id ? { ...x, status, ...(res.data.records?.length ? { records: res.data.records } : {}) } : x)) } : cur))
    },
    [],
  )

  /* While the certificate is issued, asked quietly every 12 seconds with the page in front, as Settings does. */
  const securing = domain?.status === "ssl_provisioning" ? domain : null
  React.useEffect(() => {
    if (!securing) return
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void check(securing, true)
    }, 12000)
    return () => window.clearInterval(id)
  }, [securing, check])

  const disconnect = async () => {
    if (!domain) return
    setBusy("remove")
    const res = await send("/api/domains", "DELETE", { domainId: domain.id })
    setBusy(null)
    setConfirming(false)
    if (!res.ok) return setError(res.data.error || tt("Could not remove it."))
    setChecked(null)
    await load()
  }

  const title = tt("Domain")

  if (!data) {
    return (
      <Section title={title} hint={loadError ?? undefined}>
        {loadError ? (
          <button type="button" onClick={() => void load()} className={buttonSecondary}>
            {tt("Try again")}
          </button>
        ) : (
          <p className="text-[13px] text-[#6b7280]" role="status">
            {tt("Loading")}
          </p>
        )}
      </Section>
    )
  }

  /* Somebody who helps run it, not its owner: the domain is the owner's to connect. */
  if (!community) {
    return (
      <Section title={title}>
        <p className="text-[13px] text-[#6b7280]">{tt("The community's owner connects its domain.")}</p>
      </Section>
    )
  }

  if (!available) {
    return (
      <Section title={title}>
        <Notice tone="info">{tt("Connecting a domain to a community needs a database update that has not run yet.")}</Notice>
      </Section>
    )
  }

  const settingsLink = (
    <LinkButton href={SETTINGS_DOMAINS} className="h-10 px-3.5 sm:h-8">
      {tt("Settings › Domains")}
    </LinkButton>
  )

  if (!domain) {
    return (
      <Section title={title} hint={tt("Open {name} at a domain you own, like club.yourname.com.", { name: community.name })} action={<span className="hidden sm:inline-flex">{settingsLink}</span>}>
        <div className="flex gap-2" data-community-domain-add="">
          <label htmlFor="community-domain-new" className="sr-only">
            {tt("Domain")}
          </label>
          <input
            id="community-domain-new"
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void connect()
              }
            }}
            inputMode="url"
            enterKeyHint="go"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="club.yourname.com"
            aria-invalid={Boolean(error)}
            aria-describedby="community-domain-hint"
            className={cn(field, "h-11 sm:h-9")}
          />
          <button type="button" onClick={() => void connect()} disabled={!clean || busy !== null} className={cn(buttonPrimary, "h-11 shrink-0 px-4 sm:h-9")} data-community-domain-connect="">
            {busy === "connect" ? tt("Connecting") : tt("Connect")}
          </button>
        </div>
        {error ? (
          <p id="community-domain-hint" role="alert" className="mt-2 text-[13px] text-[#b42318]">
            {error}{" "}
            {upgrade ? (
              <a href="/app/settings/billing/upgrade" className="font-medium text-[#1a1a2e] underline underline-offset-4">
                {tt("Upgrade")}
              </a>
            ) : null}
          </p>
        ) : (
          <p id="community-domain-hint" className="mt-2 text-[13px] text-[#6b7280]">
            {tt("Already added a domain? Pick this community for it in Settings › Domains.")}
          </p>
        )}
        <div className="mt-3 sm:hidden">{settingsLink}</div>
      </Section>
    )
  }

  const standing = standingOf(domain.status)
  const dnsDone = domain.status === "active" || domain.status === "ssl_provisioning"
  const host = domain.host || servingHost(domain.domain)

  return (
    <Section
      title={title}
      hint={dnsDone ? tt("Visitors see the community at this domain. Members sign in on {main}.", { main: getMainDomain() }) : tt("Add these records where you bought the domain, then check.")}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-community-domain={domain.domain}>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[#1a1a2e] [overflow-wrap:anywhere]">{domain.domain}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-[#6b7280]" data-community-domain-status={domain.status}>
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", standing.dot)} aria-hidden />
            {standing.label}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {domain.status === "active" ? (
            <a href={`https://${host}`} target="_blank" rel="noopener noreferrer" className={cn(buttonSecondary, "h-10 gap-1.5 px-3.5 sm:h-8")}>
              {tt("Open")}
              <ExternalLink className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
            </a>
          ) : null}
          {settingsLink}
          <button type="button" onClick={() => setConfirming(true)} disabled={busy !== null} className={cn(buttonSecondary, "h-10 px-3.5 hover:text-[#b42318] sm:h-8")} data-community-domain-remove="">
            {tt("Disconnect")}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <Notice>{error}</Notice>
        </div>
      ) : null}

      {!dnsDone ? (
        <div className="mt-4 border-t border-[#f0f1f3] pt-4">
          <DnsSetup
            domain={domain.domain}
            records={domain.records?.length ? domain.records : recordsFor(domain.domain)}
            checks={checked?.checks ?? null}
            status={domain.status}
            checking={busy === "check"}
            onCheck={() => void check(domain)}
            checkLabel={checked || domain.last_checked_at ? tt("Check again") : tt("Check DNS")}
            result={checked?.result ?? null}
            fixes={checked?.fixes ?? []}
            tone="light"
          />
        </div>
      ) : domain.status === "ssl_provisioning" ? (
        <p className="mt-3 text-[13px] text-[#6b7280]">{tt("Records found. HTTPS is being set up, usually within 10 minutes.")}</p>
      ) : null}

      <Confirm
        open={confirming}
        onClose={() => setConfirming(false)}
        title={tt("Disconnect {domain}?", { domain: domain.domain })}
        detail={
          domain.status === "active"
            ? tt("Visitors go to {goesTo} for 30 days, then it stops.", { goesTo: `${getMainDomain()}/community/${community.slug}` })
            : tt("It is not connected yet, so nothing stops working.")
        }
        action={tt("Disconnect")}
        danger
        busy={busy === "remove"}
        onConfirm={() => void disconnect()}
      />
    </Section>
  )
}
