/**
 * ===========================================================================
 *  HOW THE NAME IS WRITTEN (round W10)
 * ===========================================================================
 * The owner: "for the heading, add more styles so it can be customised to
 * how I want my name to be written". The name could be any font, weight,
 * spacing and colour, but always flat ink. These are the treatments people
 * use for a name on a link-in-bio page: hollow outline, a retro offset
 * shadow, a gradient fill, a highlighter stroke, chrome, a neon glow, a
 * sticker cut-out, a hand-drawn swash under it, wide spaced capitals and a
 * pill label.
 *
 *   theme.name_style   one of NAME_STYLES' ids; missing (or anything else)
 *                      is the theme's own, which is what every page drew.
 *
 * Every colour comes from the theme (the title colour and the button
 * colour), checked so the name stays readable: an accent that would vanish
 * on the page, or melt into the name, is replaced by one that shows. It is
 * all inline style, so it is the same in the editor's preview and on the
 * live page, and a skin's own title treatment (app/onepage-skins.css: Aero's
 * halo, Y2K's chrome, Playful's marker, Grunge's photocopy) gives way to a
 * style the creator chose: the h1 gets `nameStyleReset`, which clears what
 * a skin draws on it, and the words inside it get the style.
 *
 * Pure: no DOM, no React types beyond the style object's shape.
 */

type Look = Record<string, unknown> | null | undefined
type Css = Record<string, string | number>

export const NAME_STYLE_IDS = ["outline", "retro", "gradient", "marker", "chrome", "neon", "sticker", "swash", "spaced", "label"] as const
export type NameStyle = (typeof NAME_STYLE_IDS)[number]

/** The picker's order. The names are translated where they are shown (components/onepage/tabs/design-tab). */
export const NAME_STYLES: readonly { id: NameStyle; name: string }[] = [
  { id: "outline", name: "Outline" },
  { id: "retro", name: "Retro shadow" },
  { id: "gradient", name: "Gradient" },
  { id: "marker", name: "Highlighter" },
  { id: "chrome", name: "Chrome" },
  { id: "neon", name: "Neon" },
  { id: "sticker", name: "Sticker" },
  { id: "swash", name: "Swash" },
  { id: "spaced", name: "Spaced caps" },
  { id: "label", name: "Label" },
]

/** The style a theme names, or null for the theme's own. */
export function nameStyleOf(theme: Look): NameStyle | null {
  const v = theme?.name_style
  return typeof v === "string" && (NAME_STYLE_IDS as readonly string[]).includes(v) ? (v as NameStyle) : null
}

/* ── colour ─────────────────────────────────────────────────────────────── */

