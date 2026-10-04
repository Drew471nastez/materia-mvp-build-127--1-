"use client"

/**
 * ===========================================================================
 *  THE ACTIVITY TAB
 * ===========================================================================
 * A person's public activity, newest first, as one quiet list: a small
 * picture of the thing (the community's logo, the product, the course),
 * one sentence saying what happened with the thing in bold, where it
 * happened under it, and when on the right. A review carries its stars and
 * its words. "Show more" asks the server for the next page by cursor
 * (GET /api/profile/activity); the first page comes with the page.
 *
 * What is public is the server's decision (lib/profile/activity.ts); this
 * only draws it.
 *
 * NEVER EMPTY. The list always ends where the person started: "Joined
 * Storelib", on the day the account was made, once there is nothing older
 * to show. Somebody who has done nothing public yet still has that one
 * true line rather than a blank box.
 *
 * On a creator's page it is drawn in the page's scheme (tone "storefront":
 * the design tokens storefront-chrome rebinds there).
 */
import Link from "next/link"
import { useState } from "react"
import { Loader2, Sparkles, Star } from "lucide-react"
import { relativeTime } from "@/lib/communities/format"
import { secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"

type Tone = "platform" | "storefront"

const LOOK: Record<Tone, { list: string; ink: string; body: string; muted: string; faint: string; hover: string; thumb: string }> = {
  platform: {
    list: "divide-y divide-[#f0f1f3] rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
    ink: "text-[#1a1a2e]",
    body: "text-[#4b5563]",
    muted: "text-[#6b7280]",
    faint: "text-[#9ca3af]",
    hover: "hover:bg-[#f7f7f8]",
    thumb: "border-[#e5e7eb]/80 bg-[#f3f4f6] text-[#9ca3af]",
  },
  storefront: {
    list: "divide-y divide-border rounded-2xl border border-border bg-card text-card-foreground shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
    ink: "text-card-foreground",
    body: "text-muted-foreground",
    muted: "text-muted-foreground",
    faint: "text-muted-foreground",
    hover: "hover:bg-muted",
    thumb: "border-border bg-muted text-muted-foreground",
  },
}

export interface ActivityItemView {
  key: string
  at: string
  kind: "joined" | "posted" | "posted_in" | "completed_course" | "reviewed" | "published"
  title: string
  context: string | null
  excerpt: string | null
  rating: number | null
  href: string | null
  imageUrl: string | null
}

const VERB: Record<ActivityItemView["kind"], string> = {
  joined: "Joined",
  posted: "Posted",
  posted_in: "Posted in",
  completed_course: "Completed",
  reviewed: "Reviewed",
  published: "Published",
}

function Thumb({ src, title, tone }: { src: string | null; title: string; tone: Tone }) {
  return (
    <span className={cn("relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border text-[15px] font-semibold", LOOK[tone].thumb)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{(title.trim()[0] || "·").toUpperCase()}</span>
      )}
    </span>
  )
}

function Row({ item, now, tone }: { item: ActivityItemView; now: number; tone: Tone }) {
  const look = LOOK[tone]
  const verb = VERB[item.kind]
  /* One line beside a 44px picture sits on its middle; more lines hang from its top. */
  const align = item.context || item.excerpt || item.rating ? "items-start" : "items-center"
  const body = (
    <>
      <Thumb src={item.imageUrl} title={item.title} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-3">
          <span className={cn("min-w-0 flex-1 text-[14px] leading-[1.4] [overflow-wrap:anywhere]", look.body)}>
            {verb} <span className={cn("font-semibold", look.ink)}>{item.title}</span>
          </span>
          <time dateTime={item.at} className={cn("shrink-0 text-[12px] tabular-nums", look.faint)}>
            {relativeTime(item.at, now, "UTC")}
          </time>
        </span>
        {item.context ? <span className={cn("mt-0.5 block truncate text-[13px] leading-[1.4]", look.muted)}>{item.context}</span> : null}
        {item.rating ? (
          <span className="mt-1 flex items-center gap-0.5 text-[#f59e0b]" aria-label={`${item.rating} out of 5`}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className={cn("h-3.5 w-3.5", i < (item.rating ?? 0) ? "fill-current" : "text-[#e5e7eb]")} aria-hidden />
            ))}
          </span>
        ) : null}
        {item.excerpt ? <span className={cn("mt-1 line-clamp-3 text-[14px] leading-[1.5]", look.ink)}>{item.excerpt}</span> : null}
      </span>
    </>
  )
  return (
    <li data-profile-activity-item={item.kind}>
      {item.href ? (
        <Link href={item.href} className={cn("group/act -mx-2 flex gap-3 rounded-xl px-2 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-current/15", look.hover, align)}>
          {body}
        </Link>
      ) : (
        <div className={cn("flex gap-3 py-3", align)}>{body}</div>
      )}
    </li>
  )
}

