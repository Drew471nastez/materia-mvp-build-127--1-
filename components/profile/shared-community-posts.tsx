"use client"

/**
 * ===========================================================================
 *  "IN <COMMUNITY>": THEIR POSTS WHERE YOU BOTH ARE
 * ===========================================================================
 * On somebody's profile (and their creator page), one section per community
 * the two of you share: the community's logo and name as its heading, then
 * their posts there, six at a time, newest first, with Newer and Older to
 * page through. Each post opens in the community. Only what the viewer may
 * read is ever sent (lib/profile/shared-posts.ts); this draws it.
 *
 * A page is asked for by cursor (GET /api/profile/shared-posts); the pages
 * already seen are kept, so Newer is instant and never asks again. The list
 * keeps its height while the next page comes, so the page under it does not
 * jump, and the section scrolls back into view when it was paged from below.
 *
 * Two looks: Storelib's own on a profile, and the page's scheme on a
 * creator's page (the design tokens storefront-chrome rebinds there).
 */
import Link from "next/link"
import { useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Heart, Loader2, MessageCircle } from "lucide-react"
import { relativeTime } from "@/lib/communities/format"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import type { SharedCommunity, SharedPostsPage, SharedPostView } from "@/lib/profile/shared-view"
import { cn } from "@/lib/utils"

type Tone = "platform" | "storefront"

const LOOK: Record<Tone, { card: string; ink: string; muted: string; rule: string; hover: string; button: string }> = {
  platform: {
    card: "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
    ink: "text-[#1a1a2e]",
    muted: "text-[#6b7280]",
    rule: "divide-[#f0f1f3]",
    hover: "hover:bg-[#f7f7f8]",
    button: "border-[#e4e7ec] bg-white text-[#1a1a2e] hover:border-[#d7dadf] hover:bg-[#f7f7f8]",
  },
  storefront: {
    card: "rounded-2xl border border-border bg-card text-card-foreground shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
    ink: "text-card-foreground",
    muted: "text-muted-foreground",
    rule: "divide-border",
    hover: "hover:bg-muted",
    button: "border-border bg-card text-card-foreground hover:bg-muted",
  },
}

function Logo({ community }: { community: SharedCommunity }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/[0.06] bg-[#f3f4f6] text-[13px] font-semibold text-[#6b7280]">
      {community.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={optimizedImageUrl(community.logoUrl, 64)} alt="" width={32} height={32} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{(community.name.trim()[0] || "·").toUpperCase()}</span>
      )}
    </span>
  )
}

function PostRow({ post, now, tone }: { post: SharedPostView; now: number; tone: Tone }) {
  const look = LOOK[tone]
  return (
    <li data-shared-post="">
      <Link href={post.href} className={cn("-mx-2 flex gap-3 rounded-xl px-2 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-current/20", look.hover)}>
        <span className="min-w-0 flex-1">
          <span className={cn("line-clamp-2 text-[14.5px] font-semibold leading-[1.4] [overflow-wrap:anywhere]", look.ink)}>{post.title}</span>
          {post.excerpt ? <span className={cn("mt-0.5 line-clamp-2 text-[13.5px] leading-[1.5]", look.muted)}>{post.excerpt}</span> : null}
          <span className={cn("mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] tabular-nums", look.muted)}>
            {post.space ? <span className="max-w-[160px] truncate">{post.space}</span> : null}
            {post.space ? <span aria-hidden>·</span> : null}
            <time dateTime={post.at}>{relativeTime(post.at, now, "UTC")}</time>
            {post.reactions > 0 ? (
              <span className="inline-flex items-center gap-1" aria-label={`${post.reactions} likes`}>
                <Heart className="h-3.5 w-3.5" aria-hidden />
                {post.reactions}
              </span>
            ) : null}
            {post.comments > 0 ? (
              <span className="inline-flex items-center gap-1" aria-label={`${post.comments} comments`}>
                <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                {post.comments}
              </span>
            ) : null}
          </span>
        </span>
        {post.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedImageUrl(post.imageUrl, 128)} alt="" width={64} height={64} loading="lazy" decoding="async" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        ) : null}
      </Link>
    </li>
  )
}

