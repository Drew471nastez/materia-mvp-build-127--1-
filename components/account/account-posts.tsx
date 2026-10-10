"use client"

/**
 * ===========================================================================
 *  YOUR POSTS, ON YOUR ACCOUNT PAGE (round 16)
 * ===========================================================================
 * The Posts pill of /account (app/account/posts/page.tsx). The owner: "the
 * account user profile page should be how it was before, but optimized for
 * our things." Round 15 listed my posts from every community on a card of
 * its own inside the community; the list is the same (myPostsPage, with the
 * same Edit and Delete rights), drawn here the way the account page draws
 * its Activity (components/profile/profile-activity.tsx): one white list on
 * a hairline, a 44px picture of the thing, the words, where and when in grey,
 * and Show more under it.
 *
 *   A ROW        the post's own picture, else its community's logo; the
 *                title in ink and two lines of it in grey; the community,
 *                the space and how long ago; the likes and comments when it
 *                has any. Pressed, the post opens on its own page.
 *   THE DOTS     Edit post (the post page with its editor open) and Delete
 *                post, each only where the row says I may (ownPostRights):
 *                a menu on a computer, the app's sheet on a phone
 *                (ResponsiveActionMenu).
 *   DELETE       asks first in Storelib's own sheet (ConfirmSheet), through
 *                the post's own route, and the row folds away (its height
 *                and opacity together, FOLD_MS) only once the server said
 *                yes. A refusal is said under the list and nothing moves.
 *   A PULL       at the top of the page reads the first page again
 *                (ACCOUNT_REFRESH_SCOPE, as the Activity list does).
 */
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { MenuDotsIcon } from "@solar-icons/react/linear/menu-dots"
import { PenIcon } from "@solar-icons/react/linear/pen"
import { TrashBinMinimalisticIcon } from "@solar-icons/react/linear/trash-bin-minimalistic"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { secondaryDepth } from "@/components/ui/depth-button"
import { PULL_REFRESH_EVENT, type PullRefreshDetail } from "@/components/ui/pull-to-refresh"
import { ConfirmSheet, type ConfirmState } from "@/components/community/member/report-confirm"
import { api, apiBase } from "@/components/community/member/api"
import { relativeTime } from "@/lib/communities/format"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { postEditHref, type ProfilePostView, type ProfilePostsPage } from "@/lib/communities/member-profile-view"
import { ACCOUNT_REFRESH_SCOPE } from "@/lib/profile/refresh-scope"
import { cn } from "@/lib/utils"
import { markPostFromAccount, takeAccountPostsStale } from "@/lib/profile/post-return"

/** The next page's address (app/api/account/posts/route.ts). */
export const ACCOUNT_POSTS_API = "/api/account/posts"
/** The fold of a deleted row: the same as round 15's list. */
export const FOLD_MS = 220
const FOLD_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

/** The Activity list's own look (profile-activity.tsx, tone "platform"), so the two pills read as one page. */
const LIST = "divide-y divide-[#f0f1f3] rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
const DOTS =
  "inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-full text-[#9ca3af] outline-none transition-colors duration-150 pointer-fine:hover:bg-[#f1f2f4] pointer-fine:hover:text-[#1a1a2e] active:bg-[#eceef1] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent]"

function counts(post: ProfilePostView): string | null {
  const parts: string[] = []
  if (post.reactions > 0) parts.push(`${post.reactions} ${post.reactions === 1 ? "like" : "likes"}`)
  if (post.comments > 0) parts.push(`${post.comments} ${post.comments === 1 ? "comment" : "comments"}`)
  return parts.length ? parts.join(" · ") : null
}

function Thumb({ post }: { post: ProfilePostView }) {
  const src = post.imageUrl ? optimizedImageUrl(post.imageUrl, 88) : post.community.logoUrl ? optimizedImageUrl(post.community.logoUrl, 88) : null
  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#e5e7eb]/80 bg-[#f3f4f6] text-[15px] font-semibold text-[#9ca3af]" data-account-post-thumb={post.imageUrl ? "post" : "community"}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={44} height={44} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{(post.community.name.trim()[0] || "·").toUpperCase()}</span>
      )}
    </span>
  )
}

function Row({ post, now, onDelete }: { post: ProfilePostView; now: number; onDelete: (post: ProfilePostView, row: HTMLElement | null) => void }) {
  const router = useRouter()
  const row = useRef<HTMLLIElement | null>(null)
  const items: ActionMenuItem[] = []
  if (post.canEdit)
    items.push({
      label: "Edit post",
      icon: <PenIcon size={16} />,
      onClick: () => {
        /* The post opens over its feed with its editor (?edit=1, shared-post.tsx) and closes back here. */
        markPostFromAccount(post.id)
        router.push(postEditHref(post.href))
      },
    })
  if (post.canDelete) items.push({ label: "Delete post", icon: <TrashBinMinimalisticIcon size={16} />, variant: "destructive", onClick: () => onDelete(post, row.current) })
  const tally = counts(post)
  return (
    <li ref={row} className="relative" data-account-post={post.id}>
      <Link
        href={post.href}
        onClick={() => markPostFromAccount(post.id)}
        className={cn("-mx-2 flex items-start gap-3 rounded-xl px-2 py-3 outline-none transition-colors hover:bg-[#f7f7f8] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15", items.length ? "pr-11" : "")}
      >
        <Thumb post={post} />
        <span className="min-w-0 flex-1">
          <span className="block line-clamp-2 text-[14px] font-semibold leading-[1.4] text-[#1a1a2e] [overflow-wrap:anywhere]" data-account-post-title="">
            {post.title}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] leading-[1.4] text-[#6b7280]" data-account-post-where="">
            <span className="min-w-0 truncate">{post.community.name}</span>
            {post.space ? (
              <>
                <span aria-hidden className="text-[#c4c8cf]">·</span>
                <span className="min-w-0 max-w-[40%] truncate">{post.space}</span>
              </>
            ) : null}
            <span aria-hidden className="text-[#c4c8cf]">·</span>
            <time dateTime={post.at} className="shrink-0 tabular-nums">
              {relativeTime(post.at, now, "UTC")}
            </time>
          </span>
          {post.excerpt ? <span className="mt-1 block line-clamp-2 text-[14px] leading-[1.5] text-[#4b5563] [overflow-wrap:anywhere]">{post.excerpt}</span> : null}
          {tally ? <span className="mt-1 block text-[12px] tabular-nums text-[#9ca3af]">{tally}</span> : null}
        </span>
      </Link>
      {items.length ? (
        <div className="absolute -right-2 top-2">
          <ResponsiveActionMenu
            title="Your post"
            align="end"
            items={items}
            trigger={
              <button type="button" aria-label="Post options" className={DOTS} data-account-post-more="">
                <MenuDotsIcon size={20} />
              </button>
            }
          />
        </div>
      ) : null}
    </li>
  )
}

