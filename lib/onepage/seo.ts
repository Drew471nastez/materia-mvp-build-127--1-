/**
 * ===========================================================================
 *  WHAT A ONEPAGE SAYS TO GOOGLE AND TO A CHAT APP, WORKED OUT IN ONE PLACE
 * ===========================================================================
 * "Should they not change dynamically based on the changes users make on the
 * OnePage?" They should. The search title, the description, the title and
 * description a shared link shows, and its picture all start from the page
 * itself: the name, the bio, the photo and the theme. They follow every edit
 * until the creator types over one of them, and only that one stops
 * following. Clearing it (or pressing the reset beside it) makes it follow
 * again. Linktree, Beacons, Stan and Shopify all behave this way.
 *
 *   field              follows, until overridden          stored override
 *   title              "<name> | Storelib"                settings.seo_title
 *   description        the bio, as plain text             settings.seo_description
 *   social title       the title override, else the name  settings.social_title
 *   social description the description                    settings.social_description
 *   image              a card drawn in the page's theme   settings.social_image_url
 *
 * The editor's previews and the public page's generateMetadata both call
 * `resolveOnePageSeo`, so what the creator sees is what a crawler is given.
 * Pure: no React, no database, safe on the client and the server.
 */

export const SEO_TITLE_MAX = 60
export const SEO_DESCRIPTION_MAX = 160
export const SHARE_IMAGE_WIDTH = 1200
export const SHARE_IMAGE_HEIGHT = 630
/** Bumped when the drawing of the card changes, so every cached copy is asked for again. */
export const SHARE_CARD_REVISION = 1
const BRAND = "Storelib"

/* ─────────────────────────────── Text ─────────────────────────────── */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" }

/**
 * Text fit for a meta tag: tags removed, the common entities read, control
 * characters dropped and every run of white space one space. React escapes
 * what is left when it writes the tag, so nothing here is escaped twice.
 */
export function plainText(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#39|[a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[<>]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f​-‍﻿]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Shortened to `max` characters at a word where there is one near the end,
 * with an ellipsis, the way Google cuts a long title. Counted in code points,
 * so an emoji is never cut in half.
 */
export function clipText(value: string, max: number): string {
  const chars = Array.from(value)
  if (chars.length <= max) return value
  const room = chars.slice(0, max - 1).join("")
  const space = room.lastIndexOf(" ")
  const cut = space >= Math.floor(max * 0.6) ? room.slice(0, space) : room
  return `${cut.replace(/[\s,;:.!?-]+$/u, "")}…`
}

/** Length as a person counts it: an emoji is one. */
export function textLength(value: string): number {
  return Array.from(value).length
}

/** An override as it is stored: plain text within its limit, or null for none. */
export function cleanOverride(value: unknown, max: number): string | null {
  const text = plainText(value)
  if (!text) return null
  return Array.from(text).slice(0, max).join("").trim() || null
}

/* ───────────────────────────── Resolution ──────────────────────────── */

export interface OnePageSeoSettings {
  seo_title?: string | null
  seo_description?: string | null
  social_title?: string | null
  social_description?: string | null
  social_image_url?: string | null
  social_image_position_x?: number | null
  social_image_position_y?: number | null
}

export interface OnePageSeoInput {
  /** The name the page shows (its title, else the owner's name). */
  name: string | null | undefined
  bio: string | null | undefined
  /** The address the page is known by, for a page with no name. */
  handle: string | null | undefined
  avatarUrl: string | null | undefined
  theme: unknown
  settings: OnePageSeoSettings | Record<string, unknown> | null | undefined
  /** The page's own address: its canonical and og:url. */
  pageUrl: string
  /** Where the site serves from, for the share image's address. */
  origin?: string
}

export interface ResolvedField {
  value: string
  /** True while it follows the page; false once somebody typed their own. */
  auto: boolean
}

export interface ResolvedOnePageSeo {
  name: string
  title: ResolvedField
  description: ResolvedField
  socialTitle: ResolvedField
  socialDescription: ResolvedField
  image: {
    url: string
    width: number
    height: number
    alt: string
    /** "generated" is the card drawn from the page; "custom" is an upload. */
    source: "generated" | "custom"
    customUrl: string | null
    focal: { x: number; y: number }
    /** What the generated card is drawn from. */
    card: ShareCardModel
    /** The fingerprint in the image's address. */
    version: string
  }
  url: string
  /** The host a chat app prints under the card: "storelib.com". */
  domain: string
  /** Google's grey line: "storelib.com › satori › links". */
  breadcrumb: string
}

const text = (v: unknown) => (typeof v === "string" ? v : null)

/** The page's name, or its handle when it has none. */
export function onePageName(name: unknown, handle: unknown): string {
  const own = plainText(name)
  if (own) return clipText(own, 80)
  const h = plainText(handle).replace(/^@/, "")
  return h ? `@${h}` : "My page"
}

/** "<name> | Storelib" while it fits in a search result, the name alone when it does not. */
export function autoTitle(name: string): string {
  const branded = `${name} | ${BRAND}`
  return textLength(branded) <= SEO_TITLE_MAX ? branded : clipText(name, SEO_TITLE_MAX)
}

/** The bio as a sentence Google can show, or a plain line naming the page. */
export function autoDescription(name: string, bio: unknown): string {
  const b = plainText(bio)
  if (b) return clipText(b, SEO_DESCRIPTION_MAX)
  return clipText(`Links and products from ${name}.`, SEO_DESCRIPTION_MAX)
}

/**
 * The override the creator typed, or null when there is none. A value that
 * is only the automatic one again is not an override: it would stop the field
 * following the page while saying nothing new (the SEO card used to save the
 * page name it was only showing, and a rename then never reached the tab).
 */
export function overrideOf(stored: unknown, automatic: string, max: number, alsoAutomatic: string[] = []): string | null {
  const typed = cleanOverride(stored, max)
  if (!typed) return null
  const same = (a: string) => a.toLowerCase() === typed.toLowerCase()
  return same(automatic) || alsoAutomatic.some((a) => a && same(a)) ? null : typed
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "")
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || "storelib.com"
  }
}

