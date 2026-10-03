/**
 * The feed's two columns inside the frame: the feed at most 720px wide, and
 * from 1024px a narrow column beside it with the community's card (what it
 * is, Members / Online / Admins) and what is coming up. Below 1024px the side
 * column is not drawn; nothing in it is needed to use the feed. No hooks, so
 * a server page can use it.
 */
import Link from "next/link"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { StatsRow } from "@/components/community/public/stats-row"
import type { CommunityStatsView } from "@/components/community/public/types"
import { EventBadge, EventWhen } from "./time"
import { CARD } from "./ui"
import type { ShellCommunity } from "./view-types"

export function FeedColumns({ main, aside, header }: { main: React.ReactNode; aside?: React.ReactNode; header?: React.ReactNode }) {
  return (
    <div className="flex gap-6 pb-16 pt-4 lg:pt-6">
      <div className="w-full min-w-0 max-w-[720px] flex-1">
        {header}
        {main}
      </div>
      {aside ? (
        <aside className="hidden w-[272px] shrink-0 lg:block" data-community-aside="">
          <div className="sticky top-[calc(var(--community-top,0px)+24px)] space-y-3">{aside}</div>
        </aside>
      ) : null}
    </div>
  )
}

export interface UpcomingEvent {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
}

export function FeedAside({ community, stats, upcoming }: { community: ShellCommunity; stats: CommunityStatsView; upcoming: UpcomingEvent | null }) {
  const base = `/community/${community.slug}`
  return (
    <>
      <section className={`${CARD} overflow-hidden`} data-community-card="">
        {community.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedImageUrl(community.coverUrl, 640)} alt="" className="aspect-[16/9] w-full bg-[#f1f2f4] object-cover" />
        ) : null}
        <div className="p-4">
          <p className="text-[15.5px] font-semibold leading-snug text-[#1a1a2e]">{community.name}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-[#8a8f98]">storelib.com{base}</p>
          {community.tagline ? <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#4b5563]">{community.tagline}</p> : null}
          <StatsRow stats={stats} className="mt-4" />
          <Link href={`${base}/about`} className="mt-1 flex h-10 items-center justify-center rounded-xl text-[13.5px] font-medium text-[#1a1a2e] hover:bg-[#f6f7f8]">
            About and rules
          </Link>
        </div>
      </section>
      {upcoming ? (
        <section className={`${CARD} p-4`} data-upcoming-event="">
          <p className="text-[12.5px] font-medium text-[#8a8f98]">Coming up</p>
          <Link href={`${base}/events/${upcoming.id}`} className="mt-2.5 flex gap-3">
            <EventBadge startsAt={upcoming.startsAt} />
            <span className="min-w-0">
              <span className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e] hover:underline">{upcoming.title}</span>
              <span className="mt-0.5 block text-[12.5px] text-[#6b7280]">
                <EventWhen startsAt={upcoming.startsAt} endsAt={upcoming.endsAt} />
              </span>
            </span>
          </Link>
        </section>
      ) : null}
    </>
  )
}
