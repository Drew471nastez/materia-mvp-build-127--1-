/**
 * The OnePage editor round after AR: invisible click to select in the
 * phone preview, no AI in the editor, and the block inputs a creator types
 * into (Instagram handle, posts added by hand, the booking message and its
 * placeholders, YouTube autoplay, the Canva mark, addresses and phone
 * numbers).
 *
 * scripts/check-onepage-editor-op.mjs measures the click to select in
 * Chromium.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { nearestBlock, pickAction, pickStyle } from "@/lib/onepage/preview-select"
import { appAddressFromInput, appAddressShown, appTarget, appUrlProblem } from "@/lib/onepage/app-blocks"
import { storelibBlockHasContent, pastedPosts } from "@/lib/onepage/storelib-blocks"
import { videoAutoplays, videoEmbedUrl, videoSource } from "@/lib/onepage/extra-blocks"
import { createDefaultBlock } from "@/lib/onepage/types"
import { actionHref, fillTemplate, formVars, normaliseAction, slotVars, templateVariablesIn, TEMPLATE_VARIABLES } from "@/lib/forms/actions"
import { blockActionVars } from "@/lib/onepage/block-action"
import { isGoogleMapsLink, isShortMapsLink, mapEmbedSrc, mapPlace, mapPlaceOf } from "@/lib/onepage/map-place"
import { guessCountry, phoneLengths, phoneProblem } from "@/lib/forms/phone-check"
import { countryOfInternational, digitsFromKept, formatNational, fullNumber, nationalDigits } from "@/lib/account/phone"
import { isLinkBrandIcon, linkIconFromUrl, linkIconLabel } from "@/components/onepage/link-icons"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
function section(name: string) { console.log(`\n${name}`) }
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

section("Click a block in the phone preview, nothing drawn")
{
  const rects = [
    { id: "a", left: 20, top: 100, right: 370, bottom: 150 },
    { id: "b", left: 20, top: 166, right: 370, bottom: 216 },
  ]
  check("a point on a block is that block", nearestBlock(rects, 100, 120) === "a")
  check("a point in the gap goes to the nearer block", nearestBlock(rects, 100, 154) === "a" && nearestBlock(rects, 100, 162) === "b")
  check("far from every block is nothing", nearestBlock(rects, 100, 400) === null && nearestBlock(rects, 100, 40) === null)
  check("a page margin wider than the slack is nothing", nearestBlock(rects, 2, 120, 8) === null)
  check("an empty box is never picked", nearestBlock([{ id: "z", left: 0, top: 0, right: 0, bottom: 0 }], 0, 0) === null)
  check("the open block's click goes to the page and brings the list back", pickAction({ mode: true, selected: "a", hit: "a" }) === "reveal")
  check("another block's click is taken", pickAction({ mode: true, selected: "a", hit: "b" }) === "select")
  const css = pickStyle("blk_1")
  check("frames in blocks give their clicks to the block, except the open block's", /\[data-op-block\] iframe\{pointer-events:none\}/.test(css) && /\[data-op-block="blk_1"\] iframe\{pointer-events:auto\}/.test(css))
  check("a hand over every block, nothing else in the style", /cursor:pointer/.test(css) && !/outline|box-shadow|border/.test(css))
  check("an id that is not the editor's never reaches the style", !/<|"\]\{/.test(pickStyle('x"]{color:red}')) && pickStyle(null).indexOf("auto") === -1)
  const doc = code("components/onepage/preview-document.tsx")
  const picker = doc.slice(doc.indexOf("function BlockPicker"), doc.indexOf("A NEW THEME IS DRAWN"))
  check("the frame draws no ring or outline", !/data-pick-hover|data-pick-open|boxShadow|\bring\b|outline/.test(picker))
  check("a gap click only counts on the page round the blocks, never in a sheet over it", /querySelector\("\[data-op-block\]"\)\) return null/.test(picker))
  const list = code("components/onepage/tabs/links-tab.tsx")
  check("the list glides again on a second click of the open block", /setPickTick\(\(n\) => n \+ 1\)/.test(list) && /\[selectedBlockId, pickTick\]/.test(list))
}

section("No AI in the OnePage editor")
{
  check("the AI line is gone, with its edits and route", !existsSync(join(process.cwd(), "components/onepage/ai-edit-bar.tsx")) && !existsSync(join(process.cwd(), "lib/onepage/ai-edits.ts")) && !existsSync(join(process.cwd(), "app/api/onepage/ai")))
  check("nothing in the OnePage editor asks for it", !/AiEditBar|api\/onepage\/ai/.test(code("components/onepage/tabs/links-tab.tsx") + code("components/onepage/onepage-editor.tsx")))
}

section("Instagram: @handle, a bare handle or a link")
{
  const ig = (raw: string) => appAddressFromInput("instagram", raw).url
  check("@handle becomes the profile", ig("@ana.studio") === "https://instagram.com/ana.studio")
  check("a bare handle too", ig("ana_studio") === "https://instagram.com/ana_studio")
  check("a link without https", ig("instagram.com/ana") === "https://instagram.com/ana")
  check("a shared link loses www., its tracking and its slash", ig("https://www.instagram.com/ana/?igsh=abc123") === "https://instagram.com/ana" && ig("m.instagram.com/ana") === "https://instagram.com/ana" && ig("http://instagram.com/ana") === "https://instagram.com/ana")
  check("a post or reel is kept whole, so it plays", ig("https://www.instagram.com/p/C0abcDEF12/") === "https://www.instagram.com/p/C0abcDEF12/" && ig("instagram.com/reel/C0abcDEF12") === "https://instagram.com/reel/C0abcDEF12")
  check("a name with a space is not a handle", appAddressFromInput("instagram", "@bad name").valid === false)
  check("shown as @handle", appAddressShown("instagram", "https://instagram.com/ana") === "@ana" && appAddressShown("instagram", "https://www.instagram.com/ana/") === "@ana")
  check("a post is shown as its link", appAddressShown("instagram", "https://www.instagram.com/p/C0abcDEF12/") === "https://www.instagram.com/p/C0abcDEF12/")
  check("a handle saved as typed before still draws its profile", appTarget({ provider: "instagram", url: "@ana" } as never)?.href === "https://instagram.com/ana" && !appUrlProblem({ provider: "instagram", url: "ana" } as never))
  check("another site in the Instagram field is a problem", appUrlProblem({ provider: "instagram", url: appAddressFromInput("instagram", "tiktok.com/@ana").url } as never))
  check("TikTok, X and Threads read handles the same way", appAddressFromInput("tiktok", "@ana").url === "https://tiktok.com/@ana" && appAddressFromInput("x", "jack").url === "https://x.com/jack" && appAddressShown("tiktok", "https://tiktok.com/@ana") === "@ana")
  check("an X post stays a post", appAddressFromInput("x", "https://x.com/jack/status/20").url === "https://x.com/jack/status/20")
  check("a service without handles is left as typed", appAddressFromInput("facebook", "facebook.com/page").url === "facebook.com/page")
  const ed = code("components/onepage/app-block-editor.tsx")
  check("the editor's field reads handles and shows @handle once left", /HandleAddressInput/.test(ed) && /appAddressShown\(providerId, appAddressFromInput\(providerId, text\)\.url\)/.test(ed))
}

section("Posts: only what the creator pastes")
{
  check("a YouTube channel alone draws nothing (no videos pulled by themselves)", !storelibBlockHasContent({ type: "social_posts", data: { network: "youtube", channel_url: "https://www.youtube.com/@mkbhd" } } as never))
  check("pasted posts draw", storelibBlockHasContent({ type: "social_posts", data: { network: "youtube", post_urls: ["https://youtu.be/dQw4w9WgXcQ"] } } as never) && pastedPosts({ network: "instagram", post_urls: ["https://www.instagram.com/p/C0abcDEF12/"] }).length === 1)
  const server = code("lib/onepage/storelib-blocks-server.ts")
  check("the server reads no channel feed for posts", !/channelVideos|feeds\/videos\.xml|youtubeFeedUrl/.test(server))
  const editor = code("components/onepage/storelib-blocks.tsx")
  check("the editor asks for links, optional, and no channel", /Video links \(optional, one a line\)/.test(editor) && !/Your latest videos show by themselves/.test(editor) && !/tt\("Your channel"\)/.test(editor))
  check("the Add block sheet promises no syncing", !/Your latest videos, synced|A row of your latest posts/.test(code("components/onepage/add-block-picker.tsx")))
}

section("Canva has its own mark")
{
  check("Canva is a brand mark with its name", isLinkBrandIcon("canva") && linkIconLabel("canva") === "Canva")
  check("a canva.com link draws it", linkIconFromUrl("https://www.canva.com/design/DAF123/view") === "canva" && linkIconFromUrl("ana.my.canva.site") === "canva")
  check("the mark is in the trimmed set, from Simple Icons", /export function SiCanva\(/.test(code("components/icons/brand-icons.generated.ts")))
  const icons = code("components/onepage/brand-icons.tsx")
  check("drawn from SiCanva, in Canva's teal, whole", /canva: SiCanva/.test(icons) && /canva: "#00C4CC"/.test(icons) && /canva: \{ draw:/.test(icons))
  check("the Add block sheet shows it", /embed\("int_canva", "Canva", "canva", "canva"/.test(code("components/onepage/add-block-picker.tsx")))
}

section("YouTube: plays by itself, muted, on for a new block")
{
  const yt = videoSource("https://youtu.be/dQw4w9WgXcQ")!
  const muted = videoEmbedUrl(yt, { muted: true }) || ""
  check("the page's own start is muted, inline and looping", /autoplay=1/.test(muted) && /mute=1/.test(muted) && /playsinline=1/.test(muted) && /loop=1&playlist=dQw4w9WgXcQ/.test(muted))
  check("a press loads it with its sound", !/mute=1/.test(videoEmbedUrl(yt) || "") && /autoplay=1/.test(videoEmbedUrl(yt) || ""))
  check("Vimeo starts muted too", /muted=1/.test(videoEmbedUrl(videoSource("https://vimeo.com/76979871")!, { muted: true }) || ""))
  check("YouTube, Vimeo and uploads can play by themselves; TikTok cannot", videoAutoplays(yt) && videoAutoplays(videoSource("https://vimeo.com/76979871")) && !videoAutoplays(videoSource("https://www.tiktok.com/@a/video/1234567890123")))
  check("a new video block plays by itself", (createDefaultBlock("video").data as { autoplay?: boolean }).autoplay === true)
  const view = code("components/onepage/extra-blocks.tsx")
  check("it waits until half of it is on screen, and never for reduced motion or in a carousel", /threshold: 0\.5/.test(view) && /prefers-reduced-motion: reduce/.test(view) && /!look\.still/.test(view))
  check("the editor offers the switch for a YouTube or Vimeo link", /data-video-autoplay-option/.test(code("components/onepage/media-editor.tsx")))
}

section("Booking message: what each variable puts in, filled in every channel")
{
  check("the editor's variables: name, service, product, date and time, each with what it means", TEMPLATE_VARIABLES.map((v) => v.token).join() === "{name},{service},{product_name},{date},{time}" && TEMPLATE_VARIABLES.every((v) => v.means.length > 10))
  check("the variables a message uses, once each, {visitor_name} read as {name}", templateVariablesIn("Hi {visitor_name}, {service} on {date} at {time}? {name}", "About {service}").join() === "{name},{service},{date},{time}")
  const msg = "Hi, I'm {name}. I'd like to book {service} on {date} at {time}."
  const vars = { visitor_name: "Ana", service: "a haircut", date: "Fri 14 Nov 2026", time: "15:30" }
  check("filled: name, service, date, time", fillTemplate(msg, vars) === "Hi, I'm Ana. I'd like to book a haircut on Fri 14 Nov 2026 at 15:30.")
  check("{visitor_name} and {name} are the same", fillTemplate("{visitor_name}/{name}", { visitor_name: "Ana" }) === "Ana/Ana")
  check("the default booking message with its service", fillTemplate("Hi, I'd like to book {service}. When are you free?", { service: "a haircut" }) === "Hi, I'd like to book a haircut. When are you free?")
  check("no service: left out, the sentence still reads", fillTemplate("Hi, I'd like to book {service}. When are you free?", {}) === "Hi, I'd like to book. When are you free?")
  const book = "Hi, I'd like to book {service} on {date}. When are you free?"
  const wa = actionHref({ type: "whatsapp", phone: "+14155550123", message: book, service: "a haircut" }, { date: "Fri 14 Nov" }) || ""
  check("WhatsApp: the action's own service, encoded once", wa === "https://wa.me/14155550123?text=" + encodeURIComponent("Hi, I'd like to book a haircut on Fri 14 Nov. When are you free?"))
  const sms = actionHref({ type: "sms", phone: "+14155550123", message: book, service: "a haircut" }) || ""
  check("SMS: the same words in the body", sms === "sms:+14155550123?body=" + encodeURIComponent("Hi, I'd like to book a haircut on. When are you free?"))
  const mail = actionHref({ type: "email", email: "ana@example.com", subject: "Booking {service}", message: book, service: "a haircut" }, { date: "Fri 14 Nov" }) || ""
  check("email: subject and body both filled, spaces as %20", mail === "mailto:ana@example.com?subject=" + encodeURIComponent("Booking a haircut") + "&body=" + encodeURIComponent("Hi, I'd like to book a haircut on Fri 14 Nov. When are you free?") && !/\+/.test(mail.split("?")[1]))
  const tg = actionHref({ type: "telegram", target: "@anastudio", message: book, service: "a haircut" }) || ""
  check("Telegram: filled too", tg.startsWith("https://t.me/anastudio?text=") && decodeURIComponent(tg.split("text=")[1]).startsWith("Hi, I'd like to book a haircut"))
  check("a visitor's own answer beats the typed service", (actionHref({ type: "whatsapp", phone: "+14155550123", message: "{service}", service: "a haircut" }, { service: "Colour" }) || "").endsWith("text=Colour"))
  check("the service is kept when saved, capped", (normaliseAction({ type: "whatsapp", phone: "+14155550123", message: "x", service: "  a haircut  " }) as { service?: string }).service === "a haircut")
  check("the block's words fill {service} when the action has none, the action's own first", blockActionVars({ type: "link_button", data: { label: "Book" } }, { type: "whatsapp", phone: "1", service: "Massage" } as never).service === "Massage" && blockActionVars({ type: "link_button", data: { label: "Book" } }, null).service === "Book")
  const fv = formVars([{ id: "when", type: "date" }, { id: "time", type: "text" }, { id: "full", type: "name" }], { when: "2026-11-14", time: "3:30 PM", full: "Ana" })
  check("questions fill {date} (as words), {time} and {name}", /^Sat,? 14 Nov 2026$/.test(fv.date || "") && fv.time === "3:30 PM" && fv.visitor_name === "Ana")
  const slot = slotVars("2026-11-14T15:30:00.000Z", "America/New_York")
  check("a booked slot is said in the booking's own time zone", /^Sat,? 14 Nov 2026$/.test(slot.date || "") && /^10:30/.test(slot.time || ""))
  check("a slot that is not a time gives nothing", Object.keys(slotVars("soon", "UTC")).length === 0)
  const route = code("app/api/forms/[id]/submit/route.ts")
  check("a booking form's chat after booking carries the slot as {date} and {time}", /slotVars\(booking\.starts_at, definition\.booking\?\.timezone\)/.test(route))
  const ed = code("components/forms/action-editor.tsx")
  check("the editor says what each used variable puts in, asks for the service, and shows an example", /data-variable-meanings/.test(ed) && /data-variable-service/.test(ed) && /data-message-example/.test(ed))
}

section("Map: a typed address or a Google Maps link")
{
  const typed = mapPlace("350 5th Ave, New York, NY 10118")!
  check("a typed address is searched as typed", typed.kind === "address" && typed.query === "350 5th Ave, New York, NY 10118" && typed.href === "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("350 5th Ave, New York, NY 10118"))
  const place = mapPlace("https://www.google.com/maps/place/Empire+State+Building/@40.7484405,-73.9878531,17z/data=!3m1!4b1!4m6!3m5!1s0x89c259a9b3117469:0xd134e199a405a163!8m2!3d40.7484405!4d-73.9856644!16zL20vMDJuZF8?entry=ttu")!
  check("a place link: its name, and its exact point (not the screen's centre)", place.kind === "link" && place.label === "Empire State Building" && /^40\.7484[0-9]*,-73\.98566[0-9]*$/.test(place.query) && /^https:\/\/www\.google\.com\/maps\/place\//.test(place.href))
  check("a dropped point", mapPlace("https://www.google.com/maps/@40.7484,-73.9857,17z")?.query === "40.7484,-73.9857")
  check("a search link", mapPlace("https://www.google.com/maps/search/?api=1&query=Joe%27s+Pizza+Carmine+St")?.query === "Joe's Pizza Carmine St")
  check("q= with a point, and maps.google.com", mapPlace("https://maps.google.com/?q=40.7484,-73.9857")?.query === "40.7484,-73.9857")
  check("directions: where they end", mapPlace("https://www.google.com/maps/dir/Home/Joe's+Pizza,+7+Carmine+St,+New+York/@40.73,-74.00,15z")?.label === "Joe's Pizza, 7 Carmine St, New York")
  check("a link pasted without https", mapPlace("google.com/maps/place/Katz's+Delicatessen")?.label === "Katz's Delicatessen")
  check("typed coordinates pin that point", mapPlace("40.7484, -73.9857")?.query === "40.7484,-73.9857")
  check("a short Share link waits to be read", mapPlace("https://maps.app.goo.gl/AbCdEf123")?.kind === "short" && isShortMapsLink("maps.app.goo.gl/AbCdEf123") && isShortMapsLink("https://goo.gl/maps/xyz") && !isShortMapsLink("https://goo.gl/abc"))
  check("another site's link is not a place", mapPlace("https://example.com/where") === null && !isGoogleMapsLink("https://google.com/search?q=x"))
  const kept = mapPlaceOf({ address: "https://maps.app.goo.gl/AbCdEf123", place: { from: "https://maps.app.goo.gl/AbCdEf123", url: "https://www.google.com/maps/place/Joe's+Pizza/@40.73,-74.00,17z/data=!3d40.7305!4d-74.0021" } })
  check("a short link read once draws its place, and Open in Maps keeps the short link", kept?.query === "40.7305,-74.0021" && kept?.label === "Joe's Pizza" && kept?.href === "https://maps.app.goo.gl/AbCdEf123")
  check("a kept reading for another link is not used", mapPlaceOf({ address: "Times Square", place: { from: "https://maps.app.goo.gl/old", url: "https://www.google.com/maps/@1,2,3z" } })?.query === "Times Square")
  check("the frame is Google's embed, at the chosen distance", mapEmbedSrc(typed, "street") === "https://maps.google.com/maps?q=" + encodeURIComponent("350 5th Ave, New York, NY 10118") + "&z=17&output=embed" && mapEmbedSrc(mapPlace("https://maps.app.goo.gl/x")!) === null)
  const field = code("components/onepage/map-place-field.tsx")
  check("the field's example is in New York, not a Romanian street", /350 5th Ave, New York/.test(field) && !/Strada/.test(field + code("components/onepage/extra-blocks.tsx")))
  const route = code("app/api/onepage/map-place/route.ts")
  check("the short link is read signed in, rate limited, only Google's short hosts, through the public-only guard", /routeUser\(\)/.test(route) && /bucket: "onepage-map-place"/.test(route) && /isShortMapsLink\(raw\)/.test(route) && /redirectTarget\(/.test(route))
}

section("Phone numbers: the country, the shape, a calm check")
{
  check("a US number: ten digits", phoneProblem("+14155550123", "US") === null && phoneProblem("+1415555012", "US") === "short" && phoneProblem("+141555501234", "US") === "long")
  check("an area code never starts with 0 or 1", phoneProblem("+10155550123", "US") === "short")
  check("Romania: nine digits after +40", phoneProblem("+40712345678", "RO") === null && phoneProblem("+4071234567", "RO") === "short" && phoneProblem("+407123456789", "RO") === "long")
  check("the UK takes nine or ten", phoneProblem("+447700900123", "GB") === null && phoneProblem("+44770090012", "GB") === null && phoneProblem("+4477009", "GB") === "short")
  check("a number kept with spaces is read the same", phoneProblem("+40 712 345 678", "RO") === null)
  check("nothing typed is no problem", phoneProblem("", "RO") === null)
  check("a country not listed gets E.164's bounds", phoneLengths("FJ")[0] === 4 && phoneLengths("FJ")[1] === 12)
  check("the country from the clock first", guessCountry({ timeZone: "Europe/Bucharest", languages: ["en-US"] }) === "RO")
  check("then the language's region", guessCountry({ timeZone: "Etc/UTC", languages: ["fr", "pt-BR"] }) === "BR")
  check("then the US", guessCountry({ timeZone: null, languages: ["en"] }) === "US")
  check("a number typed with its code finds its country", countryOfInternational("+44 7700 900123", []) === "GB" && countryOfInternational("0040 712 345 678", []) === "RO" && countryOfInternational("+1 604 555 0101", ["CA"]) === "CA")
  check("the local 0 is dropped, the shape is the country's", nationalDigits("0712 345 678", "RO") === "712345678" && formatNational("712345678", "RO") === "712 345 678" && formatNational("4155550123", "US") === "(415) 555-0123")
  check("kept as the page shows it", fullNumber(digitsFromKept("+40712345678", "RO"), "RO") === "+40 712 345 678")
  const field = code("components/forms/phone-number-field.tsx")
  check("the field says short once left, long at once, naming the country", /left && problem === "short"/.test(field) && /problem === "long" \? "long"/.test(field) && /countryName\(cc\)/.test(field))
  check("every phone in the OnePage editor is that field: actions, WhatsApp icon, contact card, a booking's number", /<PhoneNumberField/.test(code("components/forms/action-editor.tsx")) && /data-social-phone/.test(code("components/onepage/tabs/links-tab.tsx")) && /<PhoneNumberField/.test(code("components/onepage/app-block-editor.tsx")) && /<PhoneNumberField/.test(code("components/forms/forms-manager.tsx")))
  check("no phone library was added", !/libphonenumber/.test(code("package.json")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
