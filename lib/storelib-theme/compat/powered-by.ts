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

export const POWERED_BY_URL = "https://storelib.com"
/** Theme settings: false asks for the line to be hidden (a paid plan's choice). */
export const HIDE_SETTING = "storelib_show_badge"
/** On the link, wherever it is drawn: how the server knows the page already says it. */
export const BADGE_MARK = "data-storelib-badge"

/** The link itself, as `powered_by_link` prints it. */
export function poweredByLink(): string {
  return `<a href="${POWERED_BY_URL}" target="_blank" rel="noopener" ${BADGE_MARK}="">Powered by Storelib</a>`
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
  if (!shown || html.includes(BADGE_MARK)) return html
  const line = `<p data-storelib-badge-line style="margin:0;padding:12px 16px;text-align:center;font-size:12px;line-height:1.5;opacity:.62">${poweredByLink().replace("<a ", '<a style="color:inherit;text-decoration:none" ')}</p>`
  const lower = html.toLowerCase()
  const footer = lower.lastIndexOf("</footer>")
  const at = footer >= 0 ? footer : lower.lastIndexOf("</body>")
  return at < 0 ? html + line : html.slice(0, at) + line + html.slice(at)
}
