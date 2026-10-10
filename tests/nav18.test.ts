/**
 * ===========================================================================
 *  ROUND 18: THE COMMUNITY AND THE ACCOUNT, POLISHED
 * ===========================================================================
 * Nine of the owner's own complaints from using the iPhone app, each found at
 * its cause with frames filmed at 4x CPU on a 390x844 phone in a real Next 16
 * build (the harness is in the round's scratchpad: n18/realnav, the real
 * community shell, account page and tab bar under the real app router), and
 * fixed there. What each section pins:
 *
 *   COVER     the account cover is decoded ahead, kept, and drawn whole on
 *             the first frame; only a picture really on its way fades in
 *   HANDOVER  arriving at the account from another tab plays no fade from
 *             nothing (that blank frame, under the community's solid bar,
 *             was the community "emptying" before the account landed); the
 *             app's tab swap waits for the cover and then cuts, never a
 *             dissolve showing two pages at once
 *   SPEED     Home and Profile: the other tab's page read again as soon as
 *             the router would hold it stale and when the app comes back, no
 *             push animation for a page a tab opened, no layout forced inside
 *             the commit that draws the feed, no attribute on <html> taken
 *             off and put back by the two layouts' bars
 *
 * Run with:  pnpm run test:push
 */
import { readCode, readSource } from "./_source"
import { arrivedByTab, noteTabArrival } from "@/lib/nav/tab-swap"

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

