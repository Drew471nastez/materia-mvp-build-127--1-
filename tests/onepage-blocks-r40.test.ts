/**
 * ===========================================================================
 *  ROUND 40: THE ONEPAGE'S INTEGRATIONS, EMBEDS AND STORELIB BLOCKS
 * ===========================================================================
 *   TOOLS       Mailchimp, Kit, beehiiv and the webhooks (Zapier, Make,
 *               Google Sheets, your own): the exact requests a signup makes,
 *               a busy provider asked once more, a refusal written on the
 *               connection, keys sealed and never sent back
 *               (lib/onepage/integrations).
 *   SIGNUPS     every OnePage signup route hands the signup on after its
 *               answer (after()), and the lead magnet route reads the block
 *               from the published page, never from the visitor.
 *   PIXELS      Meta, TikTok and Pinterest wait for a marketing yes where
 *               one is needed (lib/store/tracking marketingConsentJs).
 *   BLOCKS      shelf, lead magnet, posts, followers and code: their rules
 *               (lib/onepage/storelib-blocks), registered everywhere a block
 *               type is listed, and the Add block sheet's marks.
 *   EMBEDS      the frame is the post's own width, shown once measured, and
 *               a settling post never moves the page (components/onepage/
 *               embed-frame).
 *   SQL         parts 315 and 316, byte-identical migrations, checks.
 *
 * Run: npx tsx --conditions=react-server tests/onepage-blocks-r40.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createHash, createHmac } from "node:crypto"
import {
  compactCount,
  couponLabel,
  couponUsable,
  followerTotal,
  isDarkColor,
  leadMagnetReady,
  parseCount,
  parseYouTubeFeed,
  channelIdFromPage,
  pastedPosts,
  promoCode,
  shelfTakes,
  socialPost,
  storelibBlockHasContent,
  stripResolved,
  youtubeChannel,
  youtubeFeedUrl,
  blueskyHandle,
  STORELIB_BLOCK_TYPES,
} from "@/lib/onepage/storelib-blocks"
import { EXTRA_BLOCK_TYPES, isBlockShown } from "@/lib/onepage/extra-blocks"
import { createDefaultBlock, type OnePageBlockType } from "@/lib/onepage/types"
import { keyProblem, mailchimpDc, outcomeOf, signupRequests, webhookProblem, webhookSignature, webhookPayload, listsFrom, type PageSignup } from "@/lib/onepage/integrations/providers"
import { PAGE_INTEGRATIONS } from "@/lib/onepage/integrations/catalog"
import { deliverSignup, pageSignup, sendToConnection, type Transport } from "@/lib/onepage/integrations/deliver-server"
import { listsFor } from "@/lib/onepage/integrations/connect-server"
import { sealSecret } from "@/lib/physical/secrets"
import { marketingConsentJs, trackingTags } from "@/lib/store/tracking"
import { EMBED_MAX_WIDTH, EMBED_SETTLE_PX, nextEmbedHeight } from "@/components/onepage/embed-frame"

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key-for-sealing"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const SIGNUP: PageSignup = { email: "Ana@Example.com ", name: "Ana Maria", form: "signup", blockId: "block_1", onepageId: "op1", pageUrl: "https://storelib.me/ana", at: "2026-10-28T10:00:00.000Z" }
const MC_KEY = "0123456789abcdef0123456789abcdef-us21"

/* A database that answers the two things the sender asks. */
function fakeDb(rows: Record<string, unknown>[]) {
  const notes: { p_id: string; p_ok: boolean; p_error: string | null }[] = []
  const db = {
    from: () => {
      const q = { select: () => q, eq: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(r) }
      return q
    },
    rpc: async (_name: string, args: { p_id: string; p_ok: boolean; p_error: string | null }) => {
      notes.push(args)
      return { data: null, error: null }
    },
  }
  return { db, notes }
}

