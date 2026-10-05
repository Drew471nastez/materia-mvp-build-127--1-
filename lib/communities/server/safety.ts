import "server-only"

/**
 * ===========================================================================
 *  KEEPING SPAM, SCAMS AND ABUSE OUT OF A COMMUNITY
 * ===========================================================================
 * The rules a community applies to every new post, comment, chat message,
 * direct message, join and invite, server side only. A member who writes
 * normally never meets any of them; somebody who trips one hears one short
 * sentence, and the owner sees what happened in the moderation queue
 * (community_reports) and the audit log (community_audit_log).
 *
 * THE RULES, WITH THEIR NUMBERS (SAFETY below):
 *
 *   JOINING      per account (lib/communities/server/join.ts joinRateLimit,
 *                already there) and per address: an HMAC of the IP, never the
 *                IP itself, 20 in ten minutes and 80 a day (joinAddressLimit).
 *   JOIN ALARM   more free or invite joins in ten minutes than the community
 *                can plausibly get (40, or a tenth of its members up to 500)
 *                switches "approval required" on, so new people ask instead
 *                of walking in, and tells the owner. Once in six hours.
 *   INVITES      one link used 25 times in ten minutes is turned off (a link
 *                that leaked); a person or an address trying 10 links that do
 *                not work in an hour waits (guardInvite).
 *   NEW MEMBERS  on their first 24 hours in a community (paid members and the
 *                team are trusted): 3 posts, 20 comments, 40 chat messages and
 *                15 direct messages a day, at most 3 people mentioned at once,
 *                and any link they share is held for a moderator (refused in
 *                chat and direct messages, where nothing can be held).
 *   SLOW MODE    a setting (Moderation, Rules): one post, one comment and one
 *                chat message per member every 30 seconds to an hour.
 *   LINKS        lib/communities/link-check.ts: blocklisted domains and hidden
 *                credentials refused; lookalike, punycode, bare IP and file
 *                like domains held; known shorteners followed (public
 *                addresses only, three steps, 2.5 seconds) and their
 *                destination checked instead.
 *   MENTIONS     at most 10 people in a post, 5 in a comment or message, and
 *                30 a member an hour in a community.
 *   DUPLICATES   the same text (40 letters or more, links reduced to their
 *                domain) posted twice in one community is refused; posted a
 *                third time anywhere by its author, or a fifth time by anyone,
 *                held. In chat and direct messages a fourth copy is refused.
 *   REPORTS      three different active members (past their first day)
 *                reporting the same post, comment or message hide it until a
 *                moderator looks, unless a moderator already put it back once
 *                (hideAfterReports).
 *   WORDS        (round 13) the platform's list (lib/communities/word-blocklist.ts):
 *                sexual content involving children and slurs refused for
 *                everybody, selling sexual content held (refused in chat
 *                and direct messages); the community's own list (Moderation,
 *                Rules) refused or held, as the owner chose. Matching in
 *                lib/communities/word-filter.ts. A refusal is in the log, at
 *                most once in ten minutes per member (screenWords).
 *   PICTURES     (round 13) a post's or comment's pictures read before they
 *                go up (./image-check.ts): clearly explicit refused, likely
 *                adult content held; a member on their first day has a
 *                skin heavy or unreadable picture held, and an uploaded
 *                video held.
 *
 * The owner, admins and moderators skip every rule but the blocklist, the
 * platform's words and a clearly explicit picture.
 *
 * HOW A HOLD WORKS, with nothing new in the database: the post or comment is
 * written with status "removed" and removed_reason "Held for review: ...",
 * removed_by empty (nobody did it by hand), so no counter moves and nobody
 * but moderators sees it. A report with no reporter puts it in the queue,
 * where Approve puts it up (the ordinary restore) and Keep hidden closes it.
 * The author is answered 202 with the post and `held: true`.
 *
 * Counting uses rate_limit_hits, like every limit in Storelib. Like
 * lib/api/rate-limit.ts these rules FAIL OPEN: a database that cannot be
 * read never stops somebody posting; it is logged and the write goes ahead.
 */
import { createHash, createHmac } from "node:crypto"
import { callerAddress, rateLimit } from "@/lib/api/rate-limit"
import { redirectTarget } from "@/lib/api/public-fetch"
import { can } from "../permissions"
import { PAID_SOURCES, type CommunityRow, type PostMedia, type ReportTarget, type Role } from "../types"
import { LINK_REASON_WORDS, checkLink, linksInText, worstOf, type LinkCheck } from "../link-check"
import { compileList, findWords, hasPrintedWord, readText, wordSettingsOf, type CompiledEntry, type ReadText } from "../word-filter"
import { PLATFORM_ADULT, PLATFORM_HATE_PRINTS, PLATFORM_MINORS } from "../word-blocklist"
import { logSecurityEvent } from "@/lib/security/uploads/audit"
import { audit } from "./audit"
import { PICTURE_REFUSED, picturesOf, screenPictures, uploadedVideoCount } from "./image-check"
import { notifyMember } from "./notify"
import { admin, missing, nowIso, reasonOf, type Db } from "./db"
import type { Viewer } from "./context"

/* ── The numbers ────────────────────────────────────────────────────────── */