const hex6 = (v: unknown): string | null => {
  if (typeof v !== "string") return null
  const t = v.trim().replace(/^#/, "").toLowerCase()
  if (/^[0-9a-f]{3}$/.test(t)) return `#${t.split("").map((c) => c + c).join("")}`
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(t)) return `#${t.slice(0, 6)}`
  return null
}
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
export function luminanceOf(h: string): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = rgb(h)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
export function contrastOf(a: string, b: string): number {
  const [x, y] = [luminanceOf(a), luminanceOf(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
/** `a` moved toward `b` by t (0 to 1). */
export function mixHex(a: string, b: string, t: number): string {
  const [p, q] = [rgb(a), rgb(b)]
  return `#${p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, "0")).join("")}`
}

/**
 * The colours a style works with. `ink` is the name's own colour (the title
 * colour, or the text colour). The page itself is read as the opposite of
 * the ink (a theme already writes its name to be read on its wallpaper): a
 * light name is on a dark page. `accent` is the button colour, moved toward
 * the ink until it reads on that page (3:1, the large text minimum).
 */
/** How colourful a colour is, 0 (grey) to 1 (pure hue). */
export function saturationOf(h: string): number {
  const [r, g, b] = rgb(h)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

export function nameColours(theme: Look): { ink: string; page: string; dark: boolean; accent: string; accentDistinct: boolean } {
  const ink = hex6(theme?.title_color) ?? hex6(theme?.text_color) ?? "#111111"
  const dark = luminanceOf(ink) > 0.4
  const page = dark ? "#000000" : "#ffffff"
  let accent = hex6(theme?.button_color) ?? ink
  for (let t = 0.2; contrastOf(accent, page) < 3 && t <= 1; t += 0.2) accent = mixHex(hex6(theme?.button_color) ?? ink, ink, t)
  if (contrastOf(accent, page) < 3) accent = ink
  /* An accent only counts when it is a colour of its own: not the ink again, and not a grey (a grey gradient or highlighter reads as dirt). */
  return { ink, page, dark, accent, accentDistinct: contrastOf(accent, ink) >= 1.35 && saturationOf(accent) >= 0.25 }
}

const svgUrl = (body: string, viewBox: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${viewBox}' preserveAspectRatio='none'>${body}</svg>`)}")`

/**
 * What the h1 carries when a style is chosen: everything a skin's stylesheet
 * draws on the title, cleared, so only the chosen style shows. On the Hero
 * (words over a photo) a soft drop shadow keeps it readable, as a filter so
 * it works with a clipped (gradient, chrome) fill as well.
 */
export function nameStyleReset(hero: boolean): Css {
  return {
    background: "none",
    WebkitMaskImage: "none",
    maskImage: "none",
    filter: hero ? "drop-shadow(0 2px 6px rgba(0,0,0,0.4))" : "none",
    transform: "none",
    rotate: "none",
    textShadow: "none",
    WebkitTextFillColor: "currentcolor",
    paddingInline: 0,
  }
}

/** The words' own style for a chosen style: on a span inside the h1, so the verified badge beside it is left alone. */
export function nameStyleCss(style: NameStyle, theme: Look): Css {
  const { ink, dark, accent, accentDistinct } = nameColours(theme)
  const clip = (image: string): Css => ({
    backgroundImage: image,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: ink,
    /* Room for the fill under descenders and beside italics, which a clipped background would cut. */
    paddingBlock: "0.06em",
    paddingInline: "0.04em",
  })
  switch (style) {
    case "outline":
      return { color: "transparent", WebkitTextFillColor: "transparent", WebkitTextStroke: `max(1.25px, 0.035em) ${ink}`, paintOrder: "stroke fill" }
    case "retro": {
      const shade = accentDistinct ? accent : dark ? "#e0569b" : "#f2a33a"
      return { color: ink, textShadow: `0.055em 0.055em 0 ${shade}` }
    }
    case "gradient": {
      const [a, b] = accentDistinct ? [ink, accent] : dark ? ["#c4b5fd", "#f9a8d4"] : ["#6d28d9", "#db2777"]
      return clip(`linear-gradient(100deg, ${a} 0%, ${b} 100%)`)
    }
    case "marker": {
      /* A band behind the lower half of the letters: the accent when it is not the ink itself, else butter yellow (light) or violet (dark). */
      const band = accentDistinct ? `${accent}${dark ? "8c" : "59"}` : dark ? "#7c3aed8c" : "#ffd84db3"
      return {
        color: ink,
        backgroundImage: `linear-gradient(transparent 55%, ${band} 55%, ${band} 92%, transparent 92%)`,
        WebkitBoxDecorationBreak: "clone",
        boxDecorationBreak: "clone",
        paddingInline: "0.14em",
      }
    }
    case "chrome":
      return dark
        ? clip("linear-gradient(180deg, #ffffff 0%, #eef1f7 38%, #9aa3b8 50%, #c8cfdd 58%, #ffffff 100%)")
        : clip("linear-gradient(180deg, #5d6675 0%, #1c2029 46%, #7d8798 52%, #2a2f39 76%, #4a5260 100%)")
    case "neon": {
      const glow = accentDistinct ? accent : dark ? "#a5f3fc" : "#7c3aed"
      return { color: ink, textShadow: `0 0 0.06em ${glow}, 0 0 0.3em ${glow}, 0 0 0.7em ${glow}99` }
    }
    case "sticker": {
      /* The cut-out: a ring of the opposite of the ink round every letter, and a soft shadow under it. */
      const ring = dark ? "#111111" : "#ffffff"
      const edge = dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.18)"
      const around = (d: string, colour: string) => [[d, "0"], [`-${d}`, "0"], ["0", d], ["0", `-${d}`], [d, d], [`-${d}`, d], [d, `-${d}`], [`-${d}`, `-${d}`]].map(([x, y]) => `${x} ${y} 0 ${colour}`)
      /* The cut-out's paper, then a hairline round the paper so it shows on a page of its own colour, then its shadow. */
      return { color: ink, textShadow: [...around("0.055em", ring), ...around("0.075em", edge), "0.07em 0.1em 0.05em rgba(0,0,0,0.25)"].join(", ") }
    }
    case "swash": {
      const line = accentDistinct ? accent : ink
      return {
        color: ink,
        backgroundImage: svgUrl(`<path d='M3 13 C 45 3, 120 2, 197 8' fill='none' stroke='${line}' stroke-width='3.2' stroke-linecap='round'/><path d='M30 17 C 80 11, 140 10, 170 13' fill='none' stroke='${line}' stroke-width='2' stroke-linecap='round' opacity='.7'/>`, "0 0 200 20"),
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center bottom",
        backgroundSize: "100% 0.32em",
        paddingBottom: "0.3em",
      }
    }
    case "spaced":
      /* The trailing space after the last letter is taken back, so the line stays centred. */
      return { color: ink, textTransform: "uppercase", letterSpacing: "0.2em", marginRight: "-0.2em", fontSize: "0.8em", fontWeight: 600 }
    case "label": {
      const fill = accentDistinct ? accent : dark ? "#ffffff" : "#111111"
      const word = contrastOf(fill, "#ffffff") >= contrastOf(fill, "#111111") ? "#ffffff" : "#111111"
      return { color: word, WebkitTextFillColor: word, background: fill, borderRadius: "999px", padding: "0.12em 0.6em 0.16em", fontSize: "0.84em", lineHeight: 1.25, display: "inline-block" }
    }
  }
}
