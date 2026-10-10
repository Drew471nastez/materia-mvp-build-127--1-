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
 * THE FEED COMES WITH THE SHELL; everything else is its own chunk
 * (next/dynamic), loaded with the shell's first idle moment
 * (preloadPlaceViews), so the frame's first paint does not wait for code
 * the member may never open, and a move later never waits for it either.
 * Each screen sits in its own Suspense with the place's waiting screen, so
 * code that is late shows the waiting screen in the frame, never a blank.
 */
import dynamic from "next/dynamic"
import { Suspense } from "react"
import type { PlaceData } from "@/lib/communities/client/place-data"
import type { Place } from "@/lib/communities/client/places"
import { withChunkRecovery } from "@/lib/communities/client/resume"
import { CommunityFeed } from "./feed"
import { PlaceLoading, PlaceSpinner } from "./place-spinner"
import { SpaceChips } from "./space-chips"

/* Each screen's code, for reading ahead (preloadPlaceViews). The dynamic() calls below name the same imports inline, which is how Next finds a chunk to send with the server's HTML. */
const load = {
  chat: () => import("./chat").then((m) => m.ChatView),
  learn: () => import("@/components/community/learn/learn-library").then((m) => m.LearnLibrary),
  programPlayer: () => import("@/components/community/learn/program-page").then((m) => m.ProgramPlayer),
  programLocked: () => import("@/components/community/learn/program-page").then((m) => m.LockedProgram),
  programEmpty: () => import("@/components/community/learn/program-page").then((m) => m.EmptyProgram),
  calendar: () => import("@/components/community/events/events-page").then((m) => m.EventsPage),
  event: () => import("@/components/community/events/event-detail").then((m) => m.EventDetail),
  members: () => import("./members").then((m) => m.MembersDirectory),
  leaderboard: () => import("./leaderboard").then((m) => m.Leaderboard),
  about: () => import("@/components/community/public/sales-page").then((m) => m.CommunitySalesPage),
  notifications: () => import("./notifications").then((m) => m.NotificationsList),
  membership: () => import("./membership").then((m) => m.MembershipPage),
}

/* A chunk that fails to load is asked once more, then the same address is loaded in full (lib/communities/client/resume.ts). */
const ChatView = dynamic(withChunkRecovery(() => import("./chat").then((m) => m.ChatView)))
const LearnLibrary = dynamic(withChunkRecovery(() => import("@/components/community/learn/learn-library").then((m) => m.LearnLibrary)))
const ProgramPlayer = dynamic(withChunkRecovery(() => import("@/components/community/learn/program-page").then((m) => m.ProgramPlayer)))
const LockedProgram = dynamic(withChunkRecovery(() => import("@/components/community/learn/program-page").then((m) => m.LockedProgram)))
const EmptyProgram = dynamic(withChunkRecovery(() => import("@/components/community/learn/program-page").then((m) => m.EmptyProgram)))
const EventsPage = dynamic(withChunkRecovery(() => import("@/components/community/events/events-page").then((m) => m.EventsPage)))
const EventDetail = dynamic(withChunkRecovery(() => import("@/components/community/events/event-detail").then((m) => m.EventDetail)))
const MembersDirectory = dynamic(withChunkRecovery(() => import("./members").then((m) => m.MembersDirectory)))
const Leaderboard = dynamic(withChunkRecovery(() => import("./leaderboard").then((m) => m.Leaderboard)))
const CommunitySalesPage = dynamic(withChunkRecovery(() => import("@/components/community/public/sales-page").then((m) => m.CommunitySalesPage)))
const NotificationsList = dynamic(withChunkRecovery(() => import("./notifications").then((m) => m.NotificationsList)))
const MembershipPage = dynamic(withChunkRecovery(() => import("./membership").then((m) => m.MembershipPage)))

let preloaded = false
/** Every place's code, asked for once (the shell's first idle moment), so no move waits for a chunk. */
export function preloadPlaceViews() {
  if (preloaded) return
  preloaded = true
  for (const get of Object.values(load)) void get().catch(() => {})
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
export function PlaceWaiting({ place }: { place: Place }) {
  const title = placeTitle(place)
  return title ? <PlaceLoading title={title} detail={" "} /> : <PlaceSpinner label="Loading" />
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
    case "chat":
      return (
        <div className="max-w-[760px]">
          <SpaceChips slug={slug} spaces={data.spaces} active={data.space.slug} />
          <ChatView communityId={communityId} slug={slug} space={data.space} viewer={data.viewer} initial={data.first} readOnly={data.readOnly} />
        </div>
      )
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
