"use client"

/**
 * ===========================================================================
 *  ONE COMMUNITY, FOR THE PEOPLE WHO RUN IT
 * ===========================================================================
 * The frame every section of /app/community/<id> sits in: the bar with the
 * community's logo, name and state, the way back to the list, View page,
 * and Publish while it is a draft; under it the sections, as the
 * memberships screen draws its views (a compact row of tabs, the one you
 * are on filled grey). The tabs stay at the top while the section scrolls;
 * the bar scrolls away with it (round 33). On a phone the tabs scroll
 * sideways and the one you are on is brought into view.
 *
 * Round 33: Page, after Overview, is the community's page (what people see
 * before they join), edited apart from Settings.
 *
 * Which tabs appear is the role's (lib/communities/permissions.ts, handed
 * down as `head.can`, with what the owner lets admins and moderators do):
 * a moderator sees what a moderator can do, nothing that would only answer
 * "forbidden". Round 13 names: Learn (it was Classroom) and Calendar (it was
 * Events); round 31: Posts (it was Feed), the word a business uses for what
 * it manages there. The addresses stay. Points, levels and badges are one of
 * Settings' panels, not a section of their own, so the row stays short.
 *
 * ROUND 31, THE OWNER: "too much loading between them ... they are separate
 * pages, that is what makes them load so much." Each section is still a page
 * of its own on the server (a link, a bookmark and a reload open it there),
 * but moving between them no longer asks the server:
 *
 *   KEPT    every section the router has drawn is held here as it was drawn
 *           (SectionSeed hands it over), and shown again on the frame of the
 *           press, its scroll, its open tab and what was typed in it as they
 *           were. The address moves with history.pushState, which Next
 *           follows without a request, so Back, Forward and a reload all
 *           land where the address says.
 *   ONCE    each section is drawn by the shell, in a place of its own, from
 *           the commit the router brought it in; when the router draws it
 *           again (a save refreshes it) the shell's copy is updated in place,
 *           so it mounts once for as long as the community is open. Only the
 *           section the server sent with the document is drawn where the
 *           router put it, for the first paint, and taken over before the
 *           next frame.
 *   AHEAD   once the first section has painted and the browser is idle, the
 *           ones not opened yet are read ahead (never on Save-Data or 2G),
 *           so the first press on each is usually as quick as the second.
 *   FRESH   a section held for over a minute, or held while something else
 *           changed, is read again quietly behind what is shown.
 *   MOTION  the section arriving rises 3px from 55% over 150ms (from 55%, so
 *           its first frame is never empty); Back and Forward put it back
 *           with none, and so does reduced motion.
 *
 * NOT <Activity>. The member side hides its places with React's <Activity>,
 * which stops a hidden tree's effects and runs them again when it is shown;
 * these sections were written for a page that mounts once and read in
 * effects (the payments under Members, the blocked words), so each return
 * asked the server again and could throw away what was typed. A section here
 * is a block that is not displayed while another is shown: its effects, its
 * state and its DOM simply stay.
 */
