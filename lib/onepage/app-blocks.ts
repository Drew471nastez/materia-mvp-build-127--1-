// OnePage: the app blocks, one engine for every service (round AL)
// Location: lib/onepage/app-blocks.ts
//
// The owner, round AL: "there are too many blocks which control basically
// the same thing ... Instagram, display your posts and Reels, TikTok ...
// multiple ways to display, classic, cards, grid, carousel, profile, single
// ... Interaction, when a visitor clicks the button, go to URL, display
// Instagram post ... and the same with TikTok."
//
// Every service that had no block of its own is ONE block type, "app", with
// a provider. A provider is a row in APP_PROVIDERS: its name, its mark and
// colour, the addresses it accepts (`parse`), the official embed a post or a
// player of it plays in, the layouts that make sense for it and what a tap
// does by default. The renderer (components/onepage/app-block.tsx) and its
// editor draw every provider with the same code, so a new service is a row
// here, not a new block.
//
// Services that already had a block keep it (YouTube, Vimeo and TikTok
// videos in the video block, Spotify, Apple Music and SoundCloud in the
// music block, Calendly, FAQ, Map, Image, PDF, Email signup, Forms, Courses,
// the product shelves and the discount code): the Add block sheet maps their
// entries there (components/onepage/add-block-picker.tsx).
//
// Embeds are only the services' own public embed pages, with no key, framed
// lazily. Each host is in lib/security/csp.ts frame-src (APP_FRAME_HOSTS).
// An address that has no embed (a profile, a shop) is drawn as a card that
// links to it, so nothing here can draw a frame that refuses to load.
//
// Pure: no React, so the server and the tests can read it.

import { embedSource, musicSource, tiktokPlayerUrl, type EmbedKind } from "./creator-blocks"
import { parseSocialInput, socialFieldValue } from "./social-input"

export const APP_BLOCK_TYPES = ["app"] as const

export function isAppBlock(block: { type: string }): boolean {
  return block.type === "app"
}

/* ─── Layouts and taps ───────────────────────────────────────────────── */

export const APP_LAYOUTS = ["classic", "card", "featured", "profile", "single", "grid", "carousel"] as const
export type AppLayout = (typeof APP_LAYOUTS)[number]

export type AppOpenMode = "sheet" | "direct"

/* ─── What a block holds ─────────────────────────────────────────────── */

export interface AppItem {
  id: string
  title?: string
  url?: string
  image_url?: string | null
  /** A price, an author, a line under the title. */
  note?: string
  /** Events: the day (YYYY-MM-DD) and where. */
  date?: string
  venue?: string
  /** Events: no tickets left. */
  sold_out?: boolean
  /** Stats: the number as typed ("12k", "98%"). */
  value?: string
  /** Round AR. Stats: where the number comes from: typed, or one Storelib tracks (lib/onepage/stat-count STAT_SOURCES), filled in on the server. */
  source?: string
  /** Round AR. Events: the time it starts ("20:00"), shown beside the day. */
  time?: string
}

export interface AppContact {
  name?: string
  org?: string
  phone?: string
  email?: string
  website?: string
  address?: string
}

export interface AppPollOption {
  id: string
  label: string
}

export interface AppBlockData {
  provider: AppProviderId
  /** The profile, page, post or shop address. */
  url?: string
  title?: string
  /** The line under the title (a handle, a short description). */
  subtitle?: string
  button_text?: string
  image_url?: string | null
  layout?: AppLayout
  /** Round AR3: how a list's pictures sit in their boxes (products, books): cover, contain or full. */
  image_fit?: "cover" | "contain" | "full"
  /** Read by components/onepage/block-sheet openModeOf. */
  open_mode?: AppOpenMode
  /** More posts, shown in a carousel or one after another in the sheet. */
  posts?: string[]
  items?: AppItem[]
  contact?: AppContact
  poll_question?: string
  poll_options?: AppPollOption[]
  /** Mobile app: the two store pages. */
  ios_url?: string
  android_url?: string
  /** Google reviews: the score and how many, as the creator reads them on Google. */
  rating?: number | null
  reviews_count?: number | null
  /** Text and button: the words. */
  text?: string
  /** Email: the address shown. */
  email?: string

  /* ─── Round AR: the data and money blocks ─── */
  /** Tips: Storelib checkout or a link (lib/onepage/tips). */
  tip_mode?: "storelib" | "link"
  tip_amounts?: number[]
  tip_custom?: boolean
  tip_message?: boolean
  /** Filled on the server: the creator can take a payment now, and in which currency. */
  tip_ready?: boolean
  tip_currency?: string
  /** Stats: how the numbers arrive (lib/onepage/stat-count). */
  stats_animation?: "count" | "roll" | "fade" | "none"
  /** Poll: visitors see the totals after voting (default on). */
  poll_show_results?: boolean
  /** Events: Bandsintown's upcoming shows for this artist, merged with the typed ones (lib/onepage/feeds). */
  bandsintown_artist?: string
  /** One event: when it starts (an ISO instant), where, and RSVP. */
  event_start?: string | null
  venue?: string
  rsvp?: boolean
  /** Paid access: the product that opens it, and what it opens. locked_* are never sent to a visitor (lib/onepage/paid-access). */
  paid_product_id?: string | null
  locked_text?: string
  locked_url?: string
  locked_label?: string
  /** Filled on the server from the product: its name, price and checkout. */
  paid_title?: string
  paid_price?: string
  paid_checkout?: string
  paid_ready?: boolean
  /** Reviews: whose (lib/onepage/reviews-block). */
  review_source?: "storelib" | "google" | "trustpilot"
  /** Trustpilot: the TrustBox code as copied from Trustpilot Business, read for its ids. */
  trustbox?: string
  /** Filled on the server: the store's own reviews. */
  review_items?: Array<{ id: string; rating: number; title: string; body: string; author: string; date: string; verified: boolean; product_title?: string }>
  review_summary?: { average: number; count: number; average_label: string; count_label: string } | null
  /** Filled on the server: an RSS block's latest posts (lib/onepage/feeds). */
  feed_items?: Array<{ title: string; url: string; date: string | null }>
  /** RSS: how many of the latest posts to list, 0 for none. */
  feed_count?: number
}