export const SAFETY = {
  /** How long a member counts as new in a community. */
  newMemberHours: 24,
  /** What a new member may write in a day, per kind. */
  newMemberDaily: { post: 3, comment: 20, message: 40, dm: 15 },
  /** People mentioned in one write, and by a new member. */
  mentionsPerWrite: { post: 10, comment: 5, message: 5, dm: 5 },
  newMemberMentions: 3,
  /** Mentions a member may send in a community in an hour. */
  mentionsPerHour: 30,
  /** The slow mode choices, in seconds. 0 is off. */
  slowModeChoices: [0, 30, 60, 300, 900, 3600] as readonly number[],
  duplicate: {
    /** Shorter texts ("Thanks!", "Welcome") are never compared. */
    minLetters: 40,
    windowSeconds: 86_400,
    /** Earlier copies by the author anywhere before a post or comment is held. */
    authorCopies: 2,
    /** Earlier copies by anybody before it is held. */
    anyoneCopies: 4,
    /** Earlier copies by the author before a chat or direct message is refused. */
    messageCopies: 3,
  },
  /** Different active members whose reports hide content until a moderator looks. */
  autoHideReports: 3,
  join: {
    /** Per address (an HMAC of the IP), joins and invite uses together. */
    perAddress: [
      { limit: 20, seconds: 600 },
      { limit: 80, seconds: 86_400 },
    ],
    alarmSeconds: 600,
    alarmMin: 40,
    alarmShare: 0.1,
    alarmMax: 500,
    /** One alarm per community in this long. */
    alarmQuietSeconds: 6 * 3600,
  },
  invite: {
    /** One link used this many times in burstSeconds is turned off. */
    burst: 25,
    burstSeconds: 600,
    /** Links that did not work, per person and per address, before a wait. */
    misses: 10,
    missSeconds: 3600,
  },
  shortener: { maxLinks: 3, steps: 3, timeoutMs: 2500 },
  /** One log line per member per community in this long for refused words. */
  wordsLogSeconds: 600,
} as const

/** The rate_limit_hits buckets these rules count in. */
export const SAFETY_BUCKETS = {
  slow: "community-slow",
  newMember: "community-newcomer",
  mentions: "community-mentions",
  duplicate: "community-dupe",
  joinAddress: "community-join-ip",
  joinVelocity: "community-join-velocity",
  joinAlarm: "community-join-alarm",
  inviteUse: "community-invite-use",
  inviteMiss: "community-invite-miss",
  words: "community-words",
} as const

export type WriteKind = "post" | "comment" | "message" | "dm"

/** What screenWrite answers: go ahead (holding it when `hold` has reasons), or a refusal with its words. */
export type Screen = { ok: true; hold: string[] } | { ok: false; error: string; status: number }

interface Writer {
  db: Db
  community: CommunityRow
  viewer: Viewer
}

/* ── Counting ───────────────────────────────────────────────────────────── */

/** Swappable in tests: the clock and the short link follower. */
export const safetyDeps = {
  now: (): number => Date.now(),
  follow: (url: string, timeoutMs: number): Promise<string | null> => redirectTarget(url, { timeoutMs }),
}

function since(seconds: number): string {
  return new Date(safetyDeps.now() - seconds * 1000).toISOString()
}

/** How many hits a subject has in a bucket within a window; 0 when it cannot be read (fail open). */
export async function countHits(db: Db, bucket: string, subject: string, seconds: number): Promise<number> {
  try {
    const { count, error } = await db.from("rate_limit_hits").select("id", { count: "exact", head: true }).eq("bucket", bucket).eq("subject", subject).gte("created_at", since(seconds))
    if (error) {
      if (!missing(error)) console.error(`[communities] safety count ${bucket}: ${reasonOf(error)}`)
      return 0
    }
    return count ?? 0
  } catch (e) {
    console.error(`[communities] safety count ${bucket}: ${reasonOf(e)}`)
    return 0
  }
}

/** When a subject was last counted in a bucket within a window, or null. */
async function lastHit(db: Db, bucket: string, subject: string, seconds: number): Promise<number | null> {
  try {
    const { data, error } = await db.from("rate_limit_hits").select("created_at").eq("bucket", bucket).eq("subject", subject).gte("created_at", since(seconds)).order("created_at", { ascending: false }).limit(1)
    if (error || !Array.isArray(data) || !data[0]) return null
    const t = Date.parse(String(data[0].created_at))
    return Number.isFinite(t) ? t : null
  } catch {
    return null
  }
}

/** Counts these, in one insert. Never throws. */
export async function addHits(db: Db, rows: { bucket: string; subject: string }[]): Promise<void> {
  if (!rows.length) return
  try {
    const { error } = await db.from("rate_limit_hits").insert(rows.map((r) => ({ ...r, created_at: new Date(safetyDeps.now()).toISOString() })))
    if (error && !missing(error)) console.error(`[communities] safety hits not counted: ${reasonOf(error)}`)
  } catch (e) {
    console.error(`[communities] safety hits not counted: ${reasonOf(e)}`)
  }
}

/* ── Who the rules apply to ─────────────────────────────────────────────── */

/** The owner, admins and moderators run the community; only the blocklist applies to them. */
export function isTeam(role: Role | null): boolean {
  return can(role, "moderate_content")
}

/**
 * New here: an ordinary member in their first SAFETY.newMemberHours in this
 * community. Somebody who paid to be here is not new in this sense: a
 * payment is the strongest sign a person is real.
 */
export function isNewMember(viewer: Pick<Viewer, "role" | "member">, now: number = safetyDeps.now()): boolean {
  if (isTeam(viewer.role)) return false
  const m = viewer.member
  if (!m || !m.joined_at) return false
  if ((PAID_SOURCES as readonly string[]).includes(m.source)) return false
  const joined = Date.parse(m.joined_at)
  return Number.isFinite(joined) && now - joined < SAFETY.newMemberHours * 3_600_000
}

/** The community's slow mode in seconds (0 off), from its settings (communities.onboarding.safety). */
export function slowModeOf(community: Pick<CommunityRow, "onboarding">): number {
  const raw = Number((community.onboarding as { safety?: { slowModeSeconds?: unknown } } | null)?.safety?.slowModeSeconds ?? 0)
  return SAFETY.slowModeChoices.includes(raw) ? raw : 0
}

