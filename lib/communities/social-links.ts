/**
 * ===========================================================================
 *  A COMMUNITY'S WEBSITE AND SOCIAL PAGES (round 33)
 * ===========================================================================
 * The owner: "Your website or social pages" were typed as a label and an
 * address, and then shown nowhere. Now the creator picks a network, types
 * what they have (a whole address, or just @name), and the About page shows
 * each one as its network's icon.
 *
 * Stored as before (communities.links, `{ label, url }`, ../creator/logic
 * checkLinks), so nothing needs a migration: the network is read back from
 * the address's host, and the label is the network's name (or the
 * creator's own words for a website).
 *
 * Pure and browser safe: the editor, the server and the tests call it.
 */
import { tt } from "@/lib/i18n/text"

export const SOCIAL_NETWORKS = ["instagram", "tiktok", "youtube", "x", "facebook", "linkedin", "discord", "telegram", "whatsapp", "spotify", "twitch", "threads", "website"] as const
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

interface NetworkSpec {
  name: string
  /** Hosts that belong to it (a subdomain of one counts). */
  hosts: string[]
  /** The address of a bare handle, or null when a handle alone is not enough (an invite, a show). */
  fromHandle: ((handle: string) => string) | null
  /** What the field asks for. */
  hint: string
}

const SPEC: Record<SocialNetwork, NetworkSpec> = {
  instagram: { name: "Instagram", hosts: ["instagram.com", "instagr.am"], fromHandle: (h) => `https://www.instagram.com/${h}`, get hint() { return tt("@name or instagram.com/name") } },
  tiktok: { name: "TikTok", hosts: ["tiktok.com"], fromHandle: (h) => `https://www.tiktok.com/@${h}`, get hint() { return tt("@name or tiktok.com/@name") } },
  youtube: { name: "YouTube", hosts: ["youtube.com", "youtu.be"], fromHandle: (h) => `https://www.youtube.com/@${h}`, get hint() { return tt("@channel or youtube.com/@channel") } },
  x: { name: "X", hosts: ["x.com", "twitter.com"], fromHandle: (h) => `https://x.com/${h}`, get hint() { return tt("@name or x.com/name") } },
  facebook: { name: "Facebook", hosts: ["facebook.com", "fb.com", "fb.me"], fromHandle: (h) => `https://www.facebook.com/${h}`, get hint() { return tt("Page name or facebook.com/page") } },
  linkedin: { name: "LinkedIn", hosts: ["linkedin.com"], fromHandle: (h) => `https://www.linkedin.com/in/${h}`, get hint() { return tt("linkedin.com/in/name") } },
  discord: { name: "Discord", hosts: ["discord.gg", "discord.com", "discordapp.com"], fromHandle: (h) => `https://discord.gg/${h}`, get hint() { return tt("Invite code or discord.gg/code") } },
  telegram: { name: "Telegram", hosts: ["t.me", "telegram.me", "telegram.org"], fromHandle: (h) => `https://t.me/${h}`, get hint() { return tt("@name or t.me/name") } },
  whatsapp: { name: "WhatsApp", hosts: ["wa.me", "whatsapp.com"], fromHandle: (h) => (/^\+?\d[\d\s-]{6,}$/.test(h) ? `https://wa.me/${h.replace(/[^\d]/g, "")}` : `https://chat.whatsapp.com/${h}`), get hint() { return tt("Phone number or chat.whatsapp.com link") } },
  spotify: { name: "Spotify", hosts: ["spotify.com", "spotify.link"], fromHandle: null, get hint() { return tt("open.spotify.com link") } },
  twitch: { name: "Twitch", hosts: ["twitch.tv"], fromHandle: (h) => `https://www.twitch.tv/${h}`, get hint() { return tt("@name or twitch.tv/name") } },
  threads: { name: "Threads", hosts: ["threads.net", "threads.com"], fromHandle: (h) => `https://www.threads.net/@${h}`, get hint() { return tt("@name or threads.net/@name") } },
  website: { name: "Website", hosts: [], fromHandle: null, get hint() { return tt("yoursite.com") } },
}

export function networkName(n: SocialNetwork): string {
  return SPEC[n].name
}

