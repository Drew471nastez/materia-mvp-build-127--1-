/**
 * THE THEMES' NAMES, AS EACH LANGUAGE READS THEM (round AP).
 *
 * The picker showed every theme's English name in every language. Each name
 * is a sentence of its own here, so the catalog (lib/i18n/catalog) carries
 * it; a name that is a proper name (Riso, Astrid, Terrazzo) is the same
 * word everywhere. A theme added without a line here shows its own name.
 */
import { ttx } from "@/lib/i18n/text"

const NAMES: Record<string, () => string> = {
  default: () => ttx("theme", "Default"),
  air: () => ttx("theme", "Air"),
  studio: () => ttx("theme", "Studio"),
  paper: () => ttx("theme", "Paper"),
  cream: () => ttx("theme", "Cream"),
  riso: () => ttx("theme", "Riso"),
  blocks: () => ttx("theme", "Blocks"),
  editorial: () => ttx("theme", "Editorial"),
  terrazzo: () => ttx("theme", "Terrazzo"),
  sunset: () => ttx("theme", "Sunset"),
  peach: () => ttx("theme", "Peach"),
  sage: () => ttx("theme", "Sage"),
  ocean: () => ttx("theme", "Ocean"),
  aurora: () => ttx("theme", "Aurora"),
  olive: () => ttx("theme", "Olive"),
  astrid: () => ttx("theme", "Astrid"),
  night: () => ttx("theme", "Night"),
  graphite: () => ttx("theme", "Graphite"),
  midnight: () => ttx("theme", "Midnight"),
  space: () => ttx("theme", "Space"),
  neon: () => ttx("theme", "Neon"),
  blueprint: () => ttx("theme", "Blueprint"),
  nature: () => ttx("theme", "Nature"),
  fusion: () => ttx("theme", "Fusion"),
  darkroom: () => ttx("theme", "Darkroom"),
  haze: () => ttx("theme", "Haze"),
  gallery: () => ttx("theme", "Gallery"),
  swiss: () => ttx("theme", "Swiss"),
  ember: () => ttx("theme", "Ember"),
  lagoon: () => ttx("theme", "Lagoon"),
  atlas: () => ttx("theme", "Atlas"),
  folio: () => ttx("theme", "Folio"),
  ledger: () => ttx("theme", "Ledger"),
  cobalt: () => ttx("theme", "Cobalt"),
  notebook: () => ttx("theme", "Notebook"),
  gazette: () => ttx("theme", "Gazette"),
  halo: () => ttx("theme", "Halo"),
  acid: () => ttx("theme", "Acid"),
}

/** A theme's name in the reader's language. */
export function themeLabel(template: { id: string; name: string }): string {
  const name = NAMES[template.id]
  return name ? name() : template.name
}
