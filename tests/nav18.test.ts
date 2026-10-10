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
 *
 * Run with:  pnpm run test:push
 */
import { readCode, readSource } from "./_source"

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
