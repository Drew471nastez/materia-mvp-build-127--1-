/**
 * ===========================================================================
 *  A WEBSITE FROM THE ADMIN'S LIBRARY, AS A STARTING SITE THE AGENT ADAPTS
 * ===========================================================================
 * The owner: "use the Materia themes, sections, structure and templates as
 * the bank it builds from, so it knows how to put a product page, functions
 * and bundles together, and spills out really high quality output."
 *
 * The built-in templates (lib/storelib-ai/templates) are written in this
 * repository. The bank's are real websites the Storelib admin picks at
 * /admin/ai-bank from an account's library: pages, sections, blocks, the
 * site's own code and its look, as it is live. snapshotSite turns one into
 * the same SiteTemplate the agent already knows how to apply and adapt, and
 * a profile (what each section is, what the site needs to work).
 *
 * NOTHING OF THE SOURCE ACCOUNT'S BUSINESS TRAVELS. The site belongs to
 * another account than the one a new website is made for, so:
 *
 *   pictures     every image and video setting is emptied; an image becomes
 *                a slot the agent fills with the new business's own picture
 *   data         every product, collection, form or community id (a uuid,
 *                a list of them, an object holding one) is emptied and
 *                becomes a binding the agent fills with the new creator's
 *   contact      email addresses and phone numbers in any text are removed
 *   links        absolute addresses in link settings are emptied (another
 *                site's pages, socials, embeds); paths inside a site stay
 *   brand        only look settings are kept (LOOK_SETTING): never the
 *                logo, name, tagline, socials, announcement, cookie words,
 *                intro media, free shipping threshold or currency display
 *   menus        internal paths only
 *
 * Its words stay, as every template's do: the finish gate refuses a site
 * that still carries them (untouchedTemplateParts), so they are a draft the
 * agent must rewrite, never shipped.
 *
 * Its own code files keep their behaviour and get a bank prefix
 * (sections/ai_bk<id>_<name>.storelib), so they never shadow a theme section
 * and the agent knows them as its components.
 *
 * Pure. Browser safe. tests/ai-template-bank.test.ts.
 */
import type { BusinessKind } from "@/lib/storelib-ai/direction/brief"
import { BUSINESS_KINDS } from "@/lib/storelib-ai/direction/brief"
import type { DesignTokens } from "@/lib/ai-builder/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { ImageAspect, SiteTemplate, TemplateBinding, TemplateImageSlot, TemplateMenu, TemplateMenuLink, TemplatePage } from "@/lib/storelib-ai/templates/types"

/** What a site or a section needs the creator to have, for it to work. */
export type BankFeature = "shop" | "booking" | "courses" | "community" | "blog" | "reviews"
export const BANK_FEATURES: readonly BankFeature[] = ["shop", "booking", "courses", "community", "blog", "reviews"]

/** What a section is, in a word. */
export type SectionRole =
  | "header" | "footer" | "announcement" | "hero" | "products" | "collections" | "product-page" | "cart" | "features" | "testimonials"
  | "reviews" | "faq" | "cta" | "newsletter" | "gallery" | "about" | "team" | "pricing" | "contact" | "blog" | "stats" | "logos"
  | "video" | "story" | "course" | "community" | "form" | "other"

/** starting: poured in and adapted. reference: an imported theme whose sections are worked examples only. */
export type BankKind = "starting" | "reference"

export interface BankSection {
  page: string
  id: string
  type: string
  role: SectionRole
  /** The feature it cannot work without, or null. */
  needs: BankFeature | null
  /** It is the site's own code (a file in the snapshot), not a Storelib section. */
  code: boolean
}

export interface BankProfile {
  kind: BankKind
  features: BankFeature[]
  /** Business kinds its words suggest (best first); the admin can change them. */
  industries: BusinessKind[]
  keywords: string[]
  sections: BankSection[]
  counts: { pages: number; sections: number; files: number; imageSlots: number; bindings: number; removed: number }
  /** For a reference: the files worth showing the agent, best first. */
  examples: string[]
}

