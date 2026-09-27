/**
 * ===========================================================================
 *  WHICH DNS ANSWERS COUNT AS POINTING AT US, FROM THE SERVER ONLY
 * ===========================================================================
 * Creators are shown one CNAME, CNAME_TARGET (domains.storelib.com), and one
 * address for a bare domain (lib/custom-domains/hostname.ts). Domains
 * connected before that were told to use the host's own CNAME, and the host
 * also hands out project specific ones. Every one of those still counts as
 * right, so nobody who set up their DNS earlier is broken by the new name.
 *
 * WHY A FILE OF ITS OWN. hostname.ts and dns-help.ts are imported by the
 * Domains screens, so anything in them can end up in a browser bundle. The
 * host's names are only needed where DNS is read (app/api/domains/verify)
 * and where a stored row is turned into what a creator sees
 * (lib/custom-domains/store.ts), both on the server. No client component
 * imports this file; tests/custom-domains.test.ts holds that.
 */
import { CNAME_TARGET, DEFAULT_A, TXT_NOTE, type DnsRecord } from "./hostname"

/** The host's CNAMEs a domain may already point at, and the earlier Storelib spelling. */
export const LEGACY_CNAMES = ["cname.vercel-dns.com", "cname.storelib.com"] as const

/** The host's project specific CNAMEs, like d1d4fc829fe7bc7c.vercel-dns-017.com. */
const HOST_CNAME = /(^|\.)vercel-dns(-\d+)?\.com$/

/** The CNAME the host is asked for when its own recommendation cannot be read. */
export const HOST_DEFAULT_CNAME = LEGACY_CNAMES[0]

/**
 * The addresses a bare domain's A record may hold. The first is the one shown
 * today; the second is the older one, which still answers and which domains
 * connected earlier were given.
 */
export const SERVING_IPS: readonly string[] = [DEFAULT_A, "76.76.21.21"]

/**
 * The host's own names, never a creator's domain. The Domains screen checks
 * the platform's names as it is typed; these are added on the server, where
 * adding a domain is decided, so the host is named nowhere in the browser.
 */
export const HOST_RESERVED_SUFFIXES: readonly string[] = ["vercel.app", "vercel.com", "vercel-dns.com", "now.sh"]

const tidy = (v: string) => v.trim().toLowerCase().replace(/\.$/, "")

/** A name that belongs to the host rather than to us, in any of its spellings. */
export function isHostCname(value: string): boolean {
  const v = tidy(value)
  return v !== CNAME_TARGET && ((LEGACY_CNAMES as readonly string[]).includes(v) || HOST_CNAME.test(v))
}

/** A CNAME answer that reaches the sites: ours, or one of the names used before it. */
export function isServingCname(target: string, recommended?: string | null): boolean {
  const t = tidy(target)
  return t === CNAME_TARGET || (!!recommended && t === tidy(recommended)) || isHostCname(t)
}

/**
 * A record as a creator sees it. Rows saved before CNAME_TARGET existed hold
 * the host's CNAME and a note that named the host; both read as ours here,
 * so a stored row shows exactly what a new one would.
 */
export function brandRecord(record: DnsRecord): DnsRecord {
  if (record.type === "CNAME" && isHostCname(record.value)) return { ...record, value: CNAME_TARGET }
  if (record.type === "TXT" && record.note) return { ...record, note: TXT_NOTE }
  return record
}
