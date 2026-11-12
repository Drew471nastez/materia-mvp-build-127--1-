/**
 * Round AS: OnePage sheets, tips and subscribe.
 *
 *   EMBEDS     a button that opens an embed warms its service's hosts (on
 *              screen, on a pointer) with plain preconnects, and starts the
 *              sheet hidden on a press or a resting mouse (never a video,
 *              which plays on its own); a sheet that held an embed is kept
 *              hidden after Close, its players paused, and shown again; a
 *              frame whose service takes no pause is not kept; frames in the
 *              sheet load eagerly over the player's own shape
 *              (scripts/check-onepage-embed-speed.mjs times a press to the
 *              embed on screen)
 *   TIPS       the amount sheet's stepper, keypad and floor, amounts in the
 *              store currency's own unit, where each tip came from carried
 *              through the Checkout Session into onepage_tips (and kept
 *              without it before part 442), tips by source for Storelib
 *              analytics and a tips block's stats
 *              (scripts/check-onepage-tips-as.mjs draws them in nine themes)
 *   SUBSCRIBE  every OnePage signup button waits for a valid address
 *              (scripts/check-onepage-signup-ready.mjs)
 *   SQL        part 442 follows the run-now conventions
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { embedOrigins, keepableFrame, warmEmbed } from "@/lib/onepage/embed-warm"
import { TIP_MAX_CENTS, checkTipAmount, keypadInput, keypadText, tipAmounts, tipDefaultAmounts, tipFloor, tipLabel, tipSource, tipStepped, typedTipCents } from "@/lib/onepage/tips"
import { TIP_SESSION_KIND, recordTipFromSession, sessionTipSource, tipCheckoutParams } from "@/lib/onepage/tips-server"
import { blockTipSummary, referrerName, tipSourceRows } from "@/lib/analytics/tip-sources"
import { signupEmailReady, signupWait } from "@/lib/onepage/email-signup"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const nb = (s: string) => s.replace(/ /g, " ")

const PAGE = "11111111-2222-4333-8444-555555555555"
const CREATOR = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

async function main() {
  section("EMBEDS")
  check("Spotify's player warms its own hosts", embedOrigins("https://open.spotify.com/track/abc").join() === "https://open.spotify.com,https://open.spotifycdn.com,https://i.scdn.co,https://encore.scdn.co")
  check("a YouTube link warms the no-cookie player's hosts", embedOrigins("youtu.be/abc")[0] === "https://www.youtube-nocookie.com")
  check("a map warms Google's", embedOrigins("https://www.google.com/maps/search/?api=1&query=x").includes("https://maps.google.com"))
  check("an unknown service warms its own origin, the page's own nothing, a non-https address nothing", embedOrigins("https://cal.example.org/x").join() === "https://cal.example.org" && embedOrigins("https://storelib.com/a", "https://storelib.com").length === 0 && embedOrigins("http://x.com").length === 0 && embedOrigins("not a url").length === 0)
  check("players that take a pause are kept, silent frames are kept, the rest are not", keepableFrame("https://open.spotify.com/embed/track/x") === "pausable" && keepableFrame("https://www.youtube-nocookie.com/embed/x") === "pausable" && keepableFrame("https://maps.google.com/maps?q=x") === "silent" && keepableFrame("https://platform.twitter.com/embed/Tweet.html") === "silent" && keepableFrame("https://embed.music.apple.com/us/album/x") === "no" && keepableFrame(null) === "no")
  check("warmEmbed hands a button its handlers", ["ref", "onPointerEnter", "onPointerLeave", "onPointerDown", "onFocus"].every((k) => typeof (warmEmbed("https://open.spotify.com/x") as unknown as Record<string, unknown>)[k] === "function"))
  const warm = read("lib/onepage/embed-warm.ts")
  check("the warm-up is a plain preconnect, never crossorigin (a frame's document is not CORS)", /link\.rel = rel/.test(warm) && !/crossOrigin/.test(warm.replace(/\/\*[\s\S]*?\*\//g, "")))
  check("focus only connects: the sheet's own return of focus does not start it again", /onFocus: \(\) => warmConnections\(url\)/.test(warm))
  const sheet = read("components/onepage/block-sheet.tsx")
  check("the provider keeps sheets and starts them hidden", /prewarm: \(request\) =>/.test(sheet) && /const KEEP_SHEETS = 3/.test(sheet) && /keep \? \[\{ \.\.\.x, state: "kept" as const \}\] : \[\]/.test(sheet))
  check("a kept sheet is hidden, inert and out of the page's way", /inert=\{kept \? true : undefined\}/.test(sheet) && /visibility: "hidden", pointerEvents: "none"/.test(sheet) && /useStillPage\(!kept, rootRef\)/.test(sheet))
  check("a kept sheet carries none of the sheet's marks", /const tag = \(name: string\): Record<string, string> => \(kept \? \{\} :/.test(sheet) && !/data-block-sheet-panel=""/.test(sheet))
  check("players are paused as the sheet goes; keeping asks keepableSheet", /pauseFrames\(bodyRef\.current\)/.test(sheet) && /keepableSheet\(bodyRef\.current\)/.test(sheet))
  check("kept sheets are memoised", /const BlockSheetView = memo\(function BlockSheetView/.test(sheet))
  const extra = read("components/onepage/extra-blocks.tsx")
  check("a video is never started early, nor a form", /prewarm=\{block\.type !== "video" && block\.type !== "contact_form"\}/.test(extra))
  check("a video in the sheet takes pause messages and shows its picture until it loads", /enablejsapi=1/.test(read("lib/onepage/extra-blocks.ts")) && /videoEmbedUrl\(source, \{ muted \}\)/.test(extra) && /<img src=\{poster\} alt="" aria-hidden/.test(extra))
  const shell = read("components/onepage/embed-shell.tsx")
  check("frames in the sheet load eagerly", /useInBlockSheet\(\) \? "eager" : "lazy"/.test(shell))
  for (const f of ["components/onepage/music-sheet.tsx", "components/onepage/creator-blocks.tsx", "components/onepage/embed-frame.tsx", "components/onepage/app-block.tsx"]) check(`${f}: the frame's loading follows the sheet`, /loading=\{loading\}/.test(read(f)) && /useFrameLoading\(\)/.test(read(f)))
  check("Spotify and Apple Music link buttons warm and start their player", (read("components/onepage/public-onepage.tsx").match(/\{\.\.\.musicWarm\(data, "(spotify|apple_music)"\)\}/g) ?? []).length === 4)

  section("TIPS: amounts")
  check("labels in the currency's own way", tipLabel(500, "usd") === "$5" && tipLabel(550, "usd") === "$5.50" && nb(tipLabel(1000, "ron")) === "10 lei" && tipLabel(1250, "eur", "en-US") === "€12.50")
  check("defaults by currency", tipDefaultAmounts("usd").join() === "300,500,1000" && tipDefaultAmounts("RON").join() === "1000,2000,5000" && tipAmounts({}, "ron").join() === "1000,2000,5000" && tipAmounts({}).join() === "300,500,1000")
  check("the floor is a unit, or Stripe's smallest charge if more", tipFloor("usd") === 100 && tipFloor("ron") === 200 && tipFloor("gbp") === 100)
  check("+ and - step on a grid that suits the amount", tipStepped(500, 1, "usd") === 600 && tipStepped(550, 1, "usd") === 600 && tipStepped(2300, 1, "usd") === 2500 && tipStepped(2500, -1, "usd") === 2000 && tipStepped(2000, -1, "usd") === 1900 && tipStepped(15000, 1, "usd") === 16000)
  check("never under the floor nor over the cap", tipStepped(100, -1, "usd") === 100 && tipStepped(TIP_MAX_CENTS, 1, "usd") === TIP_MAX_CENTS && tipStepped(0, 1, "usd") === 200)
  const keys = (start: string, list: string[]) => list.reduce((t, k) => keypadInput(t, k, "usd"), start)
  check("the keypad types an amount as a person would", keys("", ["1", "2", ".", "5"]) === "12.5" && keys("0", ["5"]) === "5" && keys("12.50", ["9"]) === "12.50" && keys("12.5", [".", "."]) === "12.5" && keys("123456", ["7"]) === "123456" && keys("5", ["back", "back"]) === "")
  check("the keypad reads back", typedTipCents("12.5", "usd") === 1250 && typedTipCents("12.", "usd") === 1200 && keypadText(1250, "usd") === "12.50" && keypadText(500, "usd") === "5" && keypadText(1205, "usd") === "12.05")
  check("the sheet's amount is checked by the server's own rule", checkTipAmount({ tip_amounts: [500], tip_custom: true }, 1250, tipFloor("usd"), "usd").ok && !checkTipAmount({ tip_amounts: [500], tip_custom: false }, 1250, 100, "usd").ok && (checkTipAmount({ tip_custom: true }, 50, tipFloor("usd"), "usd") as { error: string }).error === "too_small")

  section("TIPS: the card and the sheet")
  const tip = read("components/onepage/tip-block.tsx")
  check("the card: an icon, the amounts in one row with Other, the page's button", /<HandCoins/.test(tip) && /gridTemplateColumns: `repeat\(\$\{columns\}, minmax\(0, 1fr\)\)`/.test(tip) && /<CardButton look=\{look\} onClick=\{send\}/.test(tip))
  check("Other and a note asked for open the sheet; Tip otherwise pays at once, marked card", /data-tip-amount="other"/.test(tip) && /if \(data\.tip_message && sheet\.available\) return openSheet\(shownPick\)/.test(tip) && /startTip\(look, block\.id, shownPick, null, "card"\)/.test(tip))
  check("the sheet: footless, a big amount between - and +, a keypad, Continue in the page's accent", /footless: true/.test(tip) && /data-tip-minus/.test(tip) && /data-tip-plus/.test(tip) && /data-tip-keypad=""/.test(tip) && /var\(--opk-accent, var\(--sheet-ink\)\)/.test(tip) && /startTip\(look, blockId, cents, data\.tip_message \? note\.trim\(\) : null, "sheet"\)/.test(tip))
  check("the page sends where the tip came from", /source: \{ placement, host: window\.location\.hostname, referrer: document\.referrer \|\| null \}/.test(tip))
  check("the app block draws the tips card from its own file", /import \{ DataTipsView \} from "@\/components\/onepage\/tip-block"/.test(read("components/onepage/app-block.tsx")))
  check("the block sheet takes footless: no foot bar, Close at the top", /typing \|\| footless \? "hidden" : "flex"/.test(sheet) && /\{footless \? \(/.test(sheet))
  check("tips settings offer three sets of amounts in one tap", /data-tip-sets=""/.test(read("components/onepage/data-block-editor.tsx")))

  section("TIPS: the source")
  const src = tipSource({ placement: "sheet", host: "storelib.me", referrer: "https://l.instagram.com/?u=x" }, "  Tip jar  ")
  check("kept in its shapes only", src.surface === "onepage" && src.placement === "sheet" && src.host === "storelib.me" && src.referrer_host === "instagram.com" && src.block_title === "Tip jar")
  check("anything else is a card tip from nowhere", JSON.stringify(tipSource({ placement: "<script>", host: "a b", referrer: 42 }, null)) === JSON.stringify({ surface: "onepage", placement: "card", block_title: null, host: null, referrer_host: null }))
  check("the page's own host is not where the visitor came from", tipSource({ host: "storelib.me", referrer: "https://storelib.me/x" }, "").referrer_host === null)
  const fee = { platformFeeCents: 45, feePercent: 5, feeFixedCents: 0, planId: "free" } as never
  const params = tipCheckoutParams({ page: { id: PAGE, title: "Anna" }, blockId: "tip1", creatorId: CREATOR, creatorName: "Anna", destination: "acct_x", amountCents: 500, currency: "usd", fee, name: null, message: null, successUrl: "https://s/x", cancelUrl: "https://s/y", source: src })
  check("the source travels in the session's metadata", JSON.parse(String(params.metadata?.tip_source)).referrer_host === "instagram.com" && String(params.metadata?.tip_source).length <= 480)
  check("and is read back in its shapes", sessionTipSource(params.metadata as Record<string, string>).placement === "sheet" && sessionTipSource({}).placement === "card" && sessionTipSource({ tip_source: "{nope" }).surface === "onepage")

  const writes: Array<Record<string, unknown>> = []
  const fakeDb = (missingColumns: boolean) => ({
    from: () => ({
      upsert: (row: Record<string, unknown>) => ({
        select: async () => {
          if (missingColumns && "source" in row) return { data: null, error: { code: "42703" } }
          writes.push(row)
          return { data: [{ id: "t1" }], error: null }
        },
      }),
    }),
  })
  const session = { id: "cs_test_aaaaaaaaaaaa", payment_status: "paid", amount_total: 500, currency: "usd", payment_intent: "pi_1", customer_details: { name: "Sam", email: "s@x.co" }, metadata: { kind: TIP_SESSION_KIND, onepage_id: PAGE, block_id: "tip1", creator_id: CREATOR, amount_cents: "500", platform_fee_cents: "45", tip_source: params.metadata?.tip_source } } as never
  const stored = await recordTipFromSession(fakeDb(false), session)
  check("a paid tip keeps its source", stored.ok && writes[0]?.source === "onepage" && (writes[0]?.source_detail as { placement?: string })?.placement === "sheet")
  writes.length = 0
  const older = await recordTipFromSession(fakeDb(true), session)
  check("before part 442 the tip is still kept, without its source", older.ok && (older as { stored: boolean }).stored && writes.length === 1 && !("source" in writes[0]))

  section("TIPS: by source")
  check("a referrer as people say it", referrerName("l.instagram.com").label === "Instagram" && referrerName(null).key === "direct" && referrerName("t.co").label === "X" && referrerName("blog.example.org").label === "blog.example.org")
  const tips = [
    { block_id: "b1", amount_cents: 500, currency: "usd", source_detail: { referrer_host: "instagram.com", block_title: "Old name" } },
    { block_id: "b1", amount_cents: 1000, currency: "usd", source_detail: { referrer_host: null } },
    { block_id: "b1", amount_cents: 300, currency: "usd", source_detail: { referrer_host: "instagram.com" } },
    { block_id: "b2", amount_cents: 2000, currency: "eur", source_detail: null },
  ]
  const one = blockTipSummary(tips.filter((t) => t.block_id === "b1"), "usd")
  check("a block's tips by where the tippers came from", one.count === 3 && one.cents === 1800 && one.from[0].key === "direct" && one.from[0].cents === 1000 && one.from[1].count === 2)
  const rows = tipSourceRows({ checkout: [{ channel: "website:w1", label: "Shop", cents: 200 }, { channel: "website:w1", label: "Shop", cents: 300 }, { channel: "onepage", label: "OnePage", cents: 0 }], onepage: tips, currency: "USD", titles: { b1: "Tip jar" } })
  check("order tips by channel and OnePage tips by block, largest first, another currency left out", rows.length === 2 && rows[0].key === "onepage:b1" && rows[0].label === "Tip jar" && rows[0].cents === 1800 && rows[1].key === "checkout:website:w1" && rows[1].count === 2 && rows[1].cents === 500)
  check("a block named by its title then when it has none now", tipSourceRows({ checkout: [], onepage: tips.slice(0, 1), currency: "usd" })[0].label === "Old name")
  const server = read("lib/analytics/commerce-server.ts")
  check("the sales report answers with its tips by source", /tipSources,/.test(server) && /tipSourcesFor\(admin,/.test(server))
  check("the Sales breakdown lists them", /data-tip-sources=""/.test(read("app/(storelib)/app/analytics/commerce-reports.tsx")))
  check("a tips block's stats read its tips", /input\.provider === "tips" \? blockTipsIn\(/.test(read("lib/onepage/link-stats-server.ts")) && /<TipsBySource tips=\{stats\.tips\} \/>/.test(read("components/onepage/link-stats-chart.tsx")))

  section("SUBSCRIBE")
  check("a valid address and nothing less", signupEmailReady("anna@site.co") && signupEmailReady("  a.b+c@mail.example.org ") && !signupEmailReady("") && !signupEmailReady("anna@") && !signupEmailReady("anna@site") && !signupEmailReady("anna@site.c") && !signupEmailReady("an na@site.co") && !signupEmailReady(`${"a".repeat(250)}@x.co`) && !signupEmailReady(null))
  check("waiting is a filter, eased with the button's own timing", signupWait(false).filter === "opacity(0.45)" && signupWait(true).filter === undefined && /filter/.test(signupWait(true).transitionProperty))
  const live = read("components/onepage/public-onepage.tsx")
  check("the email block's three shapes wait for an address", (live.match(/!emailReady/g) ?? []).length >= 3 && /signupWait\(emailReady \|\| isSubmitting(, \{[^}]*\})?\)/.test(live))
  check("the Subscribe sheet and a free gift's form too", /disabled=\{busy \|\| done \|\| !signupEmailReady\(email\)\}/.test(read("components/onepage/subscribe-sheet.tsx")) && /disabled=\{sending \|\| !signupEmailReady\(email\)\}/.test(read("components/onepage/storelib-blocks.tsx")))

  section("SQL part 442")
  const sql = read("supabase/sql/run-now/442_onepage_tip_source.sql")
  check("guarded, nullable, idempotent, schema reloaded", /IF to_regclass\('public\.onepage_tips'\) IS NOT NULL/.test(sql) && /ADD COLUMN IF NOT EXISTS source text/.test(sql) && /ADD COLUMN IF NOT EXISTS source_detail jsonb/.test(sql) && /CREATE INDEX IF NOT EXISTS onepage_tips_creator_source_idx/.test(sql) && /notify pgrst, 'reload schema';/.test(sql))
  check("the migration is the same text", read("supabase/migrations/20271442_onepage_tip_source.sql") === sql)
  check("README row, check-after column, parts list", /\| `442_onepage_tip_source\.sql` \|/.test(read("supabase/sql/run-now/README.md")) && /* Changed on purpose (merge with rel2-db): part 443 now follows it in the check. */ /as p442_onepage_tip_source[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")) && /part: "442", file: "442_onepage_tip_source\.sql"/.test(read("lib/admin/sql-parts.generated.ts")))
  check("in the bundles", read("supabase/sql/run-four/3_of_4_latest.sql").includes("onepage_tips_creator_source_idx") && read("supabase/sql/all-in-two/1_of_2_everything.sql").includes("onepage_tips_creator_source_idx"))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
