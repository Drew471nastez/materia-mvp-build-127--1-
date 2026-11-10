/**
 * Round AR, track 6: the OnePage editor's UX, sharing, the admin handoff
 * and the AI edits.
 *
 *   - one compact picture row for every picture field in the editor (the
 *     cover, the group's picture), and long descriptions that grow
 *   - the form builder's save round trip: every question type and every
 *     setting comes back as it was sent, drafts and publish
 *   - click a block in the phone preview: the message mapping
 *   - Share › Add link to Instagram bio, and its public page
 *   - the handoff's token rules, and the way to it from the OnePage editor
 *   - the AI's edits to social icons, the social links block and link
 *     blocks, checked as a change by hand is
 *
 * scripts/check-onepage-ar6.mjs measures the editor in a browser at 390
 * and 1440.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { grownHeight, GROW_MAX_PX } from "@/components/onepage/grow-textareas"
import { draftForSave, typedHttpsUrl, validateDefinition, type FormDefinition } from "@/lib/forms/definition"
import { blockIdAt, notePreviewPick, pickAction, takePreviewPick, validBlockId } from "@/lib/onepage/preview-select"
import { INSTAGRAM_APP_URL, INSTAGRAM_WEB_URL, instagramBioPath, instagramBioUrl, shownAddress } from "@/lib/onepage/instagram-bio"
import { aiLinkUrl, applyAiEdits, readAiEdit, AI_EDIT_TOOLS, MAX_AI_EDITS } from "@/lib/onepage/ai-edits"
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

section("The AI's edits to social icons, the social links block and link blocks")
{
  let n = 0
  const newId = () => `block_ai_${++n}`
  const page = {
    social_links: { instagram: "https://instagram.com/old" },
    draft_blocks: [
      { id: "hdr", type: "header", enabled: true, sort_order: 0, data: {} },
      { id: "l1", type: "link_button", enabled: true, sort_order: 1, data: { label: "Shop", url: "https://ana.example.com/shop" } },
      { id: "p1", type: "product", enabled: true, sort_order: 2, data: { product_id: "x" } },
    ],
  }
  const r = applyAiEdits(page, [
    { op: "set_social", platform: "tiktok", value: "@ana" },
    { op: "set_social", platform: "instagram", value: "https://www.instagram.com/ana_new/" },
    { op: "set_social", platform: "youtube", value: "https://evil.example.com/x" },
    { op: "remove_social", platform: "twitter" },
    { op: "add_link", label: "Book a call", url: "cal.example.com/ana", after_id: "l1" },
    { op: "add_link", label: "Bad", url: "javascript:alert(1)" },
    { op: "update_link", id: "l1", url: "ana.example.com/new-shop" },
    { op: "update_link", id: "p1", label: "Not a link" },
    { op: "social_block", style: "buttons" },
    { op: "drop_table" },
  ], { newId })
  check("a handle becomes the profile link, as the social sheet saves it", r.page.social_links.tiktok === "https://tiktok.com/@ana")
  check("a pasted profile link is cleaned", r.page.social_links.instagram === "https://instagram.com/ana_new")
  check("another site for a platform is refused", !r.page.social_links.youtube && r.refused.some((s) => /youtube/.test(s)))
  check("removing an icon that is not there says so", r.refused.some((s) => /twitter/.test(s)))
  const ids = r.page.draft_blocks.map((b) => b.id)
  check("a new link goes where it was asked, its address made whole", ids.join() === "hdr,block_ai_2,l1,block_ai_1,p1" && r.page.draft_blocks.find((b) => b.id === "block_ai_1")?.data?.url === "https://cal.example.com/ana")
  check("a script address is never a link", !r.page.draft_blocks.some((b) => b.data?.label === "Bad") && aiLinkUrl("javascript:alert(1)") === null && aiLinkUrl("data:text/html,x") === null && aiLinkUrl("https://user:pw@x.com") === null)
  check("a link's address changed, its old preview gone", r.page.draft_blocks.find((b) => b.id === "l1")?.data?.url === "https://ana.example.com/new-shop")
  check("only link blocks are changed as links", r.page.draft_blocks.find((b) => b.id === "p1")?.data?.label === undefined && r.refused.some((s) => /not on the page/.test(s)))
  check("the social links block is made under the header when there is none", r.page.draft_blocks[1]?.type === "social_row" && r.page.draft_blocks[1]?.data?.style === "buttons")
  check("an edit nobody asked for is refused", r.refused.some((s) => /could not be read/.test(s)) && readAiEdit({ op: "drop_table" }) === null)
  check("the order is renumbered", r.page.draft_blocks.every((b, i) => b.sort_order === i))
  check("the original page is untouched", page.draft_blocks.length === 3 && page.social_links.instagram === "https://instagram.com/old")
  const removed = applyAiEdits(r.page, [{ op: "remove_link", id: "l1" }, { op: "remove_social", platform: "tiktok" }, { op: "social_block", show: false }], { newId })
  check("remove a link, an icon, hide the block", !removed.page.draft_blocks.some((b) => b.id === "l1") && removed.page.social_links.tiktok === null && removed.page.draft_blocks.find((b) => b.type === "social_row")?.enabled === false)
  const many = applyAiEdits(page, Array.from({ length: MAX_AI_EDITS + 5 }, (_, i) => ({ op: "add_link", label: `L${i}`, url: "https://x.example.com" })), { newId })
  check("at most twenty edits at once", many.page.draft_blocks.length === 3 + MAX_AI_EDITS && many.refused.length === 1)
  check("one tool per edit", AI_EDIT_TOOLS.map((t) => t.name).join() === "set_social,remove_social,add_link,update_link,remove_link,social_block")
  const route = code("app/api/onepage/ai/route.ts")
  check("the route asks who is signing in and whose page it is, as saving does", /routeUser\(\)/.test(route) && /onePageActor\(supabase, user\.id\)/.test(route) && /\.eq\("owner_id", actor\.pageOwnerId\)/.test(route))
  check("rate limited", /bucket: "onepage-ai"/.test(route))
  check("the key stays on the server; without it the answer says so", /process\.env\.ANTHROPIC_API_KEY/.test(route) && /The AI is not set up on Storelib yet/.test(route) && !/apiKey/.test(code("components/onepage/ai-edit-bar.tsx")))
  check("the route only hands back edits read into their shapes", /readAiEdit\(\{ \.\.\.\(part\.input as Record<string, unknown>\), op: part\.name \}\)/.test(route))
  const bar = code("components/onepage/ai-edit-bar.tsx")
  check("the editor applies them with the same checks, in one Undo step", /applyAiEdits\(/.test(bar) && /updateOnePage\(\{ social_links:/.test(bar))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
