/**
 * ===========================================================================
 *  THE ONEPAGE'S COURSE, MUSIC, TESTIMONIALS AND CONTACT BLOCKS, THE ADD
 *  BLOCK SHEET, AND THE EMAIL SIGNUP (round 10)
 * ===========================================================================
 * The rules (lib/onepage/creator-blocks.ts), the drawing the preview and the
 * live page share (components/onepage/creator-blocks.tsx through
 * ExtraBlock), the course read live from its product (lib/onepage/
 * live-products), the Add block catalogue (components/onepage/
 * add-block-picker.tsx), and the email signup's name, link and spam checks
 * (app/api/onepage/leads). scripts/check-onepage-blocks.mjs measures them in
 * a browser.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  CREATOR_BLOCK_TYPES,
  SIGNUP_MIN_ELAPSED_MS,
  bookingProviderName,
  bookingSource,
  cleanTestimonials,
  contactInputError,
  courseHref,
  creatorBlockHasContent,
  lessonsLabel,
  musicSource,
  signupLooksAutomated,
  signupName,
} from "@/lib/onepage/creator-blocks"
import { EXTRA_BLOCK_TYPES, isBlockShown } from "@/lib/onepage/extra-blocks"
import { lessonCounts, productIdsInBlocks, resolveProductBlocks, type ProductsDb } from "@/lib/onepage/live-products"
import { createDefaultBlock, type OnePageBlock, type OnePageTheme } from "@/lib/onepage/types"
import { ExtraBlock } from "@/components/onepage/extra-blocks"
import { PICKER_CATEGORIES, PICKER_ENTRIES, searchEntries } from "@/components/onepage/add-block-picker"
import { CONTENT_SECURITY_POLICY } from "@/lib/security/csp"

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

const theme = {
  template_id: "t", background_type: "solid", background_color: "#f4efe9", text_color: "#1a1a2e",
  button_style: "filled", button_color: "#1a1a2e", button_text_color: "#ffffff", button_border_radius: 14,
  button_border_width: 0, button_border_color: "#000000", font_family: "Inter",
} as unknown as OnePageTheme
const b = (type: string, data: unknown): OnePageBlock => ({ id: type, type, enabled: true, sort_order: 0, data }) as OnePageBlock
const html = (block: OnePageBlock, sellerId: string | null = "0b1c2d3e-0000-4000-8000-000000000001") =>
  renderToStaticMarkup(React.createElement(ExtraBlock, { block, look: { theme, scale: "live", sellerId } }))

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("A music link plays in its provider's own player, and nothing else does")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const track = musicSource("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc")
    check("a Spotify track, short", track?.kind === "spotify" && track.embedUrl.startsWith("https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT") && track.height === 152, JSON.stringify(track))
    const list = musicSource("open.spotify.com/intl-de/playlist/37i9dQZF1DXcBWIGoYBM5M")
    check("a playlist, with a country in the path and no https, tall", list?.embedUrl === "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=storelib" && list.height === 352, JSON.stringify(list))
    const sc = musicSource("https://soundcloud.com/forss/flickermood")
    check("a SoundCloud track, in w.soundcloud.com's player", sc?.kind === "soundcloud" && sc.embedUrl.startsWith("https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fforss%2Fflickermood") && sc.height === 166)
    check("a SoundCloud set is tall", musicSource("https://soundcloud.com/forss/sets/soulhack")?.height === 352)
    const apple = musicSource("https://music.apple.com/us/album/1989/1440935467?i=1440935808")
    check("an Apple Music song, on embed.music.apple.com", apple?.kind === "apple" && apple.embedUrl === "https://embed.music.apple.com/us/album/1989/1440935467?i=1440935808" && apple.height === 175)
    check("a profile, a home page, another site or nothing is not music",
      musicSource("https://open.spotify.com/user/abc") === null && musicSource("https://soundcloud.com/forss") === null &&
      musicSource("https://music.apple.com/us/browse") === null && musicSource("https://youtube.com/watch?v=x") === null &&
      musicSource("javascript:alert(1)") === null && musicSource("") === null && musicSource(null) === null)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A coaching call opens a Calendly or a Cal.com page, nothing else")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("Calendly", bookingSource("calendly.com/maker/30min")?.url === "https://calendly.com/maker/30min" && bookingProviderName("https://calendly.com/maker") === "Calendly")
    check("Cal.com, app.cal.com and cal.eu", bookingSource("https://cal.com/maker/15min")?.kind === "calcom" && bookingSource("https://app.cal.com/maker")?.kind === "calcom" && bookingSource("https://cal.eu/maker")?.kind === "calcom" && bookingProviderName("https://cal.com/maker") === "Cal.com")
    check("an http link is made https", bookingSource("http://calendly.com/maker")?.url === "https://calendly.com/maker")
    check("a bare host, another site or a script is not a booking page",
      bookingSource("https://calendly.com") === null && bookingSource("https://evil.example/calendly.com/x") === null && bookingSource("javascript:alert(1)") === null && bookingProviderName("") === null)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A course block, a testimonial and a contact message are checked")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a course opens its own page, and only by a clean slug", courseHref({ course_slug: "learn-beats" }) === "/p/learn-beats" && courseHref({ course_slug: "../admin" }) === null && courseHref({ course_slug: "" }) === null)
    check("a lesson count is a positive whole number or nothing", lessonsLabel(12)?.count === 12 && lessonsLabel(0) === null && lessonsLabel(null) === null && lessonsLabel(Number.NaN) === null)
    const items = cleanTestimonials([
      { id: "a", quote: "  Changed how I mix.  ", name: " Ana ", detail: "Bought the course", rating: 5 },
      { id: "b", quote: "", name: "Empty" },
      { id: "c", quote: "No name", name: "  " },
      { id: "d", quote: "x".repeat(900), name: "Long", rating: 9 },
    ] as never)
    check("a testimonial needs words and a name; both are trimmed", items.length === 2 && items[0].quote === "Changed how I mix." && items[0].name === "Ana")
    check("a quote is cut to 400 characters and a rating outside 1 to 5 is dropped", items[1].quote.length === 400 && items[1].rating === null)
    check("at most twelve", cleanTestimonials(Array.from({ length: 20 }, (_, i) => ({ id: String(i), quote: "q", name: "n" })) as never).length === 12)
    check("a message needs a real address and words", contactInputError({ email: "ana@example", message: "hi" }) === "email" && contactInputError({ email: "ana@example.com", message: "  " }) === "message" && contactInputError({ email: "ana@example.com", message: "Hi" }) === null)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A new block starts sensibly, and an empty one leaves no gap")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("the four are among the newer blocks, kept out of a group by the same list", CREATOR_BLOCK_TYPES.every((t) => (EXTRA_BLOCK_TYPES as readonly string[]).includes(t)))
    const on = (block: OnePageBlock) => isBlockShown(block)
    check("a new course with no course picked is not on the page", !on(createDefaultBlock("course")) && on(b("course", { product_id: "p1", course_title: "Beats" })))
    check("a new music block with no link is not on the page", !on(createDefaultBlock("music")) && on(b("music", { url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT" })))
    check("a new testimonials block waits for a quote and a name", !on(createDefaultBlock("testimonials")) && on(b("testimonials", { items: [{ id: "a", quote: "Great", name: "Ana" }] })))
    const contact = createDefaultBlock("contact_form")
    check("a new contact form is on the page at once, offering the list", on(contact) && (contact.data as { offer_signup?: boolean }).offer_signup === true && creatorBlockHasContent(contact))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Each one draws, the same for the preview and the live page")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const course = html(b("course", { product_id: "p1", course_title: "Learn beats", course_slug: "learn-beats", course_thumbnail: "https://cdn.example/c.jpg", course_price_cents: 4900, lessons_count: 12, show_price: true }))
    check("a course: its cover, title, lessons and price, opening its page", /data-onepage-course=""/.test(course) && /href="\/p\/learn-beats"/.test(course) && course.includes("Learn beats") && course.includes("12 lessons") && /49/.test(course) && course.includes("https://cdn.example/c.jpg"), course.slice(0, 400))
    check("a free course says Free, and the price can be hidden",
      html(b("course", { product_id: "p1", course_title: "Free one", course_price_cents: 0 })).includes("Free") &&
      !/\$49/.test(html(b("course", { product_id: "p1", course_title: "Hidden", course_price_cents: 4900, show_price: false }))))
    const music = html(b("music", { url: "https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy", title: "New album" }))
    check("music: the provider's player, lazy, at its own height", /<iframe[^>]*src="https:\/\/open\.spotify\.com\/embed\/album\/4aawyAB9vmqN3uQ7FjRGTy/.test(music) && /loading="lazy"/.test(music) && /height:352px/.test(music) && music.includes("New album"))
    const quotes = html(b("testimonials", { title: "What people say", items: [{ id: "a", quote: "So good", name: "Ana", detail: "Student", rating: 4 }, { id: "b", quote: "Loved it", name: "Bo" }] }))
    check("testimonials: each quote, name, line and stars, sliding when there are two", quotes.includes("So good") && quotes.includes("Ana") && quotes.includes("Student") && quotes.includes("4 out of 5 stars") && /snap-x/.test(quotes))
    const form = html(b("contact_form", { title: "Get in touch", button_text: "Send", offer_signup: true }))
    check("contact: name, email, message, the box, the hidden field and the page's button", /aria-label="Your name"/.test(form) && /type="email"/.test(form) && /<textarea/.test(form) && /type="checkbox"/.test(form) && /name="company"/.test(form) && form.includes("Get in touch"))
    check("without the list offer there is no box", !/type="checkbox"/.test(html(b("contact_form", { title: "Hi", offer_signup: false }))))
    check("an empty one draws nothing", html(b("music", { url: "" })) === "" && html(b("course", { product_id: "" })) === "" && html(b("testimonials", { items: [] })) === "")

    const live = read("components/onepage/public-onepage.tsx")
    check("the live page sends the four to the one drawing, with the page's creator for the contact form",
      /case "course":\s*case "music":\s*case "testimonials":\s*case "contact_form":\s*case "heading":[\s\S]{0,120}return <ExtraBlock block=\{block\} look=\{\{ theme, scale: "live", sellerId \}\} \/>/.test(live))
    check("and the preview is that live page, in a frame", /<PublicOnePage onepage=\{page as never\} \/>/.test(read("components/onepage/preview-document.tsx")))
    const module = read("components/onepage/creator-blocks.tsx")
    check("a contact message goes through the website's contact pipeline, with its spam checks", /sendContactMessage\(\{/.test(module) && /company,/.test(module) && /elapsed: Date\.now\(\) - shownAt\.current/.test(module) && /page: "onepage"/.test(module))
    check("and the editor's preview never sends one", /if \(look\.preview\) \{\s*setError\(tt\("Messages send from your live page\."\)\)/.test(module))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A course is read from its product every time the page is drawn")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const blocks = [b("course", { product_id: "c1", course_title: "Old name", course_price_cents: 100 }), b("course", { product_id: "gone" }), b("course", { product_id: "notcourse" })]
    check("its product is asked about", productIdsInBlocks(blocks).join(",") === "c1,gone,notcourse")
    const answers = new Map<string, any>([["c1", { id: "c1", title: "New name", slug: "new-name", price_cents: 2900, thumbnail_url: "https://cdn/x.jpg", type: "course", lessons_count: 7 }], ["gone", null], ["notcourse", { id: "notcourse", type: "digital", title: "x" }]])
    const out = resolveProductBlocks(blocks, answers) as OnePageBlock[]
    const d = out[0]?.data as Record<string, unknown>
    check("renamed, repriced, recounted", out.length === 1 && d.course_title === "New name" && d.course_slug === "new-name" && d.course_price_cents === 2900 && d.lessons_count === 7)
    check("a course that is gone, archived or no longer a course leaves the page", !out.some((x) => (x.data as { product_id: string }).product_id !== "c1"))
    const tables: Record<string, Record<string, unknown>[]> = {
      courses: [{ id: "k1", product_id: "c1" }, { id: "k2", product_id: "c2" }],
      course_modules: [{ id: "m1", course_id: "k1" }, { id: "m2", course_id: "k1" }, { id: "m3", course_id: "k2" }],
      course_lessons: [{ module_id: "m1" }, { module_id: "m1" }, { module_id: "m2" }],
    }
    const fake = { from: (t: string) => ({ select: () => ({ in: (col: string, vals: string[]) => Promise.resolve({ data: (tables[t] ?? []).filter((r) => vals.includes(String(r[col]))), error: null }) }) }) } as unknown as ProductsDb
    const counts = await lessonCounts(fake, ["c1", "c2"])
    check("lessons are counted through modules, and a course with none is 0", counts.get("c1") === 3 && counts.get("c2") === 0, JSON.stringify([...counts]))
    const broken = { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: null, error: { message: "no table" } }) }) }) } as unknown as ProductsDb
    check("a read that fails counts nothing, and the block keeps its own number", (await lessonCounts(broken, ["c1"])).size === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The Add block sheet: categories, search, one icon set, the five integrations")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("Essentials, Sell, Media, Grow, Integrations and Links, in that order", PICKER_CATEGORIES.map((c) => c.id).join(",") === "essentials,sell,media,grow,integrations,links")
    check("every entry has a line saying what it does and an icon", PICKER_ENTRIES.every((e) => e.description.trim().length > 0 && (e.icon || e.brand || e.brandIcon)))
    check("no entry is a Coming soon that cannot be pressed", PICKER_ENTRIES.every((e) => !("comingSoon" in e)))
    check("ids are unique, for the recent list", new Set(PICKER_ENTRIES.map((e) => e.id)).size === PICKER_ENTRIES.length)
    const integrations = PICKER_ENTRIES.filter((e) => e.category === "integrations")
    check("five integrations, each a real block: YouTube and TikTok play in the video block, Spotify in music, Calendly and Cal.com in booking, Klaviyo and Omnisend take the signups",
      integrations.map((e) => `${e.id}:${e.type}`).join(",") === "int_youtube:video,int_spotify:music,int_tiktok:video,int_booking:calendly,int_email:email_capture")
    check("courses and coaching are in Sell", ["course", "coaching"].every((id) => PICKER_ENTRIES.find((e) => e.id === id)?.category === "sell") && PICKER_ENTRIES.find((e) => e.id === "coaching")?.type === "calendly")
    check("search finds a block by what people call it", searchEntries(PICKER_ENTRIES, "newsletter")[0]?.type === "email_capture" && searchEntries(PICKER_ENTRIES, "reviews")[0]?.id === "testimonials" && searchEntries(PICKER_ENTRIES, "spot")[0]?.label === "Spotify")
    check("and nothing for words nothing has", searchEntries(PICKER_ENTRIES, "zzqx").length === 0)
    const picker = read("components/onepage/add-block-picker.tsx")
    check("the recent list is per browser, guarded, at most four", /localStorage\.getItem\(RECENT_KEY\)/.test(picker) && /\.slice\(0, 4\)/.test(picker) && (picker.match(/\} catch \{/g) ?? []).length >= 2)
    check("brand marks are drawn in near black, never their own colours", /<SocialIcon platform=\{entry\.brand\} size=\{18\} color="#1a1a2e"/.test(picker) && !/#8b5cf6|violet|purple/i.test(picker))
    const icons = read("components/onepage/block-icons.tsx")
    check("one icon set: one stroke, round ends, no fill", (icons.match(/strokeWidth=\{1\.6\}/g) ?? []).length === 1 && /fill="none"/.test(icons) && /strokeLinecap="round"/.test(icons) && !/fill="(?!none)/.test(icons))
    const tab = read("components/onepage/tabs/links-tab.tsx")
    check("the blocks list uses it, near black on the grey tile", /icon: GlyphSocial/.test(tab) && /icon: GlyphGroup/.test(tab) && /icon: GlyphHeader/.test(tab) && /rounded-\[11px\] bg-\[#f2f2f4\]/.test(tab) && /<Icon className="h-5 w-5 text-\[#1a1a2e\]" \/>/.test(tab))
    check("a picked entry adds its block with what it starts with", /onPick=\{\(entry\) => handleAddBlock\(entry\.type, entry\.preset, entry\.data\)\}/.test(tab))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The email signup: a first name, a link after joining, spam checks, the one list")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("the hidden field filled is a script", signupLooksAutomated({ company: "Acme" }) && signupLooksAutomated({ company: 3 }))
    check("so is a signup sent faster than a person can", signupLooksAutomated({ elapsed: 300 }) && !signupLooksAutomated({ elapsed: SIGNUP_MIN_ELAPSED_MS }))
    check("a page cached from before the checks is let through", !signupLooksAutomated({ email: "a@b.co" }) && !signupLooksAutomated({ company: "", elapsed: 5000 }) && !signupLooksAutomated(null))
    check("a first name is one line of at most 80 characters", signupName("  Ana\n Maria ") === "Ana Maria" && signupName("x".repeat(200))?.length === 80 && signupName("   ") === null && signupName(4) === null)
    const route = read("app/api/onepage/leads/route.ts")
    check("the route drops a script before it writes anything", route.indexOf("signupLooksAutomated(body)") > -1 && route.indexOf("signupLooksAutomated(body)") < route.indexOf('.from("onepage_leads")'))
    check("and is rate limited like every other signup form", /rateLimit\(\{\s*bucket: "email-capture",\s*subjects: \[addressSubject\(request\), emailSubject\(subscriberEmail\)\],\s*windows: LIMITS\.subscribe/.test(route))
    check("the address lands on the creator's one subscriber list, with the name", /from\("subscribers"\)\.insert\(\{\s*email: subscriberEmail,\s*name: name \|\| null/.test(route) && /triggerType: "new_subscriber"/.test(route))
    const live = read("components/onepage/public-onepage.tsx")
    const email = live.slice(live.indexOf('case "email_capture":'), live.indexOf('case "group":'))
    check("the live block sends the name, the hidden field and the time on screen", /name: data\.ask_name \? leadName\.trim\(\) \|\| undefined : undefined,\s*company: leadTrap,\s*elapsed: Date\.now\(\) - leadShownAt\.current/.test(live))
    check("all four layouts carry the name field and the hidden field", (email.match(/\{emailExtras\}/g) ?? []).length === 4)
    check("the link after joining is offered once they have joined, in both places the thanks is", /\{afterSignupLink\}/.test(email) && /\{emailSubmitted \? afterSignupLink : null\}/.test(email) && /\/\^https\?:\\\/\\\/\/i\.test\(afterUrl\)/.test(email))
    const tab = read("components/onepage/tabs/links-tab.tsx")
    check("the editor asks for both, and says where signups go", /updateData\(\{ ask_name: checked \}\)/.test(tab) && /updateData\(\{ after_signup_url: e\.target\.value\.trim\(\) \}\)/.test(tab) && /<SignupDestination \/>/.test(tab))
    const module = read("components/onepage/creator-blocks.tsx")
    check("which is Emails › Subscribers, and Klaviyo or Omnisend when connected", /href="\/app\/emails\?tab=subscribers"/.test(module) && /fetch\("\/api\/store\/integrations\/marketing"\)/.test(module) && /href="\/app\/integrations\?integration=klaviyo"/.test(module))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The players and booking pages are allowed to load")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const frames = CONTENT_SECURITY_POLICY.match(/frame-src[^;]*/)?.[0] ?? ""
    check("Spotify, SoundCloud, Apple Music, TikTok, Calendly and Cal.com, and vercel.json says the same",
      ["https://open.spotify.com", "https://w.soundcloud.com", "https://embed.music.apple.com", "https://www.tiktok.com", "https://calendly.com", "https://cal.com"].every((h) => frames.includes(h)) && read("vercel.json").includes(CONTENT_SECURITY_POLICY))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main().catch((e) => { console.error(e); process.exit(1) })
