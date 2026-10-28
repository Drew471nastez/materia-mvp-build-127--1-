// OnePage: the rules behind the course, music, testimonials and contact blocks
// Location: lib/onepage/creator-blocks.ts
//
// Plain functions with no React in them (components/onepage/creator-blocks.tsx
// draws the blocks), so the live page's server code and the tests can use
// them too. Each answers one question about a block's data: is there anything
// to draw, and what does a pasted link point at.

import type { ContactFormBlockData, CourseBlockData, EmbedBlockData, MusicBlockData, TestimonialItem, TestimonialsBlockData } from "./types"

export const CREATOR_BLOCK_TYPES = ["course", "music", "testimonials", "contact_form", "embed"] as const
export type CreatorBlockType = (typeof CREATOR_BLOCK_TYPES)[number]

export function isCreatorBlock(block: { type: string }): boolean {
  return (CREATOR_BLOCK_TYPES as readonly string[]).includes(block.type)
}

/* ─── Music: Spotify, SoundCloud and Apple Music, by their own players ──── */

export type MusicSource = {
  kind: "spotify" | "soundcloud" | "apple"
  /** The provider's own embed address: public, no key, no sign in. */
  embedUrl: string
  /** The player's height in CSS pixels: a single track is short, a list is tall. */
  height: number
}

const SPOTIFY_KINDS = ["track", "album", "playlist", "episode", "show", "artist"] as const

/** The player a pasted music link plays in, or null for a link no player takes. */
export function musicSource(raw: string | null | undefined): MusicSource | null {
  const text = (raw || "").trim()
  if (!text) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  const host = url.hostname.toLowerCase().replace(/^www\./, "")

  if (host === "open.spotify.com") {
    /* /track/<id>, /intl-de/track/<id>, /embed/track/<id> */
    const parts = url.pathname.split("/").filter(Boolean).filter((p) => !/^intl-[a-z-]+$/i.test(p) && p !== "embed")
    const kind = parts[0] as (typeof SPOTIFY_KINDS)[number]
    const id = parts[1] || ""
    if (!SPOTIFY_KINDS.includes(kind) || !/^[A-Za-z0-9]{10,40}$/.test(id)) return null
    const short = kind === "track" || kind === "episode"
    return { kind: "spotify", embedUrl: `https://open.spotify.com/embed/${kind}/${id}?utm_source=storelib`, height: short ? 152 : 352 }
  }

  if (host === "soundcloud.com" || host === "m.soundcloud.com" || host === "on.soundcloud.com") {
    const path = url.pathname.replace(/\/+$/, "")
    if (path.split("/").filter(Boolean).length < (host === "on.soundcloud.com" ? 1 : 2)) return null
    const clean = `https://${host === "m.soundcloud.com" ? "soundcloud.com" : host}${path}`
    const list = path.includes("/sets/")
    return {
      kind: "soundcloud",
      embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}&color=%231a1a2e&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=false`,
      height: list ? 352 : 166,
    }
  }

  if (host === "music.apple.com" || host === "embed.music.apple.com") {
    const parts = url.pathname.split("/").filter(Boolean)
    /* /<country>/<album|playlist|song|music-video>/<name>/<id> */
    if (parts.length < 3 || !/^[a-z]{2}$/i.test(parts[0]) || !["album", "playlist", "song"].includes(parts[1])) return null
    const single = parts[1] === "song" || url.searchParams.has("i")
    return { kind: "apple", embedUrl: `https://embed.music.apple.com${url.pathname}${url.search}`, height: single ? 175 : 450 }
  }

  return null
}

export const MUSIC_PROVIDER_NAME: Record<MusicSource["kind"], string> = { spotify: "Spotify", soundcloud: "SoundCloud", apple: "Apple Music" }

/* ─── Booking: Calendly and Cal.com, by their own pages ───────────────── */

export type BookingSource = { kind: "calendly" | "calcom"; url: string }

