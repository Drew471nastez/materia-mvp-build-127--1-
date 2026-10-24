/**
 * ===========================================================================
 *  A SOCIAL LINK, TYPED THE WAY EACH PLATFORM IS TYPED
 * ===========================================================================
 * "I can just add the username, with the @ separate, or paste the whole
 * URL. For each social media it matches the format so OnePage knows which."
 *
 * Each platform has a format (SOCIAL_FORMATS): what sits fixed in front of
 * the field ("@", "github.com/", "+", "Email"), what the field asks for, and
 * how a value becomes the one address that is saved. parseSocialInput takes
 * whatever was typed or pasted (a bare name, an @name, a full link with
 * www., m., tracking junk and a trailing slash, a number with spaces) and
 * gives back that address or a reason it could not.
 *
 * socialFieldValue goes the other way, for a link already saved: the part a
 * person would type (the handle, the number), or the whole link when it is
 * not a plain profile (a /c/ YouTube channel, a LinkedIn company, a short
 * link). Old saved values are read too: "@name", a bare name, "mailto:",
 * a link without https. The page itself still draws every saved value
 * through normalizeSocialUrl (./social-url), unchanged, so nothing saved
 * before stops working.
 *
 * tests/onepage-social-input.test.ts runs this over real pastes per platform.
 */
import { canonicalSocialPlatform } from "./social-url"

export type SocialFieldKind = "handle" | "path" | "url" | "email" | "phone"

export interface SocialFormat {
  kind: SocialFieldKind
  /** What sits fixed in front of the field. "" for none. */
  prefix: string
  /** The field's placeholder, after the prefix. */
  placeholder: string
  /** For the phone keyboard. */
  inputMode: "text" | "email" | "tel" | "url"
}

export type SocialParseError =
  | "empty"
  | "email"
  | "phone"
  | "handle"
  | "url"
  | "wrong_site"

export type SocialParse = { ok: true; url: string } | { ok: false; error: SocialParseError }

interface PlatformRule {
  format: SocialFormat
  /** Hosts this platform's links live on (without www./m.). */
  hosts: RegExp
  /** What a bare handle may be. */
  handle?: RegExp
  /** The profile address for a handle. */
  profile?: (h: string) => string
  /**
   * The canonical address for a link on one of `hosts`: the path segments
   * (decoded, no empty ones) and the query. Return null to keep the link as
   * it was pasted, minus tracking junk.
   */
  canonical?: (segs: string[], q: URLSearchParams, host: string) => string | null
  /** The handle a canonical profile address holds, for showing it back in the field. */
  handleOf?: (url: URL) => string | null
}

const H_IG = /^[a-z0-9._]{1,30}$/i
const H_TIKTOK = /^[a-z0-9._]{2,24}$/i
const H_X = /^\w{1,15}$/
const H_GENERIC = /^[a-z0-9._-]{1,50}$/i

/** First-path words that are a platform's own pages, never a person. */
const IG_RESERVED = new Set(["p", "reel", "reels", "tv", "explore", "accounts", "direct", "about", "legal", "developer"])
const X_RESERVED = new Set(["home", "i", "intent", "search", "hashtag", "explore", "notifications", "messages", "settings", "share", "compose", "login", "signup", "tos", "privacy"])
const FB_RESERVED = new Set(["groups", "events", "watch", "marketplace", "gaming", "story.php", "photo.php", "permalink.php", "sharer", "sharer.php", "share", "login", "help", "pages", "hashtag"])

const one = (segs: string[]) => (segs.length >= 1 ? segs[0] : null)
const stripAt = (s: string) => s.replace(/^@/, "")

