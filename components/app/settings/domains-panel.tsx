"use client"

/**
 * ===========================================================================
 *  SETTINGS › DOMAINS
 * ===========================================================================
 * "The DNS setup instructions and how custom domain works should not appear
 * if I didn't start adding my domain. The Connect to should appear after I
 * add my domain, not be there by default. Easy to understand, clean."
 *
 * So the tab grows with the domain, one step at a time:
 *
 *   nothing added    Connect your own domain: the field, Add, and one line
 *                    (use one you own, or get one at Hostinger, GoDaddy or
 *                    Namecheap, the owner's marks). No records, no chooser,
 *                    no explainer.
 *   added, waiting   Your domains: a row with its status (Pending, Needs
 *                    attention), Connects to (website or creator page, for
 *                    that domain), and its records as one compact table,
 *                    Type, Name, Value, Copy beside each, with one line on
 *                    where to add them and Check.
 *   connected        the row, Connected, Connects to; the records fold away
 *                    behind a small "DNS records" for reference.
 *   help             one "Help" at the bottom of the list, closed, five
 *                    short lines. Only once there is a domain.
 *
 * What a domain connects to is asked after it is added: the POST adds it to
 * the website, and PATCH { action: "set_purpose" } (app/api/domains) moves
 * it to the creator page and back, keeping one primary per purpose.
 *
 * Sections come and go by a grid row going 0fr to 1fr with its opacity, 200ms,
 * nothing measured in script, and at once under prefers-reduced-motion
 * (<Reveal>). Phones first: every control is 44px under 640px, a record
 * stacks Name over Value there, and a long value wraps inside its cell.
 *
 * Everything goes through app/api/domains, which checks the session and
 * holds the Vercel token; this file only draws and asks. The list is the
 * Settings page's (its quick links read it), so a change is handed back with
 * `onData`. The website builder draws the same records with
 * components/domains/dns-setup. Measured by scripts/check-domains-flow.mjs.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AlertCircle, Check, CheckCircle, ChevronDown, Clock, Copy, ExternalLink, Loader2 } from "lucide-react"

import { toast } from "@/hooks/use-toast"
import { copyText } from "@/lib/platform/copy-text"
import { HOSTNAME_PROBLEM_TEXT, apexOf, cleanHostname, hostnameProblem, isApexHost, recordsFor, servingHost, type DnsRecord, type DomainPurpose } from "@/lib/custom-domains/hostname"
import { REGISTRARS, hostFor, registrarById, type RecordCheck, type Registrar, type RegistrarId } from "@/lib/custom-domains/dns-help"
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
  /** One per record, when the check read them (app/api/domains/verify). */
  checks: RecordCheck[] | null
  /** What to do, in plain lines: the route's fixes, else its issues and warnings. */
  fixes: string[]
}

/* ── The owner's classes, said once ─────────────────────────────────────── */
const CARD = "bg-white rounded-2xl app-card-x py-4 sm:py-6 shadow-sm border border-[#e5e7eb]"
/** A free plan: the card is there, blurred, and nothing in it answers. */
const BLURRED = "blur-[1.5px] opacity-80 pointer-events-none select-none"
/** 44px on a phone, the owner's 32px from 640 up. */
const ROW_BUTTON =
  "h-11 sm:h-8 px-4 sm:px-3 text-[13px] sm:text-[12px] font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1 whitespace-nowrap"
const VIOLET_BUTTON = cn(ROW_BUTTON, "text-[#7c3aed] border border-[#ede9fe] bg-[#f5f3ff] hover:bg-[#ede9fe]")
const QUIET_BUTTON = cn(ROW_BUTTON, "text-[#374151] sm:text-[#6b7280] border border-[#e5e7eb] hover:text-[#1a1a2e] hover:bg-[#f9fafb]")
const REMOVE_BUTTON = cn(ROW_BUTTON, "text-[#6b7280] border border-[#e5e7eb] hover:text-red-600 hover:border-red-200")

const PURPOSE_NAME: Record<DomainPurpose, string> = { website: "Website", creator_page: "Creator page" }

/* ── Reveal: a section coming and going by its own height ───────────────── */
const REVEAL_MS = 200

/**
 * A grid row from 0fr to 1fr, with its opacity: the browser finds the height,
 * nothing is measured in script. `appear` plays it on mount too (a domain
 * just added); `animate={false}` snaps (the list arriving with the page).
 * While closing it keeps drawing what it last showed, so a card that empties
 * folds up with its rows still in it. Closed, it is inert and then unmounted.
 */
