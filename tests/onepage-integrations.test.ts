/**
 * ===========================================================================
 *  EVERY INTEGRATION ON THE ONEPAGE, BY ITS OWN PATH (the integrations audit)
 * ===========================================================================
 * tests/onepage-integrations-r41.test.ts holds each email tool's exact
 * request and the webhook's signature. This suite holds what the audit
 * found missing or broken around them, each through the code the live page
 * runs:
 *
 *   PIXELS      the live OnePage carries the store's tags and the editor's
 *               preview does not; the Meta tag run twice loads fbevents.js
 *               once and says PageView once; with no yes in Europe it waits.
 *   LEADS       every form on the page (signup, lead magnet, subscribe, RSVP,
 *               contact) tells the pixels a Lead, and sends the same id to
 *               the server, so the server's own Lead is the same lead.
 *   FORWARDED   a OnePage contact form's ticked box reaches the connected
 *               tools (Mailchimp's member, the signed webhook) like a signup.
 *   EMBEDS      YouTube (watch, youtu.be, shorts, live, embed, m.), TikTok
 *               (a video, a vm.tiktok.com link through oEmbed), Spotify
 *               (episodes, shows, intl), SoundCloud, and a booking page that
 *               refuses a frame opening in its own tab.
 *   HOSTS       storelib.me answers Google's "seen" beacon; the app's WebView
 *               frame list takes every player the page draws, and still
 *               refuses Stripe's controller frame.
 *   CACHE       a pixel saved expires the CDN's copy of the OnePage.
 *
 * Run: npm run test:push (registered in scripts/run-push-tests.mjs)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createHmac } from "node:crypto"
import { trackingTags } from "@/lib/store/tracking"
import { newLeadEventId, pixelLead } from "@/lib/analytics/pixels"
import { deliverSignup, pageSignup, type Transport } from "@/lib/onepage/integrations/deliver-server"
import { emailHashMd5, type ProviderRequest } from "@/lib/onepage/integrations/providers"
import { sealSecret } from "@/lib/physical/secrets"
import { youtubeIdFrom } from "@/lib/blog/embed"
import { bookingSource, musicSource, tiktokPlayerUrl, tiktokVideoIdFrom } from "@/lib/onepage/creator-blocks"
import { socialPresentation } from "@/lib/onepage/block-presentation"
import { onePageRoute } from "@/lib/onepage/host-route"
import { CONTENT_SECURITY_POLICY, NATIVE_FRAME_POLICY, NATIVE_FRAME_SRC } from "@/lib/security/csp"

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key-for-sealing"

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
    console.log(`  FAIL  ${name}${detail ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** A window and document just big enough for a tag's own snippet: what it inserts, and what it is told. */
function fakePage(cookie = "", timeZone = "America/New_York") {
  const inserted: string[] = []
  const listeners: Record<string, (() => void)[]> = {}
  const first = { parentNode: { insertBefore: (el: { src: string }) => void inserted.push(el.src) } }
  const document = {
    cookie,
    createElement: () => ({ src: "", async: false }),
    getElementsByTagName: () => [first],
  }
  const win: Record<string, unknown> = {
    addEventListener: (n: string, f: () => void) => void (listeners[n] ||= []).push(f),
  }
  const run = (code: string) => {
    const intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) }
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function("window", "document", "Intl", `with (window) { ${code} }`)(win, document, intl)
  }
  return { win, inserted, run }
}

type FbqStub = { queue: unknown[][] }

