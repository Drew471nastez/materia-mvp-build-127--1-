/**
 * ===========================================================================
 *  THE PHONE'S BOTTOM BAR: HOME, THE SHEET'S FOOT, THE GLASS AND THE DEPTH
 * ===========================================================================
 *   HOME      the community stays Home from Profile, Search and Library, and
 *             a press answers the context AS IT IS PRESSED, not as the last
 *             render saw it; the printed boot script answers a press that
 *             lands before React is running, which is why it did not work
 *   SHEET     somebody who does not sell is offered Start creating quietly;
 *             a seller's Dashboard is the one solid button, as before
 *   GLASS     no layout read and no React render inside the gesture, the x
 *             clamped and the y ignored, a fuller drop, keyframes at 240Hz
 *   DEPTH     one soft lift: less of the close shadow, more of the wide one
 *
 *   Run with:  npx tsx tests/nav-feel.test.ts   (or npm run test:push)
 *
 *   The browser side is scripts/check-buyer-tab-bar.mjs and
 *   scripts/check-community-tab-bar.mjs.
 */
import { readCode, readSource } from "./_source"
import { buyerTabFor, buyerTabsAt, buyerTabsBelongOn, communityOf } from "@/lib/nav/buyer-tabs"
import { navigatorModel, SIGNED_OUT_PLACES, type PlacesResponse } from "@/lib/nav/places-shared"
import {
  COMMUNITY_CONTEXT_KEY,
  COMMUNITY_HOME_BOOT,
  COMMUNITY_HOME_BOOT_FLAG,
  COMMUNITY_HOME_LIVE_FLAG,
  ENDS_COMMUNITY_CONTEXT,
} from "@/lib/nav/community-context"

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

const BAR = "components/nav/buyer-tab-bar.tsx"
const LENS = "components/nav/tab-lens.tsx"
const NAV = "components/nav/place-navigator.tsx"
const bar = readCode(BAR)
const lens = readCode(LENS)
const nav = readCode(NAV)

/* ───────────────────────────────────────────────────────────────────────────
   HOME: THE COMMUNITY YOU ARE IN
   ─────────────────────────────────────────────────────────────────────────── */

console.log("\nHOME: the sequence the owner reported, step by step")
{
  /*
    "If I am inside a community and then click on Profile in the mobile
    navigation bar, and then click on Search, and then Library, and then click
    back on Home, Home should not take me to Explore."

    The addresses of that sequence, through the one function the bar asks. A
    community is entered; every page after it keeps its Home; and the tab lit
    is the page's own.
  */
  const slug = "clay-studio"
  const inside = communityOf(`/community/${slug}/space/general`)
  check("inside a community the address alone says which one", inside === slug)
  const after = ["/account", "/explore/search", "/account/library", "/wishlist", "/receipt/tok"]
  const homes = after.map((p) => buyerTabsAt(p, true, slug)[0].href)
  check("Profile, Search, the library, the wishlist and a receipt all keep the community as Home", homes.every((h) => h === `/community/${slug}`), homes)
  const lit = after.map((p) => buyerTabFor(p, { homeCommunity: slug }))
  check("and each lights its own tab, not Home", JSON.stringify(lit) === JSON.stringify([3, 1, 2, 2, 2]), lit)
  check("the bar is drawn on every one of them for signed-in members", [`/community/${slug}`, ...after].every((p) => buyerTabsBelongOn(p, { exploreMarketplaceEnabled: true, signedIn: true })))
  check("only the navigator's three ways out end it", ["explore", "discover-communities", "dashboard"].every((k) => ENDS_COMMUNITY_CONTEXT.has(k)) && !["start-creating", "log-in"].some((k) => ENDS_COMMUNITY_CONTEXT.has(k)))
}

