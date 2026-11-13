"use client"

/*
  THE HOME PAGE'S ONEPAGES ARE DRAWN BY THE ONEPAGE ITSELF (land round).

  The owner: "make sure that the OnePage's representations are actually
  used with some of the themes that we have on OnePage, and they're
  actually representative". Every OnePage the home page shows (the
  storefront card's strip, the checkout tile, the OnePage editor's preview,
  the OnePage slide of the business carousel) is now one of the themes the
  Design tab ships (components/onepage/themes/r40-themes), drawn by the
  same ThemePreview the theme picker draws (components/onepage/themes/
  theme-preview): the live page's own header, buttons, layouts, product
  blocks, newsletter and wallpaper, at the phone's 390px, scaled to fit.

  The creators are samples, like every other mock on the page: made-up
  names with the site's own photos (public/home). Their words are the
  blocks a creator would write; the theme decides everything else.

  The fonts a theme names load here, cut to the letters these pages draw
  (lib/onepage/fonts onePageFontHref with `text`), so a page costs a few
  kilobytes of type. The code is in the lazy home sections' chunks only.
  ThemePreview imports the skins' stylesheet (theme-skin-scene ->
  theme-skins.css, about 34 KB gzipped) although none of these themes has a
  skin; it comes with the first of these sections to mount, never with the
  first screen.
*/
import { useLayoutEffect, useRef, type CSSProperties } from "react"
import { ThemePreview, PREVIEW_WIDTH } from "@/components/onepage/themes/theme-preview"
import type { PreviewAccount } from "@/components/onepage/themes/preview-account"
import { AP_THEMES, R40_THEMES, W8_THEMES } from "@/components/onepage/themes/r40-themes"
import { familyOf, onePageFontHref } from "@/lib/onepage/fonts"
import { optimizedImageUrl } from "@/lib/images/optimized-url"

type Look = Record<string, any>
type Shipped = { id: string; theme_config: object; profile_layout?: string }

/** The themes the home page shows, each exactly as the picker applies it (a Hero theme lays its header out as a Hero, as design-tab's ThemeCard does). */
const SHIPPED = new Map<string, Shipped>(([...R40_THEMES, ...AP_THEMES, ...W8_THEMES] as readonly Shipped[]).map((t) => [t.id, t]))
export type HomeThemeId = "swiss" | "ember" | "atlas" | "halo" | "lagoon" | "notebook"
export function homeTheme(id: HomeThemeId): Look {
  const t = SHIPPED.get(id)
  if (!t) throw new Error(`no theme ${id}`)
  const c = t.theme_config as Look
  return t.profile_layout === "hero" ? { ...c, header_layout: "hero" } : c
}
/** What the page is painted with behind everything: its colour, or its gradient. */
function homeThemePaint(id: HomeThemeId): string {
  const c = homeTheme(id)
  return c.background_type === "gradient" && c.background_gradient ? c.background_gradient : c.background_color
}

const S = "/home/showcase"
const E = "/home/everything"
const C = "/home/commerce"

/* ── The sample creators ─────────────────────────────────────────────── */

export const NOA: PreviewAccount = {
  name: "Noa Lind",
  bio: "Producer and DJ. Late sets, warm records, a new mix every month.",
  avatar: `${S}/av-j.webp`,
  socials: ["instagram", "spotify", "youtube"],
  links: [
    { label: "Hear the new mix", picture: `${S}/hp-stage.webp`, sample: false },
    { label: "Tour dates", picture: `${S}/dr-neon.webp`, sample: false },
    { label: "Book me for a set", picture: null, sample: false },
  ],
  products: [
    { title: "Night Drive sample pack", price: "$29", picture: `${C}/art-waves.webp`, cta: "Buy now", sample: false },
    { title: "Mix stems, vol. 2", price: "$15", picture: `${E}/store-album.webp`, cta: "Buy now", sample: false },
  ],
  news: { headline: "Get the next mix first", desc: "One email when a new set is up.", button: "Subscribe" },
}

