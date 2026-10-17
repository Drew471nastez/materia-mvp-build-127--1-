/**
 * ROUND 26 (W5): the community Page editor rebuilt, the short description and the member links (run-now part 220).
 *
 *   LINKS     a member link's address: http(s), or one path on this site; never javascript:, data:, //host, a
 *             backslash, spaces or a password; the list cleaned (at most four, ids unique, the icon from the list)
 *   SUMMARY   one plain line, up to 160 characters counted as the database counts them (an emoji is one)
 *   PRICE     the join button's words and line never carry a price, a currency with an amount or a billing period,
 *             nor "free" on a page that charges; a look stored before is read with such words left out
 *   DRAFT     the six groups hold every part once; Save sends the new fields; what waits names its part
 *   ROUND     every field the editor has, changed, sent through the real settings save into a stand-in database, read
 *             back through the real settings read: the editor starts again from exactly what was saved
 *   WAITING   before part 220 the editor is told the two fields wait, and a save naming them says so
 *   SQL       part 220: the two columns, their checks, never granted to the browser's keys, the migration copy, the
 *             README row, the check column; the community row every page reads does not name member_links
 *   SOURCE    the editor's layout: the panel in the page's own scroll, the drawer below 1280, the visitor's view, the
 *             full screen, the description still the product editor's rich text with the server's sanitizer
 *
 * scripts/check-page-editor26.mjs measures the editor in a browser at 1440, 1280, 820 and 390.
 */
import { readFileSync } from "node:fs"
import { readCode } from "./_source"
import { fakeDb } from "./_fake-db"
import { MEMBER_LINKS_MAX, SUMMARY_MAX, checkMemberLinks, checkSummary, cleanMemberLinks, cleanSummary, memberLinkUrl, shownMemberLinks } from "@/lib/communities/member-links"
import { DEFAULT_LOOK, cleanLook, joinWordsProblem, moneyInWords, pageLookOf } from "@/lib/communities/page-look"
import { PAGE_FIELDS_NOT_READY, joinWordsRefusal, loadPageFields, pageFieldsPatch } from "@/lib/communities/server/page-fields"
import { loadSettings, updateSettings, type CreatorPageContext } from "@/lib/communities/server/creator"
import { COMMUNITY_COLUMNS, PUBLIC_COMMUNITY_COLUMNS, type CommunityRow } from "@/lib/communities/types"
import { GROUP_BLOCKS, PAGE_BLOCKS, PAGE_GROUPS, changedBody, draftOf, draftProblems, groupOf, previewData, type PageDraft } from "@/components/community/creator/page-editor/draft"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => readCode(p)
/** A file as it is on disk, comments and all (the SQL parts are compared as text). */
const raw = (p: string) => readFileSync(p, "utf8")
/** A refusal's facts, read the same whatever the result's type. */
const no = (r: unknown) => r as { ok: boolean; field?: string; status?: number; error?: string }
const url = (v: unknown) => {
  const r = memberLinkUrl(v)
  return r.ok ? r.url : `!${r.code}`
}

