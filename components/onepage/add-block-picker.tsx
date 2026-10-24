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
 * The five integrations are real: YouTube and TikTok play in the video
 * block, Spotify in the music block (their public embed pages), Calendly
 * and Cal.com open in the booking block, and Klaviyo or Omnisend receive
 * every signup through Settings › Integrations (lib/integrations/marketing).
 */

import * as React from "react"
import { Plus, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SocialIcon } from "@/components/onepage/brand-icons"
import { EXTRA_BLOCK_CATALOG } from "@/components/onepage/extra-blocks"
import {
  BlockTile,
  GlyphBooking,
  GlyphDivider,
  GlyphDocument,
  GlyphEmail,
  GlyphGroup,
  GlyphImage,
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
import { tt } from "@/lib/i18n/text"

/* ─── The + on + Add ──────────────────────────────────────────────────── */

/**
 * THE + TURNS A FULL CIRCLE UNDER THE POINTER, AND BACK WHEN IT LEAVES.
 * "When I hover over it, the + rotates very smooth, clean, 360; on hover out
 * it smoothly rotates back." Only the `rotate` property moves, which the
 * browser hands to the compositor: no layout, no paint, the same frame rate
 * the screen has (120 on a ProMotion display). 600ms on one ease in and out
 * (cubic-bezier(0.4, 0, 0.2, 1)), so a whole turn starts soft, travels and
 * settles, and the turn back is the same curve the other way. Only with a
 * mouse or trackpad (hover: hover and pointer: fine): a tap never leaves a
 * phone's + half turned. While the sheet + Add opened is up it rests at 405,
 * the x of the sheet, so opening from a hover goes on forward by 45 rather
 * than spinning back. Under reduced motion it does not move at all.
 */
export function AddBlockPlus({ open }: { open: boolean }) {
  return (
    <Plus
      aria-hidden
      data-add-plus={open ? "open" : ""}
      className={cn(
        "h-5 w-5 shrink-0 transition-[rotate] duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
        open ? "rotate-[405deg]" : "rotate-0 [@media(hover:hover)_and_(pointer:fine)]:[[data-add-block]:hover_&]:rotate-[360deg]",
      )}
      strokeWidth={2.25}
    />
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

/* i18n-ignore-start: names of services, and the English words a search also answers to (each entry's own name and line are translated). */
const BRAND = { booking: "Calendly / Cal.com", email: "Klaviyo / Omnisend", threads: "Threads", applemusic: "Apple Music" }
const KEYWORDS = {
  heading: "title section",
  faq: "questions answers help",
  course: "class lessons learn",
  video: "youtube vimeo tiktok watch",
  music: "spotify soundcloud apple song album playlist",
  map: "address location place",
  contact_form: "message inquiry form email me",
  testimonials: "reviews quotes social proof",
  countdown: "timer launch drop",
  link: "url button website",
  text: "paragraph bio words",
  social_row: "instagram tiktok youtube profiles",
  image: "picture photo gallery carousel",
  group: "carousel folder",
  divider: "spacer line gap",
  product: "digital download shop buy",
  coaching: "booking calendar meeting session consult calendly cal.com",
  store_link: "store etsy shopify",
  pdf_document: "document guide file",
  food_menu: "restaurant cafe bar",
  email_capture: "newsletter subscribe lead magnet form",
  int_youtube: "video",
  int_spotify: "music",
  int_tiktok: "video",
  int_booking: "booking coaching calendar cal.com",
  int_email: "newsletter email marketing list sync",
  x: "twitter",
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
  { id: "pdf_document", type: "pdf_document", category: "media", get label() { return tt("PDF") }, get description() { return tt("A PDF people can read on your page") }, icon: GlyphDocument, keywords: KEYWORDS.pdf_document },
  { id: "food_menu", type: "food_menu", category: "media", get label() { return tt("Menu") }, get description() { return tt("A food and drinks menu") }, icon: GlyphMenu, keywords: KEYWORDS.food_menu },
  extra("map", "media"),

  /* Grow */
  { id: "email_capture", type: "email_capture", category: "grow", get label() { return tt("Email signup") }, get description() { return tt("Grow your list, give a free file") }, icon: GlyphEmail, keywords: KEYWORDS.email_capture },
  extra("contact_form", "grow"),
  extra("testimonials", "grow"),
  extra("countdown", "grow"),

  /* Integrations: the five, each real (see the top of this file). */
  { id: "int_youtube", type: "video", category: "integrations", label: "YouTube", get description() { return tt("Play your videos on your page") }, brand: "youtube", keywords: KEYWORDS.int_youtube },
  { id: "int_spotify", type: "music", category: "integrations", label: "Spotify", get description() { return tt("Play a song, album or playlist") }, brand: "spotify", keywords: KEYWORDS.int_spotify },
  { id: "int_tiktok", type: "video", category: "integrations", label: "TikTok", get description() { return tt("Play a TikTok on your page") }, brand: "tiktok", keywords: KEYWORDS.int_tiktok },
  { id: "int_booking", type: "calendly", category: "integrations", label: BRAND.booking, get description() { return tt("People book a time without leaving") }, brand: "calendly", get data() { return { title: tt("Book a call"), button_text: tt("Book a call") } }, keywords: KEYWORDS.int_booking },
  { id: "int_email", type: "email_capture", category: "integrations", label: BRAND.email, get description() { return tt("Signups go to your email tool too") }, icon: GlyphSync, keywords: KEYWORDS.int_email },

  /* Links to the places people already are */
  link("instagram", "Instagram", "instagram", () => ({ label: tt("Follow on Instagram"), url: "https://instagram.com/" }), () => tt("Link to your profile")),
  link("tiktok", "TikTok", "tiktok", () => ({ label: tt("Follow on TikTok"), url: "https://tiktok.com/@" }), () => tt("Link to your profile")),
  link("youtube", "YouTube", "youtube", () => ({ label: tt("Subscribe on YouTube"), url: "https://youtube.com/@" }), () => tt("Link to your channel")),
  link("x", "X", "twitter", () => ({ label: tt("Follow on X"), url: "https://x.com/" }), () => tt("Link to your profile"), KEYWORDS.x),
  link("threads", BRAND.threads, "threads", () => ({ label: tt("Follow on Threads"), url: "https://threads.net/@" }), () => tt("Link to your profile")),
  link("facebook", "Facebook", "facebook", () => ({ label: tt("Follow on Facebook"), url: "https://facebook.com/" }), () => tt("Link to your page")),
  link("linkedin", "LinkedIn", "linkedin", () => ({ label: tt("Connect on LinkedIn"), url: "https://linkedin.com/in/" }), () => tt("Link to your profile")),
  link("spotify_link", "Spotify", "spotify", () => ({ label: tt("Listen on Spotify"), url: "https://open.spotify.com/" }), () => tt("Link to your music")),
  link("applemusic", BRAND.applemusic, "applemusic", () => ({ label: tt("Listen on Apple Music"), url: "https://music.apple.com/" }), () => tt("Link to your music")),
  link("soundcloud", "SoundCloud", "soundcloud", () => ({ label: tt("Listen on SoundCloud"), url: "https://soundcloud.com/" }), () => tt("Link to your music")),
  link("whatsapp", "WhatsApp", "whatsapp", () => ({ label: tt("Message on WhatsApp"), url: "https://wa.me/" }), () => tt("Let people message you")),
  link("telegram", "Telegram", "telegram", () => ({ label: tt("Message on Telegram"), url: "https://t.me/" }), () => tt("Let people message you")),
  link("discord", "Discord", "discord", () => ({ label: tt("Join Discord"), url: "https://discord.gg/" }), () => tt("Invite people to your server")),
  link("vimeo", "Vimeo", "vimeo", () => ({ label: tt("Watch on Vimeo"), url: "https://vimeo.com/" }), () => tt("Link to your videos")),
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

function EntryIcon({ entry }: { entry: PickerEntry }) {
  if (entry.brandIcon) {
    const B = entry.brandIcon
    return <BlockTile><B size={18} color="#1a1a2e" /></BlockTile>
  }
  if (entry.brand) {
    return (
      <BlockTile>
        <SocialIcon platform={entry.brand} size={18} color="#1a1a2e" strokeWidth={1.8} />
      </BlockTile>
    )
  }
  return <BlockTile icon={entry.icon ?? GlyphLink} />
}

function EntryRow({ entry, disabled, note, onPick }: { entry: PickerEntry; disabled: boolean; note?: string | null; onPick: (e: PickerEntry) => void }) {
  return (
    <button
      type="button"
      data-picker-entry={entry.id}
      disabled={disabled}
      onClick={() => onPick(entry)}
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left outline-none [-webkit-tap-highlight-color:transparent]",
        "transition-[background-color,scale] duration-150 ease-out focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.3)]",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-[#f6f6f7] active:scale-[0.985] active:bg-[#f0f0f2]",
      )}
    >
      <EntryIcon entry={entry} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium leading-5 text-[#111113]">{entry.label}</span>
        <span className="block truncate text-[12.5px] leading-[18px] text-[#6b7280]">{note || entry.description}</span>
      </span>
    </button>
  )
}

export function AddBlockPicker({
  inGroup,
  query,
  onQuery,
  onPick,
  atLimit,
  open,
}: {
  /** Adding into a group: only links and images go in one. */
  inGroup: boolean
  query: string
  onQuery: (q: string) => void
  onPick: (entry: PickerEntry) => void
  /** A type the page has as many of as it may (two rows of social icons). */
  atLimit: (type: OnePageBlockType) => boolean
  /** Read the recent list again each time it opens. */
  open: boolean
}) {
  const [category, setCategory] = React.useState<PickerCategory | "all">("all")
  const [recent, setRecent] = React.useState<string[]>([])
  const listRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    setRecent(readRecent())
    setCategory("all")
    listRef.current?.scrollTo({ top: 0 })
  }, [open])

  const allowed = React.useMemo(() => (inGroup ? PICKER_ENTRIES.filter((e) => e.type === "link_button" || e.type === "image") : PICKER_ENTRIES), [inGroup])
  const searching = query.trim().length > 0
  const found = React.useMemo(() => (searching ? searchEntries(allowed, query) : []), [allowed, query, searching])
  const recentEntries = recent.map((id) => allowed.find((e) => e.id === id)).filter((e): e is PickerEntry => !!e)
  const categories = PICKER_CATEGORIES.filter((c) => allowed.some((e) => e.category === c.id))
  const shown = category === "all" ? categories : categories.filter((c) => c.id === category)

  const pick = (entry: PickerEntry) => {
    if (atLimit(entry.type)) return
    rememberRecent(entry.id)
    onPick(entry)
  }
  const row = (entry: PickerEntry, key: string) => (
    <EntryRow key={key} entry={entry} disabled={atLimit(entry.type)} note={atLimit(entry.type) ? tt("Already on your page twice") : null} onPick={pick} />
  )

  return (
    <div data-add-block-picker="" className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="shrink-0 space-y-3 px-4 pb-3 sm:px-5">
        <label className="relative block">
          <span className="sr-only">{tt("Search blocks")}</span>
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#9ca3af]" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={tt("Search blocks and apps")}
            enterKeyHint="search"
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-[#e8e8ec] bg-[#f6f6f7] pl-10 pr-10 text-[16px] text-[#111113] outline-none transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#1a1a2e] focus:bg-white focus:shadow-[0_0_0_3px_rgba(26,26,46,0.08)] sm:text-[14.5px] [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" aria-label={tt("Clear search")} onClick={() => onQuery("")} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#9ca3af] transition-colors hover:text-[#1a1a2e]">
              <X aria-hidden className="h-4 w-4" />
            </button>
          ) : null}
        </label>
        {!searching && categories.length > 1 ? (
          <div role="tablist" aria-label={tt("Categories")} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-5 sm:px-5 [&::-webkit-scrollbar]:hidden">
            {[{ id: "all" as const, label: tt("All") }, ...categories].map((c) => {
              const on = category === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-picker-chip={c.id}
                  onClick={() => {
                    setCategory(c.id)
                    listRef.current?.scrollTo({ top: 0 })
                  }}
                  className={cn(
                    "h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium outline-none transition-[background-color,color,box-shadow] duration-150 [-webkit-tap-highlight-color:transparent] focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.3)]",
                    on ? "bg-[#111113] text-white" : "bg-[#f2f2f4] text-[#3f3f46] hover:bg-[#e9e9ec]",
                  )}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-[#f0f0f2] px-2 pb-6 pt-2 sm:px-3">
        {searching ? (
          found.length ? (
            <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">{found.map((e) => row(e, `s-${e.id}`))}</div>
          ) : (
            <div className="px-4 py-12 text-center">
              <p className="text-[14px] font-medium text-[#111113]">{tt("Nothing called that")}</p>
              <p className="mt-1 text-[13px] text-[#6b7280]">{tt("Try a Link, and paste any address.")}</p>
            </div>
          )
        ) : (
          <>
            {category === "all" && recentEntries.length ? (
              <section data-picker-section="recent" className="pb-2">
                <h3 className="px-2 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#9ca3af]">{tt("Recently used")}</h3>
                <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">{recentEntries.map((e) => row(e, `r-${e.id}`))}</div>
              </section>
            ) : null}
            {shown.map((c) => (
              <section key={c.id} data-picker-section={c.id} className="pb-2">
                <h3 className="px-2 pb-1 pt-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#9ca3af]">{c.label}</h3>
                <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">{allowed.filter((e) => e.category === c.id).map((e) => row(e, e.id))}</div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
