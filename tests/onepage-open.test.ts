/**
 * ===========================================================================
 *  OPENING THE ONEPAGE EDITOR, AND WHAT ITS PREVIEW SHOWS
 * ===========================================================================
 * "Opening the OnePage editor from the app sometimes blocks and doesn't take
 * me there." Measured with the real router (scripts/check-onepage-open.mjs):
 *
 *   the rail's and the menu's OnePage row loaded the editor as a whole new
 *   document: the old page, the cold start's black frame, then the editor,
 *   and a press the router could neither see nor undo
 *
 *   the editor's server page sent a creator whose row did not come back in
 *   time to /onboarding, which is /signup/success and then Home: a press on
 *   OnePage that ended somewhere else. A failed read of the page itself made
 *   a new page, or left the editor on a spinner for ever. And a session the
 *   server could not confirm drew nothing, with nothing coming, when the
 *   editor was opened by a press rather than a load
 *
 *   the first visit's wizard could come up over a set up editor when the
 *   browser's second question about it failed
 *
 * "Preview = live": the preview was a second drawing of the page and differed
 * from the live page in every block (scripts/check-onepage-parity.mjs). It is
 * the live page's own component in a frame now, fed a page built by the same
 * function the live route uses.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { publicOnePage, publicOnePageFromDraft } from "@/lib/onepage/public-shape"
import { untt } from "./i18n-source"

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
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

console.log("\nEvery way in goes by the router")
{
  const sidebar = code("components/app/sidebar.tsx")
  check("the rail's and the menu's OnePage row is an ordinary row, not a document load",
    /\{ href: "\/app\/onepage", label: t\("nav\.onepage"\), icon: NAV_ICONS\.onepage \}/.test(sidebar) && !/"\/app\/onepage"[^\n]*forceNavigation/.test(sidebar))
  const search = code("components/app/app-search.tsx")
  check("the search does not load it as a document either", !/href\.startsWith\("\/app\/onepage"\)/.test(search))
  const share = code("components/app/share/share-storelib.tsx")
  check("Share your Storelib's OnePage setup tells the shell where it is going", /startNavigationLoading\("\/app\/onepage"\)\s*router\.push\("\/app\/onepage"\)/.test(share))
  check("Home's card is an AppLink, as it was", /\{ href: "\/app\/onepage", image: "ooaw\.png"/.test(read("components/app/home/quick-actions.tsx")) && /<AppLink/.test(read("components/app/home/quick-actions.tsx")))
}

console.log("\nThe editor's page always ends somewhere")
{
  const page = code("app/(storelib)/app/onepage/page.tsx")
  check("a session the server could not confirm is recovered in the browser, not drawn as nothing", /if \(!user\) return <SessionRecovery \/>/.test(page) && !/if \(!user\) return null/.test(page))
  /* Bounded and asked at once since tests/onepage-arrival.test.ts: still maybeSingle, still twice before giving up. */
  check("the creator is read with maybeSingle, twice before giving up", /readTwice\(\(signal\) =>\s*createAdminClient\(\)\.from\("creators"\)\.select\("\*"\)\.eq\("user_id", user\.id\)\.abortSignal\(signal\)\.maybeSingle\(\)/.test(page))
  check("a failed read is an error on the editor's own address, not a trip to onboarding", /if \(creatorError\) \{[\s\S]{0,120}throw new Error/.test(page) && /\} else if \(!creator\) redirect\("\/onboarding"\)/.test(page) && !/creatorError \|\| !creator/.test(page))
  /* Production: "[OnePage] Creator fetch error: READ_TIMEOUT no answer in 1492ms", then the whole editor was an error while the page's own read had answered. */
  check("but a slow creator row with the page already read opens the editor", /if \(creatorError\) \{\s*console\.error\([^)]*\)\s*if \(!pageRead\.data\) throw new Error\("The creator could not be read"\)\s*\}/.test(page))
  check("and nothing after that reads the creator row as if it were there", /creatorSocials = \{\s*instagram: \(creator as any\)\?\.instagram/.test(page) && /if \(onepage && creator && !rawOnepage\.instagram/.test(page))
  check("a failed read of the page makes no new page over it", /readTwice\(\(signal\) =>\s*supabase\.from\("onepages"\)\.select\("\*"\)\.eq\("owner_id", user\.id\)\.abortSignal\(signal\)\.maybeSingle\(\)/.test(page) && /if \(fetchError\) \{[\s\S]{0,120}throw new Error/.test(page) && !/fetchError\.code !== "PGRST116"/.test(page))
  check("and no page at all is an error with a Try again, not a spinner for ever", /if \(!onepage\) \{[\s\S]{0,120}throw new Error\("The OnePage could not be made"\)/.test(page))
  check("the tab's title asks Auth nothing of its own", /currentUserForRequest\(\)/.test(page) && /profileForRequest\(user\.id\)/.test(page) && !/auth\.getUser\(\)/.test(page))
  const editor = code("components/onepage/onepage-editor.tsx")
  check("the wizard trusts the row the server read before asking the browser's database", /\(onepage as \{ onboarding_completed\?: boolean \| null \}\)\.onboarding_completed === true\) \{\s*setShowOnboarding\(false\)\s*setOnboardingChecked\(true\)\s*return/.test(editor))
}

console.log("\nThe way in, as the creator page comes in")
{
  const editor = code("components/onepage/onepage-editor.tsx")
  check("the loader waits for the preview to draw, from 768px", /const \[previewDrawn, setPreviewDrawn\] = useState\(false\)/.test(editor) && /<PhonePreview onDrawn=\{\(\) => setPreviewDrawn\(true\)\} \/>/.test(editor))
  check("and never longer than the cap", /const ARRIVE_CAP_MS = 2500/.test(editor) && /window\.setTimeout\(\(\) => \{ if \(!cancelled\) setArrived\(true\) \}, ARRIVE_CAP_MS\)/.test(editor))
  check("on a phone, for the fonts and a frame", /if \(!wide \|\| previewDrawn\) \{\s*const fonts = document\.fonts\?\.ready/.test(editor))
  check("it covers what is under the bar, not the bar: the creator page's canvas loader", /<div className="relative flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">/.test(editor) && /"wb-canvas-loader absolute inset-0 z-10 flex items-center justify-center bg-white"/.test(editor))
  check("and leaves on the creator page's 320ms fade", /const loaderVisible = useLinger\(!arrived, 320\)/.test(editor) && /data-leaving=\{arrived\}/.test(editor))
  check("the phone's Preview is kept once opened", /\(showMobilePreview \|\| mobilePreviewKept\) && \(/.test(editor))
}

console.log("\nThe preview is the live page")
{
  const old = read("components/onepage/phone-preview.tsx")
  check("the old drawing is gone; its path points at the framed live page",
    /export \{ PhonePreview, MobilePreviewContent \} from "\.\/live-preview"/.test(old) && old.split("\n").length < 20)
  check("the editor imports the framed preview", /from "\.\/live-preview"/.test(code("components/onepage/onepage-editor.tsx")))
  const frame = code("components/onepage/preview-document.tsx")
  check("the frame draws the live page's component, and nothing of its own", /<PublicOnePage onepage=\{page as never\} \/>/.test(frame))
  check("it listens only to its own parent on this origin", /e\.origin !== window\.location\.origin \|\| e\.source !== parent/.test(frame))
  /* Changed on purpose (round AS): a report from the footer (help/contact) is answered in the frame too. */
  check("a visitor's writes are answered in the frame, never sent", /const WRITES = \/\^\\\/api\\\/\(onepage\\\/\(track\|leads\|email-capture\)\|subscribe\|checkout\\\/\|download\\\/\|purchases\\\/\|help\\\/contact\)\//.test(read("components/onepage/preview-document.tsx")))
  /* Round 11 changed this on purpose: the owner asked that nothing in the preview take them out of it, a new tab included. */
  check("and a link that would leave stays, with a note that it opens on the live page", /e\.preventDefault\(\)\s*\n\s*showPreviewNotice\("link"\)/.test(frame) && !/window\.open\(a\.href/.test(frame) && /<PreviewNoticeHost \/>/.test(frame))
  const live = code("components/onepage/live-preview.tsx")
  check("the page goes to the frame in the live route's shape", /publicOnePageFromDraft\(onepage as never, \{ displayName: owner\.displayName, liveAvatarUrl: owner\.avatarUrl \}\)/.test(live))
  check("at a phone's width, 390, shown at 287 in the handset", /export const PREVIEW_PHONE_WIDTH = 390/.test(live) && /const SCREEN_W = 287/.test(live))
  check("each preview loads its frame only at the width it is shown at", /useMedia\("\(min-width: 768px\)"\)/.test(live) && /useMedia\("\(max-width: 767px\)"\)/.test(live))
  check("the frame arrives on the creator page's own fade", /drawn \? "creator-frame-in" : "opacity-0"/.test(live))
  check("the frame's address is a route of its own, never listed", existsSync(join(process.cwd(), "app/(storelib)/onepage-preview/page.tsx")) && /robots: \{ index: false, follow: false \}/.test(read("app/(storelib)/onepage-preview/page.tsx")))
  const proxy = code("proxy.ts")
  check("framed only by this origin, and only with embedded=1", /url\.pathname === "\/onepage-preview" \|\|/.test(proxy) && /const framed = framableWhenEmbedded && url\.searchParams\.get\("embedded"\) === "1"/.test(proxy))
  check("and no creator can hold the name", /"onepage-preview"/.test(read("lib/routes/reserved-segments.ts")))
  check("the live route builds its page with the same function", /publicOnePage\(onepage, \{\s*source: "published"/.test(code("lib/onepage/published-page.ts")) && /publishedShape\(onepage, owner, \{/.test(code("app/(storelib)/(marketing)/l/[slug]/page.tsx")))
}

console.log("\nOne shape for the live page and the preview")
{
  const now = Date.parse("2026-09-26T12:00:00.000Z")
  const row = {
    id: "op1", slug: "satori", title: "Draft title", bio: "Draft bio", avatar_url: "draft.png", avatar_video_url: null,
    theme: { background_color: "#000" }, settings: { show_branding: false, avatar_video_crop: { x: 1, y: 2, width: 3, height: 4 } },
    social_links: { instagram: "draft" },
    draft_blocks: [
      { id: "a", type: "divider", enabled: true, sort_order: 0, data: {} },
      { id: "later", type: "divider", enabled: true, sort_order: 1, data: {}, schedule: { start_at: "2027-01-01T00:00:00.000Z" } },
    ],
    published_blocks: [{ id: "p", type: "divider", enabled: true, sort_order: 0, data: {} }],
    published_theme: { background_color: "#fff" },
    published_profile: { title: "Published title", bio: "", avatar_url: null },
    published_social_links: { instagram: "published" },
    seller_id: null, creator_id: "c1",
  }
  const live = publicOnePage(row, { source: "published", displayName: "Profile name", customDomain: "links.satori.studio", sellerId: "c1", now })
  check("published: the published copy first", live.title === "Published title" && live.theme.background_color === "#fff" && live.blocks.map((b) => b.id).join() === "p" && (live.social_links as { instagram: string }).instagram === "published")
  check("published: the row behind a copy that has no value", live.bio === "Draft bio" && live.avatar_url === "draft.png")
  check("published: the domain and the seller as the route found them", live.settings.custom_domain === "links.satori.studio" && live.seller_id === "c1")
  const oldRow = { ...row, published_blocks: null, published_theme: null, published_profile: null, published_social_links: null, title: "" }
  const older = publicOnePage(oldRow, { source: "published", displayName: "Profile name", now })
  check("a page published before the copies existed draws its draft, and a title from the profile", older.blocks.map((b) => b.id).join() === "a" && older.title === "Profile name" && older.theme.background_color === "#000")
  const draft = publicOnePageFromDraft(row, { now })
  check("the editor's draft: the row as it is, a block not yet started left out", draft.title === "Draft title" && draft.blocks.map((b) => b.id).join() === "a" && (draft.social_links as { instagram: string }).instagram === "draft")
  check("the draft keeps the seller the row names, for the bell", draft.seller_id === "c1" && draft.avatar_video_crop?.width === 3)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
