"use client"

/**
 * ===========================================================================
 *  SETTINGS › DOMAINS
 * ===========================================================================
 * "What did you do with the domains tab? I told you to keep it how it was.
 * Yes, of course update it with the new things the domains tab has, but you
 * disrupted the things I had: the icons of Hostinger and GoDaddy and the blur
 * attached to them, and all those things. Update what you connect a domain
 * to, but keep the UI and design I created."
 *
 * So this is the owner's Domains tab, as it was in components/app/
 * settings-form-new.tsx before 87e06ebc, card for card and class for class:
 *
 *   the Pro bar         the violet bar with Upgrade, for a free plan, and the
 *                       two cards under it blurred until they upgrade
 *   Connect your own    the field with the globe in it, the violet Connect,
 *     domain            "Get a domain:" with Hostinger, GoDaddy and
 *                       Namecheap's marks, and names from the username
 *   Your Domains        one table: Domain Name, Status, Date Added, Actions,
 *                       and a card per domain on a phone
 *   DNS Setup           each record in its own grey step, Copy beside every
 *     Instructions      value, Verified or Not found after a check, the
 *                       certificate note and the provider's tip
 *   How Custom          where each address goes, from and to
 *     Domains Work
 *
 * With what the tab does now baked into those same pieces:
 *
 *   what it is for      Connect asks: the website, or the creator page (with
 *                       its products and the OnePage at /links); each row
 *                       says which, with the primary one marked when there
 *                       are several, and Make primary on the others
 *   the records         the ones Vercel asked for (app/api/domains), named
 *                       the way the provider it was bought at wants them
 *                       (lib/custom-domains/dns-help), a status per record
 *                       after a check (app/api/domains/verify), what to fix
 *                       when it did not pass, and Check again
 *   the certificate     SSL Pending while it is issued, asked about quietly
 *                       every 12 seconds while the page is in front
 *   Remove              asks first, in the row, and says where visitors go
 *
 * Everything goes through app/api/domains, which checks the session and
 * holds the Vercel token; this file only draws and asks. The list is the
 * Settings page's (its quick links read it), so a change is handed back with
 * `onData`. The Website Settings screen in the builder draws the same
 * records and checks with components/domains/dns-setup.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AlertCircle, Check, CheckCircle, ChevronRight, Clock, Copy, ExternalLink, Globe, Loader2, Plus, X } from "lucide-react"

import { InfoTip } from "@/components/ui/tooltip"
import { SmartLink } from "@/components/smart-link"
import { toast } from "@/hooks/use-toast"
import { copyText } from "@/lib/platform/copy-text"
import { HOSTNAME_PROBLEM_TEXT, apexOf, cleanHostname, hostnameProblem, isApexHost, recordsFor, servingHost, type DnsRecord, type DomainPurpose } from "@/lib/custom-domains/hostname"
import { REGISTRARS, hostFor, registrarById, type RecordCheck, type RegistrarId } from "@/lib/custom-domains/dns-help"
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
const CARD = "bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#e5e7eb]"
/** A free plan: the cards are there, blurred, and nothing in them answers. */
const BLURRED = "blur-[1.5px] opacity-80 pointer-events-none select-none"
const VIOLET_BUTTON =
  "h-8 px-3 text-[12px] font-medium text-[#7c3aed] border border-[#ede9fe] bg-[#f5f3ff] hover:bg-[#ede9fe] rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
const QUIET_BUTTON =
  "h-8 px-3 text-[12px] font-medium text-[#6b7280] border border-[#e5e7eb] hover:text-[#1a1a2e] hover:bg-[#f9fafb] rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
const REMOVE_BUTTON =
  "h-8 px-3 text-[12px] font-medium text-[#6b7280] border border-[#e5e7eb] hover:text-red-600 hover:border-red-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 whitespace-nowrap"
