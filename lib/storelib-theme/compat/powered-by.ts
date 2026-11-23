/**
 * ===========================================================================
 *  "POWERED BY STORELIB" AT THE FOOT OF A THEME WEBSITE
 * ===========================================================================
 * Every website drawn from a theme says, small, at the foot of its footer,
 * "Powered by Storelib", linked to storelib.com. It is Shopify's own
 * `powered_by_link`, which a theme's footer prints (the Materia base theme
 * by its copyright line, Dawn and most others the same way), so it sits in
 * the theme's own type and colours.
 *
 * THE CREATOR MAY HIDE IT ONLY ON A PLAN THAT PAYS FOR THAT. Theme settings ›
 * Store Information › "Show Powered by Storelib" (HIDE_SETTING, saved as
 * storelib_show_badge: false) asks for it to go; the server then takes it
 * away only when the owner's plan may remove branding (lib/sites/plan.ts
 * removeBranding, read by lib/website-builder/compat-site.ts from the
 * creator's subscription, as a OnePage's badge is). A free plan keeps it
 * whatever the setting says, and a theme whose code leaves the line out
 * (an edited footer, a theme that never printed powered_by_link) gets it
 * added at the end of the page (withPoweredBy). The builder's canvas, which
 * has no plan, draws what the setting says.
 */

import { STORELIB_S_PATH, STORELIB_S_TRANSFORM } from "@/components/storelib-mark"

export const POWERED_BY_URL = "https://storelib.com"
/** Theme settings: false asks for the line to be hidden (a paid plan's choice). */
export const HIDE_SETTING = "storelib_show_badge"
/** On the link, wherever it is drawn: how the server knows the page already says it. */
export const BADGE_MARK = "data-storelib-badge"

/*
  THE MARK BESIDE THE WORDS (round 21). Storelib's square with the S cut out
  of it, drawn in the footer's own text colour (currentColor), so it reads
  on a light footer and a dark one alike and fades with the words. Its size
  is the text's (1.2em), it sits on the words' middle, and it is not read
  out: the link already says Storelib. The S is the letter's own outline
  (components/storelib-mark.tsx), placed in the square as the logo places it.
*/
const MARK_MASK = "sl-pb-s"
/** The S's box in the 200 unit square: the solid mark's (components/brand/storelib-logo.tsx STORELIB_SOLID_S, the letter at 0.9). */
const S_BOX = { x: 48.97, y: 38.44, w: 102.06, h: 123.12 }
export const POWERED_BY_MARK = `<svg ${BADGE_MARK}-mark="" aria-hidden="true" focusable="false" viewBox="0 0 200 200" width="14" height="14" style="display:block;flex:none;width:1.2em;height:1.2em;overflow:visible"><mask id="${MARK_MASK}" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200"><rect width="200" height="200" fill="#fff"/><svg x="${S_BOX.x}" y="${S_BOX.y}" width="${S_BOX.w}" height="${S_BOX.h}" viewBox="54 43 94.5 114" overflow="visible"><path transform="${STORELIB_S_TRANSFORM}" d="${STORELIB_S_PATH}" fill="#000"/></svg></mask><rect width="200" height="200" rx="48" fill="currentColor" mask="url(#${MARK_MASK})"/></svg>`

/** The link itself, as `powered_by_link` prints it: the mark, then the words, on one line. */
export function poweredByLink(): string {
  return `<a href="${POWERED_BY_URL}" target="_blank" rel="noopener" ${BADGE_MARK}="" style="display:inline-flex;align-items:center;gap:.45em;white-space:nowrap;vertical-align:middle">${POWERED_BY_MARK}<span>Powered by Storelib</span></a>`
}

/** Whether the creator asked for the line to go (the setting off). */
export function hideAsked(settings: Record<string, unknown> | null | undefined): boolean {
  const v = settings?.[HIDE_SETTING]
  return v === false || v === "false"
}

/**
 * Whether a page of the website says it: always, unless the creator asked
 * for it to go AND their plan may remove branding. `removeBranding` null or
 * absent (no plan read: a fixture, a preview of the template) counts as not
 * paid for.
 */
export function poweredByShown(settings: Record<string, unknown> | null | undefined, removeBranding: boolean | null | undefined): boolean {
  return !(hideAsked(settings) && removeBranding === true)
}

/**
 * The page as sent: when the line must be there and the theme's own code did
 * not print it, it is added as the last line of the page's footer (in its
 * colours; a theme's script that folds away whatever follows the footer
 * leaves it alone there), else at the end of the body. Small and centred.
 */
export function withPoweredBy(html: string, shown: boolean): string {
  /* A fragment (a ?view= alternate template, a section drawn alone) has no body and gets no line: the page it lands in has one. */
  if (!shown || html.includes(BADGE_MARK) || !/<\/body>/i.test(html)) return html
  const line = `<p data-storelib-badge-line style="margin:0;padding:12px 16px;text-align:center;font-size:12px;line-height:1.5;opacity:.62">${poweredByLink().replace('style="', 'style="color:inherit;text-decoration:none;')}</p>`
  const lower = html.toLowerCase()
  const footer = lower.lastIndexOf("</footer>")
  const at = footer >= 0 ? footer : lower.lastIndexOf("</body>")
  return at < 0 ? html + line : html.slice(0, at) + line + html.slice(at)
}