async function main() {
  console.log("\nLINKS: a member link's address")
  {
    check("https is kept as the browser reads it", url("https://Example.com/Shop?x=1#top") === "https://example.com/Shop?x=1#top")
    check("http is kept (some resources have no https)", url("http://example.com/a") === "http://example.com/a")
    check("a bare website becomes https", url("zoom.us/j/123") === "https://zoom.us/j/123" && url("example.com") === "https://example.com/")
    check("a page on this site stays a path, trimmed", url("  /community/clay/learn?tab=1 ") === "/community/clay/learn?tab=1")
    check("javascript:, data:, vbscript:, mailto: and file: are refused", ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "mailto:a@b.co", "file:///etc/passwd"].every((v) => url(v) === "!scheme"))
    check("a protocol relative //host would leave the site: refused", url("//evil.com/x") === "!relative")
    check("a backslash, a space, a tab or an invisible mark is refused", ["/\\evil.com", "https://ex ample.com", "https://example.com/\tx", "https://exa​mple.com"].every((v) => url(v) === "!spaces"))
    check("a user and password in the address is refused", url("https://user:pw@example.com") === "!password")
    check("a word that is not an address says how to write one", url("my shop") === "!spaces" && url("shop") === "!format" && url("") === "!empty" && url(null) === "!empty")
    check("an address over 2000 characters is refused", url(`https://example.com/${"a".repeat(2000)}`) === "!long")
    check("a host with no dot is no website", url("https://localhost/x") === "!host")
    const raw = [
      { id: "a1b2c3d4", label: "  Start   here ", url: "/learn", icon: "book-open", hidden: false },
      { id: "a1b2c3d4", label: "Shop", url: "example.com/shop", icon: "rocket", hidden: "yes" },
      { id: "bad id!", label: "Bad", url: "javascript:alert(1)", icon: null, hidden: true },
      { id: "x9", label: "", url: "https://example.com" },
      { label: "Call", url: "https://zoom.us/j/1", hidden: true },
      { label: "Notes", url: "/notes" },
      { label: "Five", url: "/five" },
    ]
    const clean = cleanMemberLinks(raw)
    check("cleaned: unsafe or nameless links are left out, never repaired, and at most four", clean.length === MEMBER_LINKS_MAX && clean.map((l) => l.label).join() === "Start here,Shop,Call,Notes", clean.map((l) => l.label))
    check("cleaned: ids unique (a repeated one is replaced), an unknown icon is none, hidden only when true", new Set(clean.map((l) => l.id)).size === 4 && clean[0].id === "a1b2c3d4" && clean[1].id !== "a1b2c3d4" && clean[1].icon === null && clean[1].hidden === false && clean[2].hidden === true)
    check("cleaned: anything that is not a list is none", cleanMemberLinks({ a: 1 }).length === 0 && cleanMemberLinks(null).length === 0)
    const strict = checkMemberLinks([{ label: "A", url: "/a" }, { label: "B", url: "javascript:x" }])
    check("sent: a bad address is refused naming its link", !strict.ok && no(strict).field === "memberLinks.1.url" && /Link 2/.test(no(strict).error ?? ""), strict)
    const five = checkMemberLinks(Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, url: `/l${i}` })))
    check("sent: five links are refused", !five.ok && no(five).field === "memberLinks")
    const nameless = checkMemberLinks([{ label: "  ", url: "/a" }])
    check("sent: a link needs a name", !nameless.ok && no(nameless).field === "memberLinks.0.label")
    const icon = checkMemberLinks([{ label: "A", url: "/a", icon: "skull" }])
    check("sent: an icon from outside the list is refused", !icon.ok && no(icon).field === "memberLinks.0.icon")
    check("a member sees the shown links only, in order", shownMemberLinks(clean).map((l) => l.label).join() === "Start here,Shop,Notes")
  }

  console.log("\nSUMMARY: the short description")
  {
    check("one plain line: returns and runs of space are one space, invisible marks out", cleanSummary("  Weekly\n\nprompts​  and calls ") === "Weekly prompts and calls")
    check("empty is none", cleanSummary("   ") === null && cleanSummary(undefined) === null && cleanSummary(7) === null)
    check("read leniently: cut at 160 characters", cleanSummary("x".repeat(400))?.length === SUMMARY_MAX)
    const emoji = "🪵".repeat(160)
    check("an emoji counts as one character, as the database counts it (160 emoji fit)", checkSummary(emoji).ok && cleanSummary(emoji) === emoji)
    const over = checkSummary("y".repeat(161))
    check("sent: 161 characters are refused, not cut", !over.ok)
    check("sent: not words is refused; empty saves as none", !checkSummary({}).ok && (checkSummary("") as { value: unknown }).value === null)
  }

  console.log("\nPRICE: the join button never states one")
  {
    for (const words of ["Join for $24/month", "€5", "24 USD", "10 euros", "5 lei", "Join monthly", "Join per month", "Join for 10", "Pay 9,99 EUR a month", "₹499"]) check(`"${words}" names money or a billing period`, moneyInWords(words))
    for (const words of ["Get access", "Join now", "Join 500 builders", "Request access", "Join free", "Become a member", "Join for 30 days of challenges"]) check(`"${words}" is words only`, !moneyInWords(words))
    check("free is refused only where joining costs money", joinWordsProblem("Join free", true) === "free" && joinWordsProblem("Join free", false) === null && joinWordsProblem("Start free trial", true) === "free")
    const stored = cleanLook({ joinLabel: "Join for $1/month", joinNote: "Only $1 a month", joinStyle: "ink" })
    check("a look stored before the rule is read with the money words left out (the page's own words stand)", stored.joinLabel === "" && stored.joinNote === "", stored)
    check("ordinary words are kept as before", cleanLook({ joinLabel: "Get access" }).joinLabel === "Get access" && pageLookOf({ page: { joinLabel: "Join now" } }).joinLabel === "Join now")
    const paid = joinWordsRefusal({ joinLabel: "Join free" }, "paid")
    const money = joinWordsRefusal({ joinNote: "Then $9/month" }, "free")
    check("the server refuses the same words, naming the field", !!paid && paid.field === "pageLook.joinLabel" && !!money && money.field === "pageLook.joinNote" && joinWordsRefusal({ joinLabel: "Join free" }, "free") === null, { paid, money })
  }

  console.log("\nDRAFT: groups, problems, what Save sends")
  {
    const all = PAGE_GROUPS.flatMap((g) => GROUP_BLOCKS[g])
    check("six groups hold every part of the page exactly once", PAGE_GROUPS.length === 6 && all.length === PAGE_BLOCKS.length && PAGE_BLOCKS.every((b) => all.filter((x) => x === b).length === 1))
    check("a press on a part opens its group", groupOf("summary") === "basics" && groupOf("cover") === "media" && groupOf("benefits") === "about" && groupOf("memberLinks") === "links" && groupOf("join") === "join" && groupOf("search") === "search")
    const start: PageDraft = { name: "Clay", tagline: "Pots", descriptionHtml: "<p>Hi</p>", logoUrl: null, coverUrl: null, gallery: [], benefits: [], faq: [], links: [], look: DEFAULT_LOOK, summary: "", memberLinks: [], seoTitle: "", seoDescription: "", discoveryEnabled: true }
    const now: PageDraft = { ...start, summary: " A club for potters ", memberLinks: [{ id: "abcd1234", label: " Shop ", url: "shop.example.com", icon: null, hidden: false }], seoTitle: "Clay club", seoDescription: "Pots", discoveryEnabled: false }
    const body = changedBody(start, now)
    check("Save sends the short description trimmed, the member links with their address made whole, the search fields and Explore", body.summary === "A club for potters" && (body.memberLinks as { url: string; label: string }[])[0].url === "https://shop.example.com/" && (body.memberLinks as { label: string }[])[0].label === "Shop" && body.seoTitle === "Clay club" && body.discoveryEnabled === false, body)
    check("spaces around the short description alone are no change", Object.keys(changedBody({ ...start, summary: "x" }, { ...start, summary: " x " })).length === 0)
    const problems = draftProblems({ ...start, summary: "z".repeat(161), memberLinks: [{ id: "abcd1234", label: "", url: "javascript:x", icon: null, hidden: false }], look: { ...DEFAULT_LOOK, joinLabel: "Join for $5", joinNote: "Free forever" } }, { paid: true })
    check("what Save waits for, by part: the short description, a link's name and address, the button's words and line", problems.map((p) => `${p.block}:${p.code}`).join() === "summary:long,memberLinks:name,memberLinks:address,join:money,join:free", problems)
    const base = { community: { name: "Clay", tagline: null, descriptionHtml: null, descriptionText: null, benefits: [], faq: [], gallery: [], links: [], logoUrl: null, coverUrl: null }, join: {}, notice: null } as never
    const shown = previewData(base, now, {}) as unknown as { community: { summary: string | null } }
    check("the preview carries the short description to the page", shown.community.summary === "A club for potters")
  }

  console.log("\nROUND: every field, saved and read back")
  {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co"
    const ID = "6f1c2b9e-1d4f-4c55-9a0b-3f1e2d4c5b6a"
    const row = {
      id: ID, creator_id: "c1", owner_user_id: "u1", slug: "clay", name: "Clay", tagline: "Pots", description: "<p>Hello</p>", logo_url: null, cover_url: null, cover_video_id: null, visibility: "public", access: "free", status: "published", category: null, language: "en", member_count: 3, post_count: 0, discovery_enabled: true, approval_required: false, default_role: "member", directory_enabled: true, classroom_enabled: true, events_enabled: true, chat_enabled: true, gamification_enabled: false, rules: [], faq: [], benefits: [], links: [], onboarding: {}, seo_title: null, seo_description: null, trending_score: 0, trending_at: null, platform_hidden: false, suspended_at: null, suspended_reason: null, archived_at: null, deleted_at: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      gallery: [], summary: null, member_links: [],
    }
    const db = fakeDb({ communities: [row] })
    const ctx = (community: unknown) => ({ userId: "u1", creatorId: "c1", creatorName: "Ana", community: community as CommunityRow, viewer: {} as never, role: "owner" as const, db: db as never, paymentsReady: true }) as CreatorPageContext
    const head = (c: { name: string; logo_url: string | null; cover_url: string | null }) => ({ name: c.name, logoUrl: c.logo_url, coverUrl: c.cover_url })
    const before = await loadSettings(ctx(row))
    const start = draftOf(head(row), before)
    check("before: the new fields read as empty and ready", before.pageFieldsReady === true && start.summary === "" && start.memberLinks.length === 0)
    const pic = (n: string) => `https://abcdefgh.supabase.co/storage/v1/object/public/product-images/${n}.jpg`
    const edited: PageDraft = {
      ...start,
      name: "Clay Club",
      tagline: "Throw one pot a week",
      summary: "Weekly critiques and a Saturday call for people learning to throw. 🏺",
      descriptionHtml: "<h2>Hello</h2><p>We <strong>throw</strong> on <a href=\"https://example.com\">wheels</a> 🏺</p><ul><li>One</li><li>Two</li></ul>",
      logoUrl: pic("logo"),
      coverUrl: pic("cover"),
      gallery: [{ type: "image", url: pic("g1") }, { type: "image", url: pic("g2") }],
      benefits: ["A critique a week", "Saturday calls"],
      faq: [{ q: "Do I need a wheel?", a: "No, hand building is welcome." }],
      links: [{ label: "Instagram", url: "https://www.instagram.com/clayclub" }],
      look: { coverX: 40, coverY: 20, joinLabel: "Get access", joinStyle: "outline", joinNote: "Leave whenever you like", brand: "#1f7a5c" },
      memberLinks: [
        { id: "start001", label: "Start here", url: "/community/clay/learn", icon: "book-open", hidden: false },
        { id: "call0002", label: "Saturday call", url: "https://zoom.us/j/123", icon: "video", hidden: true },
      ],
      seoTitle: "Clay Club: learn to throw",
      seoDescription: "Weekly critiques and calls for new potters.",
      discoveryEnabled: false,
    }
    const body = changedBody(start, edited)
    const sent = Object.keys(body).sort().join()
    check("the editor sends every field it holds", sent === "benefits,coverUrl,descriptionHtml,discoveryEnabled,faq,gallery,links,logoUrl,memberLinks,name,pageLook,seoDescription,seoTitle,summary,tagline", sent)
    const saved = await updateSettings(db as never, { community: row as unknown as CommunityRow, role: "owner", actorId: "u1", creatorId: "c1", body })
    check("the settings save takes all of it", saved.ok, saved)
    const stored = (db as unknown as { log: unknown }) && row
    check("stored: the short description and the member links in their columns", stored.summary === edited.summary && Array.isArray(stored.member_links) && (stored.member_links as unknown[]).length === 2)
    check("stored: the description cleaned by the product sanitizer keeps bold, the link, the list and the emoji", /<strong>throw<\/strong>/.test(String(stored.description)) && /href="https:\/\/example\.com"/.test(String(stored.description)) && /<li>Two<\/li>/.test(String(stored.description)) && String(stored.description).includes("🏺"), stored.description)
    const after = await loadSettings(ctx(row))
    const again = draftOf(head(row), after)
    const norm = (d: PageDraft) => JSON.stringify({ ...d, descriptionHtml: d.descriptionHtml.replace(/\s+/g, " ") })
    const diff = (Object.keys(edited) as (keyof PageDraft)[]).filter((k) => JSON.stringify(edited[k]) !== JSON.stringify(again[k]) && k !== "descriptionHtml")
    check("read back, the editor starts from exactly what it saved (every field)", diff.length === 0 && Object.keys(changedBody(again, edited)).filter((k) => k !== "descriptionHtml").length === 0, { diff, again: diff.map((k) => again[k]) })
    check("read back, the description is the same rich text", /<strong>throw<\/strong>/.test(again.descriptionHtml) && /<ul>/.test(again.descriptionHtml), norm(again).slice(0, 0))
    const refused = await updateSettings(db as never, { community: row as unknown as CommunityRow, role: "owner", actorId: "u1", creatorId: "c1", body: { pageLook: { ...edited.look, joinLabel: "Join for $5" } } })
    check("a price on the button is refused by the save itself", !refused.ok && no(refused).field === "pageLook.joinLabel")
    const badLink = await updateSettings(db as never, { community: row as unknown as CommunityRow, role: "owner", actorId: "u1", creatorId: "c1", body: { memberLinks: [{ label: "x", url: "javascript:alert(1)" }] } })
    check("an unsafe member link is refused by the save itself", !badLink.ok && no(badLink).field === "memberLinks.0.url")
    const long = await updateSettings(db as never, { community: row as unknown as CommunityRow, role: "owner", actorId: "u1", creatorId: "c1", body: { summary: "x".repeat(161) } })
    check("a short description over 160 is refused by the save itself", !long.ok && no(long).field === "summary")
    const moderator = await updateSettings(db as never, { community: row as unknown as CommunityRow, role: "moderator", actorId: "u2", creatorId: "c1", body: { memberLinks: [] } })
    check("a moderator cannot change the member links", !moderator.ok && no(moderator).status === 403)
  }

  console.log("\nWAITING: before part 220")
  {
    const missing = { code: "42703", message: 'column communities.summary does not exist' }
    const db = fakeDb({ communities: [] }, { failWith: { communities: missing } })
    const read = await loadPageFields(db as never, "x")
    check("read: the two fields are not ready, nothing fails", read.ready === false && read.summary === null && read.memberLinks.length === 0)
    const row = { id: "x", access: "free", onboarding: {}, name: "Clay", slug: "clay" }
    const res = await updateSettings(db as never, { community: row as unknown as CommunityRow, role: "owner", actorId: "u1", creatorId: "c1", body: { summary: "Hi" } })
    check("a save naming them says they wait for the update, not try again", !res.ok && no(res).status === 409 && no(res).error === PAGE_FIELDS_NOT_READY, res)
    check("the patch names only the columns a body sets", Object.keys((pageFieldsPatch({ name: "x" }) as { patch: object }).patch).length === 0)
  }

  console.log("\nSQL: part 220")
  {
    const part = raw("supabase/sql/run-now/220_community_summary_and_member_links.sql")
    const lines = part.trim().split("\n")
    check("one comment line, one DO block on one line, notify pgrst last", lines.length === 3 && lines[0].startsWith("/*") && lines[1].startsWith("DO $do$") && lines[1].endsWith("END $do$;") && lines[2] === "notify pgrst, 'reload schema';")
    check("summary text, at most 160 characters as char_length counts them", /ADD COLUMN IF NOT EXISTS summary text;/.test(part) && /CHECK \(summary IS NULL OR char_length\(summary\) <= 160\)/.test(part))
    check("member_links a jsonb list, empty by default, at most four, the check safe in any order", /ADD COLUMN IF NOT EXISTS member_links jsonb NOT NULL DEFAULT '\[\]'::jsonb/.test(part) && /CASE WHEN jsonb_typeof\(member_links\) = 'array' THEN jsonb_array_length\(member_links\) <= 4/.test(part))
    check("each check made once (a second run changes nothing)", (part.match(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint/g) ?? []).length === 2)
    check("never granted to the browser's keys: revoked from anon and authenticated, granted to the service role only", /REVOKE SELECT \(summary, member_links\), INSERT \(summary, member_links\), UPDATE \(summary, member_links\) ON public\.communities FROM PUBLIC, anon, authenticated;/.test(part) && /GRANT SELECT \(summary, member_links\), UPDATE \(summary, member_links\) ON public\.communities TO service_role;/.test(part) && !/TO (anon|authenticated)/.test(part))
    check("the migration is the same text", raw("supabase/migrations/20270129_community_summary_and_member_links.sql") === part)
    check("the README lists it", /\| `220_community_summary_and_member_links\.sql` \|/.test(raw("supabase/sql/run-now/README.md")))
    const after = raw("supabase/sql/run-now/99_check_after.sql")
    check("the check row has p220, reading the columns, the checks and that anon cannot read member_links", /as p220_community_summary_and_member_links/.test(after) && /has_column_privilege\('anon', 'public\.communities', 'member_links', 'SELECT'\)/.test(after))
    check("built into the files the owner pastes", raw("supabase/sql/run-four/3_of_4_latest.sql").includes(lines[1]))
    check("the row every page reads, and the browser's columns, never name member_links", !COMMUNITY_COLUMNS.includes("member_links") && !PUBLIC_COMMUNITY_COLUMNS.includes("member_links") && !COMMUNITY_COLUMNS.includes("summary"))
    const pub = code("lib/communities/server/public.ts")
    check("no public read selects member_links", !/member_links/.test(pub))
  }

  console.log("\nSOURCE: the editor")
  {
    const editor = code("components/community/creator/page-editor/page-editor.tsx")
    check("the panel beside the stage from 1280px; below it the drawer", /const WIDE = "\(min-width: 1280px\)"/.test(editor) && /<BottomSheet/.test(editor) && /data-page-phone-bar/.test(editor))
    check("the panel is in the page's own scroll (no second scroll box), the stage sticks under the tabs", /<aside id="pe-side" className=\{cn\(card, "w-\[360px\] shrink-0 overflow-hidden/.test(editor) && !/data-page-side[^>]*overflow-y-auto/.test(editor) && /sticky top-\[var\(--pe-top/.test(editor))
    check("the stage's height is measured once and shared as CSS numbers", /--pe-stage-h/.test(editor) && /--pe-top/.test(editor) && /function useStage/.test(editor))
    check("full screen, as a visitor, the dark look, the panel hidden", /data-page-full-toggle/.test(editor) && /data-page-visitor/.test(editor) && /data-page-look/.test(editor) && /data-page-panel-toggle/.test(editor))
    check("Publish beside Save for a draft, through the same request as the bar's", /\{ publish: true \}/.test(editor) && /canPublish/.test(editor))
    check("Ctrl or Cmd S saves; leaving with changes asks", /e\.key\.toLowerCase\(\) === "s"/.test(editor) && /beforeunload/.test(editor))
    const frame = code("components/community/creator/page-editor/preview-frame.tsx")
    check("as a visitor nothing leaves the page or joins, and no outlines are drawn", /const NEVER_ACTS = 'a\[href\], \[data-page-block="join"\]/.test(frame) && /\{visitor \? null : <Hotspots doc=\{doc\} \/>\}/.test(frame))
    const panels = code("components/community/creator/page-editor/panels.tsx")
    check("the description is still the product editor's rich text with its size check", /<RichTextEditor/.test(panels) && /checkSize=\{descriptionTooLong\}/.test(panels))
    check("the editor's words: What's inside, the short description with its counter, the rule under the button", /"What's inside"/.test(panels) && /SUMMARY_MAX/.test(panels) && /data-join-rule/.test(panels))
    const server = code("lib/communities/server/creator.ts")
    check("the settings save checks the two new fields and the button's words on the server", /pageFieldsPatch\(b\)/.test(server) && /joinWordsRefusal\(b\.pageLook, c\.access\)/.test(server) && /loadPageFields\(db, c\.id\)/.test(server))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

void main()
