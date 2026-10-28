"use client"

/**
 * ===========================================================================
 *  ADD BLOCK: WHAT A ONEPAGE CAN HOLD, FOUND IN A SECOND
 * ===========================================================================
 * The sheet (a phone) or dialog (a computer) that + Add opens, drawn inside
 * links-tab's SheetDialog. It was eight categories of rows with a share
 * arrow beside half of them, the same Instagram row in three places, two
 * "Coming soon" rows that could not be pressed, and coloured brand marks
 * next to grey icons. Now:
 *
 *   SEARCH      one field, matching a block's name, its line and the words
 *               people use for it ("newsletter" finds Email signup).
 *   RECENT      the last four blocks this person added, first, on this
 *               browser only.
 *   CATEGORIES  Essentials, Sell, Media, Grow, Integrations and Links, as
 *               chips: one press shows that category alone, All shows them
 *               all in that order.
 *   ROWS        one icon set (./block-icons) on one grey tile, brand marks
 *               in the same near black, a name and one line saying what it
 *               does. Two columns from 640px.
 *
 * The integrations are real: YouTube, TikTok and Vimeo play in the video
 * block; Spotify, Apple Music and SoundCloud in the music block; Instagram
 * and X posts, Twitch, Loom, Apple Podcasts, Bandcamp, Mixcloud, Typeform,
 * Google Forms, Tally, Substack and Google Calendar in the embed block, each
 * in the service's own public embed (lib/onepage/creator-blocks
 * embedSource, every host in lib/security/csp.ts); Calendly and Cal.com open
 * in the booking block; and Klaviyo or Omnisend receive every signup through
 * Settings › Integrations (lib/integrations/marketing). Nothing here asks
 * for a key, so nothing here pretends to "connect".
 *
 * ROUND 11, THE FEEL: the open renders the sheet and nothing else (the open
 * state is a store here, not the Links tab's), the rows are built once and
 * never render again, a chip only hides sections, the chips are the app
 * settings' pills, a row's press is a tint with no scale, brand marks are in
 * their own colours, and the + turns a little under a mouse and never under
 * a finger.
 */

import * as React from "react"
import { Plus, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SocialIcon } from "@/components/onepage/brand-icons"
import { EXTRA_BLOCK_CATALOG } from "@/components/onepage/extra-blocks"
import {
  BlockTile,
  GlyphBooking,
  GlyphContact,
  GlyphDivider,
  GlyphDocument,
  GlyphEmail,
  GlyphGroup,
  GlyphImage,
  GlyphIntegration,
  GlyphLink,
  GlyphMenu,
  GlyphPodcast,
  GlyphProduct,
  GlyphSocial,
  GlyphStore,
  GlyphSync,
  GlyphText,
  type Glyph,
} from "@/components/onepage/block-icons"
import type { OnePageBlockType } from "@/lib/onepage/types"
import { canGoInGroup } from "@/lib/onepage/group"
import { tt } from "@/lib/i18n/text"
import { PillTabs } from "@/components/onepage/pill-tabs"
import { landContent } from "@/lib/ui/pill-switch"
import { tintOf } from "@/components/onepage/block-tints"

/* ─── The + on + Add ──────────────────────────────────────────────────── */

/**
 * THE + TURNS A LITTLE, AND ONLY UNDER A MOUSE.
 * Round 10 turned it a full circle on hover and rested it at 405 while the
 * sheet was up: "it rotates too much", and on a phone the tap that opened
 * the sheet set it spinning. Now:
 *
 *   TOUCH       it never turns. Not on the tap, not while the sheet is up,
 *               not when it closes. A finger gets the button's own press.
 *   MOUSE       a quarter turn under the pointer (90, still a +), and on to
 *               135 while the sheet it opened is up (an x), so a click from
 *               a hover goes on forward by 45 rather than back.
 *
 * One property (`rotate`, on the compositor), one curve and one time
 * (ADD_PLUS_MS on ADD_PLUS_EASE) for every move. Both turns sit behind
 * (hover: hover) and (pointer: fine) (`pointer-fine:` and `hover:` in
 * app/globals.css), so a phone never matches either.
 * Under reduced motion it does not move at all.
 */
export const ADD_PLUS_MS = 280
export const ADD_PLUS_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

export function AddBlockPlus({ open }: { open: boolean }) {
  return (
    <Plus
      aria-hidden
      data-add-plus={open ? "open" : ""}
      className={cn(
        "h-5 w-5 shrink-0 rotate-0 transition-[rotate] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none motion-reduce:!rotate-0",
        /*
          app/globals.css's own variants: `pointer-fine:` is (hover: hover) and
          (pointer: fine), and every `hover:` (group-hover too) asks the same.
          Round 10 wrote these as `[@media(hover:hover)_and_(pointer:fine)]:`,
          an arbitrary variant Tailwind never generated, so the hover turn
          never existed and the open's 405 turned under a finger as well.
        */
        open ? "pointer-fine:rotate-[135deg]" : "group-hover/add:rotate-90",
      )}
      strokeWidth={2.25}
    />
  )
}