const COPY_BUTTON =
  "relative text-[11px] text-[#7c3aed] hover:text-[#6d28d9] cursor-pointer flex items-center gap-1 shrink-0 before:absolute before:-inset-2 before:content-['']"

const PURPOSE_NAME: Record<DomainPurpose, string> = { website: "Website", creator_page: "Creator page" }

/** Where a domain stands, in the owner's words, with the note under the (i). */
function statusOf(d: DomainItem): { label: string; tip: string; pill: string; icon: ReactNode } {
  if (d.status === "active") return { label: "Connected", tip: "Domain is live", pill: "bg-emerald-50 text-emerald-700", icon: <CheckCircle className="h-3 w-3" /> }
  if (d.status === "ssl_provisioning") return { label: "SSL Pending", tip: "Issuing SSL cert", pill: "bg-blue-50 text-blue-700", icon: <Loader2 className="h-3 w-3 animate-spin" /> }
  if (d.status === "verifying") return { label: "Verifying", tip: "Checking DNS records", pill: "bg-amber-50 text-amber-700", icon: <Loader2 className="h-3 w-3 animate-spin" /> }
  if (d.status === "failed") return { label: "Failed", tip: "The records point somewhere else", pill: "bg-red-50 text-red-700", icon: <AlertCircle className="h-3 w-3" /> }
  return { label: "Pending", tip: "Awaiting DNS setup", pill: "bg-gray-100 text-gray-600", icon: <Clock className="h-3 w-3" /> }
}

function StatusPill({ d, align }: { d: DomainItem; align: "center" | "end" }) {
  const s = statusOf(d)
  return (
    <div className={cn("flex items-center gap-1", align === "end" && "justify-end")} data-domain-status={d.status}>
      <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold", s.pill)}>
        {s.icon} {s.label}
      </span>
      <InfoTip label={`About ${d.domain}'s status`} className="h-5 w-5 text-[#c0c5cc] hover:text-[#9ca3af]">
        {s.tip}
      </InfoTip>
    </div>
  )
}