/* ─── Reading an address ─────────────────────────────────────────────── */

/** A pasted address as an https URL, or null. Never a javascript:, data: or mailto: address. */
export function parseAppUrl(raw: string | null | undefined): URL | null {
  const text = (raw || "").trim()
  if (!text || text.length > 2048 || /\s/.test(text)) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) return null
    url.protocol = "https:"
    return url
  } catch {
    return null
  }
}

const bare = (url: URL) => url.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, "")
const partsOf = (url: URL) => url.pathname.split("/").filter(Boolean)
const SAFE_ID = /^[A-Za-z0-9_.-]+$/

/** An embed a provider plays: its frame address and size. */
export interface AppEmbed {
  src: string
  /** A fixed height in CSS pixels, or null for the aspect below. */
  height: number | null
  /** "16 / 9" or "9 / 16" when there is no fixed height. */
  aspect?: string
  /** One of the embed block's kinds (Instagram, X, Twitch...): drawn by its own frame, which follows the post's height. */
  embedKind?: EmbedKind
  /** The service says its own height (Instagram, X). */
  resizes?: boolean
}

/** What an address is, for a provider: where a tap goes, the handle a card shows, and an embed when it has one. */
export interface AppTarget {
  href: string
  handle?: string | null
  embed?: AppEmbed | null
}

const handleFrom = (url: URL, at: number, prefix = "@") => {
  const p = partsOf(url)[at]
  return p && SAFE_ID.test(p.replace(/^@/, "")) ? `${prefix}${p.replace(/^@/, "")}` : null
}

function fromEmbedKind(url: URL, kind: EmbedKind): AppEmbed | null {
  const s = embedSource(url.toString())
  if (!s || s.kind !== kind) return null
  return { src: s.embedUrl, height: s.height, aspect: s.height === null ? "16 / 9" : undefined, embedKind: s.kind, resizes: !!s.resizes }
}

/* Each provider's reader: null for an address it does not take. */
type Parser = (url: URL) => AppTarget | null

const instagram: Parser = (url) => {
  if (bare(url) !== "instagram.com") return null
  const embed = fromEmbedKind(url, "instagram")
  if (embed) return { href: url.toString(), embed, handle: handleFrom(url, 0) && !["p", "reel", "reels", "tv"].includes(partsOf(url)[0]) ? handleFrom(url, 0) : null }
  const p = partsOf(url)
  return p.length >= 1 && /^[A-Za-z0-9._]{1,30}$/.test(p[0]) ? { href: url.toString(), handle: `@${p[0]}` } : null
}

const tiktok: Parser = (url) => {
  const host = bare(url)
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") return { href: url.toString() }
  if (host !== "tiktok.com") return null
  const p = partsOf(url)
  const user = p[0]?.startsWith("@") ? p[0] : null
  const at = p.indexOf("video")
  const id = at >= 0 ? p[at + 1] : ""
  if (/^\d{8,25}$/.test(id || "")) return { href: url.toString(), handle: user, embed: { src: tiktokPlayerUrl(id, false), height: null, aspect: "9 / 16" } }
  return user && /^@[A-Za-z0-9._]{1,40}$/.test(user) ? { href: url.toString(), handle: user } : null
}

const x: Parser = (url) => {
  if (!["x.com", "twitter.com"].includes(bare(url))) return null
  const embed = fromEmbedKind(url, "x")
  const p = partsOf(url)
  const handle = p[0] && /^[A-Za-z0-9_]{1,15}$/.test(p[0]) ? `@${p[0]}` : null
  if (embed) return { href: url.toString(), embed, handle }
  return handle && p.length === 1 ? { href: url.toString(), handle } : null
}

const threads: Parser = (url) => {
  if (!["threads.net", "threads.com"].includes(bare(url))) return null
  const p = partsOf(url)
  const user = p[0]?.startsWith("@") && /^@[A-Za-z0-9._]{1,30}$/.test(p[0]) ? p[0] : null
  if (!user) return null
  if (p[1] === "post" && p[2] && /^[A-Za-z0-9_-]{5,20}$/.test(p[2])) {
    return { href: url.toString(), handle: user, embed: { src: `https://www.threads.net/${user}/post/${p[2]}/embed`, height: 520 } }
  }
  return { href: url.toString(), handle: user }
}

