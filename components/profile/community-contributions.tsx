"use client"

/**
 * ===========================================================================
 *  THEIR CONTRIBUTIONS, ONE SECTION PER COMMUNITY
 * ===========================================================================
 * Round 13, ask 30. Each community the viewer may read them in (their own
 * when it is the person themselves, else the ones the two share): the
 * community, what they gave it (level, points, posts), and their posts,
 * six at a time, each opening the post; the person's own can be edited
 * (shared-community-posts.tsx draws a section).
 *
 * A profile hands the sections in from the server. A creator's page is the
 * same page for everyone, so there it asks for the viewer's part once it is
 * in the browser (GET /api/profile/contributions, `only` the communities on
 * the tab), and draws nothing until it has some: no spinner, no empty box,
 * and the page under it never jumps for a section that is not there.
 */
import { useEffect, useState } from "react"
import type { ContributionSection } from "@/lib/profile/shared-view"
import { SharedCommunityPosts } from "./shared-community-posts"

type Tone = "platform" | "storefront"

export function CommunityContributions({
  userId,
  firstName,
  initial = null,
  only = null,
  tone = "storefront",
  now: nowProp,
}: {
  userId: string
  firstName: string
  /** The sections the server read; null asks for them from here. */
  initial?: ContributionSection[] | null
  /** Only these communities (a creator page: the ones they made). */
  only?: string[] | null
  tone?: Tone
  now?: number
}) {
  const [sections, setSections] = useState<ContributionSection[] | null>(initial)
  const [now] = useState(() => nowProp ?? Date.now())
  const onlyKey = only ? only.join(",") : ""
  useEffect(() => {
    if (initial) return
    let gone = false
    const q = new URLSearchParams({ userId })
    if (onlyKey) q.set("only", onlyKey)
    fetch(`/api/profile/contributions?${q}`, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { sections?: ContributionSection[] } | null) => {
        if (!gone && data?.sections?.length) setSections(data.sections)
      })
      .catch(() => {})
    return () => {
      gone = true
    }
  }, [initial, userId, onlyKey])
  if (!sections?.length) return null
  return (
    <div className="space-y-6 motion-safe:animate-[fade-in_220ms_cubic-bezier(0.22,1,0.36,1)]" data-community-contributions="">
      {sections.map((s) => (
        <SharedCommunityPosts key={s.community.id} userId={userId} community={s.community} initial={s.page} now={now} firstName={firstName} tone={tone} stats={s.stats} own={s.own} />
      ))}
    </div>
  )
}
