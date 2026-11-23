/**
 * ===========================================================================
 *  AN APP'S LISTING, ITS INSTALL STEPS AND ITS INSTALLED PAGE (round 58)
 * ===========================================================================
 * What an integration's page shows before it is installed (the listing: a
 * column with the mark, name, pricing, category, developer and Install, and
 * beside it the media, what it does, what it does in Storelib and what it
 * needs), the short numbered steps of its install sheet, and what its
 * installed page lists (what is synced, recent activity). Read by
 * components/app/integrations/* and tests/apps-pages-r58.test.ts.
 *
 * MEDIA (round 60). Each integration's demo video and up to three more,
 * every one checked against the provider's own YouTube channel with
 * YouTube's oEmbed (lib/integrations/videos.ts, with the date it was
 * checked): an ID is never guessed. The gallery shows them by their own
 * YouTube thumbnails, loaded from i.ytimg.com when the page is shown; with
 * none it draws Storelib's own illustrations of what the integration does
 * here, which need no rights. A screenshot is only ever a file in /public
 * with its source noted where it is listed.
 *
 * Every word here is a fact the catalog already holds (lib/integrations
 * catalog.ts, lib/integrations/detail-actions.ts) or the hint the key field
 * already shows (components/physical/integrations-marketplace.tsx KEY_FIELD,
 * components/physical/shipping-app-facts.tsx KEY_HINT). Nothing is a price
 * or a figure about the provider.
 *
 * Pure: no I/O.
 */
import { CATEGORY_NAMES, type Integration } from "@/lib/integrations/catalog"
import { TRACKERS } from "@/lib/store/tracking"
import { installVerb, oneTapInstall, setupSteps } from "@/lib/integrations/detail-actions"
import { GALLERY_VIDEOS, VERIFIED_VIDEOS, type VerifiedVideo } from "@/lib/integrations/videos"

export { GALLERY_VIDEOS, VERIFIED_VIDEOS, type VerifiedVideo }

/** A picture in /public that Storelib may show, and where it came from. */
export interface AppScreenshot {
  src: string
  alt: string
  /** Where it came from (a press kit's address, or "Storelib"). */
  source: string
}

/** What the gallery's illustration draws: what the integration does in Storelib, in Storelib's own UI. */
export type SceneKind = "orders" | "labels" | "shipments" | "subscribers" | "pixel" | "reviews" | "bookings" | "community" | "signups" | "parcels" | "analytics" | "soon"

export interface AppMedia {
  video: VerifiedVideo | null
  /** More checked videos from the provider, shown as thumbnail tiles. */
  more: VerifiedVideo[]
  screenshots: AppScreenshot[]
  scene: SceneKind
}

/** Pictures by catalog id. Empty: no press kit image was reachable to check its terms (round 58). */
export const SCREENSHOTS: Partial<Record<string, AppScreenshot[]>> = {}

/** An 11 character YouTube ID, and nothing else. */
export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

/**
 * A video's own thumbnail on YouTube's image host, loaded when the page is
 * shown and never copied into /public. maxresdefault is 1280x720, 16:9, with
 * no bars; every checked ID's answered 200 the day it was checked.
 */
export function youtubeThumbUrl(id: string): string | null {
  if (!YOUTUBE_ID.test(id)) return null
  return `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`
}

/** The privacy-enhanced embed, only for a well formed ID; null for anything else. */
export function youtubeEmbedUrl(id: string, autoplay = true): string | null {
  if (!YOUTUBE_ID.test(id)) return null
  return `https://www.youtube-nocookie.com/embed/${id}?${autoplay ? "autoplay=1&" : ""}rel=0&modestbranding=1&playsinline=1`
}

export function sceneFor(item: Integration): SceneKind {
  if (item.comingSoon || item.kind === "listed") return "soon"
  if (item.appId === "storelib_reviews") return "reviews"
  if (item.appId === "booking_sync") return "bookings"
  if (item.appId === "discord_roles" || item.appId === "telegram_access") return "community"
  if (item.appId === "onepage_signups") return "signups"
  if (item.appId === "courier_tracking") return "parcels"
  if (item.appId === "analytics_destinations") return "analytics"
  if (item.appId === "marketing_sync") return "subscribers"
  if (item.kind === "tracker") return item.trackerId === "klaviyo" || item.trackerId === "omnisend" ? "subscribers" : "pixel"
  if (item.providerId === "shipstation") return "shipments"
  if (item.category === "shipping") return "labels"
  return "orders"
}

export function mediaFor(item: Integration): AppMedia {
  const video = item.comingSoon || item.kind === "listed" ? null : (VERIFIED_VIDEOS[item.id] ?? null)
  return { video, more: video ? (GALLERY_VIDEOS[item.id] ?? []) : [], screenshots: SCREENSHOTS[item.id] ?? [], scene: sceneFor(item) }
}

