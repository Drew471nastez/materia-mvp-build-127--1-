/**
 * The same gap as the segment above: `storelib.com/<handle>/<slug>` renders
 * the product page and had no loading boundary, so a press sat on the old
 * page for the length of a dynamic server render. The product page's own
 * skeleton, re-exported so the two addresses cannot drift apart.
 */
export { default } from "../../p/[slug]/loading"
