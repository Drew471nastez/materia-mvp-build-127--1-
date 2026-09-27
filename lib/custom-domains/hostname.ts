/**
 * ===========================================================================
 *  WHAT A CREATOR TYPED, AS A HOSTNAME WE CAN SERVE
 * ===========================================================================
 * Pure, so the Domains tab, the routes and the proxy all read a domain the
 * same way, and tests/custom-domains.test.ts can feed it the odd cases.
 *
 * TWO SHAPES OF DOMAIN, SERVED TWO WAYS.
 *
 *   an apex       maralind.com, maralind.co.uk. Served at www.maralind.com;
 *                 the bare name answers with a 301 to it, at Vercel's edge
 *                 and again in proxy.ts. Needs an A record on @ and a CNAME
 *                 on www. This is how every domain connected so far works.
 *
 *   a subdomain   links.maralind.com, shop.maralind.co.uk. Served exactly
 *                 as typed, never with a www in front (www.links.maralind.com
 *                 is nobody's address). Needs one CNAME.
 *
 * Which one a name is depends on where its registrable part starts, and that
 * is the public suffix list's job. There is no copy of the list in this
 * repository, so the suffixes a creator is likely to own a domain under
 * that have two labels are named below; anything else is read as a one
 * label suffix. A name read wrongly still connects: Check again reads the
 * records Vercel reports, and Vercel knows the real apex.
 */

/** The purposes a connected domain can serve. */
export type DomainPurpose = "website" | "creator_page"
export const DOMAIN_PURPOSES: readonly DomainPurpose[] = ["website", "creator_page"]

export function isDomainPurpose(value: unknown): value is DomainPurpose {
  return value === "website" || value === "creator_page"
}

/** Two label public suffixes: example.co.uk is an apex, not a subdomain of co.uk. */
const TWO_LABEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "ac.uk", "gov.uk", "sch.uk",
  "com.au", "net.au", "org.au", "edu.au", "id.au", "asn.au",
  "co.nz", "net.nz", "org.nz", "geek.nz", "school.nz",
  "co.za", "org.za", "web.za", "net.za",
  "com.br", "net.br", "org.br", "art.br", "blog.br",
  "com.mx", "org.mx", "com.ar", "com.co", "com.pe", "com.ec", "com.uy", "com.ve", "co.ve", "com.bo", "com.py", "com.gt", "co.cr", "com.do", "com.pa", "com.sv", "com.ni", "com.hn",
  "co.jp", "ne.jp", "or.jp", "ac.jp", "co.kr", "or.kr", "ne.kr",
  "com.cn", "net.cn", "org.cn", "com.hk", "org.hk", "com.tw", "org.tw", "com.sg", "org.sg", "com.my", "org.my",
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "co.id", "or.id", "web.id", "com.ph", "com.vn", "co.th", "in.th", "com.pk", "com.bd", "com.np", "com.lk",
  "co.il", "org.il", "com.tr", "net.tr", "org.tr", "com.sa", "com.eg", "com.qa", "com.kw", "com.bh", "com.om", "co.ae",
  "com.ng", "com.gh", "co.ke", "or.ke", "co.tz", "co.ug", "co.zw", "co.zm", "co.bw", "com.na", "co.ma",
  "com.ua", "org.ua", "com.pl", "net.pl", "org.pl", "com.ro", "org.ro", "info.ro", "com.gr", "com.cy", "com.mt", "com.es", "org.es", "com.pt", "co.at", "or.at", "co.hu", "com.hr", "co.rs", "com.ru", "com.by",
])

/**
 * A hostname: labels of letters, digits and inner hyphens, a letter TLD (or
 * a punycode one), 253 characters at most. The same rule
 * lib/url/public-url.ts holds a typed link to.
 */
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/

/**
 * Hosts that belong to the platform or to nobody, and can never be a
 * creator's. The hosting provider's own names are added on the server
 * (HOST_RESERVED_SUFFIXES in lib/custom-domains/targets.ts), so this list,
 * which the Domains screen also reads, names no provider.
 */
const RESERVED_SUFFIXES = [
  "storelib.com",
  "supabase.co",
  "supabase.in",
  "localhost",
  "local",
  "localdomain",
  "internal",
  "invalid",
  "test",
  "example",
  "onion",
  "arpa",
  "home",
  "lan",
  "corp",
]
/** The documentation names, reserved by RFC 2606. */
const RESERVED_EXACT = ["example.com", "example.net", "example.org"]

export type HostnameProblem =
  | "empty"
  | "invalid"
  | "reserved"
  | "ip"
  | "too_deep"

export const HOSTNAME_PROBLEM_TEXT: Record<HostnameProblem, string> = {
  empty: "Type the domain you bought, like yourname.com.",
  invalid: "That is not a domain. It should look like yourname.com.",
  reserved: "That address belongs to Storelib or can't be used. Use a domain you bought.",
  ip: "Use a domain name, not an IP address.",
  too_deep: "That is too many levels deep. Use yourname.com or one level under it, like shop.yourname.com.",
}

/**
 * What was typed, as the bare hostname we store: lowercase, punycode, no
 * scheme, no path, no port, no trailing dot and no leading www. A www host
 * is stored as its apex, because the apex is what a creator owns and the
 * www is how it is served.
 */