const RULES: Record<string, PlatformRule> = {
  instagram: {
    format: { kind: "handle", prefix: "@", placeholder: "username", inputMode: "text" },
    hosts: /^(instagram\.com|instagr\.am)$/,
    handle: H_IG,
    profile: (h) => `https://instagram.com/${h}`,
    canonical: (segs) => {
      if (segs[0] === "stories" && segs[1] && H_IG.test(segs[1])) return `https://instagram.com/${segs[1]}`
      const h = one(segs)
      if (!h) return null
      if (IG_RESERVED.has(h.toLowerCase()) || !H_IG.test(stripAt(h))) return null
      return `https://instagram.com/${stripAt(h)}`
    },
    handleOf: (u) => single(u, H_IG),
  },
  tiktok: {
    format: { kind: "handle", prefix: "@", placeholder: "username", inputMode: "text" },
    hosts: /^tiktok\.com$/,
    handle: H_TIKTOK,
    profile: (h) => `https://tiktok.com/@${h}`,
    canonical: (segs) => {
      const h = one(segs)
      if (!h || !h.startsWith("@")) return null
      const name = h.slice(1)
      if (!H_TIKTOK.test(name)) return null
      /* A video link (/@name/video/123) is kept whole: it is a video, not a mistake. */
      if (segs.length > 1) return `https://tiktok.com/@${name}/${segs.slice(1).join("/")}`
      return `https://tiktok.com/@${name}`
    },
    handleOf: (u) => {
      const segs = pathSegs(u)
      return segs.length === 1 && segs[0].startsWith("@") && H_TIKTOK.test(segs[0].slice(1)) ? segs[0].slice(1) : null
    },
  },
  twitter: {
    format: { kind: "handle", prefix: "@", placeholder: "username", inputMode: "text" },
    hosts: /^(x\.com|twitter\.com)$/,
    handle: H_X,
    profile: (h) => `https://x.com/${h}`,
    canonical: (segs) => {
      const h = one(segs)
      if (!h || X_RESERVED.has(h.toLowerCase()) || !H_X.test(stripAt(h))) return null
      /* A post (/name/status/123) is the person's link; the profile is what a social icon opens. */
      return `https://x.com/${stripAt(h)}`
    },
    handleOf: (u) => single(u, H_X),
  },
  threads: {
    format: { kind: "handle", prefix: "@", placeholder: "username", inputMode: "text" },
    hosts: /^threads\.(net|com)$/,
    handle: H_IG,
    profile: (h) => `https://threads.net/@${h}`,
    canonical: (segs) => {
      const h = one(segs)
      if (!h) return null
      const name = stripAt(h)
      return H_IG.test(name) ? `https://threads.net/@${name}` : null
    },
    handleOf: (u) => {
      const segs = pathSegs(u)
      return segs.length === 1 && segs[0].startsWith("@") && H_IG.test(segs[0].slice(1)) ? segs[0].slice(1) : null
    },
  },
  youtube: {
    format: { kind: "handle", prefix: "@", placeholder: "channel", inputMode: "text" },
    hosts: /^(youtube\.com|youtu\.be)$/,
    handle: /^[a-z0-9._-]{3,30}$/i,
    profile: (h) => `https://youtube.com/@${h}`,
    canonical: (segs, q, host) => {
      if (host === "youtu.be") return segs[0] ? `https://youtu.be/${segs[0]}` : null
      const first = segs[0] ?? ""
      if (first.startsWith("@") && first.length > 1) return `https://youtube.com/${first}`
      if ((first === "c" || first === "user") && segs[1]) return `https://youtube.com/${first}/${segs[1]}`
      if (first === "channel" && segs[1]) return `https://youtube.com/channel/${segs[1]}`
      if (first === "watch" && q.get("v")) return `https://youtube.com/watch?v=${q.get("v")}`
      if (first === "shorts" && segs[1]) return `https://youtube.com/shorts/${segs[1]}`
      if (first === "playlist" && q.get("list")) return `https://youtube.com/playlist?list=${q.get("list")}`
      /* youtube.com/name: the old custom address, which YouTube still opens. */
      if (segs.length === 1 && /^[a-z0-9._-]+$/i.test(first)) return `https://youtube.com/${first}`
      return null
    },
    handleOf: (u) => {
      const segs = pathSegs(u)
      return segs.length === 1 && segs[0].startsWith("@") && u.hostname.replace(/^(www|m)\./, "") === "youtube.com" ? segs[0].slice(1) : null
    },
  },
  facebook: {
    format: { kind: "path", prefix: "facebook.com/", placeholder: "yourpage", inputMode: "text" },
    hosts: /^(facebook\.com|fb\.com|fb\.me|fb\.watch|web\.facebook\.com)$/,
    handle: /^[a-z0-9.-]{1,50}$/i,
    profile: (h) => `https://facebook.com/${h}`,
    canonical: (segs, q, host) => {
      if (host === "fb.me" || host === "fb.watch") return null
      const first = segs[0]
      if (!first) return null
      if (first === "profile.php") return q.get("id") ? `https://facebook.com/profile.php?id=${q.get("id")}` : null
      if (first === "people" && segs[1] && segs[2]) return `https://facebook.com/people/${segs[1]}/${segs[2]}`
      if (first === "pg" && segs[1]) return `https://facebook.com/${segs[1]}`
      if (FB_RESERVED.has(first.toLowerCase())) return null
      return /^[a-z0-9.-]+$/i.test(first) ? `https://facebook.com/${first}` : null
    },
    handleOf: (u) => single(u, /^[a-z0-9.-]{1,50}$/i, ["profile.php", "people"]),
  },
  linkedin: {
    format: { kind: "path", prefix: "linkedin.com/in/", placeholder: "yourname", inputMode: "text" },
    hosts: /^(linkedin\.com|[a-z]{2}\.linkedin\.com|lnkd\.in)$/,
    handle: /^[a-z0-9-_%]{2,100}$/i,
    profile: (h) => `https://linkedin.com/in/${h}`,
    canonical: (segs, _q, host) => {
      if (host === "lnkd.in") return null
      const [kind, name] = segs
      if ((kind === "in" || kind === "company" || kind === "school" || kind === "showcase") && name) return `https://linkedin.com/${kind}/${name}`
      if (kind === "pub" && name) return null
      return null
    },
    handleOf: (u) => {
      const segs = pathSegs(u)
      return segs.length === 2 && segs[0] === "in" ? segs[1] : null
    },
  },
  github: {
    format: { kind: "path", prefix: "github.com/", placeholder: "username", inputMode: "text" },
    hosts: /^github\.com$/,
    handle: /^[a-z0-9-]{1,39}$/i,
    profile: (h) => `https://github.com/${h}`,
    canonical: (segs) => (segs[0] ? `https://github.com/${segs.slice(0, 2).join("/")}` : null),
    handleOf: (u) => single(u, /^[a-z0-9-]{1,39}$/i),
  },
  twitch: {
    format: { kind: "path", prefix: "twitch.tv/", placeholder: "channel", inputMode: "text" },
    hosts: /^twitch\.tv$/,
    handle: /^\w{2,25}$/,
    profile: (h) => `https://twitch.tv/${h}`,
    canonical: (segs) => (segs[0] && /^\w{2,25}$/.test(segs[0]) ? `https://twitch.tv/${segs[0]}` : null),
    handleOf: (u) => single(u, /^\w{2,25}$/),
  },
  snapchat: {
    format: { kind: "handle", prefix: "@", placeholder: "username", inputMode: "text" },
    hosts: /^(snapchat\.com|story\.snapchat\.com)$/,
    handle: /^[a-z0-9._-]{2,15}$/i,
    profile: (h) => `https://snapchat.com/add/${h}`,
    canonical: (segs) => {
      if (segs[0] === "add" && segs[1]) return `https://snapchat.com/add/${segs[1]}`
      if (segs[0]?.startsWith("@") && segs[0].length > 1) return `https://snapchat.com/add/${segs[0].slice(1)}`
      if (segs[0] === "s" && segs[1]) return `https://snapchat.com/add/${segs[1]}`
      return null
    },
    handleOf: (u) => {
      const segs = pathSegs(u)
      return segs.length === 2 && segs[0] === "add" ? segs[1] : null
    },
  },
  pinterest: {
    format: { kind: "handle", prefix: "@", placeholder: "username", inputMode: "text" },
    hosts: /^(pinterest\.[a-z.]+|pin\.it)$/,
    handle: /^\w{3,30}$/,
    profile: (h) => `https://pinterest.com/${h}`,
    canonical: (segs, _q, host) => {
      if (host === "pin.it") return null
      const h = segs[0]
      if (!h || h === "pin" || h === "search" || h === "ideas") return null
      return /^\w{3,30}$/.test(h) ? `https://pinterest.com/${h}` : null
    },
    handleOf: (u) => single(u, /^\w{3,30}$/),
  },
  soundcloud: {
    format: { kind: "path", prefix: "soundcloud.com/", placeholder: "artist", inputMode: "text" },
    hosts: /^(soundcloud\.com|on\.soundcloud\.com|snd\.sc)$/,
    handle: /^[a-z0-9_-]{2,50}$/i,
    profile: (h) => `https://soundcloud.com/${h}`,
    canonical: (segs, _q, host) => (host === "soundcloud.com" && segs[0] ? `https://soundcloud.com/${segs.slice(0, 3).join("/")}` : null),
    handleOf: (u) => single(u, /^[a-z0-9_-]{2,50}$/i),
  },
  kick: {
    format: { kind: "path", prefix: "kick.com/", placeholder: "channel", inputMode: "text" },
    hosts: /^kick\.com$/,
    handle: /^[a-z0-9_-]{2,25}$/i,
    profile: (h) => `https://kick.com/${h}`,
    canonical: (segs) => (segs[0] ? `https://kick.com/${segs[0]}` : null),
    handleOf: (u) => single(u, /^[a-z0-9_-]{2,25}$/i),
  },
  patreon: {
    format: { kind: "path", prefix: "patreon.com/", placeholder: "creator", inputMode: "text" },
    hosts: /^patreon\.com$/,
    handle: /^[a-z0-9_-]{2,64}$/i,
    profile: (h) => `https://patreon.com/${h}`,
    canonical: (segs) => {
      if (segs[0] === "c" && segs[1]) return `https://patreon.com/c/${segs[1]}`
      return segs[0] ? `https://patreon.com/${segs[0]}` : null
    },
    handleOf: (u) => single(u, /^[a-z0-9_-]{2,64}$/i),
  },
  discord: {
    format: { kind: "path", prefix: "discord.gg/", placeholder: "invite", inputMode: "text" },
    hosts: /^(discord\.gg|discord\.com|discordapp\.com)$/,
    handle: /^[a-z0-9-]{2,40}$/i,
    profile: (h) => `https://discord.gg/${h}`,
    canonical: (segs, _q, host) => {
      if (host === "discord.gg" && segs[0]) return `https://discord.gg/${segs[0]}`
      if (segs[0] === "invite" && segs[1]) return `https://discord.gg/${segs[1]}`
      return null
    },
    handleOf: (u) => (u.hostname === "discord.gg" ? single(u, /^[a-z0-9-]{2,40}$/i) : null),
  },
  telegram: {
    format: { kind: "handle", prefix: "@", placeholder: "username", inputMode: "text" },
    hosts: /^(t\.me|telegram\.me|telegram\.dog)$/,
    handle: /^\w{4,32}$/,
    profile: (h) => `https://t.me/${h}`,
    canonical: (segs) => {
      if (!segs[0]) return null
      if (segs[0] === "s" && segs[1]) return `https://t.me/${segs[1]}`
      if (segs[0].startsWith("+") || segs[0] === "joinchat") return `https://t.me/${segs.join("/")}`
      return `https://t.me/${segs[0]}`
    },
    handleOf: (u) => single(u, /^\w{4,32}$/),
  },
  calendly: {
    format: { kind: "path", prefix: "calendly.com/", placeholder: "yourname", inputMode: "text" },
    hosts: /^calendly\.com$/,
    handle: /^[a-z0-9_-]{2,60}(\/[a-z0-9_-]{1,60})?$/i,
    profile: (h) => `https://calendly.com/${h}`,
    canonical: (segs) => (segs[0] ? `https://calendly.com/${segs.slice(0, 2).join("/")}` : null),
    handleOf: (u) => {
      const segs = pathSegs(u)
      return segs.length >= 1 && segs.length <= 2 && !u.search ? segs.join("/") : null
    },
  },
  spotify: {
    format: { kind: "url", prefix: "", placeholder: "open.spotify.com/artist/…", inputMode: "url" },
    hosts: /^(open\.spotify\.com|spotify\.com|spotify\.link|play\.spotify\.com)$/,
    canonical: (segs, _q, host) => {
      if (host === "spotify.link") return null
      /* open.spotify.com/intl-de/artist/ID: the language part is dropped. */
      const s = segs[0]?.startsWith("intl-") ? segs.slice(1) : segs
      if (s[0] && s[1] && /^(artist|album|track|playlist|show|episode|user)$/.test(s[0])) return `https://open.spotify.com/${s[0]}/${s[1]}`
      return null
    },
  },
  applemusic: {
    format: { kind: "url", prefix: "", placeholder: "music.apple.com/…", inputMode: "url" },
    hosts: /^(music\.apple\.com|itunes\.apple\.com|apple\.co)$/,
    canonical: (segs, _q, host) => (host === "music.apple.com" && segs.length ? `https://music.apple.com/${segs.join("/")}` : null),
  },
  whatsapp: {
    format: { kind: "phone", prefix: "+", placeholder: "44 7700 900123", inputMode: "tel" },
    hosts: /^(wa\.me|whatsapp\.com|api\.whatsapp\.com|chat\.whatsapp\.com|web\.whatsapp\.com|wa\.link)$/,
    canonical: (segs, q, host) => {
      if (host === "wa.me" && segs[0] && /^\d{6,15}$/.test(segs[0])) return `https://wa.me/${segs[0]}`
      if (host === "wa.me" && segs[0] === "message" && segs[1]) return `https://wa.me/message/${segs[1]}`
      const phone = (q.get("phone") || "").replace(/\D/g, "")
      if ((segs[0] === "send" || host === "api.whatsapp.com") && phone.length >= 6) return `https://wa.me/${phone}`
      if (host === "chat.whatsapp.com" && segs[0]) return `https://chat.whatsapp.com/${segs[0]}`
      return null
    },
    handleOf: (u) => {
      const segs = pathSegs(u)
      return u.hostname === "wa.me" && segs.length === 1 && /^\d{6,15}$/.test(segs[0]) ? segs[0] : null
    },
  },
  email: {
    format: { kind: "email", prefix: "Email", placeholder: "you@example.com", inputMode: "email" },
    hosts: /^$/,
  },
  website: {
    format: { kind: "url", prefix: "https://", placeholder: "yoursite.com", inputMode: "url" },
    hosts: /./,
  },
}

