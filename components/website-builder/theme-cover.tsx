/**
 * ===========================================================================
 *  THEME COVER — a website drawn as a picture, not run as a page
 * ===========================================================================
 * The website-builder page used to show each theme by RENDERING it: the
 * real `SectionRenderer`, at 1200px, squeezed into a card with CSS `zoom`.
 * That is a whole storefront — sticky bars, fonts, image requests, hover
 * state — mounted three times over to draw three thumbnails, and it looked
 * like what it was: a live page in a small box, sticky bar and all.
 *
 * A cover is an image. For a saved website it is a photograph of its home
 * page taken on the server (`snapshot_url`, lib/website-builder/cover-take.ts).
 * For a theme in the catalogue it is THIS: a deterministic SVG of the theme's
 * own demo shop, built from its palette, fonts and sample copy. One `<svg>`,
 * no JavaScript, no requests, scales to any size, and it is recognisably the
 * theme because it is drawn from the same colours the theme paints with.
 *
 * NOT FOR A SAVED WEBSITE. A website with no photograph yet was drawn from
 * its settings (coverSpecFromSettings, removed): its tagline as a headline,
 * its primary colour on a button, product tiles it may not have. An imported
 * site with a black hero showed as a pink storefront until its photograph
 * came. It shows its name on a plain surface now (app/app/website-builder,
 * PendingCover), which says there is no picture yet rather than inventing one.
 *
 * ViewBox is 1200×750 (16:10). Everything inside is proportional to that.
 */

import type { CSSProperties } from "react"
import {
  contrastText,
  isDark,
  withAlpha,
  type ThemeCoverLayout,
  type ThemeDefinition,
} from "@/lib/website-builder/theme-registry"
import { tt } from "@/lib/i18n/text"

export interface ThemeCoverSpec {
  brand: string
  headline: string
  sub: string
  cta: string
  primary: string
  bg: string
  surface: string
  text: string
  textSecondary: string
  border: string
  heroBg: string
  heroText: string
  fontHeading: string
  fontBody: string
  buttonStyle: "rounded" | "square" | "pill"
  layout: ThemeCoverLayout
}

export function coverSpecFromDefinition(def: ThemeDefinition): ThemeCoverSpec {
  const p = def.palette
  return {
    brand: def.sample.brand,
    headline: def.sample.headline,
    sub: def.sample.sub,
    cta: def.sample.cta,
    primary: p.primary,
    bg: p.bg,
    surface: p.surface,
    text: p.text,
    textSecondary: p.textSecondary,
    border: p.border,
    heroBg: p.heroBg,
    heroText: p.heroText,
    fontHeading: def.fonts.heading,
    fontBody: def.fonts.body,
    buttonStyle: def.buttonStyle,
    layout: def.coverLayout,
  }
}

const W = 1200
const H = 750

function radius(style: ThemeCoverSpec["buttonStyle"], size: number) {
  return style === "pill" ? size / 2 : style === "square" ? 2 : Math.round(size * 0.22)
}

function fontStack(name: string, fallback: string) {
  return `"${name}", ${fallback}`
}

const SERIF = /playfair|cormorant|garamond|merriweather|lora|serif/i

/** Split a headline into at most two lines that fit `maxChars`. */
function wrap(text: string, maxChars: number, maxLines = 2): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = (cur + " " + w).trim()
    }
    if (lines.length === maxLines) break
  }
  if (lines.length < maxLines && cur) lines.push(cur)
  return lines.slice(0, maxLines)
}

