"use client"

/**
 * A shared post address opens that post over the community feed, not as its
 * own page. Closing it, or Back, returns to the feed.
 */
import { useRouter } from "next/navigation"
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
  const router = useRouter()
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
            router.replace(`/community/${slug}`, { scroll: false })
          }}
          renderPost={(p, u, focus) => <PostCard post={p} slug={slug} viewer={viewer} update={u} full readOnly={readOnly} onComment={focus} />}
        />
      ) : null}
    </>
  )
}
