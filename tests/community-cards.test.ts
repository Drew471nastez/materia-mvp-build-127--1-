/**
 * ===========================================================================
 *  ONE COMMUNITY CARD, EVERYWHERE
 * ===========================================================================
 * Round 5, asks 11 and 12. The owner found the old card ("3 members · Free",
 * no stats row) still on Storelib after Explore had the new one: it lived on
 * in components/community/public/community-card.tsx behind a creator's
 * Communities tab and a profile's, and the old /explore/communities page drew
 * it too until it became a redirect. Held here:
 *
 *   ONE CARD       the old card file is gone and nothing imports it; every
 *                  place that lists communities draws the card from
 *                  components/explore/community-card.tsx; no other file
 *                  hand draws a community card.
 *   SAME DATA      every list's cards carry views (cardsFor reads them when
 *                  the rows came without), the library's rows carry the
 *                  card, and a database before part 87 still lists.
 *   ROUND 6        no "Launched" anywhere; under the name and creator a
 *                  sneak peek (the tagline, else the description's start as
 *                  plain text, read only for the cards without a tagline),
 *                  two lines at most; one foot row: the price first, a slim
 *                  hairline, then members, views, and the stars only with
 *                  reviews; the mark ten per cent bigger in every layout.
 *   ROUND 8        the owner's reference proportions: a 56px mark (48 on
 *                  a phone), the name 20/26 from 640px, the price a step
 *                  larger, each fact's icon in a round well; the builder's
 *                  phone preview keeps a phone's sizes.
 *   THE TITLE      Roboto 500, 18px on a 24px line, no tracking, from one
 *                  next/font call with one weight, Latin and Latin
 *                  Extended, swap, a CSS variable used by these titles only;
 *                  self hosted, so the CSP's font-src 'self' covers it.
 *
 * Run with:  npm run test:push
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { fakeDb } from "./_fake-db"
import { cardsFor, type CardRow } from "@/lib/communities/server/public"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  }
}

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
/* Code without its comments, so a check reads what runs. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
function walk(dir: string): string[] {
  const abs = join(root, dir)
  if (!existsSync(abs)) return []
  return readdirSync(abs).flatMap((name) => {
    const rel = `${dir}/${name}`
    if (name === "node_modules" || name.startsWith(".")) return []
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : /\.(tsx?|mjs)$/.test(name) ? [rel] : []
  })
}

const SHARED = "components/explore/community-card.tsx"

/* Every place a community is listed as a card, and what it must render. */
const CALL_SITES: [file: string, draws: RegExp][] = [
  /* Round 10: the first two rows first, one cover preloaded (lib/explore/use-progressive-count). */
  ["components/explore/explore-communities-results.tsx", /<ExploreCommunityGrid cards=\{count < items\.length \? items\.slice\(0, count\) : items\} priorityCount=\{1\} \/>/],
  ["components/explore/explore-page-client.tsx", /<ExploreCommunityGrid cards=\{communityResults\} \/>/],
  ["components/community/public/storefront-communities.tsx", /<ExploreCommunityGrid cards=\{cards\} surface="storefront" phone=\{phone\}/],
  /* Round 12: a person's communities are the compact rows (a person without a store has no Explore grid on their page). */
  ["components/profile/profile-community-list.tsx", /<ExploreCommunityCard card=\{c\} layout="row" priority=\{i < 3\} \/>/],
  ["components/community/public/library-list.tsx", /<ExploreCommunityCard card=\{r\.card\} layout="row" standing=\{standingOf\(r\)\}/],
]