/**
 * A booking link a coaching or call block can open: a Calendly or Cal.com
 * page, https only. Both are made to be framed (Calendly sends
 * X-Frame-Options ALLOWALL, Cal.com sends none), so the page can show them
 * in its own sheet. Anything else is not a booking page.
 */
export function bookingSource(raw: string | null | undefined): BookingSource | null {
  const text = (raw || "").trim()
  if (!text) return null
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const path = url.pathname.replace(/\/+$/, "")
  if (!path || path === "/") return null
  url.protocol = "https:"
  if (host === "calendly.com") return { kind: "calendly", url: url.toString() }
  if (host === "cal.com" || host === "app.cal.com" || host === "cal.eu") return { kind: "calcom", url: url.toString() }
  return null
}

/* ─── Embed: a post, form, player or calendar, by its own public embed ── */

/**
 * ROUND 11: WHAT LINKTREE AND LINK.ME EMBED THAT A PAGE HERE COULD NOT.
 * Each one is the service's own public embed page: no key, no account, no
 * script of theirs on the page, only a frame. Every host is in frame-src
 * (lib/security/csp.ts, vercel.json) and was checked to allow being framed
 * (no X-Frame-Options, or a frame-ancestors that lets any https page in):
 *
 *   instagram   a post or reel           www.instagram.com/p/<id>/embed/
 *   x           a post                   platform.twitter.com/embed/Tweet.html
 *   typeform    a form                   <name>.typeform.com/to/<id>
 *   googleforms a Google Form            docs.google.com/forms/d/e/<id>/viewform?embedded=true
 *   tally       a Tally form             tally.so/embed/<id>
 *   substack    a newsletter signup      <name>.substack.com/embed
 *   podcasts    an Apple Podcasts show   embed.podcasts.apple.com/...
 *   twitch      a channel, video or clip player.twitch.tv, clips.twitch.tv (Twitch
 *                                        only plays for a `parent` that is the
 *                                        page's own host: given at load, see
 *                                        embedFrameUrl)
 *   loom        a Loom video             www.loom.com/embed/<id>
 *   mixcloud    a show                   player-widget.mixcloud.com
 *   bandcamp    an album or track        bandcamp.com/EmbeddedPlayer/... (from
 *                                        Bandcamp's own Share › Embed code,
 *                                        which has the number a page link lacks)
 *   deezer      an album, playlist, track widget.deezer.com
 *   gcal        a booking page           calendar.google.com/calendar/appointments/schedules/<id>
 *
 * Anything else is not an embed (null): the editor says which links work,
 * and the page draws nothing rather than a frame that refuses to load.
 */
export type EmbedKind =
  | "instagram"
  | "x"
  | "typeform"
  | "googleforms"
  | "tally"
  | "substack"
  | "podcasts"
  | "twitch"
  | "loom"
  | "mixcloud"
  | "bandcamp"
  | "deezer"
  | "gcal"

export type EmbedSource = {
  kind: EmbedKind
  /** The frame's address. For Twitch it still needs the page's host (embedFrameUrl). */
  embedUrl: string
  /** A fixed height in CSS pixels, or null for a 16:9 box. */
  height: number | null
  /** The frame grows to its content when the service says how tall it is (Instagram, X). */
  resizes?: boolean
}

export const EMBED_PROVIDER_NAME: Record<EmbedKind, string> = {
  instagram: "Instagram",
  x: "X",
  typeform: "Typeform",
  googleforms: "Google Forms",
  tally: "Tally",
  substack: "Substack",
  podcasts: "Apple Podcasts",
  twitch: "Twitch",
  loom: "Loom",
  mixcloud: "Mixcloud",
  bandcamp: "Bandcamp",
  deezer: "Deezer",
  gcal: "Google Calendar",
}