/** The last line of everybody's activity: the day they joined. */
function JoinedRow({ at, now, tone }: { at: string; now: number; tone: Tone }) {
  const look = LOOK[tone]
  return (
    <li data-profile-activity-item="joined_storelib" className="flex items-center gap-3 py-3">
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border", look.thumb)}>
        <Sparkles className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className={cn("min-w-0 flex-1 text-[14px] leading-[1.4]", look.body)}>
        Joined <span className={cn("font-semibold", look.ink)}>Storelib</span>
      </span>
      <time dateTime={at} className={cn("shrink-0 text-[12px] tabular-nums", look.faint)}>
        {relativeTime(at, now, "UTC")}
      </time>
    </li>
  )
}

export function ProfileActivity({
  userId,
  initial,
  initialNext,
  now,
  hiddenNote,
  emptyText,
  joinedAt = null,
  tone = "platform",
  lead,
}: {
  userId: string
  initial: ActivityItemView[]
  initialNext: string | null
  /** The server's clock for the first render, so the times match after hydration. */
  now: number
  /** Shown above the list on your own profile when it is hidden from everyone else. */
  hiddenNote?: React.ReactNode
  emptyText: string
  /** When the account was made (ISO): the list's last line, so it is never empty. */
  joinedAt?: string | null
  tone?: Tone
  /** Drawn above the list: the "In <community>" sections on somebody else's profile. */
  lead?: React.ReactNode
}) {
  const look = LOOK[tone]
  const [items, setItems] = useState(initial)
  const [next, setNext] = useState(initialNext)
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")

  const more = async () => {
    if (!next || state === "loading") return
    setState("loading")
    try {
      const res = await fetch(`/api/profile/activity?${new URLSearchParams({ userId, cursor: next })}`, { credentials: "include", cache: "no-store" })
      if (!res.ok) throw new Error("activity")
      const data = (await res.json()) as { items: ActivityItemView[]; next: string | null }
      setItems((prev) => [...prev, ...data.items.filter((it) => !prev.some((p) => p.key === it.key))])
      setNext(data.next)
      setState("idle")
    } catch {
      setState("error")
    }
  }

  return (
    <div className="mx-auto w-full max-w-[680px]" data-profile-activity="">
      {lead ? <div className="mb-8 space-y-8">{lead}</div> : null}
      {hiddenNote}
      {items.length === 0 && !(joinedAt && !next) ? (
        <p className={cn("rounded-2xl border border-dashed px-6 py-10 text-center text-[14px]", tone === "platform" ? "border-[#e5e7eb] text-[#6b7280]" : "border-border text-muted-foreground")} data-profile-activity-empty="">
          {emptyText}
        </p>
      ) : (
        <ul className={cn(look.list, "px-4 sm:px-5")}>
          {items.map((it) => (
            <Row key={it.key} item={it} now={now} tone={tone} />
          ))}
          {joinedAt && !next ? <JoinedRow at={joinedAt} now={now} tone={tone} /> : null}
        </ul>
      )}
      {state === "error" ? (
        <p role="alert" className="mt-3 text-center text-[13px] text-[#b42318]">
          That did not load. Try again.
        </p>
      ) : null}
      {next ? (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => void more()} disabled={state === "loading"} className={cn(tone === "platform" ? secondaryDepth : "inline-flex items-center justify-center gap-1.5 border border-border bg-card font-medium text-card-foreground hover:bg-muted", "h-10 min-w-[160px] rounded-xl px-5 text-[14px]")} data-profile-activity-more="">
            {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Show more
          </button>
        </div>
      ) : null}
    </div>
  )
}
