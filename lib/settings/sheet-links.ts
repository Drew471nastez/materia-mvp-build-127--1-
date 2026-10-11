/**
 * ===========================================================================
 *  A LINK TO ANOTHER SECTION OF SETTINGS, FROM INSIDE SETTINGS
 * ===========================================================================
 * "Issues with double closing, reloads, duplicates." A link inside the sheet
 * to `/app/settings?tab=...` (Store details' "Locations", the address pill's
 * Domains) was followed as a navigation:
 *
 *   a plain <a>       a whole page load, the sheet rising again from nothing
 *   a Link or push    a second history entry for Settings, caught again by
 *                     app/app/@sheet/(.)settings, so Close (a Back) landed on
 *                     the first Settings entry and the sheet stayed: one
 *                     close needed two presses. Opened on its own (a reload),
 *                     the catch drew a second sheet over the first.
 *
 * So while Settings is up, such a press is not a navigation at all: the sheet
 * (components/app/settings-sheet.tsx) stops it and names the section, and the
 * form (components/app/settings-form-new.tsx) switches to it in place, the
 * way its own column does.
 *
 * Pure apart from the event name, so tests/settings20.test.ts drives it.
 */

export const SETTINGS_PATH = "/app/settings"
/** Fired on the window with `{ tab, section }`; the form listens. */
export const SETTINGS_TAB_EVENT = "storelib:settings-tab"

export type SettingsTabRequest = { tab: string | null; section: string | null }

function pathOf(p: string): string {
  return p.replace(/\/+$/, "") || "/"
}

/**
 * The section a press on `href` asks for, when it is a link from Settings to
 * Settings that the sheet keeps in place; null for any other link.
 */
export function inSheetSettingsLink(href: string, here: string): SettingsTabRequest | null {
  let to: URL
  let from: URL
  try {
    from = new URL(here)
    to = new URL(href, from)
  } catch {
    return null
  }
  if (to.origin !== from.origin) return null
  if (pathOf(from.pathname) !== SETTINGS_PATH || pathOf(to.pathname) !== SETTINGS_PATH) return null
  return { tab: to.searchParams.get("tab"), section: to.searchParams.get("section") }
}
