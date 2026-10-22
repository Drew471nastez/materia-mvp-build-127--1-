/**
 * Round 39's chat, drawn by the real components, for
 * scripts/check-community-chat-r39.mjs: a stand in for the community's bar
 * (--community-top), a "Messages" button that opens the panel the way the
 * frame does (shell-frame.tsx listens for openMessages), a person's Message
 * button as a profile draws it (member-profile.tsx: openMessages with the
 * person, the conversation asked for ahead on hover or touch), and, when
 * window.__probe.mode is "tab", the Chat tab's channel (chat.tsx).
 *
 * Written against round 38 and round 39 alike: what round 39 adds
 * (warmConversation) is called only when it is there, so the probe's BEFORE
 * numbers come from the same page.
 */
import React, { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import * as Messages from "@/components/community/member/messages"
import { ChatView } from "@/components/community/member/chat"
import { ViewportVars } from "@/components/viewport-vars"
import { Toasts } from "@/components/community/member/toast"
import type { ChatMessageView, SpaceView } from "@/components/community/member/view-types"
import type { ViewerView } from "@/lib/communities/types"

type Person = { id: string; name: string; username: string | null; avatarUrl: string | null; role: string | null }
const p = (window as unknown as { __probe: { mode: string; communityId: string; me: { id: string; name: string }; other: Person; messages?: ChatMessageView[] } }).__probe
const space: SpaceView = { id: "5a5a5a5a-0000-4000-8000-000000000001", slug: "lounge", name: "lounge", description: "Everyone, all day", icon: null, kind: "chat", canPost: true, commentsEnabled: true, unread: 0 }
const viewer = { userId: p.me.id, signedIn: true, role: "member", status: "active", active: true, tierId: null, level: 2, points: 40, isOwner: false, isCreatorAccount: false, mutedUntil: null, can: { report: true, chat: true, upload: true } } as unknown as ViewerView
const warm = (Messages as unknown as { warmConversation?: (communityId: string, me: string | null, other: string) => void }).warmConversation

function App() {
  const [chat, setChat] = useState<Record<string, unknown> | null>(null)
  useEffect(() => {
    const on = (e: Event) => setChat(((e as CustomEvent).detail ?? {}) as Record<string, unknown>)
    window.addEventListener(Messages.MESSAGES_EVENT, on)
    return () => window.removeEventListener(Messages.MESSAGES_EVENT, on)
  }, [])
  const ahead = () => warm?.(p.communityId, p.me.id, p.other.id)
  return (
    <div data-community-shell="" className="min-h-svh bg-[#f8f9fa] [--community-top:99px] lg:[--community-top:107px]">
      <div className="sticky top-0 z-40 flex h-[99px] items-center justify-between border-b border-[#e6e8ec] bg-white px-4 text-[15px] font-semibold text-[#1a1a2e] lg:h-[107px]" data-probe-bar="">
        Studio Notes
        <button type="button" onClick={() => setChat((c) => (c ? null : {}))} data-probe-open="" className="h-10 rounded-full px-4 text-[14px] font-medium hover:bg-[#f1f2f4]">
          Messages
        </button>
      </div>
      <div className="mx-auto w-full max-w-[1360px] px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        <div className="lg:ml-[284px]">
          {p.mode === "tab" ? (
            <ChatView
              communityId={p.communityId}
              slug="studio-notes"
              space={space}
              viewer={viewer}
              initial={{ messages: p.messages ?? [], hasMore: false }}
              intro={{ ready: true, rules: "", rulesVersion: 0, needsRules: false, dmPolicy: "everyone", groupsPolicy: "members", attachments: true, myDms: "everyone", restriction: null, myName: p.me.name }}
            />
          ) : (
            <div className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-6">
              <p className="text-[18px] font-bold text-[#1a1a2e]">{p.other.name}</p>
              <button
                type="button"
                data-probe-profile-message=""
                onPointerEnter={ahead}
                onTouchStart={ahead}
                onFocus={ahead}
                onClick={() => Messages.openMessages({ userId: p.other.id, person: p.other } as never)}
                className="mt-4 h-10 rounded-full border border-[#e5e7eb] px-4 text-[14px] font-medium text-[#1a1a2e]"
              >
                Message
              </button>
            </div>
          )}
        </div>
      </div>
      <Messages.MessagesPanel communityId={p.communityId} slug="studio-notes" userId={p.me.id} open={!!chat} start={chat as never} onClose={() => setChat(null)} onRead={() => undefined} />
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
