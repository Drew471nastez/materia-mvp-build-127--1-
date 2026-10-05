/**
 * ===========================================================================
 *  SAFETY 2 (round 13, asks 55 to 58): WORDS, PICTURES, ORPHANED UPLOADS
 * ===========================================================================
 * Every rule, run for real:
 *
 *   WORDS      lib/communities/word-filter.ts: whole words, phrases, stars,
 *              and the usual ways round a list (case, accents, wide
 *              letters, digits and signs, other alphabets, spelled out,
 *              invisible characters, stretched); no Scunthorpe; another
 *              alphabet's list matched as written; Chinese anywhere; the
 *              list's cleaning rules; where it is kept.
 *   SCREEN     safety.ts screenWrite and screenEdit with the lists: the
 *              platform's refused for everybody, adult phrases held (refused
 *              in chat), the community's refused or held as chosen, the team
 *              free of the community's list, one log line in ten minutes,
 *              the security log for the platform's lists, an edit checked
 *              for what it adds.
 *   PICTURES   lib/security/images (skin, classify) and image-check.ts on
 *              real pictures made with sharp: the thresholds, an animated
 *              GIF's later frame, a file that is not a picture, a
 *              decompression bomb; who is checked when, what is held, what
 *              is refused and deleted (only from the writer's own folder).
 *   ORPHANS    lib/communities/server/orphans.ts against a storage stand in:
 *              old and unused goes, young or used or unreadable stays, a
 *              deleted account's post keeps its pictures, dry runs remove
 *              nothing, a post's file is looked for by its id.
 *   WIRING     each piece is called where it must be (source checks).
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import sharp from "sharp"

import { stripComments } from "./_source"
import {
  WORD_LIST_MAX,
  cleanWordEntry,
  cleanWordList,
  compileList,
  findWords,
  hasPrintedWord,
  readText,
  splitWordInput,
  withWordSettings,
  wordPrint,
  wordSettingsOf,
} from "@/lib/communities/word-filter"
import { PLATFORM_ADULT, PLATFORM_HATE_PRINTS, PLATFORM_MINORS } from "@/lib/communities/word-blocklist"
import { SAFETY_BUCKETS, WORDS_REFUSED_COMMUNITY, WORDS_REFUSED_PLATFORM, keptSafety, safetyDeps, screenEdit, screenWords, screenWrite, withSlowMode, wordFindings, type WriteKind } from "@/lib/communities/server/safety"
import { IMAGE_RULE, classifierDeps, imageClassifier, judgePicture, readClassifierSetting, readPicture, resetClassifier, type ImageClasses, type ImageClassifier, type PictureReading } from "@/lib/security/images/classify"
import { SKIN_RULE, isSkinPixel, readSkin } from "@/lib/security/images/skin"
import { IMAGE_CHECK, PICTURE_REFUSED, imageCheckDeps, picturesOf, screenPictures, uploadedVideoCount } from "@/lib/communities/server/image-check"
import { COMMUNITY_FILE_PATH, COMMUNITY_PICTURE_PATH, ORPHANS, fileDayShare, orphanDeps, sweepCommunityOrphans } from "@/lib/communities/server/orphans"
import { engineAfterDeps, scanStoredWithEngines } from "@/lib/security/uploads/engine-after"
import type { Viewer } from "@/lib/communities/server/context"
import type { CommunityRow, MemberRow, Role } from "@/lib/communities/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => stripComments(readFileSync(p, "utf8"))

/* ── A small Postgres and storage stand in ──────────────────────────────── */

type Row = Record<string, any>

