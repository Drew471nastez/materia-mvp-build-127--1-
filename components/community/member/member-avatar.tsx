"use client"

/**
 * ===========================================================================
 *  A MEMBER'S FACE IN A COMMUNITY
 * ===========================================================================
 * One wrapper around AppAvatar for every person in a community feed, list,
 * chat, event, or notification: the picture is asked for at the size it is
 * drawn (through the optimizer when it can), a quiet default face sits under
 * it from the first frame until the photo arrives, and warm rows decode ahead
 * when they mount so repeats and scroll-backs feel instant.
 */
import type React from "react"
import { useEffect } from "react"
import { AppAvatar, preloadAvatar, type AvatarKind } from "@/components/app/app-avatar"
import type { FeedPostView } from "@/lib/communities/types"

export type MemberAvatarProps = {
  src?: string | null
  name: string
  size: number
  alt?: string
  className?: string
  style?: React.CSSProperties
  sizedByClass?: boolean
  tone?: "light" | "dark" | "theme"
  kind?: AvatarKind
  /** Long lists: fetch only as the row nears the screen. */
  lazy?: boolean
  /** Ask the browser to decode this size as the row is drawn (off when a parent batch-warms). */
  warm?: boolean
}

/** A person in the community: never an empty grey ring while a photo is on its way. */
export function MemberAvatar({ src, name, size, warm = true, lazy = false, kind = "person", ...rest }: MemberAvatarProps) {
  useEffect(() => {
    if (warm && src) preloadAvatar(src, size)
  }, [warm, src, size])
  return <AppAvatar src={src} name={name} size={size} kind={kind} markWhileLoading lazy={lazy} {...rest} />
}

/** Warm the first faces in a directory or picker before they paint. */
export function warmMemberFaces(rows: ReadonlyArray<{ avatarUrl?: string | null }>, size: number, limit = 28) {
  for (const r of rows.slice(0, limit)) preloadAvatar(r.avatarUrl, size)
}

/** Authors and recent commenters on the posts about to be drawn in the feed. */
export function warmPostFaces(posts: ReadonlyArray<FeedPostView>, limit = 32) {
  let n = 0
  for (const p of posts) {
    if (n >= limit) break
    if (p.author?.avatarUrl) {
      preloadAvatar(p.author.avatarUrl, 40)
      n++
    }
    for (const c of p.recentCommenters ?? []) {
      if (n >= limit) break
      preloadAvatar(c.avatarUrl, 24)
      n++
    }
  }
}
