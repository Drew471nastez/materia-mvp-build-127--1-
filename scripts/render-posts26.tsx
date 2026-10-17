/**
 * The community admin's Posts section of round 26 for scripts/check-posts26.mjs: the real FeedSection (the writer with
 * its staff scheduling, the Scheduled and drafts list, the community's own post popup) in a stand-in for the /app frame.
 * The panel's rows come from window.__SCHEDULED when the probe sets them (the probe's stub of part 194 answers the rest).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { allowedActions } from "@/lib/communities/permissions"
import { CommunityShell } from "@/components/community/creator/community-shell"
import { FeedSection } from "@/components/community/creator/feed-section"
import type { CommunityHead, FeedRowView } from "@/components/community/creator/view-types"
import type { ScheduledPanelData } from "@/lib/communities/scheduled-posts"
import { ViewportVars } from "@/components/viewport-vars"
import { FIXTURE } from "./posts-round33-fixture.mjs"

const { ID, ME, rows } = FIXTURE
/* Part 194 checks a space by its uuid (checkScheduledInput), so the fixture's two spaces get real ones here and in the probe. */
export const S1 = "51000000-0000-4000-8000-000000000001"
export const S2 = "52000000-0000-4000-8000-000000000002"
const sid = (x: unknown) => (x === "s1" ? S1 : x === "s2" ? S2 : x)
const all = (rows.all as FeedRowView[]).map((r) => ({ ...r, spaceId: sid(r.spaceId) as string | null }))

const head: CommunityHead = {
  id: ID,
  slug: "morning-writers",
  name: "The Morning Writers",
  tagline: "Write 500 words before breakfast, together.",
  logoUrl: null,
  coverUrl: null,
  status: "published",
  access: "paid",
  visibility: "public",
  memberCount: 1284,
  postCount: 3412,
  archived: false,
  suspended: false,
  gamificationEnabled: true,
  classroomEnabled: true,
  eventsEnabled: true,
  role: "owner",
  can: allowedActions("owner"),
  openReports: 0,
  me: { userId: ME, name: "Ana Popescu", avatarUrl: null },
}

const scheduled: ScheduledPanelData = (window as unknown as { __SCHEDULED?: ScheduledPanelData }).__SCHEDULED ?? FIXTURE.scheduled

function Frame({ children, path }: { children: React.ReactNode; path: string }) {
  ;(window as unknown as { __path: string }).__path = path
  return (
    <div className="h-svh overflow-hidden bg-[#131316]">
      <header className="fixed inset-x-0 top-0 z-30 h-[68px] bg-[#131316] md:h-[58px]" />
      <aside className="fixed bottom-0 left-0 top-[58px] hidden w-[240px] bg-[#131316] md:block" />
      <main className="h-svh overflow-hidden bg-[#f8f9fa] pt-[68px] md:bg-white md:pl-[240px] md:pt-[58px]">
        <div className="app-content-scroll h-[calc(100svh-68px)] overflow-y-auto md:h-[calc(100svh-58px)]">{children}</div>
      </main>
    </div>
  )
}

function App() {
  return (
    <Frame path={`/app/community/${ID}/feed`}>
      <CommunityShell head={head}>
        <FeedSection
          head={head}
          spaces={[
            { id: S1, name: "General", announcements: false },
            { id: S2, name: "Announcements", announcements: true },
          ]}
          compose={null}
          initial={{ next: null, rows: all }}
          scheduled={scheduled}
        />
      </CommunityShell>
    </Frame>
  )
}

createRoot(document.getElementById("app")!).render(
  <>
    <ViewportVars />
    <App />
  </>,
)
