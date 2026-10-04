/**
 * The middle column of a feed page: the space chips (and a space's line)
 * over the feed or a post. The columns either side are the frame's
 * (shell-frame.tsx: the community card and the places on the left, the
 * next event and the top contributors on the right), so a page only draws
 * its own content and the frame decides how wide it can be. No hooks, so a
 * server page can use it.
 */
export function FeedColumns({ main, header }: { main: React.ReactNode; header?: React.ReactNode }) {
  return (
    <div className="w-full min-w-0" data-feed-column="">
      {header}
      {main}
    </div>
  )
}
