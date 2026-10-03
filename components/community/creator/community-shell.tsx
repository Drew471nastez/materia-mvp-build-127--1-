"use client"

/**
 * ===========================================================================
 *  ONE COMMUNITY, FOR THE PEOPLE WHO RUN IT
 * ===========================================================================
 * The frame every section of /app/community/<id> sits in: the bar with the
 * community's logo, name and state, the way back to the list, View page,
 * and Publish while it is a draft; under it the sections, as the
 * memberships screen draws its views (a compact row of tabs, the one you
 * are on filled grey). Both stay at the top while the section scrolls. On a
 * phone the tabs scroll sideways and the one you are on is brought into
 * view.
 *
 * Which tabs appear is the role's (lib/communities/permissions.ts, handed
 * down as `head.can`): a moderator sees what a moderator can do, nothing
 * that would only answer "forbidden".
 */
import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { PaneBar, StatusBadge } from "@/app/app/orders/order-parts"
import type { CommunityHead, SectionId } from "./view-types"
import { SECTION_WIDTH, ToastHost, buttonPrimary, buttonSecondary, errorText, send } from "./parts"

export interface SectionTab {
  id: SectionId
  label: string
  href: string
  count?: number
}

/** The sections this person may open, in order. */
export function sectionTabs(head: CommunityHead): SectionTab[] {
  const base = `/app/community/${head.id}`
  const can = head.can
  const tabs: (SectionTab | null)[] = [
    { id: "overview", label: "Overview", href: base },
    can.moderate_content ? { id: "feed", label: "Feed", href: `${base}/feed` } : null,
    can.manage_spaces ? { id: "spaces", label: "Spaces", href: `${base}/spaces` } : null,
    can.manage_classroom && head.classroomEnabled ? { id: "classroom", label: "Classroom", href: `${base}/classroom` } : null,
    can.manage_events && head.eventsEnabled ? { id: "events", label: "Events", href: `${base}/events` } : null,
    can.remove_member ? { id: "members", label: "Members", href: `${base}/members`, count: head.memberCount } : null,
    can.review_reports ? { id: "moderation", label: "Moderation", href: `${base}/moderation`, count: head.openReports || undefined } : null,
    can.view_analytics ? { id: "analytics", label: "Analytics", href: `${base}/analytics` } : null,
    can.manage_gamification && head.gamificationEnabled ? { id: "gamification", label: "Gamification", href: `${base}/gamification` } : null,
    can.manage_settings ? { id: "settings", label: "Settings", href: `${base}/settings` } : null,
  ]
  return tabs.filter((t): t is SectionTab => t !== null)
}

export function activeSection(pathname: string, id: string): SectionId {
  const rest = pathname.split(`/app/community/${id}`)[1] ?? ""
  const seg = rest.split("/").filter(Boolean)[0]
  return (seg as SectionId) || "overview"
}

function StateBadge({ head }: { head: CommunityHead }) {
  if (head.suspended) return <StatusBadge tone="critical">Suspended</StatusBadge>
  if (head.archived) return <StatusBadge tone="neutral">Archived</StatusBadge>
  if (head.status === "published") return <StatusBadge tone="success">Published</StatusBadge>
  return <StatusBadge tone="neutral">Draft</StatusBadge>
}

