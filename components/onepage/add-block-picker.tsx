"use client"

/**
 * ===========================================================================
 *  ADD BLOCK: WHAT A ONEPAGE CAN HOLD, FOUND IN A SECOND
 * ===========================================================================
 * The sheet (a phone) or dialog (a computer) that + Add opens, drawn inside
 * links-tab's SheetDialog.
 *
 * ROUND AL, the owner: "in the add block, in the one page editor, I feel
 * like there are too many things. Like, why there is digital products and
 * digital product block? ... We should make it more like Linktree ... I
 * don't like that they're light gray ... for the apps that actually are
 * companies, just use their original icon ... organize in the add block
 * model the categories into ... essentials, commerce, social media,
 * contact, events, text, and then ... view all ... preserve the recently
 * used ... one per row instead of two per row". Now, after Linktree's own
 * list:
 *
 *   SEARCH      one field, matching a block's name, its line and the words
 *               people use for it ("newsletter" finds Email signup). Search
 *               also finds what the lists leave out (a single product, a
 *               link to Etsy, the email tools), so nothing anyone used is
 *               gone, it is just not in the way.
 *   RECENT      the last four blocks this person added, first, on this
 *               browser only.
 *   CATEGORIES  Essentials, Commerce, Social, Media, Contact, Events and
 *               Text, then View all. Essentials is a short pick from all of
 *               them and is what the sheet opens on.
 *   ROWS        one per row: a large round tile in the entry's own colour
 *               (a company's own mark on its own colour: Instagram's
 *               gradient, Google Maps' four colour pin), a name, one line
 *               saying what it does, and a chevron.
 *   ONE ENTRY   for one thing. "Digital products" is the Commerce shelf of
 *               downloads; the single product block and "All products" are
 *               found by search and by the shelf's own Show choice. A
 *               service with a block (YouTube, Spotify, Calendly, Maps)
 *               adds that block; every other service adds an app block
 *               (lib/onepage/app-blocks), one engine with the same Settings
 *               and Layout for all of them.
 *
 * Saved blocks of every older entry render and edit exactly as before: an
 * entry only says what a NEW block starts as.
 *
 * ROUND 11, THE FEEL (kept): the open renders the sheet and nothing else (the
 * open state is a store here, not the Links tab's), the rows are built once
 * and never render again, a chip only hides sections, the chips are the app
 * settings' pills, a row's press is a tint with no scale, and the + turns 45
 * degrees into an x while the sheet it opened is up (round 42).
 */

