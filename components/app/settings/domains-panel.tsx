"use client"

/**
 * ===========================================================================
 *  SETTINGS › DOMAINS
 * ===========================================================================
 * A creator's own domains, for the two things a visitor can be sent to:
 *
 *   Website        the site built in the website builder
 *   Creator page   storelib.com/<handle>, its products at /<product>, and
 *                  the OnePage at /links
 *
 * One card to connect a domain (what it is for, then the name), and one card
 * per purpose listing its domains. A domain that is not live yet shows the
 * records to add where it was bought, exactly as Vercel reported them, and
 * Check again. The primary domain of a purpose is the address canonicals and
 * share links name; any other redirects to it (proxy.ts). Remove asks first,
 * in the row, and says where visitors will go.
 *
 * Everything goes through app/api/domains, which checks the session and
 * holds the Vercel token. This file only draws and asks. The list itself is
 * the Settings page's (it reads it on load for its quick links), so a change
 * here is handed back with `onData`.
 *
 * Light /app surface: the card and type of the other Settings tabs, the
 * near-black primary button of the password card, the white depth secondary,
 * and the shared action list (a menu on a computer, a sheet on a phone).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, Copy, ExternalLink, Loader2, MoreHorizontal, Star, Trash2 } from "lucide-react"

import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { secondaryDepth } from "@/components/ui/depth-button"
import { toast } from "@/hooks/use-toast"
import { copyText } from "@/lib/platform/copy-text"
import { HOSTNAME_PROBLEM_TEXT, cleanHostname, hostnameProblem, isApexHost, servingHost, type DnsRecord, type DomainPurpose } from "@/lib/custom-domains/hostname"
import { cn } from "@/lib/utils"

export interface DomainItem {
  id: string
  domain: string
  status: string
  ssl_status?: string | null
  verified_at?: string | null
  created_at?: string | null
  last_checked_at?: string | null
  purpose?: DomainPurpose | null
  is_primary?: boolean | null
  host?: string | null
  apex?: boolean | null
  records?: DnsRecord[] | null
}

export interface DomainsData {
  domains: DomainItem[]
  primary?: { website?: string | null; creator_page?: string | null } | null
  schema?: "current" | "legacy"
  purposes?: DomainPurpose[]
  registered?: boolean
}

type CheckResult = { tone: "ok" | "wait" | "bad"; message: string; issues: string[]; warnings: string[] }

const CARD = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
const INK =
  "inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] px-5 text-[14px] font-medium text-white " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(15,23,42,0.18)] transition-colors hover:bg-[#2a2a40] active:bg-[#111122] " +
  "disabled:cursor-not-allowed disabled:opacity-40 sm:h-10 sm:rounded-lg sm:text-[13px]"
const SECONDARY = cn(secondaryDepth, "h-11 rounded-xl px-4 text-[14px] sm:h-9 sm:rounded-lg sm:text-[13px]")
const FIELD =
  "h-11 w-full min-w-0 rounded-xl border border-[#e5e7eb] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-colors " +
  "placeholder:text-[#9ca3af] focus:border-[#1a1a2e]/40 focus:ring-2 focus:ring-[#1a1a2e]/10 disabled:cursor-not-allowed disabled:bg-[#f9fafb] sm:h-10 sm:rounded-lg sm:text-[14px]"
const ICON_BUTTON =
  "inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#6b7280] outline-none transition-colors duration-100 " +
  "hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 sm:h-8 sm:w-8"

const PURPOSE_TEXT: Record<DomainPurpose, { title: string; choice: string; empty: string }> = {
  website: {
    title: "Website",
    choice: "Website",
    empty: "No domain yet.",
  },
  creator_page: {
    title: "Creator page",
    choice: "Creator page",
    empty: "No domain yet.",
  },
}

/** Where a domain stands, in the words a creator would use. */
function standing(d: DomainItem): { label: string; dot: string; text: string } {
  if (d.status === "active") return { label: "Connected", dot: "bg-[#16a34a]", text: "text-[#15803d]" }
  if (d.status === "ssl_provisioning") return { label: "Securing", dot: "bg-[#d97706]", text: "text-[#b45309]" }
  if (d.status === "failed") return { label: "Not connected", dot: "bg-[#dc2626]", text: "text-[#b91c1c]" }
  if (d.status === "verifying") return { label: "Checking", dot: "bg-[#9ca3af]", text: "text-[#4b5563]" }
  return { label: "Waiting for DNS", dot: "bg-[#9ca3af]", text: "text-[#4b5563]" }
}

