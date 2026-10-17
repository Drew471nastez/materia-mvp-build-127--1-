/**
 * ROUND 26 (W4): the community's About page and its info card.
 *
 *   WORDS     the one button from the real configuration: "Join $24/month", "Join $240/year", "Join free",
 *             "Start free trial" (a recurring plan with a trial), "Choose plan" (several), "Request to join"; the
 *             phone's bar draws the same words as the card
 *   ROW       the row under the name keeps members and the price; the admins moved to the card's facts
 *   SUMMARY   the card's short description: the creator's, else the tagline, else the description's start, cut at a word
 *   SHARE     who may share from the card: published, not archived; a private community only its staff
 *   DELETING  the people who run a community see the day its scheduled deletion happens; nobody else
 *   SOURCE    no Membership block and no "Other ways to join", "What's inside", the icons in the card and not under the
 *             name, Powered by under the card linking to storelib.com, Privacy and Terms, the gallery's thumbnails
 *             without the dark look's floating box, the editor's markers kept, the summary read without breaking the
 *             page before part 220, the trial read from the plan
 *
 * scripts/check-about26.mjs measures the page in a browser (1440, 820, 390; light and dark; free, paid, trial, invite).
 */
import { readCode } from "./_source"
import { decideJoin } from "@/components/community/public/join-state"
import { aboutFacts, aboutRow, canShareCommunity, cardSummary, SUMMARY_MAX } from "@/components/community/public/about-facts"
import { buttonLabel } from "@/components/community/public/join-words"
import { JOIN_TRIAL_LABEL, joinButtonLabel } from "@/lib/communities/format"
import type { JoinOption } from "@/components/community/public/types"
import { deletionNotice } from "@/lib/communities/server/public"

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

const paid: JoinOption = {
  tierId: "t-paid",
  name: "Studio",
  description: null,
  kind: "paid",
  billing: "recurring",
  productId: "p1",
  monthlyCents: 2400,
  yearlyCents: 24000,
  priceCents: null,
  currency: "usd",
  priceLine: "$24/month",
  benefits: [],
  checkout: { month: "/checkout?m", year: "/checkout?y", once: null },
}
const free: JoinOption = { ...paid, tierId: "t-free", kind: "free", billing: null, productId: null, monthlyCents: null, yearlyCents: null, priceLine: "Free", checkout: null }
const viewer = { signedIn: true, active: false, status: null, role: null, isOwner: false, banned: false, approved: false, source: null, membershipId: null }
const community = { slug: "clay", status: "published" as const, access: "paid" as "paid" | "free" | "invite_only", visibility: "public" as "public" | "private" | "unlisted", approvalRequired: false, suspended: false, archived: false, creatorName: "Mara" }
const decide = (options: JoinOption[], over: Partial<typeof community> = {}, who: Partial<typeof viewer> = {}) =>
  decideJoin({ community: { ...community, ...over }, viewer: { ...viewer, ...who } as never, options, accessProducts: [], canTakePayments: true })