/** A slow mode choice from a settings body, or null when it is not one of the choices. */
export function slowModeChoice(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN
  return SAFETY.slowModeChoices.includes(n) ? n : null
}

/** The settings with this slow mode, keeping everything else in them. */
export function withSlowMode(onboarding: unknown, seconds: number): Record<string, unknown> {
  const base = onboarding && typeof onboarding === "object" ? (onboarding as Record<string, unknown>) : {}
  const safety = base.safety && typeof base.safety === "object" ? (base.safety as Record<string, unknown>) : {}
  return { ...base, safety: { ...safety, slowModeSeconds: seconds } }
}

/** The part of the settings these rules own, so saving the welcome steps never drops it. */
export function keptSafety(onboarding: unknown): { safety?: Record<string, unknown> } {
  const s = onboarding && typeof onboarding === "object" ? (onboarding as Record<string, unknown>).safety : undefined
  return s && typeof s === "object" ? { safety: s as Record<string, unknown> } : {}
}

function waitWords(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return minutes === 1 ? "a minute" : `${minutes} minutes`
  return "an hour"
}

/* ── Pure pieces ────────────────────────────────────────────────────────── */

const MENTION = /(^|[^a-z0-9_.@])@([a-z0-9_][a-z0-9_.-]{0,38}[a-z0-9_]|[a-z0-9_])/gi

/** The different people mentioned in a text (not @everyone, which has its own rule), uncapped. */
export function mentionCount(text: string): number {
  const names = new Set<string>()
  for (const m of String(text ?? "").matchAll(MENTION)) {
    const name = m[2].toLowerCase()
    if (name !== "everyone") names.add(name)
  }
  return names.size
}

/**
 * The text reduced to what makes it the same message: lower case, accents
 * dropped, links reduced to their domain (a spammer changes the tracking
 * part), only letters and digits. Null when it is too short to compare.
 */
export function contentFingerprint(text: string): string | null {
  let value = String(text ?? "")
  for (const url of linksInText(value)) {
    try {
      value = value.split(url).join(` ${new URL(url).hostname} `)
    } catch {
      /* already the text */
    }
  }
  value = value.replace(/https?:\/\/([^/\s]+)\S*/gi, " $1 ")
  const plain = value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  const letters = plain.replace(/[^\p{L}]/gu, "").length
  if (letters < SAFETY.duplicate.minLetters) return null
  return createHash("sha256").update(plain, "utf8").digest("hex").slice(0, 32)
}

/** The links a write carries: in its words, and a post's link card. Videos by address are already checked to be YouTube or Vimeo. */
export function linksOf(text: string, media: unknown): string[] {
  const out = linksInText(text)
  for (const m of Array.isArray(media) ? (media as PostMedia[]) : []) {
    if (m && typeof m === "object" && m.type === "link" && typeof m.url === "string" && !out.includes(m.url)) out.push(m.url)
  }
  return out
}

/* ── Links, with shorteners followed ────────────────────────────────────── */

/**
 * Every link's verdict, a shortener replaced by its destination's. A short
 * link that cannot be followed (too many, too slow, no answer) holds.
 */
export async function checkLinks(urls: readonly string[]): Promise<LinkCheck[]> {
  const out: LinkCheck[] = []
  let followed = 0
  /* One budget for the whole write, so three short links never cost three timeouts. */
  const deadline = safetyDeps.now() + SAFETY.shortener.timeoutMs
  for (const url of urls) {
    let check = checkLink(url)
    if (check.verdict === "expand") {
      if (followed++ >= SAFETY.shortener.maxLinks) {
        out.push({ ...check, verdict: "hold", reason: "shortener" })
        continue
      }
      check = await followShortLink(check, deadline)
    }
    out.push(check)
  }
  return out
}

async function followShortLink(start: LinkCheck, deadline: number): Promise<LinkCheck> {
  let current = start
  for (let step = 0; step < SAFETY.shortener.steps; step++) {
    const left = deadline - safetyDeps.now()
    if (left <= 0) break
    let next: string | null = null
    try {
      next = await safetyDeps.follow(current.url, left)
    } catch {
      break
    }
    if (!next) break
    const check = checkLink(next)
    /* The destination decides, under the address the member wrote. */
    if (check.verdict !== "expand") return { ...check, url: start.url }
    current = check
  }
  return { ...start, verdict: "hold", reason: "shortener" }
}

/* ── Words ──────────────────────────────────────────────────────────────── */

const PLATFORM = { minors: compileList(PLATFORM_MINORS), adult: compileList(PLATFORM_ADULT) }

/** What the lists found in a text. */
export interface WordFindings {
  /** Platform: sexual content involving children. */
  minors: string[]
  /** Platform: a slur (fingerprinted, so no words to show). */
  hate: boolean
  /** Platform: selling or trading sexual content. */
  adult: string[]
  /** The community's own list. */
  community: string[]
}

/* The community's list, compiled once per version of it. */
const compiledLists = new Map<string, { key: string; list: CompiledEntry[] }>()
function communityList(community: Pick<CommunityRow, "id" | "onboarding">): { list: CompiledEntry[]; action: "block" | "hold" } {
  const s = wordSettingsOf(community.onboarding)
  const key = `${s.words.join("\n")}`
  let hit = compiledLists.get(community.id)
  if (!hit || hit.key !== key) {
    hit = { key, list: compileList(s.words) }
    if (compiledLists.size > 500) compiledLists.clear()
    compiledLists.set(community.id, hit)
  }
  return { list: hit.list, action: s.action }
}