import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { AppLink } from "@/components/app/app-link"
import { prefetchAppPage, sameStageFrame, useShownPath, useShownSearch } from "@/lib/ui/app-navigation"
import { connectionFacts, readAheadAllowed } from "@/lib/communities/client/place-cache"
import { ArrowLeft, Copy, ExternalLink, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { iconButton } from "@/app/app/orders/order-parts"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { CommunityHead, SectionId } from "./view-types"
import { CommunityStatusBadge, FOOT_ROOM_PX, ToastHost, buttonPrimary, buttonSecondary, communityState, errorText, send, useFootsUp, useToast } from "./parts"
import { nameCoverGradient } from "@/lib/communities/cover-gradient"
import { SECTION_AHEAD_MS, adminSectionOf, sectionMove, sectionRestarts, sectionStale, type AdminSection } from "./logic"
import { SectionFrame, type SectionFrameFacts } from "./section-frame"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

/** The arrival of a section, on the compositor: from 55%, so the first frame after the press already shows it. */
export const SECTION_ARRIVE_MS = 150
export const SECTION_ARRIVE_FROM = 0.55
export const SECTION_ARRIVE_RISE_PX = 3
/** A section taking its frame's place: the same 55%, quicker, and no rise (its cards are already where they will be). */
export const SECTION_FILL_MS = 120
const SECTION_ARRIVE_EASE = "cubic-bezier(0.33, 1, 0.68, 1)"
const ARRIVE: Keyframe[] = [{ opacity: SECTION_ARRIVE_FROM, translate: `0 ${SECTION_ARRIVE_RISE_PX}px` }, { opacity: 1, translate: "0 0" }]

/**
 * THE WIDTH OF THE PAGE (round 32, the owner: "everything on desktop is too
 * shrunk"). It was 1080px; it is now the widest /app list's column, Products'
 * (app/app/products/products-client.tsx PAGE_WIDTH): 1200px, and 1323px from
 * 1024px, inside the app's own gutter (32px there). Not Products' 35px
 * gutter: up to 1320px wide the rail leaves less than the column anyway, and
 * the wider gutter would have made a 1280px screen 6px narrower than before.
 * Measured (scripts/check-community-admin-round32.mjs WIDTH): the section is
 * 1136px at 1440 (was 1016) and 1259 at 1920 (was 1016). The bar, the tabs
 * and the section share it, so the name, the first tab and the first card
 * start on one line.
 */
const SHELL_WIDTH = "max-w-[1200px] lg:max-w-[1323px]"
const SHELL_GUTTER = "app-gutter"

/**
 * What a section's frame needs beyond its name (section-frame.tsx): Posts draws the writer's card for whoever may post,
 * and Settings opens on the list of panels on a phone when the address names none.
 */
export function frameFacts(head: CommunityHead, search: string): SectionFrameFacts {
  return { composer: head.can.post === true && !head.archived && !!head.me, settingsList: !new URLSearchParams(search).get("tab")?.trim() }
}

export interface SectionTab {
  id: SectionId
  label: string
  href: string
  count?: number
}

/** The sections this person may open, in order: the work on content, then people, then the numbers and the settings. */
export function sectionTabs(head: CommunityHead): SectionTab[] {
  const base = `/app/community/${head.slug}`
  const can = head.can
  const tabs: (SectionTab | null)[] = [
    { id: "overview", label: tt("Overview"), href: base },
    /* Round 33: the community's page (name, pictures, what members get, the join button), edited apart from Settings. */
    can.manage_settings ? { id: "page", label: tt("Page"), href: `${base}/page` } : null,
    can.moderate_content ? { id: "feed", label: tt("Posts"), href: `${base}/feed` } : null,
    can.manage_spaces ? { id: "spaces", label: tt("Spaces"), href: `${base}/spaces` } : null,
    can.manage_classroom && head.classroomEnabled ? { id: "classroom", label: tt("Learn"), href: `${base}/learn` } : null,
    can.manage_events && head.eventsEnabled ? { id: "events", label: tt("Calendar"), href: `${base}/events` } : null,
    can.remove_member ? { id: "members", label: tt("Members"), href: `${base}/members`, count: head.memberCount } : null,
    can.review_reports ? { id: "moderation", label: tt("Moderation"), href: `${base}/moderation`, count: head.openReports || undefined } : null,
    can.view_analytics ? { id: "analytics", label: tt("Analytics"), href: `${base}/analytics` } : null,
    can.manage_settings ? { id: "settings", label: tt("Settings"), href: `${base}/settings` } : null,
  ]
  return tabs.filter((t): t is SectionTab => t !== null)
}

/** The section an address is on: /app/community/<slug or id>/<section>. */
export function activeSection(pathname: string, _id?: string): SectionId {
  return adminSectionOf(pathname)
}

/* ── The hand over from a section's page ──────────────────────────────────── */

interface Held {
  node: React.ReactNode
  /** The one time ask the page was drawn with (?new=1, ?compose=...), "" for none. */
  stamp: string
  at: number
  stale: boolean
  /** Bumped when the page was drawn again for a new one time ask: the kept copy starts again from it. */
  version: number
}

interface HostValue {
  active: AdminSection
  kept: readonly AdminSection[]
  /** True from the shell's first commit: every section is drawn from what the shell holds from then on. */
  settled: boolean
  hold: (id: AdminSection, node: React.ReactNode, stamp: string) => void
  routedHere: (id: AdminSection) => () => void
}

const Host = React.createContext<HostValue | null>(null)

/**
 * WHAT A SECTION'S PAGE RENDERS AROUND ITS CONTENT (app/app/community/[id]/
 * <section>/page.tsx). It hands the content to the shell, which draws it in
 * a place of its own and keeps it there for the way back; when the router
 * draws the page again (a save refreshed it) the shell's copy is updated in
 * place, its state kept.
 *
 * The one exception is the page the server sent with the document: it is
 * drawn here, so the first paint has it, and the shell takes it over before
 * the next frame.
 */
export function SectionSeed({ id, stamp = "", children }: { id: AdminSection; stamp?: string; children: React.ReactNode }) {
  const host = React.useContext(Host)
  const hold = host?.hold
  const routedHere = host?.routedHere
  React.useLayoutEffect(() => routedHere?.(id), [routedHere, id])
  React.useLayoutEffect(() => {
    hold?.(id, children, stamp)
  }, [hold, id, children, stamp])
  if (!host) return <>{children}</>
  if (host.settled || host.kept.includes(id)) return null
  return (
    <div data-section-screen={id} data-section-routed="" hidden={host.active !== id}>
      {children}
    </div>
  )
}

/* ── The bar ─────────────────────────────────────────────────────────────── */

/*
  THE STATE, AS A BADGE BESIDE THE NAME (round 33, the owner: "Published must be a badge, not text"). The /app badge
  (./parts CommunityStatusBadge, the coupon and the product editor's header), after the name, which truncates first so
  the badge is always whole. The member count under the name is gone: the Members tab carries it.
*/

function usePublish(head: CommunityHead) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const can = head.status === "draft" && !head.archived && !head.suspended && head.can.manage_settings === true
  const publish = async () => {
    setBusy(true)
    setError(null)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", { publish: true })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error, tt("It could not be published. Try again.")))
    router.refresh()
  }
  return { can, busy, error, publish }
}