/** How the page installs it: one press, the provider's own sign in, a sheet with steps, or a request to be told. */
export type InstallMode = { kind: "one_tap" } | { kind: "oauth"; href: string } | { kind: "sheet" } | { kind: "notify" } | { kind: "none" }

/**
 * OAUTH GOES STRAIGHT THERE. Discord is the one connection Storelib makes
 * through the provider's own sign in (app/api/community-roles/discord/connect):
 * Install is that link, with no sheet in between.
 */
export const OAUTH_START: Partial<Record<string, string>> = {
  discord: "/api/community-roles/discord/connect",
}

export function installMode(item: Integration, notifyOnly: boolean): InstallMode {
  if (notifyOnly) return { kind: "notify" }
  if (oneTapInstall(item)) return { kind: "one_tap" }
  const oauth = OAUTH_START[item.id]
  if (oauth) return { kind: "oauth", href: oauth }
  if (installVerb(item) || item.appId === "telegram_access" || item.appId === "analytics_destinations") return { kind: "sheet" }
  return { kind: "none" }
}

/** The button's word: Install, Connect, Turn on, Set up, or Tell me when it's ready. */
export function installLabel(item: Integration, mode: InstallMode): string {
  if (mode.kind === "notify") return "Tell me when it's ready"
  if (mode.kind === "oauth") return "Connect"
  return installVerb(item) ?? "Set up"
}

/**
 * THE SHEET'S STEPS: short, numbered, each one thing to do, the last one
 * always "paste it here". Where the provider's own place for the key is
 * known (the hint its key field shows), the steps name it.
 */
const KEY_STEPS: Record<string, string[]> = {
  printful: ["Open Printful, Developer portal, Your tokens.", "Create a token with the orders, sync products and webhooks scopes.", "Paste it here. Storelib checks it with Printful."],
  printify: ["Open Printify, My account, Connections, API tokens.", "Generate a token with orders, products, shops and webhooks access.", "Paste it here. Storelib checks it with Printify."],
  gelato: ["Open Gelato, Developer, API keys.", "Create a key.", "Paste it here. Storelib checks it with Gelato."],
  "cj-dropshipping": ["Open CJ, My CJ, Authorization, API.", "Copy your API key.", "Paste it here. Storelib checks it with CJ."],
  shipstation: ["Open ShipStation, Settings, Account, API Settings.", "Copy the API key and the API secret.", "Paste both here. Storelib checks them with ShipStation."],
  shippo: ["Open Shippo, Settings, Advanced, API.", "Copy a live key, or a test key to try free sample labels.", "Paste it here. Storelib checks it with Shippo."],
  easypost: ["Open EasyPost, Account, API Keys.", "Copy a production key, or a test key to try free sample labels.", "Paste it here. Storelib checks it with EasyPost."],
  aftership: ["Open AfterShip, Settings, API keys.", "Create a key, and copy the webhook secret too.", "Paste them here."],
  mailchimp: ["Open Mailchimp, Profile, Extras, API keys.", "Create a key.", "Paste it here and pick the audience."],
}

export function installSteps(item: Integration): string[] {
  if (KEY_STEPS[item.id]) return KEY_STEPS[item.id]
  if (item.kind === "tracker" && item.trackerId && item.trackerId !== "klaviyo" && item.trackerId !== "omnisend") {
    const t = TRACKERS[item.trackerId]
    return [`Open ${t.name} and find your ${t.label}.`, `${t.where.replace(/\.$/, "")}.`, "Paste it here and press Install."]
  }
  /* The rest say "below"; in the sheet the field is right under the steps. */
  return setupSteps(item).map((s) => s.replace(/\bbelow\b/g, "here").replace(/ under Subscribers and orders/, " here"))
}

/** Who built what: Storelib built the connection; the service is the provider's. */
export function developerOf(item: Integration): { connection: string; service: string | null } {
  const storelibOwn = !item.logo && (item.kind === "app" || item.builtIn)
  return { connection: "Storelib", service: storelibOwn ? null : item.name }
}

/** "Free to install", and the provider's own pricing where it has one. Never a figure. */
export function pricingOf(item: Integration): { line: string; note: string | null } {
  const price = item.glance.find((g) => g.label === "Price")?.value ?? ""
  const own = /own pricing applies/.test(price)
  if (item.comingSoon || item.kind === "listed") return { line: "Not available yet", note: own ? `${item.name} has its own pricing` : null }
  if (item.builtIn || item.kind === "app" && !own) return { line: "Included with Storelib", note: null }
  return { line: "Free to install", note: own ? `${item.name} charges for its own service, at its own prices` : item.kind === "tracker" ? `Uses your own ${item.name} account` : null }
}

