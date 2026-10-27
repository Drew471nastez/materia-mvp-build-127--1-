"use client"

import { createPortal } from "react-dom"
import { useCallback, useEffect, useRef, useState } from "react"
import { ExternalLink, Globe, Loader2, Plus, X, Zap } from "lucide-react"

import { DnsSetup, type DnsCheckResult } from "@/components/domains/dns-setup"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { Badge } from "@/components/website-builder/website-settings/parts"
import { describe, recordsFor, type DomainRow } from "@/components/website-builder/website-settings/domains"
import type { RecordCheck } from "@/lib/custom-domains/dns-help"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  A DOMAIN, FROM THE PUBLISH PANEL
 * ===========================================================================
 * The owner's picture: "Website URL" on the left and, on the right, a blue
 * "+ Add domain" with a Pro pill beside it. Publishing is when somebody asks
 * where the site will be, so connecting their own address starts here too.
 *
 * Nothing new behind it. The list, the add and the check are app/api/domains
 * and app/api/domains/verify, the same routes Website settings › Domains and
 * Settings › Domains use, and the records are drawn by the same three steps
 * (components/domains/dns-setup.tsx). GET /api/domains says `canConnect`
 * by the same gate its POST uses (lib/sites/plan.ts siteGate), so a plan
 * without domains sees the Pro pill and is sent to the upgrade page instead
 * of typing a domain only to be refused.
 *
 * A domain already connected to the website is shown in the URL card with
 * its status, and a press on it opens the same window, on its records.
 */

/** Where every "available on Pro" in the app sends a creator. */
export const UPGRADE_HREF = "/app/settings/billing/upgrade"

export type PublishDomains = {
  /** The website's domains, or null until the first read. */
  domains: DomainRow[] | null
  /** Whether this plan may connect one. Null until known. */
  canConnect: boolean | null
}

/** The last answer, so the panel opens on it rather than growing a row a moment later. */
let lastRead: PublishDomains = { domains: null, canConnect: null }

/**
 * The website's domains and whether more may be connected, read when the
 * panel comes on screen. A row that arrives while the phone's sheet is still
 * sliding up waits `settleMs` for it to land, as the preview link does.
 */
export function usePublishDomains(active: boolean, settleMs = 0) {
  const [state, setState] = useState<PublishDomains>(() => lastRead)
  const shownAt = useRef(0)
  const run = useRef(0)
  const read = useCallback(async () => {
    const mine = ++run.current
    try {
      const res = await fetch("/api/domains", { cache: "no-store" })
      const d = (await res.json().catch(() => ({}))) as { domains?: DomainRow[]; canConnect?: boolean }
      if (!res.ok || mine !== run.current) return
      /* The website's: a domain for the creator page or a community is managed in Settings. */
      const next: PublishDomains = {
        domains: (d.domains ?? []).filter((x) => (x.purpose ?? "website") === "website"),
        canConnect: typeof d.canConnect === "boolean" ? d.canConnect : null,
      }
      lastRead = next
      const wait = Math.max(0, shownAt.current + settleMs - performance.now())
      if (wait > 0) window.setTimeout(() => mine === run.current && setState(next), wait)
      else setState(next)
    } catch {
      /* The panel works without it: the Storelib address is still there. */
    }
  }, [settleMs])
  useEffect(() => {
    if (!active) return
    shownAt.current = performance.now()
    void read()
  }, [active, read])
  const update = useCallback((domains: DomainRow[]) => {
    run.current++
    setState((s) => {
      lastRead = { ...s, domains }
      return lastRead
    })
  }, [])
  return { ...state, reload: read, update }
}

/**
 * The right end of the "Website URL" line: "+ Add domain" in blue, and the
 * Pro pill while the plan does not include domains. Nothing once a domain is
 * connected: it has its own row in the card.
 */
export function AddDomainActions({ canConnect, hidden, onAdd }: { canConnect: boolean | null; hidden: boolean; onAdd: () => void }) {
  if (hidden) return null
  const locked = canConnect === false
  const link = "inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-[14px] font-medium text-[#4d9bff] transition-colors hover:text-[#7ab4ff] [-webkit-tap-highlight-color:transparent]"
  return (
    <span className="flex shrink-0 items-center gap-2" data-publish-add-domain={locked ? "upgrade" : "connect"}>
      {/* Always Website settings › Domains (round 25): a plan without domains is told so there, and the Pro pill says it here. */}
      <button type="button" onClick={onAdd} className={link} aria-label={locked ? tt("Add domain, available on Pro") : undefined}>
        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
        {tt("Add domain")}
      </button>
      {locked && (
        <span data-publish-pro="" className="inline-flex h-6 items-center gap-1 rounded-full bg-white/[0.08] px-2.5 text-[12.5px] font-medium text-white/85">
          <Zap className="h-3.5 w-3.5 fill-current" strokeWidth={1.75} aria-hidden />
          Pro
        </span>
      )}
    </span>
  )
}