/** Every list read against a text. The community's list is skipped for the team (they may need to write the words to name them). */
export function wordFindings(community: Pick<CommunityRow, "id" | "onboarding">, read: ReadText, team: boolean): WordFindings {
  return {
    minors: findWords(read, PLATFORM.minors),
    hate: hasPrintedWord(read, PLATFORM_HATE_PRINTS),
    adult: findWords(read, PLATFORM.adult),
    community: team ? [] : findWords(read, communityList(community).list),
  }
}

export const WORDS_REFUSED_PLATFORM = "That can't be shared on Storelib."
export const WORDS_REFUSED_COMMUNITY = "This community doesn't allow some of the words in that. Change them and try again."
const ADULT_HOLD = "words used to sell sexual content"

function quoteWords(entries: string[]): string {
  return entries
    .slice(0, 3)
    .map((e) => `"${e}"`)
    .join(", ")
}

/**
 * The words decision for one write: refused (with which list, for the log),
 * or the reasons to hold it. `chatLike` writes cannot be held, so a hold
 * there is a refusal. Pure.
 */
export function screenWords(
  community: Pick<CommunityRow, "id" | "onboarding">,
  found: WordFindings,
  opts: { team: boolean; chatLike: boolean },
): { refuse: { list: "minors" | "hate" | "adult" | "community"; error: string; entries: string[] } | null; hold: string[] } {
  if (found.minors.length) return { refuse: { list: "minors", error: WORDS_REFUSED_PLATFORM, entries: found.minors }, hold: [] }
  if (found.hate) return { refuse: { list: "hate", error: WORDS_REFUSED_PLATFORM, entries: [] }, hold: [] }
  const hold: string[] = []
  if (found.adult.length && !opts.team) {
    if (opts.chatLike) return { refuse: { list: "adult", error: WORDS_REFUSED_PLATFORM, entries: found.adult }, hold: [] }
    hold.push(ADULT_HOLD)
  }
  if (found.community.length) {
    const { action } = communityList(community)
    if (action === "block" || opts.chatLike) return { refuse: { list: "community", error: WORDS_REFUSED_COMMUNITY, entries: found.community }, hold: [] }
    hold.push(`a word on the community's list (${quoteWords(found.community)})`)
  }
  return { refuse: null, hold }
}

/**
 * A refusal in the community's log (and, for the platform's own lists, the
 * platform's security log too, so a community whose team is the problem is
 * not the only one who knows). At most once per member per community in
 * SAFETY.wordsLogSeconds: somebody retrying twenty times is one line.
 */
async function logWordRefusal(w: Writer, kind: WriteKind, refuse: { list: string; entries: string[] }, text: string): Promise<void> {
  const { db, community, viewer } = w
  const subject = `${community.id}:${viewer.userId}`
  if ((await countHits(db, SAFETY_BUCKETS.words, subject, SAFETY.wordsLogSeconds)) > 0) return
  await addHits(db, [{ bucket: SAFETY_BUCKETS.words, subject }])
  const platform = refuse.list !== "community"
  const shown = refuse.list === "hate" ? "a slur" : quoteWords(refuse.entries)
  const reason = platform ? `Refused: Storelib's word list (${refuse.list === "minors" ? "sexual content involving children" : refuse.list === "hate" ? "slurs" : "selling sexual content"})` : `Refused: the community's word list (${shown})`
  await audit(db, {
    communityId: community.id,
    actorId: null,
    actorKind: "system",
    action: `${kind === "dm" ? "message" : kind}.refused`,
    targetType: kind === "dm" ? "message" : kind,
    targetId: null,
    targetLabel: refuse.list === "hate" ? "Words not shown" : text.replace(/\s+/g, " ").trim().slice(0, 120) || kind,
    reason,
    detail: { authorId: viewer.userId, list: refuse.list, ...(refuse.list === "hate" ? {} : { words: refuse.entries.slice(0, 10) }) },
  })
  if (platform) {
    await logSecurityEvent(db as unknown as Parameters<typeof logSecurityEvent>[0], {
      event: "upload",
      outcome: "refused",
      context: "community_words",
      code: `words_${refuse.list}`,
      userId: viewer.userId,
      detail: { communityId: community.id, kind, ...(refuse.list === "hate" ? {} : { words: refuse.entries.slice(0, 10) }) },
    }).catch(() => undefined)
  }
}

/* ── The screen every write passes ──────────────────────────────────────── */

const REFUSE_LINK = "That link can't be shared here."

/**
 * Whether this write may go up, go up held for review, or not go up. Called
 * by createPost, createComment, postMessage and sendDirectMessage just before
 * their insert; counts the write when it goes ahead.
 */
