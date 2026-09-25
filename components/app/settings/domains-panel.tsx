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
 * One card to connect a domain (what it is for, then the name, and where to
 * buy one), one card per purpose listing its domains, and four lines on how
 * a domain behaves (components/domains/how-it-works.tsx). A domain that is
 * not live yet shows its DNS set up in three steps (components/domains/
 * dns-setup.tsx): the records exactly as Vercel reported them, in the words
 * of the provider it was bought at, a status per record after a check, and
 * the fixes when that check did not pass. The primary domain of a purpose is
 * the address canonicals and share links name; any other redirects to it
 * (proxy.ts). Remove asks first, in the row, and says where visitors will go.
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

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Copy, ExternalLink, Loader2, MoreHorizontal, Star, Trash2 } from "lucide-react"

import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { secondaryDepth } from "@/components/ui/depth-button"
import { DnsSetup } from "@/components/domains/dns-setup"
import { HowItWorks } from "@/components/domains/how-it-works"
import { toast } from "@/hooks/use-toast"
import { copyText } from "@/lib/platform/copy-text"
import { HOSTNAME_PROBLEM_TEXT, cleanHostname, hostnameProblem, isApexHost, recordsFor, servingHost, type DnsRecord, type DomainPurpose } from "@/lib/custom-domains/hostname"
import type { RecordCheck } from "@/lib/custom-domains/dns-help"
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

type CheckResult = {
  tone: "ok" | "wait" | "bad"
  message: string
  issues: string[]
  warnings: string[]
  /** One per record, when the check read them (app/api/domains/verify). */
  checks: RecordCheck[] | null
  /** What to do, in plain lines; issues and warnings when the route did not send them. */
  fixes: string[]
}

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

function addedOn(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })
}

/**
 * Where to buy a domain, for a creator who has none yet. The three
 * registrars Settings has always pointed to, drawn as their marks with
 * their names, each opening its own search.
 */