import * as React from "react"
import { ChevronRight, Plus, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { AppMark, INSTAGRAM_FILL, IntegrationMark, brandColor, isMulticolorMark, markOn } from "@/components/onepage/brand-icons"
import { EXTRA_BLOCK_CATALOG } from "@/components/onepage/extra-blocks"
import {
  APP_GLYPHS,
  GlyphBooking,
  GlyphBox,
  GlyphContact,
  GlyphCountdown,
  GlyphCourse,
  GlyphDivider,
  GlyphDocument,
  GlyphDownload,
  GlyphEmail,
  GlyphForm,
  GlyphFaq,
  GlyphGroup,
  GlyphHeading,
  GlyphImage,
  GlyphIntegration,
  GlyphLink,
  GlyphMenu,
  GlyphMusic,
  GlyphPeople,
  GlyphPodcast,
  GlyphProduct,
  GlyphSocial,
  GlyphStar,
  GlyphStore,
  GlyphSync,
  GlyphTag,
  GlyphTestimonials,
  GlyphText,
  GlyphVideo,
  RoundTile,
  type Glyph,
} from "@/components/onepage/block-icons"
import type { OnePageBlockType } from "@/lib/onepage/types"
import { APP_PROVIDERS, appBlockDefaults, type AppProviderId } from "@/lib/onepage/app-blocks"
import { canGoInGroup } from "@/lib/onepage/group"
import { tt } from "@/lib/i18n/text"
import { PillTabs } from "@/components/onepage/pill-tabs"
import { landContent } from "@/lib/ui/pill-switch"
import { hapticTap, isNativeApp } from "@/lib/native-bridge"

/* ─── The + on + Add ──────────────────────────────────────────────────── */


/**
 * THE + TURNS INTO THE SHEET'S x (round 42).
 * Round 10 turned it a full circle on hover and rested it at 405 ("it
 * rotates too much"); round 11 stopped it turning under a finger at all, so
 * on a phone the press had no answer of its own. The owner, round 42: "when
 * clicked, rotate the + icon smoothly (45 degrees to an x)". Now:
 *
 *   OPEN        45 degrees, a + become an x, for a finger and a mouse alike,
 *               while the sheet this button opened is up; back to 0 as it
 *               goes. Nothing turns on hover, so the click is the only turn.
 *   HAPTICS     a light tick on the press inside the iOS and Android apps
 *               (lib/native-bridge hapticTap, Capacitor Haptics); nothing in
 *               a browser.
 *
 * One property (`rotate`, on the compositor), one curve and one time
 * (ADD_PLUS_MS on ADD_PLUS_EASE), the same as the sheet's own rise, so the
 * x lands as the sheet does. It sits in a named group (`group/add`), which
 * app/globals.css's touch rule for `.group` does not reach. Under reduced
 * motion it does not move at all.
 *
 * ROUND AN, ONE MOTION ("the rotating of the + ... should be more smooth,
 * when opened and closed, goes back very smooth"). The + turned over 280ms
 * while the button under it changed colour over 100ms: the press darkened
 * it, and the hover tone it wore under a mouse dropped the moment the
 * dialog covered it, so two clocks ran at once and the colour snapped
 * before the turn had landed. Now the button keeps its pressed-open tone
 * while its sheet is up (`data-open`), and its colour and its shade move
 * on the + 's own time and curve, there and back (a press stays a tint,
 * never a scale). scripts/check-onepage-editor-an1.mjs samples
 * every frame of an open and a close, CPU slowed four times.
 */
export const ADD_PLUS_MS = 280
export const ADD_PLUS_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

export function AddBlockPlus({ open }: { open: boolean }) {
  return (
    <Plus
      aria-hidden
      data-add-plus={open ? "open" : ""}
      className={cn(
        "h-5 w-5 shrink-0 transition-[rotate] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none motion-reduce:!rotate-0",
        open ? "rotate-45" : "rotate-0",
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
    <button
      type="button"
      data-add-block=""
      data-open={open ? "" : undefined}
      aria-expanded={open}
      onClick={() => {
        /* A light tick in the iOS and Android apps; a browser feels nothing (lib/native-bridge). */
        if (isNativeApp()) hapticTap("light")
        onPress()
      }}
      className={cn(
        "group/add",
        className,
        /* Round AN: the colour and the shade settle on the + 's clock (ADD_PLUS_MS on ADD_PLUS_EASE); a press is a tint only, never a scale. */
        "transition-[background-color,box-shadow] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-[open]:bg-[#7c3aed] motion-reduce:transition-none",
      )}
    >
      <AddBlockPlus open={open} />
      {children}
    </button>
  )
}

/* ─── The catalogue ───────────────────────────────────────────────────── */

export type PickerCategory = "essentials" | "commerce" | "social" | "media" | "contact" | "events" | "text"

export const PICKER_CATEGORIES: { id: PickerCategory; readonly label: string }[] = [
  { id: "essentials", get label() { return tt("Essentials") } },
  { id: "commerce", get label() { return tt("Commerce") } },
  { id: "social", get label() { return tt("Social") } },
  { id: "media", get label() { return tt("Media") } },
  { id: "contact", get label() { return tt("Contact") } },
  { id: "events", get label() { return tt("Events") } },
  { id: "text", get label() { return tt("Text") } },
]

/** A round tile's fill and the colour of the glyph on it. */
export type TileColors = readonly [string, string]

/* i18n-ignore-start: colours. */
/* Each of our own blocks has a colour of its own, as Linktree's list does; white or near black on it, whichever reads. */
const TILE = {
  lavender: ["#E9DDF7", "#3E2470"],
  orange: ["#F26B1D", "#ffffff"],
  plum: ["#7C3AED", "#ffffff"],
  lime: ["#D6EF48", "#1a1a2e"],
  sky: ["#D3E8FF", "#0B4A8A"],
  pink: ["#FFD3E4", "#8A1F4F"],
  mint: ["#CFF3E2", "#0D5C3D"],
  butter: ["#FFE58A", "#5A4300"],
  coral: ["#FFB9A8", "#7A2311"],
  ink: ["#1a1a2e", "#ffffff"],
  blue: ["#2563EB", "#ffffff"],
  green: ["#16A34A", "#ffffff"],
  teal: ["#0F766E", "#ffffff"],
  rose: ["#F43F5E", "#ffffff"],
  cyan: ["#0EA5E9", "#ffffff"],
  amber: ["#F59E0B", "#3D2A00"],
  stone: ["#EDEBE6", "#3F3A33"],
} as const satisfies Record<string, TileColors>
/* i18n-ignore-end */

export interface PickerEntry {
  /** Stable, for the recent list. */
  id: string
  type: OnePageBlockType
  category: PickerCategory
  readonly label: string
  readonly description: string
  icon?: Glyph
  /** The tile's colour for an icon of ours. */
  tile?: TileColors
  /** A company's own mark (components/onepage/brand-icons AppMark), white on its own colour. */
  brand?: string
  brandIcon?: React.ComponentType<{ size?: number; color?: string; className?: string }>
  /** A connected tool's own mark (components/onepage/brand-icons IntegrationMark), in its colour on white. */
  mark?: string
  /** For a link: its first words and address. */
  preset?: { label: string; url: string; icon?: string }
  /** Anything else the new block starts with. */
  data?: Record<string, unknown>
  /** What else people call it, for the search. */
  keywords?: string
  /** Found by search, and kept in Recently used, but not listed under a category: one thing, one entry in the lists. */
  hidden?: boolean
}

const link = (id: string, label: string, brand: string, preset: () => { label: string; url: string; icon?: string }, description: () => string, keywords = "", category: PickerCategory = "social", hidden = true): PickerEntry => ({
  id,
  type: "link_button",
  category,
  label,
  get description() { return description() },
  brand,
  get preset() { return preset() },
  keywords,
  hidden,
})

/* An embed block (lib/onepage/creator-blocks embedSource), started as one service. Found by search: the app blocks list these services now. */
const embed = (id: string, label: string, brand: string | null, provider: string, description: () => string, keywords = "", icon?: Glyph, mark?: string): PickerEntry => ({
  id,
  type: "embed",
  category: "media",
  label,
  get description() { return description() },
  ...(brand ? { brand } : { icon: icon ?? GlyphIntegration, tile: TILE.stone }),
  ...(mark ? { mark } : {}),
  data: { provider },
  keywords,
  hidden: true,
})

/* Round 40: a tool a signup goes to, added as an email signup that offers to connect it (components/onepage/page-integrations SignupTools). Found by search. */
const tool = (id: string, label: string, mark: string, description: () => string, keywords = ""): PickerEntry => ({
  id,
  type: "email_capture",
  category: "contact",
  label,
  get description() { return description() },
  icon: GlyphSync,
  mark,
  data: { integration_hint: mark },
  keywords,
  hidden: true,
})

/* Round AL: an app block (lib/onepage/app-blocks), one engine for every service. Its mark and colour are the provider's own. */
const app = (provider: AppProviderId, category: PickerCategory, label: () => string, description: () => string, keywords = "", extra?: () => Record<string, unknown>, id = `app_${provider}`): PickerEntry => {
  const p = APP_PROVIDERS[provider]
  const own = APP_GLYPHS[p.mark]
  return {
    id,
    type: "app",
    category,
    get label() { return label() },
    get description() { return description() },
    ...(own ? { icon: own, tile: [p.color, markOn(p.color)] as const } : { brand: p.mark }),
    get data() { return { ...appBlockDefaults(provider), ...(extra ? extra() : {}) } },
    keywords,
  }
}

/* i18n-ignore-start: names of services, and the English words a search also answers to (each entry's own name and line are translated). */
const BRAND = { sheets: "Google Sheets", kit: "Kit", mailerlite: "MailerLite", brevo: "Brevo", flodesk: "Flodesk", make: "Make", webhook: "Webhook", email: "Klaviyo / Omnisend", threads: "Threads", applemusic: "Apple Music", podcasts: "Apple Podcasts", gforms: "Google Forms", gcal: "Google Calendar", bmac: "Buy Me a Coffee", cashapp: "Cash App", loom: "Loom", bandcamp: "Bandcamp", mixcloud: "Mixcloud", typeform: "Typeform", tally: "Tally", bluesky: "Bluesky", snapchat: "Snapchat", venmo: "Venmo", maps: "Google Maps", calendly: "Calendly", audiomack: "Audiomack", fourthwall: "Fourthwall", bonfire: "Bonfire", cameo: "Cameo", reddit: "Reddit", discord: "Discord", luma: "Luma", eventbrite: "Eventbrite" }
const KEYWORDS = {
  heading: "title section header organize",
  faq: "questions answers help",
  course: "class lessons learn",
  video: "youtube vimeo tiktok watch",
  music: "spotify soundcloud apple song album playlist audio",
  map: "address location place google maps business directions",
  contact_form: "message inquiry form email me get in touch",
  testimonials: "reviews quotes social proof",
  countdown: "timer launch drop",
  embed: "embed iframe widget post form player instagram twitter typeform tally google forms substack podcast twitch loom mixcloud bandcamp deezer calendar",
  link: "url button website",
  text: "paragraph bio words",
  social_row: "instagram tiktok youtube profiles icons",
  image: "picture photo gallery carousel",
  group: "carousel folder",
  divider: "spacer line gap",
  product: "single product one digital download shop buy",
  coaching: "booking calendar meeting session consult calendly cal.com one on one 1:1",
  store_link: "store etsy amazon",
  pdf_document: "document guide file pdf",
  food_menu: "restaurant cafe bar",
  email_capture: "newsletter subscribe lead magnet form",
  int_youtube: "video channel",
  int_spotify: "music",
  int_vimeo: "video",
  int_soundcloud: "music audio",
  int_applemusic: "music song album",
  int_booking: "booking coaching calendar cal.com schedule",
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
  int_omnisend: "newsletter email marketing list sync sms",
  int_mailchimp: "newsletter email marketing audience list",
  int_kit: "convertkit newsletter email creator",
  int_beehiiv: "newsletter email publication",
  int_mailerlite: "newsletter email group automation",
  int_brevo: "sendinblue newsletter email sms list",
  int_flodesk: "newsletter email creator segment",
  int_zapier: "automation webhook zap apps",
  int_make: "automation webhook integromat scenario",
  int_sheets: "spreadsheet google sheet rows export",
  int_webhook: "webhook api json developer",
  int_posts_instagram: "feed carousel reels grid",
  int_posts_tiktok: "feed carousel videos",
  int_posts_youtube: "youtube videos posts row pick",
  shelf: "all products shop store catalog storelib",
  shelf_digital: "digital product downloads ebooks templates guides files storelib",
  shelf_physical: "merch shop ship storelib",
  shelf_course: "online course classes storelib",
  shelf_membership: "subscription monthly storelib",
  shelf_community: "group members storelib",
  session_one: "1:1 coaching call consult booking",
  session_bundle: "package coaching sessions booking",
  magnet_download: "lead magnet freebie ebook guide pdf",
  magnet_discount: "lead magnet coupon offer email",
  magnet_waitlist: "launch early access list",
  referral: "affiliate promo code discount partner coupon",
  followers: "audience social proof count total",
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
  app_instagram: "posts reels profile feed",
  app_tiktok: "profile videos feed",
  app_tiktok_video: "video clip",
  app_x: "twitter tweet posts profile",
  app_threads: "posts profile meta",
  app_facebook: "page posts videos reels",
  app_snapchat: "profile snap",
  app_pinterest: "pins boards",
  app_twitch: "stream live channel",
  app_reddit: "subreddit profile post",
  app_rss: "feed blog news",
  app_cameo: "personal video shoutout fans",
  app_google_reviews: "reviews google rating stars business",
  app_audiomack: "music songs album",
  app_podcasts: "podcast episode show spotify apple listeners",
  app_typeform: "form survey quiz",
  app_discord: "server community chat",
  app_whatsapp_group: "group channel community telegram",
  app_books: "amazon author book",
  app_affiliate: "affiliate picks products recommend amazon",
  app_tips: "tip donate support ko-fi paypal coffee",
  app_mobile_app: "app store google play ios android download",
  app_events: "tour concerts tickets shows events dates",
  app_stats: "numbers metrics key figures",
  app_poll: "vote question survey",
  app_event: "event rsvp party launch meetup workshop tickets countdown",
  app_luma: "luma lu.ma event calendar embed rsvp",
  app_eventbrite: "eventbrite event tickets",
  app_paid: "paid access paywall locked members only premium exclusive",
  app_reviews: "reviews testimonials trustpilot google rating stars",
  app_contact: "vcard business card phone save contact",
  app_email: "email address mail",
  app_note: "text button paragraph",
  int_canva: "canva design slides presentation poster flyer deck",
}
/* i18n-ignore-end */

/* One of ./extra-blocks' entries, read when it is drawn (spread, its words would be read once, at import, in English). */
const extra = (key: keyof typeof EXTRA_BLOCK_CATALOG & keyof typeof KEYWORDS, category: PickerCategory, tile: TileColors, overrides: { label?: () => string; description?: () => string; icon?: Glyph; brand?: string; hidden?: boolean } = {}): PickerEntry => {
  const src = EXTRA_BLOCK_CATALOG[key]
  return {
    id: key,
    type: src.type,
    category,
    get label() { return overrides.label ? overrides.label() : src.label },
    get description() { return overrides.description ? overrides.description() : src.description },
    ...(overrides.brand ? { brand: overrides.brand } : { icon: overrides.icon ?? src.icon, tile }),
    keywords: KEYWORDS[key],
    ...(overrides.hidden ? { hidden: true } : {}),
  }
}

/** What the sheet opens on: a short pick from every category, in this order. */
export const ESSENTIAL_ENTRY_IDS = ["link", "shelf_digital", "app_instagram", "app_tiktok", "int_youtube", "email_capture", "form_quiz", "coaching", "image", "text", "whatsapp", "social_row"]

export const PICKER_ENTRIES: PickerEntry[] = [
  /* Essentials: what nearly every page has. */
  { id: "link", type: "link_button", category: "essentials", get label() { return tt("Link") }, get description() { return tt("Add any web address") }, icon: GlyphLink, tile: TILE.ink, keywords: KEYWORDS.link },
  { id: "social_row", type: "social_row", category: "essentials", get label() { return tt("Social icons") }, get description() { return tt("Your profiles as a row of icons") }, icon: GlyphSocial, tile: TILE.sky, keywords: KEYWORDS.social_row },
  { id: "group", type: "group", category: "essentials", get label() { return tt("Group") }, get description() { return tt("Hold links together, stacked or sliding") }, icon: GlyphGroup, tile: TILE.stone, keywords: KEYWORDS.group },
  { id: "divider", type: "divider", category: "essentials", get label() { return tt("Divider") }, get description() { return tt("Space between blocks") }, icon: GlyphDivider, tile: TILE.stone, keywords: KEYWORDS.divider },

  /* Commerce: Storelib's own things, read live (components/onepage/storelib-blocks), and selling elsewhere. */
  { id: "shelf_digital", type: "storelib_shelf", category: "commerce", get label() { return tt("Digital products") }, get description() { return tt("Sell guides, templates, files and more") }, icon: GlyphDownload, tile: TILE.orange, data: { source: "digital" }, keywords: KEYWORDS.shelf_digital },
  { id: "shelf_physical", type: "storelib_shelf", category: "commerce", get label() { return tt("Physical products") }, get description() { return tt("Show what you ship and sell more") }, icon: GlyphBox, tile: TILE.amber, data: { source: "physical" }, keywords: KEYWORDS.shelf_physical },
  { id: "coaching", type: "calendly", category: "commerce", get label() { return tt("Coaching and bookings") }, get description() { return tt("Sell sessions, consultations and private coaching") }, icon: GlyphBooking, tile: TILE.lavender, get data() { return { title: tt("Book a coaching call"), button_text: tt("Book a call") } }, keywords: KEYWORDS.coaching },
  { id: "shelf_course", type: "storelib_shelf", category: "commerce", get label() { return tt("Courses") }, get description() { return tt("Sell online courses and lessons") }, icon: GlyphCourse, tile: TILE.pink, data: { source: "course" }, keywords: KEYWORDS.shelf_course },
  { id: "shelf_membership", type: "storelib_shelf", category: "commerce", get label() { return tt("Memberships") }, get description() { return tt("Your memberships and their price") }, icon: GlyphStar, tile: TILE.plum, data: { source: "membership" }, keywords: KEYWORDS.shelf_membership },
  { id: "shelf_community", type: "storelib_shelf", category: "commerce", get label() { return tt("Community") }, get description() { return tt("Your Storelib community") }, icon: GlyphPeople, tile: TILE.sky, data: { source: "community", layout: "list" }, keywords: KEYWORDS.shelf_community },
  app("tips", "commerce", () => tt("Tips"), () => tt("Accept tips from your audience"), KEYWORDS.app_tips),
  app("paid", "commerce", () => tt("Paid access"), () => tt("Text and a link people pay to see"), KEYWORDS.app_paid),
  app("affiliate", "commerce", () => tt("Affiliate products"), () => tt("Earn by sharing products you love"), KEYWORDS.app_affiliate),
  { id: "referral", type: "promo_code", category: "commerce", get label() { return tt("Discount code") }, get description() { return tt("Show a code people can copy") }, icon: GlyphTag, tile: TILE.rose, keywords: KEYWORDS.referral },
  /* Round AR: Fourthwall and Bonfire are gone from the sheet (the owner: "get rid of Fourthwall, or Bonfire"); a saved one is drawn as a plain link (components/onepage/app-block RetiredView). */
  app("books", "commerce", () => tt("Books"), () => tt("Promote your books"), KEYWORDS.app_books),
  app("discord", "commerce", () => BRAND.discord, () => tt("Invite people to your server"), KEYWORDS.app_discord),
  app("whatsapp_group", "commerce", () => tt("WhatsApp group"), () => tt("Grow your group or channel"), KEYWORDS.app_whatsapp_group),
  app("mobile_app", "commerce", () => tt("Mobile app"), () => tt("Get more downloads of your app"), KEYWORDS.app_mobile_app),

  /* Social: each network, one entry, drawn as a profile, a card, its posts. */
  app("instagram", "social", () => "Instagram", () => tt("Show your posts and reels"), KEYWORDS.app_instagram),
  app("tiktok", "social", () => "TikTok", () => tt("Share your TikTok profile"), KEYWORDS.app_tiktok),
  app("x", "social", () => "X", () => tt("Show your posts and profile"), KEYWORDS.app_x),
  app("threads", "social", () => BRAND.threads, () => tt("Show your latest threads"), KEYWORDS.app_threads),
  app("facebook", "social", () => "Facebook", () => tt("Add your page, posts and videos"), KEYWORDS.app_facebook),
  app("snapchat", "social", () => BRAND.snapchat, () => tt("Promote your public profile"), KEYWORDS.app_snapchat),
  app("pinterest", "social", () => "Pinterest", () => tt("Show your pins and boards"), KEYWORDS.app_pinterest),
  app("twitch", "social", () => "Twitch", () => tt("Get more viewers for your stream"), KEYWORDS.app_twitch),
  app("reddit", "social", () => BRAND.reddit, () => tt("Show your Reddit profile or a post"), KEYWORDS.app_reddit),
  /* Round AR: one Reviews block for the store's own, Trustpilot's and a Google score; the Google card stays beside it. */
  app("reviews", "social", () => tt("Reviews"), () => tt("Your Storelib, Google or Trustpilot reviews"), KEYWORDS.app_reviews),
  app("google_reviews", "social", () => tt("Google reviews"), () => tt("Show your Google reviews"), KEYWORDS.app_google_reviews),
  extra("testimonials", "social", TILE.butter),
  { id: "followers", type: "followers", category: "social", get label() { return tt("Followers") }, get description() { return tt("Your total followers across networks") }, icon: GlyphTestimonials, tile: TILE.mint, keywords: KEYWORDS.followers },
  app("cameo", "social", () => BRAND.cameo, () => tt("Let fans book a personal video"), KEYWORDS.app_cameo),
  app("rss", "social", () => tt("RSS feed"), () => tt("Share your feed"), KEYWORDS.app_rss),

  /* Media: what plays on the page. A service with a player of its own adds that block. */
  extra("video", "media", TILE.rose, { label: () => tt("Video"), description: () => tt("Play a video right on your page") }),
  { id: "int_youtube", type: "video", category: "media", label: "YouTube", get description() { return tt("Share YouTube videos on your page") }, brand: "youtube", keywords: KEYWORDS.int_youtube },
  app("tiktok", "media", () => tt("TikTok video"), () => tt("Share a TikTok video on your page"), KEYWORDS.app_tiktok_video, () => ({ layout: "single" }), "app_tiktok_video"),
  { id: "int_vimeo", type: "video", category: "media", label: "Vimeo", get description() { return tt("Add Vimeo videos to your page") }, brand: "vimeo", keywords: KEYWORDS.int_vimeo },
  { id: "image", type: "image", category: "media", get label() { return tt("Image gallery") }, get description() { return tt("Share a gallery of pictures") }, icon: GlyphImage, tile: TILE.mint, keywords: KEYWORDS.image },
  { id: "pdf_document", type: "pdf_document", category: "media", get label() { return tt("Document") }, get description() { return tt("Show a PDF people can read") }, icon: GlyphDocument, tile: TILE.coral, keywords: KEYWORDS.pdf_document },
  extra("music", "media", TILE.plum, { description: () => tt("Share music and get more streams") }),
  { id: "int_spotify", type: "music", category: "media", label: "Spotify", get description() { return tt("Share your favourite music") }, brand: "spotify", keywords: KEYWORDS.int_spotify },
  { id: "int_applemusic", type: "music", category: "media", label: BRAND.applemusic, get description() { return tt("Share songs, albums and playlists") }, brand: "applemusic", keywords: KEYWORDS.int_applemusic },
  { id: "int_soundcloud", type: "music", category: "media", label: "SoundCloud", get description() { return tt("Get your music heard on SoundCloud") }, brand: "soundcloud", keywords: KEYWORDS.int_soundcloud },
  app("audiomack", "media", () => BRAND.audiomack, () => tt("Share your songs and albums"), KEYWORDS.app_audiomack),
  app("podcasts", "media", () => tt("Podcasts"), () => tt("Get more listeners and subscribers"), KEYWORDS.app_podcasts),
  /* Round AR3: a Canva design in Canva's own player (lib/onepage/creator-blocks embedSource "canva"). */
  { ...embed("int_canva", "Canva", null, "canva", () => tt("Show a Canva design on your page"), KEYWORDS.int_canva, GlyphImage), hidden: false },
  { id: "food_menu", type: "food_menu", category: "media", get label() { return tt("Menu") }, get description() { return tt("A food and drinks menu") }, icon: GlyphMenu, tile: TILE.butter, keywords: KEYWORDS.food_menu },

  /* Contact: forms, a map, a way to reach you. */
  { id: "form_quiz", type: "form_quiz", category: "contact", get label() { return tt("Form") }, get description() { return tt("Collect answers, contacts and messages") }, icon: GlyphForm, tile: TILE.blue, get keywords() { return tt("form quiz questionnaire survey lead intake fitness contact") } },
  extra("contact_form", "contact", TILE.sky, { description: () => tt("Let people get in touch") }),
  { id: "email_capture", type: "email_capture", category: "contact", get label() { return tt("Email signup") }, get description() { return tt("Grow your email list") }, icon: GlyphEmail, tile: TILE.lime, keywords: KEYWORDS.email_capture },
  app("poll", "contact", () => tt("Poll"), () => tt("Ask your audience a quick question"), KEYWORDS.app_poll),
  app("typeform", "contact", () => BRAND.typeform, () => tt("Get answers with a Typeform"), KEYWORDS.app_typeform),
  extra("map", "contact", TILE.mint, { label: () => BRAND.maps, description: () => tt("Show a map of your place or business"), brand: "google-maps" }),
  app("contact", "contact", () => tt("Contact details"), () => tt("A contact card people can save"), KEYWORDS.app_contact),
  extra("faq", "contact", TILE.lavender, { description: () => tt("Share answers to common questions") }),
  app("email", "contact", () => tt("Email"), () => tt("Share your email address"), KEYWORDS.app_email),
  link("whatsapp", "WhatsApp", "whatsapp", () => ({ label: tt("Message on WhatsApp"), url: "https://wa.me/" }), () => tt("Let people message you"), "", "contact", false),
  { id: "int_booking", type: "calendly", category: "contact", label: BRAND.calendly, get description() { return tt("Take bookings right on your page") }, brand: "calendly", get data() { return { title: tt("Book a call"), button_text: tt("Book a call") } }, keywords: KEYWORDS.int_booking },
  app("stats", "contact", () => tt("Stats"), () => tt("Share key numbers"), KEYWORDS.app_stats),
  { id: "magnet_download", type: "lead_magnet", category: "contact", get label() { return tt("Free download") }, get description() { return tt("A free file for an email") }, icon: GlyphDocument, tile: TILE.orange, data: { kind: "download" }, keywords: KEYWORDS.magnet_download },

  /* Events */
  app("events", "events", () => tt("Tour and events"), () => tt("Sell tickets by listing your events"), KEYWORDS.app_events),
  app("event", "events", () => tt("Event"), () => tt("One event with RSVP and tickets"), KEYWORDS.app_event),
  app("luma", "events", () => BRAND.luma, () => tt("Show your Luma event or calendar"), KEYWORDS.app_luma),
  app("eventbrite", "events", () => BRAND.eventbrite, () => tt("Link to your Eventbrite event"), KEYWORDS.app_eventbrite),
  extra("countdown", "events", TILE.cyan, { icon: GlyphCountdown }),

  /* Text */
  { id: "text", type: "text", category: "text", get label() { return tt("Text") }, get description() { return tt("A few lines about you") }, icon: GlyphText, tile: TILE.lavender, keywords: KEYWORDS.text },
  app("note", "text", () => tt("Text and button"), () => tt("Words and an optional button"), KEYWORDS.app_note),
  extra("heading", "text", TILE.stone, { label: () => tt("Header"), description: () => tt("Organize your links into parts"), icon: GlyphHeading }),

  /*
    FOUND BY SEARCH. Everything below was a row of its own and is one thing
    another row already is: the single product (the shelves list them), a
    link to a service (the app blocks, or a Link), the embed block's
    services (the app blocks), the tools a signup goes to (Email signup's
    Connect). Search still finds each one, and a saved block of any of them
    is drawn and edited as before.
  */
  { id: "product", type: "product", category: "commerce", get label() { return tt("Single product") }, get description() { return tt("Feature one of your products") }, icon: GlyphProduct, tile: TILE.orange, keywords: KEYWORDS.product, hidden: true },
  { id: "shelf", type: "storelib_shelf", category: "commerce", get label() { return tt("All products") }, get description() { return tt("A row of your products, always up to date") }, icon: GlyphStore, tile: TILE.orange, data: { source: "all" }, keywords: KEYWORDS.shelf, hidden: true },
  extra("course", "commerce", TILE.pink, { hidden: true }),
  { id: "session_one", type: "calendly", category: "commerce", get label() { return tt("One-on-one session") }, get description() { return tt("People book a session with you") }, icon: GlyphBooking, tile: TILE.lavender, get data() { return { title: tt("Book a 1:1 session"), button_text: tt("Book a session") } }, keywords: KEYWORDS.session_one, hidden: true },
  { id: "session_bundle", type: "calendly", category: "commerce", get label() { return tt("Session bundle") }, get description() { return tt("A pack of sessions, booked by link") }, icon: GlyphBooking, tile: TILE.lavender, get data() { return { title: tt("Book a pack of sessions"), button_text: tt("See the packs") } }, keywords: KEYWORDS.session_bundle, hidden: true },
  { id: "store_link", type: "link_button", category: "commerce", get label() { return tt("Shop link") }, get description() { return tt("Send people to a shop of yours") }, icon: GlyphStore, tile: TILE.orange, get preset() { return { label: tt("Shop now"), url: "" } }, keywords: KEYWORDS.store_link, hidden: true },
  { id: "magnet_discount", type: "lead_magnet", category: "contact", get label() { return tt("Discount for email") }, get description() { return tt("A code they get for their email") }, icon: GlyphEmail, tile: TILE.rose, get data() { return { kind: "discount", title: tt("Get 10% off") } }, keywords: KEYWORDS.magnet_discount, hidden: true },
  { id: "magnet_waitlist", type: "lead_magnet", category: "contact", get label() { return tt("Waitlist") }, get description() { return tt("Collect emails before you launch") }, icon: GlyphEmail, tile: TILE.lime, get data() { return { kind: "waitlist", title: tt("Join the waitlist") } }, keywords: KEYWORDS.magnet_waitlist, hidden: true },
  extra("embed", "media", TILE.stone, { hidden: true }),
  { id: "posts", type: "social_posts", category: "social", get label() { return tt("Posts") }, get description() { return tt("Posts you pick, in a row") }, icon: GlyphSocial, tile: TILE.sky, keywords: KEYWORDS.int_posts_youtube, hidden: true },
  { id: "int_posts_youtube", type: "social_posts", category: "media", get label() { return tt("YouTube videos") }, get description() { return tt("Videos you pick, in a row") }, brand: "youtube", data: { network: "youtube" }, keywords: KEYWORDS.int_posts_youtube, hidden: true },
  { id: "int_posts_instagram", type: "social_posts", category: "social", get label() { return tt("Instagram posts") }, get description() { return tt("Posts and reels in a row") }, brand: "instagram", data: { network: "instagram" }, keywords: KEYWORDS.int_posts_instagram, hidden: true },
  { id: "int_posts_tiktok", type: "social_posts", category: "social", get label() { return tt("TikTok posts") }, get description() { return tt("Your TikToks in a row") }, brand: "tiktok", data: { network: "tiktok" }, keywords: KEYWORDS.int_posts_tiktok, hidden: true },
  embed("int_instagram", "Instagram", "instagram", "instagram", () => tt("Show a post or reel"), KEYWORDS.int_instagram),
  embed("int_x", "X", "twitter", "x", () => tt("Show a post"), KEYWORDS.int_x),
  embed("int_twitch", "Twitch", "twitch", "twitch", () => tt("Your stream, a video or a clip"), KEYWORDS.int_twitch),
  embed("int_loom", BRAND.loom, "loom", "loom", () => tt("Play a Loom video"), KEYWORDS.int_loom),
  embed("int_podcasts", BRAND.podcasts, "apple-podcasts", "podcasts", () => tt("Play your show or an episode"), KEYWORDS.int_podcasts),
  embed("int_bandcamp", BRAND.bandcamp, "bandcamp", "bandcamp", () => tt("Play an album or a track"), KEYWORDS.int_bandcamp),
  embed("int_mixcloud", BRAND.mixcloud, "mixcloud", "mixcloud", () => tt("Play a mix or a show"), KEYWORDS.int_mixcloud),
  embed("int_gcal", BRAND.gcal, "google-calendar", "gcal", () => tt("People book a time without leaving"), KEYWORDS.int_gcal),
  embed("int_typeform", BRAND.typeform, "typeform", "typeform", () => tt("A form people fill in on your page"), KEYWORDS.int_typeform),
  embed("int_gforms", BRAND.gforms, "google-forms", "googleforms", () => tt("A form people fill in on your page"), KEYWORDS.int_gforms),
  embed("int_tally", BRAND.tally, null, "tally", () => tt("A form people fill in on your page"), KEYWORDS.int_tally, GlyphContact, "tally"),
  embed("int_substack", "Substack", "substack", "substack", () => tt("People join your newsletter"), KEYWORDS.int_substack),
  { id: "int_email", type: "email_capture", category: "contact", label: "Klaviyo", get description() { return tt("Signups go to your email tool too") }, icon: GlyphSync, mark: "klaviyo", data: { integration_hint: "klaviyo" }, keywords: KEYWORDS.int_email, hidden: true },
  { id: "int_omnisend", type: "email_capture", category: "contact", label: "Omnisend", get description() { return tt("Signups go to your email tool too") }, icon: GlyphSync, mark: "omnisend", data: { integration_hint: "omnisend" }, keywords: KEYWORDS.int_omnisend, hidden: true },
  /* Round 40: each signup sent the moment it happens (lib/onepage/integrations). */
  tool("int_mailchimp", "Mailchimp", "mailchimp", () => tt("Signups go to your audience"), KEYWORDS.int_mailchimp),
  tool("int_kit", BRAND.kit, "kit", () => tt("Signups go to your Kit account"), KEYWORDS.int_kit),
  tool("int_beehiiv", "beehiiv", "beehiiv", () => tt("Signups go to your publication"), KEYWORDS.int_beehiiv),
  tool("int_mailerlite", BRAND.mailerlite, "mailerlite", () => tt("Signups go to your MailerLite group"), KEYWORDS.int_mailerlite),
  tool("int_brevo", BRAND.brevo, "brevo", () => tt("Signups go to your Brevo list"), KEYWORDS.int_brevo),
  tool("int_flodesk", BRAND.flodesk, "flodesk", () => tt("Signups go to your Flodesk segment"), KEYWORDS.int_flodesk),
  tool("int_zapier", "Zapier", "zapier", () => tt("Send each signup to any app"), KEYWORDS.int_zapier),
  tool("int_make", BRAND.make, "make", () => tt("Send each signup to a scenario"), KEYWORDS.int_make),
  tool("int_sheets", BRAND.sheets, "sheets", () => tt("Each signup as a new row"), KEYWORDS.int_sheets),
  tool("int_webhook", BRAND.webhook, "webhook", () => tt("Each signup sent to your own address"), KEYWORDS.int_webhook),

  /* Links to the places people already are: found by search, a Link with the service's mark on it. */
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
  link("telegram", "Telegram", "telegram", () => ({ label: tt("Message on Telegram"), url: "https://t.me/" }), () => tt("Let people message you"), "", "contact"),
  link("discord", "Discord", "discord", () => ({ label: tt("Join Discord"), url: "https://discord.gg/" }), () => tt("Invite people to your server")),
  link("vimeo", "Vimeo", "vimeo", () => ({ label: tt("Watch on Vimeo"), url: "https://vimeo.com/" }), () => tt("Link to your videos")),
  link("amazon", "Amazon", "amazon", () => ({ label: tt("Shop my Amazon picks"), url: "https://www.amazon.com/shop/", icon: "amazon" }), () => tt("Link to your storefront"), KEYWORDS.amazon, "commerce"),
  link("etsy", "Etsy", "etsy", () => ({ label: tt("Shop on Etsy"), url: "https://www.etsy.com/shop/", icon: "etsy" }), () => tt("Link to your shop"), KEYWORDS.etsy, "commerce"),
  link("patreon", "Patreon", "patreon", () => ({ label: tt("Join on Patreon"), url: "https://patreon.com/", icon: "patreon" }), () => tt("Link to your page"), KEYWORDS.patreon, "commerce"),
  link("substack_link", "Substack", "substack", () => ({ label: tt("Read on Substack"), url: "https://substack.com/@", icon: "substack" }), () => tt("Link to your newsletter"), KEYWORDS.substack),
  link("kofi", "Ko-fi", "kofi", () => ({ label: tt("Buy me a coffee"), url: "https://ko-fi.com/", icon: "kofi" }), () => tt("Let people tip you"), KEYWORDS.kofi, "commerce"),
  link("bmac", BRAND.bmac, "buymeacoffee", () => ({ label: tt("Buy me a coffee"), url: "https://buymeacoffee.com/", icon: "buymeacoffee" }), () => tt("Let people tip you"), KEYWORDS.bmac, "commerce"),
  link("paypal", "PayPal", "paypal", () => ({ label: tt("Pay with PayPal"), url: "https://paypal.me/", icon: "paypal" }), () => tt("Let people pay or tip you"), KEYWORDS.paypal, "commerce"),
  link("cashapp", BRAND.cashapp, "cashapp", () => ({ label: tt("Pay with Cash App"), url: "https://cash.app/$", icon: "cashapp" }), () => tt("Let people pay or tip you"), KEYWORDS.cashapp, "commerce"),
  link("venmo", BRAND.venmo, "venmo", () => ({ label: tt("Pay with Venmo"), url: "https://venmo.com/u/", icon: "venmo" }), () => tt("Let people pay or tip you"), KEYWORDS.venmo, "commerce"),
  link("github", "GitHub", "github", () => ({ label: tt("See my code"), url: "https://github.com/", icon: "github" }), () => tt("Link to your profile")),
  link("notion", "Notion", "notion", () => ({ label: tt("View page"), url: "https://notion.so/", icon: "notion" }), () => tt("Link to a Notion page")),
  { id: "podcast", type: "link_button", category: "media", get label() { return tt("Podcast link") }, get description() { return tt("Link to your show") }, icon: GlyphPodcast, tile: TILE.plum, get preset() { return { label: tt("Listen to the podcast"), url: "" } }, hidden: true },
]

/*
 * ROUND AP: A BLOCK'S ROW WEARS ITS PICKER ENTRY. The owner: "for the digital
 * products block, in the list of the links, the icons are not like they are
 * in the add block model". A shelf's row was a generic shop glyph on grey for
 * every kind; the picker drew Digital products as a download on orange,
 * Courses as a book on pink. The row now draws the entry the block came from:
 * its glyph on its tile's colours. The entry is the one whose data says the
 * same thing the block's does (a shelf's `source`, an app's `provider`, a lead
 * magnet's `kind`, a posts block's `network`), else the block type's own
 * plain entry. An entry drawn as a service's mark (a brand) has no tile: the
 * row keeps the mark it already draws.
 */
const ROW_KEYS = ["source", "provider", "kind", "network"] as const

function entryData(e: PickerEntry): Record<string, unknown> | null {
  const d = (e as { data?: unknown }).data
  return d && typeof d === "object" ? (d as Record<string, unknown>) : null
}

export function blockPickerTile(block: { type: string; data?: unknown }): { icon: Glyph; tile: TileColors; matched: boolean } | null {
  const data = (block.data && typeof block.data === "object" ? block.data : {}) as Record<string, unknown>
  let plain: PickerEntry | null = null
  for (const e of PICKER_ENTRIES) {
    if (e.type !== block.type) continue
    const ed = entryData(e)
    const keys = ROW_KEYS.filter((k) => ed && k in ed)
    if (keys.length) {
      if (keys.every((k) => ed![k] === data[k])) return e.icon && e.tile ? { icon: e.icon, tile: e.tile, matched: true } : null
      continue
    }
    if (!plain || (plain.hidden && !e.hidden)) plain = e
  }
  return plain?.icon && plain.tile ? { icon: plain.icon, tile: plain.tile, matched: false } : null
}

/** The entries a search finds, best first: a name that starts with the words, then a name that has them, then the line and the other words. Listed entries first on a tie. */
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
    if (score > 0) scored.push({ e, score: score * 2 + (e.hidden ? 0 : 1) })
  }
  /*
    ONE THING, ONE ROW, IN A SEARCH TOO (round AO). "insta" listed four rows
    with the Instagram mark, three of them named just "Instagram": the app
    block, the old embed and the old link. The app block shows a post and
    links to the profile itself, so when it is found, the embed and the link
    with its mark are left out. A saved block of either still edits as before.
  */
  const sorted = scored.sort((a, b) => b.score - a.score).map((s) => s.e)
  const listedBrands = new Set(sorted.filter((e) => !e.hidden && e.brand).map((e) => e.brand))
  return sorted.filter((e) => !(e.hidden && e.brand && listedBrands.has(e.brand) && (e.type === "embed" || e.type === "link_button")))
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

/** The view the sheet opens on. */
export type PickerView = PickerCategory | "all"
const FIRST_VIEW: PickerView = "essentials"

/** The diameter of a row's round tile, and of the mark on it. */
export const PICKER_TILE = 46
const PICKER_MARK = 22
const HAIRLINE: React.CSSProperties = { boxShadow: "inset 0 0 0 1px rgba(17,17,19,0.1)" }

/*
  Round AL, the owner: "I don't like that they're light gray. You can make
  them more colour and different with the specific icons ... for the apps
  that actually are companies, just use their original icon." Each entry
  sits on a round tile of its own colour; a company's mark is white (or near
  black, whichever reads) on the company's colour, Instagram on its own
  gradient, and a mark of several colours (Google Maps, Google) on white.
*/
export function EntryIcon({ entry, size = PICKER_TILE }: { entry: PickerEntry; size?: number }) {
  const inner = Math.round((size * PICKER_MARK) / PICKER_TILE)
  if (entry.mark) {
    return (
      <RoundTile color="#ffffff" ink="#1a1a2e" size={size} style={HAIRLINE}>
        <IntegrationMark id={entry.mark} size={inner} />
      </RoundTile>
    )
  }
  if (entry.brandIcon) {
    const B = entry.brandIcon
    return (
      <RoundTile color="#1a1a2e" ink="#ffffff" size={size}>
        <B size={inner} color="#ffffff" />
      </RoundTile>
    )
  }
  if (entry.brand) {
    const key = entry.brand
    if (isMulticolorMark(key)) {
      return (
        <RoundTile color="#ffffff" ink="#1a1a2e" size={size} style={HAIRLINE}>
          <AppMark id={key} size={inner} />
        </RoundTile>
      )
    }
    const fill = key === "instagram" ? INSTAGRAM_FILL : brandColor(key) ?? "#111113"
    const ink = key === "instagram" ? "#ffffff" : markOn(fill)
    return (
      <RoundTile color={fill} ink={ink} size={size}>
        <AppMark id={key} size={inner} color={ink} />
      </RoundTile>
    )
  }
  const [fill, ink] = entry.tile ?? TILE.lavender
  const G = entry.icon ?? GlyphLink
  return (
    <RoundTile color={fill} ink={ink} size={size} style={fill.toLowerCase() === "#ffffff" ? HAIRLINE : undefined}>
      <G style={{ width: inner, height: inner }} />
    </RoundTile>
  )
}

/**
 * ONE ROW, ONE PER LINE, as Linktree's list: the tile, the name, one line,
 * a chevron. A press is a calm tint and nothing else: no scale, no lift
 * (round 11: "each button there, it bumps. I don't want that bump with the
 * finger"). The grey under a mouse is only for a mouse (hover: hover), so a
 * finger sliding over the list never lights a row up. Memoised: the rows
 * never render again when the sheet opens, a chip changes or a search is
 * typed; only `hidden` on their section does.
 */
const EntryRow = React.memo(function EntryRow({ entry, disabled, note, onPick }: { entry: PickerEntry; disabled: boolean; note?: string | null; onPick: (e: PickerEntry) => void }) {
  return (
    <button
      type="button"
      data-picker-entry={entry.id}
      disabled={disabled}
      onClick={() => onPick(entry)}
      className={cn(
        "flex w-full min-w-0 items-center gap-3.5 rounded-2xl px-2 py-2 text-left outline-none [-webkit-tap-highlight-color:transparent]",
        "transition-[background-color] duration-150 ease-out focus-visible:shadow-[0_0_0_2px_rgba(26,26,46,0.3)] motion-reduce:transition-none",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer active:bg-[#f0f0f2] hover:bg-[#f6f6f7]",
      )}
    >
      <EntryIcon entry={entry} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium leading-5 text-[#111113]">{entry.label}</span>
        <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-[#6b7280]">{note || entry.description}</span>
      </span>
      <ChevronRight aria-hidden className="h-[18px] w-[18px] shrink-0 text-[#9ca3af]" strokeWidth={1.8} />
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

/** A heading and its rows, one per line. Memoised on what it shows, so the open, a chip or a keystroke never renders its rows again. */
const PickerSection = React.memo(function PickerSection({ id, title, entries, limited, hidden, onPick, prefix = "" }: { id: string; title: string; entries: PickerEntry[]; limited: string; hidden: boolean; onPick: (e: PickerEntry) => void; prefix?: string }) {
  const atLimit = limited ? limited.split(",") : []
  return (
    <section data-picker-section={id} data-shown={hidden ? undefined : ""} aria-hidden={hidden || undefined} style={hidden ? SECTION_OFF : undefined} className="pb-3">
      <h3 className="px-2 pb-1.5 pt-3 text-[14px] font-semibold text-[#111113]" data-picker-heading={id}>{title}</h3>
      <div className="flex flex-col gap-0.5" data-picker-rows="">
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
  lead,
}: {
  /** Adding into a group: only what a group holds (lib/onepage/group canGoInGroup). */
  inGroup: boolean
  /** Round 41: a section over the catalogue (Add to group's blocks already on the page, ./group-add-existing). */
  lead?: React.ReactNode
  onPick: (entry: PickerEntry) => void
  /** A type the page has as many of as it may (two rows of social icons). */
  atLimit: (type: OnePageBlockType) => boolean
  /** Whether the sheet is up: what was typed and chosen goes back once it has closed. */
  open: boolean
}) {
  const [category, setCategory] = React.useState<PickerView>(FIRST_VIEW)
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
      setCategory(FIRST_VIEW)
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
  const listed = React.useMemo(() => allowed.filter((e) => !e.hidden), [allowed])
  const searching = query.trim().length > 0
  const found = React.useMemo(() => (searching ? searchEntries(allowed, query) : []), [allowed, query, searching])
  const recentEntries = React.useMemo(() => recent.map((id) => allowed.find((e) => e.id === id)).filter((e): e is PickerEntry => !!e), [recent, allowed])
  const categories = React.useMemo(() => PICKER_CATEGORIES.filter((c) => listed.some((e) => e.category === c.id)), [listed])
  const byCategory = React.useMemo(() => new Map(categories.map((c) => [c.id, listed.filter((e) => e.category === c.id)])), [categories, listed])
  /* Essentials: the short pick, in its own order, from every category. */
  const essentials = React.useMemo(() => ESSENTIAL_ENTRY_IDS.map((id) => listed.find((e) => e.id === id)).filter((e): e is PickerEntry => !!e), [listed])
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
  const choose = (id: PickerView) => {
    setCategory(id)
    if (listRef.current) listRef.current.scrollTop = 0
  }
  /* Round AL: Essentials first, the categories, then View all, as Linktree's list. */
  const chips = React.useMemo(() => [...categories.map((c) => ({ id: c.id as PickerView, label: c.label })), { id: "all" as const, label: tt("View all") }], [categories])
  const atTop = category === "essentials" || category === "all"

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
              scroll={{ wrapClassName: "-mx-4 sm:-mx-5" }}
              className="flex gap-2 px-4 py-0.5 sm:px-5"
              itemClassName="h-10 px-4 text-[13px] sm:h-9"
            />
          </div>
        ) : null}
      </div>

      {/*
        THE LIST. Every view's rows are built once and kept; a chip only says
        which sections are `hidden`, so a switch neither builds nor throws
        away a row. Its own layer of paint (contain), and a scroll that stays
        inside it (overscroll-contain), as the website builder's sheet lists.
      */}
      <div ref={listRef} data-picker-list="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-[#f0f0f2] px-2 pb-6 pt-1 [contain:content] sm:px-3">
        {searching ? (
          found.length ? (
            <div className="flex flex-col gap-0.5 pt-2" data-picker-found="">
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
        {lead && !searching && atTop ? lead : null}
        {recentEntries.length ? (
          <PickerSection id="recent" title={tt("Recently used")} entries={recentEntries} limited={limited} hidden={searching || !atTop} onPick={pick} prefix="r-" />
        ) : null}
        <PickerSection id="essentials-pick" title={tt("Essentials")} entries={essentials} limited={limited} hidden={searching || category !== "essentials"} onPick={pick} prefix="e-" />
        {categories.map((c) => (
          <PickerSection key={c.id} id={c.id} title={c.label} entries={byCategory.get(c.id) ?? []} limited={limited} hidden={searching || (category !== "all" && category !== c.id) || (c.id === "essentials" && category !== "all")} onPick={pick} />
        ))}
      </div>
    </div>
  )
}
