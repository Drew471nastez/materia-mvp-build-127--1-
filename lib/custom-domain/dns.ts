/**
 * ===========================================================================
 *  THE DNS A CONNECTED DOMAIN NEEDS, AND WHAT A CHECK FOUND
 * ===========================================================================
 * Three records, the same for everybody:
 *
 *   A      @          216.150.1.1              the bare domain
 *   CNAME  www        cname.vercel-dns.com     the address visitors end on
 *   TXT    _storelib  storelib-verify-…        proof the domain is theirs
 *
 * What differs is how each registrar spells the name field and where its
 * DNS page is, so the screens ask where the domain was bought and write the
 * table in that registrar's words. A check (app/api/domains/verify) reads
 * what DNS actually answers and `readChecks` turns it into one state per
 * record: found, not there yet, or something else in the way, with what was
 * seen. `troubleFor` words the fix for the last kind.
 *
 * Pure and client safe. The route and both Domains screens share it, so the
 * records a creator is told to add are the records the check looks for.
 */

/** Vercel's address for a bare domain. 76.76.21.21 is the older one and still answers. */
export const APEX_IP = "216.150.1.1"
export const ACCEPTED_APEX_IPS = [APEX_IP, "76.76.21.21"] as const
export const WWW_TARGET = "cname.vercel-dns.com"
export const ACCEPTED_WWW_TARGETS = [WWW_TARGET, "cname.storelib.com"] as const
export const TXT_NAME = "_storelib" as const

export type RecordKey = "a" | "cname" | "txt"
export type RecordState = "found" | "missing" | "conflict"

export interface DnsRecord {
  key: RecordKey
  type: "A" | "CNAME" | "TXT"
  /** The name as it is stored: "@" for the domain itself. */
  name: "@" | "www" | typeof TXT_NAME
  value: string
}

export function recordsFor(verificationToken: string | null | undefined): DnsRecord[] {
  return [
    { key: "a", type: "A", name: "@", value: APEX_IP },
    { key: "cname", type: "CNAME", name: "www", value: WWW_TARGET },
    ...(verificationToken ? [{ key: "txt" as const, type: "TXT" as const, name: TXT_NAME, value: verificationToken }] : []),
  ]
}

/* ── Registrars ────────────────────────────────────────────────────────── */

export type RegistrarId = "godaddy" | "namecheap" | "cloudflare" | "squarespace" | "porkbun" | "hostinger" | "other"

export interface Registrar {
  id: RegistrarId
  name: string
  /** Their DNS page for this domain, or their domain list when there is no deep link. */
  dnsUrl: ((domain: string) => string) | null
  /** How their name field spells the domain itself. Empty means leave it blank. */
  apex: string
  /** What their TTL field is called when left alone. */
  ttl: string
  /** One line that only applies here. */
  note?: string
}

export const REGISTRARS: Registrar[] = [
  {
    id: "godaddy",
    name: "GoDaddy",
    dnsUrl: (d) => `https://dcc.godaddy.com/control/dnsmanagement?domainName=${encodeURIComponent(d)}`,
    apex: "@",
    ttl: "Default",
    note: "GoDaddy adds a Parked A record for @. Edit it to the value above rather than adding a second one.",
  },
  {
    id: "namecheap",
    name: "Namecheap",
    dnsUrl: (d) => `https://ap.www.namecheap.com/Domains/DomainControlPanel/${encodeURIComponent(d)}/advancedns`,
    apex: "@",
    ttl: "Automatic",
    note: "Under Advanced DNS, delete the parking page CNAME and the URL Redirect record first.",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    dnsUrl: (d) => `https://dash.cloudflare.com/?to=/:account/${encodeURIComponent(d)}/dns/records`,
    apex: "@",
    ttl: "Auto",
    note: "Set Proxy status to DNS only (grey cloud) on both records.",
  },
  {
    id: "squarespace",
    name: "Squarespace (Google Domains)",
    dnsUrl: (d) => `https://account.squarespace.com/domains/managed/${encodeURIComponent(d)}/dns/dns-settings`,
    apex: "@",
    ttl: "Default",
    note: "Delete the Squarespace Defaults preset first, or its records stay in the way.",
  },
  {
    id: "porkbun",
    name: "Porkbun",
    dnsUrl: () => "https://porkbun.com/account/domainsSpeedy",
    apex: "",
    ttl: "600",
    note: "Open DNS next to your domain. Porkbun adds parking records; delete the ALIAS and CNAME ones.",
  },
  {
    id: "hostinger",
    name: "Hostinger",
    dnsUrl: (d) => `https://hpanel.hostinger.com/domain/${encodeURIComponent(d)}/dns`,
    apex: "@",
    ttl: "Default",
    note: "Delete Hostinger's own A record for @ and CNAME for www before adding these.",
  },
  {
    id: "other",
    name: "Somewhere else",
    dnsUrl: null,
    apex: "@",
    ttl: "Default",
    note: "If @ is refused, leave the name empty. Some providers want the full name, like www.yourdomain.com.",
  },
]

export function registrarById(id: string | null | undefined): Registrar {
  return REGISTRARS.find((r) => r.id === id) ?? REGISTRARS[REGISTRARS.length - 1]
}

/** The name field as this registrar wants it typed. */
export function hostFor(registrar: Registrar, record: DnsRecord): string {
  return record.name === "@" ? registrar.apex : record.name
}

/* ── What a check saw ──────────────────────────────────────────────────── */

export interface RecordCheck {
  state: RecordState
  /** What DNS answered that is not what we asked for, for the fix to name. */
  seen: string[]
}

