/**
 * The listing's arrival, played once.
 *
 * A `template.tsx` sits OUTSIDE the route's Suspense boundary and is remounted
 * on every navigation, which makes it the only element in the tree that is both
 * fresh per arrival and an ancestor of the skeleton AND of the page that
 * replaces it. That is exactly what this animation needs.
 *
 * On the component it was doubled. `loading.tsx` hard-cut in with no animation
 * at all, and then `ProductDetail` mounted a beat later and played its own
 * entrance — so a cold open was a jump to a grey skeleton followed by the
 * finished page animating in behind it, which is two arrivals for one tap. From
 * here the fade covers the whole route change, and the skeleton-to-page handover
 * underneath it moves nothing (the shell is measured against the real page — see
 * loading.tsx).
 *
 * A plain <div> and one class. It must stay that way: this element is an
 * ancestor of the listing's fixed buy bar, so anything that would make it a
 * containing block — a transform, a filter, a perspective, a `will-change` that
 * names any of those — takes the bar off the viewport and parks it at the bottom
 * of the page. That is precisely the bug `.listing-enter` used to be. The class
 * animates opacity and only opacity, and the note above the keyframes in
 * app/globals.css records the measurements.
 */
export default function ListingTemplate({ children }: { children: React.ReactNode }) {
  return <div className="listing-enter">{children}</div>
}
