/**
 * ===========================================================================
 *  THE PARTS OF A CREATOR PAGE THAT ARE NOT SECTIONS
 * ===========================================================================
 * Picking a colour scheme repainted the sections and left everything else
 * where it was, so a dark scheme produced a page that was half painted: the
 * creator's name in near-black ON near-black, a tab strip in the design
 * system's greys, a white subscribe bar across the top, and a white footer
 * band under a black page. All four are real screenshots.
 *
 * The reason is structural rather than a missed colour. `applySectionThemeColors`
 * walks `config.sections` and writes the theme into each one, and the header,
 * the tab strip, the subscribe bar and the footer are NOT sections — they are
 * page chrome, rendered outside that list, reading either the design system's
 * tokens or a stored value that the builder wrote once and never revisits.
 *
 * So this is the same job for the chrome: given the scheme and whatever the
 * creator stored, what colour is each part.
 *
 * ---------------------------------------------------------------------------
 *  WHY A STORED VALUE DOES NOT ALWAYS WIN
 * ---------------------------------------------------------------------------
 * The builder writes the WHOLE settings object out on every save, so almost
 * every config on the platform carries `backgroundColor: "#ffffff"` and
 * `textColor: "#000000"` whether or not anyone chose them. Reading those as
 * decisions is what pinned the page to white-on-black forever: the creator
 * picks Astrid, the page goes dark, and the name stays #000000 because a save
 * from two months ago said so.
 *
 * page-surface.ts already settled this for backgrounds — a stored white means
 * "nobody chose". The same rule for text: a stored black means nobody chose.
 * Any other colour is a real decision and is left exactly alone, so a creator
 * who deliberately set their name to dark green still gets dark green.
 */
import { themePresets } from "./defaults"
import type { ThemePreset } from "./types"
import { isInheritedWhite, storefrontPageBackground } from "./page-surface"
import { contrastRatio, parseColor } from "@/lib/storelib-theme/contrast"
import { colourLightness } from "./scheme-tone"

const BLACK = new Set(["#000", "#000000", "black", "rgb(0,0,0)", "rgb(0, 0, 0)", "transparent", ""])

/** Did anyone actually choose this text colour, or is it the builder's default black? */
export function isInheritedBlack(colour?: string | null): boolean {
  if (!colour) return true
  return BLACK.has(colour.trim().toLowerCase())
}

/** Mix two colours. `amount` is how much of `b` ends up in the result. */
function mix(a: string, b: string, amount: number): string | undefined {
  const x = parseColor(a)
  const y = parseColor(b)
  if (!x || !y) return undefined
  const ch = (p: number, q: number) => Math.round(p + (q - p) * amount)
  const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")
  return `#${hex(ch(x.r, y.r))}${hex(ch(x.g, y.g))}${hex(ch(x.b, y.b))}`
}

/**
 * A COLOUR THAT CAN ACTUALLY BE READ ON THIS BACKGROUND.
 *
 * Deriving a muted colour by mixing text toward the background is how a muted
 * colour is normally made, and it walks straight past the point where a
 * person can still read it. The probe caught exactly that: the footer links
 * came out at 2.7 to 1 on four of the five schemes, WORSE than the flat grey
 * they replaced, because a mix has no idea what it is aiming at.
 *
 * So a derived colour is checked and, if it falls short, stepped back toward
 * whichever end of the range increases the contrast until it clears the
 * ratio. 4.5 is WCAG AA for ordinary type. The step is 5% at a time so the
 * result is the LIGHTEST grey that still passes rather than a jump to black,
 * which would throw away the distinction between muted and not.
 */
export function ensureContrast(foreground: string, background: string, need = 4.5): string {
  const fg = parseColor(foreground)
  const bg = parseColor(background)
  if (!fg || !bg) return foreground
  if (contrastRatio(fg, bg) >= need) return foreground
  const target = lightness(background) < 0.5 ? "#ffffff" : "#000000"
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(foreground, target, step / 20)
    const parsed = candidate && parseColor(candidate)
    if (candidate && parsed && contrastRatio(parsed, bg) >= need) return candidate
  }
  return target
}

/** Perceived lightness, 0 (black) to 1 (white): the one the product page's "dark" is decided by too. */
const lightness = (colour: string): number => colourLightness(colour)

/**
 * The secondary colours ON a product card, derived from the two the theme
 * actually states. A card's own settings carry a background and a text
 * colour; the category pill and the greyed-out original price are a step
 * between them, and deriving that is the only way it holds on a scheme the
 * theme authors have not seen.
 */