export interface DnsChecks {
  a: RecordCheck
  cname: RecordCheck
  txt: RecordCheck
  /** IPv6 addresses on the domain or www: they send some visitors elsewhere. */
  aaaa: string[]
  /** The A records answer with Cloudflare's addresses: its proxy is on. */
  cloudflareProxy: boolean
  /** A CAA record exists and does not allow the certificate authority. */
  caaBlocks: boolean
}

const clean = (v: string) => v.trim().toLowerCase().replace(/\.$/, "")

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

/**
 * The raw answers, turned into one state per record.
 *
 *   A      found when a Vercel address is there and nothing else is;
 *          conflict when anything else is, since browsers pick at random
 *   CNAME  found when www names Vercel, or answers with a Vercel address;
 *          conflict when it names or answers with anything else
 *   TXT    found when the token is there; conflict when _storelib holds
 *          something else, usually a token from an earlier attempt
 */
export function readChecks(input: {
  apexA: string[]
  wwwCname: string[]
  wwwA: string[]
  txt: string[]
  aaaa: string[]
  caaIssuers: string[] | null
  token: string | null | undefined
}): DnsChecks {
  const apexA = input.apexA.map(clean)
  const accepted = (ip: string) => (ACCEPTED_APEX_IPS as readonly string[]).includes(ip)
  const aOthers = apexA.filter((ip) => !accepted(ip))
  const a: RecordCheck =
    apexA.length === 0
      ? { state: "missing", seen: [] }
      : aOthers.length > 0
        ? { state: "conflict", seen: aOthers }
        : { state: "found", seen: [] }

  const cnames = input.wwwCname.map(clean)
  const wwwA = input.wwwA.map(clean)
  let cname: RecordCheck
  if (cnames.some((t) => (ACCEPTED_WWW_TARGETS as readonly string[]).includes(t))) cname = { state: "found", seen: [] }
  else if (cnames.length > 0) cname = { state: "conflict", seen: cnames }
  else if (wwwA.length > 0 && wwwA.every(accepted)) cname = { state: "found", seen: [] }
  else if (wwwA.length > 0) cname = { state: "conflict", seen: wwwA.filter((ip) => !accepted(ip)) }
  else cname = { state: "missing", seen: [] }

  const txts = input.txt.map((t) => t.trim())
  const txt: RecordCheck =
    input.token && txts.includes(input.token)
      ? { state: "found", seen: [] }
      : txts.length > 0
        ? { state: "conflict", seen: txts }
        : { state: "missing", seen: [] }

  const caaBlocks =
    !!input.caaIssuers &&
    input.caaIssuers.length > 0 &&
    !input.caaIssuers.some((v) => {
      const s = clean(v)
      return s.includes("letsencrypt.org") || s.includes("sectigo.com") || s === ";" || s === ""
    })

  return {
    a,
    cname,
    txt,
    aaaa: [...new Set(input.aaaa.map(clean))],
    cloudflareProxy: apexA.some(isCloudflareIp) || wwwA.some(isCloudflareIp),
    caaBlocks,
  }
}

/** DNS reaches us: the same rule the route has always used to move a domain on. */
export function dnsPointsHere(checks: DnsChecks): boolean {
  return checks.a.state === "found" || checks.cname.state === "found" || checks.txt.state === "found"
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`)
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/**
 * What to do about what the check saw, in plain words, most important first.
 * Empty when there is nothing to fix; the screens show this only after a
 * check that did not pass.
 */
export function troubleFor(checks: DnsChecks, domain: string): string[] {
  const out: string[] = []
  if (checks.cloudflareProxy) {
    out.push("Cloudflare's proxy is on. Set both records to DNS only (grey cloud), then check again.")
  }
  if (checks.a.state === "conflict" && !checks.cloudflareProxy) {
    const n = checks.a.seen.length
    out.push(`Remove the old A ${plural(n, "record", "records")} ${list(checks.a.seen)} for @. Only ${APEX_IP} should be left.`)
  }
  if (checks.cname.state === "conflict" && !checks.cloudflareProxy) {
    const seen = checks.cname.seen
    if (seen.some((s) => s.includes("parkingpage.namecheap.com"))) {
      out.push("www still points at Namecheap's parking page. Delete that record, then add the CNAME above.")
    } else if (seen.every((s) => /^\d+\.\d+\.\d+\.\d+$/.test(s))) {
      out.push(`www has an A record (${list(seen)}). Delete it and add the CNAME above instead.`)
    } else {
      out.push(`www points at ${list(seen)}. Change it to ${WWW_TARGET}.`)
    }
  }
  if (checks.txt.state === "conflict") {
    out.push(`${TXT_NAME} has a different value. Replace it with the one above.`)
  }
  if (checks.aaaa.length > 0) {
    const n = checks.aaaa.length
    out.push(`Remove the AAAA ${plural(n, "record", "records")} (${list(checks.aaaa.slice(0, 3))}${n > 3 ? " and more" : ""}). Some visitors would reach the old server.`)
  }
  if (checks.caaBlocks) {
    out.push(`A CAA record on ${domain} blocks the certificate. Add 0 issue "letsencrypt.org", or remove the CAA records.`)
  }
  const nothing = checks.a.state === "missing" && checks.cname.state === "missing" && checks.txt.state !== "found"
  if (nothing && out.length === 0) {
    out.push("Nothing has shown up yet. New records usually appear within an hour, sometimes up to 48 hours. Check again later.")
  } else {
    if (checks.a.state === "missing" && !checks.cloudflareProxy) out.push(`No A record for @ yet. Add it with the value ${APEX_IP}.`)
    if (checks.cname.state === "missing" && !checks.cloudflareProxy) out.push(`No CNAME for www yet. Add it with the value ${WWW_TARGET}.`)
  }
  return out
}
