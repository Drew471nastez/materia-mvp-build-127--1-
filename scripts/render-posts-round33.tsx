/**
 * The community admin's Posts section of round 33 for scripts/check-posts-round33.mjs: the real FeedSection (with its
 * Scheduled and drafts panel and the post viewer) in a stand-in for the /app frame, picked by ?case=:
 *
 *   server     the panel's rows handed in with the page, as the Posts page now reads them (feedReads)
 *   client     no rows handed in: the panel reads itself, as an older page did
 *   none       someone who may moderate but not post: no panel
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

const params = new URLSearchParams(location.search)
const which = params.get("case") || "server"
const { ID, ME, rows } = FIXTURE

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
  role: which === "none" ? "moderator" : "owner",
  can: which === "none" ? { ...allowedActions("moderator"), post: false } : allowedActions("owner"),
  openReports: 0,
  me: { userId: ME, name: "Ana Popescu", avatarUrl: null },
}

const scheduled: ScheduledPanelData = FIXTURE.scheduled

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
            { id: "s1", name: "General", announcements: false },
            { id: "s2", name: "Announcements", announcements: true },
          ]}
          compose={null}
          initial={{ next: null, rows: rows.all as FeedRowView[] }}
          scheduled={which === "server" ? scheduled : undefined}
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