function breadcrumbOf(url: string): string {
  try {
    const u = new URL(url)
    const parts = u.pathname.split("/").filter(Boolean)
    return [u.host.replace(/^www\./, ""), ...parts].join(" › ")
  } catch {
    return hostOf(url)
  }
}

function percent(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50
}

export function resolveOnePageSeo(input: OnePageSeoInput): ResolvedOnePageSeo {
  const settings = (input.settings || {}) as OnePageSeoSettings
  const name = onePageName(input.name, input.handle)
  const plainName = plainText(input.name)

  const autoT = autoTitle(name)
  const titleOverride = overrideOf(settings.seo_title, autoT, SEO_TITLE_MAX, [name, plainName])
  const title: ResolvedField = titleOverride ? { value: titleOverride, auto: false } : { value: autoT, auto: true }

  const autoD = autoDescription(name, input.bio)
  const descriptionOverride = overrideOf(settings.seo_description, autoD, SEO_DESCRIPTION_MAX)
  const description: ResolvedField = descriptionOverride ? { value: descriptionOverride, auto: false } : { value: autoD, auto: true }

  /* A chat app prints the site's name beside the card, so the social title is the name, or the title somebody chose. */
  const autoSocialT = titleOverride ?? clipText(name, SEO_TITLE_MAX)
  const socialOverride = overrideOf(settings.social_title, autoSocialT, SEO_TITLE_MAX, [title.value])
  const socialTitle: ResolvedField = socialOverride ? { value: socialOverride, auto: false } : { value: autoSocialT, auto: true }

  const socialDescOverride = overrideOf(settings.social_description, description.value, SEO_DESCRIPTION_MAX)
  const socialDescription: ResolvedField = socialDescOverride
    ? { value: socialDescOverride, auto: false }
    : { value: description.value, auto: true }

  const customUrl = safeImageUrl(settings.social_image_url)
  const focal = { x: percent(settings.social_image_position_x), y: percent(settings.social_image_position_y) }
  const card = shareCardModel({ name, avatarUrl: input.avatarUrl, theme: input.theme, pageUrl: input.pageUrl })
  const version = shareImageVersion({ card, customUrl, focal })
  const origin = (input.origin || "https://storelib.com").replace(/\/+$/, "")
  const key = plainText(input.handle).replace(/^@/, "") || "page"

  return {
    name,
    title,
    description,
    socialTitle,
    socialDescription,
    image: {
      url: `${origin}${shareImagePath(key)}?v=${version}`,
      width: SHARE_IMAGE_WIDTH,
      height: SHARE_IMAGE_HEIGHT,
      alt: name,
      source: customUrl ? "custom" : "generated",
      customUrl,
      focal,
      card,
      version,
    },
    url: input.pageUrl,
    domain: hostOf(input.pageUrl),
    breadcrumb: breadcrumbOf(input.pageUrl),
  }
}