export async function screenWrite(w: Writer, kind: WriteKind, input: { text: string; media?: unknown }): Promise<Screen> {
  const { db, community, viewer } = w
  const userId = viewer.userId
  if (!userId) return { ok: true, hold: [] }
  const text = String(input.text ?? "")
  const team = isTeam(viewer.role)
  const urls = linksOf(text, input.media)
  const chatLike = kind === "message" || kind === "dm"
  const withPictures = kind === "post" || kind === "comment"

  /* WORDS, for everybody: the platform's lists, and the community's for members. */
  const words = screenWords(community, wordFindings(community, readText(text), team), { team, chatLike })
  if (words.refuse) {
    await logWordRefusal(w, kind, words.refuse, text)
    return { ok: false, error: words.refuse.error, status: 400 }
  }

  /* The team skips everything but the blocklist, the platform's words and a clearly explicit picture. */
  if (team) {
    const blocked = urls.map(checkLink).find((c) => c.verdict === "block")
    if (blocked) return { ok: false, error: REFUSE_LINK, status: 400 }
    if (withPictures && (await screenPictures(db, { communityId: community.id, userId, fresh: false, team: true }, picturesOf(input.media))).refuse) return { ok: false, error: PICTURE_REFUSED, status: 400 }
    return { ok: true, hold: words.hold }
  }

  const fresh = isNewMember(viewer)
  const hits: { bucket: string; subject: string }[] = []
  const here = `${community.id}:${userId}`

  /* MENTIONS. */
  const mentions = mentionCount(text)
  const perWrite = fresh ? Math.min(SAFETY.newMemberMentions, SAFETY.mentionsPerWrite[kind]) : SAFETY.mentionsPerWrite[kind]
  if (mentions > perWrite) return { ok: false, error: `Mention up to ${perWrite} people at a time.`, status: 400 }
  if (mentions > 0) {
    const sent = await countHits(db, SAFETY_BUCKETS.mentions, here, 3600)
    if (sent + mentions > SAFETY.mentionsPerHour) return { ok: false, error: "That is a lot of mentions for one hour. Try again later.", status: 429 }
    for (let i = 0; i < mentions; i++) hits.push({ bucket: SAFETY_BUCKETS.mentions, subject: here })
  }

  /* SLOW MODE: posts, comments and chat, each on its own clock. */
  const slow = kind === "dm" ? 0 : slowModeOf(community)
  if (slow > 0) {
    const subject = `${kind}:${here}`
    const last = await lastHit(db, SAFETY_BUCKETS.slow, subject, slow)
    if (last !== null) {
      const wait = Math.max(1, Math.ceil((last + slow * 1000 - safetyDeps.now()) / 1000))
      return { ok: false, error: `Slow mode is on: one ${kind === "message" ? "message" : kind} every ${waitWords(slow)}. Try again in ${waitWords(wait)}.`, status: 429 }
    }
    hits.push({ bucket: SAFETY_BUCKETS.slow, subject })
  }

  /* A NEW MEMBER'S FIRST DAY. */
  if (fresh) {
    const subject = `${kind}:${here}`
    const today = await countHits(db, SAFETY_BUCKETS.newMember, subject, SAFETY.newMemberHours * 3600)
    const cap = SAFETY.newMemberDaily[kind]
    if (today >= cap) return { ok: false, error: `New members can send ${cap} ${kind === "dm" ? "direct messages" : `${kind}s`} on their first day. You can send more tomorrow.`, status: 429 }
    hits.push({ bucket: SAFETY_BUCKETS.newMember, subject })
  }

  /* LINKS. */
  const hold: string[] = []
  if (urls.length) {
    const checks = await checkLinks(urls)
    const worst = worstOf(checks)
    if (worst?.verdict === "block") return { ok: false, error: REFUSE_LINK, status: 400 }
    if (worst?.verdict === "hold") {
      if (chatLike) return { ok: false, error: "That link can't be sent here. A moderator can check it if you share it in a post.", status: 400 }
      for (const c of checks) if (c.verdict === "hold" && c.reason) hold.push(LINK_REASON_WORDS[c.reason] + (c.imitates ? ` (${c.imitates})` : ""))
    }
    if (fresh) {
      if (chatLike) return { ok: false, error: "Links can be shared here after your first day.", status: 403 }
      hold.push("a link from a member on their first day")
    }
  }

  /* DUPLICATES. */
  const print = contentFingerprint(text)
  if (print) {
    const group = kind === "dm" ? "dm" : kind === "message" ? "message" : "write"
    const mine = `u:${group}:${userId}:${print}`
    const anyone = `t:${group}:${print}`
    if (kind === "post") {
      const inHere = `c:${community.id}:${userId}:${print}`
      if ((await countHits(db, SAFETY_BUCKETS.duplicate, inHere, SAFETY.duplicate.windowSeconds)) > 0) return { ok: false, error: "You posted this here already.", status: 409 }
      hits.push({ bucket: SAFETY_BUCKETS.duplicate, subject: inHere })
    }
    const [byMe, byAnyone] = await Promise.all([
      countHits(db, SAFETY_BUCKETS.duplicate, mine, SAFETY.duplicate.windowSeconds),
      chatLike ? Promise.resolve(0) : countHits(db, SAFETY_BUCKETS.duplicate, anyone, SAFETY.duplicate.windowSeconds),
    ])
    if (chatLike) {
      if (byMe >= SAFETY.duplicate.messageCopies) return { ok: false, error: kind === "dm" ? "This message was already sent to several people." : "You sent this already.", status: 409 }
    } else {
      if (byMe >= SAFETY.duplicate.authorCopies) hold.push("the same text posted in several places")
      else if (byAnyone >= SAFETY.duplicate.anyoneCopies) hold.push("the same text posted by several accounts")
      hits.push({ bucket: SAFETY_BUCKETS.duplicate, subject: anyone })
    }
    hits.push({ bucket: SAFETY_BUCKETS.duplicate, subject: mine })
  }

  /* PICTURES, last: the only rule that reads files. */
  if (withPictures) {
    const pictures = await screenPictures(db, { communityId: community.id, userId, fresh, team: false }, picturesOf(input.media))
    if (pictures.refuse) return { ok: false, error: PICTURE_REFUSED, status: 400 }
    hold.push(...pictures.hold)
    if (fresh && uploadedVideoCount(input.media)) hold.push("a video from a member on their first day")
  }

  hold.push(...words.hold)
  await addHits(db, hits)
  return { ok: true, hold: [...new Set(hold)] }
}

/**
 * An edit: only what the edit ADDS is checked, so a post written clean and
 * edited into a scam later is caught, and fixing a typo is never slowed.
 * Nothing can be held on an edit (the post is already up), so a link, a
 * word or a picture that would be held is refused instead; mentions keep
 * their per write cap. No slow mode, no daily count, no duplicate check.
 */