/** Every host an embed frame loads from: the list frame-src must hold (tests/onepage-addblock-r11.test.ts). */
export const EMBED_FRAME_HOSTS = [
  "https://www.instagram.com",
  "https://platform.twitter.com",
  "https://*.typeform.com",
  "https://docs.google.com",
  "https://tally.so",
  "https://*.substack.com",
  "https://embed.podcasts.apple.com",
  "https://player.twitch.tv",
  "https://clips.twitch.tv",
  "https://www.loom.com",
  "https://www.mixcloud.com",
  "https://player-widget.mixcloud.com",
  "https://bandcamp.com",
  "https://widget.deezer.com",
  "https://calendar.google.com",
] as const

function parseLink(raw: string | null | undefined): URL | null {
  let text = (raw || "").trim()
  if (!text) return null
  /* Bandcamp's, Google's and Tally's "embed" codes are an <iframe>: take its src. */
  const src = text.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i)
  if (src) text = src[1].replace(/&amp;/g, "&")
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    url.protocol = "https:"
    return url
  } catch {
    return null
  }
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/

/** The embed a pasted link (or a pasted embed code) plays in, or null for one nothing here plays. */
export function embedSource(raw: string | null | undefined): EmbedSource | null {
  const url = parseLink(raw)
  if (!url) return null
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const parts = url.pathname.split("/").filter(Boolean)

  if (host === "instagram.com") {
    /* /p/<id>, /reel/<id>, /tv/<id>, with or without a /<user>/ in front */
    const at = parts.findIndex((p) => p === "p" || p === "reel" || p === "reels" || p === "tv")
    const id = at >= 0 ? parts[at + 1] : ""
    if (!id || !SAFE_ID.test(id)) return null
    const kind = parts[at] === "reels" ? "reel" : parts[at]
    return { kind: "instagram", embedUrl: `https://www.instagram.com/${kind}/${id}/embed/`, height: 560, resizes: true }
  }

  if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com" || host === "mobile.x.com") {
    /* /<user>/status/<id> */
    const at = parts.indexOf("status")
    const id = at >= 0 ? parts[at + 1] : ""
    if (!/^\d{1,25}$/.test(id || "")) return null
    return { kind: "x", embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true`, height: 420, resizes: true }
  }

  if (host.endsWith(".typeform.com") || host === "typeform.com") {
    /* /to/<id> on form.typeform.com or <name>.typeform.com */
    const at = parts.indexOf("to")
    const id = at >= 0 ? parts[at + 1] : ""
    if (!id || !SAFE_ID.test(id) || host === "typeform.com" || host === "admin.typeform.com") return null
    return { kind: "typeform", embedUrl: `https://${host}/to/${id}?typeform-embed=embed-widget`, height: 520 }
  }

  if (host === "docs.google.com" && parts[0] === "forms") {
    /* /forms/d/e/<id>/viewform: the published address (a forms.gle short link cannot be read here) */
    if (parts[1] !== "d" || parts[2] !== "e" || !parts[3] || !SAFE_ID.test(parts[3])) return null
    return { kind: "googleforms", embedUrl: `https://docs.google.com/forms/d/e/${parts[3]}/viewform?embedded=true`, height: 640 }
  }

  if (host === "tally.so") {
    /* /r/<id>, /embed/<id> or /forms/<id> */
    const id = parts[0] === "r" || parts[0] === "embed" || parts[0] === "forms" ? parts[1] : ""
    if (!id || !SAFE_ID.test(id)) return null
    return { kind: "tally", embedUrl: `https://tally.so/embed/${id}?alignLeft=1&hideTitle=0&transparentBackground=1`, height: 520 }
  }

  if (host.endsWith(".substack.com")) {
    const name = host.slice(0, -".substack.com".length)
    if (!/^[a-z0-9-]+$/.test(name) || name === "www" || name === "open") return null
    return { kind: "substack", embedUrl: `https://${name}.substack.com/embed`, height: 320 }
  }

  if (host === "podcasts.apple.com" || host === "embed.podcasts.apple.com") {
    /* /<country>/podcast/<name>/id<number>, an episode with ?i=<number> */
    if (parts.length < 3 || !/^[a-z]{2}$/i.test(parts[0]) || parts[1] !== "podcast") return null
    const show = parts.find((p) => /^id\d+$/.test(p)) || (/^\d+$/.test(parts[parts.length - 1]) ? parts[parts.length - 1] : "")
    if (!show) return null
    const episode = url.searchParams.get("i")
    if (!parts.every((p) => /^[A-Za-z0-9%._~-]+$/.test(p))) return null
    const path = parts.join("/")
    return { kind: "podcasts", embedUrl: `https://embed.podcasts.apple.com/${path}${episode && /^\d+$/.test(episode) ? `?i=${episode}` : ""}`, height: episode ? 175 : 450 }
  }

  if (host === "twitch.tv" || host === "m.twitch.tv" || host === "clips.twitch.tv") {
    if (host === "clips.twitch.tv") {
      const slug = parts[0] === "embed" ? url.searchParams.get("clip") || "" : parts[0] || ""
      if (!slug || !SAFE_ID.test(slug)) return null
      return { kind: "twitch", embedUrl: `https://clips.twitch.tv/embed?clip=${slug}&autoplay=false`, height: null }
    }
    if (parts[0] === "videos" && /^\d+$/.test(parts[1] || "")) return { kind: "twitch", embedUrl: `https://player.twitch.tv/?video=${parts[1]}&autoplay=false`, height: null }
    if (parts[1] === "clip" && parts[2] && SAFE_ID.test(parts[2])) return { kind: "twitch", embedUrl: `https://clips.twitch.tv/embed?clip=${parts[2]}&autoplay=false`, height: null }
    const channel = parts[0] || ""
    if (parts.length !== 1 || !/^[A-Za-z0-9_]{3,25}$/.test(channel)) return null
    return { kind: "twitch", embedUrl: `https://player.twitch.tv/?channel=${channel.toLowerCase()}&autoplay=false`, height: null }
  }

  if (host === "loom.com") {
    const id = parts[0] === "share" || parts[0] === "embed" ? parts[1] : ""
    if (!id || !/^[a-f0-9]{16,40}$/i.test(id)) return null
    return { kind: "loom", embedUrl: `https://www.loom.com/embed/${id}`, height: null }
  }

  if (host === "mixcloud.com" || host === "m.mixcloud.com") {
    /* /<user>/<show>/ */
    if (parts.length !== 2 || !parts.every((p) => /^[A-Za-z0-9_.-]+$/.test(p))) return null
    const feed = encodeURIComponent(`/${parts[0]}/${parts[1]}/`)
    return { kind: "mixcloud", embedUrl: `https://player-widget.mixcloud.com/widget/iframe?feed=${feed}&hide_cover=1&light=1`, height: 120 }
  }

  if (host === "bandcamp.com" && parts[0] === "EmbeddedPlayer") {
    /* Bandcamp's own player address: album=<n> or track=<n> somewhere in the path */
    const m = url.pathname.match(/\/(album|track)=(\d+)/)
    if (!m) return null
    return { kind: "bandcamp", embedUrl: `https://bandcamp.com/EmbeddedPlayer/${m[1]}=${m[2]}/size=large/bgcol=ffffff/linkcol=1a1a2e/tracklist=false/artwork=small/transparent=true/`, height: 120 }
  }

  if (host === "deezer.com" || host === "widget.deezer.com") {
    /* /<lang>/album|playlist|track/<id>, or the widget's own /widget/<theme>/<kind>/<id> */
    const at = parts.findIndex((p) => p === "album" || p === "playlist" || p === "track")
    const id = at >= 0 ? parts[at + 1] : ""
    if (!id || !/^\d+$/.test(id)) return null
    return { kind: "deezer", embedUrl: `https://widget.deezer.com/widget/auto/${parts[at]}/${id}`, height: parts[at] === "track" ? 150 : 300 }
  }

  if (host === "calendar.google.com" && parts[0] === "calendar" && parts[1] === "appointments") {
    /* /calendar/appointments/schedules/<id> (a booking page made in Google Calendar) */
    const at = parts.indexOf("schedules")
    const id = at >= 0 ? parts[at + 1] : ""
    if (!id || !SAFE_ID.test(id)) return null
    return { kind: "gcal", embedUrl: `https://calendar.google.com/calendar/appointments/schedules/${id}?gv=true`, height: 640 }
  }

  return null
}

