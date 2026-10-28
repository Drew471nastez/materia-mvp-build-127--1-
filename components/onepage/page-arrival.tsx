/**
 * ===========================================================================
 *  THE ENTRANCE PLAYS ONCE: COMING BACK TO A ONEPAGE NEVER FLASHES
 * ===========================================================================
 * "Going back from checkout to the one page must not flash."
 *
 * The page's blocks rise in on arrival (a 300ms fade from 8px lower, each a
 * little after the one before, components/onepage/public-onepage.tsx). With
 * `fill-mode: both` every block is invisible on the first frame, so a page
 * that is drawn again (Back from Stripe's checkout when the browser did not
 * keep the page in its back/forward cache, the checkout's own Cancel link,
 * Back from a product page) blanked and rebuilt itself in front of the
 * visitor, on a page they had already seen.
 *
 * This decides before the first paint, in a few lines run as the HTML is
 * read, whether this is an arrival or a return:
 *
 *   a return    the navigation is Back or Forward, or this tab has already
 *               shown this page in this session (sessionStorage), or the
 *               visitor came from a checkout
 *   then        a rule is added to <head> that takes the entrance off every
 *               block marked data-onepage-enter, so the page is simply
 *               there, in place, at once
 *
 * Reduced motion takes it off for everyone. A server component: it renders
 * a plain <script> from the route (app/(marketing)/l/[slug]/page.tsx), never
 * from a client render, so React never sees a script it would refuse.
 */

/*
  A <style> added to <head>, not an attribute on <html>: React hydrates
  <html> and would see an attribute it did not render; it leaves a node it
  does not own in <head> alone.
*/
const RETURN_RULE = "[data-onepage-enter]{animation:none!important;opacity:1!important}"

const ARRIVAL_SCRIPT = `(function(){try{var k="op-seen:"+location.pathname,n=performance.getEntriesByType&&performance.getEntriesByType("navigation")[0],back=!!n&&n.type==="back_forward",seen=false;try{seen=sessionStorage.getItem(k)==="1";sessionStorage.setItem(k,"1")}catch(e){}var r=document.referrer||"";if(back||seen||/checkout|\\/pay\\//i.test(r)){var s=document.createElement("style");s.setAttribute("data-onepage-return","");s.textContent=${JSON.stringify(RETURN_RULE)};document.head.appendChild(s)}}catch(e){}})();`

/*
  THE LIVE PAGE'S SCROLLBAR: slim, in the page's own text colour faded into
  its ground (--op-scroll-thumb, lib/onepage/sheet-theme.ts), on no track,
  where a pointer drives it; a phone keeps none. Here, on the public route
  only, it can name <html> itself: the same rule in globals.css needed
  html:has(.onepage-live), which tests/editor-css-v.test.ts forbids because
  a :has() on the root restyled the whole editor on every insertion.
*/
const SCROLL_STYLE = `@media (hover:hover) and (pointer:fine){html{scrollbar-width:thin;scrollbar-color:var(--op-scroll-thumb,rgba(156,163,175,.5)) transparent}}`

const ARRIVAL_STYLE = `@media (prefers-reduced-motion:reduce){[data-onepage-enter]{animation:none!important}}${SCROLL_STYLE}`

/** The rule and the check, placed before the page in the route. */
export function OnePageArrival() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ARRIVAL_STYLE }} />
      <script dangerouslySetInnerHTML={{ __html: ARRIVAL_SCRIPT }} />
    </>
  )
}

/** Exported for tests/onepage-media-r40.test.ts, which runs the check against fake navigations. */
export const ONEPAGE_ARRIVAL = { script: ARRIVAL_SCRIPT, style: ARRIVAL_STYLE, returnRule: RETURN_RULE, scroll: SCROLL_STYLE }