/* ─── Whether the sheet is up, outside the Links tab ───────────────────── */

/**
 * OPENING THE SHEET RENDERS THE SHEET, NOT THE LINKS TAB.
 * The open state was a useState of LinksTab, so the tap on + Add rendered
 * the whole tab again: every block card in the list, their badges and
 * menus, before the sheet's first frame could move. Measured at 390 with
 * the CPU slowed four times (scripts/check-onepage-addblock-r11.mjs): about
 * half the script of that tap was the list nobody was looking at. Now the
 * state lives here, in a store of its own, and only what reads it renders
 * when it changes: the sheet (AddSheetGate), the + Add button and its +.
 * Where the sheet adds (after a card, into a group) stays LinksTab's.
 */
let addSheetOpen = false
const addSheetListeners = new Set<() => void>()
const addSheetSubscribe = (fn: () => void) => {
  addSheetListeners.add(fn)
  return () => { addSheetListeners.delete(fn) }
}
const addSheetSnapshot = () => addSheetOpen
const addSheetServer = () => false

export function isAddSheetOpen(): boolean {
  return addSheetOpen
}

export function setAddSheetOpen(open: boolean): void {
  if (addSheetOpen === open) return
  addSheetOpen = open
  for (const fn of addSheetListeners) fn()
}

export function useAddSheetOpen(): boolean {
  return React.useSyncExternalStore(addSheetSubscribe, addSheetSnapshot, addSheetServer)
}

/** Renders its child with whether the sheet is up; the only part of the Links tab that renders when it opens or closes. */
export function AddSheetGate({ children }: { children: (open: boolean) => React.ReactNode }) {
  return <>{children(useAddSheetOpen())}</>
}

/**
 * + Add itself. `fromButton` is LinksTab's: no card or group is waiting for
 * the block, so the sheet that is up is this button's, and its + shows it.
 */
export function AddBlockButton({ fromButton, className, onPress, children }: { fromButton: boolean; className?: string; onPress: () => void; children: React.ReactNode }) {
  const open = useAddSheetOpen() && fromButton
  return (
    <button type="button" data-add-block="" aria-expanded={open} onClick={onPress} className={cn("group/add", className)}>
      <AddBlockPlus open={open} />
      {children}
    </button>
  )
}

/* ─── The catalogue ───────────────────────────────────────────────────── */

export type PickerCategory = "essentials" | "sell" | "media" | "grow" | "integrations" | "links"

export const PICKER_CATEGORIES: { id: PickerCategory; readonly label: string }[] = [
  { id: "essentials", get label() { return tt("Essentials") } },
  { id: "sell", get label() { return tt("Sell") } },
  { id: "media", get label() { return tt("Media") } },
  { id: "grow", get label() { return tt("Grow") } },
  { id: "integrations", get label() { return tt("Integrations") } },
  { id: "links", get label() { return tt("Links") } },
]

export interface PickerEntry {
  /** Stable, for the recent list. */
  id: string
  type: OnePageBlockType
  category: PickerCategory
  readonly label: string
  readonly description: string
  icon?: Glyph
  /** A brand mark (components/onepage/brand-icons), drawn in near black. */
  brand?: string
  brandIcon?: React.ComponentType<{ size?: number; color?: string; className?: string }>
  /** For a link: its first words and address. */
  preset?: { label: string; url: string; icon?: string }
  /** Anything else the new block starts with. */
  data?: Record<string, unknown>
  /** What else people call it, for the search. */
  keywords?: string
}

const link = (id: string, label: string, brand: string, preset: () => { label: string; url: string; icon?: string }, description: () => string, keywords = ""): PickerEntry => ({
  id,
  type: "link_button",
  category: "links",
  label,
  get description() { return description() },
  brand,
  get preset() { return preset() },
  keywords,
})

/* An embed block (lib/onepage/creator-blocks embedSource), started as one service: the field's hint is that service's link. */
const embed = (id: string, label: string, brand: string | null, provider: string, description: () => string, keywords = "", icon?: Glyph): PickerEntry => ({
  id,
  type: "embed",
  category: "integrations",
  label,
  get description() { return description() },
  ...(brand ? { brand } : { icon: icon ?? GlyphIntegration }),
  data: { provider },
  keywords,
})

