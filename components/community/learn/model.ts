/**
 * What the Learn pages and the builder are handed (lib/communities/server/
 * learn.ts makes them). Plain data, browser safe: a lock is already in
 * words, a price already formatted, and nothing here is a storage path.
 */
import type { ProgramMode, ProgramStatus } from "@/lib/communities/learn"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

export type ProgramLockReason = "level" | "paid" | "drip" | "tier" | "product" | "role" | "not_member"

export interface ProgramLock {
  reason: ProgramLockReason
  /** "Level 3", "$49", "Opens on Mar 4", "Pro members". */
  label: string
  /** For a drip lock: when it opens (ISO), so the page can count the days in the viewer's zone. */
  opensAt: string | null
  /** For a paid program: the price in cents, and its currency. */
  priceCents: number | null
  currency: string | null
}

export interface ProgramCard {
  /** The program's own id (an older database, before part 102: the course product's id). */
  id: string
  /** A course product attached to the community, or a program made in it. */
  kind: "course" | "program"
  title: string
  summary: string | null
  coverUrl: string | null
  lessons: number
  completedLessons: number
  percent: number
  status: "not_started" | "in_progress" | "completed"
  totalSeconds: number
  /** Only the people who run Learn ever see a draft. */
  draft: boolean
  mode: ProgramMode
  /** "$49" for a paid program, whether or not this viewer has it. */
  priceLabel: string | null
  /** Bought by this viewer. */
  owned: boolean
  locked: ProgramLock | null
  /** /community/<slug>/learn/<id>[?lesson=]. */
  href: string
}

/** One program as the builder edits it. */
export interface BuilderProgram {
  id: string
  kind: "course" | "program"
  /** For an attached course: the product, edited in the product editor. */
  productId: string | null
  title: string
  summary: string
  coverUrl: string | null
  status: ProgramStatus
  mode: ProgramMode
  level: number
  priceCents: number | null
  currency: string
  dripDays: number | null
  lessons: number
  /** Members who bought it (a paid program). */
  buyers: number
  /** Where an attached course's lessons are edited: the product editor. */
  editHref: string | null
}

export interface BuilderLevel {
  level: number
  name: string
}

export interface BuilderCourseChoice {
  id: string
  title: string
  coverUrl: string | null
  status: string
}

export interface LearnBuilderData {
  communityId: string
  slug: string
  /** Part 102 has run: programs can be made and sold. Before it, attached courses only. */
  ready: boolean
  /** Learn is switched on for members. */
  enabled: boolean
  currency: string
  /** The creator's payouts are set up, so a paid program can be bought. */
  canSell: boolean
  programs: BuilderProgram[]
  levels: BuilderLevel[]
  /** The creator's course products that are not attached yet. */
  courses: BuilderCourseChoice[]
}

/** "12 lessons", "1 lesson", "No lessons yet". */
export function lessonsLabel(n: number): string {
  if (n <= 0) return tt("No lessons yet")
  return tt("{n, plural, one {# lesson} other {# lessons}}", { n })
}

/** "Opens on Mar 4" in the viewer's zone, from the stored instant. */
export function opensOnLabel(iso: string, timeZone?: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return tt("Opens soon")
  let day: string
  try {
    day = new Intl.DateTimeFormat(appLocale(), zoned({ month: "short", day: "numeric", timeZone })).format(t)
  } catch {
    day = new Intl.DateTimeFormat(appLocale(), zoned({ month: "short", day: "numeric" })).format(t)
  }
  return tt("Opens on {day}", { day })
}

/** The short line under a locked program's title: what would open it. */
export function lockHint(lock: ProgramLock, now: number = Date.now()): string {
  switch (lock.reason) {
    case "drip": {
      if (!lock.opensAt) return tt("Opens soon")
      const days = Math.max(1, Math.ceil((Date.parse(lock.opensAt) - now) / 86_400_000))
      return days === 1 ? tt("Opens tomorrow") : tt("Opens in {days} days", { days })
    }
    case "level":
      return tt("Opens at {value}", { value: lock.label.toLowerCase() })
    case "paid":
      return tt("Sold separately")
    default:
      return tt("Not part of your membership")
  }
}
