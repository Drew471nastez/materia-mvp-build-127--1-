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
  ledger: () => ttx("theme", "Ledger"),
  cobalt: () => ttx("theme", "Cobalt"),
  notebook: () => ttx("theme", "Notebook"),
  gazette: () => ttx("theme", "Gazette"),
  halo: () => ttx("theme", "Halo"),
  acid: () => ttx("theme", "Acid"),
  aero: () => ttx("theme", "Aero"),
  aqua: () => ttx("theme", "Aqua"),
  messenger: () => ttx("theme", "Messenger"),
  y2k: () => ttx("theme", "Y2K"),
  playful: () => ttx("theme", "Playful"),
  /* Round W10 (components/onepage/themes/r40-themes W10_THEMES). */
  aero2: () => ttx("theme", "Aero Aquarium"),
  aqua2: () => ttx("theme", "Aqua Graphite"),
  messenger2: () => ttx("theme", "Messenger Olive"),
  y2k2: () => ttx("theme", "Y2K Kawaii"),
  playful2: () => ttx("theme", "Playful Night"),
  grunge2: () => ttx("theme", "Grunge Zine"),
  classic98: () => ttx("theme", "Classic 98"),
  vaporwave: () => ttx("theme", "Vaporwave"),
  arcade: () => ttx("theme", "Arcade"),
  renaissance: () => ttx("theme", "Renaissance"),
  /* Round AT: Plaster is Stoicism now (a page saved on "plaster" is moved to it, lib/onepage/retired-themes), and Dune. */
  stoicism: () => ttx("theme", "Stoicism"),
  dune: () => ttx("theme", "Dune"),
  /* The painted wallpapers (components/onepage/themes/mood-themes). */
  malachite: () => ttx("theme", "Malachite"),
  linen: () => ttx("theme", "Linen"),
  nova: () => ttx("theme", "Nova"),
  mono: () => ttx("theme", "Mono"),
  pop: () => ttx("theme", "Pop"),
  petal: () => ttx("theme", "Petal"),
  sorbet: () => ttx("theme", "Sorbet"),
  backstage: () => ttx("theme", "Backstage"),
  graph: () => ttx("theme", "Graph"),
  swirl: () => ttx("theme", "Swirl"),
  atrium: () => ttx("theme", "Atrium"),
  fjord: () => ttx("theme", "Fjord"),
  clay: () => ttx("theme", "Clay"),
  citrus: () => ttx("theme", "Citrus"),
  dawn: () => ttx("theme", "Dawn"),
  pulse: () => ttx("theme", "Pulse"),
  umber: () => ttx("theme", "Umber"),
  dusk: () => ttx("theme", "Dusk"),
  onair: () => ttx("theme", "On Air"),
  /* Round 17: three patterns, a classical stone, a photocopy, three photographs. */
  ripple: () => ttx("theme", "Ripple"),
  solstice: () => ttx("theme", "Solstice"),
  ribbon: () => ttx("theme", "Ribbon"),
  doric: () => ttx("theme", "Doric"),
  xerox: () => ttx("theme", "Xerox"),
  mesa: () => ttx("theme", "Mesa"),
  cosmos: () => ttx("theme", "Cosmos"),
  shore: () => ttx("theme", "Shore"),
  /* The two dark Clean themes (components/onepage/themes/dark-clean-themes). */
  velvet: () => ttx("theme", "Velvet"),
  basalt: () => ttx("theme", "Basalt"),
}

/** A theme's name in the reader's language. */
export function themeLabel(template: { id: string; name: string }): string {
  const name = NAMES[template.id]
  return name ? name() : template.name
}