export function ThemeCover({
  spec,
  className,
  style,
  title,
}: {
  spec: ThemeCoverSpec
  className?: string
  style?: CSSProperties
  /** Accessible name; the cover is decorative when omitted. */
  title?: string
}) {
  const heading = fontStack(spec.fontHeading, SERIF.test(spec.fontHeading) ? tt("Georgia, serif") : tt("Inter, system-ui, sans-serif"))
  const body = fontStack(spec.fontBody, tt("Inter, system-ui, sans-serif"))
  const darkPage = isDark(spec.bg)
  const heroDark = isDark(spec.heroBg)
  const onHero = spec.heroText
  const onHeroMuted = withAlpha(spec.heroText, 0.7)
  const btnR = radius(spec.buttonStyle, 44)
  const cardR = spec.buttonStyle === "square" ? 4 : spec.buttonStyle === "pill" ? 18 : 12
  const navY = 0
  const navH = 64
  const heroY = navH
  const heroH = 376
  const gridY = heroY + heroH
  const gridH = H - gridY

  // The split layout keeps its text left of the image plate at x=700, so it
  // wraps sooner and never grows past 44px; centred text has the full width.
  const lines = wrap(spec.headline, spec.layout === "center" ? 30 : spec.layout === "split" ? 18 : 24)
  const headlineSize = spec.layout === "split" ? (lines.some((l) => l.length > 16) ? 40 : 44) : lines.some((l) => l.length > 22) ? 44 : 52
  const headlineY = spec.layout === "center" ? heroY + 158 : heroY + 160
  const subY = headlineY + (lines.length - 1) * (headlineSize + 10) + 14 + 18
  // Buttons sit a fixed distance under the subheading, so a two-line headline
  // pushes them down instead of drawing them over the text.
  const ctaY = Math.min(subY + 30, heroY + heroH - 66)
  const ctaW = Math.max(120, Math.min(260, spec.cta.length * 12 + 48))
  const ctaTextColor = contrastText(spec.primary)

  // Product tiles are tinted from the palette so every theme reads as itself.
  const tiles = [
    withAlpha(spec.primary, darkPage ? 0.55 : 0.18),
    withAlpha(spec.primary, darkPage ? 0.35 : 0.1),
    withAlpha(spec.text, darkPage ? 0.18 : 0.08),
  ]

  const hero = (() => {
    if (spec.layout === "center") {
      const cx = W / 2
      return (
        <g>
          <text x={cx} y={heroY + 92} textAnchor="middle" fill={onHeroMuted} fontFamily={body} fontSize={15} letterSpacing={2.4} fontWeight={600}>
            {spec.brand.toUpperCase()}
          </text>
          {lines.map((l, i) => (
            <text key={i} x={cx} y={headlineY + i * (headlineSize + 10)} textAnchor="middle" fill={onHero} fontFamily={heading} fontSize={headlineSize} fontWeight={700} letterSpacing={-1}>
              {l}
            </text>
          ))}
          <text x={cx} y={subY} textAnchor="middle" fill={onHeroMuted} fontFamily={body} fontSize={19}>
            {spec.sub}
          </text>
          <rect x={cx - ctaW / 2} y={ctaY} width={ctaW} height={44} rx={btnR} fill={spec.primary} />
          <text x={cx} y={ctaY + 28} textAnchor="middle" fill={ctaTextColor} fontFamily={body} fontSize={16} fontWeight={600}>
            {spec.cta}
          </text>
        </g>
      )
    }
    const x0 = 96
    const textBlock = (
      <g>
        <text x={x0} y={heroY + 96} fill={onHeroMuted} fontFamily={body} fontSize={15} letterSpacing={2.4} fontWeight={600}>
          {spec.brand.toUpperCase()}
        </text>
        {lines.map((l, i) => (
          <text key={i} x={x0} y={headlineY + i * (headlineSize + 10)} fill={onHero} fontFamily={heading} fontSize={headlineSize} fontWeight={700} letterSpacing={-1}>
            {l}
          </text>
        ))}
        <text x={x0} y={subY} fill={onHeroMuted} fontFamily={body} fontSize={18}>
          {spec.layout === "split"
            ? spec.sub.length > 50 ? spec.sub.slice(0, 48).trimEnd() + "…" : spec.sub
            : spec.sub.length > 62 ? spec.sub.slice(0, 60).trimEnd() + "…" : spec.sub}
        </text>
        <rect x={x0} y={ctaY} width={ctaW} height={44} rx={btnR} fill={spec.primary} />
        <text x={x0 + ctaW / 2} y={ctaY + 28} textAnchor="middle" fill={ctaTextColor} fontFamily={body} fontSize={16} fontWeight={600}>
          {spec.cta}
        </text>
        <rect x={x0 + ctaW + 14} y={ctaY} width={132} height={44} rx={btnR} fill="none" stroke={withAlpha(spec.heroText, 0.35)} strokeWidth={1.5} />
        <text x={x0 + ctaW + 14 + 66} y={ctaY + 28} textAnchor="middle" fill={onHero} fontFamily={body} fontSize={16} fontWeight={500}>
          {tt("Learn more")}
        </text>
      </g>
    )
    if (spec.layout === "left") return textBlock
    // split: an image plate on the right
    const plateX = 700
    const plateY = heroY + 56
    const plateW = 404
    const plateH = heroH - 112
    return (
      <g>
        {textBlock}
        <rect x={plateX} y={plateY} width={plateW} height={plateH} rx={cardR + 6} fill={withAlpha(spec.heroText, heroDark ? 0.08 : 0.06)} stroke={withAlpha(spec.heroText, 0.12)} />
        <rect x={plateX + 28} y={plateY + 28} width={plateW - 56} height={plateH - 56} rx={cardR} fill={withAlpha(spec.primary, 0.85)} />
        <circle cx={plateX + plateW - 84} cy={plateY + 84} r={30} fill={withAlpha(spec.heroText, 0.35)} />
        <rect x={plateX + 56} y={plateY + plateH - 92} width={150} height={12} rx={6} fill={withAlpha(spec.heroText, 0.55)} />
        <rect x={plateX + 56} y={plateY + plateH - 68} width={90} height={12} rx={6} fill={withAlpha(spec.heroText, 0.35)} />
      </g>
    )
  })()

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      preserveAspectRatio={tt("xMidYMid slice")}
    >
      {title && <title>{title}</title>}
      {/* page */}
      <rect width={W} height={H} fill={spec.bg} />

      {/* nav */}
      <rect x={0} y={navY} width={W} height={navH} fill={spec.bg} />
      <line x1={0} y1={navH - 0.5} x2={W} y2={navH - 0.5} stroke={spec.border} strokeWidth={1} />
      <text x={64} y={navY + 40} fill={spec.text} fontFamily={heading} fontSize={22} fontWeight={700} letterSpacing={-0.4}>
        {spec.brand}
      </text>
      {[tt("Home"), tt("Shop"), tt("About")].map((l, i) => (
        <text key={l} x={W - 460 + i * 86} y={navY + 39} fill={i === 0 ? spec.text : spec.textSecondary} fontFamily={body} fontSize={15} fontWeight={500}>
          {l}
        </text>
      ))}
      {/* No `transform` anywhere in this SVG: the app's global stylesheet
          sets `transform: none !important` on everything inside a `.group`
          for touch devices, and a cover sits inside `.group` cards. Absolute
          coordinates cannot be overridden. */}
      <rect x={W - 180} y={navY + 16} width={116} height={32} rx={radius(spec.buttonStyle, 32)} fill={spec.primary} />
      <text x={W - 180 + 58} y={navY + 16 + 21} textAnchor="middle" fill={ctaTextColor} fontFamily={body} fontSize={13.5} fontWeight={600}>
        {spec.cta.length > 12 ? tt("Shop") : spec.cta}
      </text>

      {/* hero */}
      <rect x={0} y={heroY} width={W} height={heroH} fill={spec.heroBg} />
      {hero}

      {/* product grid */}
      <rect x={0} y={gridY} width={W} height={gridH} fill={spec.bg} />
      <text x={64} y={gridY + 58} fill={spec.text} fontFamily={heading} fontSize={26} fontWeight={700} letterSpacing={-0.5}>
        {tt("Featured")}
      </text>
      <text x={W - 64} y={gridY + 57} textAnchor="end" fill={spec.primary} fontFamily={body} fontSize={15} fontWeight={600}>
        {tt("View all →")}
      </text>
      {tiles.map((tint, i) => {
        const gap = 24
        const cw = (W - 128 - gap * 2) / 3
        const x = 64 + i * (cw + gap)
        const y = gridY + 86
        const ih = 150
        return (
          <g key={i}>
            <rect x={x} y={y} width={cw} height={ih + 86} rx={cardR} fill={darkPage ? spec.surface : spec.bg} stroke={spec.border} />
            <rect x={x + 1} y={y + 1} width={cw - 2} height={ih} rx={cardR - 1} fill={tint} />
            <rect x={x + 18} y={y + ih + 22} width={cw * 0.55} height={12} rx={6} fill={withAlpha(spec.text, 0.75)} />
            <rect x={x + 18} y={y + ih + 46} width={54} height={11} rx={5.5} fill={spec.primary} />
            <rect x={x + cw - 84} y={y + ih + 38} width={66} height={26} rx={radius(spec.buttonStyle, 26)} fill="none" stroke={spec.border} strokeWidth={1.5} />
          </g>
        )
      })}
    </svg>
  )
}

