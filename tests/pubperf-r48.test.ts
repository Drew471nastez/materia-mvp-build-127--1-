/**
 * ===========================================================================
 *  ROUND 48: THE PUBLIC PAGES' SPEED (home, pricing, creator, product, explore)
 * ===========================================================================
 * Measured with scripts/check-live-vitals.mjs (390x844 @3x, CPU 4x, Fast 4G,
 * median of three) and Playwright CDP traces. What this suite pins:
 *
 *   1. THE HOME PAGE'S HEAD PRELOADS ONLY THE HERO. React puts a
 *      <link rel="preload" as="image"> in the head for every <img> that is not
 *      lazy and not fetchpriority="low"; the sections below the hero (bento,
 *      Manage, the split features, the plans) had ten of them, one at high
 *      priority, all competing with the hero slide that is the LCP. They are
 *      lazy now, and the detached Image() downloads of their ORIGINAL uploads
 *      (which nothing painted) are gone.
 *   2. THE COOKIE CARD IS IN THE SERVER'S HTML. Its paragraph is the LCP of
 *      /pricing, /explore/<category> and search on a phone, and it only
 *      appeared after hydration. It is drawn before the effect now, shown
 *      before React only where lib/consent/early-ask says the live banner
 *      would ask.
 *   3. THE PRODUCT PAGE'S BUY BOX DOES NOT GROW WHEN THE PURCHASE CHECK ENDS.
 *      The wishlist row is drawn while it runs, in the place (and the React
 *      instance) it keeps afterwards: no 60px shift, no second mount.
 *   4. A VISITOR'S CREATOR AND PRODUCT PAGES DO NOT CARRY OWNER OR EDITOR
 *      CODE: Arrange, the CTA pencil, the card owner menu, the product
 *      gallery (on the creator page), the refund sheet until a touch, the
 *      Supabase client in ViewerSync, and the app wide react-icons/si module.
 *   5. EXPLORE'S HEADLINE CHIP is as tall before its measurement as after.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup, renderToString } from "react-dom/server"
import { stripComments } from "./_source"
import { createRequire } from "node:module"
const require = createRequire(join(process.cwd(), "package.json"))

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")
const code = (p: string) => stripComments(read(p))

/* ── A static import graph (no `import type`, no import()), as tests/shell-weight-r46 reads one ── */
function resolveSpec(from: string, spec: string): string {
  let base: string
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2))
  else if (spec.startsWith(".")) base = join(dirname(from), spec)
  else return `pkg:${spec}`
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return `missing:${spec}`
}
function staticImports(file: string): string[] {
  const src = stripComments(readFileSync(file, "utf8"))
  const out: string[] = []
  const re = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^"';]*?)\s*from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (m[5]) {
      out.push(m[5])
      continue
    }
    if (m[2]) continue
    const named = m[3].trim().match(/^\{([\s\S]*)\}$/)
    if (named && named[1].split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "))) continue
    out.push(m[4])
  }
  return out
}
function graph(entries: string[]): Map<string, string | null> {
  const parent = new Map<string, string | null>()
  const queue: string[] = []
  for (const e of entries) {
    const f = join(ROOT, e)
    parent.set(f, null)
    queue.push(f)
  }
  while (queue.length) {
    const f = queue.shift() as string
    if (f.startsWith("pkg:") || f.startsWith("missing:") || !/\.(t|j|mj)sx?$/.test(f)) continue
    for (const spec of staticImports(f)) {
      const r = resolveSpec(f, spec)
      if (!parent.has(r)) {
        parent.set(r, f)
        queue.push(r)
      }
    }
  }
  return parent
}
function chain(g: Map<string, string | null>, f: string): string {
  const steps: string[] = []
  let at: string | null | undefined = f
  while (at) {
    steps.push(at.replace(`${ROOT}/`, ""))
    at = g.get(at)
  }
  return steps.reverse().join(" -> ")
}

