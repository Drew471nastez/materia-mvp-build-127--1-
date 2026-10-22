/**
 * Round 38's screens, drawn by the real components, for
 * scripts/check-community-chat-r38.mjs. window.__probe.mode picks one:
 *
 *   tab          the community's row of places with Chat after Community, the
 *                left column's places, and the Chat tab's screen: the chat
 *                channels as chips (the main one first, no All), the main
 *                channel with its pinned message (chat.tsx over chat-surface)
 *   readonly     an announcements channel a member reads but cannot post in,
 *                saying why in place of the box
 *   profile      a member's profile inside the community with Message beside
 *                Follow (pressable, or greyed with the reason under the row),
 *                and the members list with a greyed Message
 *   chat-panel   Settings > Chat (components/community/creator/chat-panel.tsx)
 *   automations  Settings > Automated messages, and its sheet open
 *
 * The probe answers every /api request the screens make.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ChatView } from "@/components/community/member/chat"
import { ViewportVars } from "@/components/viewport-vars"
import { Toasts } from "@/components/community/member/toast"
import { SpaceChips } from "@/components/community/member/space-chips"
import { SectionTabs } from "@/components/community/member/shell-frame"
import { PlaceContext, WallPlaces } from "@/components/community/member/wall"
import { navEntries } from "@/components/community/member/nav"
import { MemberProfilePlace } from "@/components/community/member/member-profile"
import { MemberRow } from "@/components/community/member/members"
import { ChatPanel } from "@/components/community/creator/chat-panel"
import { AutomationsPanel } from "@/components/community/creator/automations-panel"
import { chatTabChannels } from "@/lib/communities/chat-rules"
import type { CommunityHead } from "@/components/community/creator/view-types"
import type { ChatIntroView, ChatMessageView, SpaceView } from "@/components/community/member/view-types"
import type { MemberProfileData } from "@/lib/communities/member-profile-view"
import type { ViewerView } from "@/lib/communities/types"

/* Set by the probe before the page runs (its own shape: round 37's renderer declares window.__probe for itself). */
const p = (window as unknown as { __probe: { mode: string; communityId: string; me: { id: string; name: string }; messages: ChatMessageView[]; profileCan?: boolean; profileReason?: string | null } }).__probe
const sp = (id: string, slug: string, name: string, kind: SpaceView["kind"], extra: Partial<SpaceView> = {}): SpaceView => ({ id, slug, name, description: null, icon: null, kind, canPost: true, commentsEnabled: true, unread: 0, ...extra })
const SPACES: SpaceView[] = [
  sp("5a5a5a5a-0000-4000-8000-000000000010", "general", "General", "feed"),
  sp("5a5a5a5a-0000-4000-8000-000000000001", "lounge", "Lounge", "chat", { description: "Everyone, all day" }),
  sp("5a5a5a5a-0000-4000-8000-000000000002", "announcements", "Announcements", "chat", { description: "News from the team", unread: 2 }),
  sp("5a5a5a5a-0000-4000-8000-000000000003", "wins", "Wins", "chat"),
]
const viewer: ViewerView = { userId: p.me.id, signedIn: true, role: "member", status: "active", active: true, tierId: null, level: 2, points: 40, isOwner: false, isCreatorAccount: false, mutedUntil: null, can: { report: true, chat: true, upload: true } } as unknown as ViewerView
const intro = (extra: Partial<ChatIntroView> = {}): ChatIntroView => ({ ready: true, rules: "", rulesVersion: 0, needsRules: false, dmPolicy: "level", groupsPolicy: "members", attachments: true, myDms: "everyone", restriction: null, myName: p.me.name, ...extra })

/* The community's frame, cut down to what round 38 adds to it: the bar, the row of places, the left column. */
function Frame({ children, tab }: { children: React.ReactNode; tab: "chat" | "members" | "home" }) {
  const entries = navEntries({ slug: "studio-notes", classroomEnabled: true, eventsEnabled: true, directoryEnabled: true, gamificationEnabled: true, chatEnabled: true, chatTab: { slug: "lounge" } }, false)
  return (
    <PlaceContext.Provider value={{ tab }}>
      <div data-community-shell="" className="min-h-svh bg-[#f8f9fa] [--community-top:105px] lg:[--community-top:113px]">
        <div className="sticky top-0 z-40 border-b border-[#e6e8ec] bg-white">
          <div className="flex h-[56px] items-center px-4 text-[15px] font-semibold text-[#1a1a2e] lg:h-[64px] lg:px-8" data-probe-bar="">
            Studio Notes
          </div>
          <SectionTabs entries={entries} />
        </div>
        <div className="mx-auto flex w-full max-w-[1360px] gap-6 px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
          <aside className="hidden w-[260px] shrink-0 lg:block">
            <WallPlaces entries={entries} />
          </aside>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
        <Toasts />
      </div>
    </PlaceContext.Provider>
  )
}