export async function screenEdit(w: Writer, kind: WriteKind, input: { text: string; media?: unknown; before: string; beforeMedia?: unknown }): Promise<Screen> {
  const { db, community, viewer } = w
  if (!viewer.userId) return { ok: true, hold: [] }
  const team = isTeam(viewer.role)
  const fresh = isNewMember(viewer)
  const chatLike = kind === "message" || kind === "dm"

  /* WORDS: only what the edit adds; nothing can be held on an edit, so a hold is a refusal. */
  const now = wordFindings(community, readText(input.text), team)
  const was = wordFindings(community, readText(input.before), team)
  const addedWords: WordFindings = {
    minors: now.minors.filter((e) => !was.minors.includes(e)),
    hate: now.hate && !was.hate,
    adult: now.adult.filter((e) => !was.adult.includes(e)),
    community: now.community.filter((e) => !was.community.includes(e)),
  }
  const words = screenWords(community, addedWords, { team, chatLike: true })
  if (words.refuse) {
    await logWordRefusal(w, kind, words.refuse, input.text)
    return { ok: false, error: words.refuse.error, status: 400 }
  }

  /* PICTURES: only the ones the edit adds. */
  if (kind === "post" || kind === "comment") {
    const before = new Set(picturesOf(input.beforeMedia).map((p) => p.path))
    const newPictures = picturesOf(input.media).filter((p) => !before.has(p.path))
    const pictures = await screenPictures(db, { communityId: community.id, userId: viewer.userId, fresh, team }, newPictures)
    if (pictures.refuse) return { ok: false, error: PICTURE_REFUSED, status: 400 }
    if (pictures.hold.length) return { ok: false, error: "A moderator needs to see that picture first. Share it in a new post.", status: 400 }
    if (fresh && uploadedVideoCount(input.media) > uploadedVideoCount(input.beforeMedia)) return { ok: false, error: "Videos can be added in an edit after your first day.", status: 403 }
  }

  const had = new Set(linksOf(input.before, input.beforeMedia))
  const added = linksOf(input.text, input.media).filter((u) => !had.has(u))
  if (team) {
    return added.map(checkLink).some((c) => c.verdict === "block") ? { ok: false, error: REFUSE_LINK, status: 400 } : { ok: true, hold: [] }
  }
  const perWrite = fresh ? Math.min(SAFETY.newMemberMentions, SAFETY.mentionsPerWrite[kind]) : SAFETY.mentionsPerWrite[kind]
  if (mentionCount(input.text) > Math.max(perWrite, mentionCount(input.before))) return { ok: false, error: `Mention up to ${perWrite} people at a time.`, status: 400 }
  if (!added.length) return { ok: true, hold: [] }
  const worst = worstOf(await checkLinks(added))
  if (worst?.verdict === "block") return { ok: false, error: REFUSE_LINK, status: 400 }
  if (fresh) return { ok: false, error: "Links can be shared here after your first day.", status: 403 }
  if (worst?.verdict === "hold") return { ok: false, error: "That link can't be added in an edit. A moderator can check it if you share it in a new post.", status: 400 }
  return { ok: true, hold: [] }
}

/* ── Holding for review ─────────────────────────────────────────────────── */

/** The answer's words for somebody whose write was held. */
export const HELD_MESSAGE = "Thanks. A moderator will check it before everyone sees it."

/** What a held post or comment is written with instead of "published". */
export function heldColumns(screen: Screen, kind: "post" | "comment"): Record<string, unknown> {
  if (!screen.ok || !screen.hold.length) return {}
  const reason = `Held for review: ${screen.hold.join("; ")}`.slice(0, 500)
  return kind === "post" ? { status: "removed", removed_reason: reason, removed_at: nowIso(safetyDeps.now()) } : { status: "removed", removed_reason: reason }
}

/** Whether a route's answer is a held one (202 with `held: true`). */
export function isHeld(answer: unknown): boolean {
  return Boolean(answer && typeof answer === "object" && (answer as { held?: unknown }).held === true)
}

/** The team members told about something waiting: whoever may review reports, at most 25. */
async function tellTeam(db: Db, community: CommunityRow, n: { title: string; body?: string | null; key: string; actorId?: string | null; target?: { type: string; id: string }; needs?: "review_reports" | "manage_settings" }): Promise<void> {
  try {
    const { data } = await db.from("community_members").select("user_id, role").eq("community_id", community.id).eq("status", "active").in("role", ["owner", "admin", "moderator"]).limit(25)
    for (const s of (data as { user_id: string; role: Role }[] | null) ?? []) {
      if (!can(s.role, n.needs ?? "review_reports")) continue
      await notifyMember(db, {
        userId: s.user_id,
        communityId: community.id,
        kind: "report",
        actorId: n.actorId ?? null,
        target: n.target,
        title: n.title.slice(0, 200),
        body: n.body ?? null,
        url: `/app/community/${community.id}/moderation`,
        dedupeKey: `${n.key}:${s.user_id}`.slice(0, 300),
      })
    }
  } catch (e) {
    console.error(`[communities] safety notice: ${reasonOf(e)}`)
  }
}

/** A report with no reporter: the queue's way of saying "the rules flagged this". */
async function systemReport(db: Db, community: CommunityRow, target: { type: ReportTarget; id: string }, note: string): Promise<void> {
  const { error } = await db.from("community_reports").insert({ community_id: community.id, reporter_id: null, target_type: target.type, target_id: target.id, reason: "spam", note: note.slice(0, 500), status: "open" })
  if (error && !missing(error)) console.error(`[communities] safety report not written: ${reasonOf(error)}`)
}

