// OnePage: the rules behind the course, music, testimonials and contact blocks
// Location: lib/onepage/creator-blocks.ts
//
// Plain functions with no React in them (components/onepage/creator-blocks.tsx
// draws the blocks), so the live page's server code and the tests can use
// them too. Each answers one question about a block's data: is there anything
// to draw, and what does a pasted link point at.

import type { ContactFormBlockData, CourseBlockData, MusicBlockData, TestimonialItem, TestimonialsBlockData } from "./types"

export const CREATOR_BLOCK_TYPES = ["course", "music", "testimonials", "contact_form"] as const
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