export function SharedCommunityPosts({
  userId,
  community,
  initial,
  now,
  firstName,
  tone = "platform",
}: {
  userId: string
  community: SharedCommunity
  initial: SharedPostsPage
  /** The server's clock for the first render, so the times match after hydration. */
  now: number
  firstName: string
  tone?: Tone
}) {
  const look = LOOK[tone]
  /* Every page seen so far, by its cursor; `at` is the one showing. */
  const [pages, setPages] = useState<SharedPostsPage[]>([initial])
  const [at, setAt] = useState(0)
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")
  const ref = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const [hold, setHold] = useState<number | null>(null)
  const page = pages[at]

  const show = (index: number) => {
    setAt(index)
    setHold(null)
    const top = ref.current?.getBoundingClientRect().top ?? 0
    if (top < 0) ref.current?.scrollIntoView({ block: "start", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  }

  const older = async () => {
    if (state === "loading") return
    if (pages[at + 1]) return show(at + 1)
    if (!page.next) return
    setHold(listRef.current?.offsetHeight ?? null)
    setState("loading")
    try {
      const res = await fetch(`/api/profile/shared-posts?${new URLSearchParams({ userId, communityId: community.id, cursor: page.next })}`, { credentials: "include", cache: "no-store" })
      if (!res.ok) throw new Error("shared")
      const next = (await res.json()) as SharedPostsPage
      setPages((list) => [...list.slice(0, at + 1), next])
      setState("idle")
      show(at + 1)
    } catch {
      setHold(null)
      setState("error")
    }
  }

  const hasOlder = !!pages[at + 1] || !!page.next
  return (
    <section ref={ref} className="scroll-mt-20" aria-label={`In ${community.name}`} data-shared-community={community.slug}>
      <h2 className={cn("mb-1.5 text-[15px] font-semibold", tone === "platform" ? "text-[#1a1a2e]" : undefined)}>
        {/* The whole heading opens the community: 40px to a thumb. */}
        <Link href={`/community/${community.slug}`} className="group/in inline-flex min-h-10 max-w-full items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-current/20">
          <Logo community={community} />
          <span className="min-w-0 truncate">
            In <span className="underline-offset-2 group-hover/in:underline">{community.name}</span>
          </span>
        </Link>
      </h2>
      <div className={cn(look.card, "px-4 sm:px-5")}>
        {page.posts.length === 0 ? (
          <p className={cn("py-6 text-center text-[14px]", look.muted)} data-shared-empty="">
            {firstName} has not posted here yet.
          </p>
        ) : (
          <ul ref={listRef} className={cn("divide-y", look.rule, state === "loading" && "opacity-60 transition-opacity")} style={hold ? { minHeight: hold } : undefined} aria-busy={state === "loading" || undefined}>
            {page.posts.map((post) => (
              <PostRow key={post.id} post={post} now={now} tone={tone} />
            ))}
          </ul>
        )}
        {at > 0 || hasOlder ? (
          <div className={cn("flex items-center justify-between gap-3 border-t py-2.5", tone === "platform" ? "border-[#f0f1f3]" : "border-border")} data-shared-pager="">
            <button
              type="button"
              onClick={() => show(at - 1)}
              disabled={at === 0}
              className={cn("inline-flex h-10 items-center gap-1 rounded-xl border px-3 text-[13px] font-medium outline-none transition-colors disabled:pointer-events-none disabled:opacity-40", look.button)}
              data-shared-newer=""
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Newer
            </button>
            <span className={cn("text-[12.5px] tabular-nums", look.muted)} data-shared-page={at + 1}>
              Page {at + 1}
            </span>
            <button
              type="button"
              onClick={() => void older()}
              disabled={!hasOlder || state === "loading"}
              className={cn("inline-flex h-10 items-center gap-1 rounded-xl border px-3 text-[13px] font-medium outline-none transition-colors disabled:pointer-events-none disabled:opacity-40", look.button)}
              data-shared-older=""
            >
              Older
              {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        ) : null}
        {state === "error" ? (
          <p role="alert" className="pb-3 text-center text-[13px] text-[#b42318]">
            That did not load. Try again.
          </p>
        ) : null}
      </div>
    </section>
  )
}
