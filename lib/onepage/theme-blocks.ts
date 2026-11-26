/**
 * A THEME THAT COMES WITH ITS OWN BLOCKS (round 65, Northpaper).
 *
 * Most themes are a look. Northpaper is also a page: a Notion template
 * seller's socials, templates, free template signup, links and questions
 * (components/onepage/themes/northpaper-theme). Plain functions, no React,
 * so the Design tab, the onboarding and the tests read the same answers.
 *
 * When a theme with blocks is picked:
 *   - a page that holds nothing of the creator's own yet (only what every
 *     new page starts with: the header, the socials, "My Link" rows that
 *     still point nowhere, a line, the untouched newsletter) is given the
 *     theme's blocks in place of those starters, in the same step as the
 *     look, so one undo takes both back;
 *   - a page with anything of the creator's own keeps every block, and the
 *     Design tab offers to add the theme's blocks under them.
 */
import type { OnePageBlock } from "./types"

type Data = Record<string, unknown>

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/** Is this one of the blocks a new page starts with, untouched? */
export function isStarterBlock(block: OnePageBlock): boolean {
  const d = (block.data ?? {}) as Data
  switch (block.type) {
    case "header":
    case "social_row":
    case "divider":
      return true
    case "link_button": {
      const url = text(d.url)
      return text(d.label) === "My Link" && (url === "" || url === "https://" || url === "http://") && !d.thumbnail_url && !d.action
    }
    case "email_capture":
      return text(d.headline) === "Join my newsletter" && !d.enable_digital_product && !d.digital_product_id && !d.lead_magnet_id
    default:
      return false
  }
}

/** Does the page hold nothing of the creator's own yet? */
export function onlyStarterBlocks(blocks: readonly OnePageBlock[] | null | undefined): boolean {
  return (blocks ?? []).every(isStarterBlock)
}

/** The page's blocks with the theme's in place of everything but the header. */
export function replaceWithThemeBlocks(blocks: readonly OnePageBlock[] | null | undefined, themeBlocks: readonly OnePageBlock[]): OnePageBlock[] {
  const header = (blocks ?? []).find((b) => b.type === "header")
  return renumber([...(header ? [header] : []), ...themeBlocks])
}

/** The page's blocks with the theme's added under them; a second socials row is left out. */
export function appendThemeBlocks(blocks: readonly OnePageBlock[] | null | undefined, themeBlocks: readonly OnePageBlock[]): OnePageBlock[] {
  const have = blocks ?? []
  const hasSocials = have.some((b) => b.type === "social_row")
  return renumber([...have, ...themeBlocks.filter((b) => !(hasSocials && b.type === "social_row"))])
}

/**
 * Are the theme's blocks on the page already? Each kind of the theme's
 * blocks (other than the header and the socials) has one on the page.
 */
export function hasThemeBlocks(blocks: readonly OnePageBlock[] | null | undefined, themeBlocks: readonly OnePageBlock[]): boolean {
  const kinds = new Set((blocks ?? []).map((b) => b.type))
  return themeBlocks.filter((b) => b.type !== "social_row" && b.type !== "header").every((b) => kinds.has(b.type))
}

/**
 * The blocks the page should have after picking a theme with `themeBlocks`,
 * or null to leave them as they are. `replace` is the onboarding's: the
 * page is being set up from scratch there.
 */
export function blocksAfterPick(blocks: readonly OnePageBlock[] | null | undefined, themeBlocks: readonly OnePageBlock[] | null, replace = false): OnePageBlock[] | null {
  if (!themeBlocks || themeBlocks.length === 0) return null
  if (replace || onlyStarterBlocks(blocks)) return replaceWithThemeBlocks(blocks, themeBlocks)
  return null
}

function renumber(blocks: OnePageBlock[]): OnePageBlock[] {
  return blocks.map((b, i) => (b.sort_order === i ? b : { ...b, sort_order: i }))
}