/**
 * A post or comment was written held: it goes in the queue (a report with no
 * reporter), the log, and the team's inbox; the author is answered with
 * their words as written, marked held.
 */
export async function holdForReview<T>(w: Writer, target: { type: "post" | "comment"; id: string; text: string }, screen: Screen, view: () => Promise<T>): Promise<{ ok: true; value: T; held: true }> {
  const { db, community, viewer } = w
  const reasons = screen.ok ? screen.hold : []
  const note = `Held for review: ${reasons.join("; ")}`
  await systemReport(db, community, { type: target.type, id: target.id }, note)
  await audit(db, {
    communityId: community.id,
    actorId: null,
    actorKind: "system",
    action: `${target.type}.held`,
    targetType: target.type,
    targetId: target.id,
    targetLabel: target.text.replace(/\s+/g, " ").trim().slice(0, 120) || target.type,
    reason: note,
    detail: { authorId: viewer.userId, reasons },
  })
  await tellTeam(db, community, { title: `A ${target.type} is waiting for review`, body: reasons.join("; "), key: `held:${target.id}`, actorId: viewer.userId, target: { type: target.type, id: target.id } })
  return { ok: true, value: await view(), held: true }
}

/* ── Hiding after reports ───────────────────────────────────────────────── */

const CONTENT_TABLE = { post: "community_feed_posts", comment: "community_feed_comments", message: "community_messages" } as const

/**
 * After a report: when SAFETY.autoHideReports different active members, past
 * their first day, have
 * open reports on the same post, comment or message, it is hidden until a
 * moderator decides. Never content by the team, never content a moderator
 * already put back. A message's words are kept in the log (its body is
 * blanked, because the chat stream delivers the row as written). Answers
 * whether it hid something. Never throws.
 */
export async function hideAfterReports(db: Db, community: CommunityRow, target: { targetType: ReportTarget; targetId: string }): Promise<boolean> {
  try {
    if (target.targetType === "member") return false
    const { data: reports, error } = await db
      .from("community_reports")
      .select("reporter_id")
      .eq("community_id", community.id)
      .eq("target_type", target.targetType)
      .eq("target_id", target.targetId)
      .in("status", ["open", "reviewing"])
      .limit(100)
    if (error) return false
    const reporters = [...new Set(((reports as { reporter_id: string | null }[] | null) ?? []).map((r) => r.reporter_id).filter((x): x is string => Boolean(x)))]
    if (reporters.length < SAFETY.autoHideReports) return false
    /* Members who are new here do not count: three accounts made for the purpose cannot take somebody's post down. */
    const { data: members } = await db.from("community_members").select("user_id, role, source, joined_at").eq("community_id", community.id).eq("status", "active").in("user_id", reporters)
    const counted = ((members as { user_id: string; role: Role; source: string; joined_at: string | null }[] | null) ?? []).filter((m) => !isNewMember({ role: m.role, member: m as unknown as Viewer["member"] }))
    const distinct = new Set(counted.map((m) => m.user_id)).size
    if (distinct < SAFETY.autoHideReports) return false

    const table = CONTENT_TABLE[target.targetType]
    const cols = target.targetType === "post" ? "id, author_id, status, title, body_text" : "id, author_id, status, body"
    const { data: row } = await db.from(table).select(cols).eq("id", target.targetId).eq("community_id", community.id).maybeSingle()
    if (!row || row.status !== "published") return false
    if (row.author_id) {
      const { data: author } = await db.from("community_members").select("role, status").eq("community_id", community.id).eq("user_id", row.author_id).maybeSingle()
      if (author && author.status === "active" && isTeam(author.role as Role)) return false
    }
    /* A moderator already looked and put it back: the reports are theirs to settle, not the rule's. */
    const { data: restored } = await db.from("community_audit_log").select("id").eq("community_id", community.id).eq("target_id", target.targetId).eq("action", `${target.targetType}.restored`).limit(1)
    if (Array.isArray(restored) && restored.length) return false

    const reason = `Hidden after ${distinct} reports, waiting for review`
    const patch =
      target.targetType === "message"
        ? { status: "removed", body: "", attachments: [] }
        : target.targetType === "comment"
          ? { status: "removed", removed_reason: reason }
          : { status: "removed", removed_reason: reason, removed_at: nowIso(safetyDeps.now()), pinned: false }
    const { error: writeError } = await db.from(table).update(patch).eq("id", row.id).eq("community_id", community.id).eq("status", "published")
    if (writeError) {
      console.error(`[communities] hide after reports: ${reasonOf(writeError)}`)
      return false
    }
    const words = String(row.title || row.body_text || row.body || "").replace(/\s+/g, " ").trim()
    await audit(db, {
      communityId: community.id,
      actorId: null,
      actorKind: "system",
      action: `${target.targetType}.hidden`,
      targetType: target.targetType,
      targetId: row.id,
      targetLabel: words.slice(0, 200) || target.targetType,
      reason,
      detail: { authorId: row.author_id ?? null, reporters: distinct },
    })
    return true
  } catch (e) {
    console.error(`[communities] hide after reports: ${reasonOf(e)}`)
    return false
  }
}

/* ── Joining ────────────────────────────────────────────────────────────── */

/**
 * The address a request came from, as a keyed hash: counted, never stored
 * or readable. The key is the server's own secret, so the hash of an IPv4
 * address cannot be reversed by trying all four billion of them.
 */
export function addressKey(request: Request): string | null {
  const ip = callerAddress(request)
  if (!ip) return null
  const secret = process.env.IP_HASH_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "storelib-communities"
  return `iph:${createHmac("sha256", secret).update(ip.toLowerCase()).digest("hex").slice(0, 32)}`
}

