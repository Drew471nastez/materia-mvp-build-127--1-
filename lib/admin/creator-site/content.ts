/**
 * ===========================================================================
 *  A CREATOR'S OWN CONTENT, READ FOR A WEBSITE BUILT FOR THEM (round 63)
 * ===========================================================================
 * The admin console's Build website (app/api/admin/creators/site) makes a
 * new website for a creator from the current Storelib Default template and
 * fills it with what that creator already wrote and uploaded. This file
 * decides what that is, from rows the route has already read:
 *
 *   their name           creators.display_name, else the profile's
 *   their bio            the creator page's published header (bio)
 *   their pictures       the hero picture of their live website, else the
 *                        cover of their creator page; the logo their live
 *                        website draws; their avatar beside the bio
 *   their words          the hero heading and line of their live website,
 *                        the heading over their products there, the label
 *                        they gave the shop in their menu
 *   their links          the creator page's social links that are switched
 *                        on and are web addresses
 *   their products       published ones, which the product grid draws from
 *                        the database on every visit
 *
 * NOTHING INVENTED. A website the creator never edited still carries its
 * theme's sample words ("Templates, presets and guides from a studio that
 * ships." under every old Storelib Default hero). Those are not theirs, so
 * every text read here is compared with the sample text of every theme and
 * template Storelib ships (`templateText`) and left out when it is one of
 * them. What is missing stays missing: no bio means no About section, no
 * links means no icons, never a placeholder.
 *
 * Pure: no database, no files. The route reads, this decides, the tests
 * hand it rows.
 */

export type SectionLike = { id?: unknown; type?: unknown; hidden?: unknown; disabled?: unknown; settings?: unknown; blocks?: unknown }

