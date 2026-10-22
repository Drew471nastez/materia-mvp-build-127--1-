/**
 * The member's Messages panel (components/community/member/messages.tsx, and
 * through it chat-surface.tsx) for scripts/check-community-chat-r38.mjs: a
 * stand in for the community's bar (--community-top, as top-bar.tsx
 * publishes it), the viewport variables (components/viewport-vars), a
 * "Messages" button that opens the panel, and a channel when
 * window.__probe.space is set. Who is looking comes from window.__probe.
 */
import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { MessagesPanel } from "@/components/community/member/messages"
import { ChatView } from "@/components/community/member/chat"
import { ViewportVars } from "@/components/viewport-vars"
import { Toasts } from "@/components/community/member/toast"
import type { ChatMessageView, SpaceView } from "@/components/community/member/view-types"
import type { ViewerView } from "@/lib/communities/types"

declare global {
  interface Window {
    __probe: { communityId: string; me: { id: string; name: string }; space?: boolean; messages?: ChatMessageView[] }
    __openMessages: () => void
  }
}

const p = window.__probe
const space: SpaceView = { id: "5a5a5a5a-0000-4000-8000-000000000001", slug: "general", name: "general", description: "Say hi, ask anything", icon: null, kind: "chat", canPost: true, commentsEnabled: true, unread: 0 }
const viewer: ViewerView = { userId: p.me.id, signedIn: true, role: "member", status: "active", active: true, tierId: null, level: 2, points: 40, isOwner: false, isCreatorAccount: false, mutedUntil: null, can: { report: true, chat: true, upload: true } }

function App() {
  const [open, setOpen] = useState(false)
  window.__openMessages = () => setOpen(true)
  return (
    <div data-community-shell="" className="min-h-svh bg-[#f8f9fa] [--community-top:99px] lg:[--community-top:107px]">
      <div className="sticky top-0 z-40 flex h-[99px] items-center justify-between border-b border-[#e6e8ec] bg-white px-4 text-[15px] font-semibold text-[#1a1a2e] lg:h-[107px]" data-probe-bar="">
        Studio Notes
        <button type="button" onClick={() => setOpen(true)} data-probe-open="" className="h-10 rounded-full px-4 text-[14px] font-medium hover:bg-[#f1f2f4]">
          Messages
        </button>
      </div>
      <div className="mx-auto w-full max-w-[1360px] px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        <div className="lg:ml-[284px]">
          {p.space ? (
            <ChatView
              communityId={p.communityId}
              slug="studio-notes"
              space={space}
              viewer={viewer}
              initial={{ messages: p.messages ?? [], hasMore: false }}
              intro={{ ready: true, rules: "", rulesVersion: 0, needsRules: false, dmPolicy: "everyone", groupsPolicy: "members", attachments: true, myDms: "everyone", restriction: null, myName: p.me.name }}
            />
          ) : (
            <p className="text-[14px] text-[#6b7280]">The community&apos;s page.</p>
          )}
        </div>
      </div>
      <MessagesPanel communityId={p.communityId} slug="studio-notes" userId={p.me.id} open={open} start={null} onClose={() => setOpen(false)} onRead={() => undefined} />
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