/* i18n-ignore-start: names of services, and the English words a search also answers to (each entry's own name and line are translated). */
const BRAND = { booking: "Calendly / Cal.com", email: "Klaviyo / Omnisend", threads: "Threads", applemusic: "Apple Music", podcasts: "Apple Podcasts", gforms: "Google Forms", gcal: "Google Calendar", bmac: "Buy Me a Coffee", cashapp: "Cash App", loom: "Loom", bandcamp: "Bandcamp", mixcloud: "Mixcloud", typeform: "Typeform", tally: "Tally", bluesky: "Bluesky", snapchat: "Snapchat", venmo: "Venmo" }
const KEYWORDS = {
  heading: "title section",
  faq: "questions answers help",
  course: "class lessons learn",
  video: "youtube vimeo tiktok watch",
  music: "spotify soundcloud apple song album playlist",
  map: "address location place google maps",
  contact_form: "message inquiry form email me",
  testimonials: "reviews quotes social proof",
  countdown: "timer launch drop",
  embed: "embed iframe widget post form player instagram twitter typeform tally google forms substack podcast twitch loom mixcloud bandcamp deezer calendar",
  link: "url button website",
  text: "paragraph bio words",
  social_row: "instagram tiktok youtube profiles",
  image: "picture photo gallery carousel",
  group: "carousel folder",
  divider: "spacer line gap",
  product: "digital download shop buy",
  coaching: "booking calendar meeting session consult calendly cal.com",
  store_link: "store etsy shopify amazon",
  pdf_document: "document guide file",
  food_menu: "restaurant cafe bar",
  email_capture: "newsletter subscribe lead magnet form",
  int_youtube: "video",
  int_spotify: "music",
  int_tiktok: "video",
  int_vimeo: "video",
  int_soundcloud: "music audio",
  int_applemusic: "music song album",
  int_booking: "booking coaching calendar cal.com",
  int_email: "newsletter email marketing list sync",
  int_instagram: "post reel embed photo",
  int_x: "twitter tweet post embed",
  int_twitch: "stream live gaming clip",
  int_loom: "video screen recording",
  int_podcasts: "podcast episode show audio",
  int_mixcloud: "dj mix radio audio",
  int_bandcamp: "music album band",
  int_typeform: "form survey quiz",
  int_gforms: "form survey quiz google",
  int_tally: "form survey",
  int_substack: "newsletter subscribe writing",
  int_gcal: "booking appointment schedule meeting google",
  x: "twitter",
  amazon: "storefront shop affiliate",
  etsy: "shop store handmade",
  kofi: "tip donate support coffee",
  bmac: "tip donate support coffee",
  paypal: "pay tip donate money",
  cashapp: "pay tip money",
  venmo: "pay tip money",
  patreon: "membership support",
  substack: "newsletter",
}
/* i18n-ignore-end */

/* One of ./extra-blocks' entries, read when it is drawn (spread, its words would be read once, at import, in English). */
const extra = (key: keyof typeof EXTRA_BLOCK_CATALOG & keyof typeof KEYWORDS, category: PickerCategory): PickerEntry => {
  const src = EXTRA_BLOCK_CATALOG[key]
  return { id: key, type: src.type, category, get label() { return src.label }, get description() { return src.description }, icon: src.icon, keywords: KEYWORDS[key] }
}

