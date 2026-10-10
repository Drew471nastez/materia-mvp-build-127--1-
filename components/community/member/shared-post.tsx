"use client"

/**
 * A shared post address opens that post over the community feed, not as its
 * own page. Closing it, or Back, returns to the feed.
 *
 * ROUND 16: THE FEED UNDER IT IS NEVER DRAWN AGAIN. The page under the post
 * is the shell's own feed (the post route seeds it, page.tsx), so closing
 * only gives the address back, in place (history.replaceState, which Next
 * follows without asking the server for anything): the feed already on
 * screen is the one the member lands on. It used to be router.replace, a
 * second page for the feed, every card and picture drawn again under the
 * post as it went.
 */
import { useCallback, useState } from "react"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"
import type { PostUpdateFn } from "./post-overlay"
import { PostCard } from "./post-card"
import { PostOverlay } from "./post-overlay"

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
            const home = `/community/${slug}`
            if (window.location.pathname !== home) window.history.replaceState(window.history.state, "", home)
          }}
          renderPost={(p, u, focus) => <PostCard post={p} slug={slug} viewer={viewer} update={u} full readOnly={readOnly} onComment={focus} />}
        />
      ) : null}
    </>
  )
}
