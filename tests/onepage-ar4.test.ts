/**
 * Round AR, track 4: the OnePage data and money blocks, end to end.
 *
 *   NEWSLETTER  a phone number (checked, kept with the lead and the subscriber,
 *               sent to the creator's tools), a first name, every extra field
 *               drawn in the shape of its layout's email box, and one of the
 *               creator's own products given to whoever joins, read from the
 *               published block and checked on the server
 *   TIPS        Storelib checkout to the creator's own connected account, the
 *               amount checked against the block on the server, one tip per
 *               Checkout Session, the webhook and the return both landing once
 *   POLL        one vote per visitor (a unique key, the cookie hashed), only
 *               for a poll on the published page, the totals adding to 100,
 *               the results for the owner only
 *   PAID        the locked part never in the live page's blocks, opened only
 *               for an owner of the block's product
 *   SCHEDULE    a block outside its show from / until window is off the live
 *               page and refused by every route
 *   ANALYTICS   a tap counted once (the page's own count wins over the
 *               listener), never from the editor's preview, never a robot
 *   FEEDS       RSS and Atom read from recorded answers, Bandsintown's answer
 *               mapped and merged, nothing asked of a real service
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { checkSignupPhone, signupExtraFields, signupPhone, signupProductId, givableProductType } from "@/lib/onepage/signup-fields"
import { TIP_MAX_CENTS, checkTipAmount, tipAmounts, tipModeOf, tipReturnPath, typedTipCents } from "@/lib/onepage/tips"
import { TIP_SESSION_KIND, confirmTip, isTipSession, recordTipFromSession, startTipCheckout, tipCheckoutParams, type TipDeps } from "@/lib/onepage/tips-server"
import { countRows, pollOptionOf, pollShowsResults, tallyVotes, validVoterId } from "@/lib/onepage/poll"
import { castVote, pollStateFor, voterKey } from "@/lib/onepage/poll-server"
import { findPageBlock, liveAppBlockData, visibleNow } from "@/lib/onepage/page-block"
import { lockedContent, withoutLocked } from "@/lib/onepage/paid-access"
import { compactCount, easeOutCubic, parseStatValue, statAnimationOf, statFrame } from "@/lib/onepage/stat-count"
import { bandsintownArtist, bandsintownEvents, mergeEvents, parseFeed } from "@/lib/onepage/feeds"
import { readTrustBox, starShares, trustBoxSrc } from "@/lib/onepage/reviews-block"
import { withDataBlocks, type DataDeps } from "@/lib/onepage/data-blocks-server"
import { APP_FRAME_HOSTS, appBlockDefaults, appBlockHasContent, appTarget, type AppBlockData } from "@/lib/onepage/app-blocks"
import { isBlockShown, isScheduledNow } from "@/lib/onepage/extra-blocks"
import { ExtraBlock } from "@/components/onepage/extra-blocks"
import { defaultTheme, type OnePageBlock } from "@/lib/onepage/types"
import { CONTENT_SECURITY_POLICY } from "@/lib/security/csp"
import { webhookPayload } from "@/lib/onepage/integrations/providers"
import { pageSignup } from "@/lib/onepage/integrations/deliver-server"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`)
  }
}
function section(t: string) {
  console.log(`\n${t}`)
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

const PAGE = "11111111-2222-4333-8444-555555555555"
const CREATOR = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
const PRODUCT = "99999999-8888-4777-8666-555555555555"
const app = (id: string, data: Partial<AppBlockData> & { provider: AppBlockData["provider"] }, extra: Partial<OnePageBlock> = {}): OnePageBlock => ({ id, type: "app", enabled: true, sort_order: 0, data: { ...appBlockDefaults(data.provider), ...data } as never, ...extra })
const draw = (block: OnePageBlock, preview = false) => renderToStaticMarkup(React.createElement(ExtraBlock, { block, look: { theme: defaultTheme as never, scale: "live", onepageId: PAGE, preview } }))

/* ─── An in-memory database: enough of Supabase's builder for these routes ─── */