const facebook: Parser = (url) => {
  if (!["facebook.com", "fb.watch", "fb.com"].includes(bare(url))) return null
  const p = partsOf(url)
  const clean = `https://www.facebook.com${url.pathname}${url.searchParams.get("v") ? `?v=${url.searchParams.get("v")}` : ""}`
  const enc = encodeURIComponent(clean)
  if (bare(url) === "fb.watch") return { href: url.toString() }
  if (p.includes("videos") || p[0] === "watch" || p[0] === "reel") {
    const tall = p[0] === "reel"
    return { href: url.toString(), embed: { src: `https://www.facebook.com/plugins/video.php?href=${enc}&show_text=false&width=500`, height: null, aspect: tall ? "9 / 16" : "16 / 9" } }
  }
  if (p.includes("posts") || p[0] === "permalink.php") {
    return { href: url.toString(), handle: handleFrom(url, 0, ""), embed: { src: `https://www.facebook.com/plugins/post.php?href=${enc}&show_text=true&width=500`, height: 560 } }
  }
  return p.length >= 1 && SAFE_ID.test(p[0]) ? { href: url.toString(), handle: p[0] === "profile.php" ? null : p[0] } : null
}

const snapchat: Parser = (url) => {
  if (bare(url) !== "snapchat.com") return null
  const p = partsOf(url)
  if (p[0] === "add" && p[1] && SAFE_ID.test(p[1])) return { href: url.toString(), handle: `@${p[1]}` }
  if (p[0]?.startsWith("@")) return { href: url.toString(), handle: p[0] }
  return p.length ? { href: url.toString() } : null
}

const pinterest: Parser = (url) => {
  const host = bare(url)
  if (host === "pin.it") return { href: url.toString() }
  if (!/^([a-z]{2}\.)?pinterest\.[a-z.]{2,6}$/.test(host)) return null
  const p = partsOf(url)
  if (p[0] === "pin" && /^\d{5,25}$/.test(p[1] || "")) {
    return { href: url.toString(), embed: { src: `https://assets.pinterest.com/ext/embed.html?id=${p[1]}`, height: 600 } }
  }
  return p.length && SAFE_ID.test(p[0]) ? { href: url.toString(), handle: p.length === 1 ? `@${p[0]}` : `${p[0]}/${p[1]}` } : null
}

const twitch: Parser = (url) => {
  if (!["twitch.tv", "clips.twitch.tv"].includes(bare(url))) return null
  const embed = fromEmbedKind(url, "twitch")
  const p = partsOf(url)
  const handle = bare(url) === "twitch.tv" && p[0] && /^[A-Za-z0-9_]{3,25}$/.test(p[0]) && p[0] !== "videos" ? p[0] : null
  if (embed) return { href: url.toString(), embed, handle }
  return handle ? { href: url.toString(), handle } : null
}

const reddit: Parser = (url) => {
  if (!["reddit.com", "old.reddit.com", "new.reddit.com"].includes(bare(url))) return null
  const p = partsOf(url)
  if (p[0] === "r" && p[2] === "comments" && /^[a-z0-9]{4,12}$/i.test(p[3] || "") && SAFE_ID.test(p[1] || "")) {
    const slug = p[4] && SAFE_ID.test(p[4]) ? `${p[4]}/` : ""
    return { href: url.toString(), handle: `r/${p[1]}`, embed: { src: `https://embed.reddit.com/r/${p[1]}/comments/${p[3]}/${slug}?embed=true&showmedia=true`, height: 460 } }
  }
  if ((p[0] === "u" || p[0] === "user") && p[1] && SAFE_ID.test(p[1])) return { href: url.toString(), handle: `u/${p[1]}` }
  if (p[0] === "r" && p[1] && SAFE_ID.test(p[1])) return { href: url.toString(), handle: `r/${p[1]}` }
  return null
}

const audiomack: Parser = (url) => {
  if (bare(url) !== "audiomack.com") return null
  const p = partsOf(url)
  if (!p[0] || !SAFE_ID.test(p[0])) return null
  const kind = p[1]
  if ((kind === "song" || kind === "album" || kind === "playlist") && p[2] && SAFE_ID.test(p[2])) {
    return { href: url.toString(), handle: p[0], embed: { src: `https://audiomack.com/embed/${kind}/${p[0]}/${p[2]}`, height: kind === "song" ? 252 : 400 } }
  }
  return { href: url.toString(), handle: p[0] }
}

