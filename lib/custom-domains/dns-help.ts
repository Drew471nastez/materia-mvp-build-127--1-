/**
 * ===========================================================================
 *  WHERE TO ADD THE RECORDS, WHAT A CHECK FOUND, AND WHAT TO FIX
 * ===========================================================================
 * The records themselves come from lib/custom-domains/hostname.ts. This file
 * is the help around them:
 *
 *   registrars    how each one spells the name field, what it calls the
 *                 TTL left alone, and a link to its DNS page for the domain
 *   readRecord    what DNS answered for one record: found, not there yet,
 *                 or something else in its place, and what that was
 *   fixesFor      the checks, and the route's own diagnostics, as short
 *                 plain lines, most blocking first
 *
 * Pure and client safe. app/api/domains/verify reads with it and both
 * Domains screens draw with it (components/domains/dns-setup.tsx), so the
 * status beside a record and the fix under it come from the same answer.
 */
import type { DnsRecord } from "./hostname"
import { tt } from "@/lib/i18n/text"

/* ── Registrars ──────────────────────────────────────────────────────── */

export type RegistrarId = "godaddy" | "namecheap" | "cloudflare" | "squarespace" | "porkbun" | "hostinger" | "other"

export interface Registrar {
  id: RegistrarId
  name: string
  /** Their DNS page for this registrable domain, or null when there is no direct link. */
  dnsUrl: ((apex: string) => string) | null
  /** How their name field spells the domain itself. Empty means leave it empty. */
  apex: string
  /** What their TTL field says when left alone. */
  ttl: string
  /** One line that only applies here. */
  note?: string
}

export const REGISTRARS: readonly Registrar[] = [
  {
    id: "godaddy",
    name: "GoDaddy",
    dnsUrl: (d) => `https://dcc.godaddy.com/control/dnsmanagement?domainName=${encodeURIComponent(d)}`,
    apex: "@",
    get ttl() { return tt("Default") },
    get note() { return tt("GoDaddy adds a Parked A record on @. Edit it to the value above instead of adding a second one.") },
  },
  {
    id: "namecheap",
    name: "Namecheap",
    dnsUrl: (d) => `https://ap.www.namecheap.com/Domains/DomainControlPanel/${encodeURIComponent(d)}/advancedns`,
    apex: "@",
    get ttl() { return tt("Automatic") },
    get note() { return tt("Under Advanced DNS, delete the parking page CNAME and the URL Redirect record first.") },
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    dnsUrl: (d) => `https://dash.cloudflare.com/?to=/:account/${encodeURIComponent(d)}/dns/records`,
    apex: "@",
    get ttl() { return tt("Auto") },
    get note() { return tt("Set Proxy status to DNS only (grey cloud) on each record.") },
  },
  {
    id: "squarespace",
    name: "Squarespace",
    dnsUrl: (d) => `https://account.squarespace.com/domains/managed/${encodeURIComponent(d)}/dns/dns-settings`,
    apex: "@",
    get ttl() { return tt("Default") },
    get note() { return tt("Delete the Squarespace Defaults preset first, or its records stay in the way.") },
  },
  {
    id: "porkbun",
    name: "Porkbun",
    dnsUrl: () => "https://porkbun.com/account/domainsSpeedy",
    apex: "",
    ttl: "600",
    get note() { return tt("Open DNS next to your domain. Delete Porkbun's parking ALIAS and CNAME records first.") },
  },
  {
    id: "hostinger",
    name: "Hostinger",
    dnsUrl: (d) => `https://hpanel.hostinger.com/domain/${encodeURIComponent(d)}/dns`,
    apex: "@",
    get ttl() { return tt("Default") },
    get note() { return tt("Delete Hostinger's own A record on @ and CNAME on www before adding these.") },
  },
  {
    id: "other",
    name: "Somewhere else",
    dnsUrl: null,
    apex: "@",
    get ttl() { return tt("Default") },
    get note() { return tt("If @ is refused, leave the name empty. Some providers want the full name, like www.yourname.com.") },
  },
]

export function registrarById(id: string | null | undefined): Registrar {
  return REGISTRARS.find((r) => r.id === id) ?? REGISTRARS[REGISTRARS.length - 1]
}

/** The name field as this registrar wants it typed: "@" for the domain itself, or empty. */
export function hostFor(registrar: Registrar, record: Pick<DnsRecord, "name">): string {
  return record.name === "@" || record.name === "" ? registrar.apex : record.name
}

/* ── What a check saw ────────────────────────────────────────────────── */

export type RecordState = "found" | "missing" | "conflict"

export interface RecordCheck {
  type: DnsRecord["type"]
  name: string
  state: RecordState
  /** Answers that are not the value asked for: the old host, a parking page, a proxy. */
  seen: string[]
}

/** What DNS answered at one record's name. */
export interface RecordAnswers {
  a: string[]
  cname: string[]
  txt: string[]
}

const tidy = (v: string) => v.trim().toLowerCase().replace(/\.$/, "")

/** The full name a record sits at: "www" under maralind.com is www.maralind.com. */
export function recordFqdn(name: string, apex: string): string {
  return name === "@" || name === "" ? apex : `${name}.${apex}`
}

/**
 * One record against what DNS answered at its name.
 *
 *   A      found when an accepted address is there and nothing else is;
 *          a conflict when anything else is, since browsers pick at random
 *   CNAME  found when it names the record's value or another name the
 *          caller accepts, or its name answers with accepted addresses (a
 *          provider that flattens); a conflict when it names or answers
 *          with anything else
 *
 * WHAT IS ACCEPTED COMES FROM THE CALLER. app/api/domains/verify passes the
 * addresses and the older CNAMEs from lib/custom-domains/targets.ts, which
 * is server only, so this file (which the Domains screens import) names
 * nothing but the values a creator is shown.
 *   TXT    found when the value is there. Other values may sit beside it
 *          (one per connected name), so they are not in the way
 */
