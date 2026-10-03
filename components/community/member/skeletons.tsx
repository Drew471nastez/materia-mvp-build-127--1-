/**
 * WHAT A MEMBER PAGE LOOKS LIKE WHILE IT LOADS, inside the shell, which is
 * already on screen (the route group's layout draws it): the same column, the
 * same card shapes and the same sizes as the page that is coming, so nothing
 * moves when it arrives. The shapes are `skeleton-deferred` (globals.css):
 * invisible for the first 200ms, so a quick page never shows grey at all.
 *
 * Without these, going from Home to Members or into a post left the page
 * that was there until the new one was ready, which reads as a tap that did
 * nothing and then a jump. Server safe: no hooks.
 */
const BLOCK = "rounded-md bg-[#eceef1]"
const CARD = "rounded-2xl border border-[#e5e7eb]/80 bg-white"

function PostShape({ lines = 2 }: { lines?: number }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center gap-3">
        <span className={`h-10 w-10 shrink-0 rounded-full bg-[#eceef1]`} />
        <span className="flex-1 space-y-2">
          <span className={`block h-3 w-32 ${BLOCK}`} />
          <span className={`block h-2.5 w-20 ${BLOCK}`} />
        </span>
      </div>
      <div className="mt-3.5 space-y-2">
        <span className={`block h-3.5 w-3/4 ${BLOCK}`} />
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className={`block h-3 w-full ${BLOCK}`} />
        ))}
        <span className={`block h-3 w-2/5 ${BLOCK}`} />
      </div>
      <div className="mt-4 flex gap-2">
        <span className={`h-8 w-20 rounded-full bg-[#f1f2f4]`} />
        <span className={`h-8 w-20 rounded-full bg-[#f1f2f4]`} />
      </div>
    </div>
  )
}

/** The feed, a space, or Saved. */
export function FeedSkeleton({ composer = true, title }: { composer?: boolean; title?: string }) {
  return (
    <div className="max-w-[680px] pb-16 pt-2 lg:pt-6" aria-busy="true" aria-label="Loading posts">
      {title ? <h1 className="mb-4 text-[22px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[26px]">{title}</h1> : null}
      <div className="skeleton-deferred space-y-3">
        {composer ? (
          <div className={`${CARD} flex items-center gap-3 p-3 sm:p-3.5`}>
            <span className="h-9 w-9 shrink-0 rounded-full bg-[#eceef1]" />
            <span className="h-10 flex-1 rounded-full bg-[#f4f5f7]" />
          </div>
        ) : null}
        <PostShape />
        <PostShape lines={3} />
        <PostShape lines={1} />
      </div>
    </div>
  )
}

/** One post with its comments. */
export function PostSkeleton() {
  return (
    <div className="max-w-[680px] pb-16 pt-2 lg:pt-6" aria-busy="true" aria-label="Loading the post">
      <div className="skeleton-deferred space-y-3">
        <PostShape lines={4} />
        <div className={`${CARD} space-y-4 p-4`}>
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3">
              <span className="h-8 w-8 shrink-0 rounded-full bg-[#eceef1]" />
              <span className="flex-1 space-y-2">
                <span className={`block h-3 w-24 ${BLOCK}`} />
                <span className={`block h-3 w-full ${BLOCK}`} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** A list of people: Members, the leaderboard. */
export function PeopleSkeleton({ title }: { title: string }) {
  return (
    <div className="max-w-[680px] pb-16 pt-2 lg:pt-6" aria-busy="true" aria-label={`Loading ${title.toLowerCase()}`}>
      <h1 className="mb-4 text-[22px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[26px]">{title}</h1>
      <div className={`${CARD} skeleton-deferred divide-y divide-[#f1f2f4]`}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 p-3.5">
            <span className="h-11 w-11 shrink-0 rounded-full bg-[#eceef1]" />
            <span className="flex-1 space-y-2">
              <span className={`block h-3 w-36 ${BLOCK}`} />
              <span className={`block h-2.5 w-24 ${BLOCK}`} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