function Reveal({
  open,
  appear = false,
  animate = true,
  children,
  className,
  ...rest
}: {
  open: boolean
  appear?: boolean
  animate?: boolean
  children: ReactNode
  className?: string
} & Record<`data-${string}`, string | undefined> & { id?: string }) {
  const [shown, setShown] = useState(appear ? false : open)
  const [mounted, setMounted] = useState(open)
  const [settled, setSettled] = useState(open && !appear)
  const kept = useRef<ReactNode>(children)
  if (open) kept.current = children

  useEffect(() => {
    let frame = 0
    let timer = 0
    if (open) {
      frame = requestAnimationFrame(() => {
        setMounted(true)
        frame = requestAnimationFrame(() => setShown(true))
      })
      timer = window.setTimeout(() => setSettled(true), REVEAL_MS + 40)
    } else {
      frame = requestAnimationFrame(() => {
        setShown(false)
        setSettled(false)
      })
      timer = window.setTimeout(() => setMounted(false), REVEAL_MS + 40)
    }
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [open])

  if (!open && !mounted) return null
  const visible = animate ? shown : open
  return (
    <div
      {...rest}
      data-reveal={visible ? "open" : "closed"}
      inert={!open || undefined}
      className={cn("grid", animate && "transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none", className)}
      style={{ gridTemplateRows: visible ? "1fr" : "0fr", opacity: visible ? 1 : 0 }}
    >
      {/* Clipped only while it moves, so a focus ring at its edge is not cut once it is open. */}
      <div className={cn("min-h-0", !(settled && open && visible) && "overflow-hidden")}>{open ? children : kept.current}</div>
    </div>
  )
}

/* ── Where a domain stands ──────────────────────────────────────────────── */
type Standing = { label: "Connected" | "Pending" | "Needs attention"; pill: string; icon: ReactNode }

function standingOf(d: DomainItem, result: CheckResult | undefined): Standing {
  if (d.status === "active") return { label: "Connected", pill: "bg-emerald-50 text-emerald-700", icon: <CheckCircle className="h-3 w-3" /> }
  const conflict = result?.checks?.some((c) => c.state === "conflict") ?? false
  if (d.status === "failed" || conflict) return { label: "Needs attention", pill: "bg-red-50 text-red-700", icon: <AlertCircle className="h-3 w-3" /> }
  const moving = d.status === "verifying" || d.status === "ssl_provisioning"
  return { label: "Pending", pill: "bg-gray-100 text-gray-600", icon: moving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" /> }
}

function addedOn(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * Where to buy a domain: the owner's three marks, drawn in #374151 at 20px,
 * each opening its own search, each with its name for a screen reader.
 */
const SHOPS: { name: string; href: string; mark: ReactNode }[] = [
  {
    name: "Hostinger",
    href: "https://www.hostinger.com/domain-name-search",
    mark: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#374151" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M16.415 0v7.16l5.785 3.384V2.949zM1.8 0v11.237h18.815L14.89 8.09l-7.457-.003V3.024zm14.615 20.894v-5.019l-7.514-.005c.007.033-5.82-3.197-5.82-3.197l19.119.091V24zM1.8 13.551v7.343l5.633 2.949v-6.988z" />
      </svg>
    ),
  },
  {
    name: "GoDaddy",
    href: "https://www.godaddy.com/en/domains",
    mark: (
      <svg width="20" height="20" viewBox="0 0 1534 1368" fill="#374151" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path fillRule="evenodd" d="M1391.5 968.9C1233.6 1221.8 986.7 1370 767 1367.2c-219.8 2.8-466.6-145.4-624.5-398.4C-71.6 625.8-41 220 210.9 62.4c159.2-99.5 369.2-75.9 555.8 41.8 187.2-117.8 397.1-141.3 556.5-41.8 251.9 157.6 282.2 563.4 68.3 906.5M280.3 929.8q11.3 16.5 23.4 32.3 12.2 15.9 25 31.1 12.8 15.3 26.4 30c-45.4-184.8-5.7-416.6 124.3-624.9Q497 370 516.5 343q19.5-27.1 40.8-52.7t44.3-49.7 47.7-46.6c-17.2-9-34.8-17.1-52.8-24.4-118.2-46.9-229.3-43.9-313.3 8.7-84 52.7-135.5 151.4-145.1 278.1q-1.8 26.9-1.3 53.8.4 27 3.1 53.8 2.7 26.9 7.6 53.4 5 26.5 12.1 52.5 7.9 30 18.2 59.3 10.2 29.3 22.6 57.8 12.4 28.4 26.9 55.8 14.6 27.5 31.1 53.7 10.5 16.9 21.9 33.3m1106.3-312.4q4.8-26.5 7.4-53.3 2.7-26.8 3.1-53.7t-1.4-53.8c-9.6-126.7-61-225.4-145.1-278-84-52.6-195.3-55.7-313.3-8.7q-24.9 10.2-48.8 22.4-24 12.3-46.9 26.5T797.1 249q-21.6 16.1-41.8 33.8c-31.1 27.3-60.2 56.8-86.9 88.2-26.8 31.5-51.2 65-73.1 100-21.9 35.1-41.2 71.7-57.8 109.6-16.5 37.9-30.2 77-41.1 116.9C477.5 767 470.3 839.2 475 911c9.5 126.8 61.1 225.6 145.1 278.1 10.8 6.7 22 12.5 33.5 17.6 11.6 5.1 23.5 9.5 35.6 13s24.5 6.2 37 8.1c12.5 1.8 25.1 2.8 37.7 3h6.5c12.6-.2 25.2-1.2 37.7-3.1 12.5-1.8 24.8-4.5 37-8 12.1-3.6 24-7.9 35.5-13 11.6-5.1 22.8-11 33.6-17.6 83.9-52.5 135.5-151.3 145-278 4.8-71.9-2.4-144.1-21.4-213.6-4.9-19.8-11.4-39-17.9-58.6l-201 125.7c-2.8 1.8-6 3-9.2 3.6-3.3.5-6.7.4-9.9-.3-3.3-.8-6.4-2.2-9.1-4.1-2.7-2-5-4.4-6.7-7.2l-45.5-72.9c-1.8-2.8-3-5.9-3.5-9.2-.6-3.3-.5-6.7.3-9.9.7-3.3 2.1-6.3 4-9 2-2.8 4.4-5.1 7.2-6.8l310.2-194c2.9-1.9 6.2-3.2 9.7-3.7 3.5-.6 7-.4 10.4.5 3.4 1 6.6 2.6 9.3 4.8s4.9 5 6.5 8.2c99.5 190.3 127.1 393.2 86.5 558.8q13.5-14.7 26.4-30 12.8-15.3 24.9-31.2t23.5-32.3q11.3-16.5 21.9-33.4 16.5-26.3 31-53.7 14.6-27.4 27-55.9 12.4-28.4 22.6-57.7t18.2-59.3q7.1-26 12-52.5" />
      </svg>
    ),
  },
  {
    name: "Namecheap",
    href: "https://www.namecheap.com/domains/",
    mark: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#374151" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M17.295 17.484c.227.403.57.728.985.931-.309.15-.647.229-.99.232h-3.068a2.26 2.26 0 0 1-1.957-1.143L6.705 6.511a2.27 2.27 0 0 0-.974-.922c.309-.153.652-.233.997-.232h3.05c.81.003 1.558.438 1.959 1.143zm-9.329-7.392L6.269 6.755c-.209-.392-.582-.657-.984-.829-.204.165-.391.35-.522.581-.184.349-4.391 8.648-4.569 8.987a2.245 2.245 0 0 0 4.016 1.999zm15.846-1.593a2.245 2.245 0 0 0-1.162-2.955v-.001a2.2 2.2 0 0 0-.892-.187l-.003-.011c-.816 0-1.569.443-1.965 1.157l-3.749 7.414 1.689 3.323c.213.399.59.664.998.839.252-.2.473-.444.605-.742z" />
      </svg>
    ),
  },
]

const REGISTRAR_KEY = "storelib:domain-registrar"

/** The provider last picked on this device, as the builder's DNS set up keeps it (the same key). */
function useRegistrar(): [RegistrarId, (id: RegistrarId) => void] {
  const [id, setId] = useState<RegistrarId>("godaddy")
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REGISTRAR_KEY)
      if (saved && REGISTRARS.some((r) => r.id === saved)) setId(saved as RegistrarId)
    } catch {
      /* Storage refused: the first provider stands. */
    }
  }, [])
  const choose = useCallback((next: RegistrarId) => {
    setId(next)
    try {
      window.localStorage.setItem(REGISTRAR_KEY, next)
    } catch {
      /* Nothing to keep it in. */
    }
  }, [])
  return [id, choose]
}