/** Query keys that are only ever tracking, dropped from any link that is kept as pasted. */
const TRACKING = /^(utm_\w+|igsh|igshid|si|fbclid|gclid|mibextid|ref|ref_src|ref_url|s|t|feature|_t|_r|is_from_webapp|sender_device|sender_web_id|share_app_id|share_link_id|lang|hl|trk|originalSubdomain|rcm|context|nd|app)$/i

function pathSegs(u: URL): string[] {
  return u.pathname
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    })
}

/** The one path segment of a profile address, when it is a valid handle (and not one of `not`). */
function single(u: URL, re: RegExp, not: string[] = []): string | null {
  const segs = pathSegs(u)
  if (segs.length !== 1 || u.search) return null
  const h = stripAt(segs[0])
  return re.test(h) && !not.includes(segs[0]) ? h : null
}

export function socialFormat(platform: string): SocialFormat {
  const key = canonicalSocialPlatform(platform)
  return RULES[key]?.format ?? { kind: "url", prefix: "", placeholder: "https://…", inputMode: "url" }
}

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i

/** Digits of a phone number typed any common way: "+44 7700 900123", "(555) 123-4567", "0044…". */
function phoneDigits(raw: string): string | null {
  const t = raw.trim()
  if (!/^\+?[\d\s().\-/]{6,}$/.test(t)) return null
  let d = t.replace(/\D/g, "")
  if (!t.startsWith("+") && d.startsWith("00")) d = d.slice(2)
  return d.length >= 7 && d.length <= 15 ? d : null
}