export const CLARA: PreviewAccount = {
  name: "Clara Benoit",
  bio: "Watercolor florals, one loose petal at a time.",
  avatar: `${S}/av-k.webp`,
  socials: ["instagram", "tiktok", "pinterest"],
  links: [
    { label: "Free brush guide", picture: `${S}/bb-brushes.webp`, sample: false },
    { label: "Book a live workshop", picture: `${S}/bb-palette.webp`, sample: false },
    { label: "My paper and paints", picture: null, sample: false },
  ],
  products: [
    { title: "Loose florals in 21 days", price: "$129", picture: `${S}/bb-hero.webp`, cta: "Enroll", sample: false },
    { title: "Spring palette guide", price: "$12", picture: `${S}/bb-bouquet.webp`, cta: "Buy now", sample: false },
  ],
  news: { headline: "Paint with me on Sundays", desc: "A new study in your inbox each week.", button: "Join" },
}

export const THEO: PreviewAccount = {
  name: "Theo Marsh",
  bio: "Street and travel photographer. I teach manual mode.",
  avatar: `${S}/av-e.webp`,
  socials: ["instagram", "youtube", "tiktok"],
  links: [
    { label: "Shoot in Manual, in a Week", picture: `${E}/store-street.webp`, sample: false },
    { label: "Film Look Presets", picture: `${E}/store-cam.webp`, sample: false },
    { label: "Gear I use", picture: null, sample: false },
  ],
  products: [
    { title: "Film Look Presets", price: "$24", picture: `${E}/store-cam.webp`, cta: "Buy now", sample: false },
    { title: "Shoot in Manual course", price: "$129", picture: `${E}/store-street.webp`, cta: "Enroll", sample: false },
  ],
  news: { headline: "Photo notes", desc: "One picture and how I made it, every other Friday.", button: "Subscribe" },
}

/** Amara's page in the checkout tile: her presets are the product the visitor taps. */
export const AMARA: PreviewAccount = {
  name: "Amara Okafor",
  bio: "Photographer · Lagos",
  avatar: `${C}/creator-amara.webp`,
  /* No social icons: the tile's phone is short, and her presets are what the visitor taps. */
  socials: [],
  links: [
    { label: "Watch my latest shoot", picture: null, sample: false },
    { label: "Book a portrait session", picture: null, sample: false },
    { label: "Prints and frames", picture: null, sample: false },
  ],
  products: [
    { title: "Golden Hour presets", price: "$19", picture: `${S}/lt-field.webp`, cta: "Buy now", sample: false },
    { title: "Portrait Lightroom pack", price: "$24", picture: `${S}/lt-street.webp`, cta: "Buy now", sample: false },
  ],
  news: { headline: "Join my newsletter", desc: "New work and news, now and then.", button: "Subscribe" },
}

/** Maya's page in the OnePage editor's preview: the blocks of the editor's Links tab, in its order. */
export const MAYA: PreviewAccount = {
  name: "Maya Okafor",
  bio: "Run coach · 6 marathons · Brooklyn, NY. Training plans that fit real life.",
  avatar: `${S}/av-maya.webp`,
  socials: ["instagram", "tiktok", "youtube"],
  links: [
    { label: "Join Saturday Run Club", picture: null, sample: false },
    { label: "Book a 1:1 gait review", picture: null, sample: false },
    { label: "How I ran a 3:08 marathon", picture: `${S}/mr-race.webp`, sample: false },
  ],
  products: [
    { title: "16-Week Marathon Plan", price: "$39", picture: `${S}/mr-run.webp`, cta: "Get the plan", sample: false },
    { title: "Half marathon plan", price: "$29", picture: `${S}/mr-race.webp`, cta: "Get the plan", sample: false },
  ],
  news: { headline: "Monday training notes", desc: "One workout and one tip, every Monday.", button: "Subscribe" },
}

