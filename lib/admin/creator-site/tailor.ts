/**
 * ===========================================================================
 *  THE STORELIB DEFAULT TEMPLATE, MADE THE CREATOR'S OWN (round 63)
 * ===========================================================================
 * The template's files (theme-packages/materia, composed by lib/themes/
 * template-packages.ts or a release) go through here before the import
 * every template goes through (lib/themes/template-install.ts). Only the
 * template's JSON changes: which sections a page has, in what order, and
 * what their settings say. No liquid, no snippet and no stylesheet is
 * touched, so the theme stays the theme and later releases still apply.
 *
 * WHAT THE WEBSITE HAS
 *   home      their hero (their picture, their words, one button to the
 *             products), their products as a grid, and their About (their
 *             avatar and bio) only when they wrote a bio
 *   product   the product's own title, price, buttons, description,
 *             reviews and sales; the template's sample promises, info table
 *             and sample testimonials are taken out
 *   contact   the form, without the sample address and opening hours
 *   header    the menu and their logo; the sample announcement bar is gone
 *   footer    their name, their bio when they have one, their social links
 *
 * WHAT IT DOES NOT HAVE: the template's sample studio (mugs, bags, small
 * runs), its FAQ, shipping and About pages, its popups (one offered a 10%
 * code), its sample social addresses. Where the creator gave nothing, the
 * section is left out rather than filled.
 *
 * Pure: a map of files in, a new map out.
 */
import type { CreatorSiteContent } from "./content"
import { MATERIA_SOCIAL_SETTINGS } from "./content"

type Json = Record<string, unknown>
type Files = ReadonlyMap<string, Buffer>

/** The dark scheme the Storelib Default template ships (#111111), for text over a photograph. */
export const DARK_SCHEME = "scheme-4faf0e4d-27f4-4d02-bc51-617383bab1a9"

/** Pages of the template that are only its sample shop, removed. */
export const SAMPLE_ONLY_PAGES = ["templates/page.faqs.json", "templates/page.shipping.json"] as const

const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {})

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/** Plain paragraphs as the theme's rich text: each line its own <p>, escaped. */
export function paragraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join("")
}

function readJson(files: Files, path: string): Json | null {
  const b = files.get(path)
  if (!b) return null
  try {
    return obj(JSON.parse(b.toString("utf8")))
  } catch {
    return null
  }
}

const write = (out: Map<string, Buffer>, path: string, value: unknown) => out.set(path, Buffer.from(JSON.stringify(value, null, 2), "utf8"))

/** A page from sections in order: { sections, order }. */
function page(sections: [string, Json][]): Json {
  return { sections: Object.fromEntries(sections), order: sections.map(([k]) => k) }
}

function blocks(list: [string, string, Json][]): { blocks: Json; block_order: string[] } {
  return { blocks: Object.fromEntries(list.map(([id, type, settings]) => [id, { type, settings }])), block_order: list.map(([id]) => id) }
}

/** How many cards a row holds for this many products: two programmes side by side, never a row of three with a hole. */
export function perRow(count: number): number {
  /*
    Round 64: never fewer than three across on a computer. Two products at two across made each card 620x827, a
    poster the height of the screen; at three they are the size any shop's cards are, and four fill a row of four.
  */
  if (count === 4 || count >= 7) return 4
  return 3
}

