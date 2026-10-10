/**
 * A program's lesson inside a community, for scripts/check-learn18.mjs: the real ProgramPlayer
 * (components/community/learn/program-page.tsx, the course player embedded) with fixture lessons of every kind, inside a
 * stand in for the community's frame at the width the lesson page has there (shell-frame.tsx: the 1360px frame, the
 * middle across both columns). The bar on top is a grey block of the bar's real height. The probe answers the play and
 * progress routes, serves a real video and a stand in for a YouTube embed, and draws the program's cover in a loud
 * colour so a frame that shows it is easy to see.
 *
 * window.__MODE = "flow" draws Learn's shelf in the community's real navigator and place host instead, so a program can
 * be opened from its card and left by its arrow the way a member does it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ProgramPlayer } from "@/components/community/learn/program-page"
import type { PlayerData, PlayerLesson } from "@/lib/courses/types"
import type { ProgramCard } from "@/components/community/learn/model"
import { PlaceSeed, usePlaceScreens } from "@/components/community/member/place-host"
import { CommunityNavigatorProvider, useCommunityNavigator, type NavigatorHooks } from "@/lib/communities/client/navigator-context"
import { placeFromUrl, placeKey } from "@/lib/communities/client/places"
import type { PlaceData } from "@/lib/communities/client/place-data"

const lesson = (id: string, moduleId: string, title: string, kind: PlayerLesson["kind"], extra: Partial<PlayerLesson> = {}): PlayerLesson => ({
  id,
  moduleId,
  title,
  durationSeconds: kind === "text" ? null : 60,
  isPreview: false,
  kind,
  notes: null,
  attachments: [],
  hasCaptions: false,
  locked: false,
  ...extra,
})

const L = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`

const NOTES =
  "Before the first pull, wedge the clay until a cut face shows no air at all. Twenty turns is usually enough.\n\nKeep your elbows on your knees and let the wheel do the work. If the clay wobbles, slow the wheel down before you add pressure, never after.\n\nThe tools I use are in the list below. https://example.com/tools"

const PLAYER: PlayerData = {
  productId: "prog-1",
  courseId: "course-1",
  title: "Wheel throwing, from clay to cup",
  thumbnailUrl: "/__img/cover.svg",
  productHref: null,
  creator: { name: "Salajan Wood", avatarUrl: null, storeHref: null },
  modules: [
    {
      id: "m1",
      title: "Clay and the wheel",
      lessons: [
        lesson(L(1), "m1", "Lesson 1", "video", { notes: NOTES, attachments: [{ id: "a1", name: "Tool list.pdf", size: 184_000 }] }),
        lesson(L(2), "m1", "Centering, slowly", "video", { notes: "Centering is most of throwing. Take your time with this one." }),
        lesson(L(3), "m1", "Opening the form", "external", { notes: "Watch the whole thing once before you try it." }),
        lesson(L(4), "m1", "A reading list", "text", { notes: NOTES + "\n\n" + NOTES }),
      ],
    },
    {
      id: "m2",
      title: "Trimming",
      lessons: [lesson(L(5), "m2", "Leather hard, explained", "video"), lesson(L(6), "m2", "Feet that look right", "video"), lesson(L(7), "m2", "Your first set of four cups", "video", { durationSeconds: 1265 })],
    },
  ],
  progress: [{ lessonId: L(5), completedAt: "2026-09-20T10:00:00Z", positionSeconds: 60, durationSeconds: 60, updatedAt: null }],
  initialLessonId: L(1),
  access: "owner",
  emailsOff: false,
  contact: false,
}

function Frame({ children }: { children: React.ReactNode }) {
  /* The community's frame around the lesson page (shell-frame.tsx), with the bar as a block of its height. */
  return (
    <div data-community-shell="" className="min-h-svh bg-[#f8f9fa] text-[#1a1a2e] [--community-top:99px] lg:[--community-top:65px]">
      <div className="sticky top-0 z-30 h-[99px] border-b border-[#e8eaee] bg-white lg:h-[65px]" data-probe-bar="" />
      <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8">
        <div data-community-place="lesson" className="pb-16 pt-4 lg:pt-6">
          <div className="min-w-0" data-community-main="">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── The way into a program and back: the community's real navigator and place host, over a Learn shelf ── */

const COMMUNITY = "c0ffee00-0000-4000-8000-000000000001"
const SLUG = "salajanywood"
const card = (n: number, title: string): ProgramCard => ({
  id: `prog-${n}`,
  kind: "program",
  title,
  summary: null,
  coverUrl: "/__img/cover.svg",
  lessons: 7,
  completedLessons: 1,
  percent: 14,
  status: "in_progress",
  totalSeconds: 1560,
  draft: false,
  mode: "free",
  priceLabel: null,
  owned: false,
  locked: null,
  href: `/community/${SLUG}/learn/prog-${n}`,
})
const SHELF = [card(1, PLAYER.title), card(2, "Glazes you can trust"), card(3, "Trimming feet"), card(4, "Pricing your work"), card(5, "Kiln loading"), card(6, "Photographing pots")]
const LEARN_DATA = { kind: "learn", programs: SHELF, manageHref: null } as unknown as PlaceData

/** The frame's link catching (shell-frame.tsx A LINK TO A PLACE IN THIS COMMUNITY IS A MOVE), the part this probe needs. */
function Links() {
  const nav = useCommunityNavigator()
  const navRef = React.useRef(nav)
  navRef.current = nav
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || a.dataset.nativeNav !== undefined) return
      const url = new URL(a.href, location.href)
      const p = placeFromUrl(url.pathname, url.search)
      if (!p) return
      const here = placeFromUrl(location.pathname, location.search)
      if (here && placeKey(here) === placeKey(p)) return
      e.preventDefault()
      navRef.current.go(p)
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [])
  return null
}

function Host({ hooksRef }: { hooksRef: React.MutableRefObject<NavigatorHooks> }) {
  const screens = usePlaceScreens({
    communityId: COMMUNITY,
    slug: SLUG,
    chatSpaces: [],
    entries: [{ key: "classroom" }],
    children: <PlaceSeed communityId={COMMUNITY} slug={SLUG} place={{ kind: "learn" }} data={LEARN_DATA} />,
  })
  hooksRef.current = screens.hooks
  return <>{screens.middle}</>
}

function Flow() {
  const hooksRef = React.useRef<NavigatorHooks>({})
  const hooks = React.useMemo<NavigatorHooks>(
    () => ({
      beforeGo: (from, to, opts) => hooksRef.current.beforeGo?.(from, to, opts),
      prefetch: (p) => hooksRef.current.prefetch?.(p),
      refresh: (p) => hooksRef.current.refresh?.(p) ?? Promise.resolve(),
    }),
    [],
  )
  return (
    <CommunityNavigatorProvider slug={SLUG} initial={{ kind: "learn" }} hooks={hooks}>
      <Links />
      <Frame>
        <Host hooksRef={hooksRef} />
      </Frame>
    </CommunityNavigatorProvider>
  )
}

const mode = (window as unknown as { __MODE?: string }).__MODE ?? "player"
;(window as unknown as { __PROGRAM?: unknown }).__PROGRAM = { kind: "program", mode: "player", data: PLAYER, learnHref: `/community/${SLUG}/learn` }

createRoot(document.getElementById("app")!).render(
  mode === "flow" ? (
    <Flow />
  ) : (
    <Frame>
      <ProgramPlayer data={PLAYER} learnHref="/community/salajanywood/learn" />
    </Frame>
  ),
)