/** Sol & Sage, the OnePage slide of the business carousel. */
export const PRIYA: PreviewAccount = {
  name: "Sol & Sage",
  bio: "Priya Raman · plant-based weeknight cooking for busy people. New recipes every Sunday.",
  avatar: `${S}/av-priya.webp`,
  socials: ["instagram", "youtube", "tiktok", "website"],
  links: [
    { label: "Free 7-day meal plan", picture: `${S}/ss-bowl.webp`, sample: false },
    { label: "Live class: Sunday 5pm", picture: `${S}/ss-pasta.webp`, sample: false },
    { label: "This week's recipes", picture: null, sample: false },
  ],
  products: [
    { title: "Weeknight Green cookbook", price: "$18", picture: `${S}/ss-pasta.webp`, cta: "Get the book", sample: false },
    { title: "Batch cooking class", price: "$15", picture: `${S}/ss-bowl.webp`, cta: "Book a seat", sample: false },
  ],
  news: { headline: "Sunday recipes", desc: "Three new dinners every week.", button: "Subscribe" },
}

/* ── Drawing one ─────────────────────────────────────────────────────── */

/** A theme's own photo (Atlas's mountains) at a small card's size, through the image optimizer. */
const thumb = (url: string) => (/\.svg(?:[?#]|$)/i.test(url) ? url : optimizedImageUrl(url, 240, 75))

/** Every letter a page draws, for the font request's `text` (the faces are cut to them). */
function lettersOf(who: PreviewAccount): { title: string; body: string } {
  const body = [who.bio, ...who.links.map((l) => l.label), ...who.products.flatMap((p) => [p.title, p.price, p.cta]), who.news.headline, who.news.desc, who.news.button, "Email"].join("")
  const uniq = (s: string) => Array.from(new Set(s.split(""))).sort().join("")
  return { title: uniq(who.name), body: uniq(body) }
}

function fontLinks(c: Look, who: PreviewAccount): string[] {
  const { title, body } = lettersOf(who)
  const bodyFamily = familyOf(c.font_family) || "Inter"
  const titleFamily = familyOf(c.title_font) || bodyFamily
  const out = titleFamily === bodyFamily ? [onePageFontHref(bodyFamily, Array.from(new Set((title + body).split(""))).sort().join(""))] : [onePageFontHref(bodyFamily, body), onePageFontHref(titleFamily, title)]
  return out.filter((h): h is string => !!h)
}

/**
 * A OnePage as a phone shows it: the theme's page at 390px, scaled to the box
 * it is given (one ResizeObserver, no per-frame work), and as tall as that box
 * (the page's blocks fill it, never cut through by its bottom edge).
 */
export function HomeOnePage({ theme, who, className = "", style }: { theme: HomeThemeId; who: PreviewAccount; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const c = homeTheme(theme)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    /*
      Round 62: sized by the ResizeObserver alone. Reading getBoundingClientRect
      here, as the card mounts, made the browser lay out the whole page on the
      spot: one 267ms frame at 4x CPU in the middle of a scroll on storelib.com.
      The observer reports the same box after the browser's own layout and
      before it paints, so the first frame is still drawn at the right scale.
    */
    const fit = (width: number, height: number) => {
      if (!width) return
      const scale = width / PREVIEW_WIDTH
      el.style.setProperty("--tp-scale", String(scale))
      el.style.setProperty("--hop-h", `${Math.ceil(height / scale)}px`)
    }
    const ro = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize?.[0]
      if (box) fit(box.inlineSize, box.blockSize)
      else fit(entry.contentRect.width, entry.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className={`hop ${className}`} style={{ background: homeThemePaint(theme), ...style }} data-home-onepage={theme} aria-hidden="true">
      {fontLinks(c, who).map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="home-onepage-fonts" />
      ))}
      <ThemePreview c={c} who={who} thumb={thumb} />
    </div>
  )
}

/** The box's rules: the page fills it and is as tall as it is (a section's own class places the box). Put by each section that draws one (React keeps one copy). */
export const HOME_ONEPAGE_CSS = `:where(.hop){position:relative}
.hop{overflow:hidden;contain:layout paint;isolation:isolate;font-size:16px;line-height:1.5;letter-spacing:normal;text-align:left;-webkit-font-smoothing:antialiased}
.hop>[data-tp-page]{height:var(--hop-h,546px)!important}`

export function HomeOnePageStyle() {
  return (
    <style href="home-onepage" precedence="w13-home">
      {HOME_ONEPAGE_CSS}
    </style>
  )
}