export function cardAccents(backgroundColor?: string, textColor?: string) {
  if (!backgroundColor || !textColor) return {}
  const cardIsDark = lightness(backgroundColor) < 0.5
  const badgeBackgroundColor = mix(backgroundColor, textColor, cardIsDark ? 0.14 : 0.08) || backgroundColor
  return {
    mutedColor: ensureContrast(mix(textColor, backgroundColor, 0.38) || textColor, backgroundColor),
    badgeBackgroundColor,
    badgeTextColor: ensureContrast(mix(textColor, backgroundColor, cardIsDark ? 0.1 : 0.2) || textColor, badgeBackgroundColor),
  }
}

export interface StorefrontBarColors {
  backgroundColor: string
  textColor: string
  buttonColor: string
  buttonTextColor: string
}

export interface StorefrontChrome {
  /** The field the whole page sits on. */
  pageBackground: string
  /** Type on that field: the creator's name, a tab label, a product title. */
  text: string
  /** Everything secondary: the handle, the bio, a price, an inactive tab. */
  muted: string
  /** Hairlines: the rule under the tabs, a card edge, the footer's top border. */
  border: string
  /** A pill sitting on a card — "Digital", a discount flag. */
  badgeBackground: string
  badgeText: string
  /** The footer band, which is its own surface rather than part of the field. */
  footerBackground: string
  footerText: string
  footerMuted: string
  /** The bar across the very top. */
  bar: StorefrontBarColors
  /**
   * The ring around the profile picture: the page's own background, so the
   * photo reads as cut out of the page where it crosses the cover (white on
   * a white page, near black on a dark one, never a white hoop on black).
   * Only a ring a creator picked by hand overrides it; see
   * `ringIsChoice` below.
   */
  avatarBorder: string
  /**
   * THE DESIGN SYSTEM'S OWN TOKENS, REBOUND TO THE SCHEME.
   *
   * Threading a `surface` prop into every component is exact, and it does not
   * scale: this page renders reviews, empty states, category chips, grids and
   * a dozen shadcn primitives, all of which paint from `--foreground`,
   * `--muted-foreground`, `--card` and `--border`. Those variables describe
   * the Storelib app, so inside a creator page on a dark scheme every one of
   * them is the wrong colour, and chasing them one at a time is how three
   * separate rounds of this fix each missed something.
   *
   * Tailwind v4 reads them as plain custom properties (`--color-foreground:
   * var(--foreground)`), so redefining them on the page's root element
   * rebinds every utility underneath it in one place, with no stylesheet
   * change and nothing to keep in step. Spread onto the wrapper's `style`.
   *
   * Semantic colours are deliberately NOT here. `--destructive` stays red
   * because red means a discount or a danger, and a colour scheme does not
   * get to decide what those mean.
   */
  tokens: Record<string, string>
  /**
   * FOLLOW, FOLLOWING AND MESSAGE ON THE PAGE, in Storelib's own button
   * language (components/ui/depth-button.ts: a solid primary with a line of
   * light on top and a darker foot, a quiet secondary with a hairline and a
   * soft foot, both flat when pressed) painted in this scheme's colours.
   *
   * `background` / `text` are the scheme's buy button, so a creator on a
   * green scheme gets a green Follow; `hover` and `press` are that colour a
   * step and two steps further from the page. `quiet` is the secondary
   * (Following, Message): a surface a step off the page, a hairline and the
   * page's text. `radius`
   * is the scheme's rounding, kept for anything else that wants it; the
   * follow buttons wear Storelib's own shape.
   */
  action: SchemeAction
  /** Is the field dark enough that the design system's own tokens disappear? */
  dark: boolean
  /** The scheme this was resolved from, for anything that needs to say so. */
  preset: ThemePreset
}

export interface SchemeAction {
  background: string
  text: string
  radius: number
  hover: string
  press: string
  quiet: { background: string; hover: string; press: string; border: string; text: string }
  /** Is the page dark (the depth's shadows and the quiet surface lean the other way). */
  dark: boolean
}

export interface StoredChrome {
  /** `globalColors.backgroundColor` — the creator's own page colour. */
  pageBackground?: string | null
  /** `headerSettings.colors.textColor` / `textsColor`. */
  text?: string | null
  /** `headerSettings.profileImageBorderColor`. */
  avatarBorder?: string | null
  /**
   * `headerSettings.subscribeBar`, flattened, plus `chosen`: the names of the
   * fields in it a creator actually picked. See the note on the bar below.
   */
  bar?: (Partial<StorefrontBarColors> & { chosen?: string[] | null }) | null
}

/**
 * Everything the chrome needs, in one object, resolved once per render.
 *
 * Order, every time: the creator's stored choice if it IS a choice, then the
 * scheme, then the platform default. Nothing here invents a colour — the
 * fallbacks are the same values these components were hardcoding before.
 */
