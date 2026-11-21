/**
 * ===========================================================================
 *  THE PAGE'S BUTTON: ONE PLACE THAT TURNS THE SAVED THEME INTO ITS LOOK
 * ===========================================================================
 * The link button, the PDF, menu and booking blocks and the email form all
 * drew the same button from five copies of the same object literal in
 * components/onepage/public-onepage.tsx (and a sixth in extra-blocks.tsx).
 * They draw it from here now, and so do the samples in the Design tab, so the
 * editor, the preview and the live page cannot disagree.
 *
 * EVERY SAVED PAGE KEEPS ITS LOOK. Nothing here is migrated by rewriting what
 * is stored. The old values are read as they are:
 *   - button_style "filled" | "outline" | "glass" draw exactly as before;
 *     "soft" (a tint of the button colour) is new.
 *   - button_border_radius stays a number. The Shape control reads it: 0 is
 *     Square, 100 or more is Pill (Sunset saves 999), anything else Rounded.
 *   - button_shadow "none" | "subtle" | "strong" | "hard" draw as before.
 *   - button_hover_animation "default" (or nothing) is the Lift hover, "fade"
 *     and "zoom" are kept, and none | lift | glow | fill | underline are new.
 *   - button_size, button_text_align and button_icon_position are new and,
 *     when missing, are the sizes and places every button had before.
 * tests/onepage-buttons.test.ts holds the old drawing code and checks this
 * against it for every theme and every saved combination.
 */
import type { CSSProperties } from "react"
import { readableOn } from "./theme-apply"
import { SEE_THROUGH_MIN, TEXT_MIN, buttonGrounds, contrastOn, fadeThatReads, lum, over, pageGrounds, parseColor, readableInk, toHex, worstContrast, type Rgba } from "./contrast"

export type ButtonFill = "filled" | "soft" | "outline" | "glass"
export type ButtonShadow = "none" | "subtle" | "strong" | "hard"
export type ButtonShape = "square" | "rounded" | "pill"
export type ButtonSize = "compact" | "regular" | "large"
export type ButtonAlign = "center" | "left"
export type ButtonIconSide = "left" | "right"
export type ButtonHover = "none" | "lift" | "fade" | "zoom" | "glow" | "fill" | "pop" | "underline"

/** The fields of a theme this reads. Everything is optional: a page saved years ago has half of them. */
export interface ButtonThemeLike {
  button_style?: string | null
  button_color?: string | null
  button_text_color?: string | null
  button_border_radius?: number | null
  button_border_width?: number | null
  button_border_color?: string | null
  button_shadow?: string | null
  button_shadow_color?: string | null
  button_hover_animation?: string | null
  button_size?: string | null
  button_text_align?: string | null
  button_icon_position?: string | null
  /* Round 40: the colours Fill and Pop turn a button to. Missing is what Fill always did. */
  button_hover_fill?: string | null
  button_hover_text?: string | null
}

/** A pill is drawn with this radius; anything at or past PILL_FROM reads as a pill. */
export const PILL_RADIUS = 999
export const PILL_FROM = 100

/**
 * rgba() from #rrggbb, as the page has always made it (a 6 digit colour gives
 * the same string it always gave). A 3 digit colour is widened first; it used
 * to come out as rgba(NaN…), which a browser drops, so it drew no shadow.
 */