/** Copy, as an icon: 44px square on a phone, 32px from 640 up with its reach still 44px. */
function CopyButton({ value, what, copied, onCopy }: { value: string; what: string; copied: boolean; onCopy: (v: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(value)}
      aria-label={copied ? "Copied" : `Copy ${what}`}
      data-dns-copy=""
      className={cn(
        "relative -my-1.5 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors before:absolute before:-inset-1.5 before:content-[''] sm:my-0 sm:h-8 sm:w-8",
        copied ? "text-emerald-600" : "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#1a1a2e]",
      )}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  )
}

/** One cell of the records table: a label on a phone, the value wrapping inside the cell, and Copy. */
function RecordCell({ label, value, kind, copied, onCopy }: { label: string; value: string; kind: "name" | "value"; copied: string | null; onCopy: (v: string) => void }) {
  return (
    <div role="cell" className="flex min-w-0 items-center gap-2">
      <span className="w-12 shrink-0 text-[12px] text-[#9ca3af] sm:hidden">{label}</span>
      {value ? (
        <span className="min-w-0 flex-1 font-mono text-[13px] sm:flex-none font-medium text-[#1a1a2e] [overflow-wrap:anywhere]" {...(kind === "name" ? { "data-dns-name": "" } : { "data-dns-value": "" })}>
          {value}
        </span>
      ) : (
        <span className="min-w-0 flex-1 text-[13px] italic sm:flex-none text-[#6b7280]" data-dns-name="">
          Leave empty
        </span>
      )}
      {value ? <CopyButton value={value} what={`${label.toLowerCase()} ${value}`} copied={copied === value} onCopy={onCopy} /> : null}
    </div>
  )
}

