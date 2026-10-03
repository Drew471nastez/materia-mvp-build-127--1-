"use client"

/**
 * ===========================================================================
 *  THE COMMUNITY SECTION: ONE OF THE CREATOR'S COMMUNITIES, ON THEIR PAGE
 * ===========================================================================
 * A card in the page's own colours (the storefront's tokens: --card,
 * --foreground, --muted-foreground, --border), so it sits on a dark page as
 * well as a white one: the community's cover, logo, name and line, what it
 * costs to join and the one button, then the parts the creator turned on.
 *
 *   on a visitor's page   the data is read on the server for the page
 *                         (lib/communities/server/blocks.ts) and handed in;
 *                         no data, nothing drawn: the switch is off, the
 *                         community is not published and public, or it is
 *                         not this creator's
 *   in the builder        it asks /api/store-builder/communities for the
 *                         same data, and says plainly why a section would
 *                         draw nothing for a visitor
 *   in the add modal      a drawing of the layout, with no names or numbers
 *
 * Every figure is a count of rows; a part with nothing in it is left out
 * rather than drawn empty. Posts, members and leaders are only ever the
 * public previews blocks.ts allows.
 */
import * as React from "react"

import { AppAvatar } from "@/components/app/app-avatar"
import type { CommunityBlockData, CommunityBlockToggles, CommunityChoice } from "@/lib/communities/blocks"
import { compactCount, eventDateBadge, eventTime, memberCountLabel, postCountLabel, relativeTime } from "@/lib/communities/format"
import { themePresets } from "@/lib/store-builder/defaults"
import type { CommunitySettings, GlobalStoreSettings } from "@/lib/store-builder/types"
import { cn } from "@/lib/utils"

const TOGGLE_WORDS: Record<keyof CommunityBlockToggles, string> = {
  showStats: "stats",
  showEvents: "events",
  showPosts: "posts",
  showMembers: "members",
  showLeaderboard: "leaderboard",
  showReviews: "reviews",
  showJoin: "join",
}

/* ── The builder's reads ────────────────────────────────────────────────── */

type Answer = { off: true } | { off: false; communities: CommunityChoice[]; block?: CommunityBlockData | null } | { error: string }

const answers = new Map<string, Promise<Answer>>()

function ask(url: string): Promise<Answer> {
  const hit = answers.get(url)
  if (hit) return hit
  const p = fetch(url, { cache: "no-store", credentials: "same-origin" })
    .then(async (r) => {
      const body = await r.json().catch(() => null)
      if (r.status === 404 && body?.error === "communities_off") return { off: true } as const
      if (!r.ok) return { error: (body && typeof body.error === "string" && body.error) || "Could not read your communities." }
      return { off: false, communities: Array.isArray(body?.communities) ? body.communities : [], block: body?.block ?? null } as Answer
    })
    .catch(() => ({ error: "Could not reach Storelib." }) as Answer)
  answers.set(url, p)
  /* Fresh on the next change: the cache only folds the renders of one change into one request. */
  void p.finally(() => setTimeout(() => answers.delete(url), 15_000))
  return p
}

/** The query a section's settings make, so the builder asks for exactly what the page would show. */
export function blockQuery(settings: Pick<CommunitySettings, "communityId"> & Partial<CommunityBlockToggles>): string {
  const show = (Object.keys(TOGGLE_WORDS) as (keyof CommunityBlockToggles)[]).filter((k) => settings[k]).map((k) => TOGGLE_WORDS[k])
  const p = new URLSearchParams({ id: settings.communityId, show: show.join(",") })
  return `/api/store-builder/communities?${p}`
}

/** The creator's communities and, with a section's settings, its live data. Builder only. */
export function useCreatorCommunities(settings?: CommunitySettings | null): { state: "loading" | "off" | "error" | "ready"; communities: CommunityChoice[]; block: CommunityBlockData | null; error: string | null } {
  const url = settings?.communityId ? blockQuery(settings) : "/api/store-builder/communities"
  const [answer, setAnswer] = React.useState<{ url: string; a: Answer } | null>(null)
  React.useEffect(() => {
    let live = true
    void ask(url).then((a) => {
      if (live) setAnswer({ url, a })
    })
    return () => {
      live = false
    }
  }, [url])
  const a = answer?.url === url ? answer.a : null
  if (!a) return { state: "loading", communities: [], block: null, error: null }
  if ("error" in a) return { state: "error", communities: [], block: null, error: a.error }
  if (a.off) return { state: "off", communities: [], block: null, error: null }
  return { state: "ready", communities: a.communities, block: a.block ?? null, error: null }
}