async function main() {
  section("A signup, as each tool is asked for it")
  {
    check("a Mailchimp key names its data centre", mailchimpDc(MC_KEY) === "us21" && mailchimpDc("abc") === null)
    check("a key of the wrong shape is refused before anything is asked", keyProblem("mailchimp", "nope") !== null && keyProblem("mailchimp", MC_KEY) === null && keyProblem("kit", "short") !== null)
    const mc = signupRequests("mailchimp", MC_KEY, { list_id: "a1b2c3", double_optin: false, tag: "OnePage" }, SIGNUP)
    const hash = createHash("md5").update("ana@example.com").digest("hex")
    const body = JSON.parse(mc[0].body ?? "{}")
    /* Changed on purpose (round 41): ?skip_merge_validation=true, so an audience with a required field of its own still takes the signup (tests/onepage-integrations-r41.test.ts). */
    check("Mailchimp: a PUT by the address's hash, so a second signup is the same member", mc[0].method === "PUT" && mc[0].url === `https://us21.api.mailchimp.com/3.0/lists/a1b2c3/members/${hash}?skip_merge_validation=true`)
    check("  status_if_new only: someone who left in Mailchimp stays left", body.status_if_new === "subscribed" && !("status" in body) && body.merge_fields?.FNAME === "Ana")
    check("  the tag in a second call", mc.length === 2 && mc[1].url.endsWith("/tags") && JSON.parse(mc[1].body ?? "{}").tags[0].name === "OnePage")
    check("  double opt in is pending", JSON.parse(signupRequests("mailchimp", MC_KEY, { list_id: "a1b2c3", double_optin: true }, SIGNUP)[0].body ?? "{}").status_if_new === "pending")
    check("  the key goes as Basic auth, never in the address", mc[0].headers.authorization.startsWith("Basic ") && !mc[0].url.includes(MC_KEY))
    check("  no list, no request", signupRequests("mailchimp", MC_KEY, {}, SIGNUP).length === 0)
    const kit = signupRequests("kit", "kit_abcdefghijklmnopqrstuvwxyz", { list_id: "12345", tag_id: "678" }, SIGNUP)
    check("Kit: the subscriber, then the form, then the tag (v4)", kit.map((r) => r.url).join() === "https://api.kit.com/v4/subscribers,https://api.kit.com/v4/forms/12345/subscribers,https://api.kit.com/v4/tags/678/subscribers" && kit[0].headers["x-kit-api-key"] === "kit_abcdefghijklmnopqrstuvwxyz")
    const bh = signupRequests("beehiiv", "x".repeat(40), { list_id: "pub_00000000-0000-0000-0000-000000000000" }, SIGNUP)
    const bb = JSON.parse(bh[0]?.body ?? "{}")
    check("beehiiv: a subscription on the publication, welcome email on", bh.length === 1 && bh[0].url.endsWith("/publications/pub_00000000-0000-0000-0000-000000000000/subscriptions") && bb.email === "ana@example.com" && bb.send_welcome_email === true && bb.utm_source === "storelib")
    check("an injected list id is never put in a path", signupRequests("beehiiv", "x".repeat(40), { list_id: "../../admin" }, SIGNUP).length === 0 && signupRequests("kit", "k".repeat(30), { list_id: "1/../x" }, SIGNUP).length === 1)
    check("lists, forms and publications read from each answer", listsFrom("mailchimp", { lists: [{ id: "a", name: "Main" }] })[0]?.name === "Main" && listsFrom("kit", { forms: [{ id: 5, name: "F" }] })[0]?.id === "5" && listsFrom("beehiiv", { data: [{ id: "pub_x", name: "P" }] }).length === 1)
  }

  section("Webhooks: Zapier, Make, Google Sheets and your own")
  {
    check("a Zapier card takes a Zapier hook only", webhookProblem("zapier", "https://hooks.zapier.com/hooks/catch/1/abc/") === null && webhookProblem("zapier", "https://example.com/x") !== null)
    check("a Make webhook", webhookProblem("make", "https://hook.eu1.make.com/abc") === null && webhookProblem("make", "https://make.com/x") !== null)
    check("Sheets takes an Apps Script web app", webhookProblem("sheets", "https://script.google.com/macros/s/AKfy_123/exec") === null && webhookProblem("sheets", "https://docs.google.com/spreadsheets/d/x") !== null)
    check("never http, an address, localhost or credentials", ["http://example.com/h", "https://127.0.0.1/h", "https://localhost/h", "https://u:p@example.com/h", "https://example.com:8080/h"].every((u) => webhookProblem("webhook", u) !== null))
    const body = JSON.stringify(webhookPayload(pageSignup({ email: "A@b.co", form: "signup" }), "d1"))
    check("signed with HMAC SHA-256 of the body", webhookSignature("s3cret", body) === `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`)
    const payload = webhookPayload(SIGNUP, "d1")
    check("the payload is the signup and where it was made, nothing else", payload.email === "ana@example.com" && payload.first_name === "Ana" && payload.event === "onepage.signup" && Object.keys(payload).length === 12)
    check("an Apps Script's 302 is its answer; a 500 is worth a retry; a 401 is refused", outcomeOf("sheets", 302, null) === "ok" && outcomeOf("zapier", 503, null) === "retry" && outcomeOf("mailchimp", 401, null) === "refused")
    check("Mailchimp's 'in compliance state' (left there) is not an error to fix", outcomeOf("mailchimp", 400, { title: "Member In Compliance State" }) === "ok")
  }

  section("Sending: once each, once more when busy, the result written down")
  {
    const calls: string[] = []
    let busyOnce = true
    const transport: Transport = {
      ask: async (r) => {
        calls.push(`${r.method} ${r.url}`)
        if (r.url.includes("api.kit.com") && busyOnce) {
          busyOnce = false
          return { status: 503, body: null }
        }
        if (r.url.includes("beehiiv")) return { status: 401, body: {} }
        return { status: 200, body: {} }
      },
      post: async (url, body, headers) => {
        calls.push(`POST ${url} ${headers["x-storelib-signature"] === webhookSignature("hooksecret", body) ? "signed" : "unsigned"}`)
        return { status: 200, body: "" }
      },
      wait: async () => {},
    }
    const { db, notes } = fakeDb([
      { id: "r1", creator_id: "c1", provider: "mailchimp", status: "connected", config: { list_id: "a1b2c3" }, secret_ciphertext: sealSecret(MC_KEY) },
      { id: "r2", creator_id: "c1", provider: "kit", status: "connected", config: {}, secret_ciphertext: sealSecret("k".repeat(30)) },
      { id: "r3", creator_id: "c1", provider: "beehiiv", status: "connected", config: { list_id: "pub_00000000-0000-0000-0000-000000000000" }, secret_ciphertext: sealSecret("b".repeat(40)) },
      { id: "r4", creator_id: "c1", provider: "zapier", status: "connected", config: {}, secret_ciphertext: sealSecret(JSON.stringify({ url: "https://hooks.zapier.com/hooks/catch/1/a/", secret: "hooksecret" })) },
      { id: "r5", creator_id: "c1", provider: "nonsense", status: "connected", config: {}, secret_ciphertext: null },
    ])
    const out = await deliverSignup(db, "c1", SIGNUP, transport)
    check("every connected tool, nothing unknown", Object.keys(out).sort().join() === "beehiiv,kit,mailchimp,zapier", JSON.stringify(out))
    check("a busy Kit is asked once more and gets it", out.kit?.ok === true && calls.filter((c) => c.includes("api.kit.com/v4/subscribers")).length === 2)
    check("a refused key is said on the card", out.beehiiv?.ok === false && /beehiiv did not accept the key/.test((out.beehiiv as { error: string }).error))
    check("the webhook is signed with its own secret", calls.some((c) => c.startsWith("POST https://hooks.zapier.com") && c.endsWith("signed") && !c.endsWith("unsigned")))
    check("each result is written in one step (onepage_integration_note)", notes.length === 4 && notes.find((n) => n.p_id === "r3")?.p_ok === false && notes.find((n) => n.p_id === "r1")?.p_ok === true)
    const unsealed = await sendToConnection({ id: "x", creator_id: "c1", provider: "mailchimp", status: "connected", config: { list_id: "a" }, secret_ciphertext: "garbage" }, SIGNUP, transport)
    check("a key that cannot be opened says connect again, and asks nobody", unsealed.ok === false && /connecting again/.test((unsealed as { error: string }).error))
    check("no store, nothing sent", Object.keys(await deliverSignup(db, null, SIGNUP, transport)).length === 0)
    const lists = await listsFor("mailchimp", MC_KEY, async () => ({ status: 200, body: { lists: [{ id: "a1", name: "Main" }] } }))
    check("a key is checked by reading its lists before it is kept", lists.ok === true && lists.lists[0].id === "a1")
    const bad = await listsFor("mailchimp", MC_KEY, async () => ({ status: 401, body: {} }))
    check("  and a refused key is not kept", bad.ok === false)
  }

  section("Every OnePage signup route sends it on, after the answer")
  {
    for (const f of ["app/api/onepage/leads/route.ts", "app/api/onepage/email-capture/route.ts", "app/api/onepage/lead-magnet/route.ts", "app/api/subscribe/route.ts"]) {
      const src = read(f)
      check(`${f}: after(() => deliverSignup(...))`, /after\(\(\) => deliverSignup\(/.test(src) && /from "next\/server"/.test(src))
    }
    const lm = read("app/api/onepage/lead-magnet/route.ts")
    check("the lead magnet reads its block from the published page, by id", /published_blocks/.test(lm) && /publishedBlock\(page\.published_blocks, blockId\)/.test(lm) && /block\.type !== "lead_magnet"/.test(lm))
    check("  the code comes from the creator's own coupons, checked live", /from\("coupons"\)[^\n]*\.eq\("creator_id", creatorId\)/.test(lm) && /couponUsable\(coupon\)/.test(lm))
    check("  same spam checks and limits as the email signup", /signupLooksAutomated\(body\)/.test(lm) && /windows: LIMITS\.subscribe/.test(lm))
    const api = read("app/api/onepage/integrations/route.ts")
    check("the integrations route: the owner only, rate limited", /* Changed on purpose (round 41 team): the store's OnePage integrations for its owner and a team member with OnePage; a key stays the owner's */
/shopCaller\("onepage"\)/.test(api) && /rateLimit\(/.test(api) && /if \(c\.isOwner === false && !memberMayStep\(body\)\)/.test(api))
    const conn = read("lib/onepage/integrations/connect-server.ts")
    check("  a key comes back as its last four characters only", /secretHint\(openSecret\(sealed\)\)/.test(conn) && !/secret_ciphertext:\s*r\.secret_ciphertext/.test(conn) && !/apiKey:\s*key/.test(conn))
    check("  webhooks are sent through the public-only socket lookup", /lookup: publicLookup/.test(read("lib/onepage/integrations/deliver-server.ts")))
    /* Changed on purpose (round 40 team areas): shopCaller("onepage") is the owner as before, or a team member given OnePage for the store's page (tests/team-areas-r40.test.ts). */
    check("followers and the preview fill: the page's owner (or OnePage on the team), and rate limited by address", /shopCaller\("onepage"\)/.test(read("app/api/onepage/followers/route.ts")) && /addressSubject\(request\)/.test(read("app/api/onepage/blocks-live/route.ts")))
  }

  section("The ad pixels ask first")
  {
    const tags = trackingTags({ meta_pixel: "1234567890123456", tiktok_pixel: "C4A1B2C3D4E5F6G7H8I9", pinterest_tag: "2612345678901" }, { asks: true })
    const meta = tags.find((t) => t.key === "meta")?.inline ?? ""
    const tik = tags.find((t) => t.key === "tiktok")?.inline ?? ""
    const pin = tags.find((t) => t.key === "pinterest")?.inline ?? ""
    check("Meta revokes before init when there is no yes, grants on the banner's change", /if\(!__slMkOk\(__slMkAsks\)\)fbq\('consent','revoke'\);fbq\('init',/.test(meta) && /storelib:consent-changed/.test(meta))
    check("TikTok holds before load", /ttq\.holdConsent\(\);ttq\.load\(/.test(tik) && /"holdConsent","revokeConsent","grantConsent"/.test(tik))
    check("Pinterest loads only on a yes", /if\(window\.__slPinOn\|\|!__slMkOk\(__slMkAsks\)\)return/.test(pin))
    let parses = true
    for (const t of tags) {
      try {
        new Function(t.inline ?? "")
      } catch (e) {
        parses = false
        console.log(t.key, e)
      }
    }
    check("every snippet is valid JavaScript", parses)
    /* Run the check itself on a cookie: a yes, a no, no answer in Lisbon and in New York. */
    const run = (cookie: string, zone: string) => {
      const win: Record<string, unknown> = {}
      const f = new Function("window", "document", "Intl", `${marketingConsentJs(true)}; return window.__slMkOk`)(win, { cookie }, { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: zone }) }) }) as (a: boolean) => boolean
      return f(true)
    }
    check("the visitor's yes and no win, wherever they are", run("storelib_consent=2.p1.a1.m1.1", "Europe/Lisbon") === true && run("storelib_consent=2.p1.a1.m0.1", "America/New_York") === false)
    check("no answer: Europe waits, elsewhere sends", run("", "Europe/Lisbon") === false && run("", "America/New_York") === true)
  }

  section("The new blocks: their rules")
  {
    check("five types, each an extra block (kept out of groups and off an empty page)", STORELIB_BLOCK_TYPES.length === 5 && STORELIB_BLOCK_TYPES.every((t) => (EXTRA_BLOCK_TYPES as readonly string[]).includes(t)))
    check("each has a default", STORELIB_BLOCK_TYPES.every((t) => !!createDefaultBlock(t as OnePageBlockType).data))
    check("a shelf takes its kind; all is every product, never a community", shelfTakes("course", "course") && !shelfTakes("course", "digital") && shelfTakes("all", "physical") && !shelfTakes("community", "digital"))
    check("an empty shelf from the server is not drawn; one not asked yet is", storelibBlockHasContent({ type: "storelib_shelf", data: { items: [] } }) === false && storelibBlockHasContent({ type: "storelib_shelf", data: { source: "all" } }) === true)
    check("a lead magnet needs its product or its code; a waitlist is ready", !leadMagnetReady({ kind: "download" }) && leadMagnetReady({ kind: "download", product_id: "p" }) && !leadMagnetReady({ kind: "discount" }) && leadMagnetReady({ kind: "waitlist", title: "x" }))
    check("a coupon is given only while it is on, started, not ended and not used up", couponUsable({ is_active: true }) && !couponUsable({ is_active: false }) && !couponUsable({ expires_at: "2000-01-01T00:00:00Z" }) && !couponUsable({ usage_limit: 3, usage_count: 3 }) && !couponUsable({ starts_at: "2999-01-01T00:00:00Z" }))
    check("a percentage reads as its words; the code is never the label", couponLabel({ discount_type: "percentage", discount_value: "15.00" }) === "15% off")
    check("posts: Instagram, TikTok and YouTube by address, anything else not", socialPost("https://www.instagram.com/reel/Cx1_ab/")?.url === "https://www.instagram.com/reel/Cx1_ab/" && socialPost("https://www.tiktok.com/@ana/video/7234567890123456789")?.kind === "tiktok" && socialPost("https://youtu.be/dQw4w9WgXcQ")?.thumb === "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" && socialPost("https://example.com/p/1") === null)
    check("  each once, at most twelve", pastedPosts({ network: "youtube", post_urls: [...Array(20)].map(() => "https://youtu.be/dQw4w9WgXcQ") }).length === 1)
    check("a channel: its id, a /@handle or a bare @handle", youtubeChannel("https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw")?.kind === "id" && youtubeChannel("youtube.com/@mkbhd")?.kind === "handle" && youtubeChannel("@mkbhd")?.kind === "handle" && youtubeChannel("https://vimeo.com/x") === null)
    check("  its public feed", youtubeFeedUrl("UCuAXFkgsw1L7xaCfnd5JJOw") === "https://www.youtube.com/feeds/videos.xml?channel_id=UCuAXFkgsw1L7xaCfnd5JJOw" && youtubeFeedUrl("x") === null)
    const feed = `<feed><entry><yt:videoId>dQw4w9WgXcQ</yt:videoId><title>One &amp; two</title></entry><entry><yt:videoId>aaaaaaaaaaa</yt:videoId><title>B</title></entry></feed>`
    const vids = parseYouTubeFeed(feed, 12)
    check("  the feed read newest first, titles decoded", vids.length === 2 && vids[0].title === "One & two" && vids[0].id === "dQw4w9WgXcQ")
    check("  a handle's channel id from its page", channelIdFromPage(`..."externalId":"UCuAXFkgsw1L7xaCfnd5JJOw"...`) === "UCuAXFkgsw1L7xaCfnd5JJOw")
    check("followers: counts as typed", parseCount("12.5k") === 12500 && parseCount("1,204") === 1204 && parseCount("2M") === 2000000 && parseCount("lots") === null)
    check("  summed once per network", followerTotal([{ network: "instagram", count: 1000 }, { network: "instagram", count: 5 }, { network: "tiktok", count: 250 }, { network: "youtube", count: null }]) === 1250)
    check("  said like Link.me", compactCount(950) === "950" && compactCount(12500) === "12.5K" && compactCount(1_250_000) === "1.2M" && compactCount(25_400) === "25.4K" && compactCount(250_400) === "250K")
    check("  a Bluesky handle from a profile link", blueskyHandle("https://bsky.app/profile/ana.bsky.social") === "ana.bsky.social" && blueskyHandle("not a handle") === null)
    check("a code: letters and numbers, no spaces", promoCode("ANNA15") === "ANNA15" && promoCode("two words") === null)
    check("what the server read is never saved, in a group or not", JSON.stringify(stripResolved([{ type: "storelib_shelf", data: { source: "all", items: [1] } }, { type: "group", data: { children: [{ type: "social_posts", data: { items: [1], network: "youtube" } }] } }])) === JSON.stringify([{ type: "storelib_shelf", data: { source: "all" } }, { type: "group", data: { children: [{ type: "social_posts", data: { network: "youtube" } }] } }]))
    check("an empty follower block is not on the page", !isBlockShown({ type: "followers", enabled: true, data: { networks: [] } }) && isBlockShown({ type: "followers", enabled: true, data: { networks: [{ network: "tiktok", count: 5 }] } }))
    check("a dark page asks X for its dark look", isDarkColor("#0b0b0f") && !isDarkColor("#f4efe9") && /isDarkColor\(look\.theme\.background_color\) \? `\$\{base\}&theme=dark`/.test(read("components/onepage/creator-blocks.tsx")))
  }

  section("Registered wherever a block type is listed")
  {
    const page = read("components/onepage/public-onepage.tsx")
    /* Changed on purpose (round 41): the look also says whether the block is in a group or a carousel (its buttons keep still there). */
    check("the live page draws any extra block it has no case for, with the page's id", /return isExtraBlock\(block\) \? <ExtraBlock block=\{block\} look=\{\{ theme, scale: "live", sellerId, onepageId, still: isInsideCarousel \|\| isInsideGroup \}\} \/> : null/.test(page))
    const tab = read("components/onepage/tabs/links-tab.tsx")
    check("the editor's rows and settings do too", (tab.match(/isExtraBlock\(block\) \? extraBlockRow\(block\)/g) ?? []).length === 2 && /if \(isExtraBlock\(block\)\) return <ExtraBlockEditor/.test(tab))
    check("the live page fills shelves, posts and counts on the server", /withStorelibBlocks\(db, creatorId, products\)/.test(read("lib/onepage/published-page.ts")))
    check("a saved draft never keeps them", /updates\.draft_blocks = stripResolved\(draft_blocks\)/.test(read("app/api/onepage/route.ts")))
    const picker = read("components/onepage/add-block-picker.tsx")
    check("Tally, Klaviyo and Omnisend wear their own marks", /"int_tally"[^\n]*"tally"\)/.test(picker) && /id: "int_email"[^\n]*mark: "klaviyo"/.test(picker) && /id: "int_omnisend"[^\n]*mark: "omnisend"/.test(picker))
    check("every tool is a block", PAGE_INTEGRATIONS.every((p) => new RegExp(`tool\\("int_${p}"`).test(picker)))
    check("every new block can be added", STORELIB_BLOCK_TYPES.every((t) => picker.includes(`type: "${t}"`)))
    check("the owner's list: products of each kind, courses, membership, community, sessions, lead magnets, referral", ["shelf_digital", "shelf_physical", "shelf_course", "shelf_membership", "shelf_community", "session_one", "session_bundle", "magnet_download", "magnet_discount", "magnet_waitlist", "referral", "followers"].every((id) => picker.includes(`id: "${id}"`)))
    const icons = read("components/onepage/brand-icons.tsx")
    check("the marks exist for each tool", ["tally", "klaviyo", "omnisend", "beehiiv", "mailchimp", "kit", "sheets", "zapier", "make", "webhook"].every((k) => new RegExp(`\\n  ${k}: \\{`).test(icons)))
  }

  section("Embeds: the post's own width, no jump")
  {
    check("X and Instagram are as wide as their cards, not the page", EMBED_MAX_WIDTH.x === 550 && EMBED_MAX_WIDTH.instagram === 540)
    /* Changed on purpose (round 42): any growth is taken (a frame a pixel short of its document scrolls it); only a small shrink is settled. */
    check("the first height is taken; a settling shrink is not, a growth always is", nextEmbedHeight(420, 610, true) === 610 && nextEmbedHeight(612, 610, false) === 612 && nextEmbedHeight(610, 612, false) === 612 && nextEmbedHeight(620, 620 - EMBED_SETTLE_PX - 1, false) === 615)
    const frame = read("components/onepage/embed-frame.tsx")
    check("no fill of its own behind the post, hidden until it is measured", !/bg-black\/\[0\.04\]/.test(frame) && /opacity: shown \? 1 : 0/.test(frame) && /loading="lazy"/.test(frame))
    check("the embed block uses it", /<EmbedFrame src=\{src\}/.test(read("components/onepage/creator-blocks.tsx")))
  }

  section("SQL parts 315 and 316")
  {
    for (const [part, name] of [["315", "onepage_integrations"], ["316", "onepage_lead_magnets"]]) {
      const a = read(`supabase/sql/run-now/${part}_${name}.sql`)
      check(`${part}: its migration is byte for byte the same`, a === read(`supabase/migrations/20271028_${name}.sql`))
      check(`${part}: in the README and the check`, read("supabase/sql/run-now/README.md").includes(`\`${part}_${name}.sql\``) && read("supabase/sql/run-now/99_check_after.sql").includes(`as p${part}_${name}`))
    }
    const sql = read("supabase/sql/run-now/315_onepage_integrations.sql")
    check("315: row level security on, nothing for anon or authenticated, one row per tool", /ENABLE ROW LEVEL SECURITY/.test(sql) && /REVOKE ALL ON public\.onepage_integrations FROM PUBLIC, anon, authenticated/.test(sql) && /UNIQUE \(creator_id, provider\)/.test(sql))
    check("315: the count function runs for the service role only", /REVOKE ALL ON FUNCTION public\.onepage_integration_note\(uuid, boolean, text\) FROM PUBLIC, anon, authenticated/.test(sql) && /SET search_path = public/.test(sql))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main().catch((e) => { console.error(e); process.exit(1) })