async function main() {
  console.log("\nOne card")
  {
    check("the old card is gone", !existsSync(join(root, "components/community/public/community-card.tsx")))
    const everything = [...walk("app"), ...walk("components"), ...walk("lib"), ...walk("scripts")]
    const stale = everything.filter((f) => /community\/public\/community-card|CommunityCardTile|\bCommunityGrid\b|data-community-facts/.test(code(f)))
    check("nothing imports it, or draws its 'N members · Free' line", stale.length === 0, stale)
    for (const [file, draws] of CALL_SITES) {
      const src = code(file)
      const imports = /from "@\/components\/explore\/community-card"|from "\.\/community-card"/.test(src)
      check(`${file} draws the shared card`, imports && draws.test(src))
    }
    /* A file that is handed CommunityCard data and reads its fields to draw them is drawing a card of its own. */
    const tsx = [...walk("app"), ...walk("components")].filter((f) => f.endsWith(".tsx") && f !== SHARED)
    const ownCards = tsx.filter((f) => {
      const src = code(f)
      return /\bCommunityCard\b/.test(src) && /\b(card|c)\.(memberCount|priceLine|coverUrl|viewCount|launchedAt)\b/.test(src)
    })
    check("no other component draws a community card by hand", ownCards.length === 0, ownCards)
    /* The creator page's Communities panel is built by components/profile/creator-communities-tab.tsx (round 5: only the communities they made, or No communities yet). */
    check("the storefront and the builder's canvas both go through the tab panel", /<StorefrontCommunities cards=\{cards\} \/>/.test(code("components/profile/creator-communities-tab.tsx")) && /creatorCommunitiesPanel\(communityCards\)/.test(code("app/(marketing)/u/[username]/page.tsx")) && /<StorefrontCommunities cards=\{communities\} phone=\{isMobile\} \/>/.test(code("components/store-builder/preview-canvas.tsx")))
    check("/explore/communities, which drew the old card, only redirects now", /NextResponse\.redirect\(new URL\(target, request\.url\), 308\)/.test(code("app/(marketing)/explore/communities/route.ts")) && /legacyCommunitiesTarget\(/.test(code("app/(marketing)/explore/communities/route.ts")) && !/<\w+Grid|<\w+Card/.test(code("app/(marketing)/explore/communities/route.ts")))
    const card = code(SHARED)
    check("one card, two shapes: the grid and the compact row, with the same title, sneak peek, foot row and creator line", /layout === "row"/.test(card) && (card.match(/<Facts card=\{card\} storefront=\{storefront\} \/>/g) ?? []).length === 2 && (card.match(/<Blurb card=\{card\}/g) ?? []).length === 2 && /<Creator card=\{card\} eager=\{priority\} wide=\{wide\} \/>/.test(card) && /<Creator card=\{card\} standing=\{standing\} eager=\{priority\} wide=\{wide\} \/>/.test(card) && (card.match(/, titleClass\)/g) ?? []).length === 2 && /const titleClass = cn\(COMMUNITY_TITLE, wide && COMMUNITY_TITLE_WIDE\)/.test(card))
    check("in a row, where they stand follows the creator, so the foot row still starts with the price", /data-community-standing=""/.test(card.slice(card.indexOf("function Creator("))) && !/data-community-standing/.test(card.slice(card.indexOf("function Facts("), card.indexOf("function Creator("))))
    check("no Launched line in any layout", !/launched|Launched/i.test(card))
    check("on a storefront the ground is the creator's tokens", /surface === "storefront"/.test(card) && /storefront \? "bg-muted" : "bg-\[#f1f2f4\]"/.test(card) && /bg-card/.test(card) && /text-muted-foreground/.test(card))
    check("the card stays a server-safe module (no hooks, no server code)", !/use(State|Effect|Ref|Memo)\(/.test(card) && !/server-only|lib\/communities\/server|next\/headers/.test(card))
  }

  console.log("\nSame data")
  {
    const row = (id: string, extra: Partial<CardRow> = {}): CardRow => ({ id, slug: id, name: id, tagline: "A tagline", logo_url: null, cover_url: null, category: null, access: "free", visibility: "public", status: "published", member_count: 3, creator_id: null, created_at: "2026-09-01T00:00:00Z", trending_score: 0, ...extra }) as CardRow
    const db = fakeDb({ communities: [{ id: "a", view_count: 42 }, { id: "b", view_count: "7" }], community_tiers: [] })
    const cards = await cardsFor(db, [row("a"), row("b")])
    check("a list read without views gets them, in one read for the whole list", cards[0]?.viewCount === 42 && cards[1]?.viewCount === 7 && db.log.filter((l) => l.table === "communities").length === 1, cards.map((c) => c.viewCount))
    const explore = fakeDb({ communities: [{ id: "a", view_count: 99 }], community_tiers: [] })
    const read = await cardsFor(explore, [row("a", { view_count: 5 })])
    check("a list that read them (Explore) is not read again", read[0]?.viewCount === 5 && explore.log.filter((l) => l.table === "communities").length === 0)
    const before87 = fakeDb({ community_tiers: [] }, { failWith: { communities: { code: "42703", message: "column communities.view_count does not exist" } } })
    const old = await cardsFor(before87, [row("a")])
    check("before part 87: still a card, without the eye", old.length === 1 && old[0].viewCount === null && old[0].memberCount === 3)
    const untagged = fakeDb({ communities: [{ id: "a", view_count: 1, description: "<p>Weekly <b>critiques</b> of your film rolls.</p>" }, { id: "b", view_count: 2, description: "<p>never read</p>" }, { id: "c", view_count: 3, description: "" }], community_tiers: [] })
    const peeks = await cardsFor(untagged, [row("a", { tagline: null, view_count: 1 }), row("b", { tagline: "Its own line", view_count: 2 }), row("c", { tagline: "  ", view_count: 3 })])
    const descReads = untagged.log.filter((l) => l.table === "communities")
    check("no tagline: the description's start, as plain text", peeks[0]?.excerpt === "Weekly critiques of your film rolls." && peeks[0]?.tagline === null, peeks[0]?.excerpt)
    check("a tagline: no excerpt, and its description is never read", peeks[1]?.excerpt === null && JSON.stringify(descReads[0]?.filters.find(([k]) => k === "in")?.[2]) === JSON.stringify(["a", "c"]))
    check("a blank tagline and an empty description: nothing to show, nothing made up", peeks[2]?.excerpt === null)
    check("one read for every untagged card in the list", descReads.length === 1)
    const allTagged = fakeDb({ communities: [], community_tiers: [] })
    await cardsFor(allTagged, [row("a", { view_count: 1 })])
    check("a list where every card has a tagline reads no descriptions", allTagged.log.filter((l) => l.table === "communities").length === 0)
    const pub = code("lib/communities/server/public.ts")
    check("the library's rows are built from the same cards", /const cards = new Map\(\(await cardsFor\(db, communities\)\)/.test(pub) && /url: communityPath\(c\.slug\),\s*card,/.test(pub) && /card: CommunityCard/.test(code("components/community/public/types.ts")))
  }

  console.log("\nThe title")
  {
    const layout = code("app/layout.tsx")
    const calls = layout.match(/\bRoboto\(\{[\s\S]*?\}\)/g) ?? []
    check("Roboto comes through next/font/google, once", /import \{ Inter, Roboto \} from "next\/font\/google"/.test(layout) && calls.length === 1)
    const call = calls[0] ?? ""
    check("only the 500 weight", /weight: \["500"\]/.test(call))
    check("Latin and Latin Extended", /subsets: \["latin", "latin-ext"\]/.test(call))
    check("display swap, a CSS variable, no preload on pages without a card", /display: "swap"/.test(call) && /variable: "--font-community-title"/.test(call) && /preload: false/.test(call))
    check("the variable is set on the body, beside Inter's", /<body className=\{`\$\{inter\.variable\} \$\{communityTitle\.variable\}/.test(layout))
    const others = [...walk("app"), ...walk("components"), ...walk("lib")].filter((f) => f !== "app/layout.tsx" && /next\/font|Roboto\(/.test(code(f)))
    check("no other file loads a font through next/font", others.length === 0, others)
    const users = [...walk("app"), ...walk("components"), ...walk("lib")].filter((f) => f !== "app/layout.tsx" && /--font-community-title/.test(code(f)))
    check("the variable is used by the community card title and nothing else", users.join() === SHARED, users)
    const card = code(SHARED)
    const title = /COMMUNITY_TITLE = "([^"]*)"/.exec(card)?.[1] ?? ""
    check("Roboto, sans-serif; 18px; 500; 24px line; letter spacing 0", /\[font-family:var\(--font-community-title,Roboto\),sans-serif\]/.test(title) && /\btext-\[18px\]/.test(title) && /\bfont-medium\b/.test(title) && /\bleading-6\b/.test(title) && /\btracking-\[0px\]/.test(title))
    check("and 20px on a 26px line from 640px (round 8), unless the frame is a phone", /COMMUNITY_TITLE_WIDE = "sm:text-\[20px\] sm:leading-\[26px\]"/.test(card) && /const wide = !phone/.test(card) && /<ExploreCommunityCard card=\{c\} priority=\{i < priorityCount\} surface=\{surface\} phone=\{phone\} \/>/.test(card))
    check("every title on the card is that one", (card.match(/data-community-title=""/g) ?? []).length === 2 && !/<h3 className="[^"]*text-\[\d+px\]/.test(card))
    const csp = code("lib/security/csp.ts")
    check("self hosted, so the CSP needs no new host: font-src allows 'self'", /\["font-src", \["'self'"/.test(csp))
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
