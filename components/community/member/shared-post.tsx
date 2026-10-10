"use client"

/**
 * A shared post address opens that post over the community feed, not as its
 * own page. Closing it, or Back, returns to the feed.
 *
 * ROUND 16: THE FEED UNDER IT IS NEVER DRAWN AGAIN. The page under the post
 * is the shell's own feed (the post route seeds it, page.tsx), so closing
 * only gives the address back, in place (history.replaceState, which Next
 * follows without asking the server for anything): the feed already on
 * screen is the one the member lands on. It used to be a router move (replace), a
 * second page for the feed, every card and picture drawn again under the
 * post as it went.
 *
 * ROUND 17: ?edit=1 OPENS THE EDITOR, AND A POST OPENED FROM YOUR ACCOUNT
 * CLOSES BACK TO IT. Edit post on the account's Posts pill (and on a
 * person's profile, lib/communities/member-profile-view.ts postEditHref)
 * arrives here with ?edit=1, which only the old post page read: since round
 * 16 opened a post's address over the feed, the editor never opened and Edit
 * post did nothing but show the post. The parameter leaves the address as it
 * is read, and the card opens its editor (PostCard autoEdit, the author's
 * own post only). And a post the account opened (lib/profile/post-return.ts)
 * goes back to the account when it closes, not into the community's feed.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { markAccountPostsStale, takePostFromAccount } from "@/lib/profile/post-return"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"
import type { PostUpdateFn } from "./post-overlay"
import { PostCard } from "./post-card"
import { PostOverlay } from "./post-overlay"

/**
 * One step back, and on past any step left at this same address: an editor or a sheet opened over the post can leave
 * one behind (it is how Back closes them on a phone), and landing on it would leave the post's address up with the post
 * gone. A few at most, and nothing once the address has changed.
 */
function backPastThisPost() {
  const here = window.location.pathname
  let left = 3
  const onPop = () => {
    if (window.location.pathname === here && left-- > 0) {
      window.history.back()
      return
    }
    window.removeEventListener("popstate", onPop)
  }
  window.addEventListener("popstate", onPop)
  window.setTimeout(() => window.removeEventListener("popstate", onPop), 3000)
  window.history.back()
}

export function SharedPost({
  slug,
  post,
  viewer,
  readOnly,
  children,
}: {
  slug: string
  post: FeedPostView
  viewer: ViewerView
  readOnly: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  /*
    Read on the first render in the browser, not in an effect after it: the overlay draws its card once (post-overlay.tsx
    keeps it in a memo of the post), so a later change of mind would never reach it. It changes no markup, only what the
    card does once it is up, so the server's false and the browser's true hydrate alike.
  */
  const [autoEdit] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("edit") === "1")
  const fromAccount = useRef(false)
  useEffect(() => {
    fromAccount.current = takePostFromAccount(post.id)
    const url = new URL(window.location.href)
    if (url.searchParams.get("edit") !== "1") return
    url.searchParams.delete("edit")
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const update = useCallback<PostUpdateFn>((id, fn) => {
    void id
    void fn
  }, [])
  return (
    <>
      {children}
      {open ? (
        <PostOverlay
          post={post}
          slug={slug}
          viewer={viewer}
          readOnly={readOnly}
          history={false}
          update={update}
          onClose={() => {
            setOpen(false)
            if (fromAccount.current && window.history.length > 1) {
              /* Back to the account's Posts, which reads its list again (an edit or a delete made here). */
              markAccountPostsStale()
              backPastThisPost()
              return
            }
            const home = `/community/${slug}`
            if (window.location.pathname !== home) window.history.replaceState(window.history.state, "", home)
          }}
          renderPost={(p, u, focus) => <PostCard post={p} slug={slug} viewer={viewer} update={u} full readOnly={readOnly} onComment={focus} autoEdit={autoEdit} />}
        />
      ) : null}
    </>
  )
}