export function AccountPosts({ initial, now }: { initial: ProfilePostsPage; now: number }) {
  const [posts, setPosts] = useState(initial.posts)
  const [next, setNext] = useState(initial.next)
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")
  const [said, setSaid] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [clock, setClock] = useState(now)
  useEffect(() => setClock(Date.now()), [])

  const more = async () => {
    if (!next || state === "loading") return
    setState("loading")
    const r = await api<ProfilePostsPage>(`${ACCOUNT_POSTS_API}?${new URLSearchParams({ cursor: next })}`)
    if (!r.ok) {
      setState("error")
      return
    }
    setPosts((list) => {
      const have = new Set(list.map((p) => p.id))
      return [...list, ...r.data.posts.filter((p) => !have.has(p.id))]
    })
    setNext(r.data.next)
    setState("idle")
  }

  /* A pull at the top of the page: the first page again, in place of what Show more had grown the list to. A failed read keeps the list. */
  const first = useRef<() => Promise<void>>(() => Promise.resolve())
  first.current = async () => {
    const r = await api<ProfilePostsPage>(ACCOUNT_POSTS_API)
    if (!r.ok || !Array.isArray(r.data.posts)) return
    setPosts(r.data.posts)
    setNext(r.data.next ?? null)
    setState("idle")
    setClock(Date.now())
  }
  /* Back from a post opened here (lib/profile/post-return.ts): the router kept this page as it was, so its first page is read again, quietly. */
  useEffect(() => {
    if (takeAccountPostsStale()) void first.current()
  }, [])
  useEffect(() => {
    const onPull = (event: Event) => {
      const detail = (event as CustomEvent<PullRefreshDetail>).detail
      if (!detail || detail.scope !== ACCOUNT_REFRESH_SCOPE) return
      detail.done = first.current()
    }
    window.addEventListener(PULL_REFRESH_EVENT, onPull)
    return () => window.removeEventListener(PULL_REFRESH_EVENT, onPull)
  }, [])

  const remove = (post: ProfilePostView, row: HTMLElement | null) =>
    setConfirm({
      title: "Delete this post?",
      detail: `It goes for everyone in ${post.community.name}, with its comments.`,
      action: "Delete",
      danger: true,
      run: async () => {
        const r = await api(`${apiBase(post.community.id)}/posts/${post.id}`, { method: "DELETE" })
        if (!r.ok) {
          setSaid(r.error)
          return false
        }
        setSaid(null)
        /* The server said yes: the row folds away (its height and its opacity together), then leaves the list. */
        const gone = () => setPosts((list) => list.filter((p) => p.id !== post.id))
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        if (row && typeof row.animate === "function" && !reduced) {
          row.style.overflow = "hidden"
          const fold = row.animate(
            [
              { height: `${row.offsetHeight}px`, opacity: 1 },
              { height: "0px", opacity: 0 },
            ],
            { duration: FOLD_MS, easing: FOLD_EASE, fill: "forwards" },
          )
          fold.onfinish = gone
          window.setTimeout(gone, FOLD_MS + 120)
        } else gone()
        return true
      },
    })

  return (
    <div className="mx-auto w-full max-w-[680px]" data-account-posts="">
      {posts.length === 0 && !next ? (
        <div className={cn(LIST, "px-6 py-12 text-center")} data-account-posts-empty="">
          <p className="mx-auto max-w-[36ch] text-[14px] leading-[1.55] text-[#6b7280]">Nothing posted yet. What you post in your communities shows up here, to edit or delete.</p>
        </div>
      ) : (
        <ul className={cn(LIST, "px-4 sm:px-5")} aria-label="Your posts">
          {posts.map((post) => (
            <Row key={post.id} post={post} now={clock} onDelete={remove} />
          ))}
        </ul>
      )}
      {said || state === "error" ? (
        <p role="alert" className="mt-3 text-center text-[13px] text-[#b42318]" data-account-posts-error="">
          {said ?? "That did not load. Try again."}
        </p>
      ) : null}
      {next ? (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={() => void more()} disabled={state === "loading"} className={cn(secondaryDepth, "h-10 min-w-[160px] rounded-xl px-5 text-[14px]")} data-account-posts-more="">
            {state === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Show more
          </button>
        </div>
      ) : null}
      <ConfirmSheet state={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