export const PICKER_ENTRIES: PickerEntry[] = [
  /* Essentials */
  { id: "link", type: "link_button", category: "essentials", get label() { return tt("Link") }, get description() { return tt("Add any web address") }, icon: GlyphLink, keywords: KEYWORDS.link },
  extra("heading", "essentials"),
  { id: "text", type: "text", category: "essentials", get label() { return tt("Text") }, get description() { return tt("A few lines about you") }, icon: GlyphText, keywords: KEYWORDS.text },
  { id: "social_row", type: "social_row", category: "essentials", get label() { return tt("Social icons") }, get description() { return tt("Your profiles as a row of icons") }, icon: GlyphSocial, keywords: KEYWORDS.social_row },
  { id: "image", type: "image", category: "essentials", get label() { return tt("Image") }, get description() { return tt("A photo or a slideshow") }, icon: GlyphImage, keywords: KEYWORDS.image },
  { id: "group", type: "group", category: "essentials", get label() { return tt("Group") }, get description() { return tt("Hold links together, stacked or sliding") }, icon: GlyphGroup, keywords: KEYWORDS.group },
  extra("faq", "essentials"),
  { id: "divider", type: "divider", category: "essentials", get label() { return tt("Divider") }, get description() { return tt("Space between blocks") }, icon: GlyphDivider, keywords: KEYWORDS.divider },

  /* Sell */
  { id: "product", type: "product", category: "sell", get label() { return tt("Product") }, get description() { return tt("Sell one of your products") }, icon: GlyphProduct, keywords: KEYWORDS.product },
  extra("course", "sell"),
  { id: "coaching", type: "calendly", category: "sell", get label() { return tt("Coaching call") }, get description() { return tt("Let people book a call with you") }, icon: GlyphBooking, get data() { return { title: tt("Book a coaching call"), button_text: tt("Book a call") } }, keywords: KEYWORDS.coaching },
  { id: "store_link", type: "link_button", category: "sell", get label() { return tt("Shop link") }, get description() { return tt("Send people to a shop of yours") }, icon: GlyphStore, get preset() { return { label: tt("Shop now"), url: "" } }, keywords: KEYWORDS.store_link },

  /* Media */
  extra("video", "media"),
  extra("music", "media"),
  extra("embed", "media"),
  { id: "pdf_document", type: "pdf_document", category: "media", get label() { return tt("PDF") }, get description() { return tt("A PDF people can read on your page") }, icon: GlyphDocument, keywords: KEYWORDS.pdf_document },
  { id: "food_menu", type: "food_menu", category: "media", get label() { return tt("Menu") }, get description() { return tt("A food and drinks menu") }, icon: GlyphMenu, keywords: KEYWORDS.food_menu },
  extra("map", "media"),

  /* Grow */
  { id: "email_capture", type: "email_capture", category: "grow", get label() { return tt("Email signup") }, get description() { return tt("Grow your list, give a free file") }, icon: GlyphEmail, keywords: KEYWORDS.email_capture },
  extra("contact_form", "grow"),
  extra("testimonials", "grow"),
  extra("countdown", "grow"),

  /*
    Integrations: each one real, a public embed or player with no key
    (lib/onepage/creator-blocks musicSource, embedSource, bookingSource;
    lib/onepage/extra-blocks videoSource), or the signup sync of
    lib/integrations/marketing. Every frame host is in lib/security/csp.ts.
  */
  { id: "int_youtube", type: "video", category: "integrations", label: "YouTube", get description() { return tt("Play your videos on your page") }, brand: "youtube", keywords: KEYWORDS.int_youtube },
  { id: "int_tiktok", type: "video", category: "integrations", label: "TikTok", get description() { return tt("Play a TikTok on your page") }, brand: "tiktok", keywords: KEYWORDS.int_tiktok },
  { id: "int_vimeo", type: "video", category: "integrations", label: "Vimeo", get description() { return tt("Play your videos on your page") }, brand: "vimeo", keywords: KEYWORDS.int_vimeo },
  embed("int_instagram", "Instagram", "instagram", "instagram", () => tt("Show a post or reel"), KEYWORDS.int_instagram),
  embed("int_x", "X", "twitter", "x", () => tt("Show a post"), KEYWORDS.int_x),
  embed("int_twitch", "Twitch", "twitch", "twitch", () => tt("Your stream, a video or a clip"), KEYWORDS.int_twitch),
  embed("int_loom", BRAND.loom, "loom", "loom", () => tt("Play a Loom video"), KEYWORDS.int_loom),
  { id: "int_spotify", type: "music", category: "integrations", label: "Spotify", get description() { return tt("Play a song, album or playlist") }, brand: "spotify", keywords: KEYWORDS.int_spotify },
  { id: "int_applemusic", type: "music", category: "integrations", label: BRAND.applemusic, get description() { return tt("Play a song, album or playlist") }, brand: "applemusic", keywords: KEYWORDS.int_applemusic },
  { id: "int_soundcloud", type: "music", category: "integrations", label: "SoundCloud", get description() { return tt("Play a track or a set") }, brand: "soundcloud", keywords: KEYWORDS.int_soundcloud },
  embed("int_podcasts", BRAND.podcasts, "apple-podcasts", "podcasts", () => tt("Play your show or an episode"), KEYWORDS.int_podcasts),
  embed("int_bandcamp", BRAND.bandcamp, "bandcamp", "bandcamp", () => tt("Play an album or a track"), KEYWORDS.int_bandcamp),
  embed("int_mixcloud", BRAND.mixcloud, "mixcloud", "mixcloud", () => tt("Play a mix or a show"), KEYWORDS.int_mixcloud),
  { id: "int_booking", type: "calendly", category: "integrations", label: BRAND.booking, get description() { return tt("People book a time without leaving") }, brand: "calendly", get data() { return { title: tt("Book a call"), button_text: tt("Book a call") } }, keywords: KEYWORDS.int_booking },
  embed("int_gcal", BRAND.gcal, "google-calendar", "gcal", () => tt("People book a time without leaving"), KEYWORDS.int_gcal),
  embed("int_typeform", BRAND.typeform, "typeform", "typeform", () => tt("A form people fill in on your page"), KEYWORDS.int_typeform),
  embed("int_gforms", BRAND.gforms, "google-forms", "googleforms", () => tt("A form people fill in on your page"), KEYWORDS.int_gforms),
  embed("int_tally", BRAND.tally, null, "tally", () => tt("A form people fill in on your page"), KEYWORDS.int_tally, GlyphContact),
  embed("int_substack", "Substack", "substack", "substack", () => tt("People join your newsletter"), KEYWORDS.int_substack),
  { id: "int_email", type: "email_capture", category: "integrations", label: BRAND.email, get description() { return tt("Signups go to your email tool too") }, icon: GlyphSync, keywords: KEYWORDS.int_email },

  /* Links to the places people already are */
  link("instagram", "Instagram", "instagram", () => ({ label: tt("Follow on Instagram"), url: "https://instagram.com/" }), () => tt("Link to your profile")),
  link("tiktok", "TikTok", "tiktok", () => ({ label: tt("Follow on TikTok"), url: "https://tiktok.com/@" }), () => tt("Link to your profile")),
  link("youtube", "YouTube", "youtube", () => ({ label: tt("Subscribe on YouTube"), url: "https://youtube.com/@" }), () => tt("Link to your channel")),
  link("x", "X", "twitter", () => ({ label: tt("Follow on X"), url: "https://x.com/" }), () => tt("Link to your profile"), KEYWORDS.x),
  link("threads", BRAND.threads, "threads", () => ({ label: tt("Follow on Threads"), url: "https://threads.net/@" }), () => tt("Link to your profile")),
  link("facebook", "Facebook", "facebook", () => ({ label: tt("Follow on Facebook"), url: "https://facebook.com/" }), () => tt("Link to your page")),
  link("linkedin", "LinkedIn", "linkedin", () => ({ label: tt("Connect on LinkedIn"), url: "https://linkedin.com/in/" }), () => tt("Link to your profile")),
  link("bluesky", BRAND.bluesky, "bluesky", () => ({ label: tt("Follow on Bluesky"), url: "https://bsky.app/profile/", icon: "bluesky" }), () => tt("Link to your profile")),
  link("pinterest", "Pinterest", "pinterest", () => ({ label: tt("Follow on Pinterest"), url: "https://pinterest.com/", icon: "pinterest" }), () => tt("Link to your boards")),
  link("snapchat", BRAND.snapchat, "snapchat", () => ({ label: tt("Add me on Snapchat"), url: "https://snapchat.com/add/", icon: "snapchat" }), () => tt("Link to your profile")),
  link("twitch", "Twitch", "twitch", () => ({ label: tt("Watch on Twitch"), url: "https://twitch.tv/", icon: "twitch" }), () => tt("Link to your channel")),
  link("spotify_link", "Spotify", "spotify", () => ({ label: tt("Listen on Spotify"), url: "https://open.spotify.com/" }), () => tt("Link to your music")),
  link("applemusic", BRAND.applemusic, "applemusic", () => ({ label: tt("Listen on Apple Music"), url: "https://music.apple.com/" }), () => tt("Link to your music")),
  link("soundcloud", "SoundCloud", "soundcloud", () => ({ label: tt("Listen on SoundCloud"), url: "https://soundcloud.com/", icon: "soundcloud" }), () => tt("Link to your music")),
  link("whatsapp", "WhatsApp", "whatsapp", () => ({ label: tt("Message on WhatsApp"), url: "https://wa.me/" }), () => tt("Let people message you")),
  link("telegram", "Telegram", "telegram", () => ({ label: tt("Message on Telegram"), url: "https://t.me/" }), () => tt("Let people message you")),
  link("discord", "Discord", "discord", () => ({ label: tt("Join Discord"), url: "https://discord.gg/" }), () => tt("Invite people to your server")),
  link("vimeo", "Vimeo", "vimeo", () => ({ label: tt("Watch on Vimeo"), url: "https://vimeo.com/" }), () => tt("Link to your videos")),
  link("amazon", "Amazon", "amazon", () => ({ label: tt("Shop my Amazon picks"), url: "https://www.amazon.com/shop/", icon: "amazon" }), () => tt("Link to your storefront"), KEYWORDS.amazon),
  link("etsy", "Etsy", "etsy", () => ({ label: tt("Shop on Etsy"), url: "https://www.etsy.com/shop/", icon: "etsy" }), () => tt("Link to your shop"), KEYWORDS.etsy),
  link("patreon", "Patreon", "patreon", () => ({ label: tt("Join on Patreon"), url: "https://patreon.com/", icon: "patreon" }), () => tt("Link to your page"), KEYWORDS.patreon),
  link("substack_link", "Substack", "substack", () => ({ label: tt("Read on Substack"), url: "https://substack.com/@", icon: "substack" }), () => tt("Link to your newsletter"), KEYWORDS.substack),
  link("kofi", "Ko-fi", "kofi", () => ({ label: tt("Buy me a coffee"), url: "https://ko-fi.com/", icon: "kofi" }), () => tt("Let people tip you"), KEYWORDS.kofi),
  link("bmac", BRAND.bmac, "buymeacoffee", () => ({ label: tt("Buy me a coffee"), url: "https://buymeacoffee.com/", icon: "buymeacoffee" }), () => tt("Let people tip you"), KEYWORDS.bmac),
  link("paypal", "PayPal", "paypal", () => ({ label: tt("Pay with PayPal"), url: "https://paypal.me/", icon: "paypal" }), () => tt("Let people pay or tip you"), KEYWORDS.paypal),
  link("cashapp", BRAND.cashapp, "cashapp", () => ({ label: tt("Pay with Cash App"), url: "https://cash.app/$", icon: "cashapp" }), () => tt("Let people pay or tip you"), KEYWORDS.cashapp),
  link("venmo", BRAND.venmo, "venmo", () => ({ label: tt("Pay with Venmo"), url: "https://venmo.com/u/", icon: "venmo" }), () => tt("Let people pay or tip you"), KEYWORDS.venmo),
  link("github", "GitHub", "github", () => ({ label: tt("See my code"), url: "https://github.com/", icon: "github" }), () => tt("Link to your profile")),
  link("notion", "Notion", "notion", () => ({ label: tt("View page"), url: "https://notion.so/", icon: "notion" }), () => tt("Link to a Notion page")),
  { id: "podcast", type: "link_button", category: "links", get label() { return tt("Podcast") }, get description() { return tt("Link to your show") }, icon: GlyphPodcast, get preset() { return { label: tt("Listen to the podcast"), url: "" } } },
]