console.log("\nWORDS: the one button")
{
  const pay = decide([paid])
  check("paid: Join $24/month", pay.kind === "checkout" && pay.label === "Join $24/month", pay.label)
  check("yearly on the card: Join $240/year", buttonLabel(pay, "year") === "Join $240/year" && buttonLabel(pay, "month") === "Join $24/month", buttonLabel(pay, "year"))
  const trial = decide([{ ...paid, trialDays: 7 }])
  check("a trial: Start free trial, whatever the interval", trial.label === JOIN_TRIAL_LABEL && buttonLabel(trial, "year") === "Start free trial")
  const waiting = decide([{ ...paid, trialDays: 7 }], {}, { status: "pending" as never, approved: true })
  check("an approved request still starts the trial", waiting.label === JOIN_TRIAL_LABEL, waiting.label)
  check("a one time tier: Join $49", joinButtonLabel({ isMember: false, priceLine: "$49" }) === "Join $49")
  const several = decide([paid, { ...paid, tierId: "t-pro", monthlyCents: 4900, yearlyCents: null, priceLine: "$49/month" }])
  check("several plans: Choose plan, on the card and the bar alike (the plan picker is the monetization work's)", several.label === "Choose plan" && buttonLabel(several, "year") === "Choose plan", several.label)
  const f = decide([free], { access: "free" })
  check("free: Join free", f.kind === "join_free" && f.label === "Join free", f.label)
  check("approval: Request to join", decide([free], { access: "free", approvalRequired: true }).label === "Request to join")
  check("no word says \"Join for\" any more", !/Join for/.test(joinButtonLabel({ isMember: false, priceLine: "$9/month" })) && !/Join for/.test(code("components/community/public/join-controls.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")))
  const controls = code("components/community/public/join-controls.tsx")
  check("the phone's bar draws the same button, with no shorter words", !/short=\{/.test(controls) && /const label = own \|\| buttonLabel\(join, interval\)/.test(controls))
}

console.log("\nROW and FACTS: the admins in the card")
{
  const row = aboutRow({ visibility: "public", options: [] }, { members: 1284, online: 12, admins: 3 }, { kind: "paid", priceLine: "$24/month" })
  check("the row keeps who it is for, members, online, the price; no admins", row.map((r) => r.key).join() === "visibility,members,online,price", row)
  const facts = aboutFacts({ visibility: "public", creator: null }, { members: 9, online: null, admins: 2 }, null)
  check("the card's facts carry the admin count", facts.some((f) => f.key === "admins" && f.value === "2" && f.label === "Admins"))
  check("one admin reads Admin; none known, none drawn", aboutFacts({ visibility: "public", creator: null }, { members: 9, online: null, admins: 1 }, null).some((f) => f.key === "admins" && f.label === "Admin") && !aboutFacts({ visibility: "public", creator: null }, { members: 9, online: null, admins: null }, null).some((f) => f.key === "admins"))
}

console.log("\nSUMMARY: the card's short description")
{
  check("the creator's own first", cardSummary({ summary: "  A calm club.  ", tagline: "Line", descriptionPlain: "Long" }) === "A calm club.")
  check("else the tagline, else the description", cardSummary({ summary: "", tagline: "Pots at home", descriptionPlain: "x" }) === "Pots at home" && cardSummary({ summary: null, tagline: null, descriptionPlain: "Hello\n\nthere" }) === "Hello there")
  const long = "word ".repeat(80)
  const cut = cardSummary({ descriptionPlain: long }) ?? ""
  check(`a long description is cut at a word, at most ${SUMMARY_MAX} characters, with an ellipsis`, Array.from(cut).length <= SUMMARY_MAX && cut.endsWith("…") && !/wor…$/.test(cut), cut.length)
  check("nothing to say is null", cardSummary({}) === null && cardSummary({ summary: "   " }) === null)
}

console.log("\nSHARE: who may share from the card")
{
  check("a public or unlisted published community: anybody", canShareCommunity({ status: "published", visibility: "public", access: "paid" }, { staff: false }) && canShareCommunity({ status: "published", visibility: "unlisted", access: "free" }, { staff: false }))
  check("a private one: only its staff", !canShareCommunity({ status: "published", visibility: "private", access: "paid" }, { staff: false }) && !canShareCommunity({ status: "published", visibility: "public", access: "invite_only" }, { staff: false }) && canShareCommunity({ status: "published", visibility: "private", access: "paid" }, { staff: true }))
  check("a draft or an archived one: nobody", !canShareCommunity({ status: "draft", visibility: "public" }, { staff: true }) && !canShareCommunity({ status: "published", archived: true, visibility: "public" }, { staff: true }) && !canShareCommunity({ status: "archived", visibility: "public" }, { staff: true }))
  const share = code("components/community/public/share-community.tsx")
  check("it shares the public address only: copy, the system sheet, a QR code, the pill toast", /https:\/\/storelib\.com\$\{communityPath\(slug\)\}/.test(share) && /navigator\.share\(/.test(share) && /import\("qrcode"\)/.test(share) && /showPillToast\(ok \? "Link copied"/.test(share) && !/invite/i.test(share.replace(/\/\*[\s\S]*?\*\//g, "")))
  const wall = code("components/community/member/wall.tsx")
  check("the member's card offers it too, by the same rule", /canShareCommunity\(/.test(wall) && /<CommunityShareButton /.test(wall) && /<CardSummary /.test(wall) && /<SocialLinks /.test(wall))
}

console.log("\nSOURCE: the page")
{
  const page = code("components/community/public/sales-page.tsx")
  check("no Membership block, no Other ways to join", !/data-community-membership/.test(page) && !/<PricingCard/.test(page) && !/Other ways to join|Ways to join/.test(page))
  check("What's inside, never What members get", /What&apos;s inside/.test(page) && !/What members get/.test(page))
  check("one h1, the name", (page.match(/<h1\b/g) || []).length === 1)
  check("the icons are not in the header any more", !/<header[\s\S]*?<SocialLinks[\s\S]*?<\/header>/.test(page))
  check("Privacy and Terms are Storelib's legal pages", /href="https:\/\/storelib\.com\/legal\/privacy"/.test(page) && /href="https:\/\/storelib\.com\/legal\/terms"/.test(page) && /data-community-legal/.test(page))
  check("the full description is still the sanitized rich text", /dangerouslySetInnerHTML=\{\{ __html: c\.descriptionHtml \}\}/.test(page))
  check("the editor's markers are kept: summary, links, benefits, description, name, tagline, gallery", ["summary", "links", "benefits", "description", "name", "tagline", "gallery"].every((b) => page.includes(`block="${b}"`) || page.includes(`data-page-block="${b}"`)))
  check("a community entered by one of several products still lists them where its button points", /id="ways-to-join"/.test(page) && /join\.kind === "product" && c\.accessProducts\.length > 1/.test(page))
  const controls = code("components/community/public/join-controls.tsx")
  check("Powered by and the Storelib logo under the card, linking to storelib.com", /data-powered-by/.test(controls) && /href="https:\/\/storelib\.com"/.test(controls) && /<StorelibLogo /.test(controls) && /<PoweredBy \/>/.test(controls))
  check("checkout is untouched: the press still goes to the tier's own checkout on the chosen interval", /const href = checkoutHref\(join\.option, interval\)/.test(controls))
  const gallery = code("components/community/public/gallery-view.tsx")
  check("the chosen thumbnail's ring sits on the sheet's own ground, not white, in the dark look", /ring-offset-\[color:var\(--sl-surface,#fff\)\]/.test(gallery) && !/ring-offset-white/.test(gallery))
  check("a change in the number of slides starts a fresh gallery engine rather than updating one in place (W5's note)", /<MediaSwiper key=\{count\}/.test(gallery))
  const dark = code("app/theme-dark.css")
  check("a row of thumbnails (a horizontal listbox) does not float like a menu in the dark look", /\[role="listbox"\]:not\(\[aria-orientation="horizontal"\]\)/.test(dark) && /aria-orientation="horizontal"/.test(gallery))
  const server = code("lib/communities/server/public.ts")
  check("the summary is read softly (W6's reader), so the page keeps working before part 220", /readCommunitySummary\(db, community\.id\)/.test(server) && /summary,\s*adminCount:/.test(server))
  check("the trial comes from the membership plan", /monthly_price_cents, yearly_price_cents, currency, trial_days/.test(server) && /trialDays: recurring \? Math\.max\(0, Number\(plan\?\.trial_days/.test(server))
}

console.log("\nDELETING: the line its staff see")
{
  check("a scheduled deletion reads as its day", deletionNotice("2026-11-05T09:00:00Z") === "This community is being deleted on Nov 5, 2026.", deletionNotice("2026-11-05T09:00:00Z"))
  check("none, none", deletionNotice(null) === null && deletionNotice("x") === null)
  const server = code("lib/communities/server/public.ts")
  check("asked only for staff, from the scheduled row, and it comes first", /staff \? scheduledDeletionAt\(db, community\.id\) : Promise\.resolve\(null\)/.test(server) && /\.eq\("state", "scheduled"\)/.test(server) && /const deleting = staff \? deletionNotice\(deleteAt\) : null/.test(server))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