export interface CreatorRows {
  creator: { id: string; slug?: string | null; username?: string | null; display_name?: string | null }
  profile?: { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null
  /** store_builder_configs.published_config for the shop page: headerSettings is read. */
  shopConfig?: unknown
  /** Their live website, when one is published: its settings and its pages' live sections. */
  live?: { settings?: unknown; pages: { page_key: string; sections: unknown }[] } | null
  /** The store's menus (store-menus-server.ts): { "main-menu": { links: [{ title, url }] } }. */
  menus?: unknown
  /** Published products, newest first. */
  products: { id: string; title: string | null; slug: string | null }[]
}

export interface CreatorSiteContent {
  creatorId: string
  name: string
  handle: string | null
  /** Plain text, paragraphs split by blank lines; "" when they wrote none. */
  bio: string
  avatar: string | null
  logo: string | null
  hero: { image: string | null; heading: string; subheading: string }
  /** The words over the product grid, or "" for none of theirs. */
  productsHeading: string
  /** Materia's social settings (config/settings_schema.json) to their addresses. */
  socials: Record<string, string>
  products: { id: string; title: string; slug: string | null }[]
  /** Where each value came from, for the admin to check before building. */
  sources: Record<string, string>
  /** Template sample text found on their live website and left out. */
  leftOut: string[]
}

/** The creator page's social keys (lib/social/platforms.ts) as Materia's theme settings name them. */
export const SOCIAL_SETTING: Readonly<Record<string, string>> = {
  instagram: "instagram",
  tiktok: "tiktok",
  youtube: "youtube",
  twitter: "social_x",
  facebook: "facebook",
  linkedin: "linkedin",
  spotify: "social_spotify",
}

/** Every social setting the Storelib Default template fills with a sample address, cleared unless the creator has one. */
export const MATERIA_SOCIAL_SETTINGS: readonly string[] = [
  "facebook", "instagram", "twitter", "youtube", "tiktok", "pinterest", "vimeo", "linkedin", "tumblr", "snapchat",
  "social_threads", "social_x", "social_telegram", "social_discord", "social_spotify", "social_reddit",
]

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const str = (v: unknown): string => (typeof v === "string" ? v : "")

/** Text without markup, its entities read, its spaces collapsed. */
export function plainText(v: unknown): string {
  return str(v)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
}

/** How text is compared with the templates' samples: no markup, no case, one space. */
export function textKey(v: unknown): string {
  return plainText(v).toLowerCase().replace(/\s+/g, " ").replace(/[.!]+$/, "").trim()
}

/** A picture or link the website may draw: https, or a path on the site itself. Anything else (javascript:, data:, http) is no address. */
export function safeAddress(v: unknown): string | null {
  const s = str(v).trim()
  if (!s || s.length > 2048) return null
  if (s.startsWith("/") && !s.startsWith("//")) return s
  try {
    const u = new URL(s)
    if (u.protocol !== "https:" || u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}

/** Every string inside a value, for collecting the templates' sample text. */
export function stringsIn(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v)
  else if (Array.isArray(v)) for (const x of v) stringsIn(x, out)
  else if (v && typeof v === "object") for (const x of Object.values(v)) stringsIn(x, out)
  return out
}

/** The sample text as a set of keys (textKey), skipping the empty and the one-letter. */
export function sampleTextSet(strings: Iterable<string>): Set<string> {
  const set = new Set<string>()
  for (const s of strings) {
    const k = textKey(s)
    if (k.length > 1) set.add(k)
  }
  return set
}

function sectionsOf(v: unknown): SectionLike[] {
  if (Array.isArray(v)) return v.filter((s) => s && typeof s === "object") as SectionLike[]
  /* A Shopify-format page: { sections: { id: {...} }, order: [...] }. */
  const o = obj(v)
  const map = obj(o.sections)
  const order = Array.isArray(o.order) ? (o.order as unknown[]).filter((k): k is string => typeof k === "string") : Object.keys(map)
  return order.map((k) => ({ id: k, ...obj(map[k]) }) as SectionLike)
}

function blocksOf(s: SectionLike): { type: string; settings: Record<string, unknown> }[] {
  const b = s.blocks
  const list = Array.isArray(b) ? b : Object.values(obj(b))
  return list.map((x) => ({ type: str(obj(x).type), settings: obj(obj(x).settings) }))
}

const shown = (s: SectionLike) => s.hidden !== true && s.disabled !== true

const HERO_TYPE = /hero|banner|slideshow|slider|cover|image-with-text-overlay/i
const PRODUCTS_TYPE = /product|collection|shop|catalog/i
const IMAGE_KEYS = ["bg_image", "image", "background_image", "image_url", "desktop_image", "image_desktop", "media_image", "video_poster"]
const HEADING_KEYS = ["heading", "title", "headline"]
const SUB_KEYS = ["subheading", "subtitle", "sub", "text", "description", "body"]

function firstOf(settings: Record<string, unknown>, keys: string[], pick: (v: unknown) => string | null): string | null {
  for (const k of keys) {
    const v = pick(settings[k])
    if (v) return v
  }
  return null
}

const textPick = (v: unknown) => plainText(v) || null

/** The hero of a page: its picture, heading and line, from settings or from its blocks. */
function heroOf(sections: SectionLike[]): { image: string | null; heading: string | null; sub: string | null; section: string } | null {
  const hero = sections.find((s) => shown(s) && HERO_TYPE.test(str(s.type)))
  if (!hero) return null
  const settings = obj(hero.settings)
  const blocks = blocksOf(hero)
  const image =
    firstOf(settings, IMAGE_KEYS, safeAddress) ??
    blocks.map((b) => firstOf(b.settings, IMAGE_KEYS, safeAddress)).find(Boolean) ??
    null
  const heading =
    firstOf(settings, HEADING_KEYS, textPick) ??
    blocks.filter((b) => /heading|title/i.test(b.type) && !/sub/i.test(b.type)).map((b) => firstOf(b.settings, ["text", ...HEADING_KEYS], textPick)).find(Boolean) ??
    null
  const sub =
    firstOf(settings, SUB_KEYS, textPick) ??
    blocks.filter((b) => /sub|text|description|paragraph/i.test(b.type)).map((b) => firstOf(b.settings, ["text", ...SUB_KEYS], textPick)).find(Boolean) ??
    null
  return { image, heading, sub, section: str(hero.type) }
}

function productsHeadingOf(sections: SectionLike[]): string | null {
  for (const s of sections) {
    if (!shown(s) || !PRODUCTS_TYPE.test(str(s.type))) continue
    const settings = obj(s.settings)
    const h =
      firstOf(settings, ["heading", "title", "page_title"], textPick) ??
      blocksOf(s).filter((b) => /heading|title/i.test(b.type)).map((b) => firstOf(b.settings, ["text", "page_title", ...HEADING_KEYS], textPick)).find(Boolean) ??
      null
    if (h) return h
  }
  return null
}

/** A logo the live website draws: the header's own, else the theme's. */
function logoOf(live: CreatorRows["live"]): string | null {
  if (!live) return null
  for (const p of live.pages) {
    for (const s of sectionsOf(p.sections)) {
      if (!/header/i.test(str(s.type))) continue
      const l = firstOf(obj(s.settings), ["logo_url", "logo", "logo_image", "image"], safeAddress)
      if (l) return l
    }
  }
  const settings = obj(live.settings)
  const compat = obj(obj(settings.compat).settings)
  return firstOf(settings, ["logo_url", "logo"], safeAddress) ?? firstOf(compat, ["logo"], safeAddress)
}

/** The label the creator gave the shop in their main menu ("Programmes"), when it points at the products. */
function shopLabelOf(menus: unknown): string | null {
  const main = obj(obj(menus)["main-menu"])
  const links = Array.isArray(main.links) ? (main.links as unknown[]) : []
  for (const l of links) {
    const url = str(obj(l).url)
    if (/^\/(products|collections\/all|shop)\/?$/.test(url)) return plainText(obj(l).title) || null
  }
  return null
}

/** Paragraph text for a bio: plain, each paragraph on its own. */
function bioOf(header: Record<string, unknown>): string {
  return plainText(header.bio).replace(/\n{2,}/g, "\n").slice(0, 4000)
}

export function creatorSiteContent(rows: CreatorRows, samples: ReadonlySet<string>): CreatorSiteContent {
  const sources: Record<string, string> = {}
  const leftOut: string[] = []
  /* Theirs when it is not one of the templates' own sample texts. */
  const own = (v: string | null | undefined, where: string, field: string): string => {
    const t = (v ?? "").trim()
    if (!t) return ""
    if (samples.has(textKey(t))) {
      leftOut.push(`${field}: "${t.slice(0, 120)}" (${where}, template sample text)`)
      return ""
    }
    sources[field] = where
    return t
  }

  const c = rows.creator
  const name = (c.display_name || rows.profile?.display_name || c.username || rows.profile?.username || c.slug || "").trim()
  sources.name = "creators.display_name"
  const handle = (rows.profile?.username || c.username || c.slug || "").trim() || null
  const header = obj(obj(rows.shopConfig).headerSettings)

  const bio = bioOf(header)
  if (bio) sources.bio = "creator page bio"
  const avatar = safeAddress(header.avatarUrl) ?? safeAddress(rows.profile?.avatar_url)
  if (avatar) sources.avatar = "creator page avatar"

  const home = rows.live?.pages.find((p) => p.page_key === "home")
  const liveHero = home ? heroOf(sectionsOf(home.sections)) : null
  const cover = safeAddress(header.coverImageUrl)
  let heroImage: string | null = null
  if (liveHero?.image) {
    heroImage = liveHero.image
    sources["hero.image"] = `live website hero (${liveHero.section})`
  } else if (cover) {
    heroImage = cover
    sources["hero.image"] = "creator page cover"
  }
  const heading = own(liveHero?.heading, `live website hero (${liveHero?.section ?? ""})`, "hero.heading")
  const subheading = own(liveHero?.sub, `live website hero (${liveHero?.section ?? ""})`, "hero.subheading")

  let productsHeading = ""
  for (const p of [...(home ? [home] : []), ...(rows.live?.pages ?? []).filter((x) => x !== home)]) {
    const h = productsHeadingOf(sectionsOf(p.sections))
    productsHeading = own(h, `live website ${p.page_key} page`, "productsHeading")
    if (productsHeading) break
  }
  if (!productsHeading) productsHeading = own(shopLabelOf(rows.menus), "store menu", "productsHeading")

  const logo = logoOf(rows.live ?? null) ?? safeAddress(header.logoUrl)
  if (logo) sources.logo = logoOf(rows.live ?? null) ? "live website header" : "creator page logo"

  const socials: Record<string, string> = {}
  const links = obj(header.socialLinks)
  for (const [key, setting] of Object.entries(SOCIAL_SETTING)) {
    const l = links[key]
    const entry = typeof l === "string" ? { url: l, enabled: true } : obj(l)
    if (entry.enabled === false) continue
    const url = safeAddress(entry.url)
    if (url && /^https:/.test(url)) socials[setting] = url
  }
  if (Object.keys(socials).length) sources.socials = "creator page social links"

  return {
    creatorId: c.id,
    name,
    handle,
    bio,
    avatar,
    logo,
    hero: { image: heroImage, heading, subheading },
    productsHeading,
    socials,
    products: rows.products.map((p) => ({ id: p.id, title: (p.title ?? "").trim() || "Untitled", slug: p.slug ?? null })),
    sources,
    leftOut,
  }
}