/** The entries a search finds, best first: a name that starts with the words, then a name that has them, then the line and the other words. */
export function searchEntries(entries: PickerEntry[], query: string): PickerEntry[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return entries
  const scored: { e: PickerEntry; score: number }[] = []
  for (const e of entries) {
    const name = e.label.toLowerCase()
    const rest = `${e.description} ${e.keywords ?? ""} ${e.type.replace(/_/g, " ")}`.toLowerCase()
    let score = 0
    for (const w of words) {
      if (name.startsWith(w)) score += 4
      else if (name.includes(w)) score += 3
      else if (rest.includes(w)) score += 1
      else {
        score = -1
        break
      }
    }
    if (score > 0) scored.push({ e, score })
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.e)
}

/* ─── The recent list, on this browser ────────────────────────────────── */

const RECENT_KEY = "storelib:onepage:recent-blocks"

export function readRecent(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]")
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, 4) : []
  } catch {
    return []
  }
}

export function rememberRecent(id: string): void {
  try {
    const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, 4)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* Private window: no recent list, nothing else changes. */
  }
}

/* ─── The picker ──────────────────────────────────────────────────────── */

/**
 * THE CHIPS ARE STORELIB'S OWN PILLS (components/onepage/pill-tabs PillTabs,
 * lib/ui/pill-switch), the very row Settings, the Theme kinds and the font
 * kinds use in this editor, so they look and move the same: white on a
 * hairline, the chosen one's light fill fading in where it is (nothing
 * slides, nothing scales), the word turning in one step, a press a light
 * tint, a finger's choice a light haptic tick. What the chip shows lands as
 * those sections do (landContent: from 0.6 opacity over 120ms, never from
 * nothing).
 */
