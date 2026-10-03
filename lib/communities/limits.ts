/**
 * ===========================================================================
 *  HOW LONG, HOW MANY, HOW OFTEN
 * ===========================================================================
 * The lengths are the CHECKs in supabase/sql/run-now/79_communities.sql, so
 * a route that checks here first answers with a plain message instead of a
 * database error. The rate windows go to rateLimit() (lib/api/rate-limit.ts)
 * with one bucket per kind of write, per member; uploads use the shared
 * uploadRateLimit() (lib/storage/upload-guard.ts) like every other upload.
 * Pure and browser safe, so an editor can count characters with the same
 * numbers the server refuses at.
 */
import type { SpaceKind, PostRole } from "./types"

export interface LengthRule {
  min: number
  max: number
}

export const LENGTHS = {
  communityName: { min: 1, max: 80 },
  slug: { min: 3, max: 48 },
  tagline: { min: 0, max: 160 },
  description: { min: 0, max: 20000 },
  seoTitle: { min: 0, max: 200 },
  seoDescription: { min: 0, max: 500 },
  tierName: { min: 1, max: 60 },
  tierDescription: { min: 0, max: 500 },
  spaceName: { min: 1, max: 40 },
  spaceDescription: { min: 0, max: 200 },
  postTitle: { min: 0, max: 200 },
  postBody: { min: 0, max: 20000 },
  commentBody: { min: 1, max: 5000 },
  messageBody: { min: 1, max: 4000 },
  pollQuestion: { min: 1, max: 200 },
  pollOption: { min: 1, max: 100 },
  reportNote: { min: 0, max: 500 },
  requestNote: { min: 0, max: 500 },
  bio: { min: 0, max: 280 },
  eventTitle: { min: 1, max: 140 },
  eventDescription: { min: 0, max: 10000 },
  levelName: { min: 1, max: 40 },
  badgeName: { min: 1, max: 60 },
  notificationTitle: { min: 1, max: 200 },
  notificationBody: { min: 0, max: 500 },
} as const satisfies Record<string, LengthRule>

export type LengthKey = keyof typeof LENGTHS

/** Whether a trimmed value fits a length rule. */
export function fits(value: string | null | undefined, key: LengthKey): boolean {
  const n = (value ?? "").trim().length
  const rule: LengthRule = LENGTHS[key]
  return n >= rule.min && n <= rule.max
}

export const POLL_OPTIONS_MIN = 2
export const POLL_OPTIONS_MAX = 10
export const MAX_SPACES = 50
export const MAX_TIERS = 10
export const MAX_LEVELS = 20
export const MAX_MEDIA_PER_POST = 10
export const MAX_RULES = 20
export const MAX_FAQ = 20
export const MAX_BENEFITS = 12
export const MAX_LINKS = 6

/* ── Rate windows: one bucket each, counted per member ──────────────────── */

export interface RateWindowSpec {
  limit: number
  seconds: number
}

export const RATE_LIMITS = {
  /** 10 posts in 10 minutes and 50 a day. */
  post: [{ limit: 10, seconds: 600 }, { limit: 50, seconds: 86400 }],
  comment: [{ limit: 30, seconds: 600 }],
  reaction: [{ limit: 120, seconds: 600 }],
  chat: [{ limit: 30, seconds: 60 }],
  report: [{ limit: 10, seconds: 3600 }],
  invite: [{ limit: 50, seconds: 86400 }],
} as const satisfies Record<string, readonly RateWindowSpec[]>

export type RateBucket = keyof typeof RATE_LIMITS

/** The rateLimit() bucket name for a kind of write, so every route spells it the same. */
export function rateBucket(kind: RateBucket): string {
  return `community-${kind}`
}

/* ── Mentions ───────────────────────────────────────────────────────────── */

export const MAX_MENTIONS_PER_POST = 10

const MENTION = /(^|[^a-z0-9_.@])@([a-z0-9_][a-z0-9_.-]{0,38}[a-z0-9_]|[a-z0-9_])/gi

/** "@everyone" anywhere in the text. Only a role with mention_everyone may send it. */
export function mentionsEveryone(text: string): boolean {
  return /(^|[^a-z0-9_.@])@everyone\b/i.test(text ?? "")
}

/** The usernames mentioned, lowercased and once each, without @everyone, at most MAX_MENTIONS_PER_POST. */
export function extractMentions(text: string): string[] {
  const out: string[] = []
  for (const m of (text ?? "").matchAll(MENTION)) {
    const name = m[2].toLowerCase()
    if (name === "everyone" || out.includes(name)) continue
    out.push(name)
    if (out.length >= MAX_MENTIONS_PER_POST) break
  }
  return out
}

/* ── What a new community starts with ───────────────────────────────────── */

export const DEFAULT_LEVELS: readonly { level: number; name: string; minPoints: number }[] = [
  { level: 1, name: "Newcomer", minPoints: 0 },
  { level: 2, name: "Regular", minPoints: 20 },
  { level: 3, name: "Contributor", minPoints: 60 },
  { level: 4, name: "Insider", minPoints: 150 },
  { level: 5, name: "Core", minPoints: 400 },
  { level: 6, name: "Pillar", minPoints: 1000 },
]

export const DEFAULT_SPACES: readonly { slug: string; name: string; kind: SpaceKind; postRole: PostRole; icon: string }[] = [
  { slug: "general", name: "General", kind: "feed", postRole: "member", icon: "messages-square" },
  { slug: "announcements", name: "Announcements", kind: "announcements", postRole: "admin", icon: "megaphone" },
  { slug: "introductions", name: "Introductions", kind: "feed", postRole: "member", icon: "hand" },
]

/** The free tier a free or invite only community starts with. */
export const DEFAULT_FREE_TIER = { name: "Members" } as const