const STATE_TEXT: Record<RecordCheck["state"], string> = { found: "Found", conflict: "Other value", missing: "Not found" }

/** The records for one domain: Type, Name, Value, each value with Copy. A row per record from 640 up, stacked below it. */
function RecordsTable({
  d,
  registrar,
  checkOf,
  copied,
  onCopy,
}: {
  d: DomainItem
  registrar: Registrar
  checkOf: (r: DnsRecord) => RecordCheck | null
  copied: string | null
  onCopy: (v: string) => void
}) {
  const records = d.records && d.records.length > 0 ? d.records : recordsFor(d.domain)
  return (
    <div role="table" aria-label={`DNS records for ${d.domain}`} className="rounded-xl border border-[#e5e7eb]" data-dns-table={d.domain}>
      <div role="row" className="hidden grid-cols-[72px_minmax(0,1fr)_minmax(0,2fr)] gap-3 px-3 py-2 sm:grid">
        {["Type", "Name", "Value"].map((h) => (
          <span key={h} role="columnheader" className="text-[11px] font-medium text-[#9ca3af]">
            {h}
          </span>
        ))}
      </div>
      {records.map((r, i) => {
        const c = checkOf(r)
        return (
          <div
            key={`${r.type}-${r.name}-${r.value}`}
            role="row"
            data-dns-record={r.type}
            className={cn(
              "grid grid-cols-1 gap-y-1 border-[#f3f4f6] px-3 py-2.5 sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,2fr)] sm:items-center sm:gap-x-3",
              /* The first record's line is the header's, from 640 up where there is a header. */
              i === 0 ? "sm:border-t" : "border-t",
            )}
          >
            <div role="cell" className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-semibold text-[#1a1a2e]">{r.type}</span>
              {c ? (
                <span
                  data-dns-state={c.state}
                  className={cn("inline-flex items-center gap-1 text-[11px] font-medium", c.state === "found" ? "text-emerald-600" : c.state === "conflict" ? "text-amber-700" : "text-[#9ca3af]")}
                >
                  {STATE_TEXT[c.state]}
                </span>
              ) : null}
            </div>
            <RecordCell label="Name" value={hostFor(registrar, r)} kind="name" copied={copied} onCopy={onCopy} />
            <RecordCell label="Value" value={r.value} kind="value" copied={copied} onCopy={onCopy} />
            {c?.state === "conflict" && c.seen.length > 0 ? (
              <p className="text-[12px] text-amber-700 sm:col-span-3 [overflow-wrap:anywhere]" data-dns-seen="">
                Also there now: <span className="font-mono">{c.seen.slice(0, 3).join(", ")}</span>. Delete it.
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
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
  /** The username. No longer read here: the tab suggests no names. */
  handle?: string
  /** Free plan: the page is shown, blurred, and the controls are not usable. */
  locked: boolean
  planLoading: boolean
}) {
  const domains = useMemo(() => data?.domains ?? [], [data])
  const purposes: DomainPurpose[] = data?.purposes?.length ? data.purposes : ["website", "creator_page"]
  const creatorPageOn = purposes.includes("creator_page")
  const blurred = locked && !planLoading

  const purposeOf = (d: DomainItem): DomainPurpose => d.purpose ?? "website"

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

  /* A change made here moves things smoothly; the list arriving with the page does not. */
  const [touched, setTouched] = useState(false)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  /* ── Adding one ─────────────────────────────────────────────────────── */
  const [draft, setDraft] = useState("")
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const clean = cleanHostname(draft)

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
      /* The website first; the row asks what it connects to once it is there. */
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: clean, purpose: "website" }),
      })
      const body = (await res.json().catch(() => ({}))) as { domain?: DomainItem; error?: string }
      if (!res.ok || !body.domain) throw new Error(body.error || "Could not add that domain.")
      /* Read the list again rather than guess what the server changed (a replaced domain, a primary). */
      const list = await fetch("/api/domains").then((r) => (r.ok ? (r.json() as Promise<DomainsData>) : null)).catch(() => null)
      const cur = dataRef.current
      setTouched(true)
      setJustAdded(body.domain.id)
      onData(list ?? { ...(cur ?? { domains: [] }), domains: [body.domain, ...(cur?.domains ?? [])] })
      setDraft("")
      toast({ title: `${body.domain.domain} added`, description: "Add its DNS records to connect it." })
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add that domain.")
    } finally {
      setAdding(false)
    }
  }

  /* ── Checking ───────────────────────────────────────────────────────── */
  const [checking, setChecking] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, CheckResult>>({})

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
        setTouched(true)
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
            checks: Array.isArray(r.checks) ? r.checks : null,
            fixes: Array.isArray(r.fixes) ? r.fixes : [...(r.issues ?? []), ...(r.warnings ?? [])],
          },
        }))
        if (status === "active" && d.status !== "active") {
          toast({ title: `${d.domain} is connected` })
          /* The primary host per purpose moved; the server knows it. */
          const list = await fetch("/api/domains").then((x) => (x.ok ? (x.json() as Promise<DomainsData>) : null)).catch(() => null)
          if (list) onData(list)
        }
      } catch (e) {
        if (!quiet) setResults((all) => ({ ...all, [d.id]: { tone: "bad", message: e instanceof Error ? e.message : "Could not check the records.", checks: null, fixes: [] } }))
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

  /* ── What it connects to, primary, remove ───────────────────────────── */
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const setPurposeOf = async (d: DomainItem, next: DomainPurpose) => {
    if (locked || busy === d.id || purposeOf(d) === next) return
    const was = purposeOf(d)
    setBusy(d.id)
    replaceDomain(d.id, { purpose: next })
    try {
      const res = await fetch("/api/domains", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: d.id, action: "set_purpose", purpose: next }),
      })
      const body = (await res.json().catch(() => ({}))) as DomainsData & { error?: string }
      if (!res.ok || !body.domains) throw new Error(body.error || "Could not change it.")
      onData(body)
      toast({ title: `${d.domain} now opens your ${next === "website" ? "website" : "creator page"}` })
    } catch (e) {
      replaceDomain(d.id, { purpose: was })
      toast({ title: e instanceof Error ? e.message : "Could not change it.", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

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
      toast({ title: `${d.domain} is now primary` })
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
      setTouched(true)
      onData(body.domains ? body : { ...(cur ?? { domains: [] }), domains: (cur?.domains ?? []).filter((x) => x.id !== d.id) })
      setConfirming(null)
      toast({ title: `${d.domain} removed` })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not remove it.", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  /* ── Copy, the provider the records are named for, what is open ─────── */
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (value: string) => {
    void copyText(value).then((ok) => {
      if (!ok) return
      setCopied(value)
      window.setTimeout(() => setCopied((c) => (c === value ? null : c)), 2000)
    })
  }
  const [registrarId, setRegistrarId] = useRegistrar()
  const registrar = registrarById(registrarId)
  /* A connected domain's records, opened for reference. */
  const [openRecords, setOpenRecords] = useState<Record<string, boolean>>({})
  const [helpOpen, setHelpOpen] = useState(false)

  const fallbackOf = (p: DomainPurpose) => (p === "website" ? websiteAddress : creatorPageAddress)
  /* Website domains first, then the creator page's; the primary one first in each. */
  const ordered = useMemo(
    () => [...domains].sort((a, b) => (purposeOf(a) === purposeOf(b) ? Number(!!b.is_primary) - Number(!!a.is_primary) : purposeOf(a) === "website" ? -1 : 1)),
    [domains],
  )
  const countOf = (p: DomainPurpose) => domains.filter((d) => purposeOf(d) === p).length
  const primaryOf = (p: DomainPurpose) => domains.find((d) => purposeOf(d) === p && d.is_primary) ?? null

  /** The line under a domain's name: where it sends people once connected, when it was added before. */
  const lineOf = (d: DomainItem): string | null => {
    const p = purposeOf(d)
    if (d.status === "active") {
      const primary = primaryOf(p)
      if (countOf(p) > 1 && !d.is_primary && primary) return `Sends visitors to ${primary.domain}`
      return isApexHost(d.domain) ? `Opens at ${d.host || servingHost(d.domain)}` : null
    }
    const added = addedOn(d.created_at)
    return added ? `Added ${added}` : null
  }

  /** Remove, asked in the row: what happens to the people who already have the address. */
  const confirmOf = (d: DomainItem) => {
    const p = purposeOf(d)
    const primary = primaryOf(p)
    const goesTo = primary && primary.id !== d.id ? primary.domain : fallbackOf(p)
    return (
      <div role="alertdialog" aria-label={`Remove ${d.domain}?`} data-domain-confirm={d.domain} className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-red-800">Remove {d.domain}?</p>
          <p className="text-[12px] text-red-700">{d.status === "active" ? `Visitors go to ${goesTo} for 30 days, then it stops.` : "It is not connected yet, so nothing stops working."}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setConfirming(null)} className="h-11 flex-1 cursor-pointer rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] sm:h-8 sm:flex-none sm:text-[12px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void remove(d)}
            disabled={busy === d.id}
            data-domain-remove-confirm=""
            className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-red-600 px-3 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 sm:h-8 sm:flex-none sm:text-[12px]"
          >
            {busy === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Remove
          </button>
        </div>
      </div>
    )
  }

  /** Connects to: the website or the creator page, for this domain. */
  const connectsOf = (d: DomainItem) => {
    const p = purposeOf(d)
    /* Before the database knows creator page domains, every domain is the website's. */
    if (!creatorPageOn) return <p className="text-[12px] text-[#6b7280]">Connects to your website</p>
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span id={`domain-connects-${d.id}`} className="text-[13px] text-[#6b7280] sm:text-[12px]">
          Connects to
        </span>
        <div role="radiogroup" aria-labelledby={`domain-connects-${d.id}`} className="inline-flex rounded-xl bg-[#f3f4f6] p-0.5 sm:p-1" data-domain-connects={d.domain}>
          {(["website", "creator_page"] as DomainPurpose[]).map((option) => {
            const on = p === option
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={locked || (busy === d.id && !on)}
                onClick={() => void setPurposeOf(d, option)}
                className={cn(
                  "h-11 cursor-pointer rounded-[10px] sm:rounded-lg px-3.5 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150 disabled:cursor-not-allowed sm:h-8 sm:px-3",
                  on ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.04)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
                )}
              >
                {PURPOSE_NAME[option]}
              </button>
            )
          })}
        </div>
        {p === "creator_page" ? <span className="basis-full text-[12px] text-[#9ca3af]">With your products, and your OnePage at /links.</span> : null}
      </div>
    )
  }

  /** The records for a domain still waiting, or a connected one's opened for reference. */
  const recordsOf = (d: DomainItem, waiting: boolean) => {
    const result = results[d.id]
    const passed = d.status === "ssl_provisioning" || d.status === "active"
    const checkOf = (r: DnsRecord): RecordCheck | null =>
      passed ? { type: r.type, name: r.name, state: "found", seen: [] } : (result?.checks?.find((c) => c.type === r.type && c.name === r.name) ?? null)
    const apex = apexOf(d.domain)
    return (
      <div className={cn("space-y-3", waiting ? "pt-3" : "pt-1")} data-dns-domain={d.domain}>
        {waiting ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px] text-[#374151]">
            <label htmlFor={`domains-registrar-${d.id}`}>Add these at</label>
            <select
              id={`domains-registrar-${d.id}`}
              value={registrar.id}
              onChange={(e) => setRegistrarId(e.target.value as RegistrarId)}
              data-dns-registrar=""
              className="h-11 cursor-pointer appearance-none rounded-lg border border-[#e5e7eb] bg-white bg-no-repeat pl-3 pr-8 text-[16px] text-[#1a1a2e] outline-none transition-colors focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6] sm:h-8 sm:text-[13px]"
              style={{
                backgroundPosition: "right 8px center",
                backgroundSize: "16px 16px",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath d='M5.5 7.5 10 12l4.5-4.5'/%3E%3C/svg%3E")`,
              }}
            >
              {REGISTRARS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id === "other" ? "another provider" : r.name}
                </option>
              ))}
            </select>
            {registrar.dnsUrl ? (
              <a
                href={registrar.dnsUrl(apex)}
                target="_blank"
                rel="noopener noreferrer"
                data-dns-open=""
                aria-label={`Open ${registrar.name} DNS`}
                className="inline-flex h-11 items-center gap-1 text-[13px] font-medium text-[#7c3aed] hover:text-[#6d28d9] sm:ml-auto sm:h-8 sm:text-[12px]"
              >
                Open<span className="sr-only sm:not-sr-only">{registrar.name}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        ) : null}

        <RecordsTable d={d} registrar={registrar} checkOf={checkOf} copied={copied} onCopy={copy} />

        {/* The provider's one line: Cloudflare's grey cloud, GoDaddy's parked record, and the rest. */}
        {waiting && registrar.note ? (
          <p className="text-[12px] text-[#6b7280]" data-dns-tip={registrar.id}>
            {registrar.note}
          </p>
        ) : null}

        {waiting && result && result.tone === "bad" && (result.message || result.fixes.length > 0) ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5" data-dns-fixes="" aria-live="polite">
            {result.message ? <p className="text-[12px] font-medium text-red-800" data-domain-result="bad">{result.message}</p> : null}
            {result.fixes.length > 0 ? (
              <ul className={cn("space-y-1", result.message && "mt-1.5")}>
                {result.fixes.map((line) => (
                  <li key={line} className="flex items-start gap-2 text-[12px] text-red-700">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-red-500" />
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  const website = primaryOf("website") ?? domains.find((d) => purposeOf(d) === "website" && isApexHost(d.domain)) ?? null
  const example = website && isApexHost(website.domain) ? website.domain : "yourname.com"

  return (
    <div className="space-y-4 sm:space-y-6" data-domains-panel="">
      {/* Upgrade banner: only for a free plan, nothing while the plan loads or once it is paid. */}
      {blurred ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] px-4 py-3 shadow-sm sm:px-6 sm:py-3.5" data-domains-upgrade="">
          <p className="min-w-0 truncate text-[13px] font-medium text-white sm:text-[14px]">
            <span className="sm:hidden">Upgrade for custom domains</span>
            <span className="hidden sm:inline">Custom domains are available on the Pro plan.</span>
          </p>
          <a
            href="/app/settings/billing/upgrade"
            className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-xl bg-white px-5 text-[13px] font-semibold text-[#7c3aed] no-underline shadow-sm transition-colors hover:bg-[#f5f3ff] active:bg-[#ede9fe] sm:h-9"
          >
            Upgrade
          </a>
        </div>
      ) : null}

      {/* Adding one: the field, Add, and one line. Nothing else until there is a domain. */}
      <div className={cn(CARD, "transition-[filter,opacity] duration-300 ease-out", blurred && BLURRED)} data-domains-connect="" aria-disabled={blurred || undefined}>
        <h3 className="mb-3 text-[15px] font-semibold text-[#1a1a2e]">Connect your own domain</h3>
        {/* Not a <form>: the Settings page is one form already, and a form inside a form is not HTML. */}
        <div className="flex gap-2" data-domains-add="">
          <label htmlFor="domains-new" className="sr-only">
            Domain
          </label>
          <input
            id="domains-new"
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setAddError(null)
            }}
            onKeyDown={(e) => {
              /* Enter adds, and is kept from submitting the Settings form around it. */
              if (e.key === "Enter") {
                e.preventDefault()
                void add()
              }
            }}
            inputMode="url"
            enterKeyHint="go"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="yourname.com"
            disabled={locked}
            aria-invalid={Boolean(addError)}
            aria-describedby="domains-new-hint"
            /* 16px on a phone, or iOS zooms the page to type in it. */
            className="h-11 min-w-0 flex-1 rounded-xl border border-[#e5e7eb] px-3.5 text-[16px] transition-colors focus:border-[#8b5cf6] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] disabled:cursor-not-allowed sm:text-[14px]"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={adding || !clean || locked}
            data-domains-add-button=""
            className="flex h-11 min-w-[72px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#7c3aed] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </button>
        </div>

        {addError ? (
          <p id="domains-new-hint" role="alert" className="mt-2 flex items-center gap-1.5 text-[12px] text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {addError}
          </p>
        ) : (
          /* The one line: use a domain you own, or get one (the owner's marks). */
          <div id="domains-new-hint" className="mt-1 flex flex-wrap items-center gap-x-1 text-[12px] text-[#6b7280]" data-domains-shops="">
            <span className="py-3 sm:py-2">Use a domain you own, or get one at</span>
            {/* The three marks wrap together; each reaches 44px on a phone and sits 32px from the next. */}
            <span className="inline-flex px-1.5 sm:px-0">
              {SHOPS.map((shop) => (
                <a
                  key={shop.name}
                  href={shop.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={shop.name}
                  aria-label={`Get a domain at ${shop.name}`}
                  className="-mx-1.5 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg opacity-90 transition-opacity hover:bg-[#f3f4f6] hover:opacity-100 sm:mx-0 sm:h-8 sm:w-8"
                >
                  {shop.mark}
                </a>
              ))}
            </span>
          </div>
        )}
      </div>

      {/* Your domains: only once there is one. */}
      <Reveal open={ordered.length > 0} animate={touched} data-domains-reveal="list">
        <div className={cn(CARD, "transition-[filter,opacity] duration-300 ease-out", blurred && BLURRED)} data-domains-list="" aria-disabled={blurred || undefined}>
          <h3 className="mb-1 text-[15px] font-semibold text-[#1a1a2e]">Your domains</h3>

          {ordered.map((d) => {
            const p = purposeOf(d)
            const result = results[d.id]
            const standing = standingOf(d, result)
            const line = lineOf(d)
            const primaryMark = countOf(p) > 1 && d.is_primary
            const connected = d.status === "active"
            const dnsDone = connected || d.status === "ssl_provisioning"
            const recordsShown = !dnsDone || !!openRecords[d.id]
            const canPrimary = connected && countOf(p) > 1 && !d.is_primary && !locked
            const checked = !!result || !!d.last_checked_at
            return (
              <Reveal key={d.id} open appear={d.id === justAdded && ordered.length > 1} data-domain-reveal={d.domain}>
                <div data-domain-row={d.domain} data-domain-purpose={p} className="border-t border-[#f3f4f6] py-4 first:border-t-0 last:pb-1">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="min-w-0 text-[14px] font-semibold text-[#1a1a2e] [overflow-wrap:anywhere]">{d.domain}</p>
                        {primaryMark ? <span className="shrink-0 rounded-full bg-[#f5f3ff] px-2 py-0.5 text-[11px] font-semibold text-[#7c3aed]">Primary</span> : null}
                      </div>
                      {line ? <p className="mt-0.5 text-[12px] text-[#9ca3af] [overflow-wrap:anywhere]" data-domain-line="">{line}</p> : null}
                    </div>
                    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold", standing.pill)} data-domain-status={d.status} data-domain-standing={standing.label}>
                      {standing.icon}
                      {standing.label}
                    </span>
                    {/* The row's actions: under it on a phone, in reach of a thumb; beside it from 640 up. */}
                    <div className="col-span-2 row-start-3 flex gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1" data-domain-actions="">
                      {!dnsDone ? (
                        <button type="button" onClick={() => void check(d)} disabled={checking === d.id || locked} data-domain-check="" className={cn(VIOLET_BUTTON, "flex-1 sm:flex-none")}>
                          {checking === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : checked ? "Check again" : "Check"}
                        </button>
                      ) : null}
                      {canPrimary ? (
                        <button type="button" onClick={() => void makePrimary(d)} disabled={busy === d.id} data-domain-primary="" className={cn(QUIET_BUTTON, "flex-1 sm:flex-none")}>
                          {busy === d.id && confirming !== d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Make primary"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setConfirming(confirming === d.id ? null : d.id)}
                        disabled={busy === d.id}
                        aria-expanded={confirming === d.id}
                        data-domain-remove=""
                        className={cn(REMOVE_BUTTON, dnsDone && !canPrimary && "flex-1 sm:flex-none")}
                      >
                        Remove
                      </button>
                    </div>

                    {/* Spacing lives inside each part, so a part folding away takes its gap with it. */}
                    <div className="col-span-2 row-start-2 min-w-0 sm:col-span-3" data-domain-body="">
                      {connectsOf(d)}
                      {d.status === "ssl_provisioning" ? (
                        <p className="mt-3 text-[12px] text-[#6b7280]" data-dns-certificate="">
                          Records found. HTTPS is being set up, usually within 10 minutes.
                        </p>
                      ) : null}

                      {dnsDone ? (
                        <button
                          type="button"
                          onClick={() => setOpenRecords((all) => ({ ...all, [d.id]: !all[d.id] }))}
                          aria-expanded={!!openRecords[d.id]}
                          aria-controls={`domain-records-${d.id}`}
                          data-dns-disclosure=""
                          className="mt-1.5 inline-flex h-11 cursor-pointer items-center gap-1 text-[12px] font-medium text-[#6b7280] hover:text-[#1a1a2e] sm:h-8"
                        >
                          DNS records
                          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none", openRecords[d.id] && "rotate-180")} />
                        </button>
                      ) : null}
                      <Reveal open={recordsShown} id={`domain-records-${d.id}`} data-dns-reveal={d.domain}>
                        {recordsOf(d, !dnsDone)}
                      </Reveal>

                      <Reveal open={confirming === d.id} data-domain-confirm-reveal={d.domain}>
                        <div className="pt-3">{confirmOf(d)}</div>
                      </Reveal>
                    </div>
                  </div>
                </div>
              </Reveal>
            )
          })}

          {/* Help: closed, at the bottom, five short lines. */}
          <div className="mt-3 border-t border-[#f3f4f6] pt-1">
            <button
              type="button"
              onClick={() => setHelpOpen((o) => !o)}
              aria-expanded={helpOpen}
              aria-controls="domains-help"
              data-domains-help-toggle=""
              className="inline-flex h-11 cursor-pointer items-center gap-1 text-[12px] font-medium text-[#6b7280] hover:text-[#1a1a2e] sm:h-9"
            >
              Help
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none", helpOpen && "rotate-180")} />
            </button>
            <Reveal open={helpOpen} id="domains-help" data-domains-help="">
              <ul className="space-y-1.5 pb-1 text-[12px] text-[#6b7280]">
                <li>Your storelib.com addresses keep working.</li>
                <li>
                  {example} opens at www.{example}.
                </li>
                <li>A creator page domain also carries your products and your OnePage at /links.</li>
                <li>New records can take a few minutes, and up to 48 hours, to show.</li>
                <li>Delete other A, AAAA or CNAME records on the same names.</li>
              </ul>
            </Reveal>
          </div>
        </div>
      </Reveal>
      {/* While the list is first read nothing is drawn under the field: an empty list draws nothing either. */}
      {loading && !data ? <span className="sr-only" role="status">Loading domains</span> : null}
    </div>
  )
}