/** A pasted link as a URL, with or without its https://, or null when it is not one. */
function asUrl(raw: string): URL | null {
  const t = raw.trim()
  if (/\s/.test(t)) return null
  const full = /^https?:\/\//i.test(t) ? t : /^\/\//.test(t) ? `https:${t}` : `https://${t}`
  try {
    const u = new URL(full)
    if (!/^https?:$/.test(u.protocol) || !/\.[a-z][a-z0-9-]+$/i.test(u.hostname)) return null
    return u
  } catch {
    return null
  }
}

/** The link as pasted, made https, without tracking keys, a fragment or a trailing slash. */
function cleaned(u: URL): string {
  const out = new URL(u.toString())
  out.protocol = "https:"
  out.hash = ""
  for (const k of [...out.searchParams.keys()]) if (TRACKING.test(k)) out.searchParams.delete(k)
  let s = out.toString()
  if (!out.search && s.endsWith("/") && out.pathname !== "/") s = s.slice(0, -1)
  if (!out.search && out.pathname === "/") s = s.slice(0, -1)
  return s
}

/**
 * What was typed or pasted for this platform, as the address to save, or
 * why it is not one. Empty input is { ok: false, error: "empty" }.
 */
export function parseSocialInput(platform: string, raw: string): SocialParse {
  const key = canonicalSocialPlatform(platform)
  const rule = RULES[key]
  const typed = String(raw ?? "").trim().replace(/^[​﻿]+|[​﻿]+$/g, "")
  if (!typed) return { ok: false, error: "empty" }

  if (key === "email") {
    const addr = typed.replace(/^mailto:/i, "").split("?")[0].trim()
    return EMAIL.test(addr) ? { ok: true, url: `mailto:${addr.toLowerCase()}` } : { ok: false, error: "email" }
  }

  if (key === "whatsapp") {
    const digits = phoneDigits(typed)
    if (digits) return { ok: true, url: `https://wa.me/${digits}` }
  }

  if (!rule) {
    const u = asUrl(typed)
    return u ? { ok: true, url: cleaned(u) } : { ok: false, error: "url" }
  }

  /* A handle: "@name", or a bare name with nothing in it that belongs to an address. */
  const asHandle = stripAt(typed).replace(/\/+$/, "")
  if (rule.handle && rule.profile && !/^(www|m)\./i.test(typed) && !typed.includes(":") && rule.handle.test(asHandle)) {
    return { ok: true, url: rule.profile(asHandle) }
  }
  const looksLikeLink = /[/:]/.test(typed) || /^(www\.|m\.)/i.test(typed) || (/\.[a-z]{2,}(\/|$)/i.test(typed) && !rule.handle?.test(stripAt(typed)))
  if (rule.handle && rule.profile && !looksLikeLink) {
    const h = stripAt(typed).replace(/\/+$/, "")
    if (rule.handle.test(h)) return { ok: true, url: rule.profile(h) }
    if (key !== "whatsapp") return { ok: false, error: "handle" }
  }
  /* "in/name" or "company/acme" typed after the LinkedIn prefix, "name/30min" after Calendly's. */
  if (key === "linkedin" && /^(in|company|school|showcase)\/[^/\s]+\/?$/i.test(typed)) {
    return { ok: true, url: `https://linkedin.com/${typed.replace(/\/$/, "")}` }
  }

  if (key === "spotify") {
    const m = /^spotify:(artist|album|track|playlist|show|episode|user):([A-Za-z0-9]+)$/.exec(typed)
    if (m) return { ok: true, url: `https://open.spotify.com/${m[1]}/${m[2]}` }
  }

  const u = asUrl(typed)
  if (!u) return { ok: false, error: key === "whatsapp" ? "phone" : rule.format.kind === "url" ? "url" : "handle" }
  if (key === "website") return { ok: true, url: cleaned(u) }

  const bare = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "")
  /* A short-link subdomain (vm.tiktok.com) is still the platform. */
  const onPlatform = rule.hosts.test(bare) || rule.hosts.test(bare.split(".").slice(-2).join("."))
  if (!onPlatform) return { ok: false, error: "wrong_site" }
  const canonical = rule.canonical?.(pathSegs(u), u.searchParams, bare) ?? null
  return { ok: true, url: canonical ?? cleaned(u) }
}

