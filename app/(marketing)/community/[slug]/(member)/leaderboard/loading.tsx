import { PeopleSkeleton } from "@/components/community/member/skeletons"

/* Inside the shell, which stays; the shapes are skeleton-deferred (components/community/member/skeletons.tsx), so a quick page shows no grey. */
export default function Loading() {
  return <PeopleSkeleton title="Leaderboard" />
}
