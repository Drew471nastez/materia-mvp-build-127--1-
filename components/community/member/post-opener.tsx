"use client"

/**
 * ===========================================================================
 *  A POST NOBODY ON SCREEN HOLDS, OPENED OVER THE PLACE (round 16)
 * ===========================================================================
 * The owner: "it glitches and flashes things in the community feed. It also
 * happens on the profile page." A post's row on a person's profile asks for
 * the post with openPost(id) (lib/communities/client/open-post.ts), and only
 * a card on screen could answer. On a profile there is none (the feed is
 * kept hidden under <Activity>, its cards' effects let go), so the request
 * fell through to the post's own page BY ADDRESS: a whole page load, the
 * feed drawn again under a post, and closing it went to the feed, not back
 * to the profile.
 *
 * This is the place host's answer, asked only after every card has said no
 * (addOpenPostFallback): it reads the post by its id and opens it over the
 * place on screen, exactly as a card would (post-overlay.tsx, on a phone the
 * sheet of post-fullscreen.tsx), so the place under it stays as it was.
 * The read is quick (the API's one post read); while it is on its way the
 * press has been answered and nothing else happens. A post it cannot read
 * (gone, not allowed, no connection) opens its own page by address, as
 * before, so a press is never dead.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"
import { addOpenPostFallback, postFallbackHref } from "@/lib/communities/client/open-post"
import { api, apiBase } from "./api"
import { readAheadComments } from "./comments"
import { PostCard } from "./post-card"
import { PostOverlay, type PostUpdateFn } from "./post-overlay"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function PostOpener({ communityId, slug, viewer, readOnly }: { communityId: string; slug: string; viewer: ViewerView; readOnly: boolean }) {
  const [post, setPost] = useState<FeedPostView | null>(null)
  /* What was pressed (a profile's row, a notification): the post grows out of it and lands back on it (round 17). */
  const from = useRef<HTMLElement | null>(null)
  /* The read on its way (one at a time: a second press while it comes is the same post or a change of mind, the last wins). */
  const asked = useRef(0)
  useEffect(
    () =>
      addOpenPostFallback((req) => {
        /* Only a whole id can be read; a short one (from an address) is left to the post's own page. */
        if (!UUID.test(req.postId)) return false
        const ticket = ++asked.current
        from.current = req.from
        void readAheadComments(communityId, req.postId)
        void api<{ post: FeedPostView }>(`${apiBase(communityId)}/posts/${req.postId}`).then((r) => {
          if (ticket !== asked.current) return
          if (r.ok && r.data?.post) return setPost(r.data.post)
          const href = postFallbackHref(window.location.pathname, req.postId)
          if (href) window.location.assign(href)
        })
        return true
      }),
    [communityId],
  )
  const update = useCallback<PostUpdateFn>((id, fn) => {
    /* A post deleted here closes on its own move (post-overlay.tsx local), so it is not taken away under it. */
    setPost((p) => (p && p.id === id ? (fn(p) ?? p) : p))
  }, [])
  const close = useCallback(() => {
    asked.current++
    setPost(null)
  }, [])
  if (!post) return null
  return (
    <PostOverlay
      key={post.id}
      post={post}
      slug={slug}
      viewer={viewer}
      readOnly={readOnly}
      update={update}
      onClose={close}
      origin={() => (from.current?.isConnected ? from.current : null)}
      renderPost={(p, u, focus) => <PostCard post={p} slug={slug} viewer={viewer} update={u} full readOnly={readOnly} onComment={focus} />}
    />
  )
}
