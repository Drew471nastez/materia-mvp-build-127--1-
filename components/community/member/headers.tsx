/**
 * The line at the top of a member page (Members, the leaderboard, the
 * inbox). A space has no title line of its own any more: it is a chip at the
 * top of the feed (space-chips.tsx). Server safe.
 */

export function PageTitle({ title, detail, children }: { title: string; detail?: string | null; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3" data-page-title="">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[26px]">{title}</h1>
        {detail ? <p className="mt-1 text-[14px] text-[#6b7280]">{detail}</p> : null}
      </div>
      {children}
    </div>
  )
}
