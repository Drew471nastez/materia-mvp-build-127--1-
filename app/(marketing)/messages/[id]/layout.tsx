/**
 * The one element that exists for the whole of one visit to a conversation.
 *
 * Every earlier attempt at an entry animation on this route died on the same
 * rock: the loading shell and the real screen are two different elements, so
 * anything animated on either PLAYS TWICE — once when the shell mounts and
 * again, from the first keyframe, at the exact moment the shell becomes the
 * conversation. A restart landing on the handover is worse than no animation,
 * and that is why the entrance kept being added and then removed.
 *
 * A segment layout is the element that does not have that problem. Next mounts
 * it once when the route is entered, keeps it mounted while loading.tsx is
 * swapped for page.tsx, and unmounts it when you leave — so an animation here
 * plays exactly once per navigation and spans the shell AND the messages as
 * one continuous arrival, however long the payload takes.
 *
 * OPACITY ONLY, and that is a hard constraint rather than a taste: the
 * conversation's `.thread-shell` inside is `position: fixed`, and a transform
 * or filter on any ancestor makes that ancestor its containing block — the
 * screen would resolve `top`/`height` against this div instead of the viewport
 * and jump. Opacity creates a stacking context, not a containing block, so the
 * fixed geometry is untouched.
 *
 * The flex classes mirror what MessagesSplit expects from <main> (a flex
 * column with min-height: 0), because this div now sits between them and a
 * flex item that refuses to shrink would hand the split a height it cannot
 * scroll inside.
 */
export default function ThreadSegmentLayout({ children }: { children: React.ReactNode }) {
  return <div className="thread-arrive flex min-h-0 flex-1 flex-col">{children}</div>
}
