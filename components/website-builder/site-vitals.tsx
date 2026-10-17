/**
 * ===========================================================================
 *  THE PUBLISHED SITE MEASURES ITSELF, ONCE PER PAGE VIEW
 * ===========================================================================
 * The collector a Storelib theme's live page carries, as one inline script
 * in the server's HTML: the same script an imported theme's page has in its
 * head (lib/perf/site-vitals-inline.ts, where what it measures, when and
 * what it sends is written down). No JavaScript bundle is downloaded for it
 * and React never runs it: the script starts itself after the page's load
 * event, at an idle moment, and a page the visitor moves to without a
 * reload is measured by the same script, which sees the address change.
 *
 * WHERE IT RUNS. Only on a published site's pages: renderSite, the shop, the
 * search page, the account pages and a product page render it, and never a
 * preview. `installId` is the live install the page was drawn from; without
 * one nothing is rendered. It is not sent: the beacon route finds the site
 * from the host the page was served at. The script itself refuses to run
 * inside a frame (the editor's canvas, anybody embedding the site) and in a
 * browser driven by a script (the cover screenshots, bots).
 */

import { SITE_VITALS_JS } from "@/lib/perf/site-vitals-inline"

export function SiteVitals({ installId }: { installId: string }) {
  if (!installId) return null
  return <script data-storelib-vitals="" dangerouslySetInnerHTML={{ __html: SITE_VITALS_JS }} />
}
