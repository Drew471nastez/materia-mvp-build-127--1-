/**
 * ===========================================================================
 *  THE SELLER'S OWN SENDING DOMAIN: WHAT IT IS, PURE
 * ===========================================================================
 * Emails from a store go out From Storelib's address with the store's name
 * in front. With a domain of the seller's own added in Emails › Platforms
 * and verified, campaigns, automations and the emails buyers get go out
 * From an address on that domain (hello@mail.yourshop.com), signed with
 * that domain's own DKIM key by Mailgun, Storelib's email provider, so
 * they pass SPF, DKIM and DMARC as the seller's.
 *
 *   spf       TXT on the domain: Mailgun may send for it
 *   dkim      TXT on <selector>._domainkey: the key Mailgun signs with
 *   tracking  CNAME email.<domain>: opens, clicks and unsubscribe links
 *   dmarc     TXT on _dmarc.<domain>: what an inbox does with mail that
 *             fails; Mailgun does not check it, Storelib reads it from DNS
 *
 * Verified means Mailgun says the domain is active (its SPF and DKIM are
 * in place). DMARC is shown with its own state: Gmail and Yahoo ask bulk
 * senders for one, so the page asks for it too, but a missing one does not
 * stop the domain being used.
 *
 * Browser safe: the Platforms tab draws the records from this shape.
 */

export type SendingRecordKind = "spf" | "dkim" | "tracking" | "dmarc"

export interface SendingRecord {
  kind: SendingRecordKind
  type: "TXT" | "CNAME"
  /** The full name, as a DNS host field takes it on most providers. */
  name: string
  value: string
  /** true found and right, false checked and missing or wrong, null not checked yet. */
  valid: boolean | null
}

export type SendingDomainStatus = "pending" | "verified" | "failed"

export interface SendingDomainView {
  domain: string
  fromLocal: string
  fromAddress: string
  status: SendingDomainStatus
  records: SendingRecord[]
  lastCheckedAt: string | null
  verifiedAt: string | null
  lastError: string | null
}

/** Domains nobody can verify for a store: the big inboxes, and Storelib's own. */
const NOT_YOURS = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "yandex.com", "mail.ru", "zoho.com"])

export function domainProblem(raw: unknown, own: string[] = []): { domain: string } | { error: string } {
  let d = String(raw ?? "").trim().toLowerCase()
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "").replace(/\.$/, "")
  if (d.includes("@")) d = d.split("@").pop() ?? ""
  if (!d) return { error: "Add the domain you send from, like mail.yourshop.com." }
  if (d.length > 253 || !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) return { error: "That is not a domain. Use one like mail.yourshop.com." }
  if (NOT_YOURS.has(d)) return { error: `${d} belongs to an email provider, so it can't be verified for your store. Use a domain you own.` }
  const ours = ["storelib.com", "storelib.me", ...own.map((x) => x.toLowerCase())]
  if (ours.some((o) => d === o || d.endsWith(`.${o}`))) return { error: "That is a Storelib domain. Use a domain you own." }
  return { domain: d }
}

export function fromLocalProblem(raw: unknown): { local: string } | { error: string } {
  const l = String(raw ?? "").trim().toLowerCase()
  if (!l) return { local: "hello" }
  if (!/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(l) || l.includes("..")) return { error: "Use letters, numbers, dots or dashes before the @, like hello." }
  return { local: l }
}

/** A root domain carries the store's own mail already: a subdomain keeps Storelib's SPF and DKIM apart from it. */
export function isRootDomain(domain: string): boolean {
  const parts = domain.split(".")
  /* Two parts (shop.com), or three ending in a two letter country's second level (shop.co.uk). */
  if (parts.length <= 2) return true
  return parts.length === 3 && /^(co|com|net|org|ac|gov|edu)$/.test(parts[1]) && parts[2].length === 2
}

export function dmarcRecord(domain: string, valid: boolean | null = null): SendingRecord {
  return { kind: "dmarc", type: "TXT", name: `_dmarc.${domain}`, value: "v=DMARC1; p=none;", valid }
}