/**
 * The address the frame loads on a page served from `pageHost`. Twitch
 * refuses to play unless told the host it is on (its frame-ancestors is that
 * host and nothing else), so it is given the page's own (storelib.me, the
 * editor's storelib.com, a custom domain) at load; every other embed is as is.
 */
export function embedFrameUrl(source: EmbedSource, pageHost: string | null | undefined): string | null {
  if (source.kind !== "twitch") return source.embedUrl
  const host = (pageHost || "").toLowerCase().replace(/:\d+$/, "")
  if (!host || !/^[a-z0-9.-]+$/.test(host)) return null
  return `${source.embedUrl}&parent=${host}`
}

/**
 * How tall a frame says it is, from a message it sent: Instagram's
 * `{"type":"MEASURE","details":{"height":n}}` and X's
 * `{"twttr.embed":{"method":"twttr.private.resize","params":[{"height":n}]}}`.
 * Only from that service's own origin; null for anything else.
 */
export function embedHeightFromMessage(kind: EmbedKind, origin: string, data: unknown): number | null {
  let msg: unknown = data
  if (typeof msg === "string") {
    try {
      msg = JSON.parse(msg)
    } catch {
      return null
    }
  }
  if (!msg || typeof msg !== "object") return null
  const m = msg as Record<string, unknown>
  let h: unknown = null
  if (kind === "instagram" && origin === "https://www.instagram.com" && m.type === "MEASURE") h = (m.details as { height?: unknown } | undefined)?.height
  if (kind === "x" && origin === "https://platform.twitter.com") {
    const e = m["twttr.embed"] as { method?: string; params?: { height?: unknown }[] } | undefined
    if (e?.method === "twttr.private.resize") h = e.params?.[0]?.height
  }
  const n = typeof h === "number" ? h : typeof h === "string" ? Number.parseFloat(h) : NaN
  return Number.isFinite(n) && n > 40 && n < 4000 ? Math.round(n) : null
}