/** How long after the sheet closes its search, chip and scroll go back (it has finished sliding out by then). */
const RESET_AFTER_CLOSE_MS = 420

/*
  ROUND 40: EACH KIND IN ITS OWN TINT (./block-tints). A block's own icon sits
  on its category's wash in its ink; a brand keeps its colours on white.
*/
function EntryIcon({ entry }: { entry: PickerEntry }) {
  if (entry.brandIcon) {
    const B = entry.brandIcon
    return <BlockTile tint={entry.category}><B size={18} color={tintOf(entry.category).ink} /></BlockTile>
  }
  if (entry.brand) {
    /* Round 11: in the brand's own colour, as the owner asked ("use their actual icons"); a black mark stays the tile's near black. */
    return (
      <BlockTile className="bg-white shadow-[inset_0_0_0_1px_rgba(17,17,19,0.08),0_1px_2px_rgba(17,17,19,0.05)]">
        <SocialIcon platform={entry.brand} size={19} color="#1a1a2e" strokeWidth={1.8} tone="brand" />
      </BlockTile>
    )
  }
  return <BlockTile icon={entry.icon ?? GlyphLink} tint={entry.category} />
}

/**
 * ONE ROW. A press is a calm tint and nothing else: no scale, no lift (round
 * 11: "each button there, it bumps. I don't want that bump with the finger").
 * The grey under a mouse is only for a mouse (hover: hover, pointer: fine),
 * so a finger sliding over the list never lights a row up. Memoised: the
 * rows never render again when the sheet opens, a chip changes or a search
 * is typed; only `hidden` on their section does.
 */