/** Mailgun's "valid" | "invalid" | "unknown" as ours. */
function validOf(v: unknown): boolean | null {
  if (v === "valid" || v === true) return true
  if (v === "invalid" || v === false) return false
  return null
}

/**
 * The records Mailgun answers a create or a verify with
 * (sending_dns_records), sorted SPF, DKIM, tracking. Receiving MX records
 * are left out: Storelib only sends from the domain.
 */
export function recordsFromMailgun(body: unknown): SendingRecord[] {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const rows = Array.isArray(b.sending_dns_records) ? (b.sending_dns_records as Record<string, unknown>[]) : []
  const out: SendingRecord[] = []
  for (const r of rows) {
    const type = String(r.record_type ?? "").toUpperCase()
    const name = String(r.name ?? "").trim().toLowerCase()
    const value = String(r.value ?? "").trim()
    if (!name || !value) continue
    if (type === "TXT" && /^v=spf1/i.test(value)) out.push({ kind: "spf", type: "TXT", name, value, valid: validOf(r.valid) })
    else if (type === "TXT" && /_domainkey\./.test(name)) out.push({ kind: "dkim", type: "TXT", name, value, valid: validOf(r.valid) })
    else if (type === "CNAME") out.push({ kind: "tracking", type: "CNAME", name, value, valid: validOf(r.valid) })
  }
  const order: SendingRecordKind[] = ["spf", "dkim", "tracking", "dmarc"]
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
}

/** Is a TXT answer for _dmarc a DMARC record? */
export function hasDmarc(txt: string[][]): boolean {
  return txt.some((chunks) => /^v=DMARC1\b/i.test(chunks.join("").trim()))
}

/** "hello@mail.shop.com" from its parts. */
export function sendingAddress(local: string, domain: string): string {
  return `${local}@${domain}`
}

/** The From header: the store's name in front of its own address, quoted when the name has a comma or a colon. */
export function ownFrom(name: string, address: string): string {
  const n = String(name ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/[<>"\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 78) || address.split("@")[1]
  return `${/[(),.:;@[\]]/.test(n) ? `"${n}"` : n} <${address}>`
}

/** The display name of a From header ("Ana <a@b.c>" → "Ana"), unquoted; "" when it has none. */
export function fromName(from: string | null | undefined): string {
  const m = String(from ?? "").match(/^\s*([\s\S]*?)\s*<[^<>]+>\s*$/)
  return (m?.[1] ?? "").replace(/^"([\s\S]*)"$/, "$1").trim()
}

/**
 * ONE ANSWER TO "WHICH ADDRESS DOES THIS STORE'S EMAIL COME FROM". A send
 * made for a store names the store's name in From (lib/mailgun.ts
 * buildMailgunFromHeader puts Storelib's address after it). With the
 * store's own domain verified, the address becomes the store's own and the
 * message goes through that domain (signed with its DKIM); the name is
 * kept. Without one, the send is left exactly as asked. Pure: the lookup is
 * the caller's (lib/mailgun.ts resolves `store` with verifiedSender).
 */
export function asOwnSender(from: string | null | undefined, own: { address: string; domain: string } | null): { from?: string; sendingDomain?: string } {
  if (!own?.address || !own.domain) return from ? { from } : {}
  return { from: ownFrom(fromName(from), own.address), sendingDomain: own.domain }
}

/**
 * The host as most DNS providers ask for it: the name without the zone at
 * its end ("_dmarc.mail" for _dmarc.mail.shop.com in shop.com), "@" for the
 * zone itself. The zone is the registrable domain (two labels, or three for
 * a two letter country's second level, isRootDomain's rule).
 */
export function hostOf(name: string, domain: string): string {
  const parts = domain.toLowerCase().split(".")
  const three = parts.slice(-3).join(".")
  const zone = parts.length >= 3 && isRootDomain(three) ? three : parts.slice(-2).join(".")
  const n = name.toLowerCase().replace(/\.$/, "")
  if (n === zone) return "@"
  return n.endsWith(`.${zone}`) ? n.slice(0, -(zone.length + 1)) : n
}