/**
 * The same theme on a phone. 390×780, drawn from the same spec, so a card can
 * show both — the way a theme store does — without a second data source.
 */
export function ThemePhoneCover({ spec, className, style }: { spec: ThemeCoverSpec; className?: string; style?: CSSProperties }) {
  const PW = 390
  const PH = 780
  const heading = fontStack(spec.fontHeading, SERIF.test(spec.fontHeading) ? tt("Georgia, serif") : tt("Inter, system-ui, sans-serif"))
  const body = fontStack(spec.fontBody, tt("Inter, system-ui, sans-serif"))
  const darkPage = isDark(spec.bg)
  const onHero = spec.heroText
  const onHeroMuted = withAlpha(spec.heroText, 0.7)
  const btnR = radius(spec.buttonStyle, 40)
  const cardR = spec.buttonStyle === "square" ? 4 : spec.buttonStyle === "pill" ? 14 : 10
  const navH = 56
  const heroY = navH
  const heroH = 330
  const gridY = heroY + heroH
  const lines = wrap(spec.headline, 17, 3)
  const size = lines.some((l) => l.length > 14) ? 28 : 32
  const headlineY = heroY + 96
  const subY = headlineY + (lines.length - 1) * (size + 6) + 34
  const ctaY = Math.min(subY + 24, heroY + heroH - 66)
  const ctaW = Math.max(120, Math.min(220, spec.cta.length * 9 + 40))
  const ctaText = contrastText(spec.primary)
  const tiles = [withAlpha(spec.primary, darkPage ? 0.55 : 0.18), withAlpha(spec.text, darkPage ? 0.18 : 0.08)]

  return (
    <svg viewBox={`0 0 ${PW} ${PH}`} className={className} style={style} aria-hidden preserveAspectRatio={tt("xMidYMin slice")}>
      <rect width={PW} height={PH} fill={spec.bg} />
      {/* nav */}
      <line x1={0} y1={navH - 0.5} x2={PW} y2={navH - 0.5} stroke={spec.border} />
      <g fill={spec.text}>
        <rect x={20} y={22} width={18} height={2} rx={1} />
        <rect x={20} y={28} width={18} height={2} rx={1} />
        <rect x={20} y={34} width={18} height={2} rx={1} />
      </g>
      <text x={PW / 2} y={35} textAnchor="middle" fill={spec.text} fontFamily={heading} fontSize={17} fontWeight={700} letterSpacing={-0.3}>
        {spec.brand}
      </text>
      <rect x={PW - 40} y={20} width={18} height={16} rx={3} fill="none" stroke={spec.text} strokeWidth={1.6} />
      {/* hero */}
      <rect x={0} y={heroY} width={PW} height={heroH} fill={spec.heroBg} />
      <text x={PW / 2} y={heroY + 54} textAnchor="middle" fill={onHeroMuted} fontFamily={body} fontSize={11} letterSpacing={2} fontWeight={600}>
        {spec.brand.toUpperCase()}
      </text>
      {lines.map((l, i) => (
        <text key={i} x={PW / 2} y={headlineY + i * (size + 6)} textAnchor="middle" fill={onHero} fontFamily={heading} fontSize={size} fontWeight={700} letterSpacing={-0.6}>
          {l}
        </text>
      ))}
      <text x={PW / 2} y={subY} textAnchor="middle" fill={onHeroMuted} fontFamily={body} fontSize={13}>
        {spec.sub.length > 44 ? spec.sub.slice(0, 42).trimEnd() + "…" : spec.sub}
      </text>
      <rect x={PW / 2 - ctaW / 2} y={ctaY} width={ctaW} height={40} rx={btnR} fill={spec.primary} />
      <text x={PW / 2} y={ctaY + 25} textAnchor="middle" fill={ctaText} fontFamily={body} fontSize={14} fontWeight={600}>
        {spec.cta}
      </text>
      {/* grid */}
      <text x={20} y={gridY + 44} fill={spec.text} fontFamily={heading} fontSize={20} fontWeight={700} letterSpacing={-0.4}>
        {tt("Featured")}
      </text>
      {tiles.map((tint, i) => {
        const gap = 14
        const cw = (PW - 40 - gap) / 2
        const x = 20 + i * (cw + gap)
        const y = gridY + 66
        const ih = cw
        return (
          <g key={i}>
            <rect x={x} y={y} width={cw} height={ih + 70} rx={cardR} fill={darkPage ? spec.surface : spec.bg} stroke={spec.border} />
            <rect x={x + 1} y={y + 1} width={cw - 2} height={ih} rx={cardR - 1} fill={tint} />
            <rect x={x + 14} y={y + ih + 20} width={cw * 0.6} height={10} rx={5} fill={withAlpha(spec.text, 0.75)} />
            <rect x={x + 14} y={y + ih + 40} width={44} height={9} rx={4.5} fill={spec.primary} />
          </g>
        )
      })}
    </svg>
  )
}

/*
 * THE COVER IS THE SITE, NOTHING AROUND IT. The Website page used to set the
 * picture in a product shot: a grey stage, a browser window with dots, and a
 * phone standing in front ("windows in a window"). It is the desktop picture
 * now, cut to the box it is given, so a card's cover area is the site from
 * edge to edge. ThemePhoneCover stays for Browse themes, which shows the
 * phone version on its own when asked.
 */
