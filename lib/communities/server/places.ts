import "server-only"

/**
 * ===========================================================================
 *  ONE LOADER PER PLACE (round 15)
 * ===========================================================================
 * What every place in a community needs for its first screen, read once,
 * here, and used by BOTH the place's server page (a reload, a shared link,
 * a first visit: app/(marketing)/community/[slug]/(member)/<place>/page.tsx
 * hands it to the shell) and the JSON place route the shell asks when a
 * member moves there (GET /api/community/<id>/place?p=<place>). The two can
 * never disagree, because there is one function.
 *
 * Who may see what is decided here as it was on each page: the community and
 * the viewer are already checked by the caller (memberPage for a page,
 * requireMember for the route); a place that is switched off (Learn, the
 * Calendar, the directory, points) or a program, event or space that is not
 * this community's is a 404, never another community's row.
 *
 * Everything returned is plain data, safe to hand to the browser.
 */
import { can } from "@/lib/communities/permissions"
import type { Viewer } from "@/lib/communities/server/context"
import { viewerView } from "@/lib/communities/server/context"
import type { Db } from "@/lib/communities/server/db"
import { listFeed, listSaved } from "@/lib/communities/server/feed"
import { listMessages } from "@/lib/communities/server/chat"
import { findProgram, listPrograms, programCard, programOutline, programPlayer } from "@/lib/communities/server/learn"
import { eventDetail, isEventId, listEvents, monthEvents } from "@/lib/communities/server/events"
import { authorViews, leaderboardRows, levelNames, listMembers, locationsReady } from "@/lib/communities/server/directory"
import { leaderboard } from "@/lib/communities/server/points"
import { listNotifications } from "@/lib/communities/server/mentions"
import { loadSalesPage } from "@/lib/communities/server/public"
import { aboutExtras } from "@/lib/communities/server/about"
import { leaveReasonsReady } from "@/lib/communities/server/leave-reasons"
import { dmFromOf } from "@/lib/communities/server/message-privacy"
import { eventHrefFor } from "@/lib/communities/server/wall"
import { loadCoursePlayer } from "@/lib/courses/load"
import { loadMemberProfile } from "@/lib/communities/server/member-profile"
import { isUuid } from "@/lib/courses/access"
import { learnHref } from "@/lib/communities/learn"
import type { CommunityRow } from "@/lib/communities/types"
import { fileProductFor, meOf, onboardingFor, shellData } from "@/components/community/member/data"
import type { MembershipFacts } from "@/components/community/member/membership"
import type { Place } from "@/lib/communities/client/places"
import type { PlaceData } from "@/lib/communities/client/place-data"

export type PlaceLoad = { ok: true; place: Place; data: PlaceData } | { ok: false; status: 404; error: "not_found" | "off" }