export function resolveStorefrontChrome(
  preset: string | undefined,
  stored: StoredChrome = {},
): StorefrontChrome {
  const key = (preset && preset in themePresets ? preset : "default") as ThemePreset
  const theme = themePresets[key]

  const themePage = theme.sections.pageBackgroundColor
  const pageBackground = storefrontPageBackground(
    !isInheritedWhite(stored.pageBackground)
      ? stored.pageBackground
      : !isInheritedWhite(themePage)
        ? themePage
        : undefined,
  )

  const dark = lightness(pageBackground) < 0.5

  /**
   * The creator's typed colour, else the scheme's header text, else the two
   * ends of the range. `sections.headerTextColor` is the right field: it is
   * what the scheme says type ON the page reads as, and the profile block is
   * the top of the page.
   */
  const text = !isInheritedBlack(stored.text)
    ? (stored.text as string)
    : !isInheritedBlack(theme.sections.headerTextColor)
      ? theme.sections.headerTextColor
      : dark
        ? "#fafafa"
        : "#0f0f14"

  /**
   * Muted is derived, not stored and not a scheme field. Mixing the text 42%
   * of the way into the page gives the same relationship on a light page and
   * a dark one, which an alpha suffix also does — but this comes out as a
   * real hex, so it survives being handed to a component that concatenates
   * it, sets it on an SVG, or puts it in a gradient.
   */
  const muted = ensureContrast(mix(text, pageBackground, 0.42) || text, pageBackground)

  const border = mix(text, pageBackground, dark ? 0.82 : 0.86) || theme.colors.border

  /**
   * A badge is a pill ON a card, so it is measured against the card rather
   * than the page. The scheme gives the card; the pill is a step away from it
   * in the direction of the text, which is how the light version already read.
   */
  const badgeBackground = mix(theme.productCard.backgroundColor, theme.productCard.textColor, dark ? 0.14 : 0.08)
    || theme.productCard.backgroundColor
  const badgeText = ensureContrast(theme.productCard.textColor, badgeBackground)

  const footerBackground = !isInheritedWhite(theme.sections.footerBackgroundColor)
    ? theme.sections.footerBackgroundColor
    : "#ffffff"
  const footerText = ensureContrast(
    theme.sections.footerTextColor || (dark ? "#a1a1aa" : "#6b7280"),
    footerBackground,
  )
  /**
   * "Powered by" and the separator. A shade off the links rather than a
   * different decision, and held to the same ratio: 11px grey on a pale band
   * is exactly the text people cannot read.
   */
  const footerMuted = ensureContrast(mix(footerText, footerBackground, 0.22) || footerText, footerBackground)

  /**
   * THE BAR. Its four colours were hardcoded white / black / blue / white at
   * the page, below the scheme entirely, which is why it stayed a white strip
   * across the top of a black page. Every preset already carries a
   * `subscribeBar` block designed against its own palette; it just had no way
   * to reach the live page.
   */
  /**
   * ---------------------------------------------------------------------------
   *  A COLOUR SOMEBODY PICKED, versus a colour the builder wrote out again
   * ---------------------------------------------------------------------------
   * The three rules below decide that by LOOKING AT THE COLOUR: white is not a
   * background, black is not a text colour, #2563eb is not a button. That is
   * the only thing available for the configs written before the bar could be
   * edited at all, and it is wrong the moment a creator picks one of those
   * colours on purpose. White text on a coloured button is not an exotic
   * choice; it is the ordinary one, and choosing it did nothing, every time.
   *
   * So a choice is now RECORDED when it is made, and a recorded field skips
   * the guessing entirely. Same shape as `stickyBarChoiceMade`: absent means
   * nobody has chosen and the old rule still answers, which is what keeps a
   * dark scheme from getting a white strip back across the top of it.
   *
   * Per field, not per bar. Freezing all four the first time one is picked is
   * how the scheme stopped being able to paint the bar last time.
   */
  const chosen = new Set(Array.isArray(stored.bar?.chosen) ? stored.bar.chosen : [])
  const picked = (key: keyof StorefrontBarColors) =>
    chosen.has(key) && typeof stored.bar?.[key] === "string" && stored.bar[key]!.trim().length > 0

  const bar: StorefrontBarColors = {
    backgroundColor: picked("backgroundColor")
      ? (stored.bar!.backgroundColor as string)
      : !isInheritedWhite(stored.bar?.backgroundColor)
        ? (stored.bar!.backgroundColor as string)
        : theme.subscribeBar.backgroundColor,
    textColor: picked("textColor")
      ? (stored.bar!.textColor as string)
      : !isInheritedBlack(stored.bar?.textColor)
        ? (stored.bar!.textColor as string)
        : theme.subscribeBar.textColor,
    buttonColor: picked("buttonColor")
      ? (stored.bar!.buttonColor as string)
      : stored.bar?.buttonColor && stored.bar.buttonColor !== "#2563eb"
        ? stored.bar.buttonColor
        : theme.subscribeBar.buttonColor,
    buttonTextColor: picked("buttonTextColor")
      ? (stored.bar!.buttonTextColor as string)
      : !isInheritedWhite(stored.bar?.buttonTextColor)
        ? (stored.bar!.buttonTextColor as string)
        : theme.subscribeBar.buttonTextColor,
  }

  /**
   * THE RING IS THE PAGE. The owner: the ring around the photo follows the
   * scheme, its background, not white on a dark page. Picking a scheme in
   * the builder writes that scheme's own ring colour into the header, and
   * almost every older config carries the platform's "#e5e7eb", so neither
   * is a decision; a white ring is the old default too. Anything else was
   * picked in the builder's ring control and is left alone.
   */
  const storedRing = stored.avatarBorder?.trim().toLowerCase()
  const avatarBorder = storedRing && ringIsChoice(storedRing) ? (stored.avatarBorder as string) : pageBackground

  const cardBackground = theme.productCard.backgroundColor
  const cardText = theme.productCard.textColor
  const cardBorder = theme.productCard.borderColor

  const tokens: Record<string, string> = {
    "--background": pageBackground,
    "--foreground": text,
    "--card": cardBackground,
    "--card-foreground": cardText,
    "--popover": cardBackground,
    "--popover-foreground": cardText,
    "--muted": mix(pageBackground, text, 0.06) || pageBackground,
    "--muted-foreground": muted,
    "--secondary": badgeBackground,
    "--secondary-foreground": badgeText,
    "--accent": mix(pageBackground, text, 0.08) || pageBackground,
    "--accent-foreground": text,
    "--border": cardBorder || border,
    "--input": cardBorder || border,
    "--ring": theme.colors.primary,
  }

  return {
    pageBackground,
    text,
    muted,
    border,
    badgeBackground,
    badgeText,
    footerBackground,
    footerText,
    footerMuted,
    bar,
    avatarBorder,
    tokens,
    action: schemeAction({
      background: theme.productHeader?.buyButtonColor || theme.colors.primary,
      text: theme.productHeader?.buyButtonTextColor || "#ffffff",
      radius: theme.productHeader?.buttonsBorderRadius ?? theme.buttonBorderRadius ?? 8,
      page: pageBackground,
      ink: text,
    }),
    dark,
    preset: key,
  }
}