const EntryRow = React.memo(function EntryRow({ entry, disabled, note, onPick }: { entry: PickerEntry; disabled: boolean; note?: string | null; onPick: (e: PickerEntry) => void }) {
  return (
    <button
      type="button"
      data-picker-entry={entry.id}
      disabled={disabled}
      onClick={() => onPick(entry)}
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left outline-none [-webkit-tap-highlight-color:transparent]",
        "transition-[background-color] duration-150 ease-out focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.3)] motion-reduce:transition-none",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer active:bg-[#f0f0f2] hover:bg-[#f6f6f7]",
      )}
    >
      <EntryIcon entry={entry} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium leading-5 text-[#111113]">{entry.label}</span>
        <span className="block truncate text-[12.5px] leading-[18px] text-[#6b7280]">{note || entry.description}</span>
      </span>
    </button>
  )
})

/**
 * A SECTION A CHIP LEAVES OUT IS NOT RENDERED, BUT KEPT. `hidden` (display:
 * none) threw away the style of every row in it, so All, after a single
 * category, worked out the style of all 580 elements again: 80ms of style at
 * 390 with the CPU slowed four times, eight frames dropped. `content-
 * visibility: hidden` skips drawing it the same way and keeps what was
 * worked out, so showing it again is a small layout. It takes no room
 * (no height, no padding), no tap and no screen reader.
 */
const SECTION_OFF: React.CSSProperties = { contentVisibility: "hidden", height: 0, paddingBottom: 0, overflow: "hidden" }

/** A heading and its rows. Memoised on what it shows, so the open, a chip or a keystroke never renders its rows again. */
const PickerSection = React.memo(function PickerSection({ id, title, entries, limited, hidden, onPick, prefix = "" }: { id: string; title: string; entries: PickerEntry[]; limited: string; hidden: boolean; onPick: (e: PickerEntry) => void; prefix?: string }) {
  const atLimit = limited ? limited.split(",") : []
  return (
    <section data-picker-section={id} data-shown={hidden ? undefined : ""} aria-hidden={hidden || undefined} style={hidden ? SECTION_OFF : undefined} className="pb-2">
      <h3 className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[0.04em]" style={{ color: tintOf(id).ink }} data-picker-heading={id}>
        <span aria-hidden className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: tintOf(id).ink, opacity: 0.85 }} />
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
        {entries.map((e) => {
          const full = atLimit.includes(e.type)
          return <EntryRow key={`${prefix}${e.id}`} entry={e} disabled={full} note={full ? tt("Already on your page twice") : null} onPick={onPick} />
        })}
      </div>
    </section>
  )
})