function addedOn(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
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

function CopyValue({ value, copied, onCopy }: { value: string; copied: boolean; onCopy: (v: string) => void }) {
  return (
    <button type="button" onClick={() => onCopy(value)} className={COPY_BUTTON} aria-label={copied ? "Copied" : `Copy ${value}`} data-dns-copy="">
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

export function DomainsPanel({
  data,
  loading,
  onData,
  websiteAddress,
  creatorPageAddress,
  handle,
  locked,
  planLoading,
}: {
  data: DomainsData | null
  loading: boolean
  onData: (next: DomainsData) => void
  /** Where each is on storelib.com, which keeps working with or without a domain. */
  websiteAddress: string
  creatorPageAddress: string
  /** The username, for the suggested names. */
  handle: string
  /** Free plan: the page is shown, blurred, and the controls are not usable. */
  locked: boolean
  planLoading: boolean
}) {
  const domains = useMemo(() => data?.domains ?? [], [data])
  const purposes: DomainPurpose[] = data?.purposes?.length ? data.purposes : ["website", "creator_page"]
  const creatorPageOn = purposes.includes("creator_page")
  const blurred = locked && !planLoading

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
      toast({ title: `${body.domain.domain} added`, description: "Add the DNS records below where you bought it." })
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not connect that domain.")
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
      onData(body.domains ? body : { ...(cur ?? { domains: [] }), domains: (cur?.domains ?? []).filter((x) => x.id !== d.id) })
      setConfirming(null)
      toast({ title: `${d.domain} removed` })
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Could not remove it.", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  /* ── Copy, and the provider the records are named for ───────────────── */
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

  const fallbackOf = (p: DomainPurpose) => (p === "website" ? websiteAddress : creatorPageAddress)
  const purposeOf = (d: DomainItem): DomainPurpose => d.purpose ?? "website"
  /* Website domains first, then the creator page's; the primary one first in each. */
  const ordered = useMemo(
    () => [...domains].sort((a, b) => (purposeOf(a) === purposeOf(b) ? Number(!!b.is_primary) - Number(!!a.is_primary) : purposeOf(a) === "website" ? -1 : 1)),
    [domains],
  )
  const countOf = (p: DomainPurpose) => domains.filter((d) => purposeOf(d) === p).length
  const primaryOf = (p: DomainPurpose) => domains.find((d) => purposeOf(d) === p && d.is_primary) ?? null
  const waiting = ordered.filter((d) => d.status !== "active")
  const suggested = handle && domains.length === 0 ? [`${handle}.com`, `${handle}.store`, `${handle}.shop`, `${handle}.io`] : []

  /** The line under a domain's name: what it is for, and where it sends people now. */
  const lineOf = (d: DomainItem) => {
    const p = purposeOf(d)
    const many = countOf(p) > 1
    const primary = primaryOf(p)
    if (d.status === "active") {
      if (many && !d.is_primary && primary) return { text: `Sends visitors to ${primary.domain}`, fallback: null }
      if (isApexHost(d.domain)) return { text: `Opens at ${d.host || servingHost(d.domain)}`, fallback: null }
      return { text: null, fallback: null }
    }
    return { text: null, fallback: fallbackOf(p) }
  }

  const actionsOf = (d: DomainItem, mobile: boolean) => {
    const p = purposeOf(d)
    const canPrimary = d.status === "active" && countOf(p) > 1 && !d.is_primary && !locked
    const checked = !!results[d.id] || !!d.last_checked_at
    return (
      <>
        {d.status !== "active" && (
          <button
            type="button"
            onClick={() => void check(d)}
            disabled={checking === d.id || locked}
            data-domain-check=""
            className={mobile ? "flex-1 h-9 text-[12px] font-medium text-[#7c3aed] bg-[#f5f3ff] rounded-lg hover:bg-[#ede9fe] transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1" : VIOLET_BUTTON}
          >
            {checking === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : checked ? "Check again" : mobile ? "Verify DNS" : "Verify"}
          </button>
        )}
        {canPrimary && (
          <button
            type="button"
            onClick={() => void makePrimary(d)}
            disabled={busy === d.id}
            data-domain-primary=""
            className={mobile ? cn("h-9 px-4 text-[12px] font-medium text-[#374151] border border-[#e5e7eb] rounded-lg hover:bg-white transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1", d.status === "active" && "flex-1") : QUIET_BUTTON}
          >
            {busy === d.id && confirming !== d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Make primary"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirming(confirming === d.id ? null : d.id)}
          disabled={busy === d.id}
          aria-expanded={confirming === d.id}
          data-domain-remove=""
          className={
            mobile
              ? cn("h-9 px-4 text-[12px] font-medium text-[#6b7280] border border-[#e5e7eb] rounded-lg hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1", d.status === "active" && !canPrimary && "flex-1")
              : REMOVE_BUTTON
          }
        >
          Remove
        </button>
      </>
    )
  }

  /** Remove, asked in the row: what happens to the people who already have the address. */
  const confirmOf = (d: DomainItem) => {
    if (confirming !== d.id) return null
    const p = purposeOf(d)
    const primary = primaryOf(p)
    const goesTo = primary && primary.id !== d.id ? primary.domain : fallbackOf(p)
    return (
      <div role="alertdialog" aria-label={`Remove ${d.domain}?`} data-domain-confirm={d.domain} className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-red-800">Remove {d.domain}?</p>
          <p className="text-[12px] leading-relaxed text-red-700">
            {d.status === "active" ? `For 30 days it sends visitors to ${goesTo}, then it stops.` : "It was not connected yet, so nothing you shared stops working."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setConfirming(null)} className="h-8 flex-1 cursor-pointer rounded-lg border border-[#e5e7eb] bg-white px-3 text-[12px] font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] sm:flex-none">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void remove(d)}
            disabled={busy === d.id}
            data-domain-remove-confirm=""
            className="flex h-8 flex-1 cursor-pointer items-center justify-center gap-1 rounded-lg bg-red-600 px-3 text-[12px] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 sm:flex-none"
          >
            {busy === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Remove
          </button>
        </div>
      </div>
    )
  }

  /** The last check's answer, under the row, the owner's way: red when it did not pass, blue while the certificate is issued. */
  const feedbackOf = (d: DomainItem, mobile: boolean) => {
    const r = results[d.id]
    if (!r || !r.message || r.tone === "ok") return null
    const bad = r.tone === "bad"
    return (
      <div
        aria-live="polite"
        data-domain-result={r.tone}
        className={cn(
          "items-start gap-2 rounded-xl px-4 py-2.5 text-[12px] leading-relaxed",
          mobile ? "mt-3 flex" : "mb-1 hidden lg:flex",
          bad ? "border border-red-200 bg-red-50 text-red-700" : "border border-blue-200 bg-blue-50 text-blue-700",
        )}
      >
        {bad ? <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />}
        <span>{r.message}</span>
      </div>
    )
  }

  /* The How it works rows: where each address goes, from and to, for the domains there are. */
  const websiteTo = primaryOf("website")?.domain ?? domains.find((d) => purposeOf(d) === "website")?.domain ?? null
  const pageTo = primaryOf("creator_page")?.domain ?? domains.find((d) => purposeOf(d) === "creator_page")?.domain ?? null
  const how = [
    { title: "Your Website", from: websiteAddress, to: websiteTo ? servingHost(websiteTo) : "yourdomain.com" },
    { title: "Your Creator Page", from: creatorPageAddress, to: pageTo ? servingHost(pageTo) : "yourdomain.com" },
    { title: "Your OnePage", from: `${creatorPageAddress}/links`, to: `${pageTo ? servingHost(pageTo) : "yourdomain.com"}/links` },
    { title: "Product Pages", from: `${creatorPageAddress}/...`, to: `${pageTo ? servingHost(pageTo) : "yourdomain.com"}/...` },
  ]

  return (
    <div className="space-y-4 sm:space-y-6" data-domains-panel="">
      {/* Upgrade banner: only for a free plan, nothing while the plan loads or once it is paid. */}
      {blurred ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] px-4 py-3 shadow-sm sm:px-6 sm:py-3.5" data-domains-upgrade="">
          <div className="flex min-w-0 items-center gap-3">
            <Globe className="h-5 w-5 shrink-0 text-white" />
            <p className="truncate text-[13px] font-medium text-white sm:text-[14px]">
              <span className="sm:hidden">Upgrade for custom domains</span>
              <span className="hidden sm:inline">Custom domains are available on the Pro plan.</span>
            </p>
          </div>
          <a
            href="/app/settings/billing/upgrade"
            className="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-xl bg-white px-5 text-[13px] font-semibold text-[#7c3aed] no-underline shadow-sm transition-colors hover:bg-[#f5f3ff] active:bg-[#ede9fe]"
          >
            Upgrade
          </a>
        </div>
      ) : null}

      {/* Connect Your Domain Card */}
      <div className={cn(CARD, "transition-[filter,opacity] duration-700 ease-in-out", blurred && BLURRED)} data-domains-connect="" aria-disabled={blurred || undefined}>
        <h3 className="mb-1 text-[15px] font-semibold text-[#1a1a2e]">Connect your own domain</h3>
        {/* Desktop: full text, Mobile: shorter text */}
        <p className="mb-4 hidden text-[13px] text-[#6b7280] sm:block">
          Connect a domain you own to your website or to your creator page. Your creator page will be at <span className="font-medium">yourdomain.com</span> and your OnePage at <span className="font-medium">yourdomain.com/links</span>.
        </p>
        <p className="mb-4 text-[13px] text-[#6b7280] sm:hidden">Connect a domain you own to your website or creator page.</p>

        {/* What it is for */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[12px] font-medium text-[#6b7280]">Connect it to</span>
          <div role="radiogroup" aria-label="What the domain is for" className="inline-flex rounded-xl bg-[#f3f4f6] p-1" data-domains-purpose="">
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
                    "h-8 cursor-pointer rounded-lg px-3 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-50",
                    on ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.04)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
                  )}
                >
                  {PURPOSE_NAME[p]}
                </button>
              )
            })}
          </div>
          {!creatorPageOn && data ? <span className="text-[12px] text-[#9ca3af]">Creator page domains are coming to this account soon.</span> : null}
        </div>

        {/* Not a <form>: the Settings page is one form already, and a form inside a form is not HTML. */}
        <div className="flex gap-2" data-domains-add="">
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
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
              placeholder="Enter your domain (e.g. mydomain.com)"
              disabled={locked}
              aria-invalid={Boolean(addError)}
              aria-describedby="domains-new-hint"
              /* 16px on a phone, or iOS zooms the page to type in it. */
              className="h-11 w-full rounded-xl border border-[#e5e7eb] pl-10 pr-4 text-[16px] transition-colors focus:border-[#8b5cf6] focus:outline-none focus:ring-2 focus:ring-[#8b5cf6] disabled:cursor-not-allowed sm:text-[14px]"
            />
          </div>
          <button
            type="button"
            onClick={() => void add()}
            disabled={adding || !clean || locked}
            className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-[#7c3aed] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Connect
          </button>
        </div>

        {addError ? (
          <div id="domains-new-hint" role="alert" className="mt-3 flex items-center gap-2 text-[12px] text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {addError}
          </div>
        ) : previewHost ? (
          <p id="domains-new-hint" className="mt-2 text-[12px] text-[#6b7280]">
            {purpose === "website" ? `Your website will open at ${previewHost}.` : `Your creator page will open at ${previewHost}, and your OnePage at ${previewHost}/links.`}
          </p>
        ) : (
          <span id="domains-new-hint" className="sr-only">
            {purpose === "website" ? "Shows the website you built." : "Shows your creator page, your products and your OnePage."}
          </span>
        )}

        {/* DNS Provider Quick Links */}
        <div className="mt-3 flex items-center gap-3" data-domains-shops="">
          <span className="text-[11px] text-[#9ca3af]">Get a domain:</span>
          <div className="flex items-center gap-3">
            {SHOPS.map((shop) => (
              <a
                key={shop.name}
                href={shop.href}
                target="_blank"
                rel="noopener noreferrer"
                title={shop.name}
                aria-label={`Get a domain at ${shop.name}`}
                className="relative cursor-pointer opacity-90 transition-opacity before:absolute before:-inset-2.5 before:content-[''] hover:opacity-100"
              >
                {shop.mark}
              </a>
            ))}
          </div>
        </div>

        {/* Suggested Domains */}
        {suggested.length > 0 && (
          <div className="mt-4" data-domains-suggested="">
            <p className="mb-2 text-[12px] font-medium text-[#6b7280]">Suggested domains based on your username:</p>
            <div className="flex flex-wrap gap-2">
              {suggested.map((sd, idx) => (
                <button
                  key={sd}
                  type="button"
                  onClick={() => {
                    setDraft(sd)
                    setAddError(null)
                  }}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#ede9fe] bg-[#f5f3ff] px-3 py-1.5 text-[12px] font-medium text-[#7c3aed] transition-colors hover:bg-[#ede9fe]",
                    idx >= 3 && "hidden sm:inline-flex",
                  )}
                >
                  {sd}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Connected Domains List */}
      <div className={cn(CARD, "transition-[filter,opacity] duration-700 ease-in-out", blurred && BLURRED)} data-domains-list="" aria-disabled={blurred || undefined}>
        <h3 className="mb-4 text-[15px] font-semibold text-[#1a1a2e]">Your Domains</h3>

        {/* The spinner and the empty list are the same height, so the first load does not move what is under it. */}
        {loading && !data ? (
          <div className="flex min-h-[156px] items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#7c3aed]" />
          </div>
        ) : ordered.length === 0 ? (
          <div className="flex min-h-[156px] flex-col items-center justify-center text-center" data-domains-empty="">
            <Globe className="mx-auto mb-3 h-10 w-10 text-[#d1d5db]" />
            <p className="mb-1 text-[13px] text-[#6b7280]">No domains connected yet</p>
            <p className="text-[12px] text-[#9ca3af]">Add a custom domain above to get started</p>
          </div>
        ) : (
          <>
            {/* Table Header - Desktop */}
            <div className="hidden gap-4 border-b border-[#e5e7eb] pb-3 lg:grid lg:grid-cols-[1fr_130px_150px_180px]">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7280]">Domain Name</p>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7280]">Status</p>
              <p className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7280]">Date Added</p>
              <p className="text-right text-[12px] font-semibold uppercase tracking-wider text-[#6b7280]">Actions</p>
            </div>

            {ordered.map((d) => {
              const p = purposeOf(d)
              const line = lineOf(d)
              const primaryMark = countOf(p) > 1 && d.is_primary
              const added = addedOn(d.created_at)
              return (
                <div key={d.id} data-domain-row={d.domain} data-domain-purpose={p}>
                  {/* Desktop Row */}
                  <div className="hidden items-center gap-4 border-b border-[#f3f4f6] py-4 last:border-0 lg:grid lg:grid-cols-[1fr_130px_150px_180px]">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-[14px] font-medium text-[#1a1a2e]">{d.domain}</p>
                        {primaryMark ? <span className="shrink-0 rounded-full bg-[#f5f3ff] px-2 py-0.5 text-[11px] font-semibold text-[#7c3aed]">Primary</span> : null}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-[#9ca3af]">
                        <span className="text-[#6b7280]">{PURPOSE_NAME[p]}</span>
                        {line.text ? <> · {line.text}</> : null}
                        {line.fallback ? (
                          <>
                            {" "}· Fallback:{" "}
                            <SmartLink href={`https://${line.fallback}`} className="text-[#7c3aed] hover:underline">
                              {line.fallback}
                            </SmartLink>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <StatusPill d={d} align="center" />
                    <p className="text-[13px] text-[#6b7280]">{added ?? ""}</p>
                    <div className="flex items-center justify-end gap-2">{actionsOf(d, false)}</div>
                  </div>
                  {confirming === d.id ? <div className="mb-2 hidden lg:block">{confirmOf(d)}</div> : null}
                  {/* Inline verify feedback, for the domain last checked */}
                  {feedbackOf(d, false)}

                  {/* Mobile Card */}
                  <div className="mb-3 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4 lg:hidden">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-all text-[14px] font-semibold text-[#1a1a2e]">{d.domain}</p>
                        <p className="text-[12px] text-[#6b7280]">
                          {PURPOSE_NAME[p]}
                          {primaryMark ? <span className="ml-1.5 rounded-full bg-[#f5f3ff] px-2 py-0.5 text-[11px] font-semibold text-[#7c3aed]">Primary</span> : null}
                        </p>
                      </div>
                      <StatusPill d={d} align="end" />
                    </div>
                    {added ? <p className="mb-1 text-[12px] text-[#9ca3af]">Added {added}</p> : null}
                    {line.text ? <p className="mb-2 text-[11px] text-[#9ca3af]">{line.text}</p> : null}
                    {line.fallback ? (
                      <p className="mb-2 text-[11px] text-[#9ca3af]">
                        Fallback:{" "}
                        <SmartLink href={`https://${line.fallback}`} className="text-[#7c3aed] hover:underline">
                          {line.fallback}
                        </SmartLink>
                      </p>
                    ) : null}
                    <div className="flex items-center gap-2">{actionsOf(d, true)}</div>
                    {confirming === d.id ? <div className="mt-3">{confirmOf(d)}</div> : null}
                    {feedbackOf(d, true)}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* DNS Setup Instructions */}
      {waiting.length > 0 && (
        <div className={CARD} data-domains-dns="">
          <h3 className="mb-3 text-[15px] font-semibold text-[#1a1a2e]">DNS Setup Instructions</h3>
          <p className="mb-4 text-[13px] text-[#6b7280]">
            Add these records where you bought the domain, then press Verify. A bare domain like <span className="font-medium">yourdomain.com</span> opens at <span className="font-medium">www.yourdomain.com</span>.
          </p>

          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <label htmlFor="domains-registrar" className="text-[12px] font-medium text-[#6b7280]">
              Bought at
            </label>
            <select
              id="domains-registrar"
              value={registrar.id}
              onChange={(e) => setRegistrarId(e.target.value as RegistrarId)}
              data-dns-registrar=""
              className="h-9 cursor-pointer appearance-none rounded-lg border border-[#e5e7eb] bg-white bg-no-repeat pl-3 pr-8 text-[16px] text-[#1a1a2e] outline-none transition-colors focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6] sm:text-[13px]"
              style={{
                backgroundPosition: "right 8px center",
                backgroundSize: "16px 16px",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath d='M5.5 7.5 10 12l4.5-4.5'/%3E%3C/svg%3E")`,
              }}
            >
              {REGISTRARS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-[#9ca3af]">The names below are written the way it asks for them.</span>
          </div>

          <div className="space-y-6">
            {waiting.map((d) => {
              const records = d.records && d.records.length > 0 ? d.records : recordsFor(d.domain)
              const result = results[d.id]
              const passed = d.status === "ssl_provisioning" || d.status === "active"
              const checkOf = (r: DnsRecord): RecordCheck | null =>
                passed ? { type: r.type, name: r.name, state: "found", seen: [] } : (result?.checks?.find((c) => c.type === r.type && c.name === r.name) ?? null)
              const apex = apexOf(d.domain)
              return (
                <div key={d.id} data-dns-domain={d.domain} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="text-[13px] font-semibold text-[#1a1a2e]">
                      {d.domain} <span className="font-normal text-[#6b7280]">· {PURPOSE_NAME[purposeOf(d)]}</span>
                    </p>
                    {registrar.dnsUrl ? (
                      <a
                        href={registrar.dnsUrl(apex)}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-dns-open=""
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-[#7c3aed] hover:text-[#6d28d9]"
                      >
                        Open {registrar.name} DNS
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                  {records.map((r, i) => {
                    const c = checkOf(r)
                    const name = hostFor(registrar, r)
                    const fqdn = r.name === "@" ? apex : `${r.name}.${apex}`
                    return (
                      <div key={`${r.type}-${r.name}-${r.value}`} className="rounded-xl bg-[#f9fafb] p-4" data-dns-record={r.type}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="min-w-0 text-[12px] font-semibold text-[#374151]">
                            Step {i + 1}: {r.type} Record{" "}
                            <span className="font-normal text-[#6b7280]">{r.type === "TXT" ? "(proves the domain is yours)" : `(${fqdn})`}</span>
                          </p>
                          {c ? (
                            <span
                              data-dns-state={c.state}
                              className={cn(
                                "inline-flex shrink-0 items-center gap-1 text-[11px] font-medium",
                                c.state === "found" ? "text-green-600" : c.state === "conflict" ? "text-amber-600" : "text-[#9ca3af]",
                              )}
                            >
                              {c.state === "found" ? <Check className="h-3 w-3" /> : c.state === "conflict" ? <AlertCircle className="h-3 w-3" /> : <X className="h-3 w-3" />}
                              {c.state === "found" ? "Verified" : c.state === "conflict" ? "Other value" : "Not found"}
                            </span>
                          ) : null}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="w-14 shrink-0 text-[#6b7280]">Type:</span>
                            <span className="font-mono font-medium text-[#1a1a2e]">{r.type}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2 text-[12px]">
                              <span className="w-14 shrink-0 text-[#6b7280]">Name:</span>
                              {name ? <span className="break-all font-mono font-medium text-[#1a1a2e]" data-dns-name="">{name}</span> : <span className="italic text-[#6b7280]" data-dns-name="">Leave empty</span>}
                            </div>
                            {name ? <CopyValue value={name} copied={copied === name} onCopy={copy} /> : null}
                          </div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-2 text-[12px]">
                              <span className="w-14 shrink-0 text-[#6b7280]">Value:</span>
                              <span className={cn("break-all font-mono font-medium text-[#7c3aed]", r.type === "TXT" && "text-[11px]")} data-dns-value="">
                                {r.value}
                              </span>
                            </div>
                            <CopyValue value={r.value} copied={copied === r.value} onCopy={copy} />
                          </div>
                          {c?.state === "conflict" && c.seen.length > 0 ? (
                            <div className="flex items-start gap-2 text-[12px]">
                              <span className="w-14 shrink-0 text-amber-700">Found:</span>
                              <span className="break-all font-mono text-amber-700">{c.seen.slice(0, 3).join(", ")}</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                  {result && result.tone === "bad" && result.fixes.length > 0 ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3" data-dns-fixes="">
                      <p className="mb-1.5 text-[12px] font-semibold text-red-800">What to fix:</p>
                      <ul className="space-y-1.5">
                        {result.fixes.map((line) => (
                          <li key={line} className="flex items-start gap-2 text-[11px] leading-relaxed text-red-700">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )
            })}

            {/* SSL Provisioning notice */}
            {waiting.some((d) => d.status === "ssl_provisioning") && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4" data-dns-certificate="">
                <p className="mb-1 text-[13px] font-medium text-blue-800">SSL certificate is being issued</p>
                <p className="text-[12px] text-blue-600">Your DNS is set up correctly. An SSL certificate is being issued automatically, usually in 1 to 10 minutes. This page updates by itself when it is done.</p>
              </div>
            )}

            {/* The provider's tip: Cloudflare's grey cloud, GoDaddy's parked record, and the rest. */}
            {registrar.note ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4" data-dns-tip={registrar.id}>
                <p className="mb-1 text-[12px] font-semibold text-amber-800">{registrar.id === "other" ? "Bought somewhere else?" : `Using ${registrar.name}?`}</p>
                <p className="text-[11px] text-amber-700">{registrar.note}</p>
              </div>
            ) : null}

            <p className="text-[11px] leading-relaxed text-[#b0b5bd]">DNS propagation may take a few minutes to 48 hours. Click &quot;Verify&quot; after adding records. Remove any conflicting A, AAAA, or CNAME records.</p>
          </div>
        </div>
      )}

      {/* How Custom Domains Work */}
      <div className={CARD} data-domains-how="">
        <h3 className="mb-4 text-[15px] font-semibold text-[#1a1a2e]">How Custom Domains Work</h3>
        <div className="space-y-3">
          {how.map((item) => (
            <div key={item.title} className="group rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-3.5 transition-all duration-200 hover:border-[#ede9fe] hover:bg-[#f5f3ff]/50">
              <p className="mb-2 text-[13px] font-semibold text-[#374151]">{item.title}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-[#e5e7eb]/60 px-2 py-0.5 font-mono text-[11px] text-[#6b7280]">{item.from}</span>
                <ChevronRight className="h-3 w-3 shrink-0 text-[#9ca3af]" />
                <span className="rounded bg-[#ede9fe] px-2 py-0.5 font-mono text-[11px] font-medium text-[#7c3aed]">{item.to}</span>
              </div>
            </div>
          ))}
          <p className="mt-2 text-[11px] text-[#9ca3af]">
            Your storelib.com addresses keep working. A bare domain opens at its www, and HTTPS is set up for you.
          </p>
        </div>
      </div>
    </div>
  )
}