export interface SnapshotInput {
  installId: string
  /** The website's name in the library. */
  name: string
  pages: { key: string; title?: string; sections: SectionInstance[] }[]
  /** Its own code: path to text (store_theme_custom_files). */
  files: Record<string, string>
  settings: Record<string, unknown>
}

export interface Snapshot {
  template: SiteTemplate
  profile: BankProfile
}

/* ── what sections are ─────────────────────────────────────────────────── */

const ROLE_RULES: [SectionRole, RegExp][] = [
  ["header", /^header\b|(^|_)header($|_)|nav(bar)?$/],
  ["footer", /footer/],
  ["announcement", /announcement|promo_announcement|sticky_bar|free_shipping/],
  ["product-page", /^(main_)?product$|main_product|product_main|product_page|product_info|buy_box|size_guide/],
  ["cart", /cart/],
  ["products", /product|lookbook|wishlist|shop/],
  ["collections", /collection/],
  ["hero", /hero|slideshow|image_banner|video_hero|banner$/],
  ["testimonials", /testimonial|proof|social_proof|press/],
  ["reviews", /review/],
  ["faq", /faq/],
  ["pricing", /pricing|plans?$|comparison/],
  ["newsletter", /newsletter|subscribe|signup/],
  ["cta", /cta|call_to_action|promotion/],
  ["gallery", /gallery|image_grid|collage|lookbook|packery|portfolio|work/],
  ["about", /about|founder|story_|text_image|split_content|image_section/],
  ["team", /team|author_bio|members/],
  ["contact", /contact|map/],
  ["blog", /blog|article/],
  ["stats", /stats|counter|numbers/],
  ["logos", /logo|brand_logo|trust/],
  ["video", /video/],
  ["story", /sticky_story|timeline|process|steps|chapter/],
  ["course", /course|curriculum|lesson|ebook/],
  ["community", /community/],
  ["form", /form/],
  ["features", /feature|benefit|icon_box|multirow|bento|tabs|columns|rich|marquee|scrolling_text/],
]

/** Storelib sections and words that only work with products to sell. */
const SHOP_TYPE = /product|collection|cart|wishlist|lookbook|size_guide|shop/
/** Code that only works with products to sell: an add, a product or collection picker, a cart panel of its own. */
const SHOP_CODE = /data-storelib-add-to-cart|data-storelib-wishlist|data-storelib-cart-panel|"type"\s*:\s*"(product_picker|product_list|collection_picker|collection_list)"/
const FEATURE_TYPE: [BankFeature, RegExp][] = [
  ["courses", /course|curriculum|lesson/],
  ["community", /community/],
  ["blog", /blog|article/],
  ["reviews", /review/],
  ["booking", /booking|appointment|schedule/],
]

export function roleOf(type: string, group?: string | null): SectionRole {
  if (group === "header") return /announcement|promo|bar/.test(type) ? "announcement" : "header"
  if (group === "footer") return "footer"
  const t = type.toLowerCase().replace(/^ai_[a-z0-9]+_/, "")
  for (const [role, re] of ROLE_RULES) if (re.test(t)) return role
  return "other"
}

/** The feature a section cannot work without. A header or footer never needs one: its bag or links go with the site. */
export function needsOf(type: string, source: string | undefined, role: SectionRole): BankFeature | null {
  if (role === "header" || role === "footer" || role === "announcement") return null
  const t = type.toLowerCase()
  if (SHOP_TYPE.test(t.replace(/^ai_[a-z0-9]+_/, "")) || (source && SHOP_CODE.test(source))) return "shop"
  for (const [feature, re] of FEATURE_TYPE) if (re.test(t)) return feature
  if (source && /"type"\s*:\s*"community_picker"/.test(source)) return "community"
  return null
}

