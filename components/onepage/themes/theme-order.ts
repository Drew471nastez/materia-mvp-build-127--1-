/**
 * ===========================================================================
 *  THE ORDER THE PICKER SHOWS THE THEMES IN
 * ===========================================================================
 * The owner: "order the themes in the picker smarter, especially under All:
 * best and most used looking first, grouped sensibly, so it is easy to
 * choose". All listed every kind in the order the themes were made, so
 * Default sat next to Blocks' yellow and Renaissance would have landed after
 * Grunge Zine.
 *
 * Now All is five groups, each with the quiet, most chosen looks first:
 *   Clean            quiet pages that suit almost anyone: the light ones, then
 *                    Velvet and Basalt, the two dark ones (./dark-clean-themes)
 *   Dark             the same restraint, at night
 *   Colour           gradients and pages built on one strong colour
 *   Photo            a photograph behind the page
 *   Eras and styles  the themes with a material of their own (a skin) or a
 *                    period: Renaissance, Stoicism's stone, a newspaper, glass, chrome, pixels,
 *                    stickers, a zine
 * The kind pills (Light, Dark, Gradient, Image) keep their own filter, in
 * this same order. The nineteen painted wallpapers (./mood-themes) sit near
 * the top of the group each belongs to. Northpaper (round 65, ./northpaper-theme), a Notion
 * page, sits in Clean after Notebook. A theme added without a line here joins the end of All,
 * under the last group, until it is given a place.
 */

export const THEME_GROUPS = [
  { id: "clean", ids: ["default", "air", "gallery", "studio", "linen", "clay", "mono", "atrium", "graph", "paper", "swiss", "cream", "notebook", "northpaper", "velvet", "basalt"] },
  { id: "dark", ids: ["graphite", "night", "nova", "fjord", "backstage", "umber", "onair", "pop", "doric", "ember", "ledger", "olive", "astrid", "space", "blueprint"] },
  { id: "colour", ids: ["malachite", "petal", "sorbet", "dawn", "dusk", "pulse", "citrus", "swirl", "ripple", "solstice", "ribbon", "sunset", "peach", "sage", "lagoon", "ocean", "aurora", "cobalt", "halo", "dune", "terrazzo", "riso", "blocks", "neon", "acid"] },
  { id: "photo", ids: ["mesa", "cosmos", "shore", "nature", "atlas", "haze", "darkroom", "fusion"] },
  {
    id: "styled",
    ids: ["renaissance", "stoicism", "gazette", "aero", "aero2", "aqua", "aqua2", "vaporwave", "y2k", "y2k2", "messenger", "messenger2", "classic98", "arcade", "playful", "playful2", "xerox", "grunge2"],
  },
] as const

export type ThemeGroupId = (typeof THEME_GROUPS)[number]["id"]

const PLACE = new Map<string, { group: ThemeGroupId; at: number }>()
let n = 0
for (const g of THEME_GROUPS) for (const id of g.ids) PLACE.set(id, { group: g.id, at: n++ })

/** The group a theme is listed under in All: its own, or the last one for a theme not yet placed. */
export function themeGroupOf(id: string): ThemeGroupId {
  return PLACE.get(id)?.group ?? THEME_GROUPS[THEME_GROUPS.length - 1].id
}

/** The catalogue in the picker's order: every placed theme where it is placed, any other after them in the order given. */
export function orderThemes<T extends { id: string }>(all: readonly T[]): T[] {
  return all
    .map((t, i) => ({ t, at: PLACE.get(t.id)?.at ?? n + i }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.t)
}
