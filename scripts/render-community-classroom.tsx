/**
 * The classroom, a course, events and the video player of a community, for
 * scripts/check-community-classroom.mjs: the real components with fixture
 * props, inside a stand in for the member shell's main column (the shell
 * itself is the member layout's). The case is the query string:
 *
 *   ?classroom  ?locked  ?course  ?events  ?event  ?event-later
 *   ?event-place  ?event-past  ?event-locked  ?empty
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ClassroomLibrary } from "@/components/community/classroom/classroom-library"
import { CommunityCoursePlayer, LockedCourse } from "@/components/community/classroom/community-course"
import type { ClassroomCourse } from "@/components/community/classroom/model"
import { EventsPage } from "@/components/community/events/events-page"
import { EventDetail } from "@/components/community/events/event-detail"
import type { EventCardView, EventDetailView } from "@/components/community/events/model"
import type { PlayerData } from "@/lib/courses/types"

const COMMUNITY = "8d0f3c52-5b8a-4a0e-9a57-3f0c6d1e2a11"
const HOUR = 3_600_000
const DAY = 24 * HOUR
const at = (ms: number) => new Date(Math.round((Date.now() + ms) / (15 * 60_000)) * 15 * 60_000).toISOString()

function cover(title: string, bg: string, fg = "#ffffff"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="${bg}"/><circle cx="560" cy="70" r="140" fill="${fg}" opacity="0.07"/><text x="40" y="290" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="700" fill="${fg}">${title}</text><text x="40" y="232" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="600" fill="${fg}" opacity="0.7">MAKERS CLASSROOM</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const courses: ClassroomCourse[] = [
  { productId: "c1", title: "Start here: your first 30 days", coverUrl: cover("First 30 days", "#1f2a37"), lessons: 12, completedLessons: 7, percent: 58, status: "in_progress", totalSeconds: 2 * 3600 + 640, locked: null, href: "/community/makers/classroom/c1?lesson=l7" },
  { productId: "c2", title: "Pricing your work without guessing", coverUrl: cover("Pricing", "#e8e3d9", "#1a1a2e"), lessons: 8, completedLessons: 8, percent: 100, status: "completed", totalSeconds: 5400, locked: null, href: "/community/makers/classroom/c2" },
  { productId: "c3", title: "Selling to studios and agencies", coverUrl: cover("Studios", "#2f3e46"), lessons: 15, completedLessons: 0, percent: 0, status: "not_started", totalSeconds: 4 * 3600, locked: { reason: "tier", label: "Pro members", opensAt: null }, href: "/community/makers/classroom/c3" },
  { productId: "c4", title: "The weekly review", coverUrl: cover("Weekly review", "#d8e2dc", "#1a1a2e"), lessons: 5, completedLessons: 0, percent: 0, status: "not_started", totalSeconds: 1500, locked: { reason: "drip", label: "Opens on Oct 14", opensAt: at(11 * DAY) }, href: "/community/makers/classroom/c4" },
  { productId: "c5", title: "Advanced portfolio critique", coverUrl: null, lessons: 6, completedLessons: 0, percent: 0, status: "not_started", totalSeconds: 0, locked: { reason: "level", label: "Level 3", opensAt: null }, href: "/community/makers/classroom/c5" },
  { productId: "c6", title: "Client onboarding kit", coverUrl: cover("Onboarding", "#5c4b51"), lessons: 4, completedLessons: 0, percent: 0, status: "not_started", totalSeconds: 1260, locked: null, href: "/community/makers/classroom/c6" },
]

const player: PlayerData = {
  productId: "c1",
  courseId: "k1",
  title: "Start here: your first 30 days",
  thumbnailUrl: courses[0].coverUrl,
  productHref: null,
  creator: { name: "Mara Lindqvist", avatarUrl: null, storeHref: "/mara" },
  modules: [
    {
      id: "m1",
      title: "Week one",
      lessons: [
        { id: "l1", moduleId: "m1", title: "Welcome and how this works", durationSeconds: 240, isPreview: false, kind: "text", notes: "Read this first. It takes four minutes.", attachments: [], hasCaptions: false, locked: false },
        { id: "l2", moduleId: "m1", title: "Set up your workspace", durationSeconds: 610, isPreview: false, kind: "text", notes: null, attachments: [], hasCaptions: false, locked: false },
      ],
    },
    {
      id: "m2",
      title: "Week two",
      lessons: [{ id: "l7", moduleId: "m2", title: "Your first outreach list", durationSeconds: 900, isPreview: false, kind: "text", notes: "Write ten names. Then write ten more.", attachments: [], hasCaptions: false, locked: false }],
    },
  ],
  progress: [{ lessonId: "l1", completedAt: at(-3 * DAY), positionSeconds: 240, durationSeconds: 240, updatedAt: at(-3 * DAY) }],
  initialLessonId: "l7",
  access: "owner",
  emailsOff: false,
}

function card(id: string, over: Partial<EventCardView>): EventCardView {
  return {
    id,
    title: "Event",
    coverUrl: null,
    kind: "online",
    startsAt: at(DAY),
    endsAt: at(DAY + HOUR),
    timezone: "Europe/London",
    location: null,
    online: true,
    capacity: null,
    goingCount: 0,
    cancelled: false,
    myRsvp: null,
    locked: null,
    hasReplay: false,
    href: `/community/makers/events/${id}`,
    ...over,
  }
}

const upcoming: EventCardView[] = [
  card("e1", { title: "Office hours: bring your pricing questions", startsAt: at(10 * 60_000), endsAt: at(70 * 60_000), goingCount: 23, myRsvp: "going", coverUrl: cover("Office hours", "#1f2a37") }),
  card("e2", { title: "Portfolio review night", kind: "workshop", startsAt: at(2 * DAY + 3 * HOUR), endsAt: at(2 * DAY + 5 * HOUR), goingCount: 12, capacity: 12, myRsvp: "waitlist" }),
  card("e3", { title: "Studio meetup in Lisbon", kind: "meetup", online: false, location: "Rua das Flores 28, Lisbon", startsAt: at(6 * DAY), endsAt: null, goingCount: 7, capacity: 30, coverUrl: cover("Lisbon", "#d8e2dc", "#1a1a2e") }),
  card("e4", { title: "Pro AMA with a creative director", kind: "ama", startsAt: at(9 * DAY), locked: { reason: "tier", label: "Pro members", opensAt: null } }),
  card("e5", { title: "Monthly planning session", startsAt: at(13 * DAY), cancelled: true }),
]
const past: EventCardView[] = [card("p1", { title: "Pricing teardown, live", startsAt: at(-5 * DAY), endsAt: at(-5 * DAY + HOUR), hasReplay: true })]

function detail(over: Partial<EventDetailView>): EventDetailView {
  const base = upcoming[0]
  return {
    ...base,
    description:
      "<p>An open hour for questions about pricing, proposals and the awkward money conversations. Bring a real number you are unsure about.</p><p>We record it, and the replay goes up here afterwards.</p><ul><li>Bring one question</li><li>Cameras optional</li></ul>",
    host: { name: "Mara Lindqvist", avatarUrl: null },
    meetingUrl: "https://zoom.us/j/1234567890",
    livestreamUrl: null,
    joinOpensAt: at(-5 * 60_000),
    replayVideoId: null,
    communityId: COMMUNITY,
    communityName: "Makers",
    attendees: [
      { name: "Ana Souza", avatarUrl: null },
      { name: "Ben Ito", avatarUrl: null },
      { name: "Chloe Park", avatarUrl: null },
      { name: "Dev Patel", avatarUrl: null },
      { name: "Eli Moss", avatarUrl: null },
    ],
    googleUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
    icsUrl: `/api/community/${COMMUNITY}/events/e1/ics`,
    pageUrl: "https://storelib.com/community/makers/events/e1",
    ...over,
  }
}

const which = location.search.slice(1) || "classroom"
let body: React.ReactNode = null
switch (which) {
  case "classroom":
    body = <ClassroomLibrary courses={courses} timeZone="UTC" />
    break
  case "empty":
    body = <ClassroomLibrary courses={[]} />
    break
  case "locked":
    body = <LockedCourse course={courses[2]} classroomHref="/community/makers/classroom" aboutHref="/community/makers/about" timeZone="UTC" />
    break
  case "course":
    body = <CommunityCoursePlayer data={player} classroomHref="/community/makers/classroom" />
    break
  case "events":
    body = <EventsPage communityId={COMMUNITY} initial={{ events: upcoming, nextCursor: "next" }} month={{ year: new Date().getUTCFullYear(), month: new Date().getUTCMonth(), events: [...upcoming, ...past] }} fallbackZone="Europe/London" />
    break
  case "event":
    body = <EventDetail event={detail({})} eventsHref="/community/makers/events" aboutHref="/community/makers/about" />
    break
  case "event-later":
    body = (
      <EventDetail
        event={detail({ ...card("e6", { title: "Critique circle: landing pages", kind: "workshop", startsAt: at(3 * DAY), endsAt: at(3 * DAY + 90 * 60_000), goingCount: 7, capacity: 40 }), meetingUrl: null, joinOpensAt: at(3 * DAY - 15 * 60_000) })}
        eventsHref="/community/makers/events"
        aboutHref="/community/makers/about"
      />
    )
    break
  case "event-place":
    body = <EventDetail event={detail({ ...upcoming[2], meetingUrl: null, joinOpensAt: null, myRsvp: null })} eventsHref="/community/makers/events" aboutHref="/community/makers/about" />
    break
  case "event-past":
    body = <EventDetail event={detail({ ...past[0], meetingUrl: null, joinOpensAt: null, replayVideoId: "v1", coverUrl: cover("Pricing teardown", "#1f2a37"), attendees: [] })} eventsHref="/community/makers/events" aboutHref="/community/makers/about" />
    break
  case "event-locked":
    body = <EventDetail event={detail({ ...upcoming[3], meetingUrl: null, joinOpensAt: null, attendees: [] })} eventsHref="/community/makers/events" aboutHref="/community/makers/about" />
    break
}

createRoot(document.getElementById("app")!).render(
  <div className="min-h-screen bg-[#f8f9fa]" data-probe-case={which}>
    <main className="mx-auto w-full max-w-[1040px] px-4 py-5 sm:px-6 lg:py-8">{body}</main>
  </div>,
)