/** Pages that are only a shop's: a product, collection, catalogue, cart or wishlist page. */
export function isShopPage(key: string): boolean {
  return /^(product|products|collection|collections|shop|cart|wishlist|catalog|catalogue)(\b|[-_]|$)/.test(key)
}

/* ── what is the source account's, and goes ───────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MEDIA_KEY = /(image|img|photo|picture|poster|background|bg|cover|thumbnail|thumb|avatar|logo|banner|media|video|icon_file|portrait)/i
const MEDIA_VALUE = /^(https?:)?\/\/|^\/|\.(png|jpe?g|webp|gif|avif|svg|mp4|webm|mov)(\?|#|$)/i
const VIDEO = /\.(mp4|webm|mov)(\?|#|$)|youtu|vimeo|video/i
const LINK_KEY = /(url|link|href|src|embed)$/i
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
/* A phone number: seven digits or more, with the usual separators, not inside a longer word. */
const PHONE = /(?<![\w/#.-])\+?\d[\d\s().-]{6,}\d(?![\w/])/g

type Json = unknown
const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === "object" && !Array.isArray(v)

/** A uuid, a list of them, or an object (or list of objects) carrying one as its id: a record of the source account's. */
function holdsRecordId(v: Json): boolean {
  if (typeof v === "string") return UUID.test(v.trim())
  if (Array.isArray(v)) return v.length > 0 && v.every((x) => holdsRecordId(x))
  if (isObj(v)) return typeof v.id === "string" && UUID.test(v.id)
  return false
}

function bindingKind(key: string, value: Json): TemplateBinding["kind"] {
  const k = key.toLowerCase()
  if (/collection/.test(k)) return "collection"
  if (/form|booking/.test(k)) return "form"
  if (/menu/.test(k)) return "menu"
  return Array.isArray(value) ? "products" : "product"
}

/** Text with the source's email addresses and phone numbers taken out. */
export function withoutContact(text: string): string {
  if (!text) return text
  return text.replace(EMAIL, "").replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 7 ? "" : m))
}

interface Cleaned {
  images: { key: string; alt: string }[]
  bindings: { key: string; kind: TemplateBinding["kind"] }[]
  removed: number
}

/**
 * Takes the source's pictures, records, contact details and outside links out of one settings object, in place.
 * Returns what was taken, so pictures become slots and records bindings.
 */
function clean(settings: Record<string, Json>): Cleaned {
  const out: Cleaned = { images: [], bindings: [], removed: 0 }
  for (const [key, value] of Object.entries(settings)) {
    if (holdsRecordId(value)) {
      out.bindings.push({ key, kind: bindingKind(key, value) })
      settings[key] = Array.isArray(value) ? [] : ""
      out.removed++
      continue
    }
    if (typeof value === "string" && value.trim()) {
      if (MEDIA_KEY.test(key) && MEDIA_VALUE.test(value.trim())) {
        const video = VIDEO.test(value) || /video/i.test(key)
        const logo = /logo|favicon/i.test(key)
        if (!video && !logo) out.images.push({ key, alt: typeof settings[`${key}_alt`] === "string" ? String(settings[`${key}_alt`]) : "" })
        settings[key] = ""
        out.removed++
        continue
      }
      if (LINK_KEY.test(key) && /^(https?:)?\/\//i.test(value.trim())) {
        settings[key] = ""
        out.removed++
        continue
      }
      const scrubbed = withoutContact(value)
      if (scrubbed !== value) {
        settings[key] = scrubbed
        out.removed++
      }
      continue
    }
    if (Array.isArray(value)) {
      /* A list of image objects (a gallery setting): emptied, one slot for the list. */
      if (value.some((x) => isObj(x) && typeof x.url === "string" && MEDIA_VALUE.test(x.url))) {
        out.images.push({ key, alt: "" })
        settings[key] = []
        out.removed++
      }
      continue
    }
    if (isObj(value)) {
      /* An image object ({ url, alt, focal }): emptied. A nested settings object: cleaned in place. */
      if (typeof value.url === "string" && MEDIA_VALUE.test(value.url) && MEDIA_KEY.test(key)) {
        out.images.push({ key, alt: typeof value.alt === "string" ? value.alt : "" })
        settings[key] = ""
        out.removed++
        continue
      }
      const inner = clean(value as Record<string, Json>)
      out.removed += inner.removed
    }
  }
  return out
}