const missing: PlaceLoad = { ok: false, status: 404, error: "not_found" }
const off: PlaceLoad = { ok: false, status: 404, error: "off" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What the composer needs, the same on All, a space and Saved. */
async function composeFor(db: Db, community: CommunityRow, viewer: Viewer) {
  if (!viewer.userId) return null
  const [me, fileProductId] = await Promise.all([meOf(community.id, viewer), fileProductFor(community, viewer)])
  return { userId: viewer.userId, me, fileProductId, eventHref: eventHrefFor(community, viewer) }
}

/**
 * The first screen of `place` in `community`, for `viewer` (an active member: the caller checked). `opts.lesson` is the
 * lesson a program opens on (?lesson=), the only part of a place's address that is not the place itself.
 */
export async function loadPlace(db: Db, community: CommunityRow, viewer: Viewer, place: Place, opts: { lesson?: string | null } = {}): Promise<PlaceLoad> {
  const ok = (data: PlaceData): PlaceLoad => ({ ok: true, place, data })
  const manageLearn = can(viewer.role, "manage_classroom", viewer.perms) ? `/app/community/${community.slug}/learn` : null
  switch (place.kind) {
    case "feed":
    case "saved":
    case "space": {
      const shell = await shellData(community.id, viewer, community)
      const readOnly = shell.community.archived || !!viewer.mutedUntil
      if (place.kind === "space") {
        const space = shell.spaces.find((s) => s.slug === place.slug.toLowerCase())
        const row = space ? shell.rows.find((r) => r.id === space.id) : null
        if (!space || !row) return missing
        if (space.kind === "chat") {
          const first = await listMessages(db, community, viewer, row, {})
          return ok({ kind: "chat", space, spaces: shell.spaces, viewer: viewerView(viewer), first, readOnly: readOnly || !space.canPost })
        }
        const [feed, compose] = await Promise.all([listFeed(db, community, viewer, { sort: "default", spaceId: space.id }), composeFor(db, community, viewer)])
        return ok({ kind: "feed", start: { kind: "space", id: space.id }, spaces: shell.spaces, viewer: viewerView(viewer), initial: feed, servedAt: Date.now(), readOnly, onboarding: null, compose })
      }
      if (place.kind === "saved") {
        const [saved, compose] = await Promise.all([listSaved(db, community, viewer, null), composeFor(db, community, viewer)])
        return ok({ kind: "feed", start: { kind: "saved" }, spaces: shell.spaces, viewer: viewerView(viewer), initial: { pinned: [], posts: saved.posts, nextCursor: saved.nextCursor }, servedAt: Date.now(), readOnly, onboarding: null, compose })
      }
      const [feed, compose] = await Promise.all([listFeed(db, community, viewer, { sort: "default" }), composeFor(db, community, viewer)])
      return ok({ kind: "feed", start: { kind: "all" }, spaces: shell.spaces, viewer: viewerView(viewer), initial: feed, servedAt: Date.now(), readOnly, onboarding: onboardingFor(community, viewer, shell.spaces), compose })
    }
    case "learn": {
      if (!community.classroom_enabled) return off
      const programs = await listPrograms(db, community, viewer)
      return ok({ kind: "learn", programs, manageHref: manageLearn })
    }
    case "program": {
      if (!community.classroom_enabled) return off
      if (!isUuid(place.id) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(place.id)) return missing
      const back = learnHref(community.slug)
      const [card, row] = await Promise.all([programCard(db, community, viewer, place.id), findProgram(db, community.id, place.id)])
      if (!card || !row) return missing
      if (card.locked) {
        const outline = await programOutline(db, row)
        return ok({ kind: "program", mode: "locked", program: card, outline, learnHref: back, aboutHref: `/community/${community.slug}/about`, communityId: community.id, communityName: community.name, levelsHref: community.gamification_enabled ? `/community/${community.slug}/leaderboard` : null })
      }
      const asked = typeof opts.lesson === "string" && opts.lesson ? opts.lesson : null
      if (row.productId) {
        const load = await loadCoursePlayer(db, viewer.userId, row.productId, asked)
        if (load.state !== "ok") return missing
        return ok({ kind: "program", mode: "player", data: load.data, learnHref: back })
      }
      const data = await programPlayer(db, community, viewer, row, asked)
      if (!data) return ok({ kind: "program", mode: "empty", program: card, learnHref: back, manageHref: manageLearn })
      return ok({ kind: "program", mode: "player", data, learnHref: back })
    }
    case "calendar": {
      if (!community.events_enabled) return off
      const now = new Date()
      const year = now.getUTCFullYear()
      const month = now.getUTCMonth()
      const [upcoming, monthList] = await Promise.all([listEvents(db, community, viewer, { when: "upcoming" }), monthEvents(db, community, viewer, year, month)])
      const fallbackZone = upcoming.events[0]?.timezone || monthList[0]?.timezone || "UTC"
      return ok({ kind: "calendar", communityId: community.id, initial: upcoming, month: { year, month, events: monthList }, fallbackZone, manageHref: eventHrefFor(community, viewer) })
    }
    case "event": {
      if (!community.events_enabled) return off
      if (!isEventId(place.id)) return missing
      const event = await eventDetail(db, community, viewer, place.id)
      if (!event) return missing
      return ok({ kind: "event", event, eventsHref: `/community/${community.slug}/events`, aboutHref: `/community/${community.slug}/about` })
    }
    case "members": {
      if (!community.directory_enabled && !can(viewer.role, "manage_members", viewer.perms)) return off
      const [first, byCountry] = await Promise.all([listMembers(db, community.id, {}), locationsReady(db)])
      return ok({ kind: "members", communityId: community.id, slug: community.slug, memberCount: community.member_count, initial: first, meId: viewer.userId, canMessage: community.chat_enabled, countryFilter: byCountry })
    }
    case "leaderboard": {
      if (!community.gamification_enabled) return off
      const [entries, names] = await Promise.all([leaderboard(db, community.id, "30d", 25).then((e) => leaderboardRows(db, community.id, e)), levelNames(db, community.id)])
      const levels = [...names.entries()].sort((a, b) => a[0] - b[0]).map(([level, name]) => ({ level, name }))
      return ok({ kind: "leaderboard", communityId: community.id, slug: community.slug, initial: entries, me: { userId: viewer.userId, points: viewer.points, level: viewer.level }, levels })
    }
    case "about": {
      const load = await loadSalesPage(community.slug, viewer.userId, db)
      if (!load) return missing
      const [extras, askWhy] = await Promise.all([aboutExtras(db, load.community), load.data.join.canLeave ? leaveReasonsReady(db) : Promise.resolve(false)])
      return ok({ kind: "about", sales: { ...load.data, extras, askWhy } })
    }
    case "notifications": {
      if (!viewer.userId) return missing
      const first = await listNotifications(db, community, viewer.userId, null)
      return ok({ kind: "notifications", communityId: community.id, slug: community.slug, userId: viewer.userId, initial: first, notifyLevel: viewer.member?.notify_level ?? "important" })
    }
    case "membership": {
      if (!viewer.userId) return missing
      const [load, askWhy, dmFrom] = await Promise.all([
        loadSalesPage(community.slug, viewer.userId, db, { light: true }),
        leaveReasonsReady(db),
        /* Their own choice about who may message them: its own small read, the default before run-now part 223. */
        dmFromOf(db, community.id, viewer.userId),
      ])
      if (!load) return missing
      const m = viewer.member
      const facts: MembershipFacts = {
        role: viewer.isOwner ? "owner" : (m?.role ?? "member"),
        source: m?.source ?? null,
        joinedAt: m?.joined_at ?? m?.created_at ?? null,
        expiresAt: m?.expires_at ?? null,
        planName: load.data.join.option && m?.tier_id && load.data.join.option.tierId === m.tier_id ? load.data.join.option.name : (load.data.community.options.find((o) => o.tierId && o.tierId === m?.tier_id)?.name ?? null),
        notifyLevel: m?.notify_level ?? "important",
        dmFrom,
      }
      return ok({ kind: "membership", community: load.data.community, join: load.data.join, askWhy: askWhy && load.data.join.canLeave, facts })
    }
    case "profile": {
      const ref = await profileRef(db, community, viewer, place.ref)
      if (!ref) return missing
      /* The place as the member's address keeps it: an old link's user id becomes the handle. */
      return { ok: true, place: { kind: "profile", ref }, data: { kind: "profile", ref, data: await loadProfileData(db, community, viewer, ref) } }
    }
  }
}

/**
 * A profile's reference as the place keeps it: "me", or a handle. An old /members/<id> link carries a user id, which is
 * read back to that member's handle here (only somebody in this community), so the address the member sees is the
 * owner's ?profile=<handle>.
 */
export async function profileRef(db: Db, community: CommunityRow, viewer: Viewer, ref: string): Promise<string | null> {
  const r = ref.toLowerCase()
  if (r === "me") return "me"
  if (!UUID.test(r)) return r
  if (r === viewer.userId) return "me"
  const person = (await authorViews(db, community.id, [r])).get(r)
  return person?.username ? person.username.toLowerCase() : null
}

/* Worker R's loader (lib/communities/server/member-profile.ts): the head, the first page of posts, my activity on my own. */
async function loadProfileData(db: Db, community: CommunityRow, viewer: Viewer, ref: string) {
  return loadMemberProfile(db, community, viewer, ref)
}