/** Joins and invite uses from one address: 20 in ten minutes, 80 a day. */
export function joinAddressLimit(request: Request) {
  return rateLimit({ bucket: SAFETY_BUCKETS.joinAddress, subjects: [addressKey(request)], windows: SAFETY.join.perAddress, message: "A lot of joining from one place. Try again in a few minutes." })
}

/** How many joins in ten minutes set off the alarm for a community this size. */
export function joinAlarmThreshold(memberCount: number): number {
  return Math.min(SAFETY.join.alarmMax, Math.max(SAFETY.join.alarmMin, Math.ceil((memberCount || 0) * SAFETY.join.alarmShare)))
}

/**
 * After somebody joined on a free tier or with an invite. Counts the join;
 * when the community gets more joins than it plausibly can, approval is
 * switched on (new people ask instead of walking in), the owner is told,
 * and it is in the queue and the log. An invite link used in a burst is
 * turned off the same way. Never throws, never stops the join it follows.
 */
export async function watchJoin(db: Db, community: CommunityRow, userId: string, opts: { inviteId?: string | null } = {}): Promise<void> {
  try {
    await addHits(db, [{ bucket: SAFETY_BUCKETS.joinVelocity, subject: community.id }, ...(opts.inviteId ? [{ bucket: SAFETY_BUCKETS.inviteUse, subject: opts.inviteId }] : [])])
    const [joins, uses] = await Promise.all([
      countHits(db, SAFETY_BUCKETS.joinVelocity, community.id, SAFETY.join.alarmSeconds),
      opts.inviteId ? countHits(db, SAFETY_BUCKETS.inviteUse, opts.inviteId, SAFETY.invite.burstSeconds) : Promise.resolve(0),
    ])
    if (joins >= joinAlarmThreshold(community.member_count) && !community.approval_required) await joinAlarm(db, community, userId, joins)
    if (opts.inviteId && uses >= SAFETY.invite.burst) await pauseInvite(db, community, opts.inviteId, userId, uses)
  } catch (e) {
    console.error(`[communities] watch join: ${reasonOf(e)}`)
  }
}

async function joinAlarm(db: Db, community: CommunityRow, userId: string, joins: number): Promise<void> {
  if ((await countHits(db, SAFETY_BUCKETS.joinAlarm, community.id, SAFETY.join.alarmQuietSeconds)) > 0) return
  await addHits(db, [{ bucket: SAFETY_BUCKETS.joinAlarm, subject: community.id }])
  const { data, error } = await db.from("communities").update({ approval_required: true }).eq("id", community.id).eq("approval_required", false).select("id")
  if (error || !Array.isArray(data) || !data.length) return
  const minutes = Math.round(SAFETY.join.alarmSeconds / 60)
  const note = `Join alarm: ${joins} people joined in ${minutes} minutes, so new people now ask to join. Turn approval off in Settings, Access when it calms down.`
  await audit(db, { communityId: community.id, actorId: null, actorKind: "system", action: "community.join_alarm", targetType: "community", targetId: community.id, targetLabel: community.name, reason: note, detail: { joins, seconds: SAFETY.join.alarmSeconds, lastJoin: userId } })
  await systemReport(db, community, { type: "member", id: userId }, note)
  await tellTeam(db, community, { title: `Unusual number of joins in ${community.name}`, body: `${joins} people joined in ${minutes} minutes. New people now ask to join until you turn approval off.`, key: `join-alarm:${community.id}:${nowIso(safetyDeps.now()).slice(0, 13)}`, needs: "manage_settings" })
}

async function pauseInvite(db: Db, community: CommunityRow, inviteId: string, userId: string, uses: number): Promise<void> {
  const { data, error } = await db.from("community_invites").update({ revoked_at: nowIso(safetyDeps.now()) }).eq("id", inviteId).eq("community_id", community.id).is("revoked_at", null).select("id")
  if (error || !Array.isArray(data) || !data.length) return
  const minutes = Math.round(SAFETY.invite.burstSeconds / 60)
  const note = `Invite link turned off: used ${uses} times in ${minutes} minutes. Make a new link if this was expected.`
  await audit(db, { communityId: community.id, actorId: null, actorKind: "system", action: "invite.revoked", targetType: "invite", targetId: inviteId, targetLabel: "Invite link", reason: note, detail: { uses, seconds: SAFETY.invite.burstSeconds } })
  await systemReport(db, community, { type: "member", id: userId }, note)
  await tellTeam(db, community, { title: "An invite link was turned off", body: note, key: `invite-burst:${inviteId}`, needs: "manage_settings" })
}

/* ── Invite links that do not work ──────────────────────────────────────── */

/**
 * Around redeemInvite: somebody (or an address) who has tried
 * SAFETY.invite.misses links that do not exist in an hour waits, and every
 * miss is counted. Answers the redemption's own answer otherwise.
 */
export async function guardInvite<T extends { ok: boolean; error?: string }>(request: Request, userId: string, redeem: () => Promise<T>, db?: Db): Promise<T | { ok: false; status: number; error: string; message: string }> {
  const store: Db = db ?? admin()
  const subjects = [`user:${userId}`, addressKey(request)].filter((s): s is string => Boolean(s))
  for (const subject of subjects) {
    if ((await countHits(store, SAFETY_BUCKETS.inviteMiss, subject, SAFETY.invite.missSeconds)) >= SAFETY.invite.misses) {
      return { ok: false, status: 429, error: "too_many", message: "Too many invite links that did not work. Try again in an hour." }
    }
  }
  const answer = await redeem()
  if (!answer.ok && answer.error === "not_found") await addHits(store, subjects.map((subject) => ({ bucket: SAFETY_BUCKETS.inviteMiss, subject })))
  return answer
}