function parseOr(expr: string): ((r: Row) => boolean)[] {
  return expr.split(/,(?![^"]*"(?:[^"]*"[^"]*")*[^"]*$)/).map((part) => {
    const m = /^([a-z_]+)\.(eq|is|gte)\.(.*)$/.exec(part.trim())
    if (!m) throw new Error(`or() not understood: ${part}`)
    const [, col, op, raw] = m
    const v = raw.replace(/^"|"$/g, "")
    if (op === "is") return (r: Row) => (v === "null" ? r[col] == null : String(r[col]) === v)
    if (op === "eq") return (r: Row) => String(r[col]) === v
    return (r: Row) => r[col] != null && String(r[col]) >= v
  })
}

function contains(have: unknown, want: unknown[]): boolean {
  if (!Array.isArray(have)) return false
  return want.every((w) => have.some((h) => h && typeof h === "object" && Object.entries(w as Row).every(([k, v]) => (h as Row)[k] === v)))
}

function pg(tables: Record<string, Row[]> = {}, opts: { broken?: string[]; storage?: Record<string, Record<string, Row[]>>; rpc?: Record<string, Row[]> } = {}) {
  let serial = 0
  const removed: { bucket: string; paths: string[] }[] = []
  const id = () => `00000000-0000-4000-9000-${String(++serial).padStart(12, "0")}`
  function from(table: string) {
    const st = { op: "select", preds: [] as ((r: Row) => boolean)[], limit: null as number | null, head: false, payload: null as any, single: false, cols: "" }
    const rows = () => (tables[table] ??= [])
    const run = () => {
      if (opts.broken?.includes(table)) return { data: null, error: { code: "XX000", message: "unreachable" }, count: null }
      const hit = rows().filter((r) => st.preds.every((p) => p(r)))
      if (st.op === "select") {
        let out = [...hit]
        if (st.limit !== null) out = out.slice(0, st.limit)
        if (st.head) return { data: null, error: null, count: hit.length }
        if (st.single) return { data: out[0] ? { ...out[0] } : null, error: null }
        return { data: out.map((r) => ({ ...r })), error: null, count: hit.length }
      }
      if (st.op === "update") {
        for (const r of hit) Object.assign(r, st.payload)
        return { data: hit.map((r) => ({ ...r })), error: null }
      }
      const list = Array.isArray(st.payload) ? st.payload : [st.payload]
      for (const p of list) rows().push({ id: id(), created_at: new Date(safetyDeps.now()).toISOString(), ...p })
      return { data: null, error: null }
    }
    const q: any = {
      select(c?: string, o?: { head?: boolean }) { if (st.op === "select") { st.head = !!o?.head; st.cols = c ?? "" } return q },
      eq(c: string, v: unknown) { st.preds.push((r) => r[c] === v); return q },
      in(c: string, v: unknown[]) { st.preds.push((r) => v.includes(r[c])); return q },
      is(c: string, v: unknown) { st.preds.push((r) => (v === null ? r[c] == null : r[c] === v)); return q },
      not(c: string, op: string, v: unknown) { st.preds.push((r) => !(op === "is" && v === null ? r[c] == null : r[c] === v)); return q },
      gte(c: string, v: unknown) { st.preds.push((r) => r[c] != null && String(r[c]) >= String(v)); return q },
      or(expr: string) { const ps = parseOr(expr); st.preds.push((r) => ps.some((p) => p(r))); return q },
      contains(c: string, v: unknown[]) { st.preds.push((r) => contains(r[c], v)); return q },
      order() { return q },
      limit(n: number) { st.limit = n; return q },
      maybeSingle() { st.single = true; return q },
      single() { st.single = true; return q },
      update(p: Row) { st.op = "update"; st.payload = p; return q },
      insert(p: Row | Row[]) { st.op = "insert"; st.payload = p; return q },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) { try { resolve(run()) } catch (e) { reject(e) } },
    }
    return q
  }
  const storage = {
    from(bucket: string) {
      return {
        async list(folder: string) {
          const entries = opts.storage?.[bucket]?.[folder]
          return entries ? { data: entries.map((e) => ({ ...e })), error: null } : { data: null, error: { message: "no folder" } }
        },
        async remove(paths: string[]) { removed.push({ bucket, paths }); return { data: [], error: null } },
      }
    },
  }
  return { from, tables, storage, removed, rpc: async (fn: string) => ({ data: opts.rpc?.[fn] ?? [], error: null }) }
}

/* ── People and places ──────────────────────────────────────────────────── */

const U = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`
const C1 = "00000000-0000-4000-b000-000000000001"
const OWNER = U(1)
const MOD = U(2)
const ANA = U(3)
const BEN = U(4)

let clock = Date.parse("2026-10-05T12:00:00.000Z")
safetyDeps.now = () => clock
imageCheckDeps.now = () => clock
orphanDeps.now = () => clock
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
const tables = (): Record<string, Row[]> => ({ community_members: [member(OWNER, { role: "owner", source: "owner" }), member(MOD, { role: "moderator" }), member(ANA), member(BEN)], rate_limit_hits: [], community_reports: [], community_audit_log: [], community_notifications: [], file_security_events: [] })
const listed = (words: string[], action: "block" | "hold" = "block", extra: Record<string, unknown> = {}) => community({ onboarding: { ...extra, safety: { words, wordsAction: action } } as any })

/* Pictures, made for real. */
async function solid(rgb: [number, number, number], w = 96, h = 96, format: "png" | "jpeg" = "png"): Promise<Uint8Array> {
  const img = sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
  return new Uint8Array(await (format === "png" ? img.png() : img.jpeg()).toBuffer())
}
async function gif(frames: [number, number, number][]): Promise<Uint8Array> {
  const w = 48
  const raw = Buffer.concat(frames.map(([r, g, b]) => { const a = Buffer.alloc(w * w * 4); for (let i = 0; i < w * w; i++) { a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = 255 } return a }))
  return new Uint8Array(await sharp(raw, { raw: { width: w, height: w * frames.length, channels: 4, pageHeight: w } }).gif().toBuffer())
}
const SKIN: [number, number, number] = [224, 172, 140]
const SKY: [number, number, number] = [70, 130, 200]
const pic = (user: string, name = "1759600000000_ab12cd.webp") => ({ type: "image" as const, url: `https://x.supabase.co/storage/v1/object/public/product-images/${user}/community/${C1}/${name}` })

async function main() {
  console.log("\nWORDS")
  {
    const has = (text: string, entries: string[]) => findWords(readText(text), compileList(entries))
    check("a whole word matches, in any case", has("Total SCAM here", ["scam"]).length === 1)
    check("only whole words: class, assess and Scunthorpe never trip \"ass\"", has("first class assessment in Scunthorpe, passed", ["ass"]).length === 0)
    check("accents and wide letters read through", has("PÓRN", ["porn"]).length === 1 && has("ｐｏｒｎ", ["porn"]).length === 1)
    check("digits and signs for letters read through", has("p0rn", ["porn"]).length === 1 && has("a$$", ["ass"]).length === 1 && has("sh1t", ["shit"]).length === 1 && has("he11o", ["hello"]).length === 1)
    check("a Cyrillic letter inside a Latin word reads as Latin", has("pоrn", ["porn"]).length === 1)
    check("letters spelled out are joined", has("p o r n", ["porn"]).length === 1 && has("p.o.r.n", ["porn"]).length === 1 && has("p-0-r-n!", ["porn"]).length === 1)
    check("an invisible character inside a word is dropped", has("po​rn", ["porn"]).length === 1 && has("sc­am", ["scam"]).length === 1)
    check("stretched letters are shortened", has("pooooorn", ["porn"]).length === 1 && has("asssss", ["ass"]).length === 1)
    check("ordinary doubled letters are never squeezed: good is not god, as is not ass", has("so good", ["god"]).length === 0 && has("as you like", ["ass"]).length === 0)
    check("a phrase matches its words in a row, spaces and case aside", has("get FREE   followers now", ["free followers"]).length === 1 && has("free and followers", ["free followers"]).length === 0)
    check("a star matches words starting with it", has("the scammer said", ["scam*"]).length === 1 && has("a scampi dish", ["scamm*"]).length === 0)
    check("a star in a phrase ends its last word", has("crypto signals today", ["crypto signal*"]).length === 1)
    check("a list in another alphabet is matched as written, not read as Latin", has("Сука!", ["сука"]).length === 1 && has("cyka", ["сука"]).length === 0)
    check("Chinese matches anywhere in the text", has("这是色情内容", ["色情"]).length === 1)
    check("each entry is reported once, in list order", JSON.stringify(has("scam scam forex", ["forex", "scam"])) === JSON.stringify(["forex", "scam"]))
    check("an empty text and an empty list match nothing", has("", ["scam"]).length === 0 && has("scam", []).length === 0)

    check("entries are cleaned: trimmed, lower case, single spaces", cleanWordEntry("  Free   FOLLOWERS ") === "free followers")
    check("a star needs three letters before it, at the end only", cleanWordEntry("ab*") === null && cleanWordEntry("abc*") === "abc*" && cleanWordEntry("a*bc") === null && cleanWordEntry("abc* def") === null)
    check("not a word, too long, too many words: refused", cleanWordEntry("!!!") === null && cleanWordEntry("x".repeat(61)) === null && cleanWordEntry("a b c d e f") === null)
    const cleaned = cleanWordList(["Scam", "scam", " forex ", "", "crypto signal*"])
    check("a list is cleaned and repeats dropped", cleaned.ok && JSON.stringify((cleaned as any).value) === JSON.stringify(["scam", "forex", "crypto signal*"]), cleaned)
    const bad = cleanWordList(["fine", "ab*"])
    check("the first entry that cannot be kept is answered with why", !bad.ok && /a star goes at the end/.test((bad as any).error))
    check("a body of a million entries is refused before any work", !cleanWordList(Array.from({ length: 1_000_000 }, () => "x")).ok)
    check("at most 200", !cleanWordList(Array.from({ length: WORD_LIST_MAX + 1 }, (_, i) => `word${i}`)).ok && cleanWordList(Array.from({ length: WORD_LIST_MAX }, (_, i) => `word${i}`)).ok)
    check("typed text splits on lines, commas and semicolons", JSON.stringify(splitWordInput("a\nb, c;d\n\n")) === JSON.stringify(["a", "b", "c", "d"]))
    check("a list that is not a list is refused", !cleanWordList(42).ok)

    const kept = withWordSettings(withSlowMode({ enabled: true, welcome: "Hi" }, 60), { words: ["scam"], action: "hold" })
    check("the list lives beside slow mode and the welcome steps, keeping both", (kept as any).welcome === "Hi" && (kept as any).safety.slowModeSeconds === 60 && JSON.stringify(wordSettingsOf(kept)) === JSON.stringify({ words: ["scam"], action: "hold" }))
    check("saving the welcome steps keeps the list (keptSafety)", JSON.stringify((keptSafety(kept) as any).safety.words) === JSON.stringify(["scam"]))
    check("no settings read as an empty list that refuses", JSON.stringify(wordSettingsOf(null)) === JSON.stringify({ words: [], action: "block" }) && wordSettingsOf({ safety: { wordsAction: "nonsense" } }).action === "block")

    check("fingerprints are 14 hex digits and stable", /^[0-9a-f]{14}$/.test(wordPrint("blorp")) && wordPrint("blorp") === wordPrint("blorp") && wordPrint("blorp") !== wordPrint("blorq"))
    const prints = new Set([wordPrint("blorp")])
    check("a fingerprinted word is found, through digits and spelling out", hasPrintedWord(readText("you BL0RP"), prints) && hasPrintedWord(readText("b l o r p"), prints) && !hasPrintedWord(readText("blorpy"), prints))
    check("the platform lists are well formed (every entry cleans to itself, prints are 14 hex)", [...PLATFORM_MINORS, ...PLATFORM_ADULT].every((e) => cleanWordEntry(e) === e) && PLATFORM_HATE_PRINTS.size >= 20 && [...PLATFORM_HATE_PRINTS].every((p) => /^[0-9a-f]{14}$/.test(p)))
    check("the platform lists stay clear of ordinary words (cp, a gaming term, is not there)", ![...PLATFORM_MINORS, ...PLATFORM_ADULT].some((e) => /(^|\s)cp(\s|$)/.test(e)) && has("buy cp for the battle pass, sexy dress, nude lipstick", [...PLATFORM_MINORS, ...PLATFORM_ADULT]).length === 0)
  }

  console.log("\nSCREEN")
  {
    const c = community()
    const f = (text: string, team = false, cm: CommunityRow = c) => wordFindings(cm, readText(text), team)
    let w = screenWords(c, f("child porn links here"), { team: true, chatLike: false })
    check("the platform's minors list is refused for the team too", w.refuse?.list === "minors" && w.refuse.error === WORDS_REFUSED_PLATFORM)
    w = screenWords(c, f("dm for nudes"), { team: false, chatLike: false })
    check("selling sexual content is held in a post", !w.refuse && w.hold.length === 1 && /sell sexual content/.test(w.hold[0]))
    w = screenWords(c, f("dm for nudes"), { team: false, chatLike: true })
    check("and refused in chat, which cannot be held", w.refuse?.list === "adult")
    w = screenWords(c, f("dm for nudes", true), { team: true, chatLike: false })
    check("the team is not held for it", !w.refuse && w.hold.length === 0)
    const blocking = listed(["forex", "crypto signal*"])
    w = screenWords(blocking, f("Best FOREX tips", false, blocking), { team: false, chatLike: false })
    check("the community's list refuses when set to refuse", w.refuse?.list === "community" && w.refuse.error === WORDS_REFUSED_COMMUNITY)
    const holding = listed(["forex"], "hold")
    w = screenWords(holding, f("Best forex tips", false, holding), { team: false, chatLike: false })
    check("and holds when set to hold, naming the word for the moderator", !w.refuse && w.hold.some((h) => h.includes('"forex"')))
    w = screenWords(holding, f("Best forex tips", false, holding), { team: false, chatLike: true })
    check("a hold in a direct message or chat is a refusal", w.refuse?.list === "community")
    w = screenWords(blocking, f("Best forex tips", true, blocking), { team: true, chatLike: false })
    check("the team may write the community's words (to name them)", !w.refuse && w.hold.length === 0)

    const write = (db: any, who: Viewer, kind: WriteKind, text: string, cm: CommunityRow) => screenWrite({ db, community: cm, viewer: who }, kind, { text })
    const db = pg(tables())
    const ana = viewer(ANA)
    let s = await write(db, ana, "post", "Forex signals daily", blocking)
    check("screenWrite refuses a listed word with the community's sentence, 400", !s.ok && (s as any).status === 400 && (s as any).error === WORDS_REFUSED_COMMUNITY)
    const logged = db.tables.community_audit_log.filter((a) => a.action === "post.refused")
    check("the refusal is in the community's log with the word and the author", logged.length === 1 && logged[0].actor_kind === "system" && logged[0].detail.authorId === ANA && JSON.stringify(logged[0].detail.words) === JSON.stringify(["forex"]) && /community's word list/.test(logged[0].reason))
    s = await write(db, ana, "comment", "forex again", blocking)
    s = await write(db, ana, "message", "and forex", blocking)
    check("retrying is one log line in ten minutes", !s.ok && db.tables.community_audit_log.filter((a) => /\.refused$/.test(a.action)).length === 1 && db.tables.rate_limit_hits.filter((h) => h.bucket === SAFETY_BUCKETS.words).length === 1)
    clock += 601_000
    await write(db, ana, "dm", "forex", blocking)
    check("after ten minutes it is logged again, a direct message as a message", db.tables.community_audit_log.filter((a) => /\.refused$/.test(a.action)).length === 2 && db.tables.community_audit_log.some((a) => a.action === "message.refused"))
    const dmLine = db.tables.community_audit_log.find((a) => a.action === "message.refused" && a.target_label === "A direct message")
    check("a refused direct message is logged without its words (private between two members)", !!dmLine && !("words" in dmLine.detail) && !/forex/.test(dmLine.reason))
    check("a refused write counts nothing else (no slow mode or duplicate hits)", db.tables.rate_limit_hits.every((h) => h.bucket === SAFETY_BUCKETS.words))
    s = await write(db, viewer(OWNER, "owner"), "post", "pthc", community())
    const sec = db.tables.file_security_events
    check("the platform's list: the owner is refused too, and the platform's security log has it", !s.ok && (s as any).error === WORDS_REFUSED_PLATFORM && sec.length === 1 && sec[0].code === "words_minors" && sec[0].outcome === "refused" && sec[0].context === "community_words")
    s = await write(db, viewer(MOD, "moderator"), "post", "Never post forex tips here", blocking)
    check("a moderator writes the community's word", s.ok)
    s = await write(pg(tables()), ana, "post", "My forex journal for the week", holding)
    check("held: screenWrite goes ahead with the hold reason", s.ok && (s as any).hold.some((h: string) => h.includes('"forex"')))
    s = await write(pg(tables()), ana, "post", "A calm post about pottery glazes", blocking)
    check("a clean post goes up with no hold", s.ok && (s as any).hold.length === 0)

    const edit = (text: string, before: string, cm: CommunityRow, who: Viewer = ana) => screenEdit({ db: pg(tables()), community: cm, viewer: who }, "post", { text, before })
    check("an edit adding a listed word is refused", !(await edit("now with forex", "plain", holding)).ok)
    check("an edit keeping a word that was there already is fine (the list grew later)", (await edit("forex, typo fixed", "forex, typo fixd", blocking)).ok)
    check("an edit adding the platform's minors words is refused", !(await edit("plain pthc", "plain", community(), viewer(OWNER, "owner"))).ok)
  }

  console.log("\nPICTURES")
  {
    check("one pixel is skin by both rules, sky and grey are not", isSkinPixel(...SKIN) && !isSkinPixel(...SKY) && !isSkinPixel(128, 128, 128))
    const px = (rgb: [number, number, number], n: number) => { const a = new Uint8Array(n * 3); for (let i = 0; i < n; i++) a.set(rgb, i * 3); return a }
    check("a picture all skin is skin heavy, all sky is not, no pixels is nothing", readSkin(px(SKIN, 100), 10, 10, 3).heavy && !readSkin(px(SKY, 100), 10, 10, 3).heavy && !readSkin(new Uint8Array(0), 0, 0, 3).heavy)
    const half = new Uint8Array(100 * 3)
    for (let i = 0; i < 100; i++) half.set(i % 10 < 3 ? SKIN : SKY, i * 3)
    const thirty = readSkin(half, 10, 10, 3)
    check(`under ${SKIN_RULE.minSkin * 100}% skin is not skin heavy`, thirty.skin === 0.3 && !thirty.heavy, thirty)

    const reading = (classes: Partial<ImageClasses> | null, heavy = false): PictureReading => ({ frames: 1, skin: { skin: heavy ? 0.6 : 0.1, largest: heavy ? 0.5 : 0.05, top3: 1, regions: 1, heavy }, classes: classes ? { porn: 0, hentai: 0, sexy: 0, neutral: 1, drawing: 0, ...classes } : null })
    const j = (r: PictureReading | null, fresh: boolean, team = false) => judgePicture(r, { fresh, team })
    check("clearly explicit is refused for everybody, the team included", j(reading({ porn: 0.8, hentai: 0.06 }), false).action === "refuse" && j(reading({ porn: 0.9 }), false, true).action === "refuse")
    check("likely explicit or clearly suggestive is held for a member", j(reading({ porn: 0.6 }), false).code === "adult_likely" && j(reading({ sexy: IMAGE_RULE.holdSexy }), false).code === "adult_suggestive")
    check("the ordinary photos' highest scores (0.44 explicit, 0.86 sexy) go up for an established member", j(reading({ porn: 0.42, hentai: 0.02 }), false).action === "ok" && j(reading({ sexy: 0.86 }), false).action === "ok")
    check("a first day member is held on the tighter line", j(reading({ porn: 0.36 }), true).action === "hold" && j(reading({ sexy: 0.71 }), true).action === "hold" && j(reading({ porn: 0.2, sexy: 0.5 }), true).action === "ok")
    check("the team is never held, only refused", j(reading({ porn: 0.6 }), true, true).action === "ok")
    check("without the classifier: skin heavy is held for a first day member only", j(reading(null, true), true).code === "skin_heavy" && j(reading(null, true), false).action === "ok" && j(reading(null, true), true, true).action === "ok")
    check("a picture that cannot be read is held for a first day member, let through otherwise", j(null, true).code === "unreadable" && j(null, false).action === "ok")
    check("with the classifier on, bytes that will not decode are held for anybody but the team (a HEIC Safari shows)", judgePicture(null, { fresh: false, team: false, undecodable: true, classifierOn: true }).action === "hold" && judgePicture(null, { fresh: false, team: false, undecodable: true, classifierOn: false }).action === "ok" && judgePicture(null, { fresh: false, team: true, undecodable: true, classifierOn: true }).action === "ok" && judgePicture(null, { fresh: false, team: false, undecodable: false, classifierOn: true }).action === "ok")

    const skinPng = await solid(SKIN)
    const r1 = await readPicture(skinPng, null)
    const r2 = await readPicture(await solid(SKY, 96, 96, "jpeg"), null)
    check("readPicture reads a real PNG and JPEG", !!r1 && r1.skin.heavy && r1.frames === 1 && !!r2 && !r2.skin.heavy && r1.classes === null)
    const anim = await readPicture(await gif([[128, 128, 128], SKY, SKIN]), null)
    check("an animated GIF is read on its frames, a skin third frame counts", !!anim && anim.frames === 3 && anim.skin.heavy, anim)
    check("bytes that are not a picture read as null", (await readPicture(new TextEncoder().encode("MZ not a picture at all"), null)) === null)
    const bomb = new Uint8Array(await sharp({ create: { width: 8000, height: 6000, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png({ compressionLevel: 9 }).toBuffer())
    check("a picture over 40 million pixels is not decoded (a decompression bomb)", (await readPicture(bomb, null)) === null)
    const seen: number[] = []
    const fake: ImageClassifier = { name: "nsfwjs", async classify(rgb, w, h) { seen.push(w, h, rgb.length); return { porn: 0.05, hentai: 0, sexy: 0.1, neutral: 0.85, drawing: 0 } } }
    const r3 = await readPicture(skinPng, fake)
    check(`the classifier is handed ${IMAGE_RULE.input}px RGB`, seen[0] === IMAGE_RULE.input && seen[1] === IMAGE_RULE.input && seen[2] === IMAGE_RULE.input * IMAGE_RULE.input * 3 && r3?.classes?.neutral === 0.85)
    const angry: ImageClassifier = { name: "nsfwjs", async classify() { throw new Error("broken model") } }
    const r4 = await readPicture(skinPng, angry)
    check("a classifier that throws leaves the skin reading to decide", !!r4 && r4.classes === null && r4.skin.heavy)

    check("the flag: off unless it names nsfwjs", readClassifierSetting({}).requested === null && readClassifierSetting({ SECURITY_IMAGE_CLASSIFIER: " NSFWJS " }).requested === "nsfwjs" && readClassifierSetting({ SECURITY_IMAGE_CLASSIFIER: "aws" }).unknown === "aws")
    resetClassifier()
    const realLoad = classifierDeps.load
    let loads = 0
    classifierDeps.load = async () => { loads++; throw new Error("Cannot find package 'nsfwjs'") }
    const errs: unknown[] = []
    const was = console.error
    console.error = (...a: unknown[]) => errs.push(a)
    const a1 = await imageClassifier({ SECURITY_IMAGE_CLASSIFIER: "nsfwjs" })
    const a2 = await imageClassifier({ SECURITY_IMAGE_CLASSIFIER: "nsfwjs" })
    console.error = was
    check("asked for and not installed: null, said once, not retried every write", a1 === null && a2 === null && loads === 1 && errs.length === 1)
    check("off: never loaded", (await imageClassifier({})) === null && loads === 1)
    classifierDeps.load = realLoad
    resetClassifier()

    check("picturesOf: Storelib's pictures and video stills, once each; GIFs and link pictures are not ours", picturesOf([pic(ANA), pic(ANA), { type: "video", videoId: "v", poster: pic(ANA, "1759600000001_ff.jpg").url }, { type: "gif", url: "https://media.giphy.com/media/x/giphy.gif", still: "https://media.giphy.com/media/x/s.gif" }, { type: "link", url: "https://example.com", image: "https://example.com/a.jpg" }]).length === 2)
    check("uploaded videos are counted, videos by address are not", uploadedVideoCount([{ type: "video", videoId: "v" }, { type: "embed", provider: "youtube", id: "x", url: "https://youtu.be/x" }]) === 1)

    /* screenPictures with storage and the classifier stood in. */
    const store: Record<string, Uint8Array> = {}
    const downloads: string[] = []
    const removes: string[] = []
    const logs: any[] = []
    let classifier: ImageClassifier | null = null
    imageCheckDeps.download = async (_db, path) => { downloads.push(path); return store[path] ?? null }
    imageCheckDeps.remove = async (_db, path) => { removes.push(path) }
    imageCheckDeps.log = async (_db, e) => { logs.push(e) }
    imageCheckDeps.classifier = async () => classifier
    const anaPic = picturesOf([pic(ANA)])
    store[anaPic[0].path] = skinPng
    const who = (fresh: boolean, team = false, userId = ANA) => ({ communityId: C1, userId, fresh, team })
    let ps = await screenPictures({} as any, who(false), anaPic)
    check("classifier off, an established member: nothing is downloaded at all", !ps.refuse && ps.hold.length === 0 && downloads.length === 0)
    ps = await screenPictures({} as any, who(true), anaPic)
    check("classifier off, a first day member's skin heavy picture is held, and logged for staff", ps.hold.length === 1 && /lot of skin/.test(ps.hold[0]) && downloads.length === 1 && logs.at(-1)?.code === "skin_heavy" && logs.at(-1)?.outcome === "noted")
    ps = await screenPictures({} as any, who(true), picturesOf([pic(ANA, "1759600000009_zz.webp")]))
    check("a first day member's picture that is not there to read is held", ps.hold.length === 1 && /could not be checked/.test(ps.hold[0]))
    classifier = { name: "nsfwjs", async classify() { return { porn: 0.9, hentai: 0.02, sexy: 0.05, neutral: 0.03, drawing: 0 } } }
    ps = await screenPictures({} as any, who(false), anaPic)
    check("classifier on, clearly explicit: refused, deleted from the writer's own folder, logged as removed", ps.refuse && removes.length === 1 && removes[0] === anaPic[0].path && logs.at(-1)?.code === "adult_explicit" && logs.at(-1)?.outcome === "removed")
    ps = await screenPictures({} as any, who(false, false, BEN), anaPic)
    check("somebody else's picture in a post is refused but never deleted by this check", ps.refuse && removes.length === 1)
    const heic = picturesOf([pic(ANA, "1759600000005_hh.heic")])
    store[heic[0].path] = new TextEncoder().encode("....ftypheic not decodable here")
    ps = await screenPictures({} as any, who(false), heic)
    check("classifier on: an established member's picture that is there but will not decode is held", !ps.refuse && ps.hold.length === 1 && /could not be checked/.test(ps.hold[0]))
    ps = await screenPictures({} as any, who(false), picturesOf([pic(ANA, "1759600000006_gone.webp")]))
    check("classifier on: a picture storage could not hand over is let through for an established member (fail open)", !ps.refuse && ps.hold.length === 0)
    classifier = { name: "nsfwjs", async classify() { return { porn: 0.1, hentai: 0, sexy: 0.95, neutral: 0, drawing: 0 } } }
    ps = await screenPictures({} as any, who(false), anaPic)
    check("classifier on, clearly suggestive: held for a member", !ps.refuse && ps.hold.length === 1 && /adult content/.test(ps.hold[0]))
    ps = await screenPictures({} as any, who(false, true), anaPic)
    check("and the team's is not held", !ps.refuse && ps.hold.length === 0)
    const slow = { name: "nsfwjs" as const, async classify() { clock += IMAGE_CHECK.budgetMs + 1; return { porn: 0, hentai: 0, sexy: 0, neutral: 1, drawing: 0 } } }
    classifier = slow
    const two = picturesOf([pic(ANA), pic(ANA, "1759600000002_bb.webp")])
    store[two[1].path] = skinPng
    const before = downloads.length
    ps = await screenPictures({} as any, who(true), two)
    check("out of time: the pictures not reached count as not read (held for a first day member)", downloads.length === before + 1 && ps.hold.some((h) => /could not be checked/.test(h)))

    /* Through screenWrite and screenEdit. */
    classifier = null
    const newcomer = viewer(ANA, "member", { joined_at: ago(2) })
    let s = await screenWrite({ db: pg(tables()) as any, community: community(), viewer: newcomer }, "post", { text: "My first bowl", media: [pic(ANA)] })
    check("screenWrite: a first day member's skin heavy picture holds the post", s.ok && (s as any).hold.some((h: string) => /lot of skin/.test(h)))
    s = await screenWrite({ db: pg(tables()) as any, community: community(), viewer: newcomer }, "post", { text: "My first video", media: [{ type: "video", videoId: "v1" }] })
    check("screenWrite: a first day member's uploaded video is held", s.ok && (s as any).hold.includes("a video from a member on their first day"))
    s = await screenWrite({ db: pg(tables()) as any, community: community(), viewer: viewer(ANA, "member", { joined_at: ago(2), source: "subscription" }) }, "post", { text: "Paid member video", media: [{ type: "video", videoId: "v1" }] })
    check("a paid member is not new: no hold", s.ok && (s as any).hold.length === 0)
    s = await screenWrite({ db: pg(tables()) as any, community: community(), viewer: newcomer }, "message", { text: "hi", media: [pic(ANA)] })
    check("chat messages carry no pictures to read here", s.ok && (s as any).hold.length === 0)
    classifier = { name: "nsfwjs", async classify() { return { porn: 0.95, hentai: 0, sexy: 0, neutral: 0.05, drawing: 0 } } }
    s = await screenWrite({ db: pg(tables()) as any, community: community(), viewer: viewer(OWNER, "owner") }, "post", { text: "Owner post", media: [pic(ANA)] })
    check("screenWrite: the owner's clearly explicit picture is refused too", !s.ok && (s as any).error === PICTURE_REFUSED)
    const e1 = await screenEdit({ db: pg(tables()) as any, community: community(), viewer: viewer(ANA) }, "post", { text: "t", before: "t", media: [pic(ANA)], beforeMedia: [pic(ANA)] })
    check("an edit that keeps its pictures does not read them again", e1.ok)
    classifier = { name: "nsfwjs", async classify() { return { porn: 0.6, hentai: 0, sexy: 0, neutral: 0.4, drawing: 0 } } }
    const e2 = await screenEdit({ db: pg(tables()) as any, community: community(), viewer: viewer(ANA) }, "post", { text: "t", before: "t", media: [pic(ANA), pic(ANA, "1759600000002_bb.webp")], beforeMedia: [pic(ANA)] })
    check("an edit adding a picture that would be held is refused (nothing can be held on an edit)", !e2.ok && /moderator needs to see that picture/.test((e2 as any).error))
    classifier = null
    const e3 = await screenEdit({ db: pg(tables()) as any, community: community(), viewer: newcomer }, "post", { text: "t", before: "t", media: [{ type: "video", videoId: "v" }], beforeMedia: [] })
    check("a first day member cannot add an uploaded video in an edit", !e3.ok && (e3 as any).status === 403)
  }

  console.log("\nORPHANS")
  {
    const name = (n: number) => `17596${String(n).padStart(8, "0")}_a${n}.webp`
    check("the composer's picture name matches; product photos, covers and other folders do not", COMMUNITY_PICTURE_PATH.test(`${ANA}/community/${C1}/${name(1)}`) && !COMMUNITY_PICTURE_PATH.test(`${ANA}/${C1}/photo.webp`) && !COMMUNITY_PICTURE_PATH.test(`${ANA}/community/${C1}/cover.webp`) && !COMMUNITY_PICTURE_PATH.test(`${ANA}/community/${C1}/sub/${name(1)}`))
    const fid = "11111111-2222-4333-8444-555555555555"
    check("a post file path matches its shape only", COMMUNITY_FILE_PATH.test(`${OWNER}/community-files/${C1}/${ANA}/${fid}.pdf`) && !COMMUNITY_FILE_PATH.test(`${OWNER}/digital-products/${fid}.pdf`))

    const folder = `${ANA}/community/${C1}`
    const old = ago(24 * (ORPHANS.graceDays + 1))
    const young = ago(24 * 3)
    const objects = [1, 2, 3, 4, 5].map((n) => ({ bucket_id: "product-images", name: `${folder}/${name(n)}` }))
    const storage = { "product-images": { [folder]: [{ name: name(1), id: "o1", created_at: old }, { name: name(2), id: "o2", created_at: old }, { name: name(3), id: "o3", created_at: young }, { name: name(4), id: "o4", created_at: old }, { name: name(5), id: "o5", created_at: old }] } }
    const rows = (): Record<string, Row[]> => ({
      community_feed_posts: [
        { community_id: C1, author_id: ANA, title: "t", body_text: "b", media: [pic(ANA, name(2))], created_at: ago(24 * 15), edited_at: null, status: "deleted" },
        { community_id: C1, author_id: null, title: "t", body_text: "b", media: [{ type: "video", videoId: "v", poster: pic(ANA, name(4)).url }], created_at: ago(24 * 15), edited_at: null, status: "published" },
      ],
      community_feed_comments: [{ community_id: C1, author_id: ANA, body: `see ${pic(ANA, name(5)).url}`, media: [], created_at: ago(24 * 15) }],
      community_messages: [],
      communities: [],
    })
    let db = pg(rows(), { storage, rpc: { storage_recent_public_images: objects, storage_recent_public_objects: [] } })
    let sum = await sweepCommunityOrphans(db as any)
    const gone = db.removed.flatMap((r) => r.paths)
    check("an old picture nothing uses is removed", gone.length === 1 && gone[0] === `${folder}/${name(1)}`, gone)
    check("a deleted post keeps its picture (it can be restored), a deleted account's post keeps its still, a comment's link keeps its picture, a young one stays", !gone.some((p) => /a2|a3|a4|a5/.test(p)) && sum.pictures.removed === 1 && sum.pictures.kept === 4, sum)
    db = pg(rows(), { storage, rpc: { storage_recent_public_images: objects, storage_recent_public_objects: [] } })
    sum = await sweepCommunityOrphans(db as any, { dryRun: true })
    check("a dry run removes nothing and says what would go", db.removed.length === 0 && sum.pictures.removed === 1 && sum.dryRun)
    db = pg(rows(), { storage, rpc: { storage_recent_public_images: objects }, broken: ["community_messages"] })
    sum = await sweepCommunityOrphans(db as any)
    check("a table that cannot be read keeps every picture of that member", db.removed.length === 0 && sum.pictures.kept === 5)
    const full = rows()
    full.community_messages = Array.from({ length: 5000 }, () => ({ community_id: C1, author_id: ANA, body: "hi", attachments: [], created_at: ago(1) }))
    db = pg(full, { storage, rpc: { storage_recent_public_images: objects } })
    sum = await sweepCommunityOrphans(db as any)
    check("a read that comes back full (5000 rows) keeps everything rather than guess", db.removed.length === 0)
    db = pg(rows(), { storage: {}, rpc: { storage_recent_public_images: objects } })
    sum = await sweepCommunityOrphans(db as any)
    check("a folder that cannot be listed keeps everything", db.removed.length === 0)
    db = pg(rows(), { storage, rpc: { storage_recent_public_images: [{ bucket_id: "product-images", name: `${ANA}/${C1}/1759600000000_x.webp` }, { bucket_id: "avatars", name: `${folder}/${name(1)}` }] } })
    sum = await sweepCommunityOrphans(db as any)
    check("other shapes and other buckets are never candidates", sum.pictures.candidates === 0 && db.removed.length === 0)

    /* Files: the community whose turn it is today. */
    const day = Math.floor(clock / 86_400_000) % 7
    const cid = Array.from({ length: 300 }, (_, i) => `00000000-0000-4000-c000-${i.toString(16).padStart(12, "0")}`).find((x) => fileDayShare(x, clock))!
    check("a seventh of the communities a day", fileDayShare(cid, clock) && !fileDayShare(cid, clock + 86_400_000) && typeof day === "number")
    const base = `${OWNER}/community-files/${cid}`
    const fid2 = "11111111-2222-4333-8444-666666666666"
    const fid3 = "11111111-2222-4333-8444-777777777777"
    const fstore = { "digital-products": { [base]: [{ name: ANA, id: null }], [`${base}/${ANA}`]: [{ name: `${fid}.pdf`, id: "f1", created_at: old }, { name: `${fid2}.zip`, id: "f2", created_at: old }, { name: `${fid3}.pdf`, id: "f3", created_at: young }] } }
    db = pg({ communities: [{ id: cid, creator_id: OWNER }], community_feed_posts: [{ community_id: cid, author_id: ANA, media: [{ type: "file", assetId: fid2, name: "a.zip", store: "community" }], status: "removed" }] }, { storage: fstore, rpc: {} })
    sum = await sweepCommunityOrphans(db as any)
    const fgone = db.removed.flatMap((r) => r.paths)
    db = pg({ communities: [{ id: cid, creator_id: OWNER }], community_feed_posts: [], community_feed_comments: [{ community_id: cid, media: [{ type: "file", assetId: fid, name: "a.pdf", store: "community" }] }], community_messages: [{ community_id: cid, attachments: [{ type: "file", assetId: fid2, name: "a.zip" }] }] }, { storage: fstore, rpc: {} })
    await sweepCommunityOrphans(db as any)
    check("a file an older comment or a chat message carries stays", db.removed.length === 0)
    db = pg({ communities: [{ id: cid, creator_id: OWNER }], community_feed_posts: [] }, { storage: fstore, rpc: {}, broken: ["community_feed_comments"] })
    await sweepCommunityOrphans(db as any)
    check("comments that cannot be read (no media column yet) keep every file", db.removed.length === 0)
    db = pg({ communities: [{ id: cid, creator_id: OWNER }], community_feed_posts: [{ community_id: cid, author_id: ANA, media: [{ type: "file", assetId: fid2, name: "a.zip", store: "community" }], status: "removed" }] }, { storage: fstore, rpc: {} })
    sum = await sweepCommunityOrphans(db as any)
    const fgone2 = db.removed.flatMap((r) => r.paths)
    check("an old file no post carries is removed; one a post carries (even removed) and a young one stay (again, comments readable)", fgone2.length === 1 && fgone2[0] === fgone[0])
    check("an old file no post carries is removed; one a post carries (even removed) and a young one stay", fgone.length === 1 && fgone[0] === `${base}/${ANA}/${fid}.pdf` && sum.files.removed === 1 && sum.files.communities === 1, { fgone, sum })
  }

  console.log("\nMALWARE ENGINE ON POST FILES")
  {
    const file = { bucket: "digital-products", path: `${OWNER}/community-files/${C1}/${ANA}/11111111-2222-4333-8444-555555555555.pdf`, fileName: "notes.pdf", size: 1234, context: "link_page_file" as const, userId: ANA, creatorId: OWNER }
    let db = pg({ file_security_events: [] })
    engineAfterDeps.providers = () => []
    check("no engine switched on: nothing read, nothing logged", (await scanStoredWithEngines(db as any, file)) === "skipped" && db.tables.file_security_events.length === 0)
    const asked: any[] = []
    engineAfterDeps.providers = () => [{ name: "clamav", isEnabled: () => true, async scan(input: any) { asked.push(input); return { provider: "clamav", status: "infected", threat: "Eicar-Test-Signature", durationMs: 5 } } }]
    const out = await scanStoredWithEngines(db as any, file)
    check("an infected post file is deleted and logged as removed, read from storage (never downloaded here)", out === "infected" && db.removed.length === 1 && db.removed[0].paths[0] === file.path && db.tables.file_security_events[0].outcome === "removed" && db.tables.file_security_events[0].code === "provider_infected" && asked[0].stored?.path === file.path)
    db = pg({ file_security_events: [] })
    engineAfterDeps.providers = () => [{ name: "clamav", isEnabled: () => true, async scan() { return { provider: "clamav", status: "clean", durationMs: 5 } } }]
    check("a clean one stays, logged as info", (await scanStoredWithEngines(db as any, file)) === "clean" && db.removed.length === 0 && db.tables.file_security_events[0].outcome === "info")
    db = pg({ file_security_events: [] })
    engineAfterDeps.providers = () => [{ name: "clamav", isEnabled: () => true, async scan() { return { provider: "clamav", status: "no_verdict", reason: "timeout", durationMs: 5 } } }]
    check("no verdict (the engine down) changes nothing and is noted", (await scanStoredWithEngines(db as any, file)) === "no_verdict" && db.removed.length === 0 && db.tables.file_security_events[0].outcome === "noted")
  }

  console.log("\nWIRING")
  {
    const safety = code("lib/communities/server/safety.ts")
    const sw = safety.slice(safety.indexOf("export async function screenWrite"), safety.indexOf("export async function screenEdit"))
    check("screenWrite reads the words before the team's early answer", sw.indexOf("screenWords(") > 0 && sw.indexOf("screenWords(") < sw.indexOf("if (team)"))
    check("screenWrite reads pictures for posts and comments, after the cheap rules, before counting", sw.lastIndexOf("screenPictures(") > sw.indexOf("contentFingerprint(") && sw.lastIndexOf("screenPictures(") < sw.indexOf("await addHits("))
    const se = safety.slice(safety.indexOf("export async function screenEdit"))
    check("screenEdit reads words and added pictures", /screenWords\(/.test(se) && /screenPictures\(/.test(se))
    const route = code("app/api/app/community/[id]/words/route.ts")
    const put = route.slice(route.indexOf("export async function PUT"))
    check("the words route: communities switch first, the settings permission to change, rate limited, cleaned", put.indexOf("requireCommunitiesOn()") < put.indexOf("requireCreatorCommunity(id, \"manage_settings\")") && /manageLimit\(/.test(put) && /cleanWordList\(/.test(put) && /\.eq\("id", gate\.community\.id\)/.test(put))
    check("the words route's GET needs a team role (view), never a member", /requireCreatorCommunity\(id, "view"\)/.test(route))
    const cron = code("app/api/cron/storage-cleanup/route.ts")
    check("the daily storage job runs the community sweep, dry runs included", /sweepCommunityOrphans\(createAdminClient\(\), \{ dryRun: url\.searchParams\.get\("dry"\) === "1" \}\)/.test(cron))
    const classify = code("lib/security/images/classify.ts")
    check("the classifier's packages are loaded at run time, never bundled (the app builds without them)", /webpackIgnore: true/.test(readFileSync("lib/security/images/classify.ts", "utf8")) && !/from "nsfwjs"|from "@tensorflow/.test(classify))
    const comp = readFileSync("components/community/creator/blocked-words.tsx", "utf8")
    check("the settings component is a client module that imports nothing from the server", comp.startsWith('"use client"') && !/server-only|next\/headers|communities\/server\//.test(stripComments(comp)))
    const pf = code("lib/communities/server/post-files.ts")
    check("a post file that passed the built-in check goes to the malware engine after the answer", pf.indexOf("scanStoredAfterResponse(") > pf.indexOf("if (!verdict.ok)") && pf.indexOf("scanStoredAfterResponse(") > 0)
    const pm = code("lib/communities/post-media.ts")
    check("comments take no files (pictures, a GIF, a video by link only)", /COMMENT_MEDIA_TYPES: readonly PostMedia\["type"\]\[\] = \["image", "gif", "embed"\]/.test(pm))
    const wf = code("lib/communities/word-filter.ts")
    check("the word filter is browser safe (no node modules)", !/from "node:|server-only/.test(wf))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
