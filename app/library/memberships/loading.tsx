import { MembershipsSkeleton } from "@/components/library/library-skeletons"
import { TAB_SKELETON } from "../loading"

/** The memberships list's shape while it is read (app/library/memberships/page.tsx): a line under the pills, then the cards. */
export default function MembershipsLoading() {
  return (
    <div data-library-skeleton="" className={TAB_SKELETON}>
      <MembershipsSkeleton />
    </div>
  )
}