export function hexToRgba(hex: string, alpha: number): string {
  let h = String(hex || "").trim()
  if (/^#[0-9a-f]{3}$/i.test(h)) h = "#" + h.slice(1).split("").map((c) => c + c).join("")
  const r = Number.parseInt(h.slice(1, 3), 16)
  const g = Number.parseInt(h.slice(3, 5), 16)
  const b = Number.parseInt(h.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function buttonFill(theme: ButtonThemeLike): ButtonFill {
  const s = theme.button_style
  return s === "outline" || s === "glass" || s === "soft" ? s : "filled"
}

export function buttonShadow(theme: ButtonThemeLike): ButtonShadow {
  const s = theme.button_shadow
  return s === "subtle" || s === "strong" || s === "hard" ? s : "none"
}

export function buttonShape(radius: number | null | undefined): ButtonShape {
  const r = Number(radius ?? 8)
  if (!(r > 0)) return "square"
  return r >= PILL_FROM ? "pill" : "rounded"
}

export function buttonSize(theme: ButtonThemeLike): ButtonSize {
  return theme.button_size === "compact" || theme.button_size === "large" ? theme.button_size : "regular"
}

export function buttonAlign(theme: ButtonThemeLike): ButtonAlign {
  return theme.button_text_align === "left" ? "left" : "center"
}

export function buttonIconSide(theme: ButtonThemeLike): ButtonIconSide {
  return theme.button_icon_position === "right" ? "right" : "left"
}

/**
 * The hover a saved page asked for. "default", null and anything unknown is Lift.
 * ROUND 24, the owner: "On hover does nothing". A button inside a group or a
 * carousel used to be handed "none" (or Fill for Pop) here, so on a page made of
 * groups every choice but Fill looked broken. Every button plays the choice now;
 * the rows leave room for the rise (app/globals.css, THE ROW LEAVES ROOM).
 */
export function buttonHover(theme: ButtonThemeLike): ButtonHover {
  const h = theme.button_hover_animation
  switch (h) {
    case "none":
    case "fade":
    case "zoom":
    case "glow":
    case "fill":
    case "pop":
    case "underline":
    case "lift":
      return h
    default:
      return "lift"
  }
}

/** The resting shadow, exactly as the page drew it before. */
export function buttonShadowCss(theme: ButtonThemeLike): string {
  const color = theme.button_shadow_color || "#000000"
  switch (buttonShadow(theme)) {
    case "subtle":
      return `0 2px 4px ${hexToRgba(color, 0.15)}`
    case "strong":
      return `0 4px 12px ${hexToRgba(color, 0.3)}`
    case "hard":
      return `4px 4px 0px ${hexToRgba(color, 0.9)}`
    default:
      return "none"
  }
}

/** The fill behind the label: the colour, none (outline), frosted white (glass) or a 14% tint of the colour (soft). */
export function buttonBackground(theme: ButtonThemeLike): string {
  const fill = buttonFill(theme)
  return fill === "outline"
    ? "transparent"
    : fill === "glass"
      ? "rgba(255, 255, 255, 0.15)"
      : fill === "soft"
        ? `color-mix(in srgb, ${theme.button_color} 14%, transparent)`
        : (theme.button_color as string)
}

/**
 * The button at rest: fill, text colour, corners, border, blur and shadow.
 * For filled, outline and glass this is, key for key, the object every block
 * used to build for itself.
 */
export function themeButtonStyle(theme: ButtonThemeLike): CSSProperties {
  const fill = buttonFill(theme)
  const width = theme.button_border_width || 0
  const drawn = fill === "outline" ? Math.max(2, width) : width
  return {
    backgroundColor: buttonBackground(theme),
    /*
      ROUND 41, "a scattered border" round a pill on a dark page. The fill was
      painted under the border out to the outer edge, so at the curve two
      anti-aliased layers met: the fill's and the border's. Wherever the fill
      was lighter than the border (or the border see-through), a hair of fill
      showed outside it, unevenly, worst in WebKit. With a border the fill now
      stops inside it: the outer edge is the border's alone.
    */
    backgroundClip: drawn > 0 ? "padding-box" : undefined,
    color: theme.button_text_color as string,
    borderRadius: `${theme.button_border_radius}px`,
    borderWidth: `${drawn}px`,
    borderStyle: "solid",
    borderColor: fill === "outline" ? (theme.button_border_color || theme.button_color) as string : (theme.button_border_color as string),
    backdropFilter: fill === "glass" ? "blur(10px)" : undefined,
    boxShadow: buttonShadowCss(theme),
  }
}

/**
 * The fill a header strip inside a button takes (the YouTube and Pro titles): the button colour when solid, else none.
 * Round AR: a see-through Solid colour (a glass theme saved as Solid, rgba(255,255,255,0.15)) is already the
 * card's own fill, so the strip laid it a second time and white words fell under 4.5:1 on it
 * (scripts/check-onepage-contrast-ar5.mjs, Ocean and Aurora). The strip is clear then: the card shows through.
 */
export function themeButtonStripFill(theme: ButtonThemeLike): string {
  if (buttonFill(theme) !== "filled") return "transparent"
  const c = parseColor(theme.button_color)
  return c && c.a < 1 ? "transparent" : (theme.button_color as string)
}

function luminance(color: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color || "").trim())
  if (!m) return null
  const n = Number.parseInt(m[1], 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

/** A hover colour as saved: #rrggbb (or #rgb), else nothing, so a hand edited value cannot break the page. */
function validColour(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  if (/^#[0-9a-f]{6}$/i.test(s)) return s
  return /^#[0-9a-f]{3}$/i.test(s) ? "#" + s.slice(1).split("").map((c) => c + c).join("") : null
}

/**
 * What the hover layers need, as CSS variables on the button. The layers
 * themselves are in app/globals.css (`.op-btn`), so the page and the editor's
 * samples run the same rules. Only opacity, `translate` and `scale` move.
 */
export function buttonHoverVars(theme: ButtonThemeLike): CSSProperties {
  const fill = buttonFill(theme)
  const shadow = buttonShadow(theme)
  const shadowColor = theme.button_shadow_color || "#000000"
  const accent = (theme.button_color as string) || "#1a1a2e"
  const width = fill === "outline" ? Math.max(2, theme.button_border_width || 0) : theme.button_border_width || 0
  const ground = pageGrounds(theme as never)[0] ?? parseColor("#ffffff")!
  /*
    ROUND 24: LIFT THE PAGE CAN SHOW. A black shadow at 28% under a button on a near black page is no shadow at
    all, so Lift there was a 2px rise and nothing else, and read as "does nothing". On a dark page the shadow is
    deeper and the button gets a hairline of its own colour, so it reads as raised off the page.
  */
  const darkGround = lum(ground) < 0.2
  const hoverShadow =
    shadow === "hard"
      ? `6px 6px 0px ${hexToRgba(shadowColor, 0.9)}`
      : darkGround
        ? `0 14px 30px -10px ${hexToRgba(shadowColor, 0.75)}, 0 4px 10px -4px ${hexToRgba(shadowColor, 0.5)}, 0 0 0 1px color-mix(in srgb, ${accent} 22%, transparent)`
        : `0 10px 24px -8px ${hexToRgba(shadowColor, 0.28)}, 0 3px 8px -3px ${hexToRgba(shadowColor, 0.16)}`
  /*
    Fill (and Pop, which is Fill with Lift's rise): a solid button turns to
    its text colour, anything else fills with the button colour, unless the
    page chose its own hover colours (round 40), which win. A chosen fill
    with no chosen words gets words that read on it.
  */
  const ownFill = validColour(theme.button_hover_fill)
  const ownText = validColour(theme.button_hover_text)
  /* Round AR: whichever of near black and white reads better on the fill, by WCAG contrast (lib/onepage/contrast), not a guess from brightness. */
  const inkOn = (c: string) => {
    const ground = parseColor(c)
    return ground && contrastOn(parseColor("#111113")!, ground) >= contrastOn(parseColor("#ffffff")!, ground) ? "#111113" : "#ffffff"
  }
  const rawFill = ownFill ?? (fill === "filled" ? (theme.button_text_color as string) : accent)
  const rawText = ownText ?? (ownFill ? inkOn(ownFill) : fill === "filled" ? accent : inkOn(accent))
  /*
    ROUND 3: THE HOVER'S PAIR IS MEASURED, NOT ASSUMED. A Solid button fills with its words' colour and its words
    turn the button colour: on a glass theme saved as Solid that colour is see-through (white at 15%), so the words
    under the pointer were white at 15% on white. A page's own hover colours were used as saved, words and fill
    never checked against each other. The fill is laid over the page as the browser lays it (a see-through one made
    the solid colour it shows), and the words are the nearest colour that reads on it (readableInk), kept when they do.
  */
  const fillParsed = parseColor(rawFill)
  const fillWith = fillParsed && fillParsed.a < 1 ? toHex(over(fillParsed, ground)) : rawFill
  const fillSolid = parseColor(fillWith)
  const fillText = fillSolid ? readableInk(rawText, [fillSolid]) : rawText
  /*
    Fade (the hover that lays the whole button at 80%) fades only as far as keeps its words at 4.5:1 and a step
    (lib/onepage/contrast fadeThatReads): on a button with no room to spare it does not fade.
  */
  const fade = buttonHover(theme) === "fade" ? Math.max(...pageGrounds(theme as never).map((g) => fadeThatReads(theme.button_text_color, toHex(buttonGrounds(theme as never, [g])[0] ?? g), [g], TEXT_MIN + 1, 0.8))) : 0.8
  return {
    ["--op-bw" as string]: `${width}px`,
    ["--op-accent" as string]: accent,
    ["--op-hover-shadow" as string]: hoverShadow,
    ["--op-fill" as string]: fillWith,
    ["--op-fill-text" as string]: fillText,
    ...(fade !== 0.8 ? { ["--op-fade" as string]: String(fade) } : {}),
  }
}

/** Padding and type size for each button size. Regular is what every button had before. */
export const BUTTON_SIZE_CLASS: Record<ButtonSize, string> = {
  compact: "py-[13px] sm:py-[15px] px-4 sm:px-5 text-[13px] sm:text-[14px]",
  regular: "py-[19.5px] sm:py-[21.5px] px-5 sm:px-6 text-[13px] sm:text-[15px]",
  large: "py-[24px] sm:py-[26px] px-6 sm:px-7 text-[15px] sm:text-[16px]",
}

/** The icon or thumbnail at the button's side, per size. Regular is the old 32/36px at 20px in. */
export const BUTTON_ICON_CLASS: Record<ButtonSize, string> = {
  compact: "w-[26px] h-[26px] sm:w-[28px] sm:h-[28px]",
  regular: "w-[32px] h-[32px] sm:w-[36px] sm:h-[36px]",
  large: "w-[36px] h-[36px] sm:w-[40px] sm:h-[40px]",
}

export const BUTTON_ICON_INSET: Record<ButtonSize, Record<ButtonIconSide, string>> = {
  compact: { left: "left-[14px]", right: "right-[14px]" },
  regular: { left: "left-[20px]", right: "right-[20px]" },
  large: { left: "left-[22px]", right: "right-[22px]" },
}

/* ─── The product block's buttons ──────────────────────────────────────── */

/** A card stops at 28px on a Pill page: a pill's 999px would make the card an oval and crop its picture to one. */
export function cardRadius(theme: ButtonThemeLike): number {
  const r = Number(theme.button_border_radius ?? 8)
  return buttonShape(r) === "pill" ? 28 : r
}

const sameColor = (a?: string | null, b?: string | null) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase()

/**
 * THE BUTTON INSIDE A PRODUCT CARD IS THE PAGE'S BUTTON, made to read on the
 * card. It takes the page's style, corners, border, shadow and hover, exactly
 * as a link button does, with three exceptions that are about being seen:
 *   - a Solid card wears the button colour itself (the card is the page's
 *     button), so its button turns the page's pair around: the words' colour
 *     as the fill, the button colour as the words;
 *   - over a picture (the Overlay layout) it is white with near-black words;
 *   - a colour chosen for this block's button wins, as it always has.
 * On Soft, Outline and Glass the words are the page's, unless they would not
 * read on the card (readableOn), as the card's own words are.
 * Returns a theme to draw with themeButtonStyle and buttonHoverVars.
 */
export function cardButtonTheme(
  theme: ButtonThemeLike,
  o: { surface: string; cardText: string; ownBackground?: string | null; ownButtonColor?: string | null; ownButtonText?: string | null; onPhoto?: boolean },
): ButtonThemeLike {
  let t: ButtonThemeLike
  if (o.onPhoto) {
    t = { ...theme, button_style: "filled", button_color: "#ffffff", button_text_color: "#111113", button_border_color: "#ffffff" }
  } else if (o.ownButtonColor) {
    const hex = /^#[0-9a-f]{6}$/i.test(o.ownButtonColor)
    t = { ...theme, button_style: "filled", button_color: o.ownButtonColor, button_text_color: readableOn(hex ? o.ownButtonColor : o.surface, o.cardText, o.ownButtonText) }
  } else if (buttonFill(theme) === "filled") {
    const onButtonColour = !o.ownBackground || sameColor(o.ownBackground, theme.button_color)
    /* Round AR: the pair turned round must still read: a see-through button colour (a glass theme saved as Solid) as words on its own text colour was white on white. */
    t = onButtonColour ? { ...theme, button_color: theme.button_text_color, button_text_color: wordsOn(theme.button_text_color, theme.button_color, theme) } : { ...theme }
  } else if (buttonFill(theme) !== "outline" && !o.ownBackground && readsOnDoubleTint(theme, (theme.button_text_color as string) || o.cardText)) {
    /* Round 3: the words read on the tint where the card draws it: kept, not measured again on the page's colour (Classic 98's ink on its grey Soft read 5.5:1 there, and was swapped for white, 3.4:1). */
    t = { ...theme, button_text_color: (theme.button_text_color as string) || o.cardText }
  } else if (buttonFill(theme) !== "outline" && !o.ownBackground && readsOnDoubleTint(theme, deeperInk(theme, (theme.button_text_color as string) || o.cardText))) {
    /* Round AR: the words, deepened just enough to read on the tint laid twice; the button keeps the page's Soft or Glass. */
    t = { ...theme, button_text_color: deeperInk(theme, (theme.button_text_color as string) || o.cardText) }
  } else if (buttonFill(theme) !== "outline" && !o.ownBackground && !readsOnDoubleTint(theme, (theme.button_text_color as string) || o.cardText)) {
    /*
      Round AR: Soft and Glass on a card that is itself Soft or Glass lay
      the tint twice, and on a mid-tone page (Sunset, Ocean, Cobalt) no
      words could read on the double tint. Only there, the card's button is
      a solid one in the card's words' colour, its words in the page's
      colour; where the words read, it stays the page's own Soft or Glass.
    */
    const ink = (theme.button_text_color as string) || o.cardText
    t = { ...theme, button_style: "filled", button_color: ink, button_border_color: ink, button_text_color: wordsOn(ink, (theme as { background_color?: string }).background_color ?? "#111113", theme) }
  } else {
    t = { ...theme, button_text_color: readableOn(o.surface, (theme.button_text_color as string) || o.cardText) }
  }
  if (o.ownButtonText && !o.ownButtonColor && !o.onPhoto) t.button_text_color = wordsOn(t.button_color, o.ownButtonText, theme)
  return t
}

/** The contrast a button's words are held to: a step more on a see-through fill (lib/onepage/contrast SEE_THROUGH_MIN). */
function wordsMin(theme: ButtonThemeLike): number {
  const fill = buttonFill(theme)
  const c = parseColor(theme.button_color)
  return fill === "soft" || fill === "glass" || (fill === "filled" && !!c && c.a < 1) ? SEE_THROUGH_MIN : TEXT_MIN
}

/**
 * What a Soft or Glass button on a card shows under its words. Round 3: three layers of the tint, not two. A card's
 * button sits on the card's surface, and the card on the block's own (an app block's card, a product's host), each
 * drawn in the page's button look: measured on pixels, Graphite's glass "Get it now" sat on 37% white, the tint laid
 * three times, where two were counted.
 */
function onCardGrounds(theme: ButtonThemeLike): Rgba[] {
  return buttonGrounds(theme as never, buttonGrounds(theme as never, buttonGrounds(theme as never)))
}

/** Do the words read on a Soft or Glass button laid on a card that is itself Soft or Glass? */
function readsOnDoubleTint(theme: ButtonThemeLike, ink: string): boolean {
  const c = parseColor(ink)
  if (!c) return true
  return worstContrast(c, onCardGrounds(theme)) >= SEE_THROUGH_MIN
}

/** The words moved toward black or white until they read on the tint laid on the card (lib/onepage/contrast readableInk). */
function deeperInk(theme: ButtonThemeLike, ink: string): string {
  return readableInk(ink, onCardGrounds(theme), SEE_THROUGH_MIN)
}

/** Words in `preferred` on a button filled with `fill` (over the page when see-through), rescued when they would not read (lib/onepage/contrast). */
function wordsOn(fill: unknown, preferred: unknown, theme: ButtonThemeLike): string {
  const ground = pageGrounds(theme as never)[0]
  const f = parseColor(fill)
  if (!f) return String(preferred ?? "#111113")
  return readableInk(preferred, [f.a < 1 ? over(f, ground) : f])
}

/**
 * THE PAGE'S BUTTON ON A BOX THE BLOCK DRAWS ITSELF (round AR). The email
 * signup lays its form on a card tinted with the page's words at a few
 * percent, so the page's button sits on that, not on the page. `grounds` is
 * what the box shows (lib/onepage/contrast tintGrounds). The button keeps
 * the page's style, corners, border, shadow and hover; only its words move,
 * and only when they would not read on the button there.
 */
export function buttonThemeOn<T extends ButtonThemeLike>(theme: T, grounds: readonly Rgba[]): T {
  const on = buttonGrounds(theme as never, grounds)
  const min = wordsMin(theme)
  const words = readableInk(theme.button_text_color, on, min)
  const w = parseColor(words)
  if (w && worstContrast(w, on) >= min) return words === theme.button_text_color ? theme : { ...theme, button_text_color: words }
  /*
    No words read there: a Soft or Glass button over a tinted card on a
    mid-tone page (Sunset: neither white nor near black reaches 4.5:1 on it).
    As cardButtonTheme does for the tint laid twice, the button turns solid
    in its words' colour, with words that read on that; corners, border,
    shadow and hover stay the page's.
  */
  const ink = (theme.button_text_color as string) || "#111113"
  const fill = parseColor(ink)
  const ground = grounds[0] ?? pageGrounds(theme as never)[0]
  const solid = fill && fill.a < 1 ? toHex(over(fill, ground)) : ink
  return { ...theme, button_style: "filled", button_color: solid, button_border_color: solid, button_text_color: readableInk((theme as { background_color?: string }).background_color ?? "#111113", [parseColor(solid) ?? ground]) }
}

/**
 * The page's button on a card that is itself drawn as the page's button
 * (themeButtonStyle): an event's ticket button, a poll's options, the tip
 * amounts and Send, a discount code's Copy. cardButtonTheme with the card's
 * own surface, so every such block reads one rule.
 */
export function onCardButtonTheme(theme: ButtonThemeLike): ButtonThemeLike {
  const surface = buttonFill(theme) === "filled" ? (theme.button_color as string) : ((theme as { background_color?: string }).background_color ?? "#ffffff")
  const out = cardButtonTheme(theme, { surface, cardText: theme.button_text_color as string })
  /*
    Round AR: where a Soft or Glass button on the card cannot be read in any
    words (Classic 98: white words on a see-through grey over teal), it turns
    solid in the page's own button colour with words that read on it, as
    buttonThemeOn does for the signup. Its corners, border, shadow and hover stay.
  */
  const words = parseColor(out.button_text_color)
  if (!words || worstContrast(words, buttonGrounds(out as never, buttonGrounds(theme as never, buttonGrounds(theme as never)))) >= wordsMin(out)) return out
  const fill = parseColor(theme.button_color)
  const ground = buttonGrounds(theme as never)[0] ?? parseColor("#ffffff")!
  const solid = fill ? toHex(fill.a < 1 ? over(fill, ground) : fill) : "#111113"
  return { ...out, button_style: "filled", button_color: solid, button_border_color: solid, button_text_color: readableInk(theme.button_text_color, [parseColor(solid) ?? ground]) }
}