function CommunityBar({ head }: { head: CommunityHead }) {
  const toast = useToast()
  const pub = usePublish(head)
  const viewable = head.status === "published" || head.can.manage_settings === true
  const pageUrl = `/community/${head.slug}`
  const menu: ActionMenuItem[] = [
    ...(viewable ? [{ label: tt("View page"), icon: <ExternalLink className="h-4 w-4" aria-hidden />, href: pageUrl, target: "_blank" as const }] : []),
    {
      label: tt("Copy link"),
      icon: <Copy className="h-4 w-4" aria-hidden />,
      onClick: () => {
        void navigator.clipboard?.writeText(`${window.location.origin}${pageUrl}`).then(
          () => toast(tt("Link copied")),
          () => toast(tt("The link could not be copied")),
        )
      },
    },
  ]
  return (
    <div data-community-bar="" className="grid min-h-[52px] grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-2.5 py-1.5 sm:min-h-14 sm:gap-x-3">
      {/* The /app way back (the coupon and the order's header): the quiet 36px square, the arrow at 20px. */}
      <AppLink href="/app/community" aria-label={tt("All communities")} title={tt("All communities")} scroll={false} data-community-back="" className={cn(iconButton, "-ml-1.5 h-9 w-9 shrink-0 hover:bg-[#eceef1] active:bg-[#e4e6ea]")}>
        <ArrowLeft aria-hidden className="h-5 w-5" />
      </AppLink>
      {head.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={head.logoUrl} alt="" data-community-logo="" className="h-9 w-9 shrink-0 rounded-[10px] object-cover shadow-[0_0_0_1px_rgba(16,24,40,0.06)]" />
      ) : (
        /* No logo: the letter on the name's own gradient (lib/communities/cover-gradient.ts), as the list's cards draw it. */
        <span aria-hidden data-community-logo="" className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[15px] font-semibold text-white shadow-[0_0_0_1px_rgba(16,24,40,0.06)] [text-shadow:0_1px_1px_rgba(0,0,0,0.18)]" style={{ backgroundImage: nameCoverGradient(head.name) }}>
          {(Array.from(head.name.trim())[0] || "C").toUpperCase()}
        </span>
      )}
      {/* As an order's header: the badge after the name, and under it when the row has no room for both (a phone, a long name). */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 sm:gap-x-2.5" data-community-title="">
        <h1 className="min-w-0 max-w-full truncate text-[18px] font-bold leading-7 text-[#1a1a2e] sm:text-[20px] lg:text-[22px]" title={head.name}>
          {head.name}
        </h1>
        <CommunityStatusBadge state={communityState(head)} />
      </div>
      <div className="relative flex shrink-0 items-center gap-1.5" data-community-actions="">
        {/* From 640px View page is a button of its own; on a phone it is in the menu, so the name keeps the row. */}
        {viewable ? (
          <a href={pageUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonSecondary, "max-sm:hidden")} data-community-view="">
            <ExternalLink aria-hidden className="h-4 w-4" />
            {tt("View page")}
          </a>
        ) : null}
        {pub.can ? (
          <button type="button" onClick={() => void pub.publish()} disabled={pub.busy} data-publish="" className={cn(buttonPrimary, "max-sm:h-9 max-sm:px-3")}>
            {pub.busy ? tt("Publishing") : tt("Publish")}
          </button>
        ) : null}
        <span className="sm:hidden">
          <ResponsiveActionMenu
            title={head.name}
            items={menu}
            trigger={
              <button type="button" aria-label={tt("More")} data-community-more="" className={cn(iconButton, "h-10 w-10 text-[#1a1a2e] hover:bg-[#eceef1]")}>
                <MoreHorizontal aria-hidden className="h-5 w-5" />
              </button>
            }
          />
        </span>
        {pub.error ? (
          <span role="alert" className="absolute right-0 top-[calc(100%+6px)] z-20 w-[260px] rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12.5px] leading-snug text-[#991b1b] shadow-sm">
            {pub.error}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/* ── The tabs ────────────────────────────────────────────────────────────── */

/**
 * THE ROW OF SECTIONS. A word each, the one you are on filled grey, the
 * memberships screen's views. On a phone the row scrolls sideways with its
 * ends fading and the one you are on is kept in view. A press on a section
 * the shell holds is answered by the shell (onGo prevents the link); any
 * other press is the router's. Nothing is fetched ahead for a section the
 * shell holds (onWarm decides), so pointing at one costs no request.
 */
export function CommunityTabs({ head, active, onGo, onWarm }: { head: CommunityHead; active: SectionId; onGo?: (tab: SectionTab, e: React.MouseEvent<HTMLAnchorElement>) => void; onWarm?: (tab: SectionTab) => void }) {
  const tabs = sectionTabs(head)
  const strip = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const s = strip.current
    const el = s?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!el || !s) return
    const left = el.offsetLeft - s.offsetLeft
    if (left < s.scrollLeft + 8 || left + el.offsetWidth > s.scrollLeft + s.clientWidth - 16) s.scrollTo({ left: Math.max(0, left - 24), behavior: "auto" })
  }, [active])
  return (
    <nav aria-label={tt("Community sections")} data-community-tabs="">
      <div ref={strip} data-section-tabs="" className="app-gutter-bleed flex items-center gap-1 overflow-x-auto pb-2 scrollbar-hide [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-20px),transparent)] md:gap-0.5 xl:[mask-image:none]">
        {tabs.map((t) => {
          const on = t.id === active
          return (
            <Link
              key={t.id}
              href={t.href}
              prefetch={false}
              scroll={false}
              aria-current={on ? "page" : undefined}
              data-tab={t.id}
              onMouseEnter={() => onWarm?.(t)}
              onFocus={() => onWarm?.(t)}
              onPointerDown={(e) => (e.pointerType !== "mouse" || e.button === 0) && onWarm?.(t)}
              onTouchStart={() => onWarm?.(t)}
              /* A section the shell does not hold yet goes on to the router; the shell shows its frame meanwhile, and no bar (round 32: lib/ui/app-navigation sameStageFrame). */
              onClick={(e) => onGo?.(t, e)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5 text-[14px] font-medium outline-none transition-[background-color,color,box-shadow] duration-100 [-webkit-tap-highlight-color:transparent] focus-visible:shadow-[inset_0_0_0_2px_rgba(26,26,46,0.35)] max-md:h-10",
                on
                  ? "bg-[#e6e8ec] text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,18,27,0.06),inset_0_0_0_1px_rgba(16,18,27,0.04)]"
                  : "text-[#4b5563] hover:bg-[#eef0f2] hover:text-[#1a1a2e] active:bg-[#e6e8ec]",
              )}
            >
              {t.label}
              {typeof t.count === "number" ? <span className={cn("tabular-nums", t.id === "moderation" ? "text-[#b45309]" : "text-[#9ca3af]")}>{t.count.toLocaleString(appLocale())}</span> : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/* ── The shell ───────────────────────────────────────────────────────────── */

export function CommunityShell({ head, children }: { head: CommunityHead; children: React.ReactNode }) {
  const pathname = usePathname() || ""
  const router = useRouter()
  const pane = React.useRef<HTMLDivElement>(null)

  /* What the shell holds: every section drawn so far, as the router drew it. */
  const store = React.useRef(new Map<AdminSection, Held>())
  /*
    What each kept place draws, as state (round 32): a render reads what was committed, never the store a later answer
    has already written into, so a section drawn again in a transition stays as it is on every urgent render until its
    new reads are in.
  */
  const [drawn, setDrawn] = React.useState<ReadonlyMap<AdminSection, Held>>(() => new Map())
  const [active, setActive] = React.useState<AdminSection>(() => adminSectionOf(pathname))
  const activeRef = React.useRef(active)
  activeRef.current = active
  /* The section in the router's slot now (SectionSeed says so), and the sections drawn from what is held. */
  const [routed, setRouted] = React.useState<AdminSection | null>(null)
  const routedRef = React.useRef<AdminSection | null>(null)
  const [kept, setKept] = React.useState<AdminSection[]>([])
  const keptRef = React.useRef(kept)
  keptRef.current = kept
  /* When each section was read ahead (round 32), and a section that arrived from an old read ahead, to read again. */
  const readAhead = React.useRef(new Map<AdminSection, number>())
  const staleArrival = React.useRef<AdminSection | null>(null)

  const hold = React.useCallback((id: AdminSection, node: React.ReactNode, stamp: string) => {
    const prev = store.current.get(id)
    if (prev && prev.node === node) return
    /* Drawn again (a save refreshed it): what the others show may be behind now. */
    if (prev) for (const [k, h] of store.current) if (k !== id) h.stale = true
    /* Read ahead a while ago (round 32): it is shown as read, and read again behind it once it is looked at (FRESH). */
    const aheadAt = prev ? 0 : (readAhead.current.get(id) ?? 0)
    const entry: Held = { node, stamp, at: aheadAt || Date.now(), stale: false, version: (prev?.version ?? 0) + (prev && sectionRestarts(prev.stamp, stamp) ? 1 : 0) }
    store.current.set(id, entry)
    const draw = () => setDrawn((m) => new Map(m).set(id, entry))
    /*
      In the commit that brought it, before it is painted: a new section gets its place, a held one is drawn again in it.
      Drawn again in a transition (round 32): the section's reads stream in under a Suspense boundary on the server
      (app/app/community/[id]/<section>/page.tsx), and an urgent update would put a section already on screen back to its
      frame until they came. In a transition React keeps what is shown until the new reads are in.
    */
    if (keptRef.current.includes(id)) React.startTransition(draw)
    else {
      draw()
      keptRef.current = [...keptRef.current, id]
      setKept(keptRef.current)
      if (aheadAt && sectionStale({ at: aheadAt, stale: false }, Date.now())) staleArrival.current = id
    }
  }, [])
  /* From the first commit on, the shell draws every section itself (SectionSeed draws only the server's first paint). */
  const [settled, setSettled] = React.useState(false)
  React.useLayoutEffect(() => setSettled(true), [])
  const routedHere = React.useCallback((id: AdminSection) => {
    routedRef.current = id
    setRouted(id)
    return () => {
      if (routedRef.current !== id) return
      routedRef.current = null
      setRouted(null)
    }
  }, [])

  /* ── Showing a section ── */
  const scrolls = React.useRef(new Map<AdminSection, number>())
  /* Where the pane was scrolled to before a switch (the scroll events come after it, from the next frame). */
  const paneTop = React.useRef(0)
  const traversing = React.useRef(false)
  const refreshTimer = React.useRef(0)
  /* The section on screen (the one being opened while the router brings it), for the scroll it is given and keeps. */
  const screenRef = React.useRef<AdminSection>(active)
  /* Where each section was scrolled to, as it scrolls (read before the switch, never after: a shorter section clamps it). */
  React.useEffect(() => {
    const el = pane.current
    if (!el) return
    const on = () => {
      scrolls.current.set(screenRef.current, el.scrollTop)
      paneTop.current = el.scrollTop
    }
    el.addEventListener("scroll", on, { passive: true })
    return () => el.removeEventListener("scroll", on)
  }, [])
  const show = React.useCallback(
    (id: AdminSection, how: { traversal?: boolean } = {}) => {
      traversing.current = !!how.traversal
      activeRef.current = id
      setActive(id)
      /* Old, or held while something else changed: read again quietly behind it, once it has been looked at for a moment. */
      window.clearTimeout(refreshTimer.current)
      if (sectionStale(store.current.get(id), Date.now())) {
        refreshTimer.current = window.setTimeout(() => {
          if (activeRef.current === id) React.startTransition(() => router.refresh())
        }, 350)
      }
    },
    [router],
  )

  /*
    THE ROUTER MOVED (a link inside a section, a section read from the server, a redirect): the shell follows the address in
    the same render, so the section the router brings is never drawn hidden for a frame.
  */
  const [seenPath, setSeenPath] = React.useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    const id = adminSectionOf(pathname)
    if (id !== active) setActive(id)
  }
  /* Back and Forward: the address is the truth, and the section comes back with no motion. */
  React.useEffect(() => {
    const onPop = () => {
      if (!sameStageFrame(window.location.pathname, `/app/community/${head.slug}`)) return
      const id = adminSectionOf(window.location.pathname)
      if (id !== activeRef.current) show(id, { traversal: true })
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [head.slug, show])

  /*
    A PRESS ON A TAB. Held, or the router's own page: shown on this frame, the address moved with history (a section still
    on its way from the router is dropped by that, as Next drops a navigation another one replaces). Never opened (round
    32): the link goes on to the router, and the section's frame is on screen from this frame on, in its place, until the
    section is in (usually at once: every section is read ahead as the shell mounts).
  */
  const fetching = React.useRef<{ id: AdminSection; at: number } | null>(null)
  const go = React.useCallback(
    (tab: SectionTab, e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const id = tab.id as AdminSection
      const move = sectionMove(id, { active: activeRef.current, routed: routedRef.current, held: store.current.has(id) })
      if (move === "fetch") {
        fetching.current = { id, at: Date.now() }
        show(id)
        return
      }
      e.preventDefault()
      if (move === "stay") return
      fetching.current = null
      /* Pressed again before the router's page came: the address never moved, so it is not a new entry in the history. */
      if (window.location.pathname === tab.href) window.history.replaceState(null, "", tab.href)
      else window.history.pushState(null, "", tab.href)
      show(id)
    },
    [show],
  )
  const warm = React.useCallback(
    (tab: SectionTab) => {
      const id = tab.id as AdminSection
      if (store.current.has(id) || routedRef.current === id) return
      if (!readAhead.current.has(id)) readAhead.current.set(id, Date.now())
      prefetchAppPage(router, tab.href)
    },
    [router],
  )

  /* ── The press lights the tab at once; a link inside a section going to another one shows that one's frame ── */
  const going = useShownPath() || pathname
  const shownSearch = useShownSearch()
  const pendingId = sameStageFrame(pathname, going) && going !== pathname ? adminSectionOf(going) : null
  const shown: AdminSection = pendingId ?? active
  screenRef.current = shown
  /* Drawn as its frame: a section asked for that the shell does not hold yet (never before the first commit, which the server drew). */
  const framed = settled && !kept.includes(shown) ? shown : null

  /* A section asked for that nothing holds and the router is not bringing (Back after the shell was left): read it. */
  const asked = React.useRef<string | null>(null)
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      const id = activeRef.current
      if (routedRef.current === id || store.current.has(id)) return
      /* The router is bringing it: a press a moment ago, or a link inside a section. */
      const f = fetching.current
      if ((f && f.id === id && Date.now() - f.at < 10_000) || pendingId === id) return
      const key = `${id}:${window.location.pathname}`
      if (asked.current === key) return
      asked.current = key
      React.startTransition(() => router.refresh())
    }, 160)
    return () => window.clearTimeout(t)
  }, [active, routed, router, pendingId])

  /*
    ── Reading ahead, as soon as the shell is on screen ──
    Round 31 read the unopened sections once the browser was idle, two at a time, 600ms apart: on a slow phone the first
    press often came before its section had been asked for. Now every section is asked for on the frame after the first
    paint, in the order of the tabs. Next's prefetch queue sends four at a time (a hovered or touched tab goes to the front
    of it, onWarm), so the server is still never asked for all of them at once. Not on Save-Data or 2G.
  */
  const aheadAt = React.useRef(0)
  const headRef = React.useRef(head)
  headRef.current = head
  React.useEffect(() => {
    if (Date.now() - aheadAt.current < SECTION_AHEAD_MS) return
    let timer = 0
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        if (Date.now() - aheadAt.current < SECTION_AHEAD_MS || !readAheadAllowed(connectionFacts())) return
        aheadAt.current = Date.now()
        for (const t of sectionTabs(headRef.current)) {
          const id = t.id as AdminSection
          if (id === activeRef.current || id === routedRef.current || store.current.has(id)) continue
          readAhead.current.set(id, Date.now())
          prefetchAppPage(router, t.href)
        }
      }, 0)
    })
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
    /* Again when the section shown changes, once the last read ahead is old (a save cleared the router's copies). */
  }, [active, router])

  /* A section that arrived from a read ahead of over a minute ago: shown as read, and read again behind it. */
  React.useEffect(() => {
    const id = staleArrival.current
    if (!id || id !== active || !kept.includes(id)) return
    staleArrival.current = null
    const t = window.setTimeout(() => {
      if (activeRef.current === id) React.startTransition(() => router.refresh())
    }, 350)
    return () => window.clearTimeout(t)
  }, [kept, active, router])

  /* ── Scroll and the arrival, before the frame is painted ── */
  const painted = React.useRef(false)
  /* When the section on screen began its arrival (0 for none), for the section that takes its frame's place. */
  const arrivedAt = React.useRef(0)
  React.useLayoutEffect(() => {
    if (!painted.current) {
      painted.current = true
      return
    }
    const el = pane.current
    if (!el) return
    /*
      THE ROW STAYS WHERE IT WAS (round 33). With the bar scrolled away, a section opened at its top would bring the bar
      back and push the row of tabs, the one just pressed, 60px down. A section is shown at least as far down as the bar,
      when the bar was out of sight, so the row stays at the top; back at the top, it is shown from the top.
    */
    const floor = Math.min(paneTop.current, barHeight(el))
    el.scrollTop = Math.max(scrolls.current.get(shown) ?? 0, floor)
    paneTop.current = el.scrollTop
    const screen = el.querySelector<HTMLElement>(`[data-section-screen="${shown}"]`)
    const back = traversing.current
    traversing.current = false
    arrivedAt.current = 0
    if (back || !screen || typeof screen.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    arrivedAt.current = performance.now()
    screen.animate(ARRIVE, { duration: SECTION_ARRIVE_MS, easing: SECTION_ARRIVE_EASE })
  }, [shown])
  /*
    THE SECTION TAKING ITS FRAME'S PLACE. Its cards are where the frame's were. While the frame is still arriving the
    section carries on that same arrival from where it had got to (so nothing jumps by what was left of the rise);
    after it, the section comes up from 55% over 120ms with no rise.
  */
  const lastFramed = React.useRef<AdminSection | null>(null)
  React.useLayoutEffect(() => {
    const was = lastFramed.current
    lastFramed.current = framed
    if (!was || framed === was || was !== shown) return
    const screen = pane.current?.querySelector<HTMLElement>(`[data-section-screen="${was}"][data-section-kept]`)
    if (!screen || typeof screen.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const into = arrivedAt.current ? performance.now() - arrivedAt.current : Infinity
    if (into < SECTION_ARRIVE_MS) {
      const a = screen.animate(ARRIVE, { duration: SECTION_ARRIVE_MS, easing: SECTION_ARRIVE_EASE })
      a.currentTime = into
      return
    }
    screen.animate([{ opacity: SECTION_ARRIVE_FROM }, { opacity: 1 }], { duration: SECTION_FILL_MS, easing: SECTION_ARRIVE_EASE })
  }, [framed, shown])

  const hostValue = React.useMemo<HostValue>(() => ({ active, kept, settled, hold, routedHere }), [active, kept, settled, hold, routedHere])
  const foots = useFootsUp()

  return (
    <ToastHost>
      <Host.Provider value={hostValue}>
        <div ref={pane} className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa]" data-community-shell="" data-section={shown} data-routed={routed ?? ""}>
          <CommunityHeader head={head} shown={shown} onGo={go} onWarm={warm} />
          {/*
            ROOM FOR THE SAVE BARS (round 33): each bar that is up (./parts EditorFoot) adds FOOT_ROOM_PX under the last card,
            so scrolled to the end nothing is under a bar; with none up the foot is as before. At least the pane's height, so
            a short section can still be scrolled until only the row of tabs is above it (a press keeps the row in place).
          */}
          <div className={cn("mx-auto min-h-full pb-[calc(7rem+var(--foot-room))] pt-4 md:pb-[calc(3rem+var(--foot-room))] lg:pt-5", SHELL_GUTTER, SHELL_WIDTH)} style={{ "--foot-room": `${foots * FOOT_ROOM_PX}px` } as React.CSSProperties} data-community-body="" data-foots={foots}>
            {head.suspended ? (
              <p className="mb-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-2.5 text-[13.5px] text-[#991b1b]">{tt("Storelib suspended this community. Members cannot open it. Contact support to talk about it.")}</p>
            ) : head.archived ? (
              <p className="mb-4 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-[13.5px] text-[#4b5563]">{tt("This community is archived. Members can read it, nobody can post. Bring it back from Settings.")}</p>
            ) : null}
            <div data-section-screens="">
              {/* The router's slot: the section's page hands its content over from here (SectionSeed). */}
              <div data-section-slot="" style={{ display: "contents" }}>
                {children}
              </div>
              {kept.map((id) => {
                const h = drawn.get(id)
                if (!h) return null
                return (
                  <div key={id} data-section-screen={id} data-section-kept="" hidden={shown !== id}>
                    <React.Fragment key={h.version}>{h.node}</React.Fragment>
                  </div>
                )
              })}
              {framed ? (
                <div key={`frame:${framed}`} data-section-screen={framed} data-section-framed="">
                  <SectionFrame id={framed} facts={frameFacts(head, shownSearch)} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Host.Provider>
    </ToastHost>
  )
}

/**
 * THE BAR AND THE ROW (round 33, the owner: an editor page "height narrowed"
 * by the header, the tabs, its own back header and the save bar). The bar
 * with the name scrolls away with the section; the row of tabs is what stays
 * at the top of the pane (52px), with a hairline and a soft shadow only once
 * something is under it (app/app/orders/order-parts PaneBar). Scrolled back
 * up, the bar is there again. On a 900px screen that gives a section 60px
 * more of the screen than round 32's header, which kept both.
 */
/** How far the pane scrolls before the row of tabs is stuck: the height of the bar above it (it is the pane's first box). */
function barHeight(pane: HTMLElement): number {
  return pane.querySelector<HTMLElement>("[data-community-header]")?.offsetHeight ?? 0
}

function CommunityHeader({ head, shown, onGo, onWarm }: { head: CommunityHead; shown: AdminSection; onGo: (tab: SectionTab, e: React.MouseEvent<HTMLAnchorElement>) => void; onWarm: (tab: SectionTab) => void }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const row = ref.current
    const pane = row?.closest<HTMLElement>(".orders-pane")
    if (!row || !pane) return
    let under = false
    const read = () => {
      /* Stuck once the pane has scrolled past the bar above the row. */
      const now = pane.scrollTop > Math.max(0, barHeight(pane) - 1)
      if (now === under) return
      under = now
      row.dataset.scrolled = now ? "true" : "false"
    }
    read()
    pane.addEventListener("scroll", read, { passive: true })
    return () => pane.removeEventListener("scroll", read)
  }, [])
  return (
    <>
      <div data-community-header="" className="bg-[#f8f9fa]">
        <div className={cn("mx-auto pt-1.5 sm:pt-2.5 lg:pt-3", SHELL_GUTTER, SHELL_WIDTH)}>
          <CommunityBar head={head} />
        </div>
      </div>
      <div ref={ref} data-orders-bar="" data-scrolled="false" data-community-tabs-bar="" className="orders-bar sticky top-0 z-10 bg-[#f8f9fa]">
        <div className={cn("mx-auto pt-1", SHELL_GUTTER, SHELL_WIDTH)}>
          <CommunityTabs head={head} active={shown} onGo={onGo} onWarm={onWarm} />
        </div>
      </div>
    </>
  )
}