export function AddBlockPicker({
  inGroup,
  onPick,
  atLimit,
  open,
}: {
  /** Adding into a group: only links and images go in one. */
  inGroup: boolean
  onPick: (entry: PickerEntry) => void
  /** A type the page has as many of as it may (two rows of social icons). */
  atLimit: (type: OnePageBlockType) => boolean
  /** Whether the sheet is up: what was typed and chosen goes back once it has closed. */
  open: boolean
}) {
  const [category, setCategory] = React.useState<PickerCategory | "all">("all")
  const [query, setQuery] = React.useState("")
  /* Read once when it is built, and again after each close: never on the tap that opens it, never while it slides out. */
  const [recent, setRecent] = React.useState<string[]>(() => (typeof window === "undefined" ? [] : readRecent()))
  const listRef = React.useRef<HTMLDivElement>(null)
  const firstList = React.useRef(true)

  /*
    WHAT THE TAP THAT OPENS IT DOES: nothing here. Round 10 reset the chip,
    read the recent list and scrolled the list to its top on the open, a
    second render and a forced layout inside the sheet's first frame. Now
    all three happen after the sheet has closed, while nobody sees it.
  */
  React.useEffect(() => {
    if (open) return
    const t = window.setTimeout(() => {
      setCategory("all")
      setQuery("")
      setRecent(readRecent())
      if (listRef.current) listRef.current.scrollTop = 0
    }, RESET_AFTER_CLOSE_MS)
    return () => window.clearTimeout(t)
  }, [open])

  /* A category's rows land as Storelib's pills' content does (lib/ui/pill-switch landContent), in the commit that shows them; not on the first draw. */
  React.useLayoutEffect(() => {
    if (firstList.current) {
      firstList.current = false
      return
    }
    if (open) landContent(listRef.current)
  }, [category]) // eslint-disable-line react-hooks/exhaustive-deps

  /* What a group can hold (lib/onepage/group): the same list a card dropped on a group is checked against. */
  const allowed = React.useMemo(() => (inGroup ? PICKER_ENTRIES.filter((e) => canGoInGroup(e.type)) : PICKER_ENTRIES), [inGroup])
  const searching = query.trim().length > 0
  const found = React.useMemo(() => (searching ? searchEntries(allowed, query) : []), [allowed, query, searching])
  const recentEntries = React.useMemo(() => recent.map((id) => allowed.find((e) => e.id === id)).filter((e): e is PickerEntry => !!e), [recent, allowed])
  const categories = React.useMemo(() => PICKER_CATEGORIES.filter((c) => allowed.some((e) => e.category === c.id)), [allowed])
  const byCategory = React.useMemo(() => new Map(categories.map((c) => [c.id, allowed.filter((e) => e.category === c.id)])), [categories, allowed])
  /* The types at their limit, as a string, so the memoised sections only render again when it really changes. */
  const limited = [...new Set(allowed.map((e) => e.type))].filter((t) => atLimit(t)).join(",")

  /* The parent's onPick changes every render; the rows hold this one, which never does. */
  const pickRef = React.useRef(onPick)
  pickRef.current = onPick
  const limitedRef = React.useRef(limited)
  limitedRef.current = limited
  const pick = React.useCallback((entry: PickerEntry) => {
    if (limitedRef.current.split(",").includes(entry.type)) return
    rememberRecent(entry.id)
    pickRef.current(entry)
  }, [])

  /* PillTabs ticks the haptics and calls this in a transition; the list goes back to its top with it. */
  const choose = (id: PickerCategory | "all") => {
    setCategory(id)
    if (listRef.current) listRef.current.scrollTop = 0
  }
  /* Each category's chip carries its tint as a dot (./block-tints); All has none. */
  const chips = React.useMemo(() => [{ id: "all" as const, label: tt("All") }, ...categories.map((c) => ({ id: c.id, label: c.label, dot: tintOf(c.id).ink }))], [categories])

  return (
    <div data-add-block-picker="" className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="shrink-0 space-y-3 px-4 pb-3 sm:px-5">
        <label className="relative block">
          <span className="sr-only">{tt("Search blocks")}</span>
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#9ca3af]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tt("Search blocks and apps")}
            enterKeyHint="search"
            autoComplete="off"
            data-picker-search=""
            className="h-11 w-full rounded-xl border border-[#e8e8ec] bg-[#f6f6f7] pl-10 pr-10 text-[16px] text-[#111113] outline-none transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[14.5px] [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" aria-label={tt("Clear search")} onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#9ca3af] transition-colors hover:text-[#1a1a2e]">
              <X aria-hidden className="h-4 w-4" />
            </button>
          ) : null}
        </label>
        {categories.length > 1 ? (
          <div hidden={searching} data-picker-chips="">
            <PillTabs
              dataRow="add-block-categories"
              label={tt("Categories")}
              items={chips}
              value={category}
              onChange={choose}
              keepInView
              itemAttr="data-picker-chip"
              className="-mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] sm:-mx-5 sm:px-5 [&::-webkit-scrollbar]:hidden"
              itemClassName="h-10 px-4 text-[13px] sm:h-9"
            />
          </div>
        ) : null}
      </div>

      {/*
        THE LIST. Every category's rows are built once and kept; a chip only
        says which sections are `hidden`, so a switch neither builds nor throws
        away a row. Its own layer of paint (contain), and a scroll that stays
        inside it (overscroll-contain), as the website builder's sheet lists.
      */}
      <div ref={listRef} data-picker-list="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-[#f0f0f2] px-2 pb-6 pt-2 [contain:content] sm:px-3">
        {searching ? (
          found.length ? (
            <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
              {found.map((e) => {
                const full = limited.split(",").includes(e.type)
                return <EntryRow key={`s-${e.id}`} entry={e} disabled={full} note={full ? tt("Already on your page twice") : null} onPick={pick} />
              })}
            </div>
          ) : (
            <div className="px-4 py-12 text-center">
              <p className="text-[14px] font-medium text-[#111113]">{tt("Nothing called that")}</p>
              <p className="mt-1 text-[13px] text-[#6b7280]">{tt("Try a Link, and paste any address.")}</p>
            </div>
          )
        ) : null}
        {recentEntries.length ? (
          <PickerSection id="recent" title={tt("Recently used")} entries={recentEntries} limited={limited} hidden={searching || category !== "all"} onPick={pick} prefix="r-" />
        ) : null}
        {categories.map((c) => (
          <PickerSection key={c.id} id={c.id} title={c.label} entries={byCategory.get(c.id) ?? []} limited={limited} hidden={searching || (category !== "all" && category !== c.id)} onPick={pick} />
        ))}
      </div>
    </div>
  )
}