function TabScreen() {
  const channels = chatTabChannels(SPACES, "lounge")
  const lounge = channels[0]
  return (
    <Frame tab="chat">
      <div className="max-w-[760px]">
        <div className="max-sm:hidden">
          <SpaceChips slug="studio-notes" spaces={channels} active={lounge.slug} noAll />
        </div>
        <ChatView channels={channels} communityId={p.communityId} slug="studio-notes" space={lounge} viewer={viewer} initial={{ messages: p.messages, hasMore: false }} intro={intro({ pinned: { id: p.messages[0]?.id ?? "x", authorName: "Olivia Hart", text: "Welcome in! Read the rules in About, then say hi here. Office hours are Thursdays at 6pm." } })} />
      </div>
    </Frame>
  )
}

function ReadonlyScreen() {
  const channels = chatTabChannels(SPACES, "lounge")
  const news = channels.find((c) => c.slug === "announcements")!
  return (
    <Frame tab="chat">
      <div className="max-w-[760px]">
        <div className="max-sm:hidden">
          <SpaceChips slug="studio-notes" spaces={channels} active={news.slug} noAll />
        </div>
        <ChatView channels={channels} communityId={p.communityId} slug="studio-notes" space={{ ...news, canPost: false }} viewer={viewer} initial={{ messages: p.messages.slice(0, 4), hasMore: false }} readOnly intro={intro({ postNote: "Only the team posts in this channel." })} />
      </div>
    </Frame>
  )
}

function ProfileScreen() {
  const data: MemberProfileData = {
    self: false,
    person: { userId: "bbbbbbbb-0000-4000-8000-00000000000b", username: "benokafor", name: "Ben Okafor", avatarUrl: null, coverUrl: null, coverCrop: { x: 50, y: 50, zoom: 1 }, bio: "Furniture maker in Porto. Here for the joinery threads.", location: "Porto, Portugal", role: null, level: 4, joinedAt: "2026-03-02T10:00:00Z", followers: 128, following: 41, pageHref: null, hasStorefront: false },
    viewerFollowing: false,
    scope: "community",
    posts: { posts: [], next: null },
    activity: null,
    board: null,
    now: Date.now(),
    message: { can: p.profileCan !== false, reason: p.profileCan === false ? (p.profileReason ?? "Messages open at level 3") : null },
  }
  const dmStart = { policy: "level" as const, minLevel: 3, minDays: 7, toStaff: true, myRole: "member", myLevel: 2, myJoinedAt: "2026-10-01T00:00:00Z" }
  const row = (userId: string, name: string, role: "member" | "admin", level: number) => ({ userId, name, username: null, avatarUrl: null, role, level, levelName: null, bio: null, hasStorefront: false, location: null })
  return (
    <Frame tab="members">
      <MemberProfilePlace community={{ id: p.communityId, slug: "studio-notes", name: "Studio Notes" }} viewer={{ userId: p.me.id, signedIn: true }} profileRef="benokafor" data={data} />
      <div className="mx-auto mt-4 max-w-[992px] overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-probe-members="">
        <MemberRow m={row("cccccccc-0000-4000-8000-00000000000c", "Cleo Park", "member", 5)} slug="studio-notes" canMessage dmStart={dmStart} />
        <MemberRow m={row("dddddddd-0000-4000-8000-00000000000d", "Olivia Hart", "admin", 9)} slug="studio-notes" canMessage dmStart={dmStart} />
      </div>
    </Frame>
  )
}

function Panel({ which }: { which: "chat" | "automations" }) {
  const head = { id: p.communityId, slug: "studio-notes", name: "Studio Notes", can: { manage_settings: true, mute: true } } as unknown as CommunityHead
  return (
    <div className="min-h-svh bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8" data-probe-panel={which}>
        <h1 className="mb-4 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{which === "chat" ? "Chat" : "Automated messages"}</h1>
        <div className="max-w-[760px]">{which === "chat" ? <ChatPanel head={head} /> : <AutomationsPanel head={head} />}</div>
      </div>
    </div>
  )
}

const screen = p.mode === "tab" ? <TabScreen /> : p.mode === "readonly" ? <ReadonlyScreen /> : p.mode === "profile" ? <ProfileScreen /> : p.mode === "chat-panel" ? <Panel which="chat" /> : <Panel which="automations" />

createRoot(document.getElementById("app")!).render(
  <>
    <ViewportVars />
    {screen}
  </>,
)