export function homePage(c: CreatorSiteContent): Json {
  const sections: [string, Json][] = []

  const heroBlocks: [string, string, Json][] = []
  if (c.hero.heading) heroBlocks.push(["heading", "heading", { text: c.hero.heading, tag: "h1" }])
  if (c.hero.subheading) heroBlocks.push(["subheading", "subheading", { text: paragraphs(c.hero.subheading) }])
  if (c.products.length) heroBlocks.push(["button", "primary_button", { label: "Shop all", link: "/collections/all" }])
  if (c.hero.image || heroBlocks.length) {
    sections.push([
      "hero",
      {
        type: "hero-image1",
        settings: {
          color_scheme: DARK_SCHEME,
          section_width: "full_width",
          ...(c.hero.image ? { image: c.hero.image, image_alt: "" } : { use_background_color: true }),
          image_fit: "cover",
          image_position_x: 50,
          image_position_y: 35,
          enable_overlay: true,
          overlay_color: "#000000",
          overlay_opacity: 35,
          content_align: "center",
          vertical_align: "center",
          content_max_width: 880,
          min_height_desktop: 760,
          min_height_mobile: 560,
        },
        ...blocks(heroBlocks),
      },
    ])
  }

  if (c.products.length) {
    sections.push([
      "products",
      {
        type: "products-listing",
        settings: {
          color_scheme: "default",
          section_width: "container",
          items_to_show: Math.min(Math.max(c.products.length, 1), 12),
          items_per_row: perRow(c.products.length),
          items_per_row_mobile: c.products.length === 1 ? 1 : 2,
          column_gap: 24,
          row_gap: 40,
          header_alignment: "left",
          show_price: true,
          show_add_to_cart: false,
          padding_top: 88,
          padding_bottom: 96,
        },
        ...blocks(c.productsHeading ? [["heading", "heading", { text: c.productsHeading }]] : []),
      },
    ])
  }

  if (c.bio) {
    sections.push([
      "about",
      {
        type: "Image-and-video-text",
        settings: {
          color_scheme: "scheme-2b5c6c91-201d-4fb1-aba3-e6d562656976",
          section_width: "container",
          image_position: "left",
          text_column_width: 52,
          content_align: "left",
          content_gap: 18,
          ...(c.avatar ? { media_type: "image", image: c.avatar, image_alt: c.name, aspect_w: 4, aspect_h: 5, image_fit: "cover", image_radius: 6 } : {}),
          gap_desktop: 80,
          padding_top_desktop: 96,
          padding_bottom_desktop: 96,
          mobile_order: "media_first",
          padding_top_mobile: 56,
          padding_bottom_mobile: 56,
        },
        ...blocks([
          ["heading", "heading", { text: c.name || "About" }],
          ["text", "subheading", { text: paragraphs(c.bio) }],
        ]),
      },
    ])
  }

  return page(sections)
}

/** The About page: their avatar and bio, or no page at all. */
export function aboutPage(c: CreatorSiteContent): Json | null {
  if (!c.bio) return null
  const home = homePage(c)
  const about = obj(obj(home.sections).about)
  return page([["about", { ...about, settings: { ...obj(about.settings), color_scheme: "default" } }]])
}

/** The product page without the template's sample words; the product's own blocks stay. */
export function productPage(t: Json): Json {
  const sections = obj(t.sections)
  const order = (Array.isArray(t.order) ? (t.order as string[]) : Object.keys(sections)).filter((k) => {
    const type = String(obj(sections[k]).type ?? "")
    return !/^(text-columns|testimonial-wall|testimonials|testimonial.*)$/.test(type)
  })
  const out: Json = {}
  for (const k of order) {
    const s = obj(sections[k])
    if (s.type === "main-product") {
      const bl = obj(s.blocks)
      const keep = (Array.isArray(s.block_order) ? (s.block_order as string[]) : Object.keys(bl)).filter((id) => {
        const b = obj(bl[id])
        const type = String(b.type ?? "")
        if (type === "infotables" || type === "vertical_benefits") return false
        /* Rows the template wrote (materials, delivery); the description row reads the product's own. */
        if (type === "collapsible_row" && obj(b.settings).use_product_description !== true) return false
        return true
      })
      out[k] = {
        ...s,
        settings: { ...obj(s.settings), media_square: false },
        blocks: Object.fromEntries(keep.map((id) => [id, bl[id]])),
        block_order: keep,
      }
    } else out[k] = s
  }
  return { ...t, sections: out, order }
}

/** The contact page: the form and a heading; the sample address and hours go. */
export function contactPage(t: Json): Json {
  const sections = obj(t.sections)
  const out: Json = {}
  for (const [k, raw] of Object.entries(sections)) {
    const s = obj(raw)
    const bl = obj(s.blocks)
    const keep = (Array.isArray(s.block_order) ? (s.block_order as string[]) : Object.keys(bl)).filter((id) => String(obj(bl[id]).type) === "heading")
    out[k] = {
      ...s,
      settings: { ...obj(s.settings), success_text: "Thanks. Your message has been sent, and the reply will come to your email." },
      blocks: Object.fromEntries(keep.map((id) => [id, { ...obj(bl[id]), settings: { ...obj(obj(bl[id]).settings), text: "Contact" } }])),
      block_order: keep,
    }
  }
  return { ...t, sections: out }
}

