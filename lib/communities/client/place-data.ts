/**
 * WHAT A PLACE'S FIRST SCREEN IS, AS DATA (round 15). The one loader per place
 * (lib/communities/server/places.ts loadPlace) returns one of these, for its
 * server page and for the JSON place route alike, and the shell draws the
 * place from it (components/community/member/place-views.tsx). Types only:
 * each shape is the props of the screen that draws it, so the two cannot
 * drift apart.
 */
import type { ComponentProps } from "react"
import type { CommunityFeed } from "@/components/community/member/feed"
import type { ChatView } from "@/components/community/member/chat"
import type { LearnLibrary } from "@/components/community/learn/learn-library"
import type { EmptyProgram, LockedProgram, ProgramPlayer } from "@/components/community/learn/program-page"
import type { EventsPage } from "@/components/community/events/events-page"
import type { LibraryItemData, LibraryShelfData } from "@/components/community/library/model"
import type { EventDetail } from "@/components/community/events/event-detail"
import type { MembersDirectory } from "@/components/community/member/members"
import type { Leaderboard } from "@/components/community/member/leaderboard"
import type { NotificationsList } from "@/components/community/member/notifications"
import type { MembershipPage } from "@/components/community/member/membership"
import type { SalesPageData } from "@/components/community/public/types"
import type { SpaceView } from "@/components/community/member/view-types"
import type { ViewerView } from "@/lib/communities/types"
import type { MemberProfileData } from "@/lib/communities/member-profile-view"

type FeedProps = ComponentProps<typeof CommunityFeed>
type ChatProps = ComponentProps<typeof ChatView>

export type PlaceData =
  | ({ kind: "feed" } & Required<Pick<FeedProps, "start" | "initial" | "servedAt" | "readOnly">> & { spaces: SpaceView[]; viewer: ViewerView; onboarding: FeedProps["onboarding"]; compose: FeedProps["compose"] })
  | { kind: "chat"; space: SpaceView; spaces: SpaceView[]; viewer: ViewerView; first: ChatProps["initial"]; readOnly: boolean; intro?: ChatProps["intro"]; /** Round 38: the Chat tab's main channel when the community shows the tab; its chips are the chat channels only, the main one first. */ chatTab?: string | null }
  | ({ kind: "learn" } & Pick<ComponentProps<typeof LearnLibrary>, "programs" | "manageHref">)
  | ({ kind: "program"; mode: "locked" } & ComponentProps<typeof LockedProgram>)
  | ({ kind: "program"; mode: "player" } & ComponentProps<typeof ProgramPlayer>)
  | ({ kind: "program"; mode: "empty" } & ComponentProps<typeof EmptyProgram>)
  /* Round 39: the Library and one item in it (components/community/library). */
  | { kind: "library"; shelf: LibraryShelfData }
  | { kind: "resource"; page: LibraryItemData }
  | ({ kind: "calendar" } & ComponentProps<typeof EventsPage>)
  | ({ kind: "event" } & ComponentProps<typeof EventDetail>)
  | ({ kind: "members" } & ComponentProps<typeof MembersDirectory>)
  | ({ kind: "leaderboard" } & ComponentProps<typeof Leaderboard>)
  | { kind: "about"; sales: SalesPageData }
  | ({ kind: "notifications" } & ComponentProps<typeof NotificationsList>)
  | ({ kind: "membership" } & ComponentProps<typeof MembershipPage>)
  | { kind: "profile"; ref: string; data: MemberProfileData | null }

/** What the JSON place route answers. */
export type PlaceAnswer = { ok: true; key: string; data: PlaceData } | { ok: false; error: string }