/** What it needs before it can be installed, read off the catalog: an account, the key, physical products. */
export function requirementsOf(item: Integration): string[] {
  const out: string[] = []
  const storelibOwn = developerOf(item).service === null
  if (!storelibOwn && !(item.comingSoon || item.kind === "listed")) out.push(`A ${item.name} account`)
  const adds = item.glance.find((g) => g.label === "You add")?.value
  if (adds && adds !== "Nothing") out.push(adds)
  if (item.physical) out.push("Products that ship turned on for your store")
  if (item.appId === "onepage_signups") out.push("A OnePage with a signup, form or lead magnet")
  if (item.appId === "storelib_reviews") out.push("Nothing to connect")
  return out
}

/** The paragraphs under the headline, and the ones about how it works in Storelib. */
export function descriptionOf(item: Integration): { lead: string; inStorelib: string[] } {
  const lead = item.lead ?? item.about[0] ?? item.summary
  const inStorelib = item.lead ? item.about : item.about.slice(1)
  return { lead, inStorelib }
}

/**
 * MORE APPS LIKE THIS (round 60): up to three others in the same category
 * that can be installed now, in the order the directory lists them. Only
 * what the catalog holds (a name, what it does, its pricing line); no
 * ratings, as Storelib has none.
 */
export function relatedOf(item: Integration, all: readonly Integration[], max = 3): Integration[] {
  return all.filter((i) => i.id !== item.id && i.category === item.category && !i.comingSoon && i.kind !== "listed" && !i.paused).slice(0, max)
}

/** One row of the listing's facts column. */
export function factsOf(item: Integration): { label: string; value: string; note?: string | null }[] {
  const price = pricingOf(item)
  const dev = developerOf(item)
  return [
    { label: "Pricing", value: price.line, note: price.note },
    { label: "Category", value: CATEGORY_NAMES[item.category] },
    { label: "Developer", value: dev.connection, note: dev.service ? `Connects to ${dev.service}` : "Made by Storelib" },
  ]
}

/* ---- the installed page ---- */

/** What the connection keeps in step, in a few short lines, read off the catalog's own At a glance. */
export function syncedOf(item: Integration): string[] {
  const g = (label: string) => item.glance.find((x) => x.label === label)?.value ?? null
  if (item.kind !== "commerce") {
    const rows: string[] = []
    for (const label of ["Sends", "Counts", "Reads back", "Orders", "Tracking", "Emails", "Works on"]) {
      const v = g(label)
      if (v) rows.push(`${label}: ${v}`)
    }
    if (rows.length) return rows
  }
  if (item.kind === "commerce" && item.category === "shipping") return item.providerId === "shipstation" ? ["Paid orders you ship yourself, out to ShipStation", "Carrier and tracking number, back to the order"] : ["Live rates and labels, from the order page", "Carrier and tracking number, on the order"]
  if (item.kind === "commerce") return ["Paid orders for products at its location", "Carrier and tracking number, back to the order"]
  return []
}

/** Facts about the connection a store has, as the API gives them (IntegrationState and the marketing sync's state). */
export interface ConnectionFactsRead {
  verifiedAt?: string | null
  lastSyncAt?: string | null
  lastError?: string | null
  ordersSent?: number
  labelsBought?: number
  webhooks?: "on" | "off" | null
}

export interface ActivityRow {
  at: string | null
  text: string
  tone: "gray" | "green" | "red"
}

/**
 * RECENT ACTIVITY, ONLY WHAT IS KNOWN. Each row is a fact the API already
 * returns: the last problem, the last time Storelib talked to it, the
 * counts it keeps and when the key was checked. Nothing is made up to fill
 * the list; with nothing known it is empty and the page says so.
 */
export function activityOf(item: Integration, f: ConnectionFactsRead | null): ActivityRow[] {
  if (!f) return []
  const rows: ActivityRow[] = []
  if (f.lastError) rows.push({ at: f.lastSyncAt ?? null, text: f.lastError, tone: "red" })
  if (f.lastSyncAt) rows.push({ at: f.lastSyncAt, text: `Last talked to ${item.name}`, tone: "gray" })
  if (typeof f.ordersSent === "number" && f.ordersSent > 0) rows.push({ at: null, text: f.ordersSent === 1 ? `1 order sent to ${item.name}` : `${f.ordersSent} orders sent to ${item.name}`, tone: "gray" })
  if (typeof f.labelsBought === "number" && f.labelsBought > 0) rows.push({ at: null, text: f.labelsBought === 1 ? "1 label bought" : `${f.labelsBought} labels bought`, tone: "gray" })
  if (f.webhooks === "on") rows.push({ at: null, text: `${item.name} sends updates to Storelib as they happen`, tone: "green" })
  if (f.verifiedAt) rows.push({ at: f.verifiedAt, text: `Key checked with ${item.name}`, tone: "green" })
  return rows
}