/* ── look, not brand ───────────────────────────────────────────────────── */

/**
 * The Theme settings a bank site's look is: colours, type, buttons, inputs, spacing, corners, cards, media,
 * badges' look, motion. Everything else (logo, name, tagline, socials, cookie words, announcement, intro media,
 * free shipping threshold, currency display, menus, page SEO) is the source's own and never copied.
 */
const LOOK_SETTING = /^(color_schemes|default_color_scheme|color_scheme_remaps|background_color|text_color|primary_color|font_(heading|body|accent)|typography_styles?|type_scale|button_|pill_|input_|page_width|content_padding_x|section_gap|spacing_scale|border_radius|card_shadow|container_border|image_border_radius|media_(border|shadow)|popup_(radius|border|shadow)|badge_(position|radius|sale_bg|sale_color|soldout_bg|soldout_color)|product_card|collection_card|cart_type|motion_tier|animations_enabled|animation_(style|duration|stagger)|page_transition|custom_css|design_settings|custom_tokens)/

export function lookSettings(settings: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(settings)) {
    if (!LOOK_SETTING.test(k)) continue
    if (k === "custom_css" && typeof v === "string") {
      /* A stylesheet may point at the source's pictures: those lines go. */
      out[k] = v.replace(/[^;{}]*url\([^)]*\)[^;{}]*;?/gi, "")
      continue
    }
    out[k] = JSON.parse(JSON.stringify(v))
  }
  return out
}

const HEX = /^#[0-9a-f]{6}$/i
const hex = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : fallback)
const fontName = (v: unknown, fallback: string): string => {
  if (typeof v === "string" && v.trim()) return v.split(",")[0].replace(/["']/g, "").trim() || fallback
  if (isObj(v) && typeof v.family === "string") return v.family
  return fallback
}

/** The agent's tokens read from the site's look: its default colour scheme, its fonts, its corners. */
export function tokensFromSettings(settings: Record<string, unknown>): DesignTokens {
  const schemes = isObj(settings.color_schemes) ? (settings.color_schemes as Record<string, Record<string, unknown>>) : {}
  const wanted = typeof settings.default_color_scheme === "string" ? settings.default_color_scheme : ""
  const s = (wanted && isObj(schemes[wanted]) ? schemes[wanted] : Object.values(schemes).find(isObj)) ?? {}
  const background = hex(s.background, hex(settings.background_color, "#ffffff"))
  const text = hex(s.text, hex(settings.text_color, "#111111"))
  const accent = hex(s.primary_button_background, hex(s.accent, hex(settings.primary_color, "#111111")))
  const radius = typeof settings.border_radius === "number" ? settings.border_radius : 8
  return {
    colors: {
      background,
      surface: hex(s.background_secondary, background),
      text,
      muted: hex(s.text_muted, text),
      accent,
      accentText: hex(s.primary_button_text, "#ffffff"),
      border: hex(s.border, "#e5e5e5"),
    },
    fonts: { heading: fontName(settings.font_heading, "Inter"), body: fontName(settings.font_body, "Inter"), ...(settings.font_accent ? { accent: fontName(settings.font_accent, "Inter") } : {}) },
    radius: { small: Math.min(radius, 8), medium: radius, large: Math.max(radius, 16) },
    spacing: { scale: 1, sectionY: 96, pageWidth: typeof settings.page_width === "number" ? settings.page_width : 1280, gutter: 24 },
    motion: { level: "subtle" },
  }
}

/* ── industries from the site's own words ──────────────────────────────── */

const INDUSTRY_WORDS: [BusinessKind, RegExp][] = [
  ["fitness", /\b(fitness|gym|coach(ing)?|training|workout|strength|athlete|supplement|protein|performance)\b/i],
  ["wellness", /\b(wellness|yoga|meditation|therapy|holistic|mindful|spa|retreat)\b/i],
  ["beauty", /\b(beauty|skin ?care|cosmetic|makeup|serum|salon|nails?|lash)\b/i],
  ["fashion", /\b(fashion|apparel|clothing|streetwear|collection|wear|hoodie|tee|dress)\b/i],
  ["jewellery", /\b(jewel(le)?ry|rings?|necklace|earrings?|gold|silver)\b/i],
  ["music-producer", /\b(sample ?packs?|drum kits?|presets?|loops?|producers?|beats?|sounds?)\b/i],
  ["music-artist", /\b(album|tour|single|band|artist|listen)\b/i],
  ["restaurant", /\b(restaurant|menu|dining|dinner|chef|reservation)\b/i],
  ["cafe-bakery", /\b(coffee|cafe|bakery|pastry|bread|roast)\b/i],
  ["agency", /\b(agency|studio|clients?|brand strategy|case stud(y|ies))\b/i],
  ["photography", /\b(photograph(y|er)|shoot|portraits?|wedding photos?)\b/i],
  ["education", /\b(course|lessons?|learn|class(es)?|curriculum|students?|academy)\b/i],
  ["saas", /\b(software|app|platform|dashboard|integrations?|api|saas|themes?|templates?)\b/i],
  ["home-goods", /\b(home|decor|furniture|candles?|ceramic|kitchen)\b/i],
  ["creator", /\b(creator|digital products?|newsletter|community|downloads?)\b/i],
  ["outdoor", /\b(outdoor|hiking|camping|bike|surf)\b/i],
]

function textOf(pages: SnapshotInput["pages"]): string {
  const parts: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === "string") parts.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (isObj(v)) Object.values(v).forEach(walk)
  }
  for (const p of pages) for (const s of p.sections) {
    walk(s.settings)
    for (const b of s.blocks ?? []) walk(b.settings)
  }
  return parts.join(" ").replace(/<[^>]+>/g, " ").slice(0, 60_000)
}