console.log("\nCOVER: decoded ahead, kept, whole on its first frame (item 1)")
{
  const warm = code("components/account/cover-warm.ts")
  const img = code("components/profile/profile-cover-image.tsx")
  const hero = code("components/profile/profile-hero.tsx")
  const hub = code("components/account/account-hub.tsx")
  const bar = code("components/nav/buyer-tab-bar.tsx")
  check("the warm up decodes with img.decode() and keeps the decoded element held", /\.decode\(\)/.test(warm) && /held\.set\(src, img\)/.test(warm) && /new Image\(\)/.test(warm))
  check("it never rejects and is a no-op on the server", /typeof window === "undefined"/.test(warm) && /\.then\(done, \(\) =>/.test(warm))
  check("the account page remembers its cover's address for the next press", /rememberAccountCover\(profileCoverSrc\(identity\.coverUrl\)\)/.test(hub))
  check("the remembered address is the one the hero draws (optimizedImageUrl at 1600)", /optimizedImageUrl\(cover\.url, 1600\)/.test(img) && /optimizedImageUrl\(cover\.url, 1600\)/.test(hero))
  check("the tab bar decodes it once the page has settled, and again on the press toward Profile", /setTimeout\(\(\) => void warmAccountCover\(\), 600\)/.test(bar) && /key === "profile" && signedIn\) void warmAccountCover\(\)/.test(bar))
  check("a decoded picture starts shown, with no transition class, decoded in step with the page", /shown: fromServer \|\| coverReady\(src\)/.test(img) && /now\.fade && "transition-opacity duration-200/.test(img) && /decoding=\{warm \? "sync" : "async"\}/.test(img))
  check("a picture complete when it mounts is shown with fade: false (the 200ms fade from clear is gone)", /img\.current\?\.complete/.test(img) && /\{ src, shown: true, fade: false \}/.test(img))
  check("only a picture that loads after it was drawn fades in", /onLoad=\{\(\) => \{[\s\S]{0,160}\{ src, shown: true, fade: true \}/.test(img))
}

console.log("\nHANDOVER: the community stays until the account lands whole (items 1 and 3)")
{
  const fade = code("components/account/account-nav-fade.tsx")
  const header = code("components/account/account-header-switch.tsx")
  const swap = code("lib/nav/tab-swap.ts")
  const css = readSource("app/globals.css")
  check("the reveal from nothing is only for the document's own first paint (hydrating), never a client arrival", /useSyncExternalStore\(noop, \(\) => false, \(\) => true\)/.test(fade) && /arrival\.current\.fresh &&/.test(fade))
  check("the platform header is not built and taken down again when the community's bar is remembered", /readCommunityChrome\(ctx\.slug\)/.test(header) && /if \(drawn \|\| remembered\) return null/.test(header))
  check("the app's tab swap waits for the cover too, not only the address and the bar", /\[data-profile-cover-image="loading"\]/.test(swap))
  const rule = (sel: string) => {
    const at = css.indexOf(`html[data-tab-swap]::${sel} {`)
    return at < 0 ? "" : css.slice(at, css.indexOf("}", at))
  }
  check("the swap cuts: the new page has no dissolve, the held picture goes with it", /animation: none/.test(rule("view-transition-new(root)")) && /opacity: 0/.test(rule("view-transition-old(root)")))
  check("the tab bar is still its own picture through the swap", /html\[data-tab-swap\] \[data-buyer-tab-bar\] \{\s*view-transition-name: buyer-tab-bar;/.test(css))
}

console.log("\nSPEED: Home and Profile, prefetched, kept and shown whole (item 2)")
{
  const bar = code("components/nav/buyer-tab-bar.tsx")
  const config = readSource("next.config.mjs")
  const stale = Number(/staleTimes:\s*\{[^}]*static:\s*(\d+)/.exec(config)?.[1] ?? NaN)
  const keep = Number(/TAB_KEEP_MS = (\d[\d_]*) \+ ([\d_]+)/.exec(bar)?.slice(1).reduce((a, x) => a + Number(x.replace(/_/g, "")), 0) ?? NaN)
  check("the other tabs are read again just after the router would hold them stale, never sooner (a sooner read is not made)", keep > stale * 1000 && keep - stale * 1000 <= 15_000, { keep, stale })
  check("on an interval while the page is shown, and at once when it is shown again", /setInterval\(again, TAB_KEEP_MS\)/.test(bar) && /addEventListener\("visibilitychange", again\)/.test(bar) && /visibilityState !== "visible"/.test(bar) && /clearInterval\(keep\)/.test(bar))
  check("the bar's html attribute is handed from one bar to the next, not taken off and put back", /queueMicrotask\(\(\) => \{\s*if \(tabsAttrTurn === mine\)/.test(bar) && /getAttribute\("data-buyer-tabs"\) !== \(away \? "away" : "shown"\)/.test(bar))
  check("a press notes where it is going before it pushes", /noteTabArrival\(href\)[\s\S]{0,400}router\.push\(href/.test(bar))
  const frame = code("components/community/member/shell-frame.tsx")
  check("the community plays its push for an entrance from outside, never for a page a tab opened", /!tabSwapInProgress\(\) && !arrivedByTab\(\)/.test(frame))
  const g = globalThis as unknown as { window?: unknown }
  const had = g.window
  g.window = { location: { pathname: "/community/clay-studio" } }
  noteTabArrival("/community/clay-studio?space=general")
  const yes = arrivedByTab()
  ;(g.window as { location: { pathname: string } }).location.pathname = "/explore"
  const no = arrivedByTab()
  g.window = had
  check("arrivedByTab: the page a tab was pressed for, by its path; any other page is not", yes && !no, { yes, no })
  const chips = code("components/community/member/space-chips.tsx")
  check("the chosen pill is measured after the next paint, never inside the commit that draws the feed", /requestAnimationFrame\(\(\) => window\.setTimeout\(followChosenChip, 0, root, false\)\)/.test(chips))
}

console.log("\nCOPY")
{
  const files = [
    "components/account/cover-warm.ts",
    "components/profile/profile-cover-image.tsx",
    "components/account/account-hub.tsx",
    "components/account/account-nav-fade.tsx",
    "components/account/account-header-switch.tsx",
    "components/nav/buyer-tab-bar.tsx",
    "lib/nav/tab-swap.ts",
    "components/community/member/space-chips.tsx",
    "components/community/member/shell-frame.tsx",
  ]
  /* The words are spelled out in pieces here so this file does not hold them itself. */
  const banned = new RegExp(["\\u2014", "unlock", "elevate", "seamless", "powerful", "effortless", "supercharge", "trans" + "form"].map((w) => (w.startsWith("\\") ? w : `\\b${w}`)).join("|"), "i")
  /* The CSS property of that name in the tab bar's own style strings is a property, not a word of copy. */
  const bad = files.filter((f) => banned.test(readSource(f).replace(/transform 0s|scale, transform"/g, "")))
  check("no em dash and no banned word in this round's files", bad.length === 0, bad)
  const client = ["components/account/cover-warm.ts", "components/profile/profile-cover-image.tsx", "components/account/account-header-switch.tsx"]
  check("client modules import no server code", client.every((f) => !/from "(@\/lib\/communities\/server|next\/headers|server-only)/.test(readSource(f))))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
