/**
 * ===========================================================================
 *  TWO ANSWERS THE WHOLE ONEPAGE READS, WORKED OUT IN ONE PLACE
 * ===========================================================================
 * components/onepage/public-onepage.tsx draws the live page and, framed, the
 * editor's preview. Two things it decides in more than one spot are decided
 * here instead, so the spots cannot drift apart.
 *
 * THE HERO IS DRAWN ONLY WITH A PICTURE. The hero header is a full width
 * photo, and without a photo or a video the header block falls back to the
 * classic round avatar. The page's top padding and the social row under the
 * header each read the theme's `header_layout` on their own, so with no
 * photo they still laid the page out for a hero that was not there: no top
 * padding on a phone, and the round avatar pressed up under the Share and
 * Subscribe buttons. `heroHeaderShown` is the one answer all three read.
 *
 * THE CANVAS IS THE PAGE'S OWN COLOUR. The page paints its background on
 * its own box. Anything outside that box is the document's canvas, which is
 * the body's white: the band the body adds under the page for the home
 * indicator (padding-bottom: env(safe-area-inset-bottom)), and whatever an
 * iPhone shows when the page is pulled past its end, which WKWebView does
 * even with overscroll-behavior set. On a dark page both read as a white
 * strip under the footer, in the editor's preview and on the live page.
 * `pageCanvasColour` is the colour the page's own box ends on, and the page
 * paints the canvas with it.
 */

type ThemeLike = {
  header_layout?: string | null
  background_type?: string | null
  background_color?: string | null
  background_gradient?: string | null
} | null | undefined

type ProfileLike = { avatar_url?: string | null; avatar_video_url?: string | null } | null | undefined

/** Whether the header block draws the full width hero: the theme asks for it and there is a picture to draw. */
export function heroHeaderShown(theme: ThemeLike, profile: ProfileLike): boolean {
  return (theme?.header_layout || "classic") === "hero" && Boolean(profile?.avatar_url || profile?.avatar_video_url)
}

const COLOUR = /#[a-fA-F0-9]{6}\b|#[a-fA-F0-9]{3}\b|rgba?\([^)]+\)/g

/**
 * The colour the page's background ends on: the last stop of a gradient,
 * else the solid colour, which is also what an image or video wallpaper
 * shows before it loads. Black when the theme names none, as the page does.
 */
export function pageCanvasColour(theme: ThemeLike): string {
  if (theme?.background_type === "gradient" && theme.background_gradient) {
    const stops = theme.background_gradient.match(COLOUR)
    if (stops && stops.length > 0) return stops[stops.length - 1]
  }
  return theme?.background_color || "#000000"
}

/** Only a colour goes into the stylesheet: anything else is not a colour this can vouch for. */
export function safeCssColour(value: string): string {
  return /^(#[a-fA-F0-9]{3,8}|rgba?\([\d\s.,%]+\)|[a-zA-Z]+)$/.test(value.trim()) ? value.trim() : "#000000"
}

/**
 * The rule that paints the document's canvas in the page's colour. Written
 * for <html> with and without the `capacitor` class, which globals.css
 * paints black outside any layer, and for <body>, whose white comes from a
 * layered utility: an unlayered rule later in the document wins both.
 */
export function canvasRule(theme: ThemeLike): string {
  const colour = safeCssColour(pageCanvasColour(theme))
  return `html,html.capacitor,body{background-color:${colour}}`
}