/**
 * How wide an X post says its card is (round 41): X's resize message carries
 * the card's width beside its height. The frame is then made exactly that
 * wide, so nothing of the frame shows beside the card. Instagram says only
 * its height (null). Only from X's own origin.
 */
export function embedWidthFromMessage(kind: EmbedKind, origin: string, data: unknown): number | null {
  if (kind !== "x" || origin !== "https://platform.twitter.com") return null
  let msg: unknown = data
  if (typeof msg === "string") {
    try {
      msg = JSON.parse(msg)
    } catch {
      return null
    }
  }
  if (!msg || typeof msg !== "object") return null
  const e = (msg as Record<string, unknown>)["twttr.embed"] as { method?: string; params?: { width?: unknown }[] } | undefined
  if (e?.method !== "twttr.private.resize") return null
  const w = e.params?.[0]?.width
  const n = typeof w === "number" ? w : typeof w === "string" ? Number.parseFloat(w) : NaN
  return Number.isFinite(n) && n >= 200 && n <= 600 ? Math.round(n) : null
}

/* ─── Course ──────────────────────────────────────────────────────────── */

/** "12 lessons", or null while the count is unknown. */
export function lessonsLabel(count: number | null | undefined): { count: number } | null {
  return typeof count === "number" && Number.isFinite(count) && count > 0 ? { count: Math.floor(count) } : null
}

