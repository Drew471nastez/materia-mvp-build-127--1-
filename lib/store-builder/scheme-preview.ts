/**
 * ===========================================================================
 *  A COLOUR SCHEME, SHOWN BEFORE IT IS SAVED
 * ===========================================================================
 * Picking a scheme in Edit profile used to change nothing until Save, and
 * then the sheet closed and the page reloaded: a creator chose between eight
 * palettes by reading their names. Now the page behind the sheet takes the
 * scheme the moment it is pressed, and Save keeps it or Cancel puts the saved
 * one back. Nothing is written until Save; the page is only DRAWN differently.
 *
 * HOW THE PAGE IS REDRAWN. A scheme is resolved on the server, into the
 * colours of every card, bar and section, so the only honest way to show one
 * is to render the page with it. The page reads `?scheme=` and uses it in
 * place of the saved one, for the page's OWNER and nobody else: a visitor
 * with the parameter in their address gets the saved page, so there is
 * nothing here anybody can use to show a creator's page in colours they did
 * not choose. The editor swaps the parameter with a client navigation, which
 * keeps the open sheet and everything typed into it (the router keys a page's
 * state without its search parameters).
 *
 * AND WHAT HAPPENS BEFORE THE SERVER ANSWERS. The page's own surface, its
 * type and the design tokens every themed control reads are computed here for
 * each scheme on offer, from the same inputs the page used, and handed to the
 * editor. Pressing a scheme paints those onto the page's root at once, so the
 * page, its text and everything drawn from the tokens change on the press;
 * the cards and bars follow when the render lands. Both go through one
 * colour transition (`cp-scheme-shift` in globals.css), so it reads as one
 * change rather than two.
 */
import { themePresets } from "./defaults"
import { resolveStorefrontChrome, type StoredChrome, type StorefrontChrome } from "./storefront-chrome"
import type { ThemePreset } from "./types"

/**
 * What the picker offers, in the order it offers them. Here rather than in
 * the picker because the server needs it too (to prepare each one's paint),
 * and a server component cannot read a constant out of a client module.
 */
export const OFFERED_SCHEMES: ThemePreset[] = ["default", "blacks", "cream", "sage", "harbor", "clay", "pink", "astrid"]

/** The search parameter the editor sets. */
export const SCHEME_PREVIEW_PARAM = "scheme"

/** What the page's root element is painted with: exactly its `style`. */
export interface RootPaint {
  background: string
  color: string
  tokens: Record<string, string>
}

export function rootPaint(chrome: StorefrontChrome): RootPaint {
  return { background: chrome.pageBackground, color: chrome.text, tokens: chrome.tokens }
}

/** Each offered scheme's root paint, from what this creator has stored. */
export function schemeRootPaints(stored: StoredChrome): Record<string, RootPaint> {
  const out: Record<string, RootPaint> = {}
  for (const key of OFFERED_SCHEMES) out[key] = rootPaint(resolveStorefrontChrome(key, stored))
  return out
}

/**
 * The scheme to draw in place of the saved one, or undefined. Only for the
 * owner, and only a scheme that exists: anything else is the saved page.
 */
export function previewSchemeFrom(param: unknown, viewerIsOwner: boolean): ThemePreset | undefined {
  if (!viewerIsOwner || typeof param !== "string") return undefined
  return param in themePresets ? (param as ThemePreset) : undefined
}