async function main() {
  section("Pixels: the live OnePage carries the store's tags, the editor's preview never does")
  {
    const live = read("app/(storelib)/(marketing)/l/[slug]/page.tsx")
    check("the live page (storelib.me/<name>, <domain>/links, /<name>/links) draws StoreTracking for its store", /\{resolvedCreatorId && <StoreTracking creatorId=\{resolvedCreatorId\} \/>\}/.test(live))
    check("  /<name>/links is that same route", /PublicOnePageRoute\(\{ params: asSlug\(params\), searchParams \}\)/.test(read("app/(storelib)/(marketing)/[sellername]/links/page.tsx")))
    check("the editor's preview (/onepage-preview) draws no tag", !/StoreTracking|trackingTags/.test(read("components/onepage/preview-document.tsx")) && !/StoreTracking/.test(read("app/(storelib)/onepage-preview/page.tsx")))

    const tags = trackingTags({ meta_pixel: "1234567890123456", tiktok_pixel: "C4A1B2C3D4E5F6G7H8I9", ga4: "G-1A2B3C4D5E" }, { asks: true, creatorId: "0b6a1c1e-2f3d-4e5a-8b9c-0d1e2f3a4b5c" })
    const meta = tags.find((t) => t.key === "meta")?.inline ?? ""
    const page = fakePage()
    page.run(meta)
    page.run(meta)
    const fbq = page.win.fbq as unknown as FbqStub
    const said = (fbq?.queue ?? []).map((a) => Array.from(a as unknown as ArrayLike<unknown>))
    check("Meta: fbevents.js loaded once, however many times the tag runs", page.inserted.filter((s) => s === "https://connect.facebook.net/en_US/fbevents.js").length === 1, page.inserted)
    check("  init with the pixel, then one PageView", JSON.stringify(said) === JSON.stringify([["init", "1234567890123456"], ["track", "PageView"]]), said)

    const eu = fakePage("", "Europe/Berlin")
    eu.run(meta)
    const euSaid = ((eu.win.fbq as unknown as FbqStub).queue ?? []).map((a) => Array.from(a as unknown as ArrayLike<unknown>))
    check("  a visitor in Europe with no answer yet: consent revoked before init (Meta holds it)", JSON.stringify(euSaid[0]) === JSON.stringify(["consent", "revoke"]), euSaid)
    const yes = fakePage("storelib_consent=2.p1.a1.m1", "Europe/Berlin")
    yes.run(meta)
    const yesSaid = ((yes.win.fbq as unknown as FbqStub).queue ?? []).map((a) => Array.from(a as unknown as ArrayLike<unknown>))
    check("  the same visitor after a yes on the banner: no revoke", !yesSaid.some((a) => a[0] === "consent"), yesSaid)

    const tiktok = tags.find((t) => t.key === "tiktok")?.inline ?? ""
    const tp = fakePage()
    tp.run(tiktok)
    tp.run(tiktok)
    check("TikTok: run twice, loaded once and one page view", tp.inserted.length === 1 && (tp.win.ttq as unknown[]).filter((a) => JSON.stringify(a) === '["page"]').length === 1, tp.inserted)
    check("each store's tags are named by every ID they carry, so another store's pixel runs after a move between their pages", /\$\{t\.meta_pixel \?\? ""\}\$\{t\.tiktok_pixel \?\? ""\}/.test(read("components/website-builder/store-tracking.tsx")))
    check("TikTok: events.js with the pixel's sdkid, and its page view queued", tp.inserted.some((s) => s === "https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=C4A1B2C3D4E5F6G7H8I9&lib=ttq") && JSON.stringify((tp.win.ttq as unknown[]).map((a) => a)).includes('["page"]'), tp.inserted)
    const gtag = tags.find((t) => t.key === "gtag")?.inline ?? ""
    check("GA4: never in a frame, and it tells Storelib when Google took a hit (Settings shows Receiving data)", /if\(window\.self!==window\.top\)return/.test(gtag) && /\/api\/store\/ga-seen/.test(gtag))
  }

  section("Leads: every form on the page tells the pixels, with the id it sends to the server")
  {
    const id = newLeadEventId()
    check("a lead id is one the pixels and the server both take", /^[A-Za-z0-9_-]{1,64}$/.test(id) && pageSignup({ email: "a@b.co", form: "contact", eventId: id }).eventId === id, id)
    check("  two leads are two ids", newLeadEventId() !== newLeadEventId())
    check("  an id of the wrong shape never reaches the server's event", pageSignup({ email: "a@b.co", form: "contact", eventId: "<script>" }).eventId === undefined)
    const calls: unknown[][] = []
    const win = { fbq: (...a: unknown[]) => calls.push(["fbq", ...a]), ttq: { track: (...a: unknown[]) => calls.push(["ttq", ...a]) }, gtag: (...a: unknown[]) => calls.push(["gtag", ...a]) } as unknown as Window
    pixelLead(win, { form: "rsvp", eventId: id })
    check("an RSVP is Meta's Lead, TikTok's SubmitForm and GA4's generate_lead by one id", JSON.stringify(calls) === JSON.stringify([["gtag", "event", "generate_lead", { lead_source: "rsvp", event_id: id }], ["fbq", "track", "Lead", { content_name: "rsvp" }, { eventID: id }], ["ttq", "SubmitForm", { content_name: "rsvp" }, { event_id: id }]]), calls)

    const forms: [string, string, RegExp, RegExp][] = [
      ["the subscribe sheet", "components/onepage/subscribe-sheet.tsx", /event_id: leadId/, /pixelLead\(window, \{ form: "subscribe", eventId: leadId \}\)/],
      ["a lead magnet (code, waitlist, free download)", "components/onepage/storelib-blocks.tsx", /event_id: leadId/, /pixelLead\(window, \{ form: "lead_magnet", eventId: typeof out\.lead_id === "string" \? out\.lead_id : leadId \}\)/],
      ["an event's RSVP", "components/onepage/data-blocks.tsx", /event_id: leadId/, /pixelLead\(window, \{ form: "rsvp", eventId: leadId \}\)/],
      ["the contact form", "components/onepage/creator-blocks.tsx", /eventId: leadId,/, /pixelLead\(window, \{ form: "contact", eventId: leadId \}\)/],
    ]
    for (const [name, file, sends, tells] of forms) {
      const src = read(file)
      check(`${name}: sends the id and tells the pixels the same one`, sends.test(src) && tells.test(src) && /const leadId = newLeadEventId\(\)/.test(src))
    }
    check("  the contact form's id goes in its body", /\.\.\.\(input\.eventId \? \{ event_id: input\.eventId \} : \{\}\)/.test(read("lib/website-builder/contact-client.ts")))
    check("the email signup keeps the server's own lead id (app/api/onepage/leads)", /pixelLead\(window, \{ form: "signup", eventId: typeof result\?\.lead_id === "string" \? result\.lead_id : null \}\)/.test(read("components/onepage/public-onepage.tsx")) && /eventId: sentLead\.id/.test(read("app/api/onepage/leads/route.ts")))
    const routes: [string, string][] = [
      ["/api/subscribe (both its subscribe and its join again)", "app/api/subscribe/route.ts"],
      ["/api/onepage/rsvp", "app/api/onepage/rsvp/route.ts"],
      ["/api/onepage/lead-magnet", "app/api/onepage/lead-magnet/route.ts"],
      ["/api/onepage/email-capture", "app/api/onepage/email-capture/route.ts"],
    ]
    for (const [name, file] of routes) {
      const src = read(file)
      const n = (src.match(/eventId: typeof body\.event_id === "string" \? body\.event_id : null/g) ?? []).length
      check(`${name}: the server's lead carries the page's id`, n === (file.includes("subscribe") ? 2 : 1), n)
    }
  }

  section("Forwarded: a OnePage contact form's ticked box reaches the creator's tools")
  {
    const contact = read("app/api/website-builder/contact/route.ts")
    check("the contact route sends a OnePage's new subscriber to deliverSignup, as form contact, with the page's id", /if \(msg\.page === "onepage"\) \{[\s\S]*?deliverSignup\(db, msg\.creatorId, pageSignup\(\{ email: msg\.email, name: msg\.name \|\| null, form: "contact", pageUrl, eventId \}\)\)/.test(contact))
    check("  only from the welcome step, which runs only for a sender who ticked the box and was not on the list", /if \(sender\.outcome === "subscribed"\) \{\s*try \{\s*await deps\.welcome\(msg, where\.detail\)/.test(read("lib/site-contact/handle.ts")) && /welcome: async \(msg, source\) => \{[\s\S]*msg\.page === "onepage"/.test(contact))

    /* The same signup, through the real sender, with a fake transport: what Mailchimp and a webhook receive. */
    const signup = pageSignup({ email: "Ana@Example.com", name: "Ana Maria", form: "contact", pageUrl: "https://storelib.me/ana", eventId: "lead-abc123" })
    const sent: ProviderRequest[] = []
    const posts: { url: string; body: string; headers: Record<string, string> }[] = []
    const transport: Transport = {
      ask: async (r) => (sent.push(r), { status: 200, body: {} }),
      post: async (url, body, headers) => (posts.push({ url, body, headers }), { status: 200, body: "" }),
      wait: async () => {},
    }
    const MC = "0123456789abcdef0123456789abcdef-us21"
    const rows = [
      { id: "r1", creator_id: "c1", provider: "mailchimp", status: "connected", config: { list_id: "abc123" }, secret_ciphertext: sealSecret(MC) },
      { id: "r2", creator_id: "c1", provider: "webhook", status: "connected", config: {}, secret_ciphertext: sealSecret(JSON.stringify({ url: "https://example.com/hook", secret: "s3cret" })) },
    ]
    const q = { select: () => q, eq: () => q, in: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(r) }
    const db = { from: (t: string) => (t === "onepage_integration_sends" ? { insert: async () => ({ error: { code: "42P01" } }) } : q), rpc: async () => ({ data: null, error: null }) }
    const out = await deliverSignup(db, "c1", signup, transport, async () => 0)
    check("both connected tools took it", out.mailchimp?.ok === true && out.webhook?.ok === true, out)
    check("  Mailchimp: the member PUT by the address's hash, subscribed, with the first name", sent[0]?.method === "PUT" && sent[0]?.url === `https://us21.api.mailchimp.com/3.0/lists/abc123/members/${emailHashMd5("ana@example.com")}?skip_merge_validation=true` && JSON.stringify(JSON.parse(sent[0]?.body ?? "null")) === JSON.stringify({ email_address: "ana@example.com", status_if_new: "subscribed", merge_fields: { FNAME: "Ana" } }), sent[0])
    const hook = posts[0]
    const payload = JSON.parse(hook?.body ?? "{}")
    check("  the webhook: form contact, signed with its secret", payload.event === "onepage.signup" && payload.form === "contact" && payload.email === "ana@example.com" && hook.headers["x-storelib-signature"] === `sha256=${createHmac("sha256", "s3cret").update(hook.body).digest("hex")}`, payload)
    check("  the pixel's id stays out of what the email tools and the hook receive", !hook.body.includes("lead-abc123") && !sent.some((r) => (r.body ?? "").includes("lead-abc123")))
  }

  section("Embeds: the shapes people paste")
  {
    const yt: [string, string | null][] = [
      ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
      ["https://youtu.be/dQw4w9WgXcQ?si=AbCdEf", "dQw4w9WgXcQ"],
      ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://youtube.com/live/dQw4w9WgXcQ?feature=share", "dQw4w9WgXcQ"],
      ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL0123456789", "dQw4w9WgXcQ"],
      ["https://www.youtube.com/playlist?list=PL0123456789", null],
      ["https://www.youtube.com/watch?v=dQw4w9WgXcQ/../../x", null],
      ["https://example.com/watch?v=dQw4w9WgXcQ", null],
    ]
    for (const [u, id] of yt) check(`YouTube ${u} -> ${id}`, youtubeIdFrom(u) === id, youtubeIdFrom(u))
    const page = read("components/onepage/public-onepage.tsx")
    check("the live page's featured link reads its video by that parser, only for a YouTube address", /const youtubeVideoId = \/youtu\/i\.test\(data\.url \|\| ""\) \? youtubeIdFrom\(data\.url\) : null/.test(page) && !/url\.includes\('youtube\.com\/watch'\)/.test(page))
    check("  a saved latest video id of the wrong shape is never put in the player's address", /data\.youtube_latest_video_id && \/\^\[A-Za-z0-9_-\]\{11\}\$\/\.test\(data\.youtube_latest_video_id\)/.test(page))
    check("a Short pasted as a link is drawn by YouTube's player", socialPresentation("https://youtube.com/shorts/dQw4w9WgXcQ")?.embed === "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")

    /* TikTok's own oEmbed answer for a video (developers.tiktok.com/doc/embed-videos), as a vm.tiktok.com link gets it. */
    const oembed = '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@scout2015/video/6718335390845095173" data-video-id="6718335390845095173" style="max-width: 605px;min-width: 325px;" > <section> <a target="_blank" title="@scout2015" href="https://www.tiktok.com/@scout2015">@scout2015</a> </section> </blockquote> <script async src="https://www.tiktok.com/embed.js"></script>'
    check("TikTok: a video's own address", tiktokVideoIdFrom("https://www.tiktok.com/@scout2015/video/6718335390845095173?is_from_webapp=1") === "6718335390845095173")
    check("  a vm.tiktok.com link: the id oEmbed names", tiktokVideoIdFrom("https://vm.tiktok.com/ZMabc123/", oembed) === "6718335390845095173")
    check("  oEmbed's cite when there is no data-video-id", tiktokVideoIdFrom("https://vm.tiktok.com/ZMabc123/", oembed.replace(/ data-video-id="\d+"/, "")) === "6718335390845095173")
    check("  never embed.js: no id, no player", tiktokVideoIdFrom("https://vm.tiktok.com/ZMabc123/", '<script async src="https://www.tiktok.com/embed.js"></script>') === null)
    check("  the player for it is TikTok's 9:16 player", tiktokPlayerUrl("6718335390845095173", false) === "https://www.tiktok.com/player/v1/6718335390845095173?autoplay=0&rel=0&music_info=0&description=0")
    const route = read("app/api/onepage/tiktok/route.ts")
    check("  the lookup answers the id and the player, never the first src in the answer", /videoId: tiktokInfo\.videoId \?\? tiktokVideoIdFrom\(url, embedHtml\)/.test(route) && /if \(id\) embedUrl = tiktokPlayerUrl\(id, false\)/.test(route) && !/srcMatch/.test(route))
    check("  the editor keeps that id for a short link", /typeof tiktokData\.videoId === "string" && \/\^\\d\{10,25\}\$\/\.test\(tiktokData\.videoId\) \? tiktokData\.videoId : null/.test(read("components/onepage/tabs/links-tab.tsx")))
    check("  and the page plays a kept id of the right shape only", /typeof data\.tiktok_video_id === "string" && \/\^\\d\{10,25\}\$\/\.test\(data\.tiktok_video_id\)/.test(page))

    const music: [string, string | null][] = [
      ["https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk?si=abc", "https://open.spotify.com/embed/episode/4rOoJ6Egrf8K2IrywzwOMk?utm_source=storelib"],
      ["https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL", "https://open.spotify.com/embed/show/2MAi0BvDc6GTFvKFPXnkCL?utm_source=storelib"],
      ["https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT", "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=storelib"],
      ["open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=storelib"],
    ]
    for (const [u, embed] of music) check(`Spotify ${u}`, musicSource(u)?.embedUrl === embed, musicSource(u))
    check("SoundCloud: a track, a set, and an on.soundcloud.com short link", !!musicSource("https://soundcloud.com/artist/track")?.embedUrl.startsWith("https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Ftrack") && musicSource("https://soundcloud.com/artist/sets/list")?.height === 352 && !!musicSource("https://on.soundcloud.com/AbC12")?.embedUrl.includes("on.soundcloud.com"))

    check("Booking: Calendly and Cal.com are framed pages", bookingSource("calendly.com/ana/30min")?.kind === "calendly" && bookingSource("https://cal.com/ana")?.kind === "calcom")
    check("  any other booking page is not (it refuses a frame)", bookingSource("https://tidycal.com/ana/30") === null && bookingSource("https://zoom.us/meeting/schedule") === null)
    check("  the booking block opens any other page in its own tab, never a blank sheet or block", /const bookingFramable = !!bookingSource\(data\.calendly_url\)/.test(page) && /interaction === "direct" \|\| !blockSheet\.available \|\| !bookingFramable/.test(page) && /const isInlineEmbed = interaction === "inline" && bookingFramable && calendlyUrl/.test(page))
  }

  section("Hosts: storelib.me and the app's WebView")
  {
    const onMe = (path: string, method = "POST") => onePageRoute({ host: "storelib.me", pathname: path, search: "", method, userAgent: "Mozilla/5.0", mainDomain: "storelib.com", platformSubdomains: ["www", "app", "api"] })?.kind
    check("Google's seen beacon answers on storelib.me (it was a 404, so Receiving data never came from the OnePage)", onMe("/api/store/ga-seen") === "next")
    check("  only by POST", onMe("/api/store/ga-seen", "GET") === "not-found")
    for (const p of ["/api/subscribe", "/api/onepage/leads", "/api/onepage/rsvp", "/api/onepage/lead-magnet", "/api/onepage/email-capture", "/api/website-builder/contact", "/api/track-view"]) check(`  every form and count on the page answers there: ${p}`, onMe(p) === "next")

    const frameSrc = CONTENT_SECURITY_POLICY.match(/frame-src ([^;]*)/)?.[1].split(" ") ?? []
    const drawn = [
      "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://open.spotify.com", "https://w.soundcloud.com", "https://embed.music.apple.com",
      "https://www.tiktok.com", "https://calendly.com", "https://cal.com", "https://www.instagram.com", "https://platform.twitter.com", "https://player.vimeo.com",
    ]
    check("every player the OnePage draws is in the site's frame-src", drawn.every((h) => frameSrc.includes(h)), drawn.filter((h) => !frameSrc.includes(h)))
    check("the app's WebView frame list takes every one of them too (it stopped at Stripe, YouTube nocookie, Vimeo and Loom)", drawn.every((h) => NATIVE_FRAME_SRC.includes(h)), drawn.filter((h) => !NATIVE_FRAME_SRC.includes(h)))
    check("  and still refuses Stripe's controller frame: js.stripe.com only by its four frame patterns", !NATIVE_FRAME_SRC.includes("https://js.stripe.com") && ["elements-*", "payment-request-*", "three-ds-*", "link-*"].every((p) => NATIVE_FRAME_SRC.includes(`https://js.stripe.com/v3/${p}`)) && NATIVE_FRAME_SRC.includes("https://hooks.stripe.com") && NATIVE_FRAME_SRC.includes("https://connect-js.stripe.com"))
    check("  one directive, and the proxy sends exactly it for the app", /^frame-src 'self' /.test(NATIVE_FRAME_POLICY) && !NATIVE_FRAME_POLICY.includes(";") && /supabaseResponse\.headers\.set\("Content-Security-Policy", NATIVE_FRAME_POLICY\)/.test(read("proxy.ts")))
  }

  section("Cache: a pixel saved reaches the OnePage's next visitor")
  {
    const route = read("app/api/store/integrations/route.ts")
    check("Settings › Integrations expires the CDN's copy of the store's OnePage after a save", /if \(!out\.ok\) return[^\n]*\n[\s\S]*?await onePageProductsChanged\(c\.creatorId\)\.catch\(\(\) => undefined\)/.test(route))
    check("  which expires storelib.me/<name> by its CDN tag", /expire\(onePageCdnTag\(name\)\)/.test(read("lib/onepage/public-cache.ts")))
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
