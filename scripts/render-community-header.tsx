/**
 * THE PLATFORM HEADER OVER A COMMUNITY, as a phone draws it: the real
 * PlatformHeaderClient and the real ShellFrame together, which is the only
 * way to see the fault that was reported. The header's search strip is
 * `fixed` at the foot of the header; the community's own row of pills is
 * `sticky` at the same offset (--community-top), so the strip landed on top
 * of the community's nav and nothing under it could be read or tapped.
 *
 * `#path=` picks the page, so the same bundle draws a community and, as a
 * control, Explore, where the strip belongs. scripts/check-community-header.mjs
 * drives it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { ShellFrame } from "@/components/community/member/shell-frame"
import { allowedActions } from "@/lib/communities/permissions"
import type { ViewerView } from "@/lib/communities/types"
import type { ShellCommunity, SpaceView } from "@/components/community/member/view-types"

const params = new URLSearchParams(location.hash.slice(1))
const w = window as unknown as { __nav: { path: string; subs: Set<() => void> }; __who: string }
w.__nav = { path: params.get("path") || "/community/studio-notes", subs: new Set() }
w.__who = "buyer"
try {
  localStorage.clear()
} catch {
  /* no storage: the header starts from nothing, which is what is wanted */
}

const community: ShellCommunity = {
  id: "6f1c2a1e-0000-4000-8000-000000000001",
  slug: "studio-notes",
  name: "Studio Notes",
  tagline: "A working group for independent product designers.",
  logoUrl: null,
  coverUrl: null,
  memberCount: 1284,
  postCount: 3412,
  classroomEnabled: true,
  eventsEnabled: true,
  directoryEnabled: true,
  chatEnabled: true,
  gamificationEnabled: true,
  archived: false,
}

const viewer: ViewerView = {
  userId: "u-me",
  signedIn: true,
  role: "member",
  status: "active",
  active: true,
  tierId: null,
  level: 3,
  points: 84,
  isOwner: false,
  isCreatorAccount: false,
  mutedUntil: null,
  can: allowedActions("member"),
}

const spaces: SpaceView[] = [
  { id: "s-general", slug: "general", name: "General", description: "Anything about the work.", icon: "messages-square", kind: "feed", canPost: true, commentsEnabled: true, unread: 0 },
  { id: "s-ann", slug: "announcements", name: "Announcements", description: null, icon: "megaphone", kind: "announcements", canPost: false, commentsEnabled: true, unread: 0 },
  { id: "s-chat", slug: "lounge", name: "Lounge", description: "Live chat.", icon: null, kind: "chat", canPost: true, commentsEnabled: true, unread: 4 },
]

/* Tall enough that the page scrolls, which is when a sticky row has to hold. */
const Posts = () => (
  <div className="space-y-3 py-4">
    {Array.from({ length: 12 }, (_, i) => (
      <article key={i} className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <p className="text-[14px] font-medium text-[#1a1a2e]">A note from the studio, number {i + 1}</p>
        <p className="mt-1 text-[13px] leading-5 text-[#6b7280]">
          Something somebody posted in the General space, long enough to take a line or two of its own.
        </p>
      </article>
    ))}
  </div>
)

const community_page = w.__nav.path.startsWith("/community/")

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <PlatformHeaderClient />
    {community_page ? (
      <ShellFrame community={community} viewer={viewer} spaces={spaces} unreadNotifications={2}>
        <Posts />
      </ShellFrame>
    ) : (
      <main className="mx-auto max-w-[1400px] px-4">
        <Posts />
      </main>
    )}
  </LocaleProvider>,
)