/**
 * What goes in the field for a link already saved: the handle or number a
 * person would type after the prefix, or the whole link when it is more than
 * a plain profile. Old values ("@name", a bare name, "mailto:…") are read.
 */
export function socialFieldValue(platform: string, saved: string | null | undefined): string {
  const key = canonicalSocialPlatform(platform)
  const value = String(saved ?? "").trim()
  if (!value) return ""
  const rule = RULES[key]
  if (key === "email") return value.replace(/^mailto:/i, "")
  if (!/^https?:\/\//i.test(value)) {
    /* An old handle saved as typed. */
    return rule?.format.kind === "handle" || rule?.format.kind === "path" ? stripAt(value) : value
  }
  if (key === "website") return value.replace(/^https:\/\//i, "")
  const u = asUrl(value)
  if (!u || !rule?.handleOf) return value
  const host = u.hostname.toLowerCase().replace(/^(www|m)\./, "")
  if (!rule.hosts.test(host)) return value
  return rule.handleOf(new URL(`https://${host}${u.pathname}${u.search}`)) ?? value
}

/** Whether the field holds a whole link (so the prefix steps aside) rather than a handle. */
export function socialFieldIsLink(platform: string, value: string): boolean {
  const key = canonicalSocialPlatform(platform)
  const t = value.trim()
  if (!t || key === "email" || key === "website") return false
  if (key === "whatsapp" && phoneDigits(t)) return false
  return /^https?:\/\//i.test(t) || /^(www\.|m\.)/i.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(t)
}