/** The connected domain as a row of the URL card: its address and where it is up to. A press opens its window. */
export function DomainCardRow({ domain, onOpen }: { domain: DomainRow; onOpen: () => void }) {
  const s = describe(domain)
  return (
    <button
      type="button"
      onClick={onOpen}
      data-publish-domain={domain.domain}
      className="wb-settings-swap flex w-full items-center gap-3 border-t border-white/10 px-4 py-3 text-left text-[14px] transition-colors hover:bg-white/[0.04] [-webkit-tap-highlight-color:transparent]"
    >
      <Globe className="h-4 w-4 shrink-0 text-white/40" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate text-white/85">{domain.host || `www.${domain.domain}`}</span>
      <Badge tone={s.tone}>{s.label}</Badge>
    </button>
  )
}

type Checked = Record<string, { result: DnsCheckResult; checks: RecordCheck[] | null; fixes: string[] }>

/**
 * What the window holds: the domain's status and its records with Check DNS,
 * or the field to connect one. One website domain at a time, as in Website
 * settings: a new one replaces it, asked first, and the old one redirects
 * for 30 days (app/api/domains).
 */
function ConnectBody({ domains, onChanged, onClose }: { domains: DomainRow[]; onChanged: (domains: DomainRow[]) => void; onClose: () => void }) {
  const primary = domains.find((d) => d.is_primary ?? true) ?? domains[0] ?? null
  const current = domains.length === 1 ? domains[0] : null
  const [changing, setChanging] = useState(false)
  const [draft, setDraft] = useState("")
  const [adding, setAdding] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState<Checked>({})
  const [error, setError] = useState<string | null>(null)
  const clean = draft.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "").replace(/\/.*$/, "")
  const showField = !primary || changing

  const add = async () => {
    if (!clean || adding) return
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
        body: JSON.stringify({ domain: clean, purpose: "website", replace: Boolean(current) }),
      })
      const d = (await res.json().catch(() => ({}))) as { domain?: DomainRow; error?: string }
      if (!res.ok || !d.domain) throw new Error(d.error || tt("Could not connect that domain"))
      const added = d.domain
      onChanged(current ? [added] : [added, ...domains])
      setDraft("")
      setConfirming(false)
      setChanging(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Could not connect that domain"))
    } finally {
      setAdding(false)
    }
  }

  const check = async (d: DomainRow) => {
    setChecking(true)
    setError(null)
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
      if (r.verified) onChanged(domains.map((x) => (x.id === d.id ? { ...x, status: r.sslPending ? "ssl_provisioning" : "active" } : x)))
      setChecked((all) => ({
        ...all,
        [d.id]: {
          result: { tone: r.verified ? (r.sslPending ? "wait" : "ok") : "bad", message },
          checks: Array.isArray(r.checks) ? r.checks : null,
          fixes: Array.isArray(r.fixes) ? r.fixes : [...(r.issues ?? []), ...(r.warnings ?? [])],
        },
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Could not check the DNS records"))
    } finally {
      setChecking(false)
    }
  }

  const s = primary ? describe(primary) : null
  return (
    <div className="flex flex-col gap-5 text-white">
      {primary && s && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]" data-domain-status={primary.status}>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Globe className="h-4 w-4 shrink-0 text-white/50" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate text-[15px]">{primary.host || `www.${primary.domain}`}</span>
            <Badge tone={s.tone}>{s.label}</Badge>
          </div>
          <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3 text-[14px] text-white/60">
            <span className="min-w-0 flex-1">{s.ssl}</span>
            {primary.status === "active" && (
              <a
                href={`https://${primary.host || `www.${primary.domain}`}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={tt("Open the live site")}
              >
                <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
              </a>
            )}
          </div>
        </div>
      )}

      {primary && primary.status !== "active" && !changing && (
        <DnsSetup
          domain={primary.domain}
          records={recordsFor(primary)}
          checks={checked[primary.id]?.checks ?? null}
          status={primary.status}
          checking={checking}
          onCheck={() => void check(primary)}
          checkLabel={checked[primary.id] ? tt("Check again") : tt("Check DNS")}
          result={checked[primary.id]?.result ?? null}
          fixes={checked[primary.id]?.fixes ?? []}
          tone="dark"
        />
      )}

      {showField ? (
        <div className="space-y-2.5">
          <label htmlFor="publish-new-domain" className="block text-[15px] font-medium">
            {primary ? tt("Use a different domain") : tt("Your domain")}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="publish-new-domain"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setConfirming(false)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void add()
              }}
              inputMode="url"
              enterKeyHint="go"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="yourname.com"
              /* 16px on a phone, or iOS zooms the page to type in it. */
              className="h-11 min-w-0 flex-1 rounded-xl border border-white/12 bg-[#171717] px-3.5 text-[16px] text-white outline-none placeholder:text-white/35 focus:border-white/35 sm:h-10 sm:text-[14.5px]"
            />
            <button
              type="button"
              onClick={() => void add()}
              disabled={!clean || adding}
              className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-[15px] font-semibold text-[#111] transition-colors hover:bg-white/90 disabled:opacity-40 sm:h-10"
            >
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirming ? tt("Replace") : tt("Connect")}
            </button>
          </div>
          {confirming && current ? (
            <p className="text-[13.5px] leading-snug text-amber-200">
              {tt("This replaces {domain}. For 30 days {domain2} sends its visitors on to {clean}, then it stops. Press Replace to go ahead.", { domain: current.domain, domain2: current.domain, clean })}
            </p>
          ) : (
            <p className="text-[13px] leading-snug text-white/50">
              {tt("Type a domain you own and press Connect. You get the records to add where you bought it.")}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button type="button" onClick={() => setChanging(true)} className="min-h-10 text-[14px] font-medium text-[#4d9bff] hover:text-[#7ab4ff]">
            {tt("Use a different domain")}
          </button>
          <a href="/app/settings?tab=domains" target="_blank" rel="noopener noreferrer" onClick={onClose} className="min-h-10 content-center text-[14px] text-white/55 hover:text-white">
            {tt("Remove it in Settings")}
          </a>
        </div>
      )}

      {error && (
        <p role="alert" className="text-[14px] text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The window itself: a card in the middle of the screen on a computer, and on
 * a phone a bottom sheet with the editor's own drag (MobileEditorSheet), as
 * the Publish panel is.
 */
export function ConnectDomainDialog({
  open,
  onClose,
  mobile,
  domains,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  mobile: boolean
  domains: DomainRow[]
  onChanged: (domains: DomainRow[]) => void
}) {
  const title = domains.length > 0 ? tt("Your domain") : tt("Connect a domain")
  useEffect(() => {
    if (!open || mobile) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, mobile, onClose])

  const head = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-[20px] font-semibold leading-tight text-white">{title}</h2>
        <p className="mt-1.5 text-[14px] leading-snug text-white/55">{tt("Visitors reach your website at your own address.")}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={tt("Close")}
        className="-mr-1.5 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="h-5 w-5" strokeWidth={1.75} />
      </button>
    </div>
  )
  const body = <ConnectBody key={open ? "open" : "closed"} domains={domains} onChanged={onChanged} onClose={onClose} />

  if (mobile) {
    return (
      <MobileEditorSheet
        open={open}
        onOpenChange={(o) => {
          if (!o) onClose()
        }}
        className="bg-[#1f1f1f]"
        fit
        detents={[0.92]}
        layer="raised"
        peekHeight={0}
        label={title}
      >
        <div data-sheet-scroll className="wb-slim-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-1">
          <div data-sheet-content data-connect-domain="" className="flex flex-col gap-5">
            {head}
            {body}
          </div>
        </div>
      </MobileEditorSheet>
    )
  }

  if (!open || typeof document === "undefined") return null
  return createPortal(
    <div className="wb-scrim-in fixed inset-0 z-[170] flex items-center justify-center bg-black/60 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-connect-domain=""
        className={cn(
          "wb-settings-in wb-slim-scroll flex max-h-[calc(100dvh-32px)] w-[520px] max-w-full flex-col gap-5 overflow-y-auto rounded-2xl border border-white/10 bg-[#1f1f1f] p-6",
          "shadow-[0_24px_80px_-16px_rgba(0,0,0,0.7)]",
        )}
      >
        {head}
        {body}
      </div>
    </div>,
    document.body,
  )
}