/** Ring colours that were written for a creator rather than chosen by one. */
const UNCHOSEN_RINGS = new Set([
  "#e5e7eb",
  "#fff",
  "#ffffff",
  "white",
  ...Object.values(themePresets).map((t) => String(t.profileImageBorderColor || "").trim().toLowerCase()),
])

/** Did a creator pick this ring colour in the builder, or was it written for them? */
export function ringIsChoice(ring: string | null | undefined): boolean {
  const r = ring?.trim().toLowerCase()
  return !!r && !UNCHOSEN_RINGS.has(r)
}

/**
 * The follow buttons' colours for one scheme (see `action` above). Pure, so
 * the probe and the tests ask it the same question the page does.
 *
 * A buy colour that disappears into the page (a black button on a black
 * page) is not a primary any more, so then the page's own ink fills it
 * instead, with the page colour as its type: the same move Storelib's near
 * black primary makes on a white page.
 */
export function schemeAction(input: { background: string; text: string; radius: number; page: string; ink: string }): SchemeAction {
  const dark = lightness(input.page) < 0.5
  const fill = parseColor(input.background)
  const ground = parseColor(input.page)
  const visible = fill && ground ? contrastRatio(fill, ground) >= 1.6 : true
  const background = visible ? input.background : input.ink
  const text = visible ? ensureContrast(input.text, background) : input.page
  /* A step further from the page on hover and two when pressed, as #1a1a2e goes to #2a2a40 and #0f0f1c. */
  const fillDark = lightness(background) < 0.5
  const hover = mix(background, fillDark ? "#ffffff" : "#000000", 0.08) || background
  const press = mix(background, "#000000", fillDark ? 0.18 : 0.12) || background
  /* The quiet one: white on a light page as Storelib's secondary is, a step lighter than the page on a dark one. */
  const quietBg = dark ? mix(input.page, input.ink, 0.06) || input.page : mix(input.page, "#ffffff", 0.75) || "#ffffff"
  return {
    background,
    text,
    radius: input.radius,
    hover,
    press,
    quiet: {
      background: quietBg,
      hover: mix(quietBg, input.ink, dark ? 0.06 : 0.03) || quietBg,
      press: mix(quietBg, input.ink, dark ? 0.1 : 0.055) || quietBg,
      border: mix(input.ink, quietBg, dark ? 0.8 : 0.82) || "#d9dbe0",
      text: ensureContrast(input.ink, quietBg),
    },
    dark,
  }
}