/** The share image's path: beside the page it pictures, outside /api so every crawler may read it. */
export function shareImagePath(key: string): string {
  return `/${encodeURIComponent(key.toLowerCase())}/links/share.png`
}

/**
 * An image address worth putting in a share card: https, a real host name,
 * nothing else. Anything that is not is treated as no image.
 */
export function safeImageUrl(value: unknown): string | null {
  const raw = text(value)?.trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== "https:") return null
    const host = u.hostname.toLowerCase()
    if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return null
    if (/^[\d.]+$/.test(host) || host.startsWith("[")) return null
    return u.toString()
  } catch {
    return null
  }
}

/* ─────────────────────────────── The card ─────────────────────────────── */

export interface ShareCardModel {
  name: string
  initials: string
  avatarUrl: string | null
  /** "storelib.com/satori/links" */
  address: string
  background: { color: string; gradient: string | null; imageUrl: string | null; dim: number }
  text: string
  muted: string
  accent: string
  accentText: string
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

function hex(value: unknown, fallback: string): string {
  const v = text(value)?.trim()
  if (!v) return fallback
  if (HEX.test(v)) {
    const h = v.slice(1)
    return `#${(h.length === 3 ? h.split("").map((c) => c + c).join("") : h).toLowerCase()}`
  }
  /* An eight digit colour: its alpha is dropped, the card is opaque. */
  if (/^#[0-9a-f]{8}$/i.test(v)) return v.slice(0, 7).toLowerCase()
  return fallback
}

function luminanceOf(color: string): number {
  const h = hex(color, "#ffffff").slice(1)
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminanceOf(a), luminanceOf(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** Initials for a card with no photo: "Satori Studio" is "SS", "@satori" is "S". */
export function initialsOf(name: string): string {
  const words = name.replace(/^@/, "").split(/\s+/).filter(Boolean)
  const letters = words.slice(0, 2).map((w) => Array.from(w)[0] ?? "")
  return letters.join("").toUpperCase() || "S"
}

/**
 * The card's colours, from the theme: its background (the gradient's two
 * colours, or the solid colour, or the photo), the title colour for the
 * name, the secondary text colour for the address, the button colour for
 * the ring round the photo. A text colour that cannot be read on the
 * background is swapped for black or white.
 */
export function shareCardModel({ name, avatarUrl, theme, pageUrl }: { name: string; avatarUrl: unknown; theme: unknown; pageUrl: string }): ShareCardModel {
  const t = (theme && typeof theme === "object" ? theme : {}) as Record<string, unknown>
  const base = hex(t.background_color, "#ffffff")
  let gradient: string | null = null
  let imageUrl: string | null = null
  /* Every colour the text may sit on: it has to be readable on all of them. */
  let under = [base]
  if (t.background_type === "gradient") {
    const fromString = (text(t.background_gradient) ?? "").match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) ?? []
    const c1 = hex(t.gradient_color_1, fromString[0] ?? base)
    const c2 = hex(t.gradient_color_2, fromString[1] ?? fromString[0] ?? base)
    const dirRaw = typeof t.gradient_direction === "number" ? t.gradient_direction : Number((text(t.background_gradient) ?? "").match(/(\d+)deg/)?.[1] ?? 135)
    const dir = Number.isFinite(dirRaw) ? Math.round(dirRaw) % 360 : 135
    gradient = `linear-gradient(${dir}deg, ${c1} 0%, ${c2} 100%)`
    under = [c1, c2]
  } else if (t.background_type === "image" || t.background_type === "video") {
    imageUrl = safeImageUrl(t.background_image_url)
  }
  const brightness = typeof t.image_brightness === "number" ? t.image_brightness : 100
  /* A photo is dimmed under the words, as the page dims it, and a little more: white text on it is always read. */
  const dim = imageUrl ? Math.max(0.25, Math.min(0.6, (100 - Math.min(100, brightness)) / 100 + 0.25)) : 0
  if (imageUrl) under = ["#3a3a3a", "#111111"]
  const lightest = Math.max(...under.map(luminanceOf))
  const plain = lightest > 0.4 ? "#111111" : "#ffffff"
  const readable = (c: string) => (under.every((u) => contrast(c, u) >= 3) ? c : plain)
  const textColor = imageUrl ? "#ffffff" : readable(hex(t.title_color, hex(t.text_color, plain)))
  const muted = imageUrl ? "#e5e5e5" : readable(hex(t.secondary_text_color, textColor))
  const accent = hex(t.button_color, textColor)
  const address = (() => {
    try {
      const u = new URL(pageUrl)
      return `${u.host.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`
    } catch {
      return pageUrl
    }
  })()
  return {
    name,
    initials: initialsOf(name),
    avatarUrl: safeImageUrl(avatarUrl),
    address,
    background: { color: base, gradient, imageUrl, dim },
    text: textColor,
    muted,
    accent,
    accentText: luminanceOf(accent) > 0.5 ? "#111111" : "#ffffff",
  }
}

/**
 * A short fingerprint of everything the image is drawn from. It is the `v`
 * in the image's address, so a change to the name, the photo, the theme or
 * the uploaded picture gives the image a new address and every app that
 * cached the old one fetches the new one; nothing else changes it.
 */
export function shareImageVersion({ card, customUrl, focal }: { card: ShareCardModel; customUrl: string | null; focal: { x: number; y: number } }): string {
  const source = customUrl
    ? JSON.stringify([SHARE_CARD_REVISION, "custom", customUrl, focal.x, focal.y])
    : JSON.stringify([SHARE_CARD_REVISION, card.name, card.avatarUrl, card.address, card.background, card.text, card.muted, card.accent])
  /* FNV-1a, 32 bit, twice with different seeds: enough to tell two versions of one page apart. */
  const fnv = (seed: number) => {
    let h = seed >>> 0
    for (let i = 0; i < source.length; i++) {
      h ^= source.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(36)
  }
  return `${fnv(0x811c9dc5)}${fnv(0x2f7a3c1b)}`.slice(0, 12)
}

/**
 * Where an image of `w` by `h` sits in a box of `boxW` by `boxH` when it
 * covers the box with the point at (`fx`%, `fy`%) kept as central as the
 * edges allow: CSS object-fit cover with object-position, as numbers, for a
 * renderer that has neither (the share image is drawn by next/og).
 */
export function coverRect(w: number, h: number, boxW: number, boxH: number, fx: number, fy: number) {
  const scale = Math.max(boxW / w, boxH / h)
  const width = w * scale
  const height = h * scale
  return {
    width: Math.round(width),
    height: Math.round(height),
    left: Math.round((boxW - width) * (fx / 100)),
    top: Math.round((boxH - height) * (fy / 100)),
  }
}

/* ────────────────────────────── Metadata ────────────────────────────── */

/**
 * The public page's metadata, from the resolved fields and nothing else:
 * the title is given whole (`absolute`), so the layout's template does not
 * add a second "| Storelib" to a title that already has one, or one to a
 * title the creator chose without it.
 */
export function onePageMetadataFrom(seo: ResolvedOnePageSeo, extra: { handle?: string | null; indexable: boolean; icon?: string | null }) {
  const images = [{ url: seo.image.url, width: seo.image.width, height: seo.image.height, alt: seo.image.alt }]
  return {
    title: { absolute: seo.title.value },
    description: seo.description.value,
    alternates: { canonical: seo.url },
    openGraph: {
      url: seo.url,
      siteName: BRAND,
      title: seo.socialTitle.value,
      description: seo.socialDescription.value,
      type: "profile" as const,
      ...(extra.handle ? { username: extra.handle } : {}),
      images,
    },
    twitter: {
      card: "summary_large_image" as const,
      title: seo.socialTitle.value,
      description: seo.socialDescription.value,
      images: [seo.image.url],
    },
    robots: extra.indexable
      ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" as const } }
      : { index: false, follow: false, googleBot: { index: false, follow: false } },
    ...(extra.icon ? { icons: { icon: extra.icon, apple: extra.icon } } : {}),
  }
}