/** Where a course block opens: the course's own page, where it is bought. */
export function courseHref(data: Pick<CourseBlockData, "course_slug">): string | null {
  const slug = (data.course_slug || "").trim()
  return slug && /^[A-Za-z0-9._~-]+$/.test(slug) ? `/p/${slug}` : null
}

/* ─── Testimonials ───────────────────────────────────────────────────── */

export const TESTIMONIAL_LIMITS = { items: 12, quote: 400, name: 60, detail: 60 } as const

/** The quotes worth drawing: each needs words and a name, cut to size, at most twelve. */
export function cleanTestimonials(items: TestimonialItem[] | null | undefined): TestimonialItem[] {
  if (!Array.isArray(items)) return []
  return items
    .filter((i) => i && typeof i.quote === "string" && i.quote.trim() && typeof i.name === "string" && i.name.trim())
    .slice(0, TESTIMONIAL_LIMITS.items)
    .map((i) => ({
      id: String(i.id || ""),
      quote: i.quote.trim().slice(0, TESTIMONIAL_LIMITS.quote),
      name: i.name.trim().slice(0, TESTIMONIAL_LIMITS.name),
      detail: (i.detail || "").trim().slice(0, TESTIMONIAL_LIMITS.detail) || null,
      rating: typeof i.rating === "number" && i.rating >= 1 && i.rating <= 5 ? Math.round(i.rating) : null,
    }))
}

/* ─── Contact form ───────────────────────────────────────────────────── */

export const CONTACT_LIMITS = { name: 80, message: 2000 } as const

/** What the visitor typed, checked before it is sent: an error to show, or null. */
export function contactInputError(input: { email: string; message: string }): "email" | "message" | null {
  const email = input.email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "email"
  if (!input.message.trim()) return "message"
  return null
}

/* ─── Is there anything to draw? ─────────────────────────────────────── */

/** An empty block of these is left out of the page, so it leaves no gap. */
export function creatorBlockHasContent(block: { type: string; data?: unknown }): boolean {
  switch (block.type) {
    case "course":
      return !!((block.data as CourseBlockData | undefined)?.product_id || "").trim()
    case "music":
      return musicSource((block.data as MusicBlockData | undefined)?.url) !== null
    case "testimonials":
      return cleanTestimonials((block.data as TestimonialsBlockData | undefined)?.items).length > 0
    case "contact_form":
      return !!(block.data as ContactFormBlockData | undefined)
    case "embed":
      return embedSource((block.data as EmbedBlockData | undefined)?.url) !== null
    default:
      return true
  }
}

/* ─── The email signup's spam checks ─────────────────────────────────── */

/**
 * Faster than this from the block appearing to the address being sent is a
 * script. Shorter than a contact form's 2.5 seconds (lib/site-contact):
 * a browser can fill an email in one tap, and a person can send it a second
 * later.
 */
export const SIGNUP_MIN_ELAPSED_MS = 1200

/**
 * A signup sent by a script: the hidden field filled in, or sent faster than
 * a person can. A page cached from before these checks sends neither, and
 * is let through: only what was sent is judged.
 */
export function signupLooksAutomated(raw: unknown): boolean {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  if (typeof b.company === "string" && b.company.trim() !== "") return true
  if (b.company !== undefined && b.company !== null && typeof b.company !== "string") return true
  if (typeof b.elapsed === "number" && Number.isFinite(b.elapsed) && b.elapsed >= 0 && b.elapsed < SIGNUP_MIN_ELAPSED_MS) return true
  return false
}

/** A first name as the subscriber list keeps it: one line, at most 80 characters, or null. */
export function signupName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  // eslint-disable-next-line no-control-regex
  const clean = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
  return clean || null
}

/** "Calendly" or "Cal.com", for a booking link that is one; null for one that is not. */
export function bookingProviderName(raw: string | null | undefined): string | null {
  const s = bookingSource(raw)
  return s ? (s.kind === "calcom" ? "Cal.com" : "Calendly") : null
}