export function networkHint(n: SocialNetwork): string {
  return SPEC[n].hint
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return null
  }
}

function onHost(host: string, hosts: string[]): boolean {
  return hosts.some((h) => host === h || host.endsWith(`.${h}`))
}

/** The network an address belongs to; any other https address is a website. */
export function networkOfUrl(url: string): SocialNetwork {
  const host = hostOf(url)
  if (!host) return "website"
  for (const n of SOCIAL_NETWORKS) if (n !== "website" && onHost(host, SPEC[n].hosts)) return n
  return "website"
}

const HANDLE = /^@?[A-Za-z0-9._-]{1,100}$/

/**
 * What the creator typed, as the address to store, or why it cannot be one.
 * "@clay", "clay", "instagram.com/clay", "http://instagram.com/clay" all
 * give https://www.instagram.com/clay for Instagram. An address on another
 * network's host is refused for this one ("That is a TikTok address"), so
 * the icon always matches where it goes.
 */
export function normalizeSocialLink(network: SocialNetwork, raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const typed = raw.trim()
  if (!typed) return { ok: false, error: "empty" }
  const spec = SPEC[network]
  const looksLikeAddress = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) || /^[^\s@/]+\.[a-z]{2,}(\/|$|\?)/i.test(typed)
  if (!looksLikeAddress) {
    if (spec.fromHandle && (HANDLE.test(typed) || (network === "whatsapp" && /^\+?\d[\d\s-]{6,}$/.test(typed)))) {
      return { ok: true, url: spec.fromHandle(typed.replace(/^@/, "")) }
    }
    return { ok: false, error: network === "website" ? tt("Type the address of your site.") : tt("Type your {name} name or paste the link.", { name: spec.name }) }
  }
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`)
  } catch {
    return { ok: false, error: tt("That address does not look right.") }
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: tt("That address does not look right.") }
  url.protocol = "https:"
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  if (!host.includes(".")) return { ok: false, error: tt("That address does not look right.") }
  if (network !== "website" && !onHost(host, spec.hosts)) {
    const other = networkOfUrl(url.toString())
    return { ok: false, error: other !== "website" ? tt("That is a {name} address. Pick {name} instead.", { name: SPEC[other].name }) : tt("That is not a {name} address.", { name: spec.name }) }
  }
  if (url.toString().length > 1000) return { ok: false, error: tt("That address is too long.") }
  return { ok: true, url: url.toString() }
}

/** What the editor shows in the field for a stored address: @name where the network has handles, else the address without https://. */
export function displayOfLink(network: SocialNetwork, url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, "")
    const one = path.split("/").filter(Boolean)
    if (network === "tiktok" || network === "threads" || (network === "youtube" && one[0]?.startsWith("@"))) {
      if (one.length === 1 && one[0].startsWith("@")) return one[0]
    }
    if ((network === "instagram" || network === "x" || network === "twitch" || network === "telegram") && one.length === 1 && !u.search) return `@${one[0]}`
    return `${u.hostname.replace(/^www\./, "")}${path}${u.search}`
  } catch {
    return url
  }
}

export interface SocialLinkView {
  network: SocialNetwork
  /** The network's name, or the creator's words for a website. */
  label: string
  url: string
}

/** communities.links as the About page draws them: safe https addresses only, each with its network. */
export function socialLinksOf(raw: unknown): SocialLinkView[] {
  if (!Array.isArray(raw)) return []
  const out: SocialLinkView[] = []
  for (const r of raw) {
    if (!r || typeof r !== "object") continue
    const url = typeof (r as { url?: unknown }).url === "string" ? (r as { url: string }).url.trim() : ""
    if (!/^https:\/\//i.test(url) || url.length > 1000) continue
    try {
      new URL(url)
    } catch {
      continue
    }
    const network = networkOfUrl(url)
    const given = typeof (r as { label?: unknown }).label === "string" ? (r as { label: string }).label.replace(/\s+/g, " ").trim().slice(0, 60) : ""
    out.push({ network, label: network === "website" ? given || hostOf(url) || "Website" : SPEC[network].name, url })
  }
  return out.slice(0, 12)
}
