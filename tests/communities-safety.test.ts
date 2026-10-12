/**
 * ===========================================================================
 *  KEEPING SPAM, SCAMS AND ABUSE OUT OF A COMMUNITY (round 12, item 38)
 * ===========================================================================
 * Every rule in lib/communities/server/safety.ts and the link check in
 * lib/communities/link-check.ts, run for real against a database stub:
 *
 *   LINKS        blocklist, hidden credentials, shorteners followed, punycode
 *                and lookalikes, bare IPs, file like domains, no false
 *                positives on ordinary names; links read out of text.
 *   WRITES       mentions, slow mode, a new member's first day, links held or
 *                refused, duplicates across communities, the team exempt,
 *                failing open; edits checked for what they add.
 *   HOLDS        a held post goes in the queue (a report with no reporter),
 *                the log and the team's inbox; the author is answered held.
 *   REPORTS      three different members hide content; never the team's,
 *                never what a moderator put back.
 *   JOINS        per address limit hashed, the join alarm switches approval
 *                on once, an invite link used in a burst is turned off,
 *                invite links that do not work make a person wait.
 *   WIRING       each rule is called where it has to be (source checks), and
 *                the shared limiter's sweep keeps daily windows whole.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"
import { checkLink, decodePunycode, imitatedBrand, linksInText, skeleton, unicodeHost, worstOf } from "@/lib/communities/link-check"
import { BLOCKED_DOMAINS, SHORTENER_DOMAINS } from "@/lib/communities/link-blocklist"
import {
  SAFETY,
  SAFETY_BUCKETS,
  addressKey,
  contentFingerprint,
  guardInvite,
  heldColumns,
  hideAfterReports,
  holdForReview,
  isHeld,
  isNewMember,
  joinAlarmThreshold,
  keptSafety,
  linksOf,
  mentionCount,
  safetyDeps,
  screenEdit,
  screenWrite,
  slowModeChoice,
  slowModeOf,
  watchJoin,
  withSlowMode,
  type WriteKind,
} from "@/lib/communities/server/safety"
import { SWEEP_KEEP_SECONDS } from "@/lib/api/rate-limit"
import type { Viewer } from "@/lib/communities/server/context"
import type { CommunityRow, MemberRow, Role } from "@/lib/communities/types"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const read = (p: string) => untt(readFileSync(p, "utf8"), p)
const code = (p: string) => stripComments(read(p))

/* ── A small Postgres stand in ──────────────────────────────────────────── */

type Row = Record<string, any>

function pg(tables: Record<string, Row[]> = {}, opts: { broken?: boolean } = {}) {
  let serial = 0
  const id = () => `00000000-0000-4000-9000-${String(++serial).padStart(12, "0")}`
  function from(table: string) {
    const st = { op: "select", preds: [] as ((r: Row) => boolean)[], order: [] as [string, boolean][], limit: null as number | null, head: false, count: false, payload: null as any, single: false, conflict: "", ignore: false, returning: false }
    const cmp = (a: unknown, b: unknown) => (String(a ?? "") < String(b ?? "") ? -1 : String(a ?? "") > String(b ?? "") ? 1 : 0)
    const rows = () => (tables[table] ??= [])
    const run = () => {
      if (opts.broken) return { data: null, error: { code: "XX000", message: "database unreachable" }, count: null }
      const hit = rows().filter((r) => st.preds.every((p) => p(r)))
      if (st.op === "select") {
        let out = [...hit]
        if (st.order.length) out.sort((x, y) => { for (const [c, asc] of st.order) { const d = cmp(x[c], y[c]); if (d) return asc ? d : -d } return 0 })
        if (st.limit !== null) out = out.slice(0, st.limit)
        if (st.head) return { data: null, error: null, count: hit.length }
        if (st.single) return { data: out[0] ? { ...out[0] } : null, error: null }
        return { data: out.map((r) => ({ ...r })), error: null, count: st.count ? hit.length : null }
      }
      if (st.op === "update") {
        for (const r of hit) Object.assign(r, st.payload)
        return { data: st.returning ? (st.single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r }))) : null, error: null }
      }
      const list = Array.isArray(st.payload) ? st.payload : [st.payload]
      const made: Row[] = []
      for (const p of list) {
        const keys = st.conflict ? st.conflict.split(",") : []
        const had = keys.length ? rows().find((r) => keys.every((k) => r[k] === p[k])) : undefined
        if (had) {
          if (!st.ignore) Object.assign(had, p)
          continue
        }
        const row = { id: id(), created_at: new Date(safetyDeps.now()).toISOString(), ...p }
        rows().push(row)
        made.push(row)
      }
      return { data: st.returning ? (st.single ? (made[0] ? { ...made[0] } : null) : made.map((r) => ({ ...r }))) : null, error: null }
    }
    const q: any = {
      select(_c?: string, o?: { count?: string; head?: boolean }) {
        if (st.op === "select") { st.head = !!o?.head; st.count = !!o?.count } else st.returning = true
        return q
      },
      eq(c: string, v: unknown) { st.preds.push((r) => r[c] === v); return q },
      neq(c: string, v: unknown) { st.preds.push((r) => r[c] !== v); return q },
      in(c: string, v: unknown[]) { st.preds.push((r) => v.includes(r[c])); return q },
      is(c: string, v: unknown) { st.preds.push((r) => (v === null ? r[c] == null : r[c] === v)); return q },
      gte(c: string, v: unknown) { st.preds.push((r) => cmp(r[c], v) >= 0); return q },
      lt(c: string, v: unknown) { st.preds.push((r) => cmp(r[c], v) < 0); return q },
      order(c: string, o?: { ascending?: boolean }) { st.order.push([c, o?.ascending !== false]); return q },
      limit(n: number) { st.limit = n; return q },
      maybeSingle() { st.single = true; return q },
      single() { st.single = true; return q },
      update(p: Row) { st.op = "update"; st.payload = p; return q },
      insert(p: Row | Row[]) { st.op = "insert"; st.payload = p; return q },
      upsert(p: Row | Row[], o: { onConflict: string; ignoreDuplicates?: boolean }) { st.op = "upsert"; st.payload = p; st.conflict = o.onConflict; st.ignore = !!o.ignoreDuplicates; return q },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) { try { resolve(run()) } catch (e) { reject(e) } },
    }
    return q
  }
  return { from, tables, rpc: async () => ({ data: null, error: null }) }
}

