/**
 * The fonts a Storelib theme offers, on their own.
 *
 * The theme settings schema (theme-settings-schema.ts) uses these for its
 * Typography controls, and a published website reads them to know which
 * Google fonts it may ask for (font-link.ts). They live here so a website
 * does not download the whole settings schema, with every editor label,
 * just to read this list.
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
]