const SHOPS: { name: string; href: string; mark: ReactNode }[] = [
  {
    name: "GoDaddy",
    href: "https://www.godaddy.com/en/domains",
    mark: (
      <svg width="16" height="16" viewBox="0 0 1534 1368" fill="currentColor" aria-hidden>
        <path fillRule="evenodd" d="M1391.5 968.9C1233.6 1221.8 986.7 1370 767 1367.2c-219.8 2.8-466.6-145.4-624.5-398.4C-71.6 625.8-41 220 210.9 62.4c159.2-99.5 369.2-75.9 555.8 41.8 187.2-117.8 397.1-141.3 556.5-41.8 251.9 157.6 282.2 563.4 68.3 906.5M280.3 929.8q11.3 16.5 23.4 32.3 12.2 15.9 25 31.1 12.8 15.3 26.4 30c-45.4-184.8-5.7-416.6 124.3-624.9Q497 370 516.5 343q19.5-27.1 40.8-52.7t44.3-49.7 47.7-46.6c-17.2-9-34.8-17.1-52.8-24.4-118.2-46.9-229.3-43.9-313.3 8.7-84 52.7-135.5 151.4-145.1 278.1q-1.8 26.9-1.3 53.8.4 27 3.1 53.8 2.7 26.9 7.6 53.4 5 26.5 12.1 52.5 7.9 30 18.2 59.3 10.2 29.3 22.6 57.8 12.4 28.4 26.9 55.8 14.6 27.5 31.1 53.7 10.5 16.9 21.9 33.3m1106.3-312.4q4.8-26.5 7.4-53.3 2.7-26.8 3.1-53.7t-1.4-53.8c-9.6-126.7-61-225.4-145.1-278-84-52.6-195.3-55.7-313.3-8.7q-24.9 10.2-48.8 22.4-24 12.3-46.9 26.5T797.1 249q-21.6 16.1-41.8 33.8c-31.1 27.3-60.2 56.8-86.9 88.2-26.8 31.5-51.2 65-73.1 100-21.9 35.1-41.2 71.7-57.8 109.6-16.5 37.9-30.2 77-41.1 116.9C477.5 767 470.3 839.2 475 911c9.5 126.8 61.1 225.6 145.1 278.1 10.8 6.7 22 12.5 33.5 17.6 11.6 5.1 23.5 9.5 35.6 13s24.5 6.2 37 8.1c12.5 1.8 25.1 2.8 37.7 3h6.5c12.6-.2 25.2-1.2 37.7-3.1 12.5-1.8 24.8-4.5 37-8 12.1-3.6 24-7.9 35.5-13 11.6-5.1 22.8-11 33.6-17.6 83.9-52.5 135.5-151.3 145-278 4.8-71.9-2.4-144.1-21.4-213.6-4.9-19.8-11.4-39-17.9-58.6l-201 125.7c-2.8 1.8-6 3-9.2 3.6-3.3.5-6.7.4-9.9-.3-3.3-.8-6.4-2.2-9.1-4.1-2.7-2-5-4.4-6.7-7.2l-45.5-72.9c-1.8-2.8-3-5.9-3.5-9.2-.6-3.3-.5-6.7.3-9.9.7-3.3 2.1-6.3 4-9 2-2.8 4.4-5.1 7.2-6.8l310.2-194c2.9-1.9 6.2-3.2 9.7-3.7 3.5-.6 7-.4 10.4.5 3.4 1 6.6 2.6 9.3 4.8s4.9 5 6.5 8.2c99.5 190.3 127.1 393.2 86.5 558.8q13.5-14.7 26.4-30 12.8-15.3 24.9-31.2t23.5-32.3q11.3-16.5 21.9-33.4 16.5-26.3 31-53.7 14.6-27.4 27-55.9 12.4-28.4 22.6-57.7t18.2-59.3q7.1-26 12-52.5" />
      </svg>
    ),
  },
  {
    name: "Namecheap",
    href: "https://www.namecheap.com/domains/",
    mark: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M17.295 17.484c.227.403.57.728.985.931-.309.15-.647.229-.99.232h-3.068a2.26 2.26 0 0 1-1.957-1.143L6.705 6.511a2.27 2.27 0 0 0-.974-.922c.309-.153.652-.233.997-.232h3.05c.81.003 1.558.438 1.959 1.143zm-9.329-7.392L6.269 6.755c-.209-.392-.582-.657-.984-.829-.204.165-.391.35-.522.581-.184.349-4.391 8.648-4.569 8.987a2.245 2.245 0 0 0 4.016 1.999zm15.846-1.593a2.245 2.245 0 0 0-1.162-2.955v-.001a2.2 2.2 0 0 0-.892-.187l-.003-.011c-.816 0-1.569.443-1.965 1.157l-3.749 7.414 1.689 3.323c.213.399.59.664.998.839.252-.2.473-.444.605-.742z" />
      </svg>
    ),
  },
  {
    name: "Hostinger",
    href: "https://www.hostinger.com/domain-name-search",
    mark: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M16.415 0v7.16l5.785 3.384V2.949zM1.8 0v11.237h18.815L14.89 8.09l-7.457-.003V3.024zm14.615 20.894v-5.019l-7.514-.005c.007.033-5.82-3.197-5.82-3.197l19.119.091V24zM1.8 13.551v7.343l5.633 2.949v-6.988z" />
      </svg>
    ),
  },
]

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
          checks?: RecordCheck[]
          fixes?: string[]
        }
        if (!res.ok) throw new Error(r.error || "Could not check the records just now.")
        const status = r.status || (r.verified ? (r.sslPending ? "ssl_provisioning" : "active") : "pending")
        replaceDomain(d.id, {
          status,
          ...(r.records?.length ? { records: r.records } : {}),
          last_checked_at: new Date().toISOString(),
          ...(status === "active" ? { ssl_status: "active", verified_at: d.verified_at || new Date().toISOString() } : {}),
        })
        const tone: CheckResult["tone"] = status === "active" ? "ok" : r.verified ? "wait" : "bad"
        setResults((all) => ({
          ...all,
          [d.id]: {
            tone,
            message: r.message || "",
            issues: r.issues ?? [],
            warnings: r.warnings ?? [],
            checks: Array.isArray(r.checks) ? r.checks : null,
            fixes: Array.isArray(r.fixes) ? r.fixes : [...(r.issues ?? []), ...(r.warnings ?? [])],
          },
        }))
        /* A check that did not pass opens the set up, where its fixes are. */
        if (!quiet && tone === "bad") setOpenRecords((o) => ({ ...o, [d.id]: true }))
        if (status === "active" && d.status !== "active") {
          toast({ title: `${d.host || d.domain} is connected` })
          /* The primary host per purpose moved; the server knows it. */
          const list = await fetch("/api/domains").then((x) => (x.ok ? (x.json() as Promise<DomainsData>) : null)).catch(() => null)
          if (list) onData(list)
        }
      } catch (e) {
        if (!quiet) setResults((all) => ({ ...all, [d.id]: { tone: "bad", message: e instanceof Error ? e.message : "Could not check the records.", issues: [], warnings: [], checks: null, fixes: [] } }))
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
            <p className="text-[14px] font-semibold text-[#1a1a2e]">Your own domain is on Pro</p>
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

        {/* No domain yet: where to buy one. */}
        <div className="mt-3 flex flex-col border-t border-[#f0f1f3] pt-3 sm:flex-row sm:items-center sm:gap-2" data-domains-shops="">
          <span className="text-[13px] text-[#6b7280]">Get a domain</span>
          <div className="-mx-2 flex flex-wrap items-center sm:mx-0">
            {SHOPS.map((shop) => (
              <a
                key={shop.name}
                href={shop.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-[#374151] no-underline transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e] sm:h-8"
              >
                {shop.mark}
                {shop.name}
              </a>
            ))}
          </div>
        </div>
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

      <section className={cn(CARD, "p-4 sm:p-6")} aria-labelledby="domains-how">
        <h3 id="domains-how" className="mb-3 text-[15px] font-semibold text-[#1a1a2e]">
          How custom domains work
        </h3>
        <HowItWorks example={domains.find((d) => d.apex ?? isApexHost(d.domain))?.domain ?? null} />
      </section>
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
  const added = addedOn(d.created_at)

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
      : added
        ? `Added ${added}. Set up its DNS below.`
        : "Set up its DNS below."

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

      {!live && (() => {
        const toggle = (
          <button type="button" onClick={onToggleRecords} className="h-11 cursor-pointer text-[13px] font-medium text-[#4b5563] underline-offset-4 hover:text-[#1a1a2e] hover:underline sm:h-8">
            {recordsOpen ? "Hide DNS setup" : "Show DNS setup"}
          </button>
        )
        const when = checked && <span className="text-[12.5px] text-[#9ca3af]">Checked {checked}</span>
        const label = checked || result ? "Check again" : "Check DNS"
        return recordsOpen ? (
          <div className="mt-4 border-t border-[#f0f1f3] pt-4" data-domain-setup={d.domain}>
            <DnsSetup
              domain={d.domain}
              records={d.records && d.records.length > 0 ? d.records : recordsFor(d.domain)}
              checks={result?.checks ?? null}
              status={d.status}
              checking={checking}
              onCheck={onCheck}
              checkLabel={label}
              disabled={locked}
              result={result ? { tone: result.tone, message: result.message } : null}
              fixes={result?.fixes ?? []}
              aside={
                <>
                  {toggle}
                  {when}
                </>
              }
              tone="light"
            />
          </div>
        ) : (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <button type="button" onClick={onCheck} disabled={checking || locked} className={SECONDARY}>
                {checking && <Loader2 className="h-4 w-4 animate-spin" />}
                {label}
              </button>
              {toggle}
              {when}
            </div>
            {result?.message && (
              <p aria-live="polite" className={cn("mt-2 text-[13px] leading-snug", result.tone === "ok" ? "text-[#15803d]" : result.tone === "wait" ? "text-[#4b5563]" : "text-[#b45309]")}>
                {result.message}
              </p>
            )}
          </div>
        )
      })()}

      {live && result && (result.message || result.issues.length > 0 || result.warnings.length > 0) && (
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