/* ── People and places ──────────────────────────────────────────────────── */

const U = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`
const C1 = "00000000-0000-4000-b000-000000000001"
const C2 = "00000000-0000-4000-b000-000000000002"
const OWNER = U(1)
const MOD = U(2)
const ANA = U(3)
const BEN = U(4)
const CORA = U(5)
const DAN = U(6)

let clock = Date.parse("2026-10-05T12:00:00.000Z")
safetyDeps.now = () => clock
const ago = (hours: number) => new Date(clock - hours * 3_600_000).toISOString()

function community(o: Partial<CommunityRow> = {}): CommunityRow {
  return { id: C1, slug: "studio", name: "Studio", owner_user_id: OWNER, member_count: 120, approval_required: false, onboarding: {}, chat_enabled: true, ...o } as CommunityRow
}

function member(userId: string, o: Partial<MemberRow> = {}): MemberRow {
  return { id: `m-${userId}`, community_id: C1, user_id: userId, status: "active", role: "member", source: "free", joined_at: ago(24 * 30), notify_level: "all", ...o } as MemberRow
}

function viewer(userId: string, role: Role = "member", m: Partial<MemberRow> = {}): Viewer {
  return { userId, member: member(userId, { role, ...m }), role, active: true, status: "active", tierId: null, ownedProductIds: [], level: 1, points: 0, isOwner: role === "owner", isCreatorAccount: false, banned: false, mutedUntil: null }
}

function staffTables(): Record<string, Row[]> {
  return {
    community_members: [member(OWNER, { role: "owner", source: "owner" }), member(MOD, { role: "moderator" }), member(ANA), member(BEN), member(CORA), member(DAN)],
    rate_limit_hits: [],
    community_reports: [],
    community_audit_log: [],
    community_notifications: [],
  }
}

const LONG = "Join my free masterclass on growing an audience from zero to ten thousand followers this month"

async function main() {
  console.log("\nLINKS")
  {
    const found = linksInText("see https://example.com/a?b=1). Also www.shop.example.org and bit.ly/xyz, mail me at ana@gmail.com; I did.It was fine; report.zip")
    check("links are read with a scheme, with www. and bare, once each", found.includes("https://example.com/a?b=1") && found.some((u) => u.startsWith("http://www.shop.example.org")) && found.some((u) => u.startsWith("http://bit.ly/xyz")), found.join(" "))
    check("an email address, a missing space and a file name are not links", !found.some((u) => /gmail|did\.it|report\.zip/i.test(u)), found.join(" "))
    check("a Cyrillic bare domain is read and turned into punycode", linksInText("go to аpple.com now").some((u) => u.includes("xn--")), linksInText("go to аpple.com now").join(" "))

    check("punycode decodes (RFC 3492)", decodePunycode("pple-43d") === "аpple" && decodePunycode("mnchen-3ya") === "münchen", `${decodePunycode("pple-43d")} ${decodePunycode("mnchen-3ya")}`)
    check("a host reads as a person reads it", unicodeHost("xn--mnchen-3ya.de") === "münchen.de")
    check("skeleton: digits, rn, Cyrillic and repeats read as the letters they imitate", skeleton("paypa1") === skeleton("paypal") && skeleton("rnicrosoft") === skeleton("microsoft") && skeleton("раураl") === skeleton("paypal") && skeleton("gooogle") === skeleton("google"))

    const v = (u: string) => checkLink(u)
    check("a blocklisted domain is blocked, its subdomains too", v("https://grabify.link/ABC").verdict === "block" && v("https://x.iplogger.org/1").reason === "blocklist")
    check("a name and password in front of the host is blocked", v("https://paypal.com@evil.example/login").verdict === "block" && v("https://paypal.com@evil.example/login").reason === "credentials")
    check("a known shortener is followed, not judged", v("https://bit.ly/3abc").verdict === "expand")
    check("lookalikes are held with the brand they imitate", v("https://paypa1.com/x").imitates === "paypal" && v("https://rnicrosoft.com").imitates === "microsoft" && v("https://secure-paypal-login.net").imitates === "paypal" && v("https://steamcommunlty.com").imitates === "steamcommunity" && v("https://discord-nitro-gift.xyz").imitates === "discord")
    check("a brand's own domains are never lookalikes", v("https://www.paypal.com/signin").verdict === "ok" && v("https://accounts.google.com").verdict === "ok" && v("https://steamcommunity.com/id/x").verdict === "ok")
    check("letters from another alphabet passing for Latin hold (punycode)", v("https://xn--pple-43d.com").verdict === "hold")
    check("an ordinary accented or non Latin domain is fine", v("https://xn--mnchen-3ya.de").verdict === "ok" && v("https://пример.рф").verdict === "ok", `${v("https://xn--mnchen-3ya.de").verdict} ${v("https://пример.рф").verdict}`)
    check("a bare IP address holds", v("http://45.12.3.9/login").reason === "ip_address" && v("http://[2001:db8::1]/").verdict === "hold")
    check("a domain that reads like a file holds", v("https://invoice.zip").reason === "file_like")
    check("no false positives on ordinary names", ["https://strive.com", "https://pineapple.com", "https://applebees.com", "https://example.com/a", "https://youtube.com/watch?v=1", "https://storelib.com/x", "https://docs.github.com", "https://apple-pie-recipes.com", "https://live.example.com", "https://steam-cleaning.com", "https://office.example.org", "https://google-maps-guide.com"].every((u) => v(u).verdict === "ok"), ["https://strive.com", "https://pineapple.com", "https://applebees.com"].map((u) => `${u}:${v(u).verdict}`).join(" "))
    check("imitatedBrand finds nothing in a plain domain", imitatedBrand("example.com") === null)
    check("worstOf picks the strictest", worstOf([v("https://example.com"), v("https://paypa1.com"), v("https://grabify.link")])?.verdict === "block")
    check("the lists are lowercase domains, sorted, no www", [BLOCKED_DOMAINS, SHORTENER_DOMAINS].every((l) => l.every((d) => d === d.toLowerCase() && !d.startsWith("www.") && !d.includes("/")) && [...l].sort().join() === l.join()))
  }

  console.log("\nSETTINGS AND PURE PIECES")
  {
    check("slow mode is read from the settings, and only the choices count", slowModeOf(community({ onboarding: { safety: { slowModeSeconds: 300 } } as any })) === 300 && slowModeOf(community({ onboarding: { safety: { slowModeSeconds: 7 } } as any })) === 0 && slowModeOf(community()) === 0)
    check("slowModeChoice takes the choices and nothing else", slowModeChoice(60) === 60 && slowModeChoice("900") === 900 && slowModeChoice(0) === 0 && slowModeChoice(45) === null && slowModeChoice("x") === null)
    const with5 = withSlowMode({ enabled: true, welcome: "Hi" }, 300)
    check("withSlowMode keeps the welcome steps", (with5 as any).welcome === "Hi" && (with5 as any).safety.slowModeSeconds === 300)
    check("keptSafety carries the slow mode through a welcome save", (keptSafety(with5) as any).safety.slowModeSeconds === 300 && Object.keys(keptSafety({ enabled: true })).length === 0)
    check("mentionCount counts different people, not @everyone or emails", mentionCount("@ana @ben @ana hi @everyone and ana@x.com") === 2)
    check("a fingerprint ignores case, accents, punctuation and a link's tracking part", contentFingerprint(`${LONG} https://spam.example/a?utm=1`) === contentFingerprint(`${LONG.toUpperCase()}!!  https://spam.example/b?utm=2`))
    check("short texts are never compared", contentFingerprint("Thanks so much, welcome!") === null)
    check("a post's link card counts as a link", linksOf("hello", [{ type: "link", url: "https://paypa1.com" }]).includes("https://paypa1.com"))
    check("the join alarm scales with the community, within bounds", joinAlarmThreshold(0) === 40 && joinAlarmThreshold(1000) === 100 && joinAlarmThreshold(1_000_000) === 500)
    const req = (ip: string) => new Request("https://storelib.com/x", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } })
    const k = addressKey(req("203.0.113.9"))
    check("an address is counted as a keyed hash, never in the clear", !!k && k.startsWith("iph:") && !k.includes("203.0.113.9") && k === addressKey(req("203.0.113.9")) && k !== addressKey(req("203.0.113.10")))
    check("no address, no subject (never one shared bucket)", addressKey(new Request("https://storelib.com/x")) === null)
    check("new member: first day, unpaid, not the team", isNewMember(viewer(ANA, "member", { joined_at: ago(2) })) && !isNewMember(viewer(ANA, "member", { joined_at: ago(30) })) && !isNewMember(viewer(ANA, "member", { joined_at: ago(2), source: "subscription" })) && !isNewMember(viewer(MOD, "moderator", { joined_at: ago(2) })))
    check("heldColumns writes a held post as removed with the reasons, nothing when clean", (heldColumns({ ok: true, hold: ["a"] }, "post") as any).status === "removed" && String((heldColumns({ ok: true, hold: ["a"] }, "post") as any).removed_reason).startsWith("Held for review: a") && Object.keys(heldColumns({ ok: true, hold: [] }, "post")).length === 0 && !("removed_at" in heldColumns({ ok: true, hold: ["a"] }, "comment")))
    check("isHeld reads a held answer only", isHeld({ ok: true, value: 1, held: true }) && !isHeld({ ok: true, value: 1 }))
  }

  console.log("\nWRITES")
  {
    const write = async (db: any, who: Viewer, kind: WriteKind, text: string, c: CommunityRow = community(), media?: unknown) => screenWrite({ db, community: c, viewer: who }, kind, { text, media })
    const follows: Record<string, string | null> = { "https://bit.ly/clean": "https://example.com/page", "https://bit.ly/bad": "https://grabify.link/x", "https://bit.ly/loop": "https://tinyurl.com/again", "https://tinyurl.com/again": "https://bit.ly/loop" }
    safetyDeps.follow = async (url: string) => {
      if (url === "https://bit.ly/down") throw new Error("timed out")
      return follows[url] ?? null
    }

    let db = pg(staffTables())
    const ana = viewer(ANA)
    let s = await write(db, ana, "post", "@a @b @c @d @e @f @g @h @i @j @k hello")
    check("more than 10 people in a post is refused", !s.ok && /up to 10/.test((s as any).error))
    s = await write(db, ana, "comment", "@a @b @c @d @e @f hi")
    check("more than 5 people in a comment is refused", !s.ok)
    s = await write(db, viewer(ANA, "member", { joined_at: ago(1) }), "post", "@a @b @c @d hi")
    check("a new member mentions at most 3 at once", !s.ok && /up to 3/.test((s as any).error))
    db = pg(staffTables())
    for (let i = 0; i < 3; i++) await write(db, ana, "post", `@a${i} @b${i} @c${i} @d${i} @e${i} @f${i} @g${i} @h${i} @i${i} @j${i} round ${i}`)
    s = await write(db, ana, "post", "@x1 @x2 @x3 @x4 one more")
    check("30 mentions an hour, then a wait", !s.ok && (s as any).status === 429)
    s = await write(db, viewer(MOD, "moderator"), "post", "@a @b @c @d @e @f @g @h @i @j @k @l announcement")
    check("the team is never limited on mentions", s.ok)

    db = pg(staffTables())
    const slow = community({ onboarding: { safety: { slowModeSeconds: 300 } } as any })
    const first = await write(db, ana, "post", "first", slow)
    const second = await write(db, ana, "post", "second", slow)
    const comment = await write(db, ana, "comment", "a comment", slow)
    check("slow mode: the second post inside five minutes waits, with the time left", first.ok && !second.ok && (second as any).status === 429 && /one post every 5 minutes\. Try again in 5 minutes/.test((second as any).error), (second as any).error)
    check("slow mode keeps a clock per kind", comment.ok)
    clock += 301_000
    check("slow mode: after the wait it goes", (await write(db, ana, "post", "third", slow)).ok)
    check("slow mode never slows the team", (await write(db, viewer(MOD, "moderator"), "post", "x", slow)).ok && (await write(db, viewer(MOD, "moderator"), "post", "y", slow)).ok)
    check("slow mode does not apply to direct messages", (await write(db, ana, "dm", "a", slow)).ok && (await write(db, ana, "dm", "b", slow)).ok)

    db = pg(staffTables())
    const fresh = viewer(BEN, "member", { joined_at: ago(3) })
    const posts = [] as boolean[]
    for (let i = 0; i < 4; i++) posts.push((await write(db, fresh, "post", `hello number ${i}`)).ok)
    check("a new member posts 3 times on their first day, not 4", posts.join() === "true,true,true,false", posts.join())
    const paidFresh = viewer(CORA, "member", { joined_at: ago(3), source: "purchase" })
    const paid = [] as boolean[]
    for (let i = 0; i < 4; i++) paid.push((await write(db, paidFresh, "post", `hi ${i}`)).ok)
    check("somebody who paid is not limited as new", paid.every(Boolean))

    db = pg(staffTables())
    s = await write(db, fresh, "post", "my site https://example.com/me")
    check("a new member's link in a post is held, not refused", s.ok && s.hold.some((h) => /first day/.test(h)))
    s = await write(db, fresh, "message", "my site https://example.com/me")
    check("a new member's link in chat is refused (nothing can be held there)", !s.ok && /after your first day/.test((s as any).error))
    s = await write(db, fresh, "dm", "my site example.com")
    check("and in a direct message", !s.ok)
    s = await write(db, ana, "post", "look https://example.com")
    check("an ordinary member's ordinary link goes", s.ok && s.hold.length === 0)
    s = await write(db, ana, "post", "login here https://paypa1.com/verify")
    check("a lookalike link in a post is held, saying what it imitates", s.ok && s.hold.some((h) => /imitates a known brand \(paypal\)/.test(h)), s.ok ? s.hold.join() : "")
    s = await write(db, ana, "message", "login here https://paypa1.com/verify")
    check("a lookalike link in chat is refused", !s.ok)
    s = await write(db, ana, "post", "free nitro https://grabify.link/abc")
    check("a blocklisted link is refused", !s.ok && /can't be shared/.test((s as any).error))
    s = await write(db, viewer(OWNER, "owner"), "post", "even me https://iplogger.org/x")
    check("the blocklist applies to the team too", !s.ok)
    s = await write(db, viewer(OWNER, "owner"), "post", "official https://paypa1.com")
    check("the team is not held for lookalikes", s.ok && s.hold.length === 0)
    s = await write(db, ana, "post", "short https://bit.ly/clean")
    check("a short link that leads somewhere ordinary goes", s.ok && s.hold.length === 0, s.ok ? s.hold.join() : (s as any).error)
    s = await write(db, ana, "post", "short https://bit.ly/bad")
    check("a short link that leads to a blocklisted domain is refused", !s.ok)
    s = await write(db, ana, "post", "short https://bit.ly/down")
    check("a short link that cannot be followed is held", s.ok && s.hold.some((h) => /short link/.test(h)))
    s = await write(db, ana, "post", "short https://bit.ly/loop")
    check("a short link going round in circles is held", s.ok && s.hold.some((h) => /short link/.test(h)))
    let calls = 0
    const before = safetyDeps.follow
    safetyDeps.follow = async () => {
      calls++
      clock += 1500
      return null
    }
    s = await write(db, ana, "post", "three https://bit.ly/a1 https://bit.ly/a2 https://bit.ly/a3")
    check("three short links share one time budget", s.ok && calls === 2 && s.hold.length > 0, `calls ${calls}`)
    safetyDeps.follow = before
    s = await write(db, ana, "post", "card", community(), [{ type: "link", url: "https://grabify.link/q" }])
    check("a post's link card is checked like its text", !s.ok)

    db = pg(staffTables())
    const c2 = community({ id: C2, slug: "other" })
    const c3 = community({ id: "00000000-0000-4000-b000-000000000003", slug: "third" })
    const p1 = await write(db, ana, "post", LONG)
    const p1again = await write(db, ana, "post", LONG)
    check("the same post twice in one community is refused", p1.ok && !p1again.ok && (p1again as any).status === 409)
    const p2 = await write(db, ana, "post", LONG, c2)
    const p3 = await write(db, ana, "post", LONG, c3)
    check("the third copy across communities is held, the second is not", p2.ok && p2.hold.length === 0 && p3.ok && p3.hold.some((h) => /several places/.test(h)), p3.ok ? p3.hold.join() : "")
    db = pg(staffTables())
    const ring = [ANA, BEN, CORA, DAN, U(7)].map((id) => viewer(id))
    const ringOut = [] as boolean[]
    for (const [i, who] of ring.entries()) {
      const r = await write(db, who, "post", LONG, community({ id: `00000000-0000-4000-b000-00000000010${i}` }))
      ringOut.push(r.ok && r.hold.length > 0)
    }
    check("the fifth account posting the same text is held", ringOut.join() === "false,false,false,false,true", ringOut.join())
    db = pg(staffTables())
    const dms = [] as boolean[]
    for (let i = 0; i < 4; i++) dms.push((await write(db, ana, "dm", LONG)).ok)
    check("the same long direct message to a fourth person is refused", dms.join() === "true,true,true,false", dms.join())
    const shorts = [] as boolean[]
    for (let i = 0; i < 6; i++) shorts.push((await write(db, ana, "comment", "Welcome, glad you are here!")).ok)
    check("short repeated words are never treated as duplicates", shorts.every(Boolean))

    s = await write(pg(staffTables(), { broken: true }), viewer(ANA, "member", { joined_at: ago(1) }), "post", "@a hello", slow)
    check("a database that cannot be read never stops a post (fails open)", s.ok)

    db = pg(staffTables())
    const edit = (who: Viewer, text: string, before: string, kind: WriteKind = "post") => screenEdit({ db, community: community(), viewer: who }, kind, { text, before })
    check("an edit keeping its link goes", (await edit(ana, "see https://paypa1.com typo fixed", "see https://paypa1.com typo")).ok)
    const e1 = await edit(ana, "now with https://paypa1.com", "clean words")
    check("an edit adding a lookalike link is refused (nothing can be held on an edit)", !e1.ok && /in an edit/.test((e1 as any).error))
    check("an edit adding a blocklisted link is refused", !(await edit(ana, "x https://grabify.link/a", "x")).ok)
    check("a new member cannot add a link by editing", !(await edit(viewer(BEN, "member", { joined_at: ago(1) }), "x https://example.com", "x")).ok)
    check("an edit cannot turn into a mass mention", !(await edit(ana, "@a @b @c @d @e @f @g @h @i @j @k", "hi")).ok)
    check("an edit is never slowed or counted", (await edit(ana, "a", "b")).ok && (db.tables.rate_limit_hits ?? []).length === 0)
  }

  console.log("\nHOLDS")
  {
    const db = pg(staffTables())
    const w = { db, community: community(), viewer: viewer(BEN, "member", { joined_at: ago(1) }) }
    const answer = await holdForReview(w, { type: "post", id: U(500), text: "My site https://example.com" }, { ok: true, hold: ["a link from a member on their first day"] }, async () => ({ id: U(500) }))
    const report = db.tables.community_reports[0]
    const log = db.tables.community_audit_log[0]
    check("a held post is answered held, with the author's view", answer.held === true && (answer.value as any).id === U(500))
    check("it lands in the queue as a report with no reporter", report && report.reporter_id === null && report.target_type === "post" && report.target_id === U(500) && report.status === "open" && /^Held for review: a link from a member on their first day/.test(report.note))
    check("it is in the audit log, by the system", log && log.actor_kind === "system" && log.actor_id === null && log.action === "post.held" && log.detail.authorId === BEN)
    const told = db.tables.community_notifications.map((n) => n.user_id).sort()
    check("the owner and the moderators are told, members are not", told.join() === [OWNER, MOD].sort().join() && db.tables.community_notifications.every((n) => n.kind === "report" && n.url === `/app/community/${C1}/moderation`), told.join())
  }

  console.log("\nREPORTS")
  {
    const post = (o: Row = {}) => ({ id: U(600), community_id: C1, author_id: DAN, status: "published", title: "Buy now", body_text: "spam spam", ...o })
    const report = (reporter: string | null, o: Row = {}) => ({ id: `r-${reporter}`, community_id: C1, reporter_id: reporter, target_type: "post", target_id: U(600), status: "open", ...o })
    const target = { targetType: "post" as const, targetId: U(600) }

    let t = staffTables()
    t.community_feed_posts = [post()]
    t.community_reports = [report(ANA), report(BEN)]
    let db = pg(t)
    check("two reports hide nothing", !(await hideAfterReports(db, community(), target)) && t.community_feed_posts[0].status === "published")
    t.community_reports.push(report(CORA))
    check("three different members hide it until a moderator looks", (await hideAfterReports(db, community(), target)) && t.community_feed_posts[0].status === "removed" && /Hidden after 3 reports/.test(t.community_feed_posts[0].removed_reason))
    check("the hiding is logged by the system with the words kept", t.community_audit_log.some((a) => a.action === "post.hidden" && a.actor_kind === "system" && a.target_label === "Buy now"))

    t = staffTables()
    t.community_feed_posts = [post()]
    t.community_reports = [report(ANA), report(BEN), report(U(99))]
    check("a reporter who is not an active member does not count", !(await hideAfterReports(pg(t), community(), target)))

    t = staffTables()
    t.community_feed_posts = [post()]
    t.community_members.find((m) => m.user_id === CORA)!.joined_at = ago(2)
    t.community_reports = [report(ANA), report(BEN), report(CORA)]
    check("a reporter on their first day does not count (no brigade of new accounts)", !(await hideAfterReports(pg(t), community(), target)))

    t = staffTables()
    t.community_feed_posts = [post({ author_id: MOD })]
    t.community_reports = [report(ANA), report(BEN), report(CORA)]
    check("the team's content is never hidden by reports", !(await hideAfterReports(pg(t), community(), target)) && t.community_feed_posts[0].status === "published")

    t = staffTables()
    t.community_feed_posts = [post()]
    t.community_reports = [report(ANA), report(BEN), report(CORA)]
    t.community_audit_log = [{ id: 1, community_id: C1, target_id: U(600), action: "post.restored" }]
    check("what a moderator already put back is not hidden again", !(await hideAfterReports(pg(t), community(), target)))

    t = staffTables()
    t.community_messages = [{ id: U(700), community_id: C1, author_id: DAN, status: "published", body: "dm me for crypto" }]
    t.community_reports = [ANA, BEN, CORA].map((r) => ({ ...report(r), target_type: "message", target_id: U(700) }))
    db = pg(t)
    check("a hidden chat message is blanked, its words kept in the log", (await hideAfterReports(db, community(), { targetType: "message", targetId: U(700) })) && t.community_messages[0].body === "" && t.community_audit_log.some((a) => a.action === "message.hidden" && a.target_label === "dm me for crypto"))
    check("a report about a member hides nothing", !(await hideAfterReports(pg(staffTables()), community(), { targetType: "member", targetId: DAN })))
  }

  console.log("\nJOINS AND INVITES")
  {
    let t = staffTables()
    t.communities = [{ id: C1, approval_required: false }]
    let db = pg(t)
    const c = community({ member_count: 10 })
    for (let i = 0; i < 39; i++) await watchJoin(db, c, U(1000 + i))
    check("39 joins in ten minutes raise nothing", t.communities[0].approval_required === false && t.community_audit_log.length === 0)
    await watchJoin(db, c, U(2000))
    check("the 40th switches approval on", t.communities[0].approval_required === true)
    check("the alarm is in the log and the queue", t.community_audit_log.some((a) => a.action === "community.join_alarm" && a.actor_kind === "system") && t.community_reports.some((r) => r.reporter_id === null && r.target_type === "member" && r.target_id === U(2000) && /^Join alarm: 40 people joined in 10 minutes/.test(r.note)))
    check("the owner is told (admins and owner only, not moderators)", t.community_notifications.map((n) => n.user_id).join() === OWNER)
    t.communities[0].approval_required = false
    await watchJoin(db, c, U(2001))
    check("one alarm in six hours", t.community_audit_log.filter((a) => a.action === "community.join_alarm").length === 1)
    t = staffTables()
    t.communities = [{ id: C1, approval_required: true }]
    db = pg(t)
    for (let i = 0; i < 45; i++) await watchJoin(db, community({ member_count: 10, approval_required: true }), U(3000 + i))
    check("a community already asking for approval raises no alarm", t.community_audit_log.length === 0)

    t = staffTables()
    t.communities = [{ id: C1, approval_required: true }]
    t.community_invites = [{ id: U(800), community_id: C1, revoked_at: null }]
    db = pg(t)
    for (let i = 0; i < 24; i++) await watchJoin(db, community({ approval_required: true }), U(4000 + i), { inviteId: U(800) })
    check("an invite link used 24 times in ten minutes stays on", t.community_invites[0].revoked_at === null)
    await watchJoin(db, community({ approval_required: true }), U(4100), { inviteId: U(800) })
    check("the 25th use turns it off, logged and in the queue", t.community_invites[0].revoked_at !== null && t.community_audit_log.some((a) => a.action === "invite.revoked" && a.actor_kind === "system") && t.community_reports.some((r) => /Invite link turned off: used 25 times/.test(r.note)))

    db = pg(staffTables())
    const request = new Request("https://storelib.com/x", { headers: { "x-forwarded-for": "198.51.100.7" } })
    const miss = async () => ({ ok: false as const, status: 400, error: "not_found", message: "no" })
    const outs: string[] = []
    for (let i = 0; i < 11; i++) {
      const a = await guardInvite(request, ANA, miss, db)
      outs.push(a.ok ? "ok" : String(a.error))
    }
    check("ten invite links that do not work, then a wait", outs.slice(0, 10).every((o) => o === "not_found") && outs[10] === "too_many", outs.join())
    const other = await guardInvite(new Request("https://storelib.com/x", { headers: { "x-forwarded-for": "198.51.100.7" } }), BEN, async () => ({ ok: true as const, state: "member" }), db)
    check("the same address waits too, whoever is signed in", !other.ok && (other as any).status === 429)
    db = pg(staffTables())
    for (let i = 0; i < 12; i++) await guardInvite(request, ANA, async () => ({ ok: false as const, status: 410, error: "expired", message: "x" }), db)
    check("an expired or used up link is not counted as a guess", (await guardInvite(request, ANA, async () => ({ ok: true as const }), db)).ok)
  }

  console.log("\nWIRING")
  {
    const feed = code("lib/communities/server/feed.ts")
    const create = feed.slice(feed.indexOf("export async function createPost"), feed.indexOf("export async function updatePost"))
    check("createPost screens before it writes, writes held columns, holds before telling anybody", create.indexOf("screenWrite(w, \"post\"") > 0 && create.indexOf("screenWrite(") < create.indexOf(".insert(") && /\.\.\.heldColumns\(screen, "post"\)/.test(create) && create.indexOf("holdForReview(") < create.indexOf("notifyMentions(") && create.indexOf("holdForReview(") < create.indexOf("recordActivity("))
    const update = feed.slice(feed.indexOf("export async function updatePost"), feed.indexOf("export async function deletePost"))
    check("updatePost checks what an edit adds", update.indexOf("screenEdit(w, \"post\"") > 0 && update.indexOf("screenEdit(") < update.indexOf(".update("))
    const comments = code("lib/communities/server/comments.ts")
    const cc = comments.slice(comments.indexOf("export async function createComment"), comments.indexOf("async function ownComment"))
    check("createComment screens, writes held columns, holds before any notice", cc.indexOf("screenWrite(w, \"comment\"") > 0 && cc.indexOf("screenWrite(") < cc.indexOf(".insert(") && /\.\.\.heldColumns\(screen, "comment"\)/.test(cc) && cc.indexOf("holdForReview(") < cc.indexOf("notifyMember("))
    check("updateComment checks what an edit adds", /screenEdit\(w, "comment"/.test(comments.slice(comments.indexOf("export async function updateComment"))))
    const chat = code("lib/communities/server/chat.ts")
    check("chat messages are screened, and their edits", /screenWrite\(w, "message"/.test(chat.slice(chat.indexOf("export async function postMessage"), chat.indexOf("async function messageInCommunity"))) && /screenEdit\(w, "message"/.test(chat.slice(chat.indexOf("export async function editMessage"))))
    const direct = code("lib/communities/server/direct.ts")
    const send = direct.slice(direct.indexOf("export async function sendDirectMessage"))
    check("direct messages are screened before they are written", send.indexOf("screenWrite(") > 0 && send.indexOf("screenWrite(") < send.indexOf(".insert("))
    const reports = code("lib/communities/server/reports.ts")
    check("every new report may hide its target", /await hideAfterReports\(db, community, input\)/.test(reports) && reports.indexOf("hideAfterReports(") > reports.indexOf(".insert("))
    const join = code("lib/communities/server/join.ts")
    check("a free join and an invite join are watched", (join.match(/await watchJoin\(/g) ?? []).length === 2 && /watchJoin\(db, community, userId, \{ inviteId: refs\.inviteId \}\)/.test(join))
    const joinRoute = code("app/api/community/[communityId]/join/route.ts")
    const redeemRoute = code("app/api/community/[communityId]/invite/redeem/route.ts")
    check("joining is limited per account and per address", [joinRoute, redeemRoute].every((r) => /\(await joinRateLimit\(user\.id\)\) \?\? \(await joinAddressLimit\(request\)\)/.test(r)))
    check("invite redemption goes through the miss guard", /guardInvite\(request, user\.id, \(\) => redeemInvite\(/.test(redeemRoute))
    const postsRoute = code("app/api/community/[communityId]/posts/route.ts")
    const commentsRoute = code("app/api/community/[communityId]/posts/[postId]/comments/route.ts")
    check("a held post or comment is answered 202 held and never announced live", [postsRoute, commentsRoute].every((r) => /if \(isHeld\(result\)\) return NextResponse\.json\(\{ \w+, held: true, message: HELD_MESSAGE \}, \{ status: 202/.test(r) && r.indexOf("isHeld(result)") < r.indexOf("after(")))
    const creator = code("lib/communities/server/creator.ts")
    check("saving the welcome steps keeps the slow mode, and slow mode is a setting", /\.\.\.keptSafety\(c\.onboarding\)/.test(creator) && /b\.slowMode !== undefined/.test(creator) && /withSlowMode\(patch\.onboarding \?\? c\.onboarding, seconds\)/.test(creator))
    check("the moderation page hands the slow mode to the screen", /slowMode=\{slowModeOf\(c\)\}/.test(code("app/app/community/[id]/moderation/page.tsx")))
    const section = read("components/community/creator/moderation-section.tsx")
    const options = [...section.matchAll(/\{ seconds: (\d+), label:/g)].map((m) => Number(m[1]))
    check("the slow mode menu offers exactly the server's choices", options.join() === SAFETY.slowModeChoices.join(), options.join())
    check("held items have Approve and Keep hidden in the queue", /data-report-approve/.test(section) && /data-report-keep/.test(section) && /action: "restore"/.test(section))
    check("the moderation screen imports nothing from the server", !/lib\/communities\/server|server-only|next\/headers/.test(code("components/community/creator/moderation-section.tsx")))
    check("link-check and the blocklist are browser safe", !/server-only|node:/.test(code("lib/communities/link-check.ts")) && !/import /.test(code("lib/communities/link-blocklist.ts")))
    const limiter = code("lib/api/rate-limit.ts")
    check("the shared limiter's sweep keeps every window whole (two days)", SWEEP_KEEP_SECONDS >= 2 * 86_400 && /Math\.max\(longest, SWEEP_KEEP_SECONDS\)/.test(limiter) && !/Math\.max\(longest, 3600\)/.test(limiter))
    check("the safety buckets are all community- ones", Object.values(SAFETY_BUCKETS).every((b) => b.startsWith("community-")))
    check("no SQL was added for this", !/\.sql/.test(read("lib/communities/server/safety.ts").split("\n").filter((l) => /from "|import/.test(l)).join("\n")))

    const mine = ["lib/communities/server/safety.ts", "lib/communities/link-check.ts", "lib/communities/link-blocklist.ts", "components/community/creator/moderation-section.tsx"]
    const offenders = mine.filter((f) => /\u2014/.test(read(f)) || /\b(unlock\w*|elevate|seamless|powerful|effortless(ly)?|supercharge|transform\w*)\b/i.test(read(f)))
    check("no em dash and no banned word", offenders.length === 0, offenders.join(", "))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
