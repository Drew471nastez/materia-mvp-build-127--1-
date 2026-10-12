/**
 * EVERY CREATOR PAGE HAS ITS TOP BAR AGAIN
 *
 *   npx tsx tests/topbar25.test.ts
 *
 * The owner, round 25, with storelib.com/andrewrullz open in a signed out
 * window (screenshot 92): "the top bars of the creator pages are missing",
 * and "in the creator page editor as well, it should be there".
 *
 * Round 14 took the creator's newsletter bar off every creator page because
 * the owner did not want it "especially when I arrive from a community", and
 * left the slim top bar (back chevron, photo, name) to stand in for it. The
 * slim bar only draws when there is a way back, so a page opened cold had no
 * top bar at all, and the editor lost the bar and its pencil.
 *
 * The rule now (lib/storefront/subscribe-bar-visibility.ts): opened on its
 * own, and in the editor, the creator page opens on its newsletter bar, the
 * owner's with the pencil; from a community it opens on the slim bar with
 * the way back, always drawn. A person's profile keeps the slim bar.
 */
import { readFileSync } from "node:fs"
import { cameFromCommunity, showsSubscribeBar } from "../lib/storefront/subscribe-bar-visibility"
import { communityBackTarget } from "../lib/profile/back"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(p, "utf8")
/** Source without comments, so a check reads code and not the notes about it. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

console.log("Which top bar")
{
  check("a creator page opened on its own opens on the newsletter bar", showsSubscribeBar({ creatorPage: true, fromCommunity: false }))
  check("  from a community it does not (the slim bar with the way back instead)", !showsSubscribeBar({ creatorPage: true, fromCommunity: true }))
  check("  a person's profile never has it: there is no list to join", !showsSubscribeBar({ creatorPage: false }) && !showsSubscribeBar())

  check("?from=community is a community arrival", cameFromCommunity({ from: "community" }))
  check("  so is a checked ?back= community place", cameFromCommunity({ backTarget: communityBackTarget("/community/clay?profile=sam") }))
  check("  and a Referer inside a community", cameFromCommunity({ referer: "/community/clay" }) && cameFromCommunity({ referer: "/community/clay/members" }))
  check("  Explore, search, a reload, a shared link and the editor are not", [
    { from: "explore" },
    { referer: "/explore" },
    { referer: "/search?q=x" },
    { referer: "/andrewrullz" },
    { referer: "/creator-page" },
    { referer: "/communityx" },
    { backTarget: communityBackTarget("https://evil.example/community/x") },
    {},
  ].every((c) => !cameFromCommunity(c)))
}

console.log("\nThe creator page draws it")
{
  const page = code("app/(marketing)/u/[username]/page.tsx")
  check("the page asks the rule, with the server's view of where the visit came from", /const newsletterBar = embedded \|\| showsSubscribeBar\(\{ creatorPage: true, fromCommunity: cameFromCommunity\(\{ from, backTarget, referer: cameFrom \}\) \}\)/.test(page))
  check("  both branches (configured page and defaults) draw the bar when it says so", (page.match(/\{newsletterBar && \(/g) ?? []).length === 2)
  check("  and the slim bar otherwise, always, not only when there is a way back", (page.match(/\{!embedded && !newsletterBar \? \(\s*<ProfileTopBar\s+always/g) ?? []).length === 2)
  check("only the owner gets the bar with the pencil (LiveSubscribeBar), a visitor the plain one", /viewerIsOwner \? \(\s*<LiveSubscribeBar/.test(page) && /\) : \(\s*<SubscribeBar\s+settings=/.test(page))
  check("  the way back is the bar's first thing when there is a page of ours behind", (page.match(/leading=\{!embedded \? <TopBarBack initiallyShown=\{backShown\} \/> : undefined\}/g) ?? []).length === 3)
  check("the bar's colours are the scheme's (chrome.bar), as before it went missing", /buildSubscribeBarSettings\(headerSettings, chrome\.bar\)/.test(page))
  check("the bar is above the cover: before the header renderer in the configured branch", page.indexOf("{newsletterBar && (") < page.indexOf("<ShopHeaderRenderer"))
}

console.log("\nThe creator page editor shows it")
{
  const page = code("app/(marketing)/u/[username]/page.tsx")
  check("framed in the workspace (?embedded=1) the bar is drawn whatever the Referer", /newsletterBar = embedded \|\|/.test(page))
  const canvas = code("components/store-builder/preview-canvas.tsx")
  check("the sections editor's canvas draws the bar above the header", /<EditorSubscribeBar/.test(canvas) && canvas.indexOf("<EditorSubscribeBar") < canvas.indexOf("<UnifiedShopHeader"))
  check("  selectable, so its settings open", /isSelected=\{isEditorMode && selectedSectionId === "subscribe-bar"\}/.test(canvas))
  const sidebar = code("components/store-builder/sections-sidebar.tsx")
  check("  and it has its row in the list, first, with no switch that does nothing", /data-section-row="subscribe-bar"/.test(sidebar) && !/subscribeBar: \{ \.\.\.currentSettings, visible: !currentSettings\.visible \}/.test(sidebar))
  check("  whose settings panel is still there", /selectedSectionId === "subscribe-bar" && currentPageType === "shop" && subscribeBarSettings/.test(sidebar))
}

console.log("\nA person's profile is unchanged")
{
  const person = code("components/profile/member-profile-page.tsx")
  check("its top bar is the slim one, always drawn, and no newsletter bar", /<ProfileTopBar[\s\S]{0,200}always/.test(person) && !/<SubscribeBar|<LiveSubscribeBar/.test(person))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
