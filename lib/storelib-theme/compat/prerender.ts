/**
 * ===========================================================================
 *  ON A DESKTOP, THE NEXT PAGE OF AN IMPORTED THEME IS ALREADY DRAWN
 * ===========================================================================
 * Every live page fetches the page behind a link the visitor rests on
 * (lib/website-builder/prefetch-rules.ts, prefetch only). A prefetched
 * imported theme's page still has its whole start up to run when it is
 * opened: measured, three to seven seconds of the theme's own scripts on a
 * phone before it settles. On a desktop, a page that runs no script from
 * anyone but the site and Storelib is prerendered instead: drawn, its scripts
 * run, in a hidden tab, while the pointer rests on its link, so the click
 * shows a finished page. Chrome and Edge; elsewhere nothing changes.
 *
 * WHEN, and why:
 *   - a desktop pointer (hover and a fine pointer): a phone has no resting
 *     pointer to go on and less to spare; it keeps prefetch
 *   - not with Data Saver on or on a 2G connection
 *   - only a page whose own markup runs no third party script
 *     (./script-order.ts runsThirdPartyScripts): no analytics, pixel, chat
 *     or reviews widget ever runs for a page nobody opened. Storelib's own
 *     page view waits until the page is shown (./track-script.ts), and so do
 *     its speed measurements (lib/perf/site-vitals-inline.ts)
 *   - the same links as the prefetch: never the cart, checkout, account or
 *     the API, a link marked nofollow, one opening a new tab, or one with
 *     `data-no-prefetch`
 *   - "moderate": the pointer has rested on the link for a moment, or it was
 *     pressed. Chrome keeps at most two such pages at a time.
 *
 * A prerendered page shown after the cart changed asks the cart, as a page
 * brought back by Back does, and loads itself again when it was drawn with
 * a different count (./shims.ts BACK_FORWARD).
 */
import { SITE_PREFETCH_RULES } from "@/lib/website-builder/prefetch-rules"

/** The rules a desktop visitor's page is given: the prefetch's links, prerendered. */
export const DESKTOP_PRERENDER_RULES = {
  prerender: SITE_PREFETCH_RULES.prefetch.map((r) => ({ where: r.where, eagerness: "moderate" as const })),
}

/** Adds the rules, on a desktop pointer only. */
export const PRERENDER_STARTER = `(function(){try{var d=document,n=navigator,c=n.connection;if(!window.HTMLScriptElement||!HTMLScriptElement.supports||!HTMLScriptElement.supports("speculationrules"))return;if(!matchMedia("(hover: hover) and (pointer: fine)").matches)return;if(c&&(c.saveData||/2g/.test(c.effectiveType||"")))return;var s=d.createElement("script");s.type="speculationrules";s.textContent=${JSON.stringify(JSON.stringify(DESKTOP_PRERENDER_RULES))};d.head.appendChild(s)}catch(e){}})();`

/** The page with the desktop prerender rules, put just before its last `</body>`. */
export function withDesktopPrerender(html: string): string {
  const at = html.search(/<\/body>(?![\s\S]*<\/body>)/i)
  if (at < 0) return html
  return `${html.slice(0, at)}<script data-storelib-prerender>${PRERENDER_STARTER}</script>${html.slice(at)}`
}
