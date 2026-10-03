/**
 * The feed's two columns inside the shell: the feed at most 680px wide, and
 * from 1280px a narrow column beside it (what the community is, what is
 * coming up). Below 1280px the side column is simply not drawn; nothing in
 * it is needed to use the feed. No hooks, so a server page can use it.
 */
import Link from "next/link"
import { memberCountLabel, postCountLabel } from "@/lib/communities/format"
import { EventBadge, EventWhen } from "./time"
import { CARD } from "./ui"
import type { ShellCommunity } from "./view-types"

export function FeedColumns({ main, aside, header }: { main: React.ReactNode; aside?: React.ReactNode; header?: React.ReactNode }) {
  return (
    <div className="flex gap-6 pb-16 pt-2 lg:pt-6">
      <div className="w-full min-w-0 max-w-[680px] flex-1">
        {header}
        {main}
      </div>
      {aside ? (
        <aside className="hidden w-[248px] shrink-0 xl:block" data-community-aside="">
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

export function FeedAside({ community, upcoming }: { community: ShellCommunity; upcoming: UpcomingEvent | null }) {
  const base = `/community/${community.slug}`
  return (
    <>
      <section className={`${CARD} overflow-hidden`}>
        {community.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={community.coverUrl} alt="" className="aspect-[2/1] w-full bg-[#f1f2f4] object-cover" />
        ) : null}
        <div className="p-4">
          <p className="text-[15px] font-semibold text-[#1a1a2e]">{community.name}</p>
          {community.tagline ? <p className="mt-1 text-[13.5px] leading-relaxed text-[#6b7280]">{community.tagline}</p> : null}
          <p className="mt-3 text-[13px] text-[#6b7280]">
            {memberCountLabel(community.memberCount)} · {postCountLabel(community.postCount)}
          </p>
          <Link href={`${base}/about`} className="mt-3 inline-flex h-9 items-center text-[13.5px] font-medium text-[#1a1a2e] hover:underline">
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
