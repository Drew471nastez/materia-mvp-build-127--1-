"use client"

/**
 * ===========================================================================
 *  A PLACE, DRAWN FROM ITS DATA (round 15)
 * ===========================================================================
 * The one switch from a place's first screen as data (lib/communities/client/
 * place-data.ts, read by lib/communities/server/places.ts) to the real screen
 * that draws it: the feed, a chat space, Learn, a program, the Calendar, an
 * event, Members, the Leaderboard, About, Notifications, Membership, a
 * profile. The place host (place-host.tsx) draws a place through here, and
 * so does a place's own server page (place-seed.tsx), so a reload and a move
 * inside the community draw the same thing.
 *
 * THE FEED COMES WITH THE SHELL; everything else is its own chunk, loaded
 * with the shell's first idle moment (preloadPlaceViews), and a place's code
 * is asked for on the tap that goes there (preloadPlaceView), beside its
 * data, so the frame's first paint does not wait for code the member may
 * never open and a move never waits for it after its data.
 *
 * NOT next/dynamic, NOT React.lazy (measured in scripts/check-community-
 * shell15.mjs). Both suspend on a screen's first mount even when its code is
 * already loaded, and React then holds the reveal for up to 300ms: a place
 * read ahead still showed its waiting screen for a quarter of a second. A
 * preloadable view (below) draws at once when its code is here, and only
 * suspends when it truly is not. Each screen sits in its own Suspense with
 * the place's waiting screen, so code that is late shows the waiting screen
 * in the frame, never a blank.
 */
import { Suspense, use, type ComponentType } from "react"
import type { PlaceData } from "@/lib/communities/client/place-data"
import type { Place } from "@/lib/communities/client/places"
import { withChunkRecovery } from "@/lib/communities/client/resume"
import { CommunityFeed } from "./feed"
import { PlaceLoading, PlaceSpinner } from "./place-spinner"
import { SpaceChips } from "./space-chips"
import { adminHref } from "./edit-hint"
import { chatTabChannels } from "@/lib/communities/chat-rules"

/**
 * A view whose code is its own chunk, drawn synchronously once that code is here. `preload` asks for it (once, with the
 * retry and the one hard navigation of lib/communities/client/resume.ts); before it arrives the view suspends into its
 * place's waiting screen.
 */
function preloadable<P extends object>(load: () => Promise<ComponentType<P>>) {
  let Loaded: ComponentType<P> | null = null
  let asked: Promise<ComponentType<P>> | null = null
  const preload = () =>
    (asked ??= withChunkRecovery(load)().then(
      (c) => (Loaded = c),
      (e) => {
        asked = null
        throw e
      },
    ))
  function View(props: P) {
    const Drawn = Loaded ?? use(preload())
    return <Drawn {...props} />
  }
  return Object.assign(View, { preload })
}

/* A chunk that fails to load is asked once more, then the same address is loaded in full (lib/communities/client/resume.ts). */
const ChatView = preloadable(() => import("./chat").then((m) => m.ChatView))
const LearnLibrary = preloadable(() => import("@/components/community/learn/learn-library").then((m) => m.LearnLibrary))
const ProgramPlayer = preloadable(() => import("@/components/community/learn/program-page").then((m) => m.ProgramPlayer))
const LockedProgram = preloadable(() => import("@/components/community/learn/program-page").then((m) => m.LockedProgram))
const EmptyProgram = preloadable(() => import("@/components/community/learn/program-page").then((m) => m.EmptyProgram))
const EventsPage = preloadable(() => import("@/components/community/events/events-page").then((m) => m.EventsPage))
const EventDetail = preloadable(() => import("@/components/community/events/event-detail").then((m) => m.EventDetail))
const MembersDirectory = preloadable(() => import("./members").then((m) => m.MembersDirectory))
const Leaderboard = preloadable(() => import("./leaderboard").then((m) => m.Leaderboard))
const CommunitySalesPage = preloadable(() => import("@/components/community/public/sales-page").then((m) => m.CommunitySalesPage))
const NotificationsList = preloadable(() => import("./notifications").then((m) => m.NotificationsList))
const MembershipPage = preloadable(() => import("./membership").then((m) => m.MembershipPage))
/** Worker R's profile place (?profile=<handle>, ?profile=me), drawn by the frame with its community and viewer. */
export const MemberProfilePlace = preloadable(() => import("./member-profile").then((m) => m.MemberProfilePlace))

/** Each place's views, for asking ahead. */
const VIEWS: Partial<Record<Place["kind"] | "chat", { preload: () => Promise<unknown> }[]>> = {
  space: [ChatView],
  learn: [LearnLibrary],
  program: [ProgramPlayer, LockedProgram],
  calendar: [EventsPage],
  event: [EventDetail],
  members: [MembersDirectory],
  leaderboard: [Leaderboard],
  about: [CommunitySalesPage],
  notifications: [NotificationsList],
  membership: [MembershipPage],
  profile: [MemberProfilePlace],
}