export function cleanHostname(raw: unknown): string {
  if (typeof raw !== "string") return ""
  let value = raw.trim().toLowerCase()
  if (!value) return ""
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
  value = value.replace(/[/?#].*$/, "")
  value = value.replace(/^.*@/, "")
  value = value.replace(/:\d+$/, "")
  value = value.replace(/\.+$/, "")
  /* Unicode names become their punycode spelling, which is what DNS and Vercel hold. */
  if (/[^\x00-\x7f]/.test(value)) {
    try {
      value = new URL(`https://${value}`).hostname
    } catch {
      return value
    }
  }
  value = value.replace(/^www\./, "")
  return value
}

/** The suffix a name is registered under: "co.uk" for a.co.uk, "com" for a.com. */
export function publicSuffixOf(host: string): string {
  const labels = host.split(".")
  if (labels.length >= 2 && TWO_LABEL_SUFFIXES.has(labels.slice(-2).join("."))) return labels.slice(-2).join(".")
  return labels[labels.length - 1] ?? ""
}

/** The registrable domain: maralind.com for links.maralind.com. */
export function apexOf(host: string): string {
  const bare = host.replace(/^www\./, "")
  const suffix = publicSuffixOf(bare)
  const labels = bare.split(".")
  const suffixLabels = suffix.split(".").length
  return labels.slice(-(suffixLabels + 1)).join(".")
}

/** Is this the registrable name itself (served at www), rather than a name under it? */
export function isApexHost(host: string): boolean {
  const bare = host.replace(/^www\./, "")
  return apexOf(bare) === bare
}

/** The host a domain is served at: www.<apex> for an apex, itself for a subdomain. */
export function servingHost(domain: string): string {
  const bare = domain.replace(/^www\./, "")
  return isApexHost(bare) ? `www.${bare}` : bare
}

/** Every host that has to be on the hosting project for a domain to answer. */
export function vercelHostsFor(domain: string): { name: string; redirect?: string }[] {
  const bare = domain.replace(/^www\./, "")
  if (!isApexHost(bare)) return [{ name: bare }]
  return [{ name: `www.${bare}` }, { name: bare, redirect: `www.${bare}` }]
}

/** What is wrong with a cleaned hostname, or null when it can be connected. */
export function hostnameProblem(host: string, mainDomain = "storelib.com", moreReserved: readonly string[] = []): HostnameProblem | null {
  if (!host) return "empty"
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return "ip"
  if (!HOSTNAME.test(host)) return "invalid"
  const reserved = [...RESERVED_SUFFIXES, ...moreReserved, mainDomain.toLowerCase()]
  if (reserved.some((r) => host === r || host.endsWith(`.${r}`))) return "reserved"
  if (RESERVED_EXACT.some((r) => host === r || host.endsWith(`.${r}`))) return "reserved"
  /* A registrable name needs a label of its own in front of the suffix. */
  if (host === publicSuffixOf(host) || !host.includes(".")) return "invalid"
  /* One level under the apex at most: shop.maralind.com, not a.b.maralind.com. */
  const depth = host.split(".").length - apexOf(host).split(".").length
  if (depth > 1) return "too_deep"
  return null
}

export interface DnsRecord {
  type: "A" | "CNAME" | "TXT"
  /** As a registrar's form asks for it: "@", "www", "links". */
  name: string
  value: string
  /** Why this one is needed, when it is not obvious. */
  note?: string
}

/**
 * THE ADDRESSES A CREATOR POINTS THEIR DOMAIN AT, IN STORELIB'S NAME.
 *
 * CNAME_TARGET is ours: domains.storelib.com is a CNAME in storelib.com's own
 * DNS to the host that serves the sites, so a creator's registrar only ever
 * shows a storelib.com name. The A record for a bare domain has to be an
 * address, and DEFAULT_A is the one that answers for it.
 *
 * The names domains connected earlier were told to use are still read as
 * right by the check. They live in lib/custom-domains/targets.ts, which only
 * the server imports, so no page a creator loads carries them.
 */
export const CNAME_TARGET = "domains.storelib.com"
export const DEFAULT_A = "216.150.1.1"

/** A record's name relative to the apex, the way registrars ask for it. */
export function recordName(fqdn: string, apex: string): string {
  const bare = fqdn.replace(/\.$/, "")
  if (bare === apex) return "@"
  return bare.endsWith(`.${apex}`) ? bare.slice(0, -(apex.length + 1)) : bare
}

/** Why a TXT record is there, in words that name no one but the creator. */
export const TXT_NOTE = "Proves the domain is yours. Needed when the domain was connected to another site before."

/**
 * The records a domain needs. The A record's address comes from the host's
 * recommendation when there is one; the CNAME is always CNAME_TARGET, since
 * it leads to the same place as whatever the host recommends. A TXT
 * challenge is listed under the exact name it has to be added at.
 */
export function recordsFor(
  domain: string,
  recommended?: { ipv4?: string | null; cname?: string | null; challenges?: { type: string; domain: string; value: string }[] } | null,
): DnsRecord[] {
  const bare = domain.replace(/^www\./, "")
  const apex = apexOf(bare)
  const out: DnsRecord[] = isApexHost(bare)
    ? [
        { type: "A", name: "@", value: recommended?.ipv4 || DEFAULT_A },
        { type: "CNAME", name: "www", value: CNAME_TARGET },
      ]
    : [{ type: "CNAME", name: recordName(bare, apex), value: CNAME_TARGET }]
  for (const c of recommended?.challenges ?? []) {
    if (c.type?.toUpperCase() !== "TXT" || !c.domain || !c.value) continue
    out.push({ type: "TXT", name: recordName(c.domain, apex), value: c.value, note: TXT_NOTE })
  }
  return out
}

/** The records stored on a row, when they are well formed. */
export function storedRecords(value: unknown): DnsRecord[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const ok = value.every(
    (r) => r && typeof r === "object" && ["A", "CNAME", "TXT"].includes((r as DnsRecord).type) && typeof (r as DnsRecord).name === "string" && typeof (r as DnsRecord).value === "string",
  )
  return ok ? (value as DnsRecord[]) : null
}
