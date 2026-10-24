/**
 * ===========================================================================
 *  A LINK TYPED IN A MENU REDRAWS THE SECTIONS THAT SHOW A MENU, NO OTHERS
 * ===========================================================================
 * The owner: "the website builder editor lags, especially when I'm creating
 * navigation or adding links in the sidebar". The menus are theme settings
 * (`settings.menus`), so each key typed in a link's name was a new theme
 * object and new storefront data for the canvas, and every section on the
 * page was drawn again from its template for it: on a 120 section page,
 * 120 sections per key (scripts/check-wb-perf-r12.mjs, "add menu link").
 *
 * A section only ever sees a menu through a `link_list` setting (its own or
 * one of its blocks', lib/storelib-theme/resolve.ts menuFor) or by being the
 * header or the footer, whose built-in renderers read the menus directly.
 * Those are the sections given the new theme; every other one keeps the
 * theme it had, which differs from the new one in the menus alone.
 */
import type { SectionInstance } from "./types"
import { blockSource, sectionSource } from "./storelib-runtime"

/** Every key but `menus` the same value: a theme that changed in its menus only. */
export function sameExceptMenus(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a === b) return true
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) {
    if (k === "menus") continue
    if (!(k in b) || a[k] !== b[k]) return false
  }
  return true
}

/** Whether a template's source names a menu setting, read once per distinct source. */
const readsBySource = new Map<string, boolean>()
function sourceReadsMenus(source: string | null): boolean {
  if (source === null) return false
  const hit = readsBySource.get(source)
  if (hit !== undefined) return hit
  const yes = /link_list|linklists|menus/.test(source)
  if (readsBySource.size > 400) readsBySource.clear()
  readsBySource.set(source, yes)
  return yes
}

/** The built-in sections that draw a menu themselves (HeaderSection, FooterSection and their chrome hooks). */
const CHROME = /header|footer|nav|menu/i

function blocksReadMenus(blocks: unknown, sources: Record<string, string> | undefined, handles: Set<string>): boolean {
  if (!Array.isArray(blocks)) return false
  for (const b of blocks as { type?: unknown; settings?: Record<string, unknown>; blocks?: unknown }[]) {
    if (!b || typeof b !== "object") continue
    if (typeof b.type === "string" && sourceReadsMenus(blockSource(b.type, sources))) return true
    if (namesAMenu(b.settings, handles)) return true
    if (blocksReadMenus(b.blocks, sources, handles)) return true
  }
  return false
}

function namesAMenu(settings: Record<string, unknown> | undefined, handles: Set<string>): boolean {
  if (!settings) return false
  for (const v of Object.values(settings)) if (typeof v === "string" && handles.has(v)) return true
  return false
}

/**
 * The ids of the sections that may draw a menu: the header and the footer,
 * a section whose template (or one of its blocks' templates) has a menu
 * setting, and any section with a setting naming one of the menus. Wrong
 * only on the safe side: a section counted here that shows no menu is
 * drawn again for nothing, as every section was before.
 */
export function menuReaders(sections: readonly SectionInstance[], sources: Record<string, string> | undefined, menus: unknown): Set<string> {
  const handles = new Set<string>(["main-menu", "footer"])
  if (menus && typeof menus === "object") for (const h of Object.keys(menus as object)) handles.add(h)
  const out = new Set<string>()
  for (const s of sections) {
    if (CHROME.test(s.type) || sourceReadsMenus(sectionSource(s.type, sources)) || namesAMenu(s.settings as Record<string, unknown> | undefined, handles) || blocksReadMenus(s.blocks, sources, handles)) out.add(s.id)
  }
  return out
}