export function industriesFrom(text: string, name = ""): BusinessKind[] {
  const all = `${name} ${text}`
  const scored = INDUSTRY_WORDS.map(([kind, re]) => ({ kind, n: (all.match(new RegExp(re.source, "gi")) ?? []).length })).filter((x) => x.n > 0)
  scored.sort((a, b) => b.n - a.n)
  return scored.slice(0, 3).map((x) => x.kind)
}

/* ── the snapshot ──────────────────────────────────────────────────────── */

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "x"

/** The bank's prefix for a site: short, stable for the same install. */
export function bankPrefix(installId: string): string {
  let h = 0
  for (const c of installId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `bk${h.toString(36).slice(0, 5)}`
}

/** An imported theme (Shopify, through the compat engine) has a compat layout: its sections are examples, never poured in. */
export function isImportedSnapshot(files: Record<string, string>): boolean {
  const layout = files["layout/theme.storelib"] ?? ""
  return /<template[^>]*\bcompat\b/i.test(layout) || Object.keys(files).some((p) => /\.liquid$/.test(p))
}

function aspectFor(role: SectionRole, key: string): ImageAspect {
  if (/avatar|portrait|author|team/i.test(key) || role === "team") return "1:1"
  if (role === "hero" || /background|banner|cover/i.test(key)) return "16:9"
  if (role === "products" || role === "product-page" || role === "collections") return "4:5"
  if (role === "gallery") return "3:4"
  return "3:2"
}

function styleFor(role: SectionRole, key: string): TemplateImageSlot["style"] {
  if (/avatar|portrait|author/i.test(key) || role === "team") return "portrait"
  if (role === "products" || role === "product-page") return "product"
  return "photo"
}

function headingOf(s: SectionInstance): string {
  const v = s.settings?.heading ?? s.settings?.title ?? s.settings?.headline
  return typeof v === "string" ? v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : ""
}

const MAX_SLOTS = 32

function menusFrom(settings: Record<string, unknown>): Record<string, TemplateMenu> {
  const out: Record<string, TemplateMenu> = {}
  const src = isObj(settings.menus) ? settings.menus : {}
  const linkOf = (l: unknown): TemplateMenuLink | null => {
    if (!isObj(l) || typeof l.title !== "string") return null
    const url = typeof l.url === "string" && !/^(https?:)?\/\//i.test(l.url) ? l.url : "/"
    const links = Array.isArray(l.links) ? l.links.map(linkOf).filter((x): x is TemplateMenuLink => !!x) : []
    return { title: l.title.slice(0, 60), url, ...(links.length ? { links } : {}) }
  }
  for (const [handle, m] of Object.entries(src)) {
    if (!isObj(m) || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(handle)) continue
    out[handle] = { title: typeof m.title === "string" ? m.title.slice(0, 60) : handle, links: Array.isArray(m.links) ? m.links.map(linkOf).filter((x): x is TemplateMenuLink => !!x).slice(0, 40) : [] }
  }
  return out
}

/** One library website as a bank entry. */
export function snapshotSite(input: SnapshotInput): Snapshot {
  const imported = isImportedSnapshot(input.files)
  const prefix = bankPrefix(input.installId)

  /* Its own section files, renamed into the bank's prefix; the instances follow. */
  const rename = new Map<string, string>()
  const files: Record<string, string> = {}
  if (!imported) {
    for (const [path, text] of Object.entries(input.files)) {
      const m = /^sections\/([a-z0-9_-]+)\.storelib$/i.exec(path)
      if (!m) continue
      const own = m[1].startsWith(`ai_${prefix}_`) ? m[1] : `ai_${prefix}_${slug(m[1].replace(/^ai_/, ""))}`
      rename.set(m[1], own)
      files[`sections/${own}.storelib`] = text
    }
  }

  const imageSlots: TemplateImageSlot[] = []
  const bindings: TemplateBinding[] = []
  const sections: BankSection[] = []
  let removed = 0
  const pages: TemplatePage[] = []

  for (const page of input.pages) {
    const key = page.key
    const placed: SectionInstance[] = []
    for (const raw of page.sections ?? []) {
      if (!raw || typeof raw.type !== "string") continue
      const s = clone(raw)
      const type = rename.get(s.type) ?? s.type
      s.type = type
      s.settings = isObj(s.settings) ? s.settings : {}
      const role = roleOf(type, s.group)
      const source = files[`sections/${type}.storelib`] ?? input.files[`sections/${raw.type}.storelib`]
      const where = (block?: string) => ({ page: key, section: s.id, ...(block ? { block } : {}) })
      const take = (c: Cleaned, block?: string) => {
        removed += c.removed
        for (const b of c.bindings) bindings.push({ ...where(block), setting: b.key, kind: b.kind, why: `${role === "other" ? type : role}: the creator's own ${b.kind === "products" ? "products" : b.kind}` } as TemplateBinding)
        for (const img of c.images) {
          if (imageSlots.length >= MAX_SLOTS) continue
          const k = slug(`${key}_${s.id}_${block ?? ""}_${img.key}`)
          const what = headingOf(s)
          imageSlots.push({
            key: k,
            prompt: `A ${role === "other" ? "" : `${role} `}picture for this business${what ? `, beside the words "${what}"` : ""}`,
            aspect: aspectFor(role, img.key),
            alt: img.alt || what || `${role} picture`,
            style: styleFor(role, img.key),
            targets: [{ ...where(block), setting: img.key }],
          })
        }
      }
      take(clean(s.settings as Record<string, Json>))
      for (const b of s.blocks ?? []) {
        if (!isObj(b.settings)) b.settings = {}
        take(clean(b.settings as Record<string, Json>), b.id)
      }
      placed.push(s)
      sections.push({ page: key, id: s.id, type, role, needs: needsOf(type, source, role), code: !!files[`sections/${type}.storelib`] })
    }
    pages.push({ key, title: page.title || key.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase()), sections: placed })
  }

  /* Home first, as every template. */
  pages.sort((a, b) => (a.key === "home" ? -1 : b.key === "home" ? 1 : 0))

  const features = [...new Set([
    ...sections.map((s) => s.needs).filter((f): f is BankFeature => !!f),
    ...(pages.some((p) => isShopPage(p.key)) ? (["shop"] as BankFeature[]) : []),
  ])].sort((a, b) => BANK_FEATURES.indexOf(a) - BANK_FEATURES.indexOf(b))
  const words = textOf(input.pages)
  const industries = industriesFrom(words, input.name)
  const settings = input.settings ?? {}
  const tokens = tokensFromSettings(settings)
  const roles = [...new Set(sections.filter((s) => s.page === "home").map((s) => s.role))]
  const keywords = [...new Set([...industries, ...features, ...roles.filter((r) => r !== "other")])].slice(0, 16)

  /* For an imported theme: the section files that show most (a product page, a hero, a list), best first. */
  const examples = imported
    ? Object.keys(input.files)
        .filter((p) => /^sections\/.+\.storelib$/.test(p))
        .sort((a, b) => exampleRank(a) - exampleRank(b) || a.localeCompare(b))
        .slice(0, 6)
    : []

  /* A reference keeps only the files it shows, contact details taken out: they are read, never written into a site. */
  if (imported) for (const p of examples) files[p] = withoutContact(input.files[p])

  const name = input.name.trim().slice(0, 60) || "Library website"
  const id = `bank-${prefix}`
  const template: SiteTemplate = {
    id,
    name,
    summary: `${name}: a real website from the Storelib library${industries.length ? ` (${industries.join(", ")})` : ""}.`,
    industries: industries.length ? industries : (["general"] as BusinessKind[]),
    stories: [],
    styles: [],
    directionIds: [],
    keywords,
    motion: "balanced",
    prefix,
    files,
    pages,
    tokens,
    menus: menusFrom(settings),
    imageSlots,
    bindings,
    design: {
      thesis: `The ${name} site's own composition: ${roles.slice(0, 8).join(", ") || "its sections"}, in that order.`,
      layout: pages.map((p) => `${p.key}: ${p.sections.filter((s) => !s.group).map((s) => s.type).join(", ")}`).slice(0, 8),
      imagery: "The business's own photographs and product pictures in every slot the source had a picture in, nothing of the source's.",
      motion: "As the source site moves; quieter if the brief asks.",
      signature: roles.filter((r) => r !== "other").slice(0, 6).map((r) => `${r} as composed in ${name}`),
      avoid: ["the source site's words, pictures, products or brand", "sections the business has nothing real to fill"],
    },
    themeSettings: lookSettings(settings),
    source: { kind: "bank", installId: input.installId, name },
  }

  return {
    template,
    profile: {
      kind: imported ? "reference" : "starting",
      features,
      industries: template.industries,
      keywords,
      sections,
      counts: { pages: pages.length, sections: sections.length, files: Object.keys(files).length || (imported ? Object.keys(input.files).length : 0), imageSlots: imageSlots.length, bindings: bindings.length, removed },
      examples,
    },
  }
}

function exampleRank(path: string): number {
  const n = path.toLowerCase()
  if (/main[-_]product|product[-_]template|product\.storelib/.test(n)) return 0
  if (/bundle|upsell|quantity/.test(n)) return 1
  if (/hero|slideshow|image[-_]banner/.test(n)) return 2
  if (/collection|product/.test(n)) return 3
  if (/header|footer/.test(n)) return 5
  return 4
}

/** Every business kind the admin can tag an entry with. */
export const BANK_INDUSTRIES: readonly BusinessKind[] = BUSINESS_KINDS
