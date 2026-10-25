/**
 * The fonts a Storelib theme offers, on their own.
 *
 * The theme settings schema (theme-settings-schema.ts) uses these for its
 * Typography controls, and a published website reads them to know which
 * Google fonts it may ask for (font-link.ts). They live here so a website
 * does not download the whole settings schema, with every editor label,
 * just to read this list.
 *
 * ROUND 13: ten more, each one a kind the lists had none of (the owner:
 * "more creative, more clean, more different"): a soft serif (Fraunces),
 * an editorial serif with true italics (Newsreader), a fashion serif of
 * thick and thin strokes (Bodoni Moda), a characterful grotesk (Bricolage
 * Grotesque), a crisp neo-grotesk (Geist), an open modern sans (Manrope),
 * a friendly geometric (Figtree), a rounded face (Fredoka), a monospace
 * (Geist Mono) and a tall condensed display (Big Shoulders). All from
 * Google Fonts under the SIL Open Font License, each with every weight
 * from 400 to 700 that font-link.ts asks for, and Latin Extended for the
 * dashboard's languages (Polish, Romanian, Portuguese...). In all three
 * lists, so a heading, the body or the accent can take any of them.
 */
import type { SelectOption } from "./types"

export const HEADING_FONT_OPTIONS: SelectOption[] = [
  { label: "Inter", value: "Inter" },
  { label: "Plus Jakarta Sans", value: "Plus Jakarta Sans" },
  { label: "Space Grotesk", value: "Space Grotesk" },
  { label: "DM Sans", value: "DM Sans" },
  { label: "Poppins", value: "Poppins" },
  { label: "Montserrat", value: "Montserrat" },
  { label: "Raleway", value: "Raleway" },
  { label: "Oswald", value: "Oswald" },
  { label: "Bebas Neue", value: "Bebas Neue" },
  { label: "Playfair Display", value: "Playfair Display" },
  { label: "Cormorant Garamond", value: "Cormorant Garamond" },
  { label: "Lora", value: "Lora" },
  { label: "Merriweather", value: "Merriweather" },
  { label: "Libre Baskerville", value: "Libre Baskerville" },
  { label: "EB Garamond", value: "EB Garamond" },
  { label: "Fraunces", value: "Fraunces" },
  { label: "Newsreader", value: "Newsreader" },
  { label: "Bodoni Moda", value: "Bodoni Moda" },
  { label: "Bricolage Grotesque", value: "Bricolage Grotesque" },
  { label: "Geist", value: "Geist" },
  { label: "Manrope", value: "Manrope" },
  { label: "Figtree", value: "Figtree" },
  { label: "Fredoka", value: "Fredoka" },
  { label: "Geist Mono", value: "Geist Mono" },
  { label: "Big Shoulders", value: "Big Shoulders" },
]

export const BODY_FONT_OPTIONS: SelectOption[] = [
  { label: "Inter", value: "Inter" },
  { label: "DM Sans", value: "DM Sans" },
  { label: "Plus Jakarta Sans", value: "Plus Jakarta Sans" },
  { label: "Space Grotesk", value: "Space Grotesk" },
  { label: "Poppins", value: "Poppins" },
  { label: "Nunito", value: "Nunito" },
  { label: "Source Sans 3", value: "Source Sans 3" },
  { label: "Lato", value: "Lato" },
  { label: "Open Sans", value: "Open Sans" },
  { label: "Fraunces", value: "Fraunces" },
  { label: "Newsreader", value: "Newsreader" },
  { label: "Bodoni Moda", value: "Bodoni Moda" },
  { label: "Bricolage Grotesque", value: "Bricolage Grotesque" },
  { label: "Geist", value: "Geist" },
  { label: "Manrope", value: "Manrope" },
  { label: "Figtree", value: "Figtree" },
  { label: "Fredoka", value: "Fredoka" },
  { label: "Geist Mono", value: "Geist Mono" },
  { label: "Big Shoulders", value: "Big Shoulders" },
]

export const ACCENT_FONT_OPTIONS: SelectOption[] = [
  { label: "Same as heading font", value: "" },
  { label: "Inter", value: "Inter" },
  { label: "DM Sans", value: "DM Sans" },
  { label: "Plus Jakarta Sans", value: "Plus Jakarta Sans" },
  { label: "Space Grotesk", value: "Space Grotesk" },
  { label: "Poppins", value: "Poppins" },
  { label: "Nunito", value: "Nunito" },
  { label: "Source Sans 3", value: "Source Sans 3" },
  { label: "Lato", value: "Lato" },
  { label: "Open Sans", value: "Open Sans" },
  { label: "Fraunces", value: "Fraunces" },
  { label: "Newsreader", value: "Newsreader" },
  { label: "Bodoni Moda", value: "Bodoni Moda" },
  { label: "Bricolage Grotesque", value: "Bricolage Grotesque" },
  { label: "Geist", value: "Geist" },
  { label: "Manrope", value: "Manrope" },
  { label: "Figtree", value: "Figtree" },
  { label: "Fredoka", value: "Fredoka" },
  { label: "Geist Mono", value: "Geist Mono" },
  { label: "Big Shoulders", value: "Big Shoulders" },
]