type Row = Record<string, unknown>
function memoryDb(tables: Record<string, Row[]>, opts: { missing?: string[] } = {}) {
  const missing = new Set(opts.missing ?? [])
  const uniques: Record<string, string[][]> = { onepage_poll_votes: [["onepage_id", "block_id", "voter_key"]], onepage_tips: [["checkout_session_id"]] }
  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let op: "select" | "insert" | "upsert" = "select"
    let payload: Row | Row[] | null = null
    let ignoreDup = false
    let single = false
    let limitN = Infinity
    const api: Record<string, unknown> = {}
    const chain = () => api
    api.select = () => chain()
    api.eq = (k: string, v: unknown) => (filters.push((r) => r[k] === v), chain())
    api.in = (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), chain())
    api.is = (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), chain())
    api.neq = (k: string, v: unknown) => (filters.push((r) => r[k] !== v), chain())
    api.order = () => chain()
    api.limit = (n: number) => ((limitN = n), chain())
    api.maybeSingle = () => ((single = true), chain())
    api.single = () => ((single = true), chain())
    api.insert = (p: Row | Row[]) => ((op = "insert"), (payload = p), chain())
    api.upsert = (p: Row | Row[], o?: { ignoreDuplicates?: boolean }) => ((op = "upsert"), (payload = p), (ignoreDup = !!o?.ignoreDuplicates), chain())
    api.then = (resolve: (v: unknown) => void) => {
      if (missing.has(table)) return resolve({ data: null, error: { code: "42P01", message: "missing" } })
      const rows = (tables[table] ??= [])
      if (op === "insert" || op === "upsert") {
        const list = Array.isArray(payload) ? payload : [payload!]
        const added: Row[] = []
        for (const r of list) {
          const clash = (uniques[table] ?? []).some((cols) => rows.some((x) => cols.every((c) => x[c] === r[c])))
          if (clash) {
            if (op === "upsert" && ignoreDup) continue
            return resolve({ data: null, error: { code: "23505", message: "duplicate" } })
          }
          const row = { id: `row_${rows.length + 1}`, ...r }
          rows.push(row)
          added.push(row)
        }
        return resolve({ data: added, error: null })
      }
      const found = rows.filter((r) => filters.every((f) => f(r))).slice(0, limitN)
      return resolve({ data: single ? (found[0] ?? null) : found, error: null, count: found.length })
    }
    return api
  }
  return { from, tables }
}

const fee = { platformFeeCents: 45, feePercent: 5, feeFixedCents: 30, planId: "free", pricingTier: "standard", feeRuleVersion: "v1" }

