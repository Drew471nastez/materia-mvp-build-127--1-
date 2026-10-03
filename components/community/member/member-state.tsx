/**
 * What a person who is not (or not yet, or no longer) an active member sees
 * on a member page, in one plain sentence and one way forward.
 */
import Link from "next/link"
import type { CommunityRow } from "@/lib/communities/types"
import { CARD } from "./ui"

const WORDS: Record<string, { title: string; detail: string }> = {
  pending: { title: "Your request is waiting", detail: "The community's admins will look at it soon. You will get access the moment they approve it." },
  banned: { title: "You can no longer take part here", detail: "The community's moderators removed your access." },
  closed: { title: "This community is not available right now", detail: "It has been paused. Check back later." },
  unknown: { title: "We could not check your access", detail: "The connection dropped for a moment. Refresh the page to try again." },
}

export function MemberStateScreen({ state, community }: { state: string; community: Pick<CommunityRow, "slug" | "name"> }) {
  const w = WORDS[state] ?? WORDS.unknown
  return (
    <div className="min-h-[60svh] bg-[#f8f9fa] px-4 py-16" data-member-state={state}>
      <div className={`${CARD} mx-auto max-w-[460px] px-6 py-10 text-center`}>
        <p className="text-[13px] font-medium text-[#8a8f98]">{community.name}</p>
        <h1 className="mt-2 text-[20px] font-semibold text-[#1a1a2e]">{w.title}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-[#6b7280]">{w.detail}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href={`/community/${community.slug}/about`} className="inline-flex h-10 items-center rounded-full border border-[#e3e4e8] bg-white px-4 text-[14px] font-medium text-[#1a1a2e] hover:bg-[#f6f7f8]">
            About {community.name}
          </Link>
          <Link href="/library" className="inline-flex h-10 items-center rounded-full px-4 text-[14px] font-medium text-[#4b5563] hover:bg-[#f1f2f4]">
            Your library
          </Link>
        </div>
      </div>
    </div>
  )
}