/* ── The section ────────────────────────────────────────────────────────── */

export function UnifiedCommunitySection({
  settings,
  data,
  isMobile,
  isEditorCanvas,
  globalSettings,
}: {
  settings: CommunitySettings
  /** The page's server read; absent in the builder. */
  data?: CommunityBlockData | null
  isMobile?: boolean
  isEditorCanvas?: boolean
  globalSettings?: GlobalStoreSettings
}) {
  if (isEditorCanvas) return <EditorCommunitySection settings={settings} isMobile={isMobile} globalSettings={globalSettings} />
  if (!data) return null
  return <CommunityCard data={data} settings={settings} isMobile={isMobile} globalSettings={globalSettings} />
}

function EditorCommunitySection({ settings, isMobile, globalSettings }: { settings: CommunitySettings; isMobile?: boolean; globalSettings?: GlobalStoreSettings }) {
  const { state, communities, block, error } = useCreatorCommunities(settings)
  const chosen = communities.find((c) => c.id === settings.communityId)
  let note: string | null = null
  if (state === "off") note = "Communities are switched off on Storelib right now, so this section is hidden on your page."
  else if (state === "error") note = error
  else if (state === "ready" && !settings.communityId) note = communities.length ? "Pick one of your communities in this section's settings." : "You have no communities yet. Create one in Community, then pick it here."
  else if (state === "ready" && !chosen) note = "This community is no longer one of yours, so the section shows nothing."
  else if (state === "ready" && chosen && !chosen.shows) note = `${chosen.name} is ${chosen.why?.toLowerCase() ?? "not public"}, so visitors see nothing here until it is published and public.`
  if (state === "ready" && block) return <CommunityCard data={block} settings={settings} isMobile={isMobile} globalSettings={globalSettings} />
  return (
    <div className="mx-auto w-full max-w-[1180px] px-3 sm:px-4 lg:px-6" data-community-section="placeholder">
      <div className="rounded-2xl border-2 border-dashed border-border px-5 py-8 text-center">
        <p className="text-[15px] font-semibold text-foreground">{settings.headline || "Community"}</p>
        <p className="mx-auto mt-1 max-w-md text-[14px] text-muted-foreground">{state === "loading" ? "Loading your community…" : note}</p>
      </div>
    </div>
  )
}

function buttonColours(globalSettings?: GlobalStoreSettings): { background: string; color: string; radius: number } {
  const preset = themePresets[globalSettings?.themePreset ?? "default"] ?? themePresets.default
  return {
    background: preset?.subscribeBar?.buttonColor || globalSettings?.themeColors?.primary || preset?.colors?.primary || "#1a1a2e",
    color: preset?.subscribeBar?.buttonTextColor || "#ffffff",
    radius: preset?.buttonBorderRadius ?? 8,
  }
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-px" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width={size} height={size} viewBox="0 0 20 20" fill={n <= Math.round(value) ? "#f5a524" : "currentColor"} className={n <= Math.round(value) ? "" : "text-foreground/15"}>
          <path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z" />
        </svg>
      ))}
    </span>
  )
}

function PartTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[14px] font-semibold text-foreground">{children}</h3>
}