/** The header group without the announcement bar, whose lines were the template's. */
export function headerGroup(g: Json): Json {
  const sections = obj(g.sections)
  const keep = (Array.isArray(g.order) ? (g.order as string[]) : Object.keys(sections)).filter((k) => obj(sections[k]).type !== "top-bar")
  return { ...g, sections: Object.fromEntries(keep.map((k) => [k, sections[k]])), order: keep }
}

/** The footer newsletter (round 64): the theme's own block, posted to the store's /contact as a subscriber (lib/storelib-theme/compat/site.ts formSubmit). */
export const FOOTER_NEWSLETTER = {
  type: "newsletter",
  settings: {
    heading: "Newsletter",
    description: "New programmes and updates by email.",
    email_placeholder: "Email address",
    button_label: "Join",
    note: "",
    success_text: "You're on the list.",
    error_text: "That did not send. Check the address and try again.",
  },
}

/**
 * The footer: their name and bio in the store block, or neither; their logo when they have one; a newsletter sign up
 * (round 64); the social icons shown, which draw only the links they have (theme settings, themeSettings below).
 */
export function footerGroup(g: Json, c: CreatorSiteContent): Json {
  const sections = obj(g.sections)
  const out: Json = {}
  for (const [k, raw] of Object.entries(sections)) {
    const s = obj(raw)
    const bl = obj(s.blocks)
    const nb: Json = {}
    for (const [id, b] of Object.entries(bl)) {
      const block = obj(b)
      nb[id] =
        block.type === "store_info"
          ? { ...block, settings: { ...obj(block.settings), store_heading: c.name, store_description: c.bio ? paragraphs(c.bio) : "", show_logo: false, store_email: false } }
          : block
    }
    if (s.type !== "footer") {
      out[k] = { ...s, blocks: nb }
      continue
    }
    const order = (Array.isArray(s.block_order) ? (s.block_order as string[]) : Object.keys(nb)).filter((id) => id in nb)
    if (!Object.values(nb).some((b) => obj(b).type === "newsletter")) {
      nb.newsletter_storelib = FOOTER_NEWSLETTER
      const pay = order.findIndex((id) => obj(nb[id]).type === "payment_badges")
      order.splice(pay >= 0 ? pay : order.length, 0, "newsletter_storelib")
    }
    out[k] = { ...s, settings: { ...obj(s.settings), show_social: true }, blocks: nb, block_order: order }
  }
  return { ...g, sections: out }
}

/** Popups and order notices whose words and offers were the template's (one offered a 10% code). */
const SAMPLE_OVERLAY = /popup|promo|fake-order|spin-wheel|countdown/i

/** The overlay group without the template's popups and sample order notices; what is left (the phone bar, back to top) stays off as it was. */
export function overlayGroup(g: Json): Json {
  const sections = obj(g.sections)
  const keep = (Array.isArray(g.order) ? (g.order as string[]) : Object.keys(sections)).filter((k) => !SAMPLE_OVERLAY.test(String(obj(sections[k]).type ?? "")))
  return { ...g, sections: Object.fromEntries(keep.map((k) => [k, { ...obj(sections[k]), disabled: true }])), order: keep }
}

/** The page a locked store shows: their name, the email field, and no sample promise. */
export function passwordPage(t: Json, c: CreatorSiteContent): Json {
  const sections = obj(t.sections)
  const out: Json = {}
  for (const [k, raw] of Object.entries(sections)) {
    const s = obj(raw)
    const bl = obj(s.blocks)
    const keep = (Array.isArray(s.block_order) ? (s.block_order as string[]) : Object.keys(bl)).filter((id) => !/subheading|text|description/.test(String(obj(bl[id]).type)))
    out[k] = {
      ...s,
      blocks: Object.fromEntries(keep.map((id) => [id, obj(bl[id]).type === "heading" ? { ...obj(bl[id]), settings: { ...obj(obj(bl[id]).settings), heading: c.name } } : bl[id]])),
      block_order: keep,
    }
  }
  return { ...t, sections: out }
}