console.log("\nHOME: the press reads the context again, as it is pressed")
{
  /*
    THE ROOT CAUSE. The community is held in the browser alone, so the server
    renders Home as /explore and so does the first (hydrating) render: the
    store's own answer is null there by design. Everything above was already
    true, and the bar still took people to Explore, because the thing that
    navigates is not the function, it is the link in the page and the press on
    it. So two things must hold, and neither did.
  */
  check("the press works the tabs out from the context at the moment of the press", /const tabsNow = \(\) => \(community \? tabs : buyerTabsAt\(pathname, exploreMarketplaceEnabled, communityContext\(\)\)\)/.test(bar))
  check("and the pick uses those, not the render's copy", /const now = tabsNow\(\)/.test(bar) && /const tab = now\[index\]/.test(bar) && /const href = hrefOf\(index, now\)/.test(bar))
  check("the fallback address reads it live too", /const home = community \|\| \(from === tabs \? homeCommunity : communityContext\(\)\)/.test(bar))
  check("the bar prints the boot script with itself", /COMMUNITY_HOME_BOOT/.test(bar) && /<script dangerouslySetInnerHTML=\{\{ __html: COMMUNITY_HOME_BOOT \}\} \/>/.test(bar))
}

console.log("\nHOME: the boot script, run")
{
  /**
   * The script itself, run against a stub window: it is what answers a press
   * that lands before any of React is running, which on a phone is the whole
   * of a cold load. Four globals, nothing else.
   */
  function run(stored: string | null, fresh = true, barLive = false) {
    const clicks: ((e: unknown) => void)[] = []
    let went: string | null = null
    const win: Record<string, unknown> = {}
    if (!fresh) win[COMMUNITY_HOME_BOOT_FLAG] = 1
    if (barLive) win[COMMUNITY_HOME_LIVE_FLAG] = 1
    const addEventListener = (type: string, f: (e: unknown) => void, capture?: boolean) => {
      if (type === "click" && capture === true) clicks.push(f)
    }
    const sessionStorage = { getItem: (k: string) => (k === COMMUNITY_CONTEXT_KEY ? stored : null) }
    const location = { set href(v: string) { went = v } }
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function("window", "addEventListener", "sessionStorage", "location", COMMUNITY_HOME_BOOT)(win, addEventListener, sessionStorage, location)
    const press = (href: string | null, tab = "home", over = { button: 0, prevented: false }) => {
      const anchor = { getAttribute: () => href }
      const e = {
        defaultPrevented: over.prevented,
        button: over.button,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        target: { closest: (sel: string) => (href !== null && sel === `a[data-buyer-tab="${tab}"]` ? anchor : null) },
        preventDefault() { e.defaultPrevented = true },
      }
      for (const f of clicks) f(e)
      return { went, prevented: e.defaultPrevented }
    }
    return { listeners: () => clicks.length, press }
  }

  const live = run("clay-studio")
  const a = live.press("/explore")
  check("a press on Home before the page is awake goes to the community, and the link is not followed", a.went === "/community/clay-studio" && a.prevented, a)
  const caught = run("clay-studio").press("/community/clay-studio")
  check("once the bar has caught up the script is inert: Home already points there", caught.went === null && !caught.prevented, caught)
  check("with no community there is nothing to go back to", run(null).press("/explore").went === null)
  check("a stored word that is not a slug is ignored", run("../evil").press("/explore").went === null && run("Clay Studio").press("/explore").went === null)
  check("a press on another tab is not touched", run("clay-studio").press("/account/library", "library").went === null)
  check("nor a press on nothing", run("clay-studio").press(null).went === null)
  const mod = run("clay-studio").press("/explore", "home", { button: 1, prevented: false })
  check("nor a middle click, nor a press the page has already answered", mod.went === null && run("clay-studio").press("/explore", "home", { button: 0, prevented: true }).went === null)
  check("the copy React re-inserts on the next page adds no second listener", run("clay-studio", false).listeners() === 0)

  /*
    AND THE SEAM: the bar hydrates a moment before the store corrects the
    href, and in that moment the bar's own gesture answers the press. Both
    answering it would mean a whole page load thrown over a step inside the
    app, to the same place. So a mounted bar raises a flag and the listener
    yields to it, href or no href.
  */
  const seam = run("clay-studio", true, true).press("/explore")
  check("a bar that is mounted answers its own press: the listener yields even on a stale href", seam.went === null && !seam.prevented, seam)
  check("  the flag is read on every press, not once when the script runs", new RegExp(`addEventListener\\("click",function\\(e\\)\\{if\\(w\\.${COMMUNITY_HOME_LIVE_FLAG}\\)return;`).test(COMMUNITY_HOME_BOOT))
  check("  and the bar raises it in a layout effect, in the commit it hydrates in", /useLayoutEffect\(\(\) => \{\n\s+const w = window as unknown as Record<string, unknown>\n\s+w\[COMMUNITY_HOME_LIVE_FLAG\] = 1/.test(bar) && /delete w\[COMMUNITY_HOME_LIVE_FLAG\]/.test(bar))
}

/* ───────────────────────────────────────────────────────────────────────────
   SHEET: THE FOOT OF THE NAVIGATOR
   ─────────────────────────────────────────────────────────────────────────── */

console.log("\nSHEET: Start creating for somebody who does not sell")
{
  const who = (over: Partial<PlacesResponse> = {}): PlacesResponse => ({ signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: false, recent: [], ...over })
  const buyer = navigatorModel(who()).actions
  const seller = navigatorModel(who({ hasSellerAccess: true, isCreator: true })).actions
  const begun = navigatorModel(who({ isCreator: true })).actions
  const guest = navigatorModel(SIGNED_OUT_PLACES).actions
  check("a signed in person who does not sell is offered Start creating, quietly, at /sell", buyer.length === 1 && buyer[0].key === "start-creating" && buyer[0].href === "/sell" && buyer[0].quiet === true && buyer[0].primary === false, buyer)
  check("a seller still gets Dashboard, the one solid button, exactly as before", seller.length === 1 && seller[0].key === "dashboard" && seller[0].href === "/app" && seller[0].primary === true && !seller[0].quiet, seller)
  check("somebody who began selling and has not finished is not a seller yet, by the same rule the route reads", begun.length === 1 && begun[0].key === "start-creating" && begun[0].quiet === true, begun)
  /* Changed on purpose (round 33): the owner asked for Log in and Sign up signed out, not Start creating. */
  check("signed out: Log in and Sign up, both buttons", guest.map((x) => x.key).join() === "log-in,sign-up" && guest.every((x) => !x.quiet), guest)
  check("whether somebody sells is hasSellerAccess and nothing new", /places\.hasSellerAccess/.test(readCode("lib/nav/places-shared.ts")) && /readSellerAccess\(db, userId\)/.test(readCode("lib/nav/places-server.ts")))
  check("the quiet row is the row shape of the ways out, in grey, with a Solar line shop", /data-navigator-quiet=""/.test(nav) && /cn\(row, "text-\[#6b7280\] hover:text-\[#1a1a2e\]"\)/.test(nav) && /from "@solar-icons\/react\/linear\/shop"/.test(nav))
  check("no gradient and no second rule for who sells", !/gradient/i.test(nav) && !/isCreator/.test(nav))
}

/* ───────────────────────────────────────────────────────────────────────────
   GLASS: THE LENS UNDER A FINGER
   ─────────────────────────────────────────────────────────────────────────── */

console.log("\nGLASS: nothing between the finger and the frame")
{
  /*
    The move handler used to call getBoundingClientRect twice per pointer
    event (leftFor and slotAt), which is a forced layout on the main thread
    between the finger and the frame it is drawn in, and it rendered the bar
    once per slot the finger crossed, which changed nothing on the screen.
    Measured with a 110 step drag: 2.00 rects per event before, 0.01 after.
  */
  const move = lens.slice(lens.indexOf("const move = (clientX: number)"), lens.indexOf("const end = ()"))
  check("the move handler reads no layout at all", !/getBoundingClientRect/.test(move), move.match(/getBoundingClientRect/g))
  check("the bar's box is measured once, as the finger lands, and kept", /const boxRef = useRef</.test(lens) && /const readBox = \(\) => \{/.test(lens) && /readBox\(\)\n\s*activeRef\.current = true/.test(lens))
  check("and the three readers take it from there", (lens.match(/boxRef\.current \?\? readBox\(\)/g) ?? []).length === 3)
  check("a slot crossed under a drag renders nothing; the press still does", /if \(!movedRef\.current\) setAt\(next\)/.test(lens) && !/^\s*setAt\(next\)\s*$/m.test(lens))
  check("the position is still written once a frame, by the frame loop, straight to the element", /frameRef\.current = requestAnimationFrame\(step\)/.test(lens) && /dot\.style\.translate = `\$\{Math\.round\(posRef\.current \* 100\) \/ 100\}px 0`/.test(lens))
  /* Changed on purpose (round 29): the glass now comes and goes by opacity, so opacity joins what its layer is promoted for. */
  check("the glass still has its own compositor layer", /willChange: "opacity, translate, scale, transform"/.test(bar))
  check("reduced motion is still respected: no spring, no pulse", (lens.match(/prefers-reduced-motion: reduce/g) ?? []).length >= 2)
}

console.log("\nGLASS: a finger above or below the bar's row")
{
  /*
    Only the x is used and it is clamped into the bar, so a finger off the
    bar's row tracks exactly as one on it. What used to lose the gesture was
    the lift: 72px was a little over one bar, and a thumb dragging along the
    foot of a screen rolls further than that. Measured: the straying drag
    tracks to 0.04px at the mean.
  */
  check("the finger's y is read nowhere in the move handler", !/clientY/.test(lens.slice(lens.indexOf("const move = (clientX: number)"), lens.indexOf("const end = ()"))))
  check("the x is clamped into the bar", /const centre = Math\.max\(pad \+ dot \/ 2, Math\.min\(box\.width - pad - dot \/ 2, clientX - box\.left\)\)/.test(lens))
  check("and a wandering finger keeps the gesture for two bars' worth", /const ESCAPED = 120/.test(lens))
}

console.log("\nGLASS: a fuller drop, and a landing sampled for a faster screen")
{
  /* Changed on purpose (round 31): it eases towards 0.2 and never pins at a wall; an ordinary slide reaches about 0.11. */
  check("the stretch eases towards 0.2 and an ordinary slide reaches about what the old cap was", /const STRETCH_MAX = 0\.2/.test(lens) && /const STRETCH_AT = 0\.9/.test(lens))
  /* Changed on purpose (round 29): damping 8 to 13, one wobble after a stop instead of three; the stiffness, so the late lean, is kept. */
  /* Changed on purpose (round 31): 600 and 30 (0.61 of critical), following the glass's own spring speed; a stop leaves under 1% of squash. */
  check("the drop's own spring leans a frame or two late and relaxes back round", /const DROP_SPRING = \{ stiffness: 600, damping: 30 \}/.test(lens) && /const DROP_LEAD = 0\.26/.test(lens))
  check("it still never goes narrower than the squash it always had", /const SQUASH_MAX = 0\.03/.test(lens) && /drop\.d = Math\.max\(-SQUASH_MAX, Math\.min\(STRETCH_MAX, drop\.d \+ drop\.dv \* dt\)\)/.test(lens))
  check("the landing spring is sampled at 240Hz, with room for the longer list", /const dt = 1 \/ 240/.test(lens) && /for \(let i = 0; i < 480; i\+\+\)/.test(lens))
  check("and it still ends on the slot's exact centre", /const rest = `\$\{to\}px 0`/.test(lens) && /frames\.push\(\{ translate: rest, transform: "scale\(1, 1\)" \}\)/.test(lens))
}

console.log("\nGLASS: a touch larger, and still inside its slot")
{
  const src = readSource(BAR)
  const w = Number(/const LENS_W = (\d+)/.exec(src)?.[1])
  const h = Number(/const LENS_H = (\d+)/.exec(src)?.[1])
  check("the lens is larger than it was: 70 by 44", w === 70 && h === 44, { w, h })
  check("it is still shorter than the 56px row it sits in", h <= 50)
  /*
    A 390px phone: 6px of padding each side, four slots. The lens's own
    arithmetic, copied here rather than imported: components/nav/tab-lens.tsx
    reaches the Solar icon set through the sidebar, whose subpaths only a
    bundler resolves, so this suite reads the source and asserts the formula
    it copied is still the one in it.
  */
  check("the lens's place is still pad + index * slot, centred in the slot", /export const slotLeft = \(index: number, g: Geometry\): number =>\s*Math\.round\(\(g\.pad \+ index \* g\.slot \+ \(g\.slot - g\.dot\) \/ 2\) \* 100\) \/ 100/.test(lens))
  const pad = 6
  const slot = (390 - pad * 2) / 4
  const slotLeft = (index: number, g: { pad: number; slot: number; dot: number }) => Math.round((g.pad + index * g.slot + (g.slot - g.dot) / 2) * 100) / 100
  const g = { pad, slot, dot: w }
  const first = slotLeft(0, g)
  const last = slotLeft(3, g)
  check("it fits a quarter of a 390px phone with bar either side of it", w < slot - 16, { w, slot })
  check("and never hangs off either end", first >= pad && last + w <= 390 - pad, { first, last })
  check("the lift it carries is unchanged, so a tap is still the same press", /const LIFT = 1\.04/.test(lens))
}

/* ───────────────────────────────────────────────────────────────────────────
   DEPTH: ONE SOFT LIFT
   ─────────────────────────────────────────────────────────────────────────── */

console.log("\nDEPTH: less of the close shadow, more of the wide one")
{
  const shadow = /const BAR_SHADOW = "([^"]+)"/.exec(readSource(BAR))?.[1] ?? ""
  const layers = shadow.split(/,\s*(?=0 )/)
  const alpha = (s: string) => Number(/rgba\([^)]*?,\s*([\d.]+)\)/.exec(s)?.[1])
  const blur = (s: string) => Number(/^0 -[\d.]+px (\d+)px/.exec(s)?.[1] ?? 0)
  check("three layers: a hairline, a close shadow and a wide one", layers.length === 3, layers)
  check("the hairline is untouched at 0.09: that is the bar's edge, not its depth", alpha(layers[0]) === 0.09 && blur(layers[0]) === 0, layers[0])
  check("the close shadow is lighter and tighter than the 0.05 over 6px it was", alpha(layers[1]) < 0.05 && alpha(layers[1]) > 0.02 && blur(layers[1]) < 6, layers[1])
  check("the wide one reaches far further than the 24px it did", blur(layers[2]) >= 40, layers[2])
  check("and it is fainter for it, not stronger: the same ink over thirty pixels rather than six", alpha(layers[2]) < 0.1, layers[2])
  check("so the wide one carries the depth and the close one only the contact", alpha(layers[2]) * blur(layers[2]) > alpha(layers[1]) * blur(layers[1]) * 10, { close: alpha(layers[1]) * blur(layers[1]), wide: alpha(layers[2]) * blur(layers[2]) })
  check("and the whole of it is still subtle: no shadow over 0.09", [1, 2].every((i) => alpha(layers[i]) <= 0.09))
  /* Photographed at three times life size: scripts/check-bar-depth.mjs, and
     the table in components/nav/buyer-tab-bar.tsx. */
  check("the file says what the photograph measured", /was\s+14\s+11\s+8\s+6\s+3\s+0\s+0/.test(readSource(BAR)) && /now\s+11\s+9\s+7\s+7\s+5\s+3\s+2/.test(readSource(BAR)))
}

/* ───────────────────────────────────────────────────────────────────────────
   COPY
   ─────────────────────────────────────────────────────────────────────────── */

console.log("\nCOPY")
{
  /* Spelled in pieces, so this file does not carry the words it looks for. */
  const DASH = new RegExp("\\u2014")
  const BANNED = new RegExp(`\\b(${["un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less(ly)?", "super" + "charge", "trans" + "form"].join("|")})\\b`, "i")
  for (const f of [BAR, LENS, NAV, "lib/nav/community-context.ts", "lib/nav/places-shared.ts", "lib/nav/buyer-tabs.ts"]) {
    const src = readSource(f)
    check(`${f}: no em dash and none of the banned words`, !DASH.test(src) && !BANNED.test(src.replace(/backface-visibility|transform|Transform/g, "")), BANNED.exec(src.replace(/backface-visibility|transform|Transform/g, ""))?.[0])
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