function ago(iso: string | null | undefined): string | null {
  if (!iso) return null
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (!Number.isFinite(s)) return null
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export function DomainsPanel({
  data,
  loading,
  onData,
  websiteAddress,
  creatorPageAddress,
  locked,
  planLoading,
}: {
  data: DomainsData | null
  loading: boolean
  onData: (next: DomainsData) => void
  /** Where each is on storelib.com, which keeps working with or without a domain. */
  websiteAddress: string
  creatorPageAddress: string
  /** Free plan: the page is shown, the controls are not usable. */
  locked: boolean
  planLoading: boolean
}) {
  const domains = useMemo(() => data?.domains ?? [], [data])
  const purposes: DomainPurpose[] = data?.purposes?.length ? data.purposes : ["website", "creator_page"]
  const creatorPageOn = purposes.includes("creator_page")

  /* Always the latest, for the handlers below that outlive a render. */
  const dataRef = useRef<DomainsData | null>(data)
  dataRef.current = data
  const replaceDomain = useCallback(
    (id: string, patch: Partial<DomainItem>) => {
      const cur = dataRef.current
      if (!cur) return
      onData({ ...cur, domains: cur.domains.map((d) => (d.id === id ? { ...d, ...patch } : d)) })
    },
    [onData],
  )

  /* ── Connecting one ─────────────────────────────────────────────────── */
  const [purpose, setPurpose] = useState<DomainPurpose>("website")
  const [draft, setDraft] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const clean = cleanHostname(draft)
  const previewHost = clean && !hostnameProblem(clean) ? servingHost(clean) : null

  const add = async () => {
    if (locked || adding) return
    const problem = hostnameProblem(clean)
    if (problem) {
      setAddError(HOSTNAME_PROBLEM_TEXT[problem])
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: clean, purpose }),
      })
      const body = (await res.json().catch(() => ({}))) as { domain?: DomainItem; error?: string }
      if (!res.ok || !body.domain) throw new Error(body.error || "Could not connect that domain.")
      /* Read the list again rather than guess what the server changed (a replaced domain, a primary). */
      const list = await fetch("/api/domains").then((r) => (r.ok ? (r.json() as Promise<DomainsData>) : null)).catch(() => null)
      const cur = dataRef.current
      onData(list ?? { ...(cur ?? { domains: [] }), domains: [body.domain, ...(cur?.domains ?? [])] })
      setDraft("")
      setOpenRecords((o) => ({ ...o, [body.domain!.id]: true }))
      toast({ title: `${body.domain.host || body.domain.domain} added`, description: "Add the records below where you bought it." })
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not connect that domain.")
    } finally {
      setAdding(false)
    }
  }

  /* ── Checking ───────────────────────────────────────────────────────── */
  const [checking, setChecking] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, CheckResult>>({})
  const [openRecords, setOpenRecords] = useState<Record<string, boolean>>({})

  const check = useCallback(
    async (d: DomainItem, quiet = false) => {
      if (!quiet) setChecking(d.id)
      try {
        const res = await fetch("/api/domains/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domainId: d.id }),
        })
        const r = (await res.json().catch(() => ({}))) as {
          verified?: boolean
          sslPending?: boolean
          status?: string
          message?: string
          error?: string
          records?: DnsRecord[]
          issues?: string[]
          warnings?: string[]
        }
        if (!res.ok) throw new Error(r.error || "Could not check the records just now.")
        const status = r.status || (r.verified ? (r.sslPending ? "ssl_provisioning" : "active") : "pending")
        replaceDomain(d.id, {
          status,
          ...(r.records?.length ? { records: r.records } : {}),
          last_checked_at: new Date().toISOString(),
          ...(status === "active" ? { ssl_status: "active", verified_at: d.verified_at || new Date().toISOString() } : {}),
        })
        setResults((all) => ({
          ...all,
          [d.id]: {
            tone: status === "active" ? "ok" : r.verified ? "wait" : "bad",
            message: r.message || "",
            issues: r.issues ?? [],
            warnings: r.warnings ?? [],
          },
        }))
        if (status === "active" && d.status !== "active") {
          toast({ title: `${d.host || d.domain} is connected` })
          /* The primary host per purpose moved; the server knows it. */
          const list = await fetch("/api/domains").then((x) => (x.ok ? (x.json() as Promise<DomainsData>) : null)).catch(() => null)
          if (list) onData(list)
        }
      } catch (e) {
        if (!quiet) setResults((all) => ({ ...all, [d.id]: { tone: "bad", message: e instanceof Error ? e.message : "Could not check the records.", issues: [], warnings: [] } }))
      } finally {
        if (!quiet) setChecking(null)
      }
    },
    [onData, replaceDomain],
  )

  /* A certificate being issued is asked about quietly every 12 seconds, while the page is in front. */
  const securing = domains.filter((d) => d.status === "ssl_provisioning").map((d) => d.id).join(",")
  useEffect(() => {
    if (!securing) return
    const tick = () => {
      if (document.visibilityState !== "visible") return
      for (const d of dataRef.current?.domains ?? []) if (d.status === "ssl_provisioning") void check(d, true)
    }
    const id = window.setInterval(tick, 12000)
    return () => window.clearInterval(id)
  }, [securing, check])

  /* ── Primary, remove ────────────────────────────────────────────────── */
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const makePrimary = async (d: DomainItem) => {
    setBusy(d.id)
    try {
      const res = await fetch("/api/domains", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: d.id, action: "make_primary" }),
      })
      const body = (await res.json().catch(() => ({}))) as DomainsData & { error?: string }
      if (!res.ok) throw new Error(body.error || "Could not make it primary.")
      onData(body)
      toast({ title: `${d.host || d.domain} is now primary` })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not make it primary.", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const remove = async (d: DomainItem) => {
    setBusy(d.id)
    try {
      const res = await fetch("/api/domains", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: d.id }),
      })
      const body = (await res.json().catch(() => ({}))) as DomainsData & { error?: string }
      if (!res.ok) throw new Error(body.error || "Could not remove it.")
      const cur = dataRef.current
      onData(body.domains ? body : { ...(cur ?? { domains: [] }), domains: (cur?.domains ?? []).filter((x) => x.id !== d.id) })
      setConfirming(null)
      toast({ title: `${d.host || d.domain} removed` })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not remove it.", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const addressOf = (p: DomainPurpose) => (p === "website" ? websiteAddress : creatorPageAddress)

  return (
    <div className="space-y-4 sm:space-y-5" data-domains-panel="">
      {!planLoading && locked && (
        <div className={cn(CARD, "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5")} data-domains-upgrade="">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-[#1a1a2e]">Your own domain is on Growth and Pro</p>
            <p className="mt-0.5 text-[13px] text-[#6b7280]">Your pages stay at their storelib.com addresses on every plan.</p>
          </div>
          <a href="/app/settings/billing/upgrade" className={cn(INK, "no-underline")}>
            See plans
          </a>
        </div>
      )}

      {/* Connect */}
      <section className={cn(CARD, "p-4 sm:p-6", locked && !planLoading && "opacity-60")} aria-labelledby="domains-connect">
        <h3 id="domains-connect" className="text-[15px] font-semibold text-[#1a1a2e]">
          Connect a domain
        </h3>
        <p className="mt-1 text-[13px] text-[#6b7280]">A domain you bought, like yourname.com, or one level under it, like shop.yourname.com.</p>

        <div role="radiogroup" aria-label="What the domain is for" className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-[#f3f4f6] p-1 sm:inline-grid sm:w-auto">
          {(["website", "creator_page"] as DomainPurpose[]).map((p) => {
            const on = purpose === p
            const off = p === "creator_page" && !creatorPageOn
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={off || locked}
                onClick={() => {
                  setPurpose(p)
                  setAddError(null)
                }}
                className={cn(
                  "h-10 cursor-pointer rounded-lg px-4 text-[14px] font-medium transition-[background-color,color,box-shadow] duration-150 sm:h-8 sm:text-[13px]",
                  on ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.04)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {PURPOSE_TEXT[p].choice}
              </button>
            )
          })}
        </div>

        {/* Not a <form>: the Settings page is one form already, and a form inside a form is not HTML. */}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row" data-domains-add="">
          <label htmlFor="domains-new" className="sr-only">
            Domain
          </label>
          <input
            id="domains-new"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setAddError(null)
            }}
            onKeyDown={(e) => {
              /* Enter connects, and is kept from submitting the Settings form around it. */
              if (e.key === "Enter") {
                e.preventDefault()
                void add()
              }
            }}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder={purpose === "website" ? "yourname.com" : "yourname.com or links.yourname.com"}
            disabled={locked}
            aria-invalid={Boolean(addError)}
            aria-describedby="domains-new-hint"
            className={FIELD}
          />
          <button type="button" onClick={() => void add()} disabled={locked || adding || !clean} className={INK}>
            {adding && <Loader2 className="h-4 w-4 animate-spin" />}
            Connect
          </button>
        </div>
        <p id="domains-new-hint" className={cn("mt-2 text-[13px] leading-snug", addError ? "text-[#b91c1c]" : "text-[#6b7280]")} role={addError ? "alert" : undefined}>
          {addError
            ? addError
            : purpose === "website"
              ? previewHost
                ? `Your website will open at ${previewHost}.`
                : "Shows the website you built. Its storelib.com address keeps working."
              : previewHost
                ? `Your creator page will open at ${previewHost}, and your OnePage at ${previewHost}/links.`
                : "Shows your creator page, your products under it, and your OnePage at /links."}
        </p>
      </section>

      {/* One card per purpose */}
      {purposes.map((p) => {
        const mine = domains.filter((d) => (d.purpose ?? "website") === p)
        const primaryHost = mine.find((d) => d.is_primary)?.host ?? null
        return (
          <section key={p} className={cn(CARD, "overflow-hidden")} aria-labelledby={`domains-${p}`} data-domains-purpose={p}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
              <h3 id={`domains-${p}`} className="text-[15px] font-semibold text-[#1a1a2e]">
                {PURPOSE_TEXT[p].title}
              </h3>
              <p className="min-w-0 truncate text-[13px] text-[#6b7280]">Also at {addressOf(p)}</p>
            </div>

            {loading && !data ? (
              <div className="flex h-[72px] items-center justify-center border-t border-[#f0f1f3]">
                <Loader2 className="h-5 w-5 animate-spin text-[#9ca3af]" />
              </div>
            ) : mine.length === 0 ? (
              <p className="border-t border-[#f0f1f3] px-4 py-5 text-[13px] text-[#6b7280] sm:px-6">{PURPOSE_TEXT[p].empty}</p>
            ) : (
              <ul className="divide-y divide-[#f0f1f3] border-t border-[#f0f1f3]">
                {mine.map((d) => (
                  <DomainRow
                    key={d.id}
                    d={d}
                    many={mine.length > 1}
                    primaryHost={primaryHost}
                    fallback={addressOf(p)}
                    checking={checking === d.id}
                    busy={busy === d.id}
                    result={results[d.id]}
                    recordsOpen={openRecords[d.id] ?? d.status !== "active"}
                    onToggleRecords={() => setOpenRecords((o) => ({ ...o, [d.id]: !(o[d.id] ?? d.status !== "active") }))}
                    confirming={confirming === d.id}
                    onCheck={() => void check(d)}
                    onMakePrimary={() => void makePrimary(d)}
                    onAskRemove={() => setConfirming(d.id)}
                    onCancelRemove={() => setConfirming(null)}
                    onRemove={() => void remove(d)}
                    locked={locked}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}

      {!creatorPageOn && data && (
        <p className="px-1 text-[13px] text-[#6b7280]">Domains for your creator page are coming to this account soon. A website domain works now.</p>
      )}
    </div>
  )
}

function DomainRow({
  d,
  many,
  primaryHost,
  fallback,
  checking,
  busy,
  result,
  recordsOpen,
  onToggleRecords,
  confirming,
  onCheck,
  onMakePrimary,
  onAskRemove,
  onCancelRemove,
  onRemove,
  locked,
}: {
  d: DomainItem
  many: boolean
  primaryHost: string | null
  fallback: string
  checking: boolean
  busy: boolean
  result?: CheckResult
  recordsOpen: boolean
  onToggleRecords: () => void
  confirming: boolean
  onCheck: () => void
  onMakePrimary: () => void
  onAskRemove: () => void
  onCancelRemove: () => void
  onRemove: () => void
  locked: boolean
}) {
  const host = d.host || servingHost(d.domain)
  const apex = d.apex ?? isApexHost(d.domain)
  const s = standing(d)
  const live = d.status === "active"
  const redirecting = live && many && !d.is_primary && primaryHost
  const checked = ago(d.last_checked_at)

  const items: ActionMenuItem[] = [
    ...(live ? [{ label: "Open", icon: <ExternalLink />, href: `https://${host}`, target: "_blank" as const }] : []),
    {
      label: "Copy address",
      icon: <Copy />,
      onClick: () => {
        void copyText(`https://${host}`).then((ok) => toast(ok ? { title: "Address copied" } : { title: "Could not copy", variant: "destructive" }))
      },
    },
    ...(many && !d.is_primary && !locked ? [{ label: "Make primary", icon: <Star />, onClick: onMakePrimary }] : []),
    { label: "Remove", icon: <Trash2 />, onClick: onAskRemove, variant: "destructive" as const, separatorBefore: true },
  ]

  const line = live
    ? redirecting
      ? `Sends visitors to ${primaryHost}`
      : apex
        ? `Live with HTTPS. ${d.domain} opens it too.`
        : "Live with HTTPS"
    : d.status === "ssl_provisioning"
      ? "The DNS is right. The certificate is being issued, usually in a few minutes."
      : "Add the records below where you bought the domain, then check again."

  return (
    <li className="px-4 py-3.5 sm:px-6" data-domain-row={d.domain}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="min-w-0 truncate text-[14px] font-medium text-[#1a1a2e]" title={host}>
              {host}
            </p>
            {many && d.is_primary && <span className="rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-[11.5px] font-medium text-[#4b5563]">Primary</span>}
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-[#6b7280]">{line}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium max-sm:hidden", s.text)} data-domain-status={d.status}>
            {d.status === "ssl_provisioning" || d.status === "verifying" ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <span className={cn("h-2 w-2 rounded-full", s.dot)} aria-hidden />
            )}
            <span>{s.label}</span>
          </span>
          <ResponsiveActionMenu
            title={host}
            items={items}
            trigger={
              <button type="button" aria-label={`Actions for ${host}`} className={ICON_BUTTON} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </button>
            }
          />
        </div>
      </div>

      {/* On a phone the label is read from here, under the name, rather than squeezed beside it. */}
      <p className={cn("mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-medium sm:hidden", s.text)}>
        {d.status === "ssl_provisioning" || d.status === "verifying" ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <span className={cn("h-2 w-2 rounded-full", s.dot)} aria-hidden />
        )}
        {s.label}
      </p>

      {confirming && (
        <div className="mt-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3.5" role="alertdialog" aria-label={`Remove ${host}?`}>
          <p className="text-[13.5px] font-medium text-[#1a1a2e]">Remove {host}?</p>
          <p className="mt-0.5 text-[13px] leading-snug text-[#6b7280]">
            {live
              ? `For 30 days it sends visitors to ${primaryHost && primaryHost !== host ? primaryHost : fallback}, then it stops.`
              : "It was not connected yet, so nothing that was shared stops working."}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button type="button" onClick={onCancelRemove} className={SECONDARY}>
              Cancel
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#b91c1c] px-4 text-[14px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(127,29,29,0.25)] transition-colors hover:bg-[#991b1b] disabled:opacity-50 sm:h-9 sm:rounded-lg sm:text-[13px]"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove
            </button>
          </div>
        </div>
      )}

      {!live && (
        <div className="mt-3">
          {recordsOpen && d.records && d.records.length > 0 && <Records records={d.records} />}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button type="button" onClick={onCheck} disabled={checking || locked} className={SECONDARY}>
              {checking && <Loader2 className="h-4 w-4 animate-spin" />}
              Check again
            </button>
            <button type="button" onClick={onToggleRecords} className="h-10 cursor-pointer text-[13px] font-medium text-[#4b5563] underline-offset-4 hover:text-[#1a1a2e] hover:underline sm:h-8">
              {recordsOpen ? "Hide records" : "Show records"}
            </button>
            {checked && <span className="text-[12.5px] text-[#9ca3af]">Checked {checked}</span>}
          </div>
        </div>
      )}

      {result && (result.message || result.issues.length > 0 || result.warnings.length > 0) && (
        <div className="mt-3 space-y-2" aria-live="polite">
          {result.message && (
            <p className={cn("text-[13px] leading-snug", result.tone === "ok" ? "text-[#15803d]" : result.tone === "wait" ? "text-[#4b5563]" : "text-[#b45309]")}>{result.message}</p>
          )}
          {[...result.issues.map((t) => ({ t, bad: true })), ...result.warnings.map((t) => ({ t, bad: false }))].map(({ t, bad }, i) => (
            <p key={i} className={cn("flex gap-2 text-[12.5px] leading-snug", bad ? "text-[#b91c1c]" : "text-[#92400e]")}>
              <span className={cn("mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full", bad ? "bg-[#dc2626]" : "bg-[#d97706]")} aria-hidden />
              <span className="min-w-0">{t}</span>
            </p>
          ))}
        </div>
      )}
    </li>
  )
}

/** The records to add, each value one press from the clipboard. */
function Records({ records }: { records: DnsRecord[] }) {
  return (
    <div data-dns-records="">
      <div className="overflow-hidden rounded-xl border border-[#e5e7eb]">
        <div className="hidden grid-cols-[72px_120px_minmax(0,1fr)_40px] gap-3 border-b border-[#f0f1f3] bg-[#f9fafb] px-3.5 py-2 text-[12px] font-medium text-[#6b7280] sm:grid">
          <span>Type</span>
          <span>Name</span>
          <span>Value</span>
          <span className="sr-only">Copy</span>
        </div>
        {records.map((r) => (
          <RecordRow key={`${r.type}-${r.name}-${r.value}`} r={r} />
        ))}
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-[#6b7280]">
        On Cloudflare, set them to DNS only (the grey cloud). Changes usually show within minutes and can take up to a day.
      </p>
    </div>
  )
}

function RecordRow({ r }: { r: DnsRecord }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-x-3 gap-y-0.5 border-b border-[#f0f1f3] px-3.5 py-2.5 last:border-b-0 sm:grid-cols-[72px_120px_minmax(0,1fr)_40px] sm:py-2">
      <span className="text-[12.5px] text-[#6b7280] sm:contents">
        <span className="font-mono text-[12.5px] text-[#1a1a2e] sm:text-[13px]">{r.type}</span>
        <span className="sm:hidden"> · </span>
        <span className="font-mono text-[12.5px] text-[#1a1a2e] sm:text-[13px]">{r.name}</span>
      </span>
      <span className="col-start-1 row-start-2 min-w-0 break-all font-mono text-[13px] text-[#1a1a2e] sm:col-start-auto sm:row-start-auto">{r.value}</span>
      <button
        type="button"
        aria-label={copied ? `${r.type} value copied` : `Copy the ${r.type} value`}
        title={copied ? "Copied" : "Copy"}
        onClick={async () => {
          if (await copyText(r.value)) {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1400)
          }
        }}
        className={cn(ICON_BUTTON, "col-start-2 row-span-2 row-start-1 self-center justify-self-end sm:col-start-auto sm:row-span-1 sm:row-start-auto")}
      >
        {copied ? <Check className="h-4 w-4 text-[#15803d]" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  )
}