/** The theme settings: their logo, their links (the template's sample addresses cleared), cards that keep a product's picture whole. */
export function themeSettings(d: Json, c: CreatorSiteContent): Json {
  const current = { ...obj(d.current) }
  if (c.logo) current.logo = c.logo
  for (const k of MATERIA_SOCIAL_SETTINGS) current[k] = c.socials[k] ?? ""
  /*
    Upright cards. A creator's product picture is mostly a cover or a poster,
    which Storelib stores centred on a wide light band; the card trims the
    band and draws the cover at 3:4, so it fills its frame instead of being
    cut to a square (the template's own choice) or floating in white.
  */
  current.product_image_ratio = "custom"
  current.product_custom_ratio = "3:4"
  return { ...d, current }
}

/** The collection page's heading in their words, when they gave the products one. */
export function collectionPage(t: Json, c: CreatorSiteContent): Json {
  if (!c.productsHeading) return t
  const sections = obj(t.sections)
  const out: Json = {}
  for (const [k, raw] of Object.entries(sections)) {
    const s = obj(raw)
    if (s.type !== "main-collection-heading") {
      out[k] = s
      continue
    }
    const bl = obj(s.blocks)
    out[k] = {
      ...s,
      blocks: Object.fromEntries(Object.entries(bl).map(([id, b]) => [id, obj(b).type === "heading" ? { ...obj(b), settings: { ...obj(obj(b).settings), page_title: c.productsHeading } } : b])),
    }
  }
  return { ...t, sections: out }
}

const SHOP_IMAGE = /shopify:\/\/shop_images\/([^"?#\\]+)/g

/**
 * The template's sample pictures still named by a page the tailoring keeps as it is (the blog's banner and its
 * sidebar promo, a popup): emptied, so the creator's site shows only what they gave and the theme's plain look.
 */
function clearSamplePictures(before: Files, out: Map<string, Buffer>): void {
  const own = new Set([...before.keys()].filter((k) => k.startsWith("assets/")).map((k) => k.slice("assets/".length)))
  for (const [path, b] of out) {
    if (!path.endsWith(".json")) continue
    const text = b.toString("utf8")
    const next = text.replace(/"shopify:\/\/shop_images\/([^"?#\\]+)"/g, (whole, name: string) => (own.has(decodeURIComponent(name)) ? '""' : whole))
    if (next !== text) out.set(path, Buffer.from(next, "utf8"))
  }
}

/** The template's own pictures no page names any more: not stored under the creator's account. */
function dropUnusedPictures(before: Files, out: Map<string, Buffer>): void {
  const named = (files: Files) => {
    const set = new Set<string>()
    for (const [path, b] of files) {
      if (!path.endsWith(".json")) continue
      for (const m of b.toString("utf8").matchAll(SHOP_IMAGE)) set.add(decodeURIComponent(m[1]))
    }
    return set
  }
  const was = named(before)
  const now = named(out)
  for (const name of was) if (!now.has(name)) out.delete(`assets/${name}`)
}

/** The template's files with the creator's content in place of its sample shop. */
export function tailorTemplate(files: Files, c: CreatorSiteContent): Map<string, Buffer> {
  const out = new Map(files)
  write(out, "templates/index.json", homePage(c))

  const about = aboutPage(c)
  if (about) write(out, "templates/page.about.json", about)
  else out.delete("templates/page.about.json")
  for (const p of SAMPLE_ONLY_PAGES) out.delete(p)

  const product = readJson(files, "templates/product.json")
  if (product) write(out, "templates/product.json", productPage(product))
  const contact = readJson(files, "templates/page.contact.json")
  if (contact) write(out, "templates/page.contact.json", contactPage(contact))
  const collection = readJson(files, "templates/collection.json")
  if (collection) write(out, "templates/collection.json", collectionPage(collection, c))

  const header = readJson(files, "sections/header-group.json")
  if (header) write(out, "sections/header-group.json", headerGroup(header))
  const footer = readJson(files, "sections/footer-group.json")
  if (footer) write(out, "sections/footer-group.json", footerGroup(footer, c))
  const overlay = readJson(files, "sections/overlay-group.json")
  if (overlay) write(out, "sections/overlay-group.json", overlayGroup(overlay))
  const password = readJson(files, "templates/password.json")
  if (password) write(out, "templates/password.json", passwordPage(password, c))
  const settings = readJson(files, "config/settings_data.json")
  if (settings) write(out, "config/settings_data.json", themeSettings(settings, c))

  clearSamplePictures(files, out)
  dropUnusedPictures(files, out)
  return out
}