export function CommunityTabs({ head, active }: { head: CommunityHead; active: SectionId }) {
  const tabs = sectionTabs(head)
  const strip = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!el || !strip.current) return
    const s = strip.current
    const left = el.offsetLeft - s.offsetLeft
    if (left < s.scrollLeft || left + el.offsetWidth > s.scrollLeft + s.clientWidth) s.scrollTo({ left: Math.max(0, left - 24), behavior: "auto" })
  }, [active])
  return (
    <nav aria-label="Community sections" className="-mb-px">
      <div ref={strip} data-section-tabs="" className="app-gutter-bleed flex items-center gap-0.5 overflow-x-auto pb-2 scrollbar-hide [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-16px),transparent)] md:[mask-image:none]">
        {tabs.map((t) => {
          const on = t.id === active
          return (
            <Link
              key={t.id}
              href={t.href}
              prefetch={false}
              aria-current={on ? "page" : undefined}
              data-tab={t.id}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5 text-[14px] font-medium transition-colors duration-100 max-md:h-10",
                on ? "bg-[#e6e8ec] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#eef0f2]",
              )}
            >
              {t.label}
              {typeof t.count === "number" ? <span className={cn("tabular-nums", t.id === "moderation" ? "text-[#b45309]" : "text-[#9ca3af]")}>{t.count}</span> : null}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function PublishButton({ head }: { head: CommunityHead }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  if (head.status !== "draft" || head.archived || head.suspended || !head.can.manage_settings) return null
  const publish = async () => {
    setBusy(true)
    setError(null)
    const res = await send(`/api/app/community/${head.id}`, "PATCH", { publish: true })
    setBusy(false)
    if (!res.ok) return setError(errorText(res.data.error, "It could not be published. Try again."))
    router.refresh()
  }
  return (
    <span className="relative">
      <button type="button" onClick={() => void publish()} disabled={busy} data-publish="" className={cn(buttonPrimary, "max-sm:h-10 max-sm:px-3.5")}>
        {busy ? "Publishing" : "Publish"}
      </button>
      {error ? (
        <span role="alert" className="absolute right-0 top-[calc(100%+6px)] z-20 w-[260px] rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12.5px] leading-snug text-[#991b1b] shadow-sm">
          {error}
        </span>
      ) : null}
    </span>
  )
}

export function CommunityShell({ head, children }: { head: CommunityHead; children: React.ReactNode }) {
  const pathname = usePathname() || ""
  const active = activeSection(pathname, head.id)
  return (
    <ToastHost>
      <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa]" data-community-shell="" data-section={active}>
        <PaneBar width={SECTION_WIDTH} className="pt-2.5 lg:pt-3.5">
          <div className="flex min-h-[48px] items-center gap-2.5">
            <Link href="/app/community" aria-label="All communities" className="-ml-1.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-[#1a1a2e] hover:bg-[#eceef1] sm:h-9 sm:w-9">
              <ArrowLeft aria-hidden className="h-[18px] w-[18px]" />
            </Link>
            {head.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={head.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-[9px] object-cover" />
            ) : (
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[#1a1a2e] text-[14px] font-semibold text-white">
                {head.name.trim().charAt(0).toUpperCase() || "C"}
              </span>
            )}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <h1 className="min-w-0 truncate text-[19px] font-bold leading-7 text-[#1a1a2e] sm:text-[22px] lg:text-[24px]">{head.name}</h1>
              <span className="max-sm:hidden">
                <StateBadge head={head} />
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {head.status === "published" || head.can.manage_settings ? (
                <a href={`/community/${head.slug}`} target="_blank" rel="noopener noreferrer" aria-label="View page" className={cn(buttonSecondary, "max-sm:h-10 max-sm:w-10 max-sm:px-0")}>
                  <ExternalLink aria-hidden className="h-4 w-4" />
                  <span className="max-sm:hidden">View page</span>
                </a>
              ) : null}
              <PublishButton head={head} />
            </div>
          </div>
          <div className="mt-1.5">
            <CommunityTabs head={head} active={active} />
          </div>
        </PaneBar>
        <div key={active} className={cn("mx-auto app-gutter pb-28 pt-4 md:pb-12", SECTION_WIDTH)}>
          {head.suspended ? (
            <p className="mb-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-2.5 text-[13.5px] text-[#991b1b]">Storelib suspended this community. Members cannot open it. Contact support to talk about it.</p>
          ) : head.archived ? (
            <p className="mb-4 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-[13.5px] text-[#4b5563]">This community is archived. Members can read it, nobody can post. Bring it back from Settings.</p>
          ) : null}
          {children}
        </div>
      </div>
    </ToastHost>
  )
}
