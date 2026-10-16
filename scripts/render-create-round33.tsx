/**
 * ROUND 33, for scripts/check-create-round33.mjs: the real create wizard
 * (components/community/creator/create-flow.tsx), the real community setup
 * pill (components/community/creator/setup-pill.tsx) and the real delete card
 * and dialog (components/community/creator/delete-community.tsx), each in a
 * stand-in for the /app frame. The probe answers every /api request.
 *
 *   ?view=wizard   New community
 *   ?view=pill     a community's Overview with its setup pill
 *   ?view=delete   Settings › Advanced's Delete, for a community two members pay for
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { CreateCommunity } from "@/components/community/creator/create-flow"
import { CommunitySetupPill } from "@/components/community/creator/setup-pill"
import { DeleteCommunity } from "@/components/community/creator/delete-community"
import { ToastHost } from "@/components/community/creator/parts"
import { allowedActions } from "@/lib/communities/permissions"
import type { CommunityHead } from "@/components/community/creator/view-types"

const view = new URLSearchParams(location.search).get("view") || "wizard"

const head: CommunityHead = {
  id: "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a",
  slug: "makers",
  name: "Makers",
  tagline: null,
  logoUrl: null,
  coverUrl: null,
  status: "published",
  access: "paid",
  visibility: "public",
  memberCount: 3,
  postCount: 0,
  archived: false,
  suspended: false,
  gamificationEnabled: false,
  classroomEnabled: false,
  eventsEnabled: false,
  role: "owner",
  can: allowedActions("owner"),
  openReports: 0,
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-svh overflow-hidden bg-[#131316]">
      <aside className="fixed bottom-0 left-0 top-0 hidden w-[240px] bg-[#131316] lg:block" />
      <main className="h-svh overflow-hidden bg-[#f8f9fa] lg:pl-[240px]">
        <div className="app-content-scroll h-svh overflow-hidden">{children}</div>
      </main>
    </div>
  )
}

function App() {
  if (view === "pill")
    return (
      <Frame>
        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Makers</h1>
        </div>
        <CommunitySetupPill pathname="/app/community/makers/members" />
      </Frame>
    )
  if (view === "delete")
    return (
      <ToastHost>
        <Frame>
          <div className="mx-auto max-w-[1200px] space-y-4 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
            <DeleteCommunity head={head} />
          </div>
        </Frame>
      </ToastHost>
    )
  return (
    <ToastHost>
      <Frame>
        <CreateCommunity />
      </Frame>
    </ToastHost>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
