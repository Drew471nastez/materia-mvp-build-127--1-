/**
 * The real community chat screen (components/community/member/chat.tsx, and
 * through it chat-surface.tsx) for scripts/check-community-chat-r37.mjs: a
 * stand in for the community's bar (its height published as --community-top,
 * as top-bar.tsx does), the viewport variables the app publishes
 * (components/viewport-vars.tsx), and one chat channel. Who is looking and
 * what the first page holds come from window.__probe, set by the probe.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ChatView } from "@/components/community/member/chat"
import { ViewportVars } from "@/components/viewport-vars"
import { Toasts } from "@/components/community/member/toast"
import type { ChatMessageView, SpaceView } from "@/components/community/member/view-types"
import type { ViewerView } from "@/lib/communities/types"

declare global {
  interface Window {
    __probe: { communityId: string; me: { id: string; name: string }; messages: ChatMessageView[]; hasMore: boolean; rules?: string }
  }
}

const p = window.__probe
const space: SpaceView = { id: "5a5a5a5a-0000-4000-8000-000000000001", slug: "general", name: "general", description: "Say hi, ask anything", icon: null, kind: "chat", canPost: true, commentsEnabled: true, unread: 0 }
const viewer: ViewerView = { userId: p.me.id, signedIn: true, role: "member", status: "active", active: true, tierId: null, level: 2, points: 40, isOwner: false, isCreatorAccount: false, mutedUntil: null, can: { report: true, chat: true, upload: true } }

function App() {
  return (
    <div data-community-shell="" className="min-h-svh bg-[#f8f9fa] [--community-top:99px] lg:[--community-top:107px]">
      <div className="sticky top-0 z-40 flex h-[99px] items-center border-b border-[#e6e8ec] bg-white px-4 text-[15px] font-semibold text-[#1a1a2e] lg:h-[107px]" data-probe-bar="">
        Studio Notes
      </div>
      <div className="mx-auto w-full max-w-[1360px] px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        <div className="lg:ml-[284px]">
          <ChatView
            communityId={p.communityId}
            slug="studio-notes"
            space={space}
            viewer={viewer}
            initial={{ messages: p.messages, hasMore: p.hasMore }}
            intro={{ ready: true, rules: p.rules ?? "", rulesVersion: p.rules ? 1 : 0, needsRules: !!p.rules, dmPolicy: "everyone", groupsPolicy: "members", attachments: true, myDms: "everyone", restriction: null, myName: p.me.name }}
          />
        </div>
      </div>
      <Toasts />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <>
    <ViewportVars />
    <App />
  </>,
)
