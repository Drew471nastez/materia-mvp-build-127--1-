/**
 * ===========================================================================
 *  ADD BLOCK'S COLOURS: ONE SOFT TINT PER KIND OF BLOCK
 * ===========================================================================
 * Round 40, the owner: "Add block pills (Essentials, Sell, Recently used,
 * Media, Grow): add some colour and personality; the icons are plain
 * grey/black." Every row's icon sat on the same grey tile in near black, so
 * a list of fifty read as one grey column.
 *
 * Now each category has one tint, used three ways, the same everywhere:
 *
 *   the chip     a small dot of the tint's ink before its name
 *   the heading  the tint's ink, in the same small capitals as before
 *   the tile     the tint's wash behind the icon, the icon in its ink
 *
 * The washes are light (each under 8% of its ink over white) and the inks
 * are dark enough to read as text on them, so a row still reads as a name
 * and a line first. Essentials takes the violet /app already uses
 * (#8b5cf6), the rest are its neighbours at the same lightness. Brand
 * marks (Links, most Integrations) keep their own colours on white: a
 * second colour behind Instagram's would be noise.
 */

export type TintId = "essentials" | "sell" | "media" | "grow" | "integrations" | "links" | "recent"

export type Tint = {
  /** Behind the icon. */
  wash: string
  /** The icon, the heading, the chip's dot. */
  ink: string
  /** The tile's hairline. */
  edge: string
}

export const BLOCK_TINTS: Record<TintId, Tint> = {
  essentials: { wash: "#f3effe", ink: "#6d45d9", edge: "rgba(109,69,217,0.12)" },
  sell: { wash: "#e8f6ee", ink: "#16794a", edge: "rgba(22,121,74,0.12)" },
  media: { wash: "#fdedf1", ink: "#c03562", edge: "rgba(192,53,98,0.12)" },
  grow: { wash: "#fff3e0", ink: "#9e4f06", edge: "rgba(158,79,6,0.14)" },
  integrations: { wash: "#e9f2fd", ink: "#2463b0", edge: "rgba(36,99,176,0.12)" },
  links: { wash: "#f2f2f4", ink: "#1a1a2e", edge: "rgba(17,17,19,0.06)" },
  recent: { wash: "#f2f2f4", ink: "#4b5563", edge: "rgba(17,17,19,0.06)" },
}

export function tintOf(id: string | null | undefined): Tint {
  return BLOCK_TINTS[(id ?? "") as TintId] ?? BLOCK_TINTS.links
}

/** The tile's own style for a tint: a wash, a hairline in the ink, the icon in the ink. */
export function tintTileStyle(id: string | null | undefined): { backgroundColor: string; color: string; boxShadow: string } {
  const t = tintOf(id)
  return { backgroundColor: t.wash, color: t.ink, boxShadow: `inset 0 0 0 1px ${t.edge}` }
}