/** A place's code, asked for on the tap that goes there, beside its data. */
export function preloadPlaceView(place: Place) {
  for (const v of VIEWS[place.kind] ?? []) void v.preload().catch(() => {})
}

let preloaded = false
/** Every place's code, asked for once (the shell's first idle moment), so no move waits for a chunk. */
export function preloadPlaceViews() {
  if (preloaded) return
  preloaded = true
  for (const list of Object.values(VIEWS)) for (const v of list ?? []) void v.preload().catch(() => {})
}

/** The place's own title, as its page draws it, for the waiting screen. */
export function placeTitle(place: Place): string | null {
  switch (place.kind) {
    case "learn":
      return "Learn"
    case "calendar":
      return "Events"
    case "members":
      return "Members"
    case "leaderboard":
      return "Leaderboards"
    case "notifications":
      return "Notifications"
    case "membership":
      return "Membership"
    default:
      return null
  }
}

/** What stands in the frame while a place is on its way (never before WAIT_SCREEN_MS, place-host.tsx). */
export function PlaceWaiting({ place, delay = 0 }: { place: Place; /** The host has already waited 250ms before showing this, so by default it shows at once. */ delay?: number }) {
  const title = placeTitle(place)
  return title ? <PlaceLoading title={title} detail={"\u00a0"} delay={delay} /> : <PlaceSpinner label="Loading" delay={delay} />
}

/** A place's screen from its data. `slug` and `communityId` are the community's. */
export function PlaceView({ data, place, slug, communityId, renderProfile }: { data: PlaceData; place: Place; slug: string; communityId: string; renderProfile?: (ref: string, data: unknown) => React.ReactNode }) {
  return <Suspense fallback={<PlaceWaiting place={place} />}>{draw(data, slug, communityId, renderProfile)}</Suspense>
}

function draw(data: PlaceData, slug: string, communityId: string, renderProfile?: (ref: string, data: unknown) => React.ReactNode): React.ReactNode {
  switch (data.kind) {
    case "feed":
      /* The pull on the feed is the frame's one wrapper (community-pull-refresh.tsx), which tells the feed (feed-live.tsx), on All, a space and Saved alike. */
      return <CommunityFeed communityId={communityId} slug={slug} viewer={data.viewer} spaces={data.spaces} start={data.start} initial={data.initial} servedAt={data.servedAt} readOnly={data.readOnly} onboarding={data.onboarding} compose={data.compose} />
    case "chat": {
      /*
        ROUND 38, THE CHAT TAB. With the tab, a channel is drawn as the community's group chat: its chips are the chat
        channels alone, the main one first, and none at all when there is one channel (one group, as Telegram has it).
      */
      const channels = data.chatTab ? chatTabChannels(data.spaces, data.chatTab) : null
      return (
        <div className="max-w-[760px]">
          {channels ? (
            channels.length > 1 ? <SpaceChips slug={slug} spaces={channels} active={data.space.slug} noAll /> : null
          ) : (
            <SpaceChips slug={slug} spaces={data.spaces} active={data.space.slug} editHref={adminHref(slug, data.viewer, "manage_spaces", "spaces")} />
          )}
          <ChatView communityId={communityId} slug={slug} space={data.space} viewer={data.viewer} initial={data.first} readOnly={data.readOnly} intro={data.intro} />
        </div>
      )
    }
    case "learn":
      return <LearnLibrary programs={data.programs} manageHref={data.manageHref} />
    case "program": {
      if (data.mode === "locked") {
        const { kind: _k, mode: _m, ...props } = data
        return <LockedProgram {...props} />
      }
      if (data.mode === "empty") return <EmptyProgram program={data.program} learnHref={data.learnHref} manageHref={data.manageHref} />
      return <ProgramPlayer data={data.data} learnHref={data.learnHref} />
    }
    case "calendar": {
      const { kind: _k, ...props } = data
      return <EventsPage {...props} />
    }
    case "event":
      return <EventDetail event={data.event} eventsHref={data.eventsHref} aboutHref={data.aboutHref} />
    case "members": {
      const { kind: _k, ...props } = data
      return <MembersDirectory {...props} />
    }
    case "leaderboard": {
      const { kind: _k, ...props } = data
      return <Leaderboard {...props} />
    }
    case "about":
      return <CommunitySalesPage data={data.sales} />
    case "notifications": {
      const { kind: _k, ...props } = data
      return <NotificationsList {...props} />
    }
    case "membership": {
      const { kind: _k, ...props } = data
      return <MembershipPage {...props} />
    }
    case "profile":
      return renderProfile ? renderProfile(data.ref, data.data) : null
  }
}
