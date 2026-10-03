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
 */
import Link from "next/link"
import { useState } from "react"
import { Loader2, Star } from "lucide-react"
import { relativeTime } from "@/lib/communities/format"
import { secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"

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

function Thumb({ src, title }: { src: string | null; title: string }) {
  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#e5e7eb]/80 bg-[#f3f4f6] text-[15px] font-semibold text-[#9ca3af]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{(title.trim()[0] || "·").toUpperCase()}</span>
      )}
    </span>
  )
}

function Row({ item, now }: { item: ActivityItemView; now: number }) {
  const verb = VERB[item.kind]
  /* One line beside a 44px picture sits on its middle; more lines hang from its top. */
  const align = item.context || item.excerpt || item.rating ? "items-start" : "items-center"
  const body = (
    <>
      <Thumb src={item.imageUrl} title={item.title} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 text-[14px] leading-[1.4] text-[#4b5563] [overflow-wrap:anywhere]">
            {verb} <span className="font-semibold text-[#1a1a2e]">{item.title}</span>
          </span>
          <time dateTime={item.at} className="shrink-0 text-[12px] tabular-nums text-[#9ca3af]">
            {relativeTime(item.at, now, "UTC")}
          </time>
        </span>
        {item.context ? <span className="mt-0.5 block truncate text-[13px] leading-[1.4] text-[#6b7280]">{item.context}</span> : null}
        {item.rating ? (
          <span className="mt-1 flex items-center gap-0.5 text-[#f59e0b]" aria-label={`${item.rating} out of 5`}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className={cn("h-3.5 w-3.5", i < (item.rating ?? 0) ? "fill-current" : "text-[#e5e7eb]")} aria-hidden />
            ))}
          </span>
        ) : null}
        {item.excerpt ? <span className="mt-1 line-clamp-3 block text-[14px] leading-[1.5] text-[#374151]">{item.excerpt}</span> : null}
      </span>
    </>
  )
  return (
    <li data-profile-activity-item={item.kind}>
      {item.href ? (
        <Link href={item.href} className={cn("group/act -mx-2 flex gap-3 rounded-xl px-2 py-3 outline-none transition-colors hover:bg-[#f7f7f8] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15", align)}>
          {body}
        </Link>
      ) : (
        <div className={cn("flex gap-3 py-3", align)}>{body}</div>
      )}
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
}: {
  userId: string
  initial: ActivityItemView[]
  initialNext: string | null
  /** The server's clock for the first render, so the times match after hydration. */
  now: number
  /** Shown above the list on your own profile when it is hidden from everyone else. */
  hiddenNote?: React.ReactNode
  emptyText: string
}) {
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
      {hiddenNote}
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#e5e7eb] px-6 py-10 text-center text-[14px] text-[#6b7280]" data-profile-activity-empty="">
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-[#f0f1f3] rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:px-5">
          {items.map((it) => (
            <Row key={it.key} item={it} now={now} />
          ))}
        </ul>
      )}
      {state === "error" ? (
        <p role="alert" className="mt-3 text-center text-[13px] text-[#b42318]">
          That did not load. Try again.
        </p>
      ) : null}
      {next ? (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => void more()} disabled={state === "loading"} className={cn(secondaryDepth, "h-10 min-w-[160px] rounded-xl px-5 text-[14px]")} data-profile-activity-more="">
            {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Show more
          </button>
        </div>
      ) : null}
    </div>
  )
}