export function readRecord(
  record: DnsRecord,
  answers: RecordAnswers,
  acceptedIps: readonly string[] = [],
  acceptsCname: (target: string) => boolean = () => false,
): RecordCheck {
  const base = { type: record.type, name: record.name }
  const ips = new Set([record.type === "A" ? tidy(record.value) : "", ...acceptedIps.map(tidy)].filter(Boolean))
  const a = answers.a.map(tidy)
  if (record.type === "A") {
    if (a.length === 0) return { ...base, state: "missing", seen: [] }
    const others = a.filter((ip) => !ips.has(ip))
    return others.length ? { ...base, state: "conflict", seen: others } : { ...base, state: "found", seen: [] }
  }
  if (record.type === "CNAME") {
    const cnames = answers.cname.map(tidy)
    if (cnames.some((c) => c === tidy(record.value) || acceptsCname(c))) return { ...base, state: "found", seen: [] }
    if (cnames.length) return { ...base, state: "conflict", seen: cnames }
    if (a.length === 0) return { ...base, state: "missing", seen: [] }
    const others = a.filter((ip) => !ips.has(ip))
    return others.length ? { ...base, state: "conflict", seen: others } : { ...base, state: "found", seen: [] }
  }
  const txt = answers.txt.map((t) => t.trim())
  return txt.includes(record.value.trim()) ? { ...base, state: "found", seen: [] } : { ...base, state: "missing", seen: [] }
}

/** Cloudflare's published IPv4 ranges, enough to say its proxy is in front. */
export function isCloudflareIp(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) return false
  const [a, b, c] = parts
  if (a === 104 && b >= 16 && b <= 31) return true
  if (a === 172 && b >= 64 && b <= 71) return true
  if (a === 103 && (b === 21 || b === 22 || b === 31)) return true
  if (a === 141 && b === 101 && c >= 64 && c <= 127) return true
  if (a === 108 && b === 162 && c >= 192) return true
  if (a === 162 && (b === 158 || b === 159)) return true
  if (a === 173 && b === 245 && c >= 48 && c <= 63) return true
  if (a === 188 && b === 114 && c >= 96 && c <= 111) return true
  if (a === 190 && b === 93 && c >= 240) return true
  if (a === 197 && b === 234 && c >= 240 && c <= 243) return true
  if (a === 198 && b === 41 && c >= 128) return true
  if (a === 131 && b === 0 && c >= 72 && c <= 75) return true
  return false
}

const isIp = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s)
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : tt("{value} and {xs}", { value: xs.slice(0, -1).join(", "), xs: xs[xs.length - 1] }))

/**
 * What to do, in plain lines, most blocking first: Cloudflare's proxy and
 * the route's issues, then each record, then the route's warnings. Empty
 * when nothing needs doing. The screens show it only after a check.
 */
export function fixesFor(
  records: DnsRecord[],
  checks: RecordCheck[] | null | undefined,
  diagnostics: { issues?: string[]; warnings?: string[] } = {},
): string[] {
  const issues = diagnostics.issues ?? []
  const warnings = diagnostics.warnings ?? []
  const out: string[] = []
  const all = checks ?? []
  const proxied = all.some((c) => c.seen.some(isCloudflareIp))
  if (proxied && !issues.some((i) => /cloudflare/i.test(i))) {
    out.push(tt("Cloudflare's proxy is on. Set each record to DNS only (grey cloud), then check again."))
  }
  out.push(...issues)

  const valueOf = (c: RecordCheck) => records.find((r) => r.type === c.type && r.name === c.name)?.value ?? ""
  const where = (c: RecordCheck) => (c.name === "@" ? "@" : c.name)
  const nothing = all.length > 0 && all.every((c) => c.state === "missing")
  if (nothing) {
    out.push(tt("Nothing has shown up yet. New records usually appear within an hour, sometimes up to 48 hours."))
  } else {
    for (const c of all) {
      const value = valueOf(c)
      if (c.state === "missing") {
        out.push(c.type === "TXT" ? tt("No TXT record on {c} yet. Add it with the value above.", { c: where(c) }) : tt("No {type} record on {c} yet. Add it with the value {value}.", { type: c.type, c: where(c), value }))
        continue
      }
      if (c.state !== "conflict" || proxied) continue
      if (c.type === "A") {
        out.push(tt("Delete the A {length, plural, one {record} other {records}} {seen} on @. Only {value} should be there.", { length: c.seen.length, seen: list(c.seen), value }))
      } else if (c.seen.some((s) => s.includes("parkingpage.namecheap.com"))) {
        out.push(tt("{c} still points at Namecheap's parking page. Delete that record, then add the CNAME above.", { c: where(c) }))
      } else if (c.seen.every(isIp)) {
        out.push(tt("{c} has an A record ({seen}). Delete it and add the CNAME above instead.", { c: where(c), seen: list(c.seen) }))
      } else {
        out.push(tt("{c} points at {seen}. Change it to {value}.", { c: where(c), seen: list(c.seen), value }))
      }
    }
  }

  /* The route words extra A records itself; the A line above already says it. */
  const aConflict = all.some((c) => c.type === "A" && c.state === "conflict")
  out.push(...warnings.filter((w) => !(aConflict && /\bA records\b/.test(w) && !/AAAA/.test(w))))
  return [...new Set(out)]
}