async function main() {
  console.log("\n1. The home page's head preloads the hero and nothing below it")
  {
    const { ManageSection } = await import("@/components/marketing/manage-section")
    const { SplitFeaturesSection } = await import("@/components/marketing/split-features-section")
    const { PricingSection } = await import("@/components/marketing/pricing-section")
    /* A whole document, so React hoists the preloads it decides on into <head>, as on the page. */
    const doc = renderToString(
      createElement("html", null, createElement("head", null), createElement("body", null, createElement(ManageSection), createElement(SplitFeaturesSection), createElement(PricingSection))),
    )
    const preloads = doc.match(/<link rel="preload" as="image"[^>]*>/g) ?? []
    check("Manage, the split features and the plans put no image preload in the head", preloads.length === 0, preloads.map((p) => p.slice(0, 160)))
    const imgs = doc.match(/<img [^>]*>/g) ?? []
    check("  and every picture in them is lazy", imgs.length >= 8 && imgs.every((i) => /loading="lazy"/.test(i)), imgs.filter((i) => !/loading="lazy"/.test(i)).map((i) => i.slice(0, 160)))
    check("  none of them asks for high priority", !imgs.some((i) => /fetchpriority="high"/i.test(i)))

    const bento = code("components/marketing/bento-grid.tsx")
    check("the bento's Sell anything pictures are lazy (the computer one is display:none on a phone)", /SELL_ANYTHING_PHONE, 500, 75\)\}[\s\S]{0,200}loading="lazy"/.test(bento) && /SELL_ANYTHING_WIDE, 800, 75\)\}[\s\S]{0,200}loading="lazy"/.test(bento))
    for (const f of ["components/marketing/manage-section.tsx", "components/marketing/split-features-section.tsx"]) {
      check(`${f} downloads no detached copy of an original upload`, !/new window\.Image\(\)/.test(code(f)))
    }
    check("the plans' pictures stay eager on /pricing, where the cards are the page", /pictureLoading=\{headingLevel === 1 \? "eager" : "lazy"\}/.test(code("components/marketing/pricing-section.tsx")) && /pictureLoading = "eager"/.test(code("components/billing/plan-cards.tsx")))
    const slider = code("components/marketing/hero-carousel.tsx")
    check("the hero keeps one priority picture: its first slide", /priority=\{i === 0\}/.test(slider) && /loading=\{i === 0 \? undefined : "lazy"\}/.test(slider))
  }

  console.log("\n2. The cookie card is drawn by the server")
  {
    const { CookieConsentBanner } = await import("@/components/cookie-consent-banner")
    const html = renderToStaticMarkup(createElement(CookieConsentBanner))
    check("the server's HTML has the card, marked early", /data-cookie-banner=""/.test(html) && /data-cookie-banner-early=""/.test(html) && /Necessary cookies keep this site working/.test(html), html.slice(0, 300))
    check("  with both choices, equal, and the policy link", /Reject all/.test(html) && /Accept all/.test(html) && /href="\/privacy#cookies"/.test(html))
    check("  the policy link is not prefetched from the viewport (it fetched the whole privacy page on every first visit)", /<Link href="\/privacy#cookies" prefetch=\{false\}/.test(code("components/cookie-consent-banner.tsx")))
    check("  and no Analytics before a yes", !/vercel/i.test(html))
    const css = read("app/globals.css")
    check("the early card is hidden unless the head script asked for it", /html:not\(\[data-cookie-ask\]\) \[data-cookie-banner-early\] \{\s*display: none !important;/.test(css))
    const banner = code("components/cookie-consent-banner.tsx")
    check("  once the effect has run it is the live banner, decided as before", /const showCard = early \? !quietPath : bannerOpen && !quiet && !prefsOpen/.test(banner) && /if \(ready && isNativeApp\(\)\) return null/.test(banner))
    check("the root layout runs the script in <head>", /<script dangerouslySetInnerHTML=\{\{ __html: COOKIE_ASK_BOOT \}\} \/>/.test(read("app/layout.tsx")))

    const { cookieAskBoot } = await import("@/lib/consent/early-ask")
    const { CONSENT_VERSION } = await import("@/lib/consent/consent")
    const asks = (o: { cookie?: string; host?: string; ua?: string; framed?: boolean; capacitor?: boolean }) => {
      const attrs = new Set<string>()
      const win: Record<string, unknown> = {}
      win.self = win
      win.top = o.framed ? {} : win
      if (o.capacitor) win.Capacitor = { isNativePlatform: () => true }
      const doc = { cookie: o.cookie ?? "", documentElement: { setAttribute: (k: string) => attrs.add(k) } }
      new Function("window", "document", "location", "navigator", cookieAskBoot("storelib.com"))(win, doc, { hostname: o.host ?? "storelib.com" }, { userAgent: o.ua ?? "Mozilla/5.0 (iPhone)" })
      return attrs.has("data-cookie-ask")
    }
    const valid = `storelib_consent=${CONSENT_VERSION}.p0.a1.m0.1793500000`
    check("no consent cookie: asks", asks({}))
    check("a valid record: does not ask", !asks({ cookie: `a=1; ${valid}; b=2` }))
    check("a record of an older version: asks, as the live banner does", asks({ cookie: `storelib_consent=1.p0.a1.m0.1793500000` }))
    check("a broken record: asks", asks({ cookie: "storelib_consent=yes" }))
    check("www.storelib.com and localhost: asks", asks({ host: "www.storelib.com" }) && asks({ host: "localhost" }))
    check("a creator's site (its own colours): does not ask early", !asks({ host: "andrewrullz.storelib.com" }) && !asks({ host: "shop.example.com" }) && !asks({ host: "storelib.me" }))
    check("in a frame: does not ask", !asks({ framed: true }))
    check("the native app: does not ask", !asks({ capacitor: true }) && !asks({ ua: "Mozilla/5.0 StorelibApp" }) && !asks({ ua: "Mozilla/5.0 (Linux; Android 14; wv)" }))
    const { parse } = await import("@/lib/consent/consent")
    check("the record it trusts is the one parse() reads", parse(valid.split("=")[1], 1793500000 * 1000) !== null)
  }

  console.log("\n3. The product page's buy box is its final height while the purchase check runs")
  {
    const { PurchaseStatusWrapper } = await import("@/components/checkout/purchase-status-wrapper")
    const html = renderToStaticMarkup(
      createElement(PurchaseStatusWrapper, {
        productId: "p1",
        priceCents: 1200,
        notPurchasedExtraContent: createElement("div", { "data-wishlist-row": "" }, "Add to wishlist"),
        purchasedExtraContent: createElement("div", { "data-library-row": "" }, "View in library"),
      }),
    )
    check("the server draws Loading in the Buy button's place", /Loading\.\.\./.test(html) && /min-h-\[48px\]/.test(html), html.slice(0, 300))
    check("  with the wishlist row already under it", /data-wishlist-row/.test(html) && html.indexOf("Loading...") < html.indexOf("data-wishlist-row"))
    check("  and not the owner's row", !/data-library-row/.test(html))
    const src = code("components/checkout/purchase-status-wrapper.tsx")
    check("one render path: no early return for the check, so the row keeps its instance", !/if \(isChecking\) \{\s*return/.test(src) && /\{checking \? \(\s*<Button/.test(src))
  }

  console.log("\n4. A visitor's creator and product pages carry no owner or editor code")
  {
    const g = graph(["components/store-builder/section-renderer.tsx", "components/storefront/all-products-grid.tsx", "components/store-builder/live-subscribe-bar.tsx", "components/storefront/storefront-product-card.tsx", "components/product/refund-policy-display.tsx", "components/auth/viewer-sync.tsx", "components/product/share-button.tsx"])
    const banned: [string, RegExp][] = [
      ["the editor sheet", /\/components\/storefront\/editor-sheet\.tsx$/],
      ["the Arrange control", /\/components\/storefront\/arrange-products-button\.tsx$/],
      ["the CTA pencil", /\/components\/storefront\/edit-cta-button\.tsx$/],
      ["the card owner menu", /\/components\/storefront\/product-owner-menu\.tsx$/],
      ["the bottom sheet", /\/components\/ui\/bottom-sheet\.tsx$/],
      ["the website builder's live settings", /\/lib\/website-builder\/live-settings\.ts$/],
      ["the product gallery and Swiper", /\/components\/product\/product-gallery\.tsx$|^pkg:swiper/],
      ["the app wide react-icons/si module", /^pkg:react-icons\/si$/],
      ["the Supabase client", /\/lib\/supabase\/client\.ts$|^pkg:@supabase\/supabase-js$/],
    ]
    for (const [what, re] of banned) {
      const hit = [...g.keys()].find((f) => re.test(f))
      check(`not in their first script: ${what}`, !hit, hit ? chain(g, hit) : undefined)
    }
    check("the owner pieces are still drawn for the owner, and only then", /\{viewerIsOwner \? <ArrangeProductsControl/.test(code("components/store-builder/unified-section-renderer.tsx")) && /\{isOwner \? <ArrangeProductsControl/.test(code("components/storefront/all-products-grid.tsx")) && /if \(!isOwner\) return card/.test(code("components/storefront/storefront-product-card.tsx")))
    check("the refund sheet mounts from the first touch on the line", /onPointerDown=\{phone \? \(\) => setArmed\(true\) : undefined\}/.test(code("components/product/refund-policy-display.tsx")) && /\{\(armed \|\| open\) && <BottomSheet/.test(code("components/product/refund-policy-display.tsx")))

    /* The seven marks are Simple Icons' own, byte for byte, not anyone's drawing. */
    const marks = await import("@/components/social/simple-icon-marks")
    const si = (await import("react-icons/si")) as unknown as Record<string, (p: object) => unknown>
    const { GenIcon } = await import("react-icons")
    const names = Object.keys(marks).filter((k) => k.startsWith("Si"))
    check("seven marks", names.length === 7, names)
    for (const n of names) {
      const ours = renderToStaticMarkup(createElement(GenIcon((marks as Record<string, Parameters<typeof GenIcon>[0]>)[n]), { size: 24 }))
      const theirs = renderToStaticMarkup(createElement(si[n] as never, { size: 24 }))
      check(`  ${n} is the package's own`, ours === theirs, { ours: ours.slice(0, 120), theirs: theirs.slice(0, 120) })
    }
  }

  console.log("\n4b. A community's public page fetches the join checkout after load, not in its first script")
  {
    const g = graph(["components/community/public/sales-page.tsx"])
    for (const [what, re] of [["the join flow", /\/components\/community\/public\/join-flow\.tsx$/], ["the checkout's words in every language", /\/lib\/checkout-text\/words\.ts$/], ["the checkout window", /\/components\/checkout\/checkout-window\.tsx$/]] as [string, RegExp][]) {
      const hit = [...g.keys()].find((f) => re.test(f))
      check(`not in the sales page's first script: ${what}`, !hit, hit ? chain(g, hit) : undefined)
    }
    const jc = code("components/community/public/join-controls.tsx")
    check("  warmed when the page is idle, so a press finds it", /const loadJoinFlow = \(\) => import\("\.\/join-flow"\)/.test(jc) && /requestIdleCallback\(warm, \{ timeout: 4000 \}\)/.test(jc))
  }

  console.log("\n6. The two ::selection rules every element paid for")
  {
    /* Chromium's selector stats on storelib.com/ (CPU 4x): these two were the costliest of the page's 1,141 rules, because a
       ::selection rule is tried on every element and an ancestor inside :is() cannot be ruled out from the ancestor filter. */
    const dark = read("app/theme-dark.css")
    check("the dark look's selection rule names its two roots plainly", /html\[data-sl-dark\] :not\(\[data-own-look\], \[data-own-look\] \*\)::selection,\s*\[data-community-theme="dark"\] :not\(\[data-own-look\], \[data-own-look\] \*\)::selection \{\s*background-color: rgba\(255,255,255,0\.16\);/.test(dark))
    check("  and the :is() form of it is gone", !/:is\(html\[data-sl-dark\], \[data-community-theme="dark"\]\) :not\(\[data-own-look\], \[data-own-look\] \*\)::selection/.test(dark))
    check("  written by the generator, so a rebuild keeps it", /html\[data-sl-dark\] \$\{OWN\}::selection,/.test(read("scripts/gen-theme-dark.mjs")))
    const light = read("app/website-settings-light.css")
    check("Website Settings' light selection is [data-ws-look=\"light\"] ::selection", /^\[data-ws-look="light"\] ::selection \{ background-color: rgba\(139,92,246,0\.18\); \}$/m.test(light) && !/:is\(\[data-ws-look="light"\], \[data-ws-look="light"\] \*\) ::selection/.test(light))
  }

  console.log("\n5. Explore's headline chip")
  {
    const hero = code("components/explore/explore-hero.tsx")
    check("its vertical padding is CHIP_PAD_Y before the measurement exists", /const CHIP_PAD_Y = 8/.test(hero) && /rounded-xl bg-violet-50 py-2 pl-2\.5/.test(hero) && /height: box \? box\.height \+ CHIP_PAD_Y \* 2 : undefined/.test(hero))
  }

  console.log("\n7. A creator page and a product page: the CDN holds a stranger's copy, never somebody's")
  {
    const SUPA = "https://abcdefghijkl.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA
    const { pathToFileURL } = await import("node:url")
    const config = await import(`${pathToFileURL(join(ROOT, "next.config.mjs")).href}?pubperf=${Date.now()}`)
    const rules = (await config.default.headers()) as { source: string; has?: object[]; missing?: object[]; headers: { key: string; value: string }[] }[]
    const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match") as { getPathMatch: (p: string, o?: object) => (path: string) => unknown }
    const { matchHas } = require("next/dist/shared/lib/router/utils/prepare-destination") as { matchHas: (req: object, query: object, has?: object[], missing?: object[]) => unknown }
    /* What Next answers with, rule by rule as it applies them: every matching rule's headers, a later one over an earlier. */
    const answer = (path: string, o: { host?: string; cookies?: Record<string, string>; referer?: string } = {}) => {
      const cookie = Object.entries(o.cookies ?? {}).map(([k, v]) => `${k}=${v}`).join("; ")
      const req = { headers: { host: o.host ?? "storelib.com", ...(cookie ? { cookie } : {}), ...(o.referer ? { referer: o.referer } : {}) } }
      const out: Record<string, string> = {}
      for (const r of rules) {
        if (!getPathMatch(r.source)(path)) continue
        if (!matchHas(req, {}, r.has as object[], r.missing as object[])) continue
        for (const h of r.headers) out[h.key.toLowerCase()] = h.value
      }
      return out
    }
    const SHARED = "public, s-maxage=60, stale-while-revalidate=300"
    const session = "sb-abcdefghijkl-auth-token"
    check("a stranger's /<handle>: held a minute, served stale five", answer("/andrewrullz")["cache-control"] === SHARED, answer("/andrewrullz"))
    check("  and their /<handle>/<product>", answer("/andrewrullz/tech-house-master-bundle-2026")["cache-control"] === SHARED)
    check("  a cookie that says nothing about them (the consent record) changes nothing", answer("/andrewrullz", { cookies: { storelib_consent: "2.p0.a0.m0.1793500000" } })["cache-control"] === SHARED)
    check("  nor a Referer from another site (a link in a bio)", answer("/andrewrullz", { referer: "https://l.instagram.com/?u=x" })["cache-control"] === SHARED)
    for (const c of [session, `${session}.0`, "sl_owned", "sl_owned_hint", "sl_lang", "sl_country", "sl_team_store"]) {
      check(`somebody's (${c}): private, no-store, on both pages`, answer("/andrewrullz", { cookies: { [c]: "x" } })["cache-control"] === "private, no-store" && answer("/andrewrullz/p", { cookies: { [c]: "x" } })["cache-control"] === "private, no-store")
    }
    check("arrived from a page of Storelib's (the way back, the community bar read it): private", answer("/andrewrullz", { referer: "https://storelib.com/community/x" })["cache-control"] === "private, no-store" && answer("/andrewrullz", { referer: "https://www.storelib.com/" })["cache-control"] === "private, no-store")
    for (const path of ["/pricing", "/app", "/explore", "/u/andrewrullz", "/p/x", "/robots.txt", "/andrewrullz/links", "/community/x", "/a/b/c", "/App"]) {
      /* Explore has a shared rule of its own (no Vary); none of these takes this one. */
      check(`  not a creator page, no shared rule: ${path}`, path === "/explore" || answer(path)["cache-control"] !== SHARED, answer(path))
    }
    check("only on storelib.com: not a creator's subdomain, own domain, or a host that merely contains a name", answer("/x", { host: "andrewrullz.storelib.com" })["cache-control"] !== SHARED && answer("/x", { host: "shop.example.com" })["cache-control"] !== SHARED && answer("/x", { host: "evil-localhost.example" })["cache-control"] !== SHARED && answer("/x", { host: "www.storelib.com" })["cache-control"] === SHARED)

    const shared = await import("@/lib/storefront/shared-view")
    check("next.config.mjs and the proxy name the same cookies", JSON.stringify(config.CREATOR_PAGE_PERSONAL_COOKIES) === JSON.stringify([...shared.sessionCookieNames(SUPA), ...shared.PERSONAL_PAGE_COOKIES]), config.CREATOR_PAGE_PERSONAL_COOKIES)
    /* The proxy's answer and the CDN rules agree on every request, so a personal address only ever holds private answers. */
    const cases: { cookies?: Record<string, string>; referer?: string }[] = [{}, { cookies: { storelib_consent: "1" } }, { referer: "https://storelib.com/explore" }, { referer: "http://localhost:3000/x" }, { referer: "https://x.com/" }, { cookies: { sl_lang: "" } }, ...config.CREATOR_PAGE_PERSONAL_COOKIES.map((c: string) => ({ cookies: { [c]: "v" } }))]
    const disagree = cases.filter((c) => {
      const personal = shared.isPersonalRequest(Object.entries(c.cookies ?? {}).filter(([, v]) => !!v).map(([k]) => k), c.referer, SUPA)
      return personal !== (answer("/andrewrullz", c)["cache-control"] === "private, no-store")
    })
    check("  and decide every request the same way", disagree.length === 0, disagree)
    const paths = ["/andrewrullz", "/andrewrullz/p", "/andrewrullz/links", "/pricing", "/app", "/a.png", "/a/b/c", "/u/x", "/p/x", "/community/x", "/sitemap.xml", "/appx", "/pricing2/x"]
    const pathDisagree = paths.filter((p) => shared.isCreatorPagePath(p) !== (answer(p)["cache-control"] === SHARED))
    check("  on the same addresses", pathDisagree.length === 0, pathDisagree)

    const proxy = code("proxy.ts")
    check("the proxy sends somebody's request to an address of its own, private, and takes it off anybody else's", /if \(personal\) to\.searchParams\.set\(PERSONAL_VIEW_PARAM, "1"\)\s*else to\.searchParams\.delete\(PERSONAL_VIEW_PARAM\)/.test(proxy) && /if \(personal\) r\.headers\.set\("Cache-Control", "private, no-store"\)/.test(proxy) && /supabaseResponse = respond\(\)/.test(proxy))
    check("  and a store that shows visitors their own language is never shared (its page follows the browser's Accept-Language, which Next's own Vary replaces)", /\(loc\) => !!loc\.visitorLanguage && loc\.languages\.length > 0/.test(proxy) && /byCookieOrReferer \|\|/.test(proxy))
    check("  only on storelib.com, for a page", /!username && !isCustomDomain && !communityPath && \(request\.method === "GET" \|\| request\.method === "HEAD"\) && STORELIB_HOST\.test\(host\.split\(":"\)\[0\]\) && isCreatorPagePath\(pathname\)/.test(proxy))
    for (const f of ["app/(marketing)/u/[username]/page.tsx", "app/(marketing)/p/[slug]/page.tsx"]) {
      check(`  ${f} reads only the parameters it knows, so the personal address draws the same page`, !/_pv|PERSONAL_VIEW_PARAM/.test(code(f)))
    }
  }

  console.log("\n8. A save takes the CDN's copy down")
  {
    const purge = code("lib/storefront/creator-page-purge.ts")
    check("one helper: the creator page and every address under it, by path (revalidatePath deletes the CDN copy on Vercel)", /revalidatePath\(`\/\$\{h\}`, "layout"\)/.test(purge) && /catch \{/.test(purge))
    check("  a product save (/api/revalidate), by the store's own name from the database", /await creatorPagesChanged\(\{ creatorId: owned\.creator_id \}\)/.test(code("app/api/revalidate/route.ts")))
    check("  a creator page publish (/api/store-builder)", /await creatorPagesChanged\(\{ creatorId: creator\.id \}\)/.test(code("app/api/store-builder/route.ts")))
    check("  a cover", /await creatorPagesChanged\(\{ userId: user\.id \}\)/.test(code("app/api/profile/cover/route.ts")))
    const { identityChanged } = await import("@/lib/account/identity-caches")
    const pages: string[] = []
    await identityChanged({ userId: "u1", creatorId: "c1" }, { expireTag: () => {}, expireSite: async () => {}, expireCreatorPages: async (u) => { pages.push(u) } })
    check("  a new name, photo or bio (identityChanged: Settings, the photo, the creator page's own fields)", pages.join() === "u1" && /expireCreatorPages: \(userId\) => creatorPagesChanged\(\{ userId \}\)/.test(code("lib/account/identity-caches.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