export function CommunityCard({
  data: d,
  settings,
  isMobile,
  globalSettings,
}: {
  data: CommunityBlockData
  settings: CommunitySettings
  isMobile?: boolean
  globalSettings?: GlobalStoreSettings
}) {
  const spacing = isMobile && settings.mobileSpacing ? settings.mobileSpacing : settings.spacing
  const button = buttonColours(globalSettings)
  const posts = settings.showPosts ? d.posts : []
  const events = settings.showEvents ? d.events : []
  const members = settings.showMembers ? d.members : []
  const leaders = settings.showLeaderboard ? d.leaders : []
  const reviews = settings.showReviews && d.reviews && d.reviews.count > 0 ? d.reviews : null
  const side = events.length > 0 || members.length > 0 || leaders.length > 0
  const stats = settings.showStats
    ? [memberCountLabel(d.memberCount), d.postCount > 0 ? postCountLabel(d.postCount) : null, d.upcomingEventCount ? `${d.upcomingEventCount} upcoming ${d.upcomingEventCount === 1 ? "event" : "events"}` : null].filter(Boolean)
    : []
  const join = settings.showJoin ? (
    <a
      href={d.url}
      className={cn(
        "inline-flex h-11 shrink-0 items-center justify-center px-5 text-[15px] font-semibold transition-opacity hover:opacity-90 active:opacity-80",
        isMobile ? "w-full" : "w-full sm:w-auto",
      )}
      style={{ background: button.background, color: button.color, borderRadius: button.radius }}
      data-community-join
    >
      {d.joinLabel}
    </a>
  ) : null

  return (
    <div className="mx-auto w-full max-w-[1180px] px-3 sm:px-4 lg:px-6" style={{ paddingTop: spacing?.paddingTop, paddingBottom: spacing?.paddingBottom }} data-community-section={d.id}>
      {settings.headline ? <h2 className="mb-4 text-lg font-semibold text-foreground sm:text-xl">{settings.headline}</h2> : null}
      <div className="overflow-hidden rounded-2xl border border-border bg-card text-foreground">
        {d.coverUrl ? (
          <a href={d.url} className="block aspect-[3/1] w-full overflow-hidden bg-foreground/[0.06] sm:aspect-[4/1]" tabIndex={-1} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
          </a>
        ) : null}

        <div className={cn("flex min-w-0 flex-col gap-4 p-4 sm:p-6", !isMobile && "sm:flex-row sm:items-center sm:justify-between")}>
          <div className="flex min-w-0 items-center gap-3.5">
            {d.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.logoUrl} alt="" width={52} height={52} className="h-[52px] w-[52px] shrink-0 rounded-xl border border-border object-cover" loading="lazy" decoding="async" />
            ) : (
              <span aria-hidden className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-foreground/[0.08] text-[20px] font-semibold text-foreground">
                {d.name.trim().charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <a href={d.url} className="block truncate text-[18px] font-semibold leading-6 text-foreground hover:underline sm:text-[20px] sm:leading-7">
                {d.name}
              </a>
              {d.tagline ? <p className="mt-0.5 line-clamp-2 text-[14px] leading-5 text-muted-foreground">{d.tagline}</p> : null}
              {stats.length ? (
                <p className="mt-1 text-[13px] tabular-nums text-muted-foreground" data-community-stats>
                  {stats.join(" · ")}
                </p>
              ) : null}
            </div>
          </div>
          {join && !isMobile ? <div className="hidden shrink-0 sm:block">{join}</div> : null}
        </div>

        {posts.length || side ? (
          <div className={cn("grid border-t border-border", !isMobile && side && posts.length ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : "")}>
            {posts.length ? (
              <div className={cn("min-w-0 p-4 sm:p-6", !isMobile && side && "lg:border-r lg:border-border")}>
                <PartTitle>Latest in the community</PartTitle>
                <ul className="mt-3 divide-y divide-border">
                  {posts.map((p) => (
                    <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                      <a href={d.url} className="block min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-foreground/20">
                        {p.title ? <p className="truncate text-[15px] font-semibold text-foreground">{p.title}</p> : null}
                        {p.excerpt ? <p className={cn("text-[14px] leading-5 text-muted-foreground", p.title ? "mt-0.5 line-clamp-2" : "line-clamp-3 text-foreground/80")}>{p.excerpt}</p> : null}
                        <p className="mt-2 flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
                          {p.author ? <AppAvatar src={p.author.avatarUrl} name={p.author.name} alt="" size={20} tone="theme" className="h-5 w-5" /> : null}
                          <span className="truncate">{p.author?.name ?? "Member"}</span>
                          <span aria-hidden>·</span>
                          <span suppressHydrationWarning className="shrink-0">
                            {relativeTime(p.createdAt)}
                          </span>
                          {p.commentCount > 0 ? <span className="shrink-0 tabular-nums">· {compactCount(p.commentCount)} {p.commentCount === 1 ? "comment" : "comments"}</span> : null}
                        </p>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {side ? (
              <div className={cn("min-w-0 divide-y divide-border", posts.length && "border-t border-border", !isMobile && posts.length && "lg:border-t-0")}>
                {events.length ? (
                  <div className="p-4 sm:p-6">
                    <PartTitle>Coming up</PartTitle>
                    <ul className="mt-3 space-y-3">
                      {events.map((e) => {
                        const badge = eventDateBadge(e.startsAt, e.timezone)
                        return (
                          <li key={e.id} className="flex min-w-0 items-center gap-3">
                            <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-border leading-none" aria-hidden>
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{badge.month}</span>
                              <span className="mt-0.5 text-[16px] font-semibold text-foreground">{badge.day}</span>
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-semibold text-foreground">{e.title}</p>
                              <p className="truncate text-[13px] text-muted-foreground">{eventTime(e.startsAt, e.endsAt, { timeZone: e.timezone })}</p>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : null}

                {members.length ? (
                  <div className="p-4 sm:p-6">
                    <PartTitle>Members</PartTitle>
                    <div className="mt-3 flex min-w-0 items-center gap-3">
                      <div className="flex shrink-0 -space-x-2">
                        {members.slice(0, isMobile ? 6 : 8).map((m, i) => (
                          <AppAvatar key={`${m.name}-${i}`} src={m.avatarUrl} name={m.name} size={32} tone="theme" markWhileLoading className="h-8 w-8 ring-2 ring-[var(--card)]" />
                        ))}
                      </div>
                      <p className="min-w-0 truncate text-[13px] text-muted-foreground">
                        {d.memberCount > members.length ? `and ${compactCount(d.memberCount - members.length)} more` : memberCountLabel(d.memberCount)}
                      </p>
                    </div>
                  </div>
                ) : null}

                {leaders.length ? (
                  <div className="p-4 sm:p-6">
                    <PartTitle>Most active this month</PartTitle>
                    <ol className="mt-3 space-y-2.5">
                      {leaders.map((l) => (
                        <li key={`${l.rank}-${l.name}`} className="flex min-w-0 items-center gap-3 text-[14px]">
                          <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">{l.rank}</span>
                          <AppAvatar src={l.avatarUrl} name={l.name} size={24} tone="theme" markWhileLoading className="h-6 w-6" />
                          <span className="min-w-0 flex-1 truncate text-foreground">{l.name}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{compactCount(l.points)} pts</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {reviews ? (
          <div className="border-t border-border p-4 sm:p-6" data-community-reviews>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Stars value={reviews.average} />
              <span className="text-[14px] font-semibold tabular-nums text-foreground">{reviews.average.toFixed(1)}</span>
              <span className="text-[13px] text-muted-foreground">
                from {compactCount(reviews.count)} {reviews.count === 1 ? "review" : "reviews"}
              </span>
            </div>
            {reviews.items.length ? (
              <div className={cn("mt-3 grid gap-3", !isMobile && "sm:grid-cols-2")}>
                {reviews.items.map((r, i) => (
                  <figure key={`${r.createdAt}-${i}`} className="min-w-0 rounded-xl border border-border p-3.5">
                    <blockquote className="line-clamp-4 text-[14px] leading-5 text-foreground/85">{r.content}</blockquote>
                    <figcaption className="mt-2 flex items-center gap-2 text-[13px] text-muted-foreground">
                      <Stars value={r.rating} size={12} />
                      <span className="truncate">{r.name}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {join ? <div className={cn("border-t border-border p-4", !isMobile && "sm:hidden")}>{join}</div> : null}
      </div>
    </div>
  )
}

/* ── The add modal's picture of it ──────────────────────────────────────── */

/** The layout without names or numbers: the modal shows what the section is, not a made up community. */
export function CommunitySectionSample() {
  const bar = (w: string, h = 14, tone = "rgba(0,0,0,0.12)") => <div style={{ width: w, height: h, background: tone, borderRadius: 6 }} />
  return (
    <div style={{ padding: "36px 28px" }}>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 18, overflow: "hidden", background: "#fff" }}>
        <div style={{ height: 120, background: "#eceef1" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: "#d9dce1" }} />
            <div style={{ display: "grid", gap: 8 }}>
              {bar("190px", 18, "rgba(0,0,0,0.2)")}
              {bar("260px")}
            </div>
          </div>
          <div style={{ width: 130, height: 44, borderRadius: 8, background: "#1a1a2e" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", borderTop: "1px solid #e5e7eb" }}>
          <div style={{ padding: 24, display: "grid", gap: 14, borderRight: "1px solid #e5e7eb" }}>
            {bar("140px", 14, "rgba(0,0,0,0.2)")}
            {bar("88%")}
            {bar("70%")}
            {bar("80%")}
          </div>
          <div style={{ padding: 24, display: "grid", gap: 12 }}>
            {bar("90px", 14, "rgba(0,0,0,0.2)")}
            <div style={{ display: "flex" }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} style={{ width: 32, height: 32, borderRadius: 16, background: "#d9dce1", border: "2px solid #fff", marginLeft: i ? -8 : 0 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