async function main() {
  section("1. Newsletter: a phone, a name, fields in each layout's shape, a product given")
  {
    check("a phone with spaces and dashes is kept as + and digits", signupPhone("+1 (555) 123-4567") === "+15551234567")
    check("00 in front is read as +", signupPhone("0040 712 345 678") === "+40712345678")
    check("a number too short, too long or with letters is refused", signupPhone("12345") === null && signupPhone("+1234567890123456") === null && signupPhone("call me") === null)
    check("a block that does not ask keeps no phone, whatever was sent", JSON.stringify(checkSignupPhone({ ask_phone: false }, "+15551234567")) === JSON.stringify({ ok: true, phone: null }))
    check("optional: none given is fine", JSON.stringify(checkSignupPhone({ ask_phone: true }, "")) === JSON.stringify({ ok: true, phone: null }))
    check("required: none given is refused", checkSignupPhone({ ask_phone: true, phone_required: true }, " ").ok === false)
    check("asked: a bad number is refused, a good one kept", checkSignupPhone({ ask_phone: true }, "abc").ok === false && (checkSignupPhone({ ask_phone: true }, "+44 20 7946 0958") as { phone: string }).phone === "+442079460958")
    check("the extra fields in order: name, then phone", signupExtraFields({ ask_name: true, ask_phone: true }).join() === "name,phone" && signupExtraFields({ ask_phone: true }).join() === "phone" && signupExtraFields({}).length === 0)
    check("a product is given only with the file on and a real id", signupProductId({ enable_digital_product: true, digital_product_id: PRODUCT }) === PRODUCT && signupProductId({ enable_digital_product: false, digital_product_id: PRODUCT }) === null && signupProductId({ enable_digital_product: true, digital_product_id: "nope" }) === null)
    check("every kind delivered as files can be given, never a shipped one or a membership", givableProductType("digital") && givableProductType("course") && givableProductType(null) && !givableProductType("physical") && !givableProductType("membership"))

    const leads = code(read("app/api/onepage/leads/route.ts"))
    check("the server reads the phone rule from the published block, never from the request's flags", /findPageBlock\(publishedBlocksOf\(onepage/.test(leads) && /checkSignupPhone\(blockData, body\?\.phone\)/.test(leads))
    check("the phone goes on the lead and the subscriber, and is dropped before part 411", /\.\.\.\(phone \? \{ phone \} : \{\}\)/.test(leads) && /k !== "phone"/.test(leads) && /delete subscriberRow\.phone/.test(leads))
    check("the product given is read from the block and checked to be the creator's own, published", /signupProductId\(blockData\)/.test(leads) && /grantSignupProduct\(adminSupabase/.test(leads))
    const grant = code(read("lib/onepage/signup-grant-server.ts"))
    check("the grant asks for the product by id AND creator, published, a kind given as files", /\.eq\("id", a\.productId\)\.eq\("creator_id", a\.creatorId\)/.test(grant) && /isPubliclyVisible\(product\)/.test(grant) && /givableProductType/.test(grant))
    check("the same address gets its own link back, never a second", /subscriber_digital_products"\)\.select\("download_token"\)/.test(grant))
    check("the tools hear the phone too (webhook, Zapier, Sheets)", (webhookPayload(pageSignup({ email: "a@b.co", phone: "+15551234567", form: "signup" }), "x") as { phone?: string }).phone === "+15551234567" && !("phone" in webhookPayload(pageSignup({ email: "a@b.co", form: "signup" }), "x")))

    const live = code(read("components/onepage/public-onepage.tsx"))
    check("each extra field takes its layout's shape: Connect's pill, Letter's line, the box elsewhere", /options\.shape === "pill"[\s\S]{0,400}rounded-full bg-white/.test(live) && /options\.shape === "line"[\s\S]{0,400}border-b-\[1\.5px\]/.test(live) && /data-email-field/.test(live))
    check("Bold's card gets white fields, Simple's a hairline", /options\.inverted && "ring-1 ring-black\/10"/.test(live) && /options\.outlined \? `inset 0 0 0 1px/.test(live))
    check("the fields are 16px on a phone (iOS never zooms into them)", (live.match(/extraField[\s\S]*?const emailExtras/)?.[0].match(/text-\[16px\]/g) ?? []).length >= 3)
    check("a phone field is a tel field with the phone's autofill", /type: name \? "text" : "tel"/.test(live) && /autoComplete: name \? "given-name" : "tel"/.test(live))
    check("the server's answer is shown when a signup is refused", /setLeadError\(typeof result\?\.error === "string"/.test(live) && /data-email-error/.test(live))
    check("the download is the server's link (the product's), not the page's guess", /result\?\.downloadLink/.test(live))
    const tab = code(read("components/onepage/tabs/links-tab.tsx"))
    check("the editor asks for a phone, and whether it is required", /tt\("Ask for a phone number"\)/.test(tab) && /tt\("Phone number required"\)/.test(tab))
    check("the editor offers one of your products, through the products picker", /tt\("One of your products"\)/.test(tab) && /<ProductPicker[\s\S]{0,200}givableProductType/.test(tab))
  }

  section("2. Tips: Storelib checkout, to the creator's own account")
  {
    check("a new tips block takes tips through Storelib, three amounts and their own", tipModeOf(appBlockDefaults("tips")) === "storelib" && tipAmounts(appBlockDefaults("tips")).join() === "300,500,1000")
    check("a block saved before with a link keeps its link", tipModeOf({ url: "https://ko-fi.com/me" }) === "link")
    check("presets: valid, each once, sorted, at most four", tipAmounts({ tip_amounts: [500, 300, 300, 50, 9_999_999, "x", 2000, 1500, 700] }).join() === "300,500,700,1500")
    const block = { tip_amounts: [300, 500, 1000], tip_custom: false }
    check("a preset is taken", checkTipAmount(block, 500, 50).ok)
    check("an amount the block does not offer is refused", checkTipAmount(block, 777, 50).ok === false)
    check("their own amount only when the block allows it", checkTipAmount({ ...block, tip_custom: true }, 777, 50).ok)
    check("below Stripe's smallest charge is refused", (checkTipAmount({ ...block, tip_custom: true }, 30, 50) as { error: string }).error === "too_small")
    check("above the cap is refused", (checkTipAmount({ ...block, tip_custom: true }, TIP_MAX_CENTS + 1, 50) as { error: string }).error === "too_large")
    check("fractions, negatives and words are refused", !checkTipAmount({ ...block, tip_custom: true }, 500.5, 50).ok && !checkTipAmount(block, -500, 50).ok && !checkTipAmount(block, "five", 50).ok)
    check("a typed amount reads with a dot or a comma", typedTipCents("5,50") === 550 && typedTipCents("12") === 1200 && typedTipCents("1.234") === null)
    check("the way back is the page's own path, never another site", tipReturnPath("/l/anna") === "/l/anna" && tipReturnPath("//evil.com") === "/" && tipReturnPath("https://evil.com") === "/" && tipReturnPath("/l/anna?x=1#y") === "/l/anna")

    const params = tipCheckoutParams({ page: { id: PAGE, title: "Anna" }, blockId: "tip1", creatorId: CREATOR, creatorName: "Anna", destination: "acct_creator", amountCents: 500, currency: "usd", fee, name: null, message: "thanks", successUrl: "https://storelib.com/l/anna?tip=thanks", cancelUrl: "https://storelib.com/l/anna?tip=cancelled" })
    check("the money goes to the creator's own account, the platform keeps only its usual fee", params.payment_intent_data?.transfer_data?.destination === "acct_creator" && params.payment_intent_data?.application_fee_amount === 45)
    check("one line, the server's amount, the store's currency", params.line_items?.length === 1 && params.line_items[0].price_data?.unit_amount === 500 && params.line_items[0].price_data?.currency === "usd")
    check("the session names itself a tip, never a product", params.metadata?.kind === TIP_SESSION_KIND && !("product_id" in (params.metadata ?? {})) && !("receipt_token" in (params.payment_intent_data?.metadata ?? {})))

    /* The whole start, against a database and a stub Stripe. */
    const published = [app("tip1", { provider: "tips", tip_amounts: [300, 500, 1000], tip_custom: false }), app("tipoff", { provider: "tips" }, { enabled: false }), app("tiplater", { provider: "tips" }, { schedule: { start_at: "2999-01-01T00:00:00Z", end_at: null } as never })]
    const asked: { params: unknown; key?: string }[] = []
    const deps = (over: Partial<TipDeps> = {}): TipDeps => ({
      stripe: { checkout: { sessions: { create: async (p, o) => (asked.push({ params: p, key: o?.idempotencyKey }), { id: "cs_test_aaaaaaaaaaaa", url: "https://checkout.stripe.com/c/pay/cs_test" }), retrieve: async () => ({}) as never } } },
      ready: async () => true,
      fee: async () => fee,
      currency: async () => "usd",
      minimum: () => 50,
      ...over,
    })
    const db = () =>
      memoryDb({
        onepages: [{ id: PAGE, status: "published", slug: "anna", title: "Anna", seller_id: CREATOR, owner_id: "user_anna", published_blocks: published, draft_blocks: [app("tip1", { provider: "tips", tip_amounts: [9900] })] }],
        creators: [{ id: CREATOR, user_id: "user_anna", display_name: "Anna", stripe_account_id: "acct_creator" }],
      })
    const start = (over: Record<string, unknown> = {}, d = deps()) => startTipCheckout(db(), d, { onepageId: PAGE, blockId: "tip1", amountCents: 500, origin: "https://storelib.com", returnPath: "/l/anna", visitor: "v1", ...over })
    const ok = await start()
    check("a preset starts a checkout and answers Stripe's page", ok.ok === true && (ok as { url: string }).url.startsWith("https://checkout.stripe.com/"))
    check("the destination is read from the creator's row, never the request", (asked[0]?.params as { payment_intent_data: { transfer_data: { destination: string } } })?.payment_intent_data.transfer_data.destination === "acct_creator")
    check("an amount from the draft (not yet published) is refused", (await start({ amountCents: 9900 })).ok === false)
    check("a block that is off, or not yet in its schedule, takes no tip", (await start({ blockId: "tipoff" })).ok === false && (await start({ blockId: "tiplater" })).ok === false)
    check("a creator who cannot take payments is refused, nothing charged", ((await start({}, deps({ ready: async () => false }))) as { code: string }).code === "seller_unavailable")
    check("two visitors never share a Stripe page", (await start({ visitor: "v2" }), asked.length >= 2 && asked[asked.length - 1].key !== asked[0].key))
    check("an unknown page is not found", ((await start({ onepageId: "bad" })) as { status: number }).status === 404)

    const session = (over: Record<string, unknown> = {}) => ({ id: "cs_test_aaaaaaaaaaaa", payment_status: "paid", amount_total: 500, currency: "usd", payment_intent: "pi_1", customer_details: { name: "Sam", email: "sam@x.co" }, metadata: { kind: TIP_SESSION_KIND, onepage_id: PAGE, block_id: "tip1", creator_id: CREATOR, amount_cents: "500", platform_fee_cents: "45" }, ...over }) as never
    const tdb = memoryDb({})
    const first = await recordTipFromSession(tdb, session())
    const again = await recordTipFromSession(tdb, session())
    check("a paid session is one tip, recorded once (webhook and return both land)", first.ok && (first as { created: boolean }).created && again.ok && !(again as { created: boolean }).created && tdb.tables.onepage_tips.length === 1)
    check("the row carries the amount, the creator, the page and the block", tdb.tables.onepage_tips[0].amount_cents === 500 && tdb.tables.onepage_tips[0].creator_id === CREATOR && tdb.tables.onepage_tips[0].block_id === "tip1")
    check("an unpaid session is not a tip", (await recordTipFromSession(memoryDb({}), session({ payment_status: "unpaid" }))).ok === false)
    check("a session of another kind is not a tip", !isTipSession({ metadata: { kind: "community_event", onepage_id: PAGE, creator_id: CREATOR, block_id: "x" } }))
    check("before part 411 the tip is still confirmed from Stripe, only not kept", ((await recordTipFromSession(memoryDb({}, { missing: ["onepage_tips"] }), session())) as { stored: boolean }).stored === false)
    const confirmDb = memoryDb({})
    const stripe = { checkout: { sessions: { create: async () => ({ id: "", url: null }), retrieve: async () => session() } } }
    check("the return confirms only a cs_ id, for the page it says", (await confirmTip(confirmDb, stripe, { sessionId: "nope", onepageId: PAGE })).ok === false && ((await confirmTip(confirmDb, stripe, { sessionId: "cs_test_aaaaaaaaaaaa", onepageId: "22222222-2222-4333-8444-555555555555" })) as { status: number }).status === 403)
    check("the webhook knows a tip's sessions", /session\.metadata\?\.kind === "onepage_tip"/.test(code(read("app/api/stripe/webhook/route.ts"))) && /recordTipFromSession\(supabaseAdmin, session\)/.test(read("app/api/stripe/webhook/route.ts")))
    check("the tip route is limited like every payment", /bucket: "payment"/.test(read("app/api/onepage/tip/route.ts")))
  }

  section("3. Poll: one vote each, the owner sees the totals")
  {
    check("a voter cookie we made is 32 hex characters", validVoterId("0123456789abcdef0123456789abcdef") && !validVoterId("x") && !validVoterId(undefined))
    check("only the block's own answers", pollOptionOf([{ id: "a" }, { id: "b" }], "b") === "b" && pollOptionOf([{ id: "a" }], "z") === null)
    const t = tallyVotes([{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }], { a: 1, b: 1, c: 1, gone: 7 })
    check("three equal shares read 34, 33, 33 and add to 100; a removed answer is not counted", t.total === 3 && t.options.map((o) => o.percent).join() === "34,33,33")
    check("no votes is all zero", tallyVotes([{ id: "a", label: "A" }], {}).options[0].percent === 0)
    check("rows are counted per answer", JSON.stringify(countRows([{ option_id: "a" }, { option_id: "a" }, { option_id: "b" }])) === JSON.stringify({ a: 2, b: 1 }))
    check("results after voting are on unless the creator turns them off", pollShowsResults({}) && !pollShowsResults({ poll_show_results: false }))
    const poll = app("poll1", { provider: "poll", poll_question: "Next?", poll_options: [{ id: "a", label: "Video" }, { id: "b", label: "Guide" }] })
    const db = memoryDb({ onepages: [{ id: PAGE, status: "published", seller_id: CREATOR, owner_id: "u", published_blocks: [poll], draft_blocks: [] }] })
    const v1 = await castVote(db, { onepageId: PAGE, blockId: "poll1", optionId: "a", voterId: "0123456789abcdef0123456789abcdef" })
    const v1again = await castVote(db, { onepageId: PAGE, blockId: "poll1", optionId: "b", voterId: "0123456789abcdef0123456789abcdef" })
    const v2 = await castVote(db, { onepageId: PAGE, blockId: "poll1", optionId: "b", voterId: "fedcba9876543210fedcba9876543210" })
    check("a first vote counts", v1.ok && !(v1 as { already: boolean }).already)
    check("the same visitor voting again is answered with their first vote, and nothing is added", v1again.ok && (v1again as { already: boolean; voted: string }).already && (v1again as { voted: string }).voted === "a" && db.tables.onepage_poll_votes.length === 2)
    check("the totals come back after a vote", v2.ok && (v2 as { tally: { total: number } }).tally.total === 2)
    check("the cookie itself is never stored, only a hash for this poll", db.tables.onepage_poll_votes.every((r) => r.voter_key !== "0123456789abcdef0123456789abcdef" && String(r.voter_key).length === 40) && voterKey("x", PAGE, "poll1") !== voterKey("x", PAGE, "poll2"))
    check("an answer the poll does not have is refused", ((await castVote(db, { onepageId: PAGE, blockId: "poll1", optionId: "zzz", voterId: "11111111111111111111111111111111" })) as { code: string }).code === "bad_option")
    check("a poll that is not on the published page takes no vote", ((await castVote(db, { onepageId: PAGE, blockId: "nope", optionId: "a", voterId: "11111111111111111111111111111111" })) as { code: string }).code === "not_found")
    check("before part 411 a vote is refused with not_ready", ((await castVote(memoryDb({ onepages: db.tables.onepages }, { missing: ["onepage_poll_votes"] }), { onepageId: PAGE, blockId: "poll1", optionId: "a", voterId: "11111111111111111111111111111111" })) as { code: string }).code === "not_ready")
    const state = await pollStateFor(db, { onepageId: PAGE, blockId: "poll1", voterId: "fedcba9876543210fedcba9876543210" })
    check("a returning voter sees their vote and the totals", state.voted === "b" && state.tally?.total === 2)
    check("somebody who has not voted sees no totals", (await pollStateFor(db, { onepageId: PAGE, blockId: "poll1", voterId: null })).tally === null)
    const route = code(read("app/api/onepage/poll/route.ts"))
    check("the vote route sets an http only cookie, refuses robots and limits each address", /httpOnly: true/.test(route) && /looksLikeVisitor\(request\.headers\)/.test(route) && /bucket: "onepage-poll"/.test(route))
    const activity = code(read("app/api/onepage/activity/route.ts"))
    check("the totals for /app are the page owner's only", /onePageActor\(supabase, user\.id\)/.test(activity) && /page\.owner_id !== actor\.pageOwnerId/.test(activity))
    check("the SQL: one vote each (a unique index), nothing granted to visitors", /CREATE UNIQUE INDEX IF NOT EXISTS onepage_poll_votes_one_each ON public\.onepage_poll_votes \(onepage_id, block_id, voter_key\)/.test(read("supabase/sql/run-now/411_onepage_tips_polls_phone.sql")) && /REVOKE ALL ON TABLE public\.onepage_poll_votes FROM anon, authenticated/.test(read("supabase/sql/run-now/411_onepage_tips_polls_phone.sql")))
    const html = draw(poll)
    check("the page draws the question and its answers", /data-onepage-app="poll"/.test(html) && /data-poll-option="a"/.test(html))
  }

  section("4. Paid access: the locked part never reaches a visitor")
  {
    const paid = app("u1", { provider: "paid", paid_product_id: PRODUCT, title: "Bonus", locked_text: "The secret recipe", locked_url: "https://drive.example.com/x", locked_label: "Open folder" })
    const group = { id: "g", type: "group", enabled: true, sort_order: 1, data: { layout: "stack", children: [paid] } } as unknown as OnePageBlock
    const clean = withoutLocked([paid, group]) as OnePageBlock[]
    const json = JSON.stringify(clean)
    check("the locked text and link are taken out, in a group too", !json.includes("secret recipe") && !json.includes("drive.example.com"))
    check("the page still knows there is something to open", (clean[0].data as Record<string, unknown>).locked_has_text === true && (clean[0].data as Record<string, unknown>).locked_has_link === true)
    check("the input is not changed", (paid.data as AppBlockData).locked_text === "The secret recipe")
    check("what an owner is shown: the text, an http link, a label", JSON.stringify(lockedContent(paid.data as never)) === JSON.stringify({ text: "The secret recipe", url: "https://drive.example.com/x", label: "Open folder" }) && lockedContent({ locked_url: "javascript:alert(1)" }).url === null)
    const deps: DataDeps = { ready: async () => true, currency: async () => "usd", money: (c) => `$${c / 100}`, reviews: async () => null, fetchText: async () => null, bandsintown: async () => null }
    const db = memoryDb({ products: [{ id: PRODUCT, title: "Bonus pack", price_cents: 900, status: "published", type: "digital", creator_id: CREATOR }] })
    const filled = (await withDataBlocks(db, deps, CREATOR, [paid])) as OnePageBlock[]
    const fd = filled[0].data as AppBlockData
    check("the live page gets the product's name, price and checkout, and not the locked part", fd.paid_ready === true && fd.paid_price === "$9" && /\/checkout\?productId=/.test(fd.paid_checkout || "") && !JSON.stringify(filled).includes("secret recipe"))
    const other = (await withDataBlocks(memoryDb({ products: [{ id: PRODUCT, status: "published", creator_id: "someone-else" }] }), deps, CREATOR, [paid])) as OnePageBlock[]
    check("somebody else's product opens nothing (the block is left out)", (other[0].data as AppBlockData).paid_ready === false && !appBlockHasContent(other[0]))
    const live = code(read("lib/onepage/published-page.ts"))
    /* Changed on purpose (Storelib Reviews on OnePage cards): the blocks reach it with their ratings on (lib/onepage/product-rating-server). */
    check("every live page's blocks go through it, cached or not", /withDataBlocks\(db, await liveDataDeps\(db\), creatorId, rated\)/.test(live) && /\.then\(withoutLocked\)/.test(live))
    const route = code(read("app/api/onepage/access/route.ts"))
    check("access is checked on the server: the owner, a buyer's entitlement or order, or this browser's receipt", /ownsProduct\(db, user\.id, productId\)/.test(route) && /guestOwns\(db, guestAccessFromCookieHeader/.test(route) && /user\.id === page\.owner_id/.test(route))
    check("the product is the block's, from the published page, and the page creator's own", /liveAppBlockData<[^>]*>\(publishedBlocksOf\(page\), body\.block_id, "paid"\)/.test(route) && /\.eq\("id", productId\)\.eq\("creator_id", creatorId\)/.test(route))
    check("anybody else is told it is locked, with nothing of it", /\{ locked: true, signed_in: !!user \}, \{ status: 403/.test(route))
    const blocksLive = code(read("app/api/onepage/blocks-live/route.ts"))
    check("the preview's public fill never answers a tracked stat or a store code", /APP_PROVIDERS = new Set\(\["reviews", "rss", "events", "paid", "tips"\]\)/.test(blocksLive))
    const html = draw(app("u2", { provider: "paid", paid_product_id: PRODUCT, title: "Bonus", paid_ready: true, paid_price: "$9", paid_checkout: "/checkout?productId=x" }))
    check("the card says the price and shows no locked words", /Get access for \$9/.test(html) && /data-paid-blur/.test(html))
  }

  section("5. Schedule: show from and until, on the server and in every route")
  {
    const now = Date.parse("2026-11-10T12:00:00Z")
    const later = { schedule: { start_at: "2026-11-11T00:00:00Z", end_at: null } }
    const ended = { schedule: { start_at: null, end_at: "2026-11-10T11:59:59Z" } }
    const live = { schedule: { start_at: "2026-11-10T11:00:00Z", end_at: "2026-11-10T13:00:00Z" } }
    check("before its start it is off", !isScheduledNow(later as never, now))
    check("at its end it is off (the end is not included)", !isScheduledNow(ended as never, now) && !isScheduledNow({ schedule: { start_at: null, end_at: "2026-11-10T12:00:00Z" } } as never, now))
    check("inside the window it is on", isScheduledNow(live as never, now))
    check("a start or end that cannot be read never hides a block for good", isScheduledNow({ schedule: { start_at: "garbage", end_at: null } } as never, now))
    const poll = app("p", { provider: "poll", poll_question: "Q", poll_options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }, later as never)
    check("the live page's one rule leaves it out", !isBlockShown(poll, now))
    check("a route asked about it refuses it, and a block in a group that is not on yet too", liveAppBlockData([poll], "p", "poll", now) === null && !visibleNow(findPageBlock([{ id: "g", type: "group", enabled: true, schedule: later.schedule, data: { children: [app("p2", { provider: "poll" })] } }], "p2"), now))
    const shape = code(read("lib/onepage/public-shape.ts"))
    check("the live page's server drops a block outside its window before it is sent", /blocks\.filter\(\(b\) => isScheduledNow\(b, now\)\)/.test(shape))
  }

  section("6. Stats: real numbers, counted into view")
  {
    check("12k, 98%, $1.2M and 1,204+ are read as numbers", JSON.stringify(parseStatValue("12k")) === JSON.stringify({ prefix: "", value: 12, decimals: 0, grouped: false, suffix: "k" }) && parseStatValue("$1.2M")?.value === 1.2 && parseStatValue("$1.2M")?.prefix === "$" && parseStatValue("1,204+")?.grouped === true)
    check("words are never animated or made into a number", parseStatValue("Top 10") === null && parseStatValue("#1 seller") === null)
    const n = parseStatValue("1,204+")!
    check("each frame is written as the creator wrote it, and the last is exact", statFrame(n, 0) === "0+" && statFrame(n, 1) === "1,204+" && statFrame(parseStatValue("4.9")!, 0.5) === "2.5")
    check("the easing ends at 1 and moves fast first", easeOutCubic(1) === 1 && easeOutCubic(0.5) > 0.8)
    check("count up by default, the creator's choice otherwise", statAnimationOf({}) === "count" && statAnimationOf({ stats_animation: "roll" }) === "roll" && statAnimationOf({ stats_animation: "spin" }) === "count")
    check("tracked numbers are short and never rounded up", compactCount(950) === "950" && compactCount(1250) === "1.2k" && compactCount(1999) === "1.9k" && compactCount(12_999) === "12k" && compactCount(1_000_000) === "1M")
    const stats = app("s", { provider: "stats", items: [{ id: "a", title: "Subscribers", value: "", source: "subscribers" }, { id: "b", title: "Rating", value: "4.9", source: "typed" }] })
    const db = memoryDb({ subscribers: [{ id: 1, creator_id: CREATOR, status: "subscribed" }, { id: 2, creator_id: CREATOR, status: "subscribed" }, { id: 3, creator_id: CREATOR, status: "unsubscribed" }] })
    const deps: DataDeps = { ready: async () => true, currency: async () => "usd", money: String, reviews: async () => null, fetchText: async () => null, bandsintown: async () => null }
    const filled = (await withDataBlocks(db, deps, CREATOR, [stats])) as OnePageBlock[]
    const items = (filled[0].data as AppBlockData).items!
    check("a tracked number is read from Storelib (2 subscribed of 3), a typed one left as typed", items[0].value === "2" && items[1].value === "4.9")
    const html = draw(app("s2", { provider: "stats", stats_animation: "count", items: [{ id: "a", title: "Students", value: "1,204+" }] }))
    check("the final number holds the tile's width from the first frame (no jump)", /class="invisible \[grid-area:1\/1\]">1,204\+</.test(html) && /aria-label="1,204\+"/.test(html))
    const view = code(read("components/onepage/data-blocks.tsx"))
    check("reduced motion shows the numbers straight away", /const mode: StatAnimation = reduce \? "none" : chosen/.test(view) && /prefers-reduced-motion: reduce/.test(read("components/onepage/data-blocks.tsx")))
    check("it starts when a quarter of it is in view, once", /threshold: 0\.25/.test(view) && /io\.disconnect\(\)/.test(view))
  }

  section("7. Events, reviews and feeds")
  {
    const rss = `<?xml version="1.0"?><rss><channel><title>Blog</title><item><title><![CDATA[First &amp; best]]></title><link>https://blog.example.com/1</link><pubDate>Tue, 03 Nov 2026 10:00:00 GMT</pubDate></item><item><title>Bad link</title><link>javascript:alert(1)</link></item><item><title>Second</title><link>https://blog.example.com/2</link></item></channel></rss>`
    const items = parseFeed(rss)
    check("RSS: titles decoded, dates read, a javascript: link dropped", items.length === 2 && items[0].title === "First & best" && items[0].date === "2026-11-03" && items.every((i) => i.url.startsWith("https://")))
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom post</title><link rel="alternate" href="https://site.example.com/a"/><updated>2026-10-01T00:00:00Z</updated></entry></feed>`
    check("Atom: the alternate link", parseFeed(atom)[0]?.url === "https://site.example.com/a")
    check("the feed is read on the server with the SSRF guard", /fetchPublic\(url, \{ maxBytes: 1_500_000, timeoutMs: 6000, maxRedirects: 3 \}\)/.test(read("lib/onepage/data-blocks-server.ts")))
    /* A recorded Bandsintown answer (the shape of rest.bandsintown.com/artists/<name>/events). */
    const recorded = [
      { id: "1001", datetime: "2026-12-01T20:00:00", title: "", url: "https://www.bandsintown.com/e/1001", venue: { name: "Paradiso", city: "Amsterdam", country: "Netherlands" }, offers: [{ type: "Tickets", url: "https://www.bandsintown.com/t/1001", status: "available" }] },
      { id: "1002", datetime: "2026-12-05T20:00:00", venue: { name: "Roundhouse", city: "London", country: "United Kingdom" }, offers: [{ url: "https://www.bandsintown.com/t/1002", status: "sold out" }] },
      { id: "bad", datetime: "soon" },
    ]
    const shows = bandsintownEvents(recorded)
    check("Bandsintown: the day, the place, the ticket link, sold out", shows.length === 2 && shows[0].date === "2026-12-01" && shows[0].venue === "Paradiso, Amsterdam, Netherlands" && shows[0].url === "https://www.bandsintown.com/t/1001" && shows[1].sold_out === true)
    check("an artist's link or name is read; anything else refused", bandsintownArtist("https://www.bandsintown.com/a/12345-the-band") === "the band" && bandsintownArtist("Phoebe Bridgers") === "Phoebe Bridgers" && bandsintownArtist("a/b?c") === null)
    check("typed dates and imported ones merge, one per day and place, in order", mergeEvents([{ id: "own", title: "", date: "2026-12-05", venue: "Roundhouse, London, United Kingdom" }], shows).map((e) => e.id).join() === "bit_1001,own")
    check("Bandsintown is only asked with BANDSINTOWN_APP_ID", /process\.env\.BANDSINTOWN_APP_ID/.test(read("lib/onepage/data-blocks-server.ts")))
    const event = app("e1", { provider: "event", title: "Launch night", event_start: "2026-12-01T19:00:00Z", venue: "Paradiso", url: "https://tickets.example.com", rsvp: true })
    check("an event with a name and a start is drawn; without a start it is left out", appBlockHasContent(event) && !appBlockHasContent(app("e2", { provider: "event", title: "x" })))
    const ehtml = draw(event)
    check("the event card: the day, tickets, RSVP and Add to calendar", /data-event-day/.test(ehtml) && /Tickets/.test(ehtml) && /RSVP/.test(ehtml) && /data-event-calendar/.test(ehtml))
    check("an RSVP goes to Leads as an rsvp, and onto the list only with a yes", /magnetKind: "rsvp"/.test(read("app/api/onepage/rsvp/route.ts")) && /body\.keep_posted === true/.test(read("app/api/onepage/rsvp/route.ts")))
    check("Luma: an event's own embed, Luma's frame allowed", appTarget({ provider: "luma", url: "https://lu.ma/embed/event/evt-AbC123xyz/simple" })?.embed?.src === "https://lu.ma/embed/event/evt-AbC123xyz/simple" && APP_FRAME_HOSTS.includes("https://lu.ma" as never) && /https:\/\/lu\.ma/.test(CONTENT_SECURITY_POLICY))
    const box = readTrustBox(`<div class="trustpilot-widget" data-locale="en-GB" data-template-id="53aa8807dec7e10d38f59f36" data-businessunit-id="5a1b2c3d4e5f60718293a4b5" data-style-height="150px" data-theme="dark"><a href="https://uk.trustpilot.com/review/example.com">Trustpilot</a></div><script>alert(1)</script>`)
    check("Trustpilot: only the TrustBox's ids are read from the pasted code", !!box && box.templateId === "53aa8807dec7e10d38f59f36" && box.height === 150 && box.theme === "dark" && box.locale === "en-GB")
    check("the frame is Trustpilot's own address for that TrustBox", !!box && trustBoxSrc(box).startsWith("https://widget.trustpilot.com/trustboxes/53aa8807dec7e10d38f59f36/index.html?businessunitId=5a1b2c3d4e5f60718293a4b5#") && /https:\/\/widget\.trustpilot\.com/.test(CONTENT_SECURITY_POLICY))
    check("pasted code without the ids is refused", readTrustBox("<script>evil()</script>") === null)
    check("stars: 4.6 is four full and one at 60%", starShares(4.6).map((s) => Math.round(s * 10)).join() === "10,10,10,10,6")
    const reviews = app("r1", { provider: "reviews", review_source: "storelib", layout: "carousel", review_items: [{ id: "a", rating: 5, title: "Great", body: "Loved it", author: "Jane D.", date: "Nov 1, 2026", verified: true }], review_summary: { average: 5, count: 1, average_label: "5.0", count_label: "1 review" } })
    const rhtml = draw(reviews)
    check("the store's reviews: the score, the count and the cards", /data-review-summary/.test(rhtml) && /1 review/.test(rhtml) && /data-review="a"/.test(rhtml) && /data-app-layout="carousel"/.test(rhtml))
    check("the store's reviews with none yet are left off the live page", !appBlockHasContent(app("r2", { provider: "reviews", review_source: "storelib", review_items: [] })))
  }

  section("8. Analytics: each tap once, never the preview, never a robot")
  {
    const live = code(read("components/onepage/public-onepage.tsx"))
    check("the page's own count is not sent from the editor's preview", /const trackClick = async \(blockId: string, url: string\) => \{\s*if \(inGroupPreview \|\| isOnePagePreview\(\)\) return/.test(live))
    const activity = code(read("components/onepage/block-activity.ts"))
    check("a block that counted itself is not counted again by the listener", /if \(Date\.now\(\) - lastTracked < DEDUPE_MS\) return/.test(activity))
    const views = code(read("components/onepage/data-blocks.tsx"))
    check("the new blocks count through the page's one counter (noteTracked)", /useTrack\(look\)/.test(views) && /noteTracked\(\)/.test(code(read("components/onepage/app-block.tsx"))))
    check("a vote is not counted as a click any more: the vote is the record", !/vote-\$\{/.test(views))
    const route = code(read("app/api/onepage/track/route.ts"))
    /* Changed on purpose (round rel2-public): the older click table is not written at all; Analytics' link_click is the record. */
    check("a click is recorded by Analytics alone", /await recordLinkClick\(request, body\)/.test(route) && !/onepage_clicks/.test(route.replace(/\/\*[\s\S]*?\*\//g, "")))
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
