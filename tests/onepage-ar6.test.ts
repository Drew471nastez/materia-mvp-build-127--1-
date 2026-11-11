/**
 * Round AR, track 6: the OnePage editor's UX, sharing, the admin handoff
 * and the AI line taken out of the OnePage editor.
 *
 *   - one compact picture row for every picture field in the editor (the
 *     cover, the group's picture), and long descriptions that grow
 *   - the form builder's save round trip: every question type and every
 *     setting comes back as it was sent, drafts and publish
 *   - click a block in the phone preview: the message mapping
 *   - Share › Add link to Instagram bio, and its public page
 *   - the handoff's token rules, and the way to it from the OnePage editor
 *   - the AI line is gone from the OnePage editor, with its edits and route
 *
 * scripts/check-onepage-ar6.mjs measures the editor in a browser at 390
 * and 1440.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { grownHeight, GROW_MAX_PX } from "@/components/onepage/grow-textareas"
import { draftForSave, typedHttpsUrl, validateDefinition, type FormDefinition } from "@/lib/forms/definition"
import { blockIdAt, notePreviewPick, pickAction, takePreviewPick, validBlockId } from "@/lib/onepage/preview-select"
import { INSTAGRAM_APP_URL, INSTAGRAM_WEB_URL, instagramBioPath, instagramBioUrl, shownAddress } from "@/lib/onepage/instagram-bio"
import { claimStateOf, refusalOfSql, tokenShapeOk, ttlDays, STAYS_BEHIND, type HandoffRow, type Viewer } from "@/lib/handoff/rules"
import { isReservedWord } from "@/lib/reserved-words"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
function section(name: string) { console.log(`\n${name}`) }
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

section("One compact picture row")
{
  const cover = code("components/onepage/header-cover-editor.tsx")
  check("the cover is the editor's picture row, not the 840 by 630 band", /<OnePageImageField/.test(cover) && !/<ImageUpload/.test(cover) && !/emptyBand/.test(cover))
  check("the cover's crop frame opens only on Adjust, at most 360px wide", /<Reveal open=\{!!cover && adjusting\}>/.test(cover) && /max-w-\[360px\]/.test(cover) && /data-cover-adjust=""/.test(cover))
  check("the cover row's thumbnail is wide, its Your files and Remove are the row's", /thumbClassName="w-24"/.test(cover))
  const tab = code("components/onepage/tabs/links-tab.tsx")
  check("the group's picture is the same row", /data-group-image=""[\s\S]{0,400}<OnePageImageField value=\{groupData\.image_url\}/.test(tab))
  check("no ImageUpload drop box is left in the OnePage editor", !/<ImageUpload\b/.test(tab) && !/<ImageUpload\b/.test(code("components/onepage/tabs/design-tab.tsx")))
  const field = code("components/onepage/image-field.tsx")
  check("the row keeps drop on a computer, Upload, Your files and Remove", /onDrop=\{/.test(field) && /data-image-upload=""/.test(field) && /<LibraryButton/.test(field) && /data-image-remove=""/.test(field))
  check("the row takes a wide thumbnail and one more button", /thumbClassName\?: string/.test(field) && /\{has \? extra : null\}/.test(field))
}

section("Descriptions that grow")
{
  check("a short text keeps its own height", grownHeight(40, 76).height === 76 && !grownHeight(40, 76).scrolls)
  check("a long text grows to it", grownHeight(200, 76).height === 200)
  check("past the ceiling it stops and scrolls", grownHeight(900, 76).height === GROW_MAX_PX && grownHeight(900, 76).scrolls)
  const css = code("components/onepage/block-fields.css")
  check("every block's textarea sizes to its text, capped, no resize handle", /\[data-block-settings\] textarea \{\s*field-sizing: content;\s*min-height: 76px;\s*max-height: 320px;/.test(css) && /resize: none;/.test(css))
  check("measured where the browser cannot size it itself, on the open block's settings", /<div ref=\{growTextareas\}[^>]*data-block-settings="">/.test(code("components/onepage/tabs/links-tab.tsx")))
}

section("The form builder: save, reload, compare")
{
  const q = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, type, label: `Q ${id}`, required: id === "a", ...extra })
  const full = {
    title: "Get in touch",
    description: "A line before the questions",
    mode: "quiz",
    layout: "steps",
    fields: [
      q("a", "name", { placeholder: "Your name", description: "So I can greet you" }),
      q("b", "email"),
      q("c", "phone"),
      q("d", "text", { placeholder: "Short" }),
      q("e", "textarea", { new_step: true }),
      q("f", "number", { min: 1, max: 9 }),
      q("g", "date"),
      q("h", "dropdown", { options: [{ id: "h1", label: "One", score: 2 }, { id: "h2", label: "Two", score: 5 }] }),
      q("i", "single", { options: [{ id: "i1", label: "Yes" }, { id: "i2", label: "No" }], show_if: [{ field: "h", op: "is", value: "h1" }] }),
      q("j", "multiple", { options: [{ id: "j1", label: "A" }] }),
      q("k", "checkboxes", { options: [{ id: "k1", label: "B" }] }),
      q("l", "rating", { max: 7 }),
      q("m", "consent"),
      q("n", "file"),
    ],
    button_text: "Send it",
    consent_text: "I agree to be contacted.",
    privacy_url: "ana.example.com/privacy",
    marketing_opt_in: true,
    results: [{ id: "r1", min: 0, max: 5, title: "Starter", message: "Begin here" }],
    booking: { duration: 45, buffer: 15, timezone: "Europe/Bucharest", weekly: [{ day: 1, start: "09:00", end: "12:00" }, { day: 1, start: "14:00", end: "17:00" }], notice_hours: 24, days_ahead: 60, approval: false },
    completion: { kind: "action", message: "Thanks, talk soon", action: { type: "url", url: "https://ana.example.com/next", label: "Next step" }, include_answers: true },
  } as unknown as FormDefinition
  const sent = draftForSave(full)
  check("an address typed without https:// is sent whole", sent.privacy_url === "https://ana.example.com/privacy")
  check("typed addresses: bare host made https, blank is none, a scheme left to the check", typedHttpsUrl("x.co/p") === "https://x.co/p" && typedHttpsUrl("   ") === "" && typedHttpsUrl("http://x.co") === "http://x.co")
  const draft = validateDefinition(sent, false)
  const published = validateDefinition(sent, true)
  const reloaded = validateDefinition(JSON.parse(JSON.stringify(draft)), false)
  check("a draft read back is the draft (save, reload, compare)", JSON.stringify(reloaded) === JSON.stringify(draft))
  check("publishing keeps exactly what the draft kept", JSON.stringify(published) === JSON.stringify(draft))
  check("every question type comes back with its type", draft.fields.map((f) => f.type).join() === "name,email,phone,text,textarea,number,date,dropdown,single,multiple,checkboxes,rating,consent,file")
  const by = (id: string) => draft.fields.find((f) => f.id === id)!
  check("placeholder, help text and required", by("a").placeholder === "Your name" && by("a").description === "So I can greet you" && by("a").required === true && by("b").required === false)
  check("a number's bounds and a rating's scale", by("f").min === 1 && by("f").max === 9 && by("l").max === 7)
  check("answers with their points, and a rule on an earlier answer", by("h").options?.[1]?.score === 5 && by("i").show_if?.[0]?.value === "h1")
  check("a new step", by("e").new_step === true)
  check("After sending: message, the button, every answer under it", draft.completion.kind === "action" && draft.completion.message === "Thanks, talk soon" && draft.completion.include_answers === true && !!draft.completion.action)
  check("Layout and button: steps, the button's words, the quiz and its results", draft.layout === "steps" && draft.button_text === "Send it" && draft.mode === "quiz" && draft.results?.[0]?.title === "Starter")
  check("Bookings: every setting, both windows of a day", draft.booking?.duration === 45 && draft.booking.buffer === 15 && draft.booking.notice_hours === 24 && draft.booking.days_ahead === 60 && draft.booking.approval === false && draft.booking.weekly.length === 2 && draft.booking.timezone === "Europe/Bucharest")
  check("Privacy: the notice, the policy address, the opt-in", draft.consent_text === "I agree to be contacted." && draft.privacy_url === "https://ana.example.com/privacy" && draft.marketing_opt_in === true)
  const gated = validateDefinition(draftForSave({ ...full, completion: { kind: "gated", message: "Here it is", gated: { url: "files.example.com/guide.pdf", label: "Get the guide" } } } as FormDefinition), true)
  check("a private link typed without https:// is kept and published", gated.completion.kind === "gated" && gated.completion.gated?.url === "https://files.example.com/guide.pdf" && gated.completion.gated?.label === "Get the guide")
  let spaces = true
  try {
    validateDefinition({ ...full, privacy_url: "   " }, false)
  } catch {
    spaces = false
  }
  check("a privacy field of spaces is no address, not a refusal", spaces)
  const turnedOff = validateDefinition({ ...full, booking: undefined }, false)
  check("Bookings switched off is saved off", turnedOff.booking === undefined)
  const builder = code("components/forms/forms-manager.tsx")
  check("the builder sends and shows the whole addresses", /const sent = draftForSave\(draft\)/.test(builder) && /definition: sent,/.test(builder))
  check("a type change drops the old type's bounds", /type === "rating" \? \{ min: undefined, max:/.test(builder))
  check("on a phone the builder is the shared sheet", /<SheetDialog[\s\S]{0,200}phone=\{phone\}/.test(code("components/forms/form-builder-dialog.tsx")))
}

section("Click a block in the phone preview")
{
  const el = (id: string | null) => ({ closest: (s: string) => (s === "[data-op-block]" && id ? { getAttribute: () => id } : null) })
  check("the block under the pointer is its data-op-block", blockIdAt(el("blk_1") as never) === "blk_1" && blockIdAt(el(null) as never) === null && blockIdAt(null) === null)
  check("off: every click goes to the page", pickAction({ mode: false, selected: null, hit: "a" }) === "pass")
  check("on: a block that is not open is taken", pickAction({ mode: true, selected: "b", hit: "a" }) === "select")
  check("on: the open block's own click goes to the page", pickAction({ mode: true, selected: "a", hit: "a" }) === "pass")
  check("on: no block, a right click or a modified click goes to the page", pickAction({ mode: true, selected: null, hit: null }) === "pass" && pickAction({ mode: true, selected: null, hit: "a", button: 2 }) === "pass" && pickAction({ mode: true, selected: null, hit: "a", modified: true }) === "pass")
  check("only an id shaped as the editor's is heard", validBlockId("block_17_abc") && !validBlockId("<img>") && !validBlockId("") && !validBlockId("x".repeat(81)) && !validBlockId(3))
  notePreviewPick("blk_9", 1000)
  check("the list scrolls to a pick once, for the block now open", takePreviewPick("other", 1100) === null && takePreviewPick("blk_9", 1200) === "blk_9" && takePreviewPick("blk_9", 1300) === null)
  notePreviewPick("blk_9", 1000)
  check("a stale pick is not scrolled to", takePreviewPick("blk_9", 5000) === null)
  const doc = code("components/onepage/preview-document.tsx")
  check("the frame takes the click before the page (capture), and stops it", /window\.addEventListener\("click", onClick, true\)/.test(doc) && /e\.stopImmediatePropagation\(\)/.test(doc))
  check("the rings move on one fixed layer by transform, no layout on the page", /ring\.style\.transform = `translate\(/.test(doc) && /pointer-events-none fixed left-0 top-0/.test(doc))
  check("the frame only hears select mode from its parent on this origin", /if \(e\.origin !== window\.location\.origin \|\| e\.source !== parent\) return/.test(doc) && /data\.kind === "select-mode"/.test(doc))
  const live = code("components/onepage/live-preview.tsx")
  check("only the phone beside the editor picks (from 768px), not the full screen preview", /pick=\{pick\} \/>\}/.test(live) && !/MobilePreviewContent[\s\S]*pick=\{/.test(live.slice(live.indexOf("export function MobilePreviewContent"))))
  check("a pick opens the block and tells the editor", /notePreviewPick\(id\)/.test(live) && /setSelectedBlockId\(id\)/.test(live) && /PREVIEW_PICK_EVENT/.test(live))
  check("the editor shows Links on a pick", /if \(activeTabRef\.current !== "links"\) handleTabChange\("links"\)/.test(code("components/onepage/onepage-editor.tsx")))
  check("the list glides to the card", /takePreviewPick\(selectedBlockId\)/.test(code("components/onepage/tabs/links-tab.tsx")) && /behavior: "smooth"/.test(code("components/onepage/tabs/links-tab.tsx")))
  check("a link still waiting for its address can be picked too", /data-onepage-enter=\{animClass \? "" : undefined\} data-op-block=\{block\.id\}[^>]*>\s*<IncompleteLinkPlaceholder/.test(code("components/onepage/public-onepage.tsx")))
}

section("Add link to Instagram bio")
{
  check("the page's address", instagramBioPath("Ana.Studio") === "/instagram-bio/ana.studio" && instagramBioUrl("https://storelib.com/", "ana") === "https://storelib.com/instagram-bio/ana")
  check("a name is encoded, never a second path", instagramBioPath("a/b") === "/instagram-bio/a%2Fb")
  check("the app first, then Instagram's own profile editor", INSTAGRAM_APP_URL === "instagram://app" && INSTAGRAM_WEB_URL === "https://www.instagram.com/accounts/edit/")
  check("the address as shown", shownAddress("https://storelib.me/ana/") === "storelib.me/ana")
  const route = code("app/(storelib)/instagram-bio/[slug]/page.tsx")
  check("public, never indexed, no Referer", /robots: \{ index: false, follow: false \}/.test(route) && /referrer: "no-referrer"/.test(route))
  check("only a published page, and not a banned owner's", /findPublishedOnePage\(slug\)/.test(route) && /if \(!onepage\) notFound\(\)/.test(route) && /if \(owner\.banned\) notFound\(\)/.test(route))
  check("the address shown is worked out from the page, not taken from the request", /const url = await onePageAddress\(onepage, owner/.test(route) && !/searchParams/.test(route))
  check("instagram-bio is nobody's handle", isReservedWord("instagram-bio"))
  const page = code("components/onepage/instagram-bio-page.tsx")
  check("three steps, a Copy button with the link, Open Instagram", /data-bio-copy=""/.test(page) && /data-bio-open=""/.test(page) && (page.match(/className=\{num\}>[123]</g) ?? []).length === 3)
  const share = code("components/onepage/instagram-bio-share.tsx")
  check("in Share it opens in place, not a second window", /<Reveal open=\{open\}>/.test(share) && !/Dialog|SheetDialog|BottomSheet/.test(share))
  check("the QR code is drawn in the browser with the package the app has", /import\("qrcode"\)/.test(share) && /"qrcode":/.test(code("package.json")))
  check("a page never published says to publish first", /Publish your page first/.test(share))
  check("Share holds the row", /<InstagramBioShare slug=\{onepage\.slug\}/.test(code("components/onepage/onepage-editor.tsx")))
}

section("Handing a OnePage to its creator")
{
  const token = "A".repeat(43)
  const row = (over: Partial<HandoffRow> = {}): HandoffRow => ({
    id: "h1", business_user_id: "biz", creator_id: "c1", from_owner_id: "founder", recipient_email: "ana@example.com", keep_founder: false, founder_access: "full", ttl_days: 7,
    status: "pending", expires_at: new Date(10_000).toISOString(), created_at: new Date(0).toISOString(), last_sent_at: null, send_count: 1, accepted_at: null, accepted_by: null, revoked_at: null, finished_at: null, ...over,
  })
  const ana: Viewer = { loginId: "ana", sessionId: "ana", email: "ana@example.com", emailVerified: true, groupIds: ["ana"] }
  const state = (over: Partial<HandoffRow>, viewer: Viewer | null = ana, now = 5_000) => claimStateOf({ token, handoff: row(over), business: { name: "Ana", avatarUrl: null }, stillFounders: true, viewer, blockers: [], now }).kind
  check("a token is 43 base64url characters, nothing else", tokenShapeOk(token) && !tokenShapeOk("short") && !tokenShapeOk(`${token}=`))
  check("it expires", state({}, ana, 20_000) === "expired")
  check("it is single use", state({ status: "accepted", accepted_by: "someone" }) === "accepted" && refusalOfSql({ message: "handoff_used" }).status === 409)
  check("only the email it was sent to, signed in, can take it", state({}, { ...ana, email: "eve@example.com" }) === "wrong_email" && state({}, null) === "signed_out")
  check("the founder cannot accept their own", state({}, { ...ana, loginId: "founder", groupIds: ["founder", "biz"] }) === "own")
  check("ready for the right person", state({}) === "ready")
  check("a link lasts 1 to 30 days", ttlDays(0) === null && ttlDays(31) === null && ttlDays(undefined) === 7)
  check("the payout account, the plan and the other businesses stay behind", STAYS_BEHIND.some((s) => /payout account/.test(s)) && STAYS_BEHIND.some((s) => /plan, card/.test(s)) && STAYS_BEHIND.some((s) => /other businesses/.test(s)))
  const rowFile = code("components/onepage/handoff-row.tsx")
  check("the OnePage editor shows the way only when the server says this business can be handed over", /setShown\(showsHandoffRow\(body\)\)/.test(rowFile) && /a\.ready === true && a\.eligible === true/.test(rowFile))
  check("never to a team member", /if \(team \|\| !shown\) return null/.test(rowFile))
  check("starting it stays in Settings, Team, where the server checks who asks", /HANDOFF_SETTINGS_HREF = "\/app\/settings\?tab=team"/.test(rowFile) && /founderScope\(deps, sessionUserId\)/.test(code("lib/handoff/server.ts")))
  check("the editor's Settings holds the row", /<OnePageHandoffRow \/>/.test(code("components/onepage/tabs/settings-tab.tsx")))
}

section("No AI in the OnePage editor")
{
  check("the AI line, its edits and its route are gone", !existsSync(join(process.cwd(), "components/onepage/ai-edit-bar.tsx")) && !existsSync(join(process.cwd(), "lib/onepage/ai-edits.ts")) && !existsSync(join(process.cwd(), "app/api/onepage/ai/route.ts")))
  check("the Links tab has no AI line", !/AiEditBar|ai-edit-bar/.test(code("components/onepage/tabs/links-tab.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