const podcasts: Parser = (url) => {
  const apple = fromEmbedKind(url, "podcasts")
  if (apple) return { href: url.toString(), embed: apple }
  const host = bare(url)
  if (host === "open.spotify.com") {
    const s = musicSource(url.toString())
    if (s && /\/(show|episode)\//.test(url.pathname)) return { href: url.toString(), embed: { src: s.embedUrl, height: s.height } }
    return null
  }
  /* Any other podcast's page (Overcast, Pocket Casts, a show's own site) is a link to it. */
  return host.includes(".") ? { href: url.toString() } : null
}

const typeform: Parser = (url) => {
  const embed = fromEmbedKind(url, "typeform")
  return embed ? { href: url.toString(), embed } : null
}

const discord: Parser = (url) => {
  const host = bare(url)
  const p = partsOf(url)
  if (host === "discord.gg" && p[0] && SAFE_ID.test(p[0])) return { href: url.toString(), handle: p[0] }
  if ((host === "discord.com" || host === "discordapp.com") && p[0] === "invite" && p[1] && SAFE_ID.test(p[1])) return { href: url.toString(), handle: p[1] }
  return null
}

const whatsappGroup: Parser = (url) => {
  const host = bare(url)
  const p = partsOf(url)
  if (host === "chat.whatsapp.com" && p[0] && SAFE_ID.test(p[0])) return { href: url.toString() }
  if (host === "whatsapp.com" && p[0] === "channel" && p[1]) return { href: url.toString() }
  if (host === "t.me" && p[0] && SAFE_ID.test(p[0].replace(/^\+/, ""))) return { href: url.toString(), handle: p[0].startsWith("+") ? null : `@${p[0]}` }
  return null
}

const cameo: Parser = (url) => (bare(url) === "cameo.com" && partsOf(url)[0] && SAFE_ID.test(partsOf(url)[0]) ? { href: url.toString(), handle: `@${partsOf(url)[0]}` } : null)
const bonfire: Parser = (url) => (bare(url) === "bonfire.com" && partsOf(url).length ? { href: url.toString() } : null)
const amazon: Parser = (url) => (/^(amazon\.[a-z.]{2,6}|a\.co|amzn\.to)$/.test(bare(url)) ? { href: url.toString() } : null)
const appStore: Parser = (url) => (bare(url) === "apps.apple.com" ? { href: url.toString() } : null)
const googlePlay: Parser = (url) => (bare(url) === "play.google.com" && url.pathname.startsWith("/store/apps") ? { href: url.toString() } : null)

const googleReviews: Parser = (url) => {
  const host = bare(url)
  if (host === "maps.app.goo.gl" || host === "g.page" || host === "g.co" || host === "goo.gl") return { href: url.toString() }
  if ((host === "google.com" || /^google\.[a-z.]{2,6}$/.test(host) || host === "search.google.com") && (url.pathname.startsWith("/maps") || url.pathname.startsWith("/local") || url.pathname.startsWith("/search"))) return { href: url.toString() }
  return null
}

/**
 * Round AR. Luma: an event's or a calendar's own embed (the address under
 * Share › Embed in Luma), played in Luma's frame; any other Luma address is a
 * card that opens it.
 */
const luma: Parser = (url) => {
  const host = bare(url)
  if (host !== "lu.ma" && host !== "luma.com") return null
  const p = partsOf(url)
  const event = p[0] === "embed" && p[1] === "event" ? p[2] : p[0] === "event" ? p[1] : null
  if (event && /^evt-[A-Za-z0-9]{6,40}$/.test(event)) return { href: `https://lu.ma/event/${event}`, embed: { src: `https://lu.ma/embed/event/${event}/simple`, height: 450 } }
  const cal = p[0] === "embed" && p[1] === "calendar" ? p[2] : null
  if (cal && /^cal-[A-Za-z0-9]{6,40}$/.test(cal)) return { href: url.toString(), embed: { src: `https://lu.ma/embed/calendar/${cal}/events`, height: 600 } }
  return p.length ? { href: url.toString(), handle: `lu.ma/${p[0]}`.slice(0, 40) } : null
}

/** Round AR. Eventbrite: an event or an organiser's page, as a card (Eventbrite has no frame of its own to show here). */
const eventbrite: Parser = (url) => {
  const host = bare(url)
  if (!/^eventbrite\.[a-z.]{2,8}$/.test(host)) return null
  return { href: url.toString(), handle: host }
}

/** Any https page: a shop on its own domain, a feed, a tip page. */
const anyPage: Parser = (url) => ({ href: url.toString(), handle: bare(url) })

/** The tip pages people use, each with its own mark (components/onepage/brand-icons). */
export function tipService(raw: string | null | undefined): string | null {
  const url = parseAppUrl(raw)
  if (!url) return null
  const host = bare(url)
  if (host === "ko-fi.com") return "kofi"
  if (host === "buymeacoffee.com") return "buymeacoffee"
  if (host === "paypal.me" || host === "paypal.com") return "paypal"
  if (host === "cash.app") return "cashapp"
  if (host === "venmo.com" || host === "account.venmo.com") return "venmo"
  if (host === "patreon.com") return "patreon"
  return null
}

/* ─── The providers ──────────────────────────────────────────────────── */

export type AppShape =
  /** A profile, with posts that can be embedded (Instagram, TikTok, X...). */
  | "social"
  /** A player (a song, an episode) or a form. */
  | "player"
  /** A page somewhere else (a shop, a server, a feed). */
  | "link"
  /** A list the creator types: products, books, events, stats. */
  | "items"
  | "events"
  | "stats"
  | "poll"
  | "contact"
  | "app"
  | "note"
  | "email"
  | "reviews"
  /** Round AR: one event with RSVP and tickets. */
  | "event"
  /** Round AR: content behind a payment. */
  | "paid"
  /** Round AR: the store's reviews, or a Trustpilot or Google widget. */
  | "review_wall"

export const APP_PROVIDER_IDS = [
  "instagram",
  "tiktok",
  "x",
  "threads",
  "facebook",
  "snapchat",
  "pinterest",
  "twitch",
  "reddit",
  "rss",
  "cameo",
  "google_reviews",
  "audiomack",
  "podcasts",
  "typeform",
  "discord",
  "whatsapp_group",
  "bonfire",
  "fourthwall",
  "books",
  "affiliate",
  "tips",
  "mobile_app",
  "events",
  "stats",
  "poll",
  "contact",
  "email",
  "note",
  "event",
  "luma",
  "eventbrite",
  "paid",
  "reviews",
] as const
export type AppProviderId = (typeof APP_PROVIDER_IDS)[number]

export interface AppProvider {
  id: AppProviderId
  /** The service's own name (never translated), or null for a block of ours (its name is translated where it is drawn). */
  brand: string | null
  shape: AppShape
  /** The mark (components/onepage/brand-icons AppMark), and the colour its round tile is filled with. */
  mark: string
  color: string
  layouts: readonly AppLayout[]
  layout: AppLayout
  /** What a tap does before the creator chooses. A player opens in a sheet; a page is gone to. */
  open: AppOpenMode
  /** The example in the address field. */
  placeholder?: string
  parse?: Parser
}

const SOCIAL_LAYOUTS = ["classic", "card", "profile", "single", "carousel"] as const
const PLAYER_LAYOUTS = ["classic", "card", "single"] as const
const LINK_LAYOUTS = ["classic", "card", "profile", "featured"] as const
const ITEM_LAYOUTS = ["grid", "carousel", "card", "classic"] as const

/* i18n-ignore-start: services' names, colours and example addresses. */
export const APP_PROVIDERS: Record<AppProviderId, AppProvider> = {
  instagram: { id: "instagram", brand: "Instagram", shape: "social", mark: "instagram", color: "instagram", layouts: SOCIAL_LAYOUTS, layout: "profile", open: "sheet", placeholder: "https://instagram.com/yourname", parse: instagram },
  tiktok: { id: "tiktok", brand: "TikTok", shape: "social", mark: "tiktok", color: "#000000", layouts: SOCIAL_LAYOUTS, layout: "profile", open: "sheet", placeholder: "https://tiktok.com/@yourname", parse: tiktok },
  x: { id: "x", brand: "X", shape: "social", mark: "twitter", color: "#000000", layouts: SOCIAL_LAYOUTS, layout: "profile", open: "sheet", placeholder: "https://x.com/yourname", parse: x },
  threads: { id: "threads", brand: "Threads", shape: "social", mark: "threads", color: "#000000", layouts: SOCIAL_LAYOUTS, layout: "profile", open: "sheet", placeholder: "https://threads.net/@yourname", parse: threads },
  facebook: { id: "facebook", brand: "Facebook", shape: "social", mark: "facebook", color: "#0866FF", layouts: SOCIAL_LAYOUTS, layout: "card", open: "sheet", placeholder: "https://facebook.com/yourpage", parse: facebook },
  snapchat: { id: "snapchat", brand: "Snapchat", shape: "link", mark: "snapchat", color: "#FFFC00", layouts: LINK_LAYOUTS, layout: "profile", open: "direct", placeholder: "https://snapchat.com/add/yourname", parse: snapchat },
  pinterest: { id: "pinterest", brand: "Pinterest", shape: "social", mark: "pinterest", color: "#E60023", layouts: SOCIAL_LAYOUTS, layout: "card", open: "sheet", placeholder: "https://pinterest.com/yourname", parse: pinterest },
  twitch: { id: "twitch", brand: "Twitch", shape: "social", mark: "twitch", color: "#9146FF", layouts: SOCIAL_LAYOUTS, layout: "single", open: "sheet", placeholder: "https://twitch.tv/yourchannel", parse: twitch },
  reddit: { id: "reddit", brand: "Reddit", shape: "social", mark: "reddit", color: "#FF4500", layouts: SOCIAL_LAYOUTS, layout: "card", open: "sheet", placeholder: "https://reddit.com/user/yourname", parse: reddit },
  rss: { id: "rss", brand: "RSS", shape: "link", mark: "rss", color: "#F26522", layouts: LINK_LAYOUTS, layout: "card", open: "direct", placeholder: "https://yoursite.com/feed.xml", parse: anyPage },
  cameo: { id: "cameo", brand: "Cameo", shape: "link", mark: "cameo", color: "#141414", layouts: LINK_LAYOUTS, layout: "card", open: "direct", placeholder: "https://cameo.com/yourname", parse: cameo },
  google_reviews: { id: "google_reviews", brand: "Google", shape: "reviews", mark: "google", color: "#ffffff", layouts: ["card", "classic", "featured"], layout: "card", open: "direct", placeholder: "https://maps.app.goo.gl/...", parse: googleReviews },
  audiomack: { id: "audiomack", brand: "Audiomack", shape: "player", mark: "audiomack", color: "#FFA200", layouts: PLAYER_LAYOUTS, layout: "single", open: "sheet", placeholder: "https://audiomack.com/artist/song/name", parse: audiomack },
  podcasts: { id: "podcasts", brand: null, shape: "player", mark: "apple-podcasts", color: "#9933CC", layouts: PLAYER_LAYOUTS, layout: "single", open: "sheet", placeholder: "https://podcasts.apple.com/...", parse: podcasts },
  typeform: { id: "typeform", brand: "Typeform", shape: "player", mark: "typeform", color: "#262627", layouts: PLAYER_LAYOUTS, layout: "classic", open: "sheet", placeholder: "https://form.typeform.com/to/...", parse: typeform },
  discord: { id: "discord", brand: "Discord", shape: "link", mark: "discord", color: "#5865F2", layouts: LINK_LAYOUTS, layout: "card", open: "direct", placeholder: "https://discord.gg/invite", parse: discord },
  whatsapp_group: { id: "whatsapp_group", brand: null, shape: "link", mark: "whatsapp", color: "#25D366", layouts: LINK_LAYOUTS, layout: "card", open: "direct", placeholder: "https://chat.whatsapp.com/...", parse: whatsappGroup },
  bonfire: { id: "bonfire", brand: "Bonfire", shape: "items", mark: "bonfire", color: "#FF5A36", layouts: ITEM_LAYOUTS, layout: "grid", open: "direct", placeholder: "https://bonfire.com/store/yourstore", parse: bonfire },
  fourthwall: { id: "fourthwall", brand: "Fourthwall", shape: "items", mark: "fourthwall", color: "#111113", layouts: ITEM_LAYOUTS, layout: "grid", open: "direct", placeholder: "https://yourshop.fourthwall.com", parse: anyPage },
  books: { id: "books", brand: null, shape: "items", mark: "amazon", color: "#FF9900", layouts: ITEM_LAYOUTS, layout: "carousel", open: "direct", placeholder: "https://amazon.com/dp/...", parse: amazon },
  affiliate: { id: "affiliate", brand: null, shape: "items", mark: "tag", color: "#16A34A", layouts: ITEM_LAYOUTS, layout: "grid", open: "direct", placeholder: "https://", parse: anyPage },
  tips: { id: "tips", brand: null, shape: "link", mark: "tip", color: "#D6EF48", layouts: ["classic", "card", "featured"], layout: "card", open: "direct", placeholder: "https://ko-fi.com/yourname", parse: anyPage },
  mobile_app: { id: "mobile_app", brand: null, shape: "app", mark: "phone", color: "#2563EB", layouts: ["card", "classic", "featured"], layout: "card", open: "direct" },
  events: { id: "events", brand: null, shape: "events", mark: "ticket", color: "#F43F5E", layouts: ["classic", "card", "carousel"], layout: "classic", open: "direct" },
  stats: { id: "stats", brand: null, shape: "stats", mark: "stats", color: "#0EA5E9", layouts: ["grid", "carousel", "single"], layout: "grid", open: "direct" },
  poll: { id: "poll", brand: null, shape: "poll", mark: "poll", color: "#F59E0B", layouts: ["card"], layout: "card", open: "direct" },
  contact: { id: "contact", brand: null, shape: "contact", mark: "contact", color: "#0F766E", layouts: ["card", "classic", "profile"], layout: "card", open: "sheet" },
  email: { id: "email", brand: null, shape: "email", mark: "mail", color: "#EA580C", layouts: ["classic", "card"], layout: "classic", open: "direct" },
  note: { id: "note", brand: null, shape: "note", mark: "text", color: "#E9DDF7", layouts: ["card", "classic"], layout: "card", open: "direct" },
  /* Round AR */
  event: { id: "event", brand: null, shape: "event", mark: "ticket", color: "#F43F5E", layouts: ["card", "featured", "classic"], layout: "card", open: "direct" },
  luma: { id: "luma", brand: "Luma", shape: "player", mark: "ticket", color: "#111113", layouts: PLAYER_LAYOUTS, layout: "single", open: "sheet", placeholder: "https://lu.ma/embed/event/evt-.../simple", parse: luma },
  eventbrite: { id: "eventbrite", brand: "Eventbrite", shape: "link", mark: "ticket", color: "#F05537", layouts: LINK_LAYOUTS, layout: "card", open: "direct", placeholder: "https://www.eventbrite.com/e/...", parse: eventbrite },
  paid: { id: "paid", brand: null, shape: "paid", mark: "lock", color: "#1a1a2e", layouts: ["card", "classic"], layout: "card", open: "direct" },
  reviews: { id: "reviews", brand: null, shape: "review_wall", mark: "star", color: "#F59E0B", layouts: ["classic", "carousel", "grid", "card"], layout: "carousel", open: "direct" },
}
/* i18n-ignore-end */

export function isAppProvider(v: unknown): v is AppProviderId {
  return typeof v === "string" && (APP_PROVIDER_IDS as readonly string[]).includes(v)
}

export function providerOf(data: Partial<AppBlockData> | null | undefined): AppProvider {
  return APP_PROVIDERS[isAppProvider(data?.provider) ? data!.provider : "note"]
}

/**
 * Round AR: services taken out of the Add block sheet. A block saved with one
 * keeps its data and is drawn as a plain link to its address (and to each of
 * its items), so no page loses what it showed and nothing is rewritten.
 */
export const RETIRED_APP_PROVIDERS: readonly AppProviderId[] = ["bonfire", "fourthwall"]
export function isRetiredAppProvider(id: unknown): boolean {
  return (RETIRED_APP_PROVIDERS as readonly unknown[]).includes(id)
}

/** The layout a block is drawn in: its own when the provider offers it, the provider's otherwise. */
export function appLayoutOf(data: Partial<AppBlockData> | null | undefined): AppLayout {
  const p = providerOf(data)
  const l = data?.layout
  return l && (p.layouts as readonly string[]).includes(l) ? l : p.layout
}

/** What a tap does: the creator's choice, the provider's default otherwise. */
export function appOpenModeOf(data: Partial<AppBlockData> | null | undefined): AppOpenMode {
  const m = data?.open_mode
  return m === "sheet" || m === "direct" ? m : providerOf(data).open
}

/** The block's address read by its provider, or null when it has none it takes. */
export function appTarget(data: Partial<AppBlockData> | null | undefined): AppTarget | null {
  const p = providerOf(data)
  /* A handle saved as typed ("@ana", from before the field read handles) is still its profile. */
  const url = parseAppUrl(appAddressFromInput(p.id, data?.url ?? "").url)
  if (!url || !p.parse) return null
  return p.parse(url)
}

/** Whether the address field holds something the provider cannot take (empty is fine: not yet typed). */
export function appUrlProblem(data: Partial<AppBlockData> | null | undefined): boolean {
  const raw = (data?.url || "").trim()
  if (!raw) return false
  return appTarget(data) === null
}

/* ─── The address field: a handle or a link ─────────────────────────────── */

/**
 * The services whose address field takes a handle as well as a link
 * ("@ana", "ana", "instagram.com/ana", a post's whole address), each with
 * the platform its handle rules come from (./social-input).
 */
const HANDLE_PLATFORM: Record<string, string> = { instagram: "instagram", tiktok: "tiktok", x: "twitter", threads: "threads" }

export function appTakesHandle(providerId: string | null | undefined): boolean {
  return !!providerId && Object.prototype.hasOwnProperty.call(HANDLE_PLATFORM, providerId)
}

/**
 * What was typed or pasted in the address field, as the address to save.
 * A handle (with or without its @) becomes the profile's address; a link,
 * a post or reel included, is kept as it was pasted with https:// in front.
 * `valid` is false when it looked like a handle and was not a valid one.
 */
export function appAddressFromInput(providerId: string | null | undefined, raw: string): { url: string; valid: boolean } {
  const typed = String(raw ?? "").trim()
  if (!typed || !providerId || !appTakesHandle(providerId)) return { url: typed, valid: true }
  const platform = HANDLE_PLATFORM[providerId]
  if (/[/:]/.test(typed) || /^(www\.|m\.)/i.test(typed)) {
    const link = /^https?:\/\//i.test(typed) ? typed.replace(/^http:\/\//i, "https://") : `https://${typed}`
    /* A profile's link is made plain (no www., no tracking, no trailing slash); a post or reel is kept whole, so it can play. */
    const u = parseAppUrl(link)
    if (u && u.pathname.split("/").filter(Boolean).length === 1) {
      const parsed = parseSocialInput(platform, link)
      if (parsed.ok) return { url: parsed.url, valid: true }
    }
    return { url: link, valid: true }
  }
  const parsed = parseSocialInput(platform, typed)
  return parsed.ok ? { url: parsed.url, valid: true } : { url: typed, valid: false }
}

/** The address as the field shows it: "@ana" for a profile, the whole link for anything else. */
export function appAddressShown(providerId: string | null | undefined, saved: string | null | undefined): string {
  const value = String(saved ?? "").trim()
  if (!value || !providerId || !appTakesHandle(providerId)) return value
  const field = socialFieldValue(HANDLE_PLATFORM[providerId], appAddressFromInput(providerId, value).url)
  return field && !/[/:]/.test(field) ? `@${field.replace(/^@/, "")}` : value
}

export const APP_POSTS_MAX = 8

/** The posts a block plays, its own address first when that is a post, each once, at most eight. */
export function appEmbeds(data: Partial<AppBlockData> | null | undefined): { href: string; embed: AppEmbed }[] {
  const p = providerOf(data)
  if (!p.parse) return []
  const out: { href: string; embed: AppEmbed }[] = []
  const seen = new Set<string>()
  for (const raw of [data?.url, ...(Array.isArray(data?.posts) ? data!.posts! : [])]) {
    const url = parseAppUrl(typeof raw === "string" ? raw : "")
    const t = url ? p.parse(url) : null
    if (!t?.embed || seen.has(t.embed.src)) continue
    seen.add(t.embed.src)
    out.push({ href: t.href, embed: t.embed })
    if (out.length >= APP_POSTS_MAX) break
  }
  return out
}

export const APP_ITEMS_MAX = 12

/** The list a block shows, with the rows that have nothing to show left out. */
export function appItems(data: Partial<AppBlockData> | null | undefined): AppItem[] {
  const shape = providerOf(data).shape
  const raw = Array.isArray(data?.items) ? data!.items! : []
  return raw
    .filter((i) => i && typeof i === "object" && typeof i.id === "string")
    .filter((i) => (shape === "stats" ? !!i.value?.trim() && !!i.title?.trim() : !!i.title?.trim()))
    .slice(0, APP_ITEMS_MAX)
}

/** A safe https address of an item, or null. */
export function itemHref(item: Pick<AppItem, "url"> | null | undefined): string | null {
  const url = parseAppUrl(item?.url)
  return url ? url.toString() : null
}

/** The poll's options with words, at most six. */
export function pollOptions(data: Partial<AppBlockData> | null | undefined): AppPollOption[] {
  const raw = Array.isArray(data?.poll_options) ? data!.poll_options! : []
  return raw.filter((o) => o && typeof o.id === "string" && typeof o.label === "string" && o.label.trim()).slice(0, 6)
}

const EMAIL = /^[^\s@<>"']{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,24}$/i

export function appEmail(raw: string | null | undefined): string | null {
  const t = (raw || "").trim()
  return EMAIL.test(t) ? t : null
}

/** The mobile app's two store pages, each only when it is that store's own address. */
export function appStores(data: Partial<AppBlockData> | null | undefined): { ios: string | null; android: string | null } {
  const ios = parseAppUrl(data?.ios_url)
  const android = parseAppUrl(data?.android_url)
  return { ios: ios && appStore(ios) ? ios.toString() : null, android: android && googlePlay(android) ? android.toString() : null }
}

/** A Google rating as typed: between 1 and 5, one decimal. */
export function appRating(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : NaN
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n * 10) / 10 : null
}

/** Is there anything to draw? An empty app block is left out of the live page, so it leaves no gap. */
export function appBlockHasContent(block: { type: string; data?: unknown }): boolean {
  const d = (block.data ?? {}) as Partial<AppBlockData>
  const p = providerOf(d)
  switch (p.shape) {
    case "items":
      /* A shop with nothing listed yet is still a card to the shop. */
      return appItems(d).length > 0 || appTarget(d) !== null
    case "events":
    case "stats":
      return appItems(d).length > 0
    case "poll":
      return !!d.poll_question?.trim() && pollOptions(d).length >= 2
    case "contact": {
      const c = d.contact || {}
      return !!(c.name?.trim() && (c.phone?.trim() || appEmail(c.email) || parseAppUrl(c.website)))
    }
    case "app": {
      const s = appStores(d)
      return !!(s.ios || s.android)
    }
    case "email":
      return appEmail(d.email) !== null
    case "note":
      return !!(d.title?.trim() || d.text?.trim())
    /* Round AR */
    case "event":
      return !!d.title?.trim() && !Number.isNaN(Date.parse(d.event_start || ""))
    case "paid":
      /* The server says once the product is read (paid_ready); before that a product is enough. */
      return !!d.paid_product_id && d.paid_ready !== false
    case "review_wall":
      if (d.review_source === "trustpilot") return !!d.trustbox?.trim()
      if (d.review_source === "google") return appTarget({ ...d, provider: "google_reviews" }) !== null
      /* The store's own reviews: drawn once the server found some, or before it was asked (the preview). */
      return !Array.isArray(d.review_items) || d.review_items.length > 0
    default:
      if (p.id === "tips") return d.tip_mode === "storelib" || (!d.tip_mode && !d.url?.trim()) ? d.tip_ready !== false : appTarget(d) !== null
      return appTarget(d) !== null
  }
}

/* ─── Contact details: a card a phone saves ──────────────────────────── */

const vEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1")

/** The contact as a vCard 3.0, which every phone's contacts app opens. */
export function contactVCard(c: AppContact | null | undefined): string {
  const name = (c?.name || "").trim().slice(0, 120)
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${vEscape(name)}`]
  const parts = name.split(/\s+/)
  lines.push(`N:${vEscape(parts.length > 1 ? parts.slice(-1)[0] : name)};${vEscape(parts.length > 1 ? parts.slice(0, -1).join(" ") : "")};;;`)
  if (c?.org?.trim()) lines.push(`ORG:${vEscape(c.org.trim().slice(0, 120))}`)
  const phone = (c?.phone || "").replace(/[^\d+]/g, "").slice(0, 20)
  if (phone) lines.push(`TEL;TYPE=CELL:${phone}`)
  const email = appEmail(c?.email)
  if (email) lines.push(`EMAIL;TYPE=INTERNET:${email}`)
  const site = parseAppUrl(c?.website)
  if (site) lines.push(`URL:${site.toString()}`)
  if (c?.address?.trim()) lines.push(`ADR;TYPE=WORK:;;${vEscape(c.address.trim().slice(0, 240))};;;;`)
  lines.push("END:VCARD")
  return lines.join("\r\n") + "\r\n"
}

/* ─── Events ─────────────────────────────────────────────────────────── */

/** The day of an event as its two parts ("NOV", "14"), in the visitor's language; null for a day that cannot be read. */
export function eventDay(date: string | null | undefined, locale = "en"): { month: string; day: string } | null {
  const m = (date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(d.getTime())) return null
  return { month: d.toLocaleString(locale, { month: "short", timeZone: "UTC" }).replace(".", "").toUpperCase(), day: String(d.getUTCDate()) }
}

/** Events in date order; one whose day has passed is left out of the page. */
export function upcomingEvents(items: AppItem[], today: string = new Date().toISOString().slice(0, 10)): AppItem[] {
  return items
    .filter((i) => !i.date || !/^\d{4}-\d{2}-\d{2}$/.test(i.date) || i.date >= today)
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
}

/* ─── The frames these embeds load from ──────────────────────────────── */

/** Every host an app block's frame loads from that the embed block does not already use (lib/security/csp.ts frame-src). */
export const APP_FRAME_HOSTS = [
  "https://www.threads.net",
  "https://www.facebook.com",
  "https://assets.pinterest.com",
  "https://embed.reddit.com",
  "https://audiomack.com",
  /* Round AR: Luma's event and calendar embeds, and Trustpilot's TrustBox. */
  "https://lu.ma",
  "https://widget.trustpilot.com",
] as const

/** A new block's data, for a provider. */
export function appBlockDefaults(provider: AppProviderId): AppBlockData {
  const base: AppBlockData = { provider, url: "", title: "", subtitle: "", button_text: "" }
  if (provider === "poll") return { ...base, poll_question: "", poll_options: [{ id: "a", label: "" }, { id: "b", label: "" }] }
  if (provider === "events" || provider === "stats" || provider === "books" || provider === "affiliate" || provider === "bonfire" || provider === "fourthwall") return { ...base, items: [{ id: `i_${Date.now().toString(36)}` }] }
  if (provider === "contact") return { ...base, contact: {} }
  /* Round AR */
  if (provider === "tips") return { ...base, tip_mode: "storelib", tip_amounts: [300, 500, 1000], tip_custom: true }
  if (provider === "event") return { ...base, rsvp: true, event_start: null, venue: "" }
  if (provider === "paid") return { ...base, paid_product_id: null, locked_text: "", locked_url: "" }
  if (provider === "reviews") return { ...base, review_source: "storelib", layout: "carousel" }
  return base
}
