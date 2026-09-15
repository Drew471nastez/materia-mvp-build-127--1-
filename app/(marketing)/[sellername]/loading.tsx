/**
 * ===========================================================================
 *  THE SKELETON THE CREATOR PAGE ALWAYS HAD, ON THE ADDRESS IT NOW USES
 * ===========================================================================
 * `storelib.com/<handle>` became the creator page's only address, and this
 * segment had no loading boundary. Two things followed, and both are what a
 * visitor pressing a creator's name actually got.
 *
 * A route with no `loading.tsx` has no Suspense boundary, so a client
 * navigation into it commits nothing until the server answers. The page you
 * were on stays on screen, fully drawn, for the whole round trip — which on a
 * force-dynamic route measured 1.5 seconds of a press that appeared to do
 * nothing at all.
 *
 * And every other dynamic route under (marketing) has one. This was the only
 * one that did not, which is the shape of an oversight rather than a decision.
 *
 * It re-exports the storefront's own skeleton rather than copying it: one
 * file to change, and the two addresses cannot drift apart.
 */
export { default } from "../u/[username]/loading"
